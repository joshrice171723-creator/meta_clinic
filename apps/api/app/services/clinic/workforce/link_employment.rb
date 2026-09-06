module Clinic
  module Workforce
    class LinkEmployment
      def self.call(practice:, staff_member:, membership:, site_ids:, effective_from:, actor:)
        Access.new(actor: actor, practice: practice).authorize!("workforce.admin")
        normalized_site_ids = normalize_site_ids(site_ids)

        ApplicationRecord.transaction do
          locked_practice = Clinic::Practice.lock.find(practice.id)
          locked_staff = Clinic::Staff::Member.lock.find(staff_member.id)
          locked_membership = Clinic::Membership.includes(:user).lock.find(membership.id)
          sites = Clinic::Site.lock.where(id: normalized_site_ids).order(:id).to_a

          ensure_linkable!(locked_practice, locked_staff, locked_membership, sites, normalized_site_ids)
          employment = Employment.create!(practice: locked_practice, staff_member: locked_staff,
            membership: locked_membership, status: :active, effective_from: effective_from)
          sites.each do |site|
            employment.employment_sites.create!(practice: locked_practice, site: site,
              active: true, effective_from: effective_from)
          end
          revoked_invitation = false
          EmployeeInvitation.where(practice_id: locked_practice.id, staff_member_id: locked_staff.id, status: "pending").lock.each do |invitation|
            invitation.update!(status: :revoked, revoked_at: Time.current, token_digest: nil, email_digest: nil)
            revoked_invitation = true
          end
          Clinic::AuditRecorder.record!(practice: locked_practice, actor: actor,
            action_code: "workforce.onboarding.revoke", outcome: :committed) if revoked_invitation
          employment
        end
      rescue ActiveRecord::RecordNotUnique
        raise ArgumentError, "That directory entry or clinic account is already linked to workforce."
      end

      def self.update!(employment:, actor:, status: nil, site_ids: nil, effective_until: :unchanged, now: Time.current)
        Access.new(actor: actor, practice: employment.practice, at: now).authorize!("workforce.admin")
        normalized_site_ids = site_ids.nil? ? nil : normalize_site_ids(site_ids)

        ApplicationRecord.transaction do
          locked = Employment.lock.find(employment.id)
          raise ArgumentError, "The employment does not belong to this practice." unless locked.practice_id == employment.practice_id

          attributes = {}
          attributes[:status] = status if status
          attributes[:effective_until] = effective_until unless effective_until == :unchanged
          locked.update!(attributes) if attributes.any?
          replace_sites!(locked, normalized_site_ids, now) if normalized_site_ids
          locked
        end
      end

      def self.normalize_site_ids(site_ids)
        ids = Array(site_ids).map { |value| Integer(value, exception: false) }.compact.uniq
        raise ArgumentError, "Choose at least one eligible work site." if ids.empty?
        raise ArgumentError, "Too many work sites were selected." if ids.length > 100

        ids
      end
      def self.ensure_linkable!(practice, staff_member, membership, sites, expected_site_ids)
        unless staff_member.practice_id == practice.id && membership.practice_id == practice.id &&
            sites.length == expected_site_ids.length && sites.all? { |site| site.practice_id == practice.id && site.status == "active" }
          raise ArgumentError, "The employee, account, and work sites must belong to this practice."
        end
        unless staff_member.active? && membership.active? && membership.user.active?
          raise ArgumentError, "The directory entry and clinic account must both be active."
        end
      end
      private_class_method :ensure_linkable!

      def self.replace_sites!(employment, site_ids, now)
        sites = Clinic::Site.lock.where(practice_id: employment.practice_id, id: site_ids, status: "active").order(:id).to_a
        raise ArgumentError, "Choose only active sites from this practice." unless sites.length == site_ids.length

        open_assignments = employment.employment_sites.lock.where(active: true, effective_until: nil).to_a
        open_assignments.each do |assignment|
          next if site_ids.include?(assignment.site_id)

          if assignment.effective_from < now
            assignment.update!(effective_until: now)
          else
            assignment.update!(active: false)
          end
        end
        retained_ids = open_assignments.select { |assignment| site_ids.include?(assignment.site_id) }.map(&:site_id)
        sites.reject { |site| retained_ids.include?(site.id) }.each do |site|
          employment.employment_sites.create!(practice: employment.practice, site: site,
            active: true, effective_from: now)
        end
      end
      private_class_method :replace_sites!
    end
  end
end
