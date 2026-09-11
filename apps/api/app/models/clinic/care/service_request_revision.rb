module Clinic
  module Care
    class ServiceRequestRevision < ApplicationRecord
      self.table_name = "clinic_service_request_revisions"
      include Clinic::ClinicalRevision

      STATUSES = %w[draft active on_hold completed cancelled entered_in_error].freeze
      KINDS = %w[lab imaging procedure referral therapy other].freeze
      INTENTS = %w[proposal plan order].freeze
      PRIORITIES = %w[routine urgent asap stat].freeze

      belongs_to :prior_revision, class_name: name, optional: true

      encrypts :requested_code_system, :requested_code, :requested_display, :destination, :reason_text,
        :completion_exception
      validates :status, inclusion: { in: STATUSES }
      validates :request_kind, inclusion: { in: KINDS }
      validates :intent, inclusion: { in: INTENTS }
      validates :priority, inclusion: { in: PRIORITIES }
      validates :requested_display, presence: true, length: { maximum: 500 }
      validates :requested_code_system, :requested_code, length: { maximum: 240 }, allow_nil: true
      validates :destination, length: { maximum: 500 }, allow_nil: true
      validates :reason_text, length: { maximum: 2_000 }, allow_nil: true
      validates :completion_exception, length: { maximum: 2_000 }, allow_nil: true
      validates :completion_exception, absence: true, unless: -> { status == "completed" }
    end
  end
end
