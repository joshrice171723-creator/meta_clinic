module Clinic
  module PatientPortal
    class ContextController < BaseController
      def show
        appointments = portal_patient.appointments
          .where(status: %w[scheduled confirmed])
          .where("starts_at >= ?", Time.current)
          .includes(:site, :visit_type).order(:starts_at, :id).limit(5)
        ledger = Clinic::Billing::PatientLedger.call(practice: portal_practice, patient: portal_patient)
        summaries = portal_patient.encounter_notes
          .includes(:revisions, :signatures, :encounter)
          .where(encounter_id: portal_patient.encounters.where(status: "completed").select(:id))
          .order(created_at: :desc, id: :desc)
          .filter_map { |note| visit_summary(note) }
        observations = portal_patient.observations
          .where(encounter_id: portal_patient.encounters.where(status: "completed").select(:id))
          .order(observed_at: :desc, id: :desc).limit(20)
        medications = portal_patient.medication_statements.active_for_summary.to_a
        messages = portal_patient.message_intents.includes(:outbox).order(created_at: :desc, id: :desc).limit(20)
        appointment_requests = Clinic::PatientPortal::AppointmentRequest.for_practice(portal_practice)
          .where(patient: portal_patient).recent.limit(20)
        requests = Clinic::PatientPortal::Request.for_practice(portal_practice)
          .where(patient: portal_patient).recent.limit(30)
        reminders = portal_patient.patient_reminders.includes(:communication_endpoint).order(scheduled_at: :asc, id: :asc).limit(20)
        record_portal_read("patient_portal.context.read")
        render json: {
          schema_version: "patient-portal-context-v1",
          development_only: true,
          practice: { id: portal_practice.id, name: portal_practice.name, timezone: portal_practice.timezone },
          patient: { id: portal_patient.id, display_name: portal_patient.display_name, reference: portal_patient.reference },
          upcoming_appointments: appointments.map do |appointment|
            {
              id: appointment.id,
              starts_at: appointment.starts_at&.iso8601(6),
              ends_at: appointment.ends_at&.iso8601(6),
              status: appointment.status,
              site: appointment.site&.code,
              visit_type: appointment.visit_type&.code
            }
          end,
          balances: ledger.fetch(:currencies).map { |currency| currency.slice(:currency, :balance_amount, :allocated_amount, :credited_amount) },
          billing: { invoices: ledger.fetch(:invoices), payments: ledger.fetch(:payments) },
          intake: {
            status: portal_patient.demographics.present? ? "profile_on_file" : "not_started",
            emergency_contact_count: portal_patient.emergency_contacts.count,
            consent_status: "not_recorded"
          },
          visit_summaries: summaries,
          results: observations.map { |observation| Clinic::Care::ObservationSerializer.call(observation) },
          medications: medications.map { |medication| medication_payload(medication) },
          messages: messages.map { |message| {
            id: message.id, purpose_code: message.purpose_code, created_at: message.created_at
          } },
          reminders: reminders.map { |reminder| Clinic::PatientReminderSerializer.call(reminder) },
          reminder_preferences: portal_patient.communication_preferences.where(category: "operational").group_by(&:channel).values.map { |records| records.max_by(&:version) }.compact.map { |preference| {
            channel: preference.channel, setting: preference.setting, quiet_hours_start: preference.quiet_hours_start&.strftime("%H:%M"),
            quiet_hours_end: preference.quiet_hours_end&.strftime("%H:%M"), timezone: preference.timezone, locale: preference.locale, version: preference.version
          } },
          appointment_requests: appointment_requests.map { |request| {
            id: request.id, starts_at: request.starts_at.iso8601(6), ends_at: request.ends_at.iso8601(6),
            status: request.status, requested_at: request.requested_at.iso8601(6)
          } },
          requests: requests.map { |request| {
            id: request.id, request_type: request.request_type, status: request.status,
            requested_at: request.requested_at.iso8601(6), reviewed_at: request.reviewed_at&.iso8601(6)
          } },
          capabilities: {
            appointments_read: true, billing_read: true, intake_read: true, messages_read: true,
            results_read: true, visit_summaries_read: true, payment_collection: false, appointment_requests_write: true,
            messages_write: true, refill_requests_write: true, step_up: false, recovery: false
          },
          notices: [
            "This is a synthetic development patient portal.",
            "Payment collection is disabled until a Stripe account and webhook signing secret are configured.",
            "Step-up authentication and self-service recovery are unavailable in this synthetic portal; contact the clinic support team if access is lost.",
            "Messages are reviewed within 1 business day. For medical emergencies, call 911 or visit the ER."
          ]
        }
      end

      private

      def visit_summary(note)
        signature = note.signatures.order(signed_at: :desc, id: :desc).first
        return unless signature

        revision = note.revisions.find_by(id: signature.revision_id)
        return unless revision

        body = Clinic::Care::SoapNotePayload.load!(revision.encrypted_body)
        sections = body.fetch(:sections, {})
        {
          id: note.id,
          encounter_id: note.encounter_id,
          signed_at: note.signatures.maximum(:signed_at)&.iso8601(6),
          assessment: sections.fetch(:assessment, ""),
          plan: sections.fetch(:plan, "")
        }
      rescue ActiveRecord::RecordNotFound, ArgumentError
        nil
      end

      def medication_payload(medication)
        {
          id: medication.id,
          medication: medication.medication_name,
          dose: medication.dose_text,
          route: medication.route_text,
          frequency: medication.frequency_text,
          purpose: medication.purpose,
          status: medication.status,
          effective_from: medication.effective_from&.iso8601(6),
          effective_until: medication.effective_until&.iso8601(6)
        }
      end
    end
  end
end
