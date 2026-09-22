module Clinic
  module Care
    class AssessmentRevision < ApplicationRecord
      self.table_name = "clinic_assessment_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[in_progress completed entered_in_error].freeze
      RESPONSE_SOURCES = %w[patient_reported clinician_observed proxy_reported imported unknown].freeze

      belongs_to :prior_revision, class_name: name, optional: true

      encrypts :instrument_name, :instrument_version, :score_value, :interpretation,
        :response_summary, :follow_up_plan
      validates :status, inclusion: { in: STATUSES }
      validates :category, inclusion: { in: Clinic::Configuration::PracticeFeatures::ASSESSMENT_SCOPE }
      validates :instrument_name, presence: true, length: { maximum: 500 }
      validates :instrument_version, :score_value, length: { maximum: 240 }, allow_nil: true
      validates :interpretation, :response_summary, :follow_up_plan, length: { maximum: 4_000 }, allow_nil: true
      validates :response_source, inclusion: { in: RESPONSE_SOURCES }, allow_nil: true
      validates :assessed_at, presence: true, if: -> { status == "completed" }
      validates :response_summary, presence: true, if: -> { status == "completed" }
      validates :response_source, presence: true, if: -> { status == "completed" }
    end
  end
end
