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

        memberships.select do |membership|
          eligible?(practice: practice, membership: membership, site: site)
        end.first(limit)
      end

      def self.eligible?(practice:, membership:, site:)
        return false unless membership.active? && membership.user.active?

        ability = Ability.new(membership.user, practice: practice)
        site ? ability.allowed_permission?("staff_messaging.read", site: site) :
          ability.practice_scope_for?("staff_messaging.read")
      end
    end
  end
end
