module Clinic
  module Workforce
    class Employment < ApplicationRecord
      self.table_name = "clinic_workforce_employments"
      include Clinic::TenantScoped
      include Clinic::Auditable

      enum :status, { active: "active", inactive: "inactive" }, validate: true

      belongs_to :staff_member, class_name: "Clinic::Staff::Member"
      belongs_to :membership, class_name: "Clinic::Membership"
      has_many :employment_sites, class_name: "Clinic::Workforce::EmploymentSite",
        dependent: :restrict_with_error
      has_many :sites, through: :employment_sites

      validates :staff_member_id, uniqueness: { scope: :practice_id }
      validates :membership_id, uniqueness: { scope: :practice_id }
      validates :effective_from, presence: true
      validate :related_records_belong_to_practice
      validate :effective_window_is_ordered

      scope :effective_at, ->(at) {
        where("effective_from <= ? AND (effective_until IS NULL OR effective_until > ?)", at, at)
      }

      def active_for_work?(at: Current.business_time)
        active? && effective_at?(at) && staff_member.active? && membership.active? && membership.user.active?
      end

      def eligible_site?(site, at: Current.business_time)
        return false unless active_for_work?(at: at)
        return false unless site.is_a?(Clinic::Site) && site.practice_id == practice_id && site.status == "active"

        if association(:employment_sites).loaded?
          return employment_sites.any? do |assignment|
            assignment.site_id == site.id && assignment.active? && assignment.effective_from <= at &&
              (assignment.effective_until.nil? || assignment.effective_until > at)
          end
        end

        employment_sites.active.effective_at(at).exists?(site_id: site.id)
      end

      private

      def effective_at?(at)
        effective_from.present? && effective_from <= at && (effective_until.nil? || effective_until > at)
      end

      def related_records_belong_to_practice
        { staff_member: staff_member, membership: membership }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        end
      end

      def effective_window_is_ordered
        return unless effective_from && effective_until

        errors.add(:effective_until, "must be after the start") unless effective_until > effective_from
      end
    end
  end
end
