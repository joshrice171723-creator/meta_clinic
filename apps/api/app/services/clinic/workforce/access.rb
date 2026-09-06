module Clinic
  module Workforce
    class Access
      SELF_PERMISSION = "workforce.self"

      attr_reader :actor, :practice, :at

      def initialize(actor:, practice:, at: Current.business_time)
        @actor = actor
        @practice = practice
        @at = at
      end

      def allow?(permission, site: nil, any_site: false)
        normalized = permission.to_s.sub(/\?\z/, "")
        if normalized == SELF_PERMISSION
          employment = own_employment
          return false unless employment
          return true unless site

          return employment.eligible_site?(site, at: at)
        end

        Ability.new(actor, practice: practice, at: at)
          .allowed_permission?(normalized, site: site, any_site: any_site)
      end

      def authorize!(permission, site: nil, any_site: false)
        normalized = permission.to_s.sub(/\?\z/, "")
        if normalized == SELF_PERMISSION
          return own_employment if allow?(normalized, site: site)

          Clinic::AuditRecorder.record!(practice: practice, actor: actor,
            action_code: normalized, outcome: :denied)
          raise Clinic::Authorization::Denied, "Your account does not have active workforce access."
        end

        Clinic::Authorization.authorize!(actor: actor, practice: practice, action: normalized,
          site: site, any_site: any_site, at: at)
      end

      def own_employment
        return unless actor.is_a?(User) && practice.present?

        membership = Clinic::Membership.active.find_by(practice_id: practice.id, user_id: actor.id)
        return unless membership

        employment = Employment.includes(:staff_member, membership: :user)
          .find_by(practice_id: practice.id, membership_id: membership.id)
        employment if employment&.active_for_work?(at: at)
      end
    end
  end
end
