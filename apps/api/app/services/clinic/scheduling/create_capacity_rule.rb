module Clinic
  module Scheduling
    class CreateCapacityRule
      def self.authorize!(practice:, actor:, site:, kind:)
        Clinic::Authorization.authorize!(practice:, actor:, action: "facilities.write", site:)
        ability = Ability.new(actor, practice:)
        if kind == "block" && (!ability.practice_scope_for?("facilities.write") || !ability.practice_scope_for?("appointments.read"))
          raise Clinic::Authorization::Denied
        end
      end

      def self.call(practice:, actor:, values:, request_key:, payload:, expected_revision: nil, category_key: nil)
        site, clinician, kind = values.values_at(:site, :clinician, :kind)
        raise ArgumentError, "Choose resources in this clinic." unless site.practice_id == practice.id && clinician.practice_id == practice.id
        authorize = -> { authorize!(practice:, actor:, site:, kind:) }
        authorize.call
        result = Clinic::Idempotency.execute(practice:, actor:, operation_code: "capacity.create", request_key:, payload:,
          authorization: authorize, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { CapacityRule.find_by(practice:, id: receipt.resource_id) }) do
          attributes = values.dup
          if kind == "block"
            attributes.merge!(BlockCategoryReference.resolve(practice:, site:, actor:, expected_revision:, category_key:))
          end
          clinician.lock!
          if kind == "block"
            offers = WaitlistEntry.where(practice:, clinician:, state: "offered")
              .where("offer_expires_at > ? AND offer_starts_at < ? AND offer_ends_at > ?", Current.business_time, values[:ends_at], values[:starts_at])
            holds = ScheduleHold.where(practice:, clinician:, state: "active")
              .where("expires_at > ? AND starts_at < ? AND ends_at > ?", Current.business_time, values[:ends_at], values[:starts_at])
            raise ArgumentError, "Release waitlist offers and schedule holds before blocking this time." if offers.exists? || holds.exists?
          end
          CapacityRule.create!(attributes.merge(practice:))
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
