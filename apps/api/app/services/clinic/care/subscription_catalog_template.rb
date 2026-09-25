module Clinic
  module Care
    class SubscriptionCatalogTemplate
      TEMPLATES = {
        "weight_loss" => {
          family: {
            name: "Weight management",
            description: "A clinic-defined program for ongoing weight-management visits and support. Set the services, cadence, pricing, and terms that fit your clinic."
          },
          services: [
            { name: "Weight-management initial visit", description: "Initial visit service for a clinic-defined weight-management program." },
            { name: "Weight-management follow-up", description: "Follow-up visit service for a clinic-defined weight-management program." }
          ]
        }
      }.freeze

      def self.apply(practice:, actor:)
        Clinic::Authorization.authorize!(practice: practice, actor: actor, action: "subscription_catalog.write")
        ApplicationRecord.transaction do
          practice.with_lock do
            clinic_type = Clinic::Configuration::PracticeFeatures.snapshot(practice: practice).fetch(:clinic_type)
            template = TEMPLATES[clinic_type]
            raise ArgumentError, "No membership starter is available for the selected clinic type." unless template

            created = []
            family = SubscriptionFamily.where(practice: practice, name: template.fetch(:family).fetch(:name)).first
            raise ArgumentError, "The matching membership program is retired." if family&.retired?
            unless family
              family = SubscriptionCatalog.save(practice: practice, actor: actor, kind: "family", attributes: template.fetch(:family).stringify_keys)
              created << "program"
            end

            services = template.fetch(:services).map do |attributes|
              service = ServiceOption.where(practice: practice, name: attributes.fetch(:name)).first
              raise ArgumentError, "A matching membership service is retired." if service&.retired?
              unless service
                service = SubscriptionCatalog.save(practice: practice, actor: actor, kind: "service", attributes: attributes.stringify_keys)
                created << "service"
              end
              service
            end

            Clinic::AuditRecorder.record!(practice: practice, actor: actor, action_code: "subscription_catalog.template.apply",
              outcome: :committed, resource_version_ref: "family:#{family.id}")
            { clinic_type: clinic_type, program_id: family.id, service_ids: services.map(&:id), created_count: created.length }
          end
        end
      end
    end
  end
end
