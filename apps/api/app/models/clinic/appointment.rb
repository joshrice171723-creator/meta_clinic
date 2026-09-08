module Clinic
  class Appointment < ApplicationRecord
    self.table_name = "clinic_appointments"
    include TenantScoped
    include Auditable

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :site, class_name: "Clinic::Site", optional: true
    belongs_to :room, class_name: "Clinic::Room", optional: true
    belongs_to :booked_clinician, class_name: "Clinic::ClinicianProfile", optional: true
    belongs_to :visit_type, class_name: "Clinic::VisitType", optional: true
    has_one :encounter, class_name: "Clinic::Encounter", dependent: :restrict_with_error
    has_many :previsit_notes, class_name: "Clinic::Care::PrevisitNote", dependent: :restrict_with_error

    scope :upcoming, ->(from = Current.business_time) { where("starts_at >= ?", from).order(:starts_at) }
    scope :for_clinician, ->(clinician) { where(booked_clinician_id: clinician.respond_to?(:id) ? clinician.id : clinician) }

    TRANSITIONS = {
      "scheduled" => %w[confirmed cancelled no_show],
      "confirmed" => %w[cancelled completed no_show],
      "no_show" => [],
      "completed" => [],
      "cancelled" => []
    }.freeze

    def transition_to!(target)
      target = target.to_s
      allowed = TRANSITIONS.fetch(status) { [] }
      raise ArgumentError, "Appointment cannot transition from #{status}." unless allowed.include?(target)

      update!(status: target)
      self
    end

    validates :starts_at, :ends_at, :status, presence: true
    validate :positive_interval
    validate :room_requires_site
    validate :related_records_belong_to_practice

    private

    def positive_interval
      errors.add(:ends_at, "must be after starts_at") if starts_at && ends_at && ends_at <= starts_at
    end

    def room_requires_site
      errors.add(:site, "is required when a room is selected") if room_id.present? && site_id.blank?
    end

    def related_records_belong_to_practice
      { patient: patient, site: site, room: room, booked_clinician: booked_clinician, visit_type: visit_type }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
      errors.add(:room, "must belong to the selected site") if room && site && room.site_id != site.id
    end
  end
end
