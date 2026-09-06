module Clinic
  class PatientReminder < ApplicationRecord
    self.table_name = "clinic_patient_reminders"
    include TenantScoped
    include Auditable

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :communication_endpoint, class_name: "Clinic::CommunicationEndpoint"
    has_one :outbox, class_name: "Clinic::PatientReminderOutbox", dependent: :restrict_with_error, foreign_key: :reminder_id
    has_many :delivery_attempts, class_name: "Clinic::PatientReminderDeliveryAttempt", dependent: :restrict_with_error, foreign_key: :reminder_id
    has_many :actions, class_name: "Clinic::PatientReminderAction", dependent: :restrict_with_error, foreign_key: :reminder_id

    CATEGORIES = %w[appointment preparation medication follow_up].freeze
    CHANNELS = %w[portal sms email].freeze
    STATES = {
      "draft" => %w[scheduled paused cancelled suppressed],
      "scheduled" => %w[queued paused cancelled suppressed expired],
      "queued" => %w[sending paused cancelled suppressed expired],
      "sending" => %w[provider_accepted failed delivery_unknown paused cancelled],
      "provider_accepted" => %w[delivered failed delivery_unknown],
      "delivered" => %w[actioned expired],
      "delivery_unknown" => %w[queued failed expired],
      "failed" => %w[queued expired],
      "paused" => %w[scheduled cancelled],
      "suppressed" => [], "cancelled" => [], "actioned" => [], "expired" => []
    }.freeze

    validates :source_type, :source_id, :category, :channel, :safe_preview, :scheduled_at,
      :timezone, :local_schedule_label, :status, :dedupe_key, presence: true
    validates :category, inclusion: { in: CATEGORIES }
    validates :channel, inclusion: { in: CHANNELS }
    validates :lock_version, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
    validate :records_belong_to_practice

    scope :active, -> { where.not(status: %w[cancelled expired suppressed actioned]) }

    def transition_to!(target)
      target = target.to_s
      raise ArgumentError, "Reminder cannot transition from #{status}." unless STATES.fetch(status) { [] }.include?(target)

      update!(status: target)
      self
    end

    private

    def records_belong_to_practice
      errors.add(:patient, "must belong to this practice") if patient && patient.practice_id != practice_id
      if communication_endpoint && (communication_endpoint.practice_id != practice_id || communication_endpoint.patient_id != patient_id)
        errors.add(:communication_endpoint, "must belong to this patient and practice")
      end
    end
  end
end
