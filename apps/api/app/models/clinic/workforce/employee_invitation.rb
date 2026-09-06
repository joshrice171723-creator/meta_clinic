require "digest"

module Clinic
  module Workforce
    class EmployeeInvitation < ApplicationRecord
      self.table_name = "clinic_workforce_employee_invitations"
      include Clinic::TenantScoped

      INVITATION_TTL = 72.hours

      enum :status, { pending: "pending", activated: "activated", revoked: "revoked" }, validate: true

      belongs_to :staff_member, class_name: "Clinic::Staff::Member"
      belongs_to :invited_by_membership, class_name: "Clinic::Membership"

      encrypts :email_address
      normalizes :email_address, with: ->(email) { email.strip.downcase }

      validates :email_address, presence: true, length: { maximum: 254 },
        format: { with: URI::MailTo::EMAIL_REGEXP }
      validates :token_digest, format: { with: /\A\h{64}\z/ }, presence: true, if: :pending?
      validates :email_digest, format: { with: /\A\h{64}\z/ }, presence: true, if: :pending?
      validates :invited_at, :expires_at, :effective_from, presence: true
      validates :site_ids, length: { minimum: 1, maximum: 100 }
      validate :related_records_belong_to_practice
      validate :sites_belong_to_practice
      before_validation :set_email_digest, if: :pending?

      def self.digest(value)
        Digest::SHA256.hexdigest(value.to_s)
      end

      private

      def set_email_digest
        self.email_digest = self.class.digest(email_address.to_s.strip.downcase)
      end

      def related_records_belong_to_practice
        { staff_member: staff_member, invited_by_membership: invited_by_membership }.each do |attribute, record|
          errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
        end
      end

      def sites_belong_to_practice
        normalized_ids = Array(site_ids).map(&:to_i).uniq
        errors.add(:site_ids, "contains an invalid site") if normalized_ids.length != Array(site_ids).length
        return if practice_id.blank? || normalized_ids.empty?

        valid_count = Clinic::Site.where(practice_id: practice_id, id: normalized_ids, status: "active").count
        errors.add(:site_ids, "must contain active sites from this practice") unless valid_count == normalized_ids.length
      end
    end
  end
end
