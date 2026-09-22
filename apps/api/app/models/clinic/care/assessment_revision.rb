module Clinic
  module Care
    class AssessmentRevision < ApplicationRecord
      self.table_name = "clinic_assessment_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[in_progress completed entered_in_error].freeze
      RESPONSE_SOURCES = %w[patient_reported clinician_observed proxy_reported imported unknown].freeze
      SCORE_SOURCES = %w[calculated clinician_entered imported unknown].freeze
      ASSESSMENT_STATES = %w[not_assessed unknown assessed].freeze
      ITEM_STATES = %w[answered unanswered not_asked unknown declined not_applicable].freeze

      belongs_to :prior_revision, class_name: name, optional: true
      belongs_to :reviewer_membership, class_name: "Clinic::Membership", optional: true

      encrypts :instrument_name, :instrument_version, :score_value, :interpretation,
        :response_summary, :follow_up_plan
      validates :status, inclusion: { in: STATUSES }
      validates :category, inclusion: { in: Clinic::Configuration::PracticeFeatures::ASSESSMENT_SCOPE }
      validates :instrument_name, presence: true, length: { maximum: 500 }
      validates :instrument_version, :score_value, length: { maximum: 240 }, allow_nil: true
      validates :interpretation, :response_summary, :follow_up_plan, length: { maximum: 4_000 }, allow_nil: true
      validates :response_source, inclusion: { in: RESPONSE_SOURCES }, allow_nil: true
      validates :score_source, inclusion: { in: SCORE_SOURCES }, allow_nil: true
      validates :assessment_state, inclusion: { in: ASSESSMENT_STATES }
      validates :assessed_at, presence: true, if: -> { status == "completed" }
      validates :response_summary, presence: true, if: -> { status == "completed" }
      validates :response_source, presence: true, if: -> { status == "completed" }
      validate :score_provenance_matches_score
      validate :item_responses_match_contract
      validate :completion_matches_assessment_state
      validate :reviewer_matches_practice

      private

      def score_provenance_matches_score
        if score_source.present? != score_recorded_at.present?
          errors.add(:base, "Score source and recorded time must be entered together.")
        end
        if score_source.present? && score_value.blank?
          errors.add(:score_value, "is required when score provenance is recorded")
        end
      end

      def item_responses_match_contract
        unless item_responses.is_a?(Array)
          errors.add(:item_responses, "must be an array")
          return
        end

        item_responses.each do |item|
          unless item.is_a?(Hash) && item["item_id"].to_s.match?(/\A[a-z0-9][a-z0-9_-]{0,79}\z/) && ITEM_STATES.include?(item["state"])
            errors.add(:item_responses, "contains an unsupported item response")
            next
          end
          if item["state"] == "answered"
            errors.add(:item_responses, "an answered item requires a value") if item["value"].blank?
          elsif item.key?("value") && item["value"].present?
            errors.add(:item_responses, "only an answered item can contain a value")
          end
        end
      end

      def completion_matches_assessment_state
        return unless status == "completed"

        errors.add(:assessment_state, "must be assessed before completion") unless assessment_state == "assessed"
      end

      def reviewer_matches_practice
        if reviewer_membership && reviewer_membership.practice_id != practice_id
          errors.add(:reviewer_membership, "must belong to this clinic")
        end
      end
    end
  end
end
