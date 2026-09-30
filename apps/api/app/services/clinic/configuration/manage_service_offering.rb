module Clinic
  module Configuration
    class ManageServiceOffering
      CREATE_OPERATION = "clinic.service_offering.create"
      UPDATE_OPERATION = "clinic.service_offering.update"
      PUBLISH_OPERATION = "clinic.service_offering.publish"
      RETIRE_OPERATION = "clinic.service_offering.retire"

      Result = Data.define(:offering, :replayed)

      def self.create(practice:, actor:, request_key:, attributes:)
        authorize!(practice: practice, actor: actor)
        normalized = normalize(attributes, creating: true)
        execute(practice: practice, actor: actor, request_key: request_key, operation: CREATE_OPERATION, payload: normalized) do
          offering = practice.service_offerings.create!(normalized.except(:site_ids, :clinician_ids))
          replace_sites!(offering: offering, site_ids: normalized.fetch(:site_ids))
          replace_clinicians!(offering: offering, clinician_ids: normalized.fetch(:clinician_ids))
          audit!(practice: practice, actor: actor, offering: offering, action: CREATE_OPERATION)
          offering
        end
      end

      def self.update(practice:, actor:, offering:, request_key:, lock_version:, attributes:)
        authorize!(practice: practice, actor: actor)
        normalized = normalize(attributes, creating: false)
        expected_lock_version = Integer(lock_version.to_s, 10)
        raise ArgumentError, "lock_version must be zero or greater." if expected_lock_version.negative?
        execute(practice: practice, actor: actor, request_key: request_key, operation: UPDATE_OPERATION,
          payload: { service_offering_id: offering.id, lock_version: expected_lock_version, attributes: normalized }) do
          locked = practice.service_offerings.lock.find(offering.id)
          raise ActiveRecord::StaleObjectError.new(locked, "update") unless locked.lock_version == expected_lock_version
          raise ArgumentError, "Retired service offerings cannot be edited." if locked.status == "retired"

          fields = normalized.except(:site_ids, :clinician_ids)
          locked.update!(fields) unless fields.empty?
          replace_sites!(offering: locked, site_ids: normalized[:site_ids]) if normalized.key?(:site_ids)
          replace_clinicians!(offering: locked, clinician_ids: normalized[:clinician_ids]) if normalized.key?(:clinician_ids)
          locked.touch if fields.empty? && (normalized.key?(:site_ids) || normalized.key?(:clinician_ids))
          audit!(practice: practice, actor: actor, offering: locked, action: UPDATE_OPERATION)
          locked
        end
      rescue ArgumentError => error
        raise error unless error.message.match?(/invalid value for Integer/)

        raise ArgumentError, "lock_version must be a whole number."
      end

      def self.publish(practice:, actor:, offering:, request_key:, lock_version:)
        authorize!(practice: practice, actor: actor)
        expected_lock_version = Integer(lock_version.to_s, 10)
        execute(practice: practice, actor: actor, request_key: request_key, operation: PUBLISH_OPERATION,
          payload: { service_offering_id: offering.id, lock_version: expected_lock_version }) do
          locked = practice.service_offerings.lock.find(offering.id)
          raise ActiveRecord::StaleObjectError.new(locked, "publish") unless locked.lock_version == expected_lock_version
          raise ArgumentError, "Only draft service offerings can be published." unless locked.status == "draft"

          locked.update!(status: "published", published_at: Time.current, retired_at: nil)
          audit!(practice: practice, actor: actor, offering: locked, action: PUBLISH_OPERATION)
          locked
        end
      rescue ArgumentError => error
        raise error unless error.message.match?(/invalid value for Integer/)

        raise ArgumentError, "lock_version must be a whole number."
      end

      def self.retire(practice:, actor:, offering:, request_key:, lock_version:)
        authorize!(practice: practice, actor: actor)
        expected_lock_version = Integer(lock_version.to_s, 10)
        execute(practice: practice, actor: actor, request_key: request_key, operation: RETIRE_OPERATION,
          payload: { service_offering_id: offering.id, lock_version: expected_lock_version }) do
          locked = practice.service_offerings.lock.find(offering.id)
          raise ActiveRecord::StaleObjectError.new(locked, "retire") unless locked.lock_version == expected_lock_version
          raise ArgumentError, "Only published service offerings can be retired." unless locked.status == "published"

          locked.update!(status: "retired", retired_at: Time.current)
          audit!(practice: practice, actor: actor, offering: locked, action: RETIRE_OPERATION)
          locked
        end
      rescue ArgumentError => error
        raise error unless error.message.match?(/invalid value for Integer/)

        raise ArgumentError, "lock_version must be a whole number."
      end

      def self.execute(practice:, actor:, request_key:, operation:, payload:, &block)
        outcome = Clinic::Idempotency.execute(
          practice: practice, actor: actor, operation_code: operation, request_key: request_key, payload: payload,
          authorization: -> { authorize!(practice: practice, actor: actor) }, authorization_action: "facilities.write",
          result_resource: ->(offering) { offering },
          resource_resolver: ->(practice:, receipt:) { practice.service_offerings.find_by(id: receipt.resource_id) },
          &block
        )
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        Result.new(offering: outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed service offering is unavailable."), replayed: outcome.replayed)
      end
      private_class_method :execute

      def self.normalize(attributes, creating:)
        values = {}
        values[:name] = required_text(attributes[:name], field: "name", maximum: 160) if creating || attributes.key?(:name)
        values[:code] = optional_text(attributes[:code], field: "code", maximum: 50) if attributes.key?(:code)
        values[:description] = optional_text(attributes[:description], field: "description", maximum: 500) if attributes.key?(:description)
        %i[contact_instructions referral_instructions].each do |field|
          values[field] = optional_text(attributes[field], field: field.to_s, maximum: 500) if attributes.key?(field)
        end
        values[:visit_type_id] = optional_id(attributes[:visit_type_id], field: "visit_type_id") if attributes.key?(:visit_type_id)
        values[:billing_service_id] = optional_id(attributes[:billing_service_id], field: "billing_service_id") if attributes.key?(:billing_service_id)
        values[:duration_minutes] = optional_duration(attributes[:duration_minutes]) if attributes.key?(:duration_minutes)
        values[:modality] = enum(attributes[:modality], field: "modality", allowed: %w[in_person video either]) if attributes.key?(:modality)
        values[:booking_required] = boolean(attributes[:booking_required], field: "booking_required") if attributes.key?(:booking_required)
        values[:requires_room] = boolean(attributes[:requires_room], field: "requires_room") if attributes.key?(:requires_room)
        values[:public_visible] = boolean(attributes[:public_visible], field: "public_visible") if attributes.key?(:public_visible)
        if attributes.key?(:status) && (!creating || attributes[:status] != "draft")
          raise ArgumentError, "Use the publish or retire action to change service offering status."
        end
        values[:site_ids] = normalized_ids(attributes[:site_ids], field: "site_ids") if attributes.key?(:site_ids)
        values[:clinician_ids] = normalized_ids(attributes[:clinician_ids], field: "clinician_ids") if attributes.key?(:clinician_ids)
        values[:modality] ||= "in_person" if creating
        values[:booking_required] = true if creating && !values.key?(:booking_required)
        values[:requires_room] = false if creating && !values.key?(:requires_room)
        values[:status] ||= "draft" if creating
        values[:site_ids] ||= [] if creating
        values[:clinician_ids] ||= [] if creating
        values
      end
      private_class_method :normalize

      def self.replace_sites!(offering:, site_ids:)
        site_ids = Array(site_ids).map(&:to_i).uniq.sort
        sites = offering.practice.sites.where(id: site_ids).index_by(&:id)
        raise ActiveRecord::RecordNotFound, "One or more eligible sites are unavailable." unless sites.length == site_ids.length

        current_site_ids = offering.offering_sites.pluck(:site_id)
        offering.offering_sites.where(site_id: current_site_ids - site_ids).delete_all
        (site_ids - current_site_ids).each do |site_id|
          offering.offering_sites.create!(practice: offering.practice, site: sites.fetch(site_id))
        end
        offering.reload
        raise ActiveRecord::RecordInvalid, offering if offering.published? && !offering.valid?
      end
      private_class_method :replace_sites!

      def self.replace_clinicians!(offering:, clinician_ids:)
        clinician_ids = Array(clinician_ids).map(&:to_i).uniq.sort
        clinicians = offering.practice.clinician_profiles.where(id: clinician_ids).index_by(&:id)
        raise ActiveRecord::RecordNotFound, "One or more eligible clinicians are unavailable." unless clinicians.length == clinician_ids.length

        current_ids = offering.offering_clinicians.pluck(:clinician_id)
        offering.offering_clinicians.where(clinician_id: current_ids - clinician_ids).delete_all
        (clinician_ids - current_ids).each do |clinician_id|
          offering.offering_clinicians.create!(practice: offering.practice, clinician: clinicians.fetch(clinician_id))
        end
        offering.reload
      end
      private_class_method :replace_clinicians!

      def self.authorize!(practice:, actor:)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "facilities.write", legacy_action: "appointments.write")
      end
      private_class_method :authorize!

      def self.audit!(practice:, actor:, offering:, action:)
        AuditRecorder.record!(practice: practice, actor: actor, action_code: action,
          resource_version_ref: "clinic_service_offering:#{offering.id}:#{offering.lock_version}", outcome: :released)
      end
      private_class_method :audit!

      def self.required_text(value, field:, maximum:)
        text = optional_text(value, field: field, maximum: maximum)
        raise ArgumentError, "#{field} is required." unless text

        text
      end
      private_class_method :required_text

      def self.optional_text(value, field:, maximum:)
        return nil if value.nil?

        text = value.to_s.strip.presence
        raise ArgumentError, "#{field} must be at most #{maximum} characters." if text && text.length > maximum

        text
      end
      private_class_method :optional_text

      def self.optional_id(value, field:)
        return nil if value.nil? || value == ""

        id = Integer(value.to_s, 10)
        raise ArgumentError, "#{field} must be positive." unless id.positive?

        id
      rescue ArgumentError
        raise ArgumentError, "#{field} must be a whole number."
      end
      private_class_method :optional_id

      def self.optional_duration(value)
        return nil if value.nil? || value == ""

        duration = Integer(value.to_s, 10)
        raise ArgumentError, "duration_minutes must be between 5 and 1440." unless duration.between?(5, 1440)

        duration
      rescue ArgumentError
        raise ArgumentError, "duration_minutes must be a whole number."
      end
      private_class_method :optional_duration

      def self.normalized_ids(value, field:)
        raise ArgumentError, "#{field} must be a list." unless value.is_a?(Array)

        value.map { |id| optional_id(id, field: field) }.compact.uniq.sort
      end
      private_class_method :normalized_ids

      def self.enum(value, field:, allowed:)
        normalized = value.to_s
        raise ArgumentError, "#{field} is invalid." unless allowed.include?(normalized)

        normalized
      end
      private_class_method :enum

      def self.boolean(value, field:)
        return value if [ true, false ].include?(value)

        raise ArgumentError, "#{field} must be true or false."
      end
      private_class_method :boolean
    end
  end
end
