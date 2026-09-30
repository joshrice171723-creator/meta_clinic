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
    belongs_to :service_offering, class_name: "Clinic::ServiceOffering", optional: true
    belongs_to :schedule_hold, class_name: "Clinic::Scheduling::ScheduleHold", optional: true
    has_one :encounter, class_name: "Clinic::Encounter", dependent: :restrict_with_error
    has_one :telehealth_visit, class_name: "Clinic::Telehealth::Visit", dependent: :restrict_with_error
    has_many :overbook_exceptions, class_name: "Clinic::Scheduling::OverbookException", dependent: :restrict_with_error
    has_one :overbook_exception, -> { order(id: :desc) }, class_name: "Clinic::Scheduling::OverbookException"
    has_one :walk_in_exception, class_name: "Clinic::Scheduling::WalkInException", dependent: :restrict_with_error
    has_one :series_occurrence, class_name: "Clinic::Scheduling::AppointmentSeriesOccurrence", dependent: :restrict_with_error
    has_many :previsit_notes, class_name: "Clinic::Care::PrevisitNote", dependent: :restrict_with_error

    encrypts :reason

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

      # Keep every appointment transition attributable, including trusted
      # internal and patient-portal paths that do not pass through the HTTP
      # controller. The server derives this value from persisted state.
      PaperTrail.request.controller_info = PaperTrail.request.controller_info.to_h.merge(
        causal_id: "appointment-status-transition:#{id}:#{status}->#{target}"
      )
      update!(status: target)
      self
    end

    validates :starts_at, :ends_at, :status, :visit_modality, presence: true
    validates :reason, length: { maximum: 500 }, allow_nil: true
    validates :visit_modality, inclusion: { in: %w[in_person video] }
    validate :positive_interval
    validate :room_requires_site
    validate :related_records_belong_to_practice
    validate :offering_snapshot_pair

    private

    def positive_interval
      errors.add(:ends_at, "must be after starts_at") if starts_at && ends_at && ends_at <= starts_at
    end

    def room_requires_site
      errors.add(:site, "is required when a room is selected") if room_id.present? && site_id.blank?
      errors.add(:room, "must be blank for a video visit") if visit_modality == "video" && room_id.present?
    end

    def related_records_belong_to_practice
      { patient: patient, site: site, room: room, booked_clinician: booked_clinician, visit_type: visit_type,
        service_offering: service_offering, schedule_hold: schedule_hold }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
      errors.add(:room, "must belong to the selected site") if room && site && room.site_id != site.id
    end

    def offering_snapshot_pair
      return if service_offering_id.present? == service_offering_snapshot.present?

      errors.add(:service_offering_snapshot, "must accompany the selected service offering")
    end
  end
end
