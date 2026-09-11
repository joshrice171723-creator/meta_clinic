module Clinic
  module Scheduling
    class CapacityController < Clinic::ApiController
      def index
        require_capability("appointments.read", any_site: true)
        site_ids = current_practice.sites.select { |site| current_ability.allowed_permission?("appointments.read", site: site) }.map(&:id)
        rules = CapacityRule.where(practice: current_practice, site_id: site_ids, active: true).order(:site_id, :clinician_id, :id).limit(200)
        render json: { rules: rules.map { |rule| serialize(rule) }, timezone: current_practice.timezone }
      end

      def create
        input = parameter_hash!(:capacity, %i[request_key site_id clinician_id kind weekday start_minute end_minute starts_at ends_at reason])
        site = current_practice.sites.find(requested_id!(input[:site_id], :site_id))
        authorize = -> {
          require_capability("facilities.write", site: site)
          if input[:kind] == "block" && !current_ability.practice_scope_for?("facilities.write")
            raise Clinic::Authorization::Denied
          end
        }
        authorize.call
        clinician = current_practice.clinician_profiles.find(requested_id!(input[:clinician_id], :clinician_id))
        kind = enum_param!(input[:kind], field: :kind, allowed: %w[weekly block])
        values = { kind: kind, site: site, clinician: clinician, reason: optional_string(input[:reason], field: :reason, maximum: 500) }
        if kind == "weekly"
          values.merge!(weekday: bounded_integer!(input[:weekday], field: :weekday, min: 0, max: 6),
            start_minute: bounded_integer!(input[:start_minute], field: :start_minute, min: 0, max: 1439),
            end_minute: bounded_integer!(input[:end_minute], field: :end_minute, min: 1, max: 1440))
        else
          values.merge!(starts_at: time_param!(input[:starts_at], field: :starts_at), ends_at: time_param!(input[:ends_at], field: :ends_at))
        end
        result = Clinic::Idempotency.execute(practice: current_practice, actor: current_user,
          operation_code: "capacity.create", request_key: input[:request_key], payload: input.except(:request_key).to_h,
          authorization: authorize, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { CapacityRule.find_by(practice: practice, id: receipt.resource_id) }
        ) do
          clinician.lock!
          if kind == "block"
            appointments = current_practice.appointments.where(booked_clinician: clinician, status: %w[scheduled confirmed])
              .where("starts_at < ? AND ends_at > ?", values[:ends_at], values[:starts_at])
            offers = WaitlistEntry.where(practice: current_practice, clinician: clinician, state: "offered")
              .where("offer_expires_at > ? AND offer_starts_at < ? AND offer_ends_at > ?", Current.business_time, values[:ends_at], values[:starts_at])
            raise ArgumentError, "Move existing appointments or release waitlist offers before blocking this time." if appointments.exists? || offers.exists?
          end
          CapacityRule.create!(values.merge(practice: current_practice))
        end
        rule = result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
        render json: { rule: serialize(rule) }, status: :created
      end

      def deactivate
        rule = CapacityRule.where(practice: current_practice).find(requested_id!(params[:id], :id))
        require_capability("facilities.write", site: rule.site)
        raise Clinic::Authorization::Denied if rule.kind == "block" && !current_ability.practice_scope_for?("facilities.write")
        input = parameter_hash!(:capacity, %i[expected_version])
        ApplicationRecord.transaction do
          rule.clinician.lock!
          rule.lock!
          if rule.active?
            expected = bounded_integer!(input[:expected_version], field: :expected_version, min: 0)
            raise ActiveRecord::StaleObjectError.new(rule, "deactivate") unless rule.lock_version == expected
            rule.update!(active: false)
          end
        end
        render json: { rule: serialize(rule) }
      end

      private

      def serialize(rule)
        { id: rule.id, site_id: rule.site_id, clinician_id: rule.clinician_id, kind: rule.kind,
          weekday: rule.weekday, start_minute: rule.start_minute, end_minute: rule.end_minute,
          starts_at: rule.starts_at&.iso8601(6), ends_at: rule.ends_at&.iso8601(6), reason: rule.reason,
          active: rule.active, version: rule.lock_version }
      end
    end
  end
end
