module Clinic
  module Care
    class ReferralExchangeEvent < ApplicationRecord
      self.table_name = "clinic_referral_exchange_events"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      DIRECTIONS = %w[outbound inbound].freeze
      STAGES = %w[prepared sent received acknowledged closed cancelled].freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :encounter, class_name: "Clinic::Encounter"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :service_request_revision, class_name: "Clinic::Care::ServiceRequestRevision"
      belongs_to :document, class_name: "Clinic::Document", optional: true
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"

      encrypts :organization_name, :note
      validates :direction, inclusion: { in: DIRECTIONS }
      validates :stage, inclusion: { in: STAGES }
      validates :service_request_series_id, :recorded_at, presence: true
      validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN },
        uniqueness: { scope: %i[practice_id recorded_by_membership_id] }
      validates :organization_name, length: { maximum: 500 }, allow_nil: true
      validates :note, length: { maximum: 2_000 }, allow_nil: true
    end
  end
end
