module Clinic
  class DayEndReview < ApplicationRecord
    self.table_name = "clinic_day_end_reviews"
    include TenantScoped
    include Auditable

    belongs_to :reviewed_by, class_name: "User"

    attr_readonly :practice_id, :reviewed_by_id, :review_date, :timezone, :request_key, :review_note, :snapshot

    validates :review_date, :timezone, :snapshot, presence: true
    validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN }
    validates :review_note, presence: true, length: { maximum: 500 }
  end
end
