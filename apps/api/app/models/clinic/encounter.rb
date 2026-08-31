module Clinic
  class Encounter < ApplicationRecord
    self.table_name = "clinic_encounters"
    include TenantScoped
    include Auditable

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :appointment, class_name: "Clinic::Appointment", optional: true
    belongs_to :site, class_name: "Clinic::Site", optional: true
    belongs_to :room, class_name: "Clinic::Room", optional: true
    has_many :participants, class_name: "Clinic::EncounterParticipant", dependent: :restrict_with_error
    has_many :notes, class_name: "Clinic::EncounterNote", dependent: :restrict_with_error
    has_many :observations, class_name: "Clinic::Care::Observation", dependent: :restrict_with_error
    has_many :documents, class_name: "Clinic::Document", dependent: :restrict_with_error

    scope :open, -> { where(ended_at: nil) }
    scope :recent, -> { order(started_at: :desc) }

    def close!(ended_at: Time.current)
      raise ArgumentError, "An encounter is already closed." if ended_at.nil? || self.ended_at.present?
      raise ArgumentError, "An encounter must end after it starts." if ended_at <= started_at

      update!(ended_at: ended_at, status: "completed")
      self
    end

    validates :started_at, :status, presence: true
    validate :positive_interval
    validate :room_requires_site
    validate :related_records_belong_to_practice

    private

    def positive_interval
      errors.add(:ended_at, "must be after started_at") if started_at && ended_at && ended_at <= started_at
    end

    def room_requires_site
      errors.add(:site, "is required when a room is selected") if room_id.present? && site_id.blank?
    end

    def related_records_belong_to_practice
      { patient: patient, appointment: appointment, site: site, room: room }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
      errors.add(:appointment, "must belong to the same patient") if appointment && appointment.patient_id != patient_id
      errors.add(:room, "must belong to the selected site") if room && site && room.site_id != site.id
    end
  end
end
