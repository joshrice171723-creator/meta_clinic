module Platform
  class ReviewDecision < ApplicationRecord
    self.table_name = "platform_review_decisions"

    enum :outcome, { approved: "approved", changes_requested: "changes_requested" }, validate: true

    belongs_to :review_packet, class_name: "Platform::ReviewPacket"
    belongs_to :reviewer, class_name: "User"

    before_update { throw :abort }
    before_destroy { throw :abort }

    validates :note, presence: true, length: { maximum: 1_000 }
    validates :review_packet_id, uniqueness: true
    validate :results_are_complete

    private

    def results_are_complete
      unless results.is_a?(Array) && results.length.between?(1, 12)
        errors.add(:results, "must contain between 1 and 12 results")
        return
      end
      valid = results.all? do |result|
        result.is_a?(Hash) && result["criterion_id"].to_s.present? &&
          %w[passed failed].include?(result["outcome"].to_s) &&
          result["evidence"].to_s.strip.length.between?(1, 1_000)
      end
      errors.add(:results, "must record a result and evidence for every criterion") unless valid
    end
  end
end
