module Clinic
  module Care
    class SubscriptionCatalog
      def self.save(practice:, actor:, kind:, attributes:, id: nil)
        Clinic::Authorization.authorize!(practice: practice, actor: actor, action: "subscription_catalog.write")
        model = { "family" => SubscriptionFamily, "service" => ServiceOption, "package" => SubscriptionPackage }.fetch(kind) { raise ArgumentError, "Unknown catalog item." }
        ApplicationRecord.transaction do
          record = id ? model.where(practice: practice).lock.find(id) : model.new(practice: practice)
          allowed = kind == "package" ? %w[name family_id draft lock_version] : %w[name description]
          if record.persisted? && kind == "package" && attributes["lock_version"].to_s != record.lock_version.to_s
            raise ActiveRecord::StaleObjectError.new(record, "update")
          end
          record.assign_attributes(attributes.slice(*allowed))
          raise ArgumentError, "The product family is retired." if kind == "package" && SubscriptionFamily.where(practice: practice, retired: false).find(record.family_id).nil?
          record.save!
          Clinic::AuditRecorder.record!(practice: practice, actor: actor, action_code: "subscription_catalog.save", outcome: :committed, resource_version_ref: "#{kind}:#{record.id}")
          record
        end
      end

      def self.publish(practice:, actor:, id:, request_key:, lock_version:)
        Clinic::Authorization.authorize!(practice: practice, actor: actor, action: "subscription_catalog.publish")
        key = SubscriptionDefinition.request_key(request_key)
        ApplicationRecord.transaction do
          practice.lock!
          package = SubscriptionPackage.where(practice: practice).lock.find(id)
          digest = SubscriptionDefinition.fingerprint({ "id" => package.id, "lock_version" => lock_version.to_s })
          existing = SubscriptionVersion.where(practice: practice).find_by(request_key: key)
          if existing
            raise ArgumentError, "Request key was used for different publication details." unless existing.request_digest == digest
            next existing
          end
          raise ActiveRecord::StaleObjectError.new(package, "publish") unless package.lock_version.to_s == lock_version.to_s
          raise ArgumentError, "Retired packages or families cannot be published." if package.retired || package.family.retired
          version = SubscriptionVersion.create!(practice: practice, package: package,
            number: (package.published_versions.maximum(:number) || 0) + 1,
            snapshot: SubscriptionDefinition.build(package), request_key: key, request_digest: digest)
          package.update!(published_version: version)
          Clinic::AuditRecorder.record!(practice: practice, actor: actor, action_code: "subscription_catalog.publish", outcome: :committed, resource_version_ref: "subscription_version:#{version.id}")
          version
        end
      end

      def self.retire(practice:, actor:, kind:, id:, reason:)
        Clinic::Authorization.authorize!(practice: practice, actor: actor, action: "subscription_catalog.publish")
        SubscriptionDefinition.text(reason, 1000, required: true)
        model = { "family" => SubscriptionFamily, "service" => ServiceOption, "package" => SubscriptionPackage }.fetch(kind) { raise ArgumentError, "Unknown catalog item." }
        ApplicationRecord.transaction do
          record = model.where(practice: practice).lock.find(id)
          record.update!(retired: true) unless record.retired
          Clinic::AuditRecorder.record!(practice: practice, actor: actor, action_code: "subscription_catalog.retire", outcome: :committed, resource_version_ref: "#{kind}:#{record.id}")
          record
        end
      end
    end
  end
end
