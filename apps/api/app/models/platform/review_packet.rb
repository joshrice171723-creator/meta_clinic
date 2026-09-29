module Platform
  class ReviewPacket < ApplicationRecord
    self.table_name = "platform_review_packets"

    enum :status, {
      awaiting_review: "awaiting_review",
      approved: "approved",
      changes_requested: "changes_requested"
    }, validate: true

    belongs_to :created_by, class_name: "User"
    has_one :decision, class_name: "Platform::ReviewDecision", dependent: :restrict_with_error

    attr_readonly :created_by_id, :title, :summary, :scope, :revision, :environment, :entry_path, :criteria

    validates :title, presence: true, length: { maximum: 140 }
    validates :summary, :scope, presence: true, length: { maximum: 1_000 }
    validates :revision, presence: true, length: { maximum: 120 }
    validates :environment, presence: true, length: { maximum: 80 }
    validates :entry_path, presence: true, length: { maximum: 500 }, format: { with: %r{\A/(?!/)} }
    validate :criteria_are_complete

    private

    def criteria_are_complete
      unless criteria.is_a?(Array) && criteria.length.between?(1, 12)
        errors.add(:criteria, "must contain between 1 and 12 checks")
        return
      end
      ids = criteria.filter_map { |criterion| criterion["id"] if criterion.is_a?(Hash) }
      complete = criteria.all? do |criterion|
        criterion.is_a?(Hash) && criterion["id"].to_s.match?(/\A[0-9a-f-]{36}\z/) &&
          criterion["label"].to_s.strip.length.between?(1, 160) &&
          criterion["expected"].to_s.strip.length.between?(1, 500)
      end
      errors.add(:criteria, "must include unique labels and expected evidence") unless complete && ids.uniq.length == ids.length
    end
  end
end
