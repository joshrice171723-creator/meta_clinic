require "digest"

module Development
  class DemoSandboxPatientContact
    REMINDER_CATEGORIES = %w[appointment preparation follow_up].freeze

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      practices = run.practice.organization.practices.order(:id).to_a
      raise ArgumentError, "Sandbox contact needs two clinics" unless practices.length == 2

      practices.each do |practice|
        practice.sites.order(:id).each_with_index do |site, index|
          prepare_site!(practice:, site:, site_index: index + 1, actor: run.operator_user)
        end
      end
    end

    def self.prepare_site!(practice:, site:, site_index:, actor:)
      patient_ids = practice.patients.where(primary_site: site)
        .where("reference LIKE 'SBX-%'").select(:id)
      appointments = practice.appointments.where(site:)
        .where(patient_id: patient_ids).where("starts_at > ?", Current.business_time)
        .order(:starts_at, :id).limit(3).to_a
      raise ArgumentError, "Sandbox contact needs three upcoming visits" unless appointments.length == 3

      appointments.each_with_index do |appointment, index|
        patient = appointment.patient
        raise ArgumentError, "Contact patient belongs to another location" unless patient.primary_site_id == site.id

        endpoint = practice.communication_endpoints.create!(
          patient:, endpoint_type: "portal", value: "portal:sandbox:#{patient.id}",
          value_digest: Digest::SHA256.hexdigest("sandbox:#{practice.id}:#{patient.id}"),
          label: "Patient portal", verified_at: appointment.created_at
        )
        ApplicationRecord.transaction do
          reminder = Clinic::Reminders::Create.call(
            practice:, actor:, patient:, appointment:,
            request_key: "sandbox-contact-#{appointment.id}",
            category: REMINDER_CATEGORIES.fetch(index), channel: "portal",
            endpoint_id: endpoint.id, scheduled_at: appointment.starts_at - (index + 1).days
          )
          # Review-only records must never enter an external dispatch queue.
          reminder.update!(status: "suppressed", policy_decision_code: "sandbox_review_only")
          reminder.outbox.update!(dispatch_state: "suppressed")
        end
      end

      medicated_patients = practice.patients.where(primary_site: site)
        .where("reference LIKE ?", "SBX-#{site_index}-%")
        .where(id: Clinic::Care::MedicationStatement.where(practice:, status: "active").select(:patient_id))
        .order(:id).limit(2).to_a
      medicated_patients.each_with_index do |patient, index|
        status = index.zero? ? "pending" : "in_review"
        medication = patient.medication_statements.where(status: "active").order(:id).first!
        content = Clinic::PatientPortal::RefillRequestData.content(
          medication_name: medication.medication_name,
          pharmacy_destination: "Example Community Pharmacy",
          request_note: "Patient called to ask whether a refill is due; clinician review requested.",
          source: "staff"
        )
        request = Clinic::PatientPortal::CreateRequest.call(
          practice:, patient:, identity: nil,
          request_key: "sandbox-refill-#{patient.id}", request_type: "refill", content:
        )
        requested_at = Current.business_time - (index + 3).days
        request.update!(requested_at:, created_at: requested_at)
        next unless status == "in_review"

        Clinic::PatientPortal::ReviewRequest.call(
          practice:, actor:, request:, status:, request_key: "sandbox-refill-review-#{request.id}"
        )
      end
    end
    private_class_method :prepare_site!
  end
end
