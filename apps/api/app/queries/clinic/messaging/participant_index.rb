module Clinic
  module Messaging
    class ParticipantIndex
      def self.call(practice:, ability:, site: nil, limit: 100)
        memberships = practice.memberships.active
          .joins(:user)
          .where(users: { active: true })
          .includes(:user, role_grants: { role_version: :permissions })
          .order(:id)

        return memberships.limit(limit).to_a if site.nil? && ability.practice_scope_for?("staff_messaging.read")
        unless site && ability.allowed_permission?("staff_messaging.read", site: site)
          raise Clinic::Authorization::Denied, "Select a clinic site you can access before listing staff participants."
        end

        memberships.where(id: active_site_membership_ids(practice:, site:)).select do |membership|
          eligible?(practice: practice, membership: membership, site: site)
        end.first(limit)
      end

      def self.eligible?(practice:, membership:, site:)
        return false unless membership.active? && membership.user.active?

        ability = Ability.new(membership.user, practice: practice)
        return ability.practice_scope_for?("staff_messaging.read") unless site

        ability.allowed_permission?("staff_messaging.read", site: site) &&
          active_site_membership_ids(practice:, site:).where(membership_id: membership.id).exists?
      end

      def self.active_site_membership_ids(practice:, site:, now: Time.current)
        Clinic::Workforce::Employment.where(practice_id: practice.id, status: "active")
          .where("clinic_workforce_employments.effective_from <= ? AND (clinic_workforce_employments.effective_until IS NULL OR clinic_workforce_employments.effective_until > ?)", now, now)
          .joins(:employment_sites)
          .merge(Clinic::Workforce::EmploymentSite.active)
          .where("clinic_workforce_employment_sites.effective_from <= ? AND (clinic_workforce_employment_sites.effective_until IS NULL OR clinic_workforce_employment_sites.effective_until > ?)", now, now)
          .where(clinic_workforce_employment_sites: { site_id: site.id })
          .select(:membership_id)
      end
      private_class_method :active_site_membership_ids
    end
  end
end
