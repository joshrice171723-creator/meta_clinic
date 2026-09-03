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
          .where(encounter_id: portal_patient.encounters.select(:id))
          .order(created_at: :desc, id: :desc)
          .filter_map { |note| visit_summary(note) }
        observations = portal_patient.observations.order(observed_at: :desc, id: :desc).limit(20)
        medications = portal_patient.medication_statements.active_for_summary.to_a
        messages = portal_patient.message_intents.includes(:outbox).order(created_at: :desc, id: :desc).limit(20)
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
          messages: messages.map { |message| Clinic::MessageIntentSerializer.call(message) },
          capabilities: {
            appointments_read: true, billing_read: true, intake: true, messages: true,
            results: true, visit_summaries: true, payment_collection: false
          },
          notices: [
            "This is a synthetic development patient portal.",
            "Payment collection is disabled until a Stripe account and webhook signing secret are configured.",
            "Messages are reviewed within 1 business day. For medical emergencies, call 911 or visit the ER."
          ]
        }
      end

      private

      def visit_summary(note)
        return unless note.signatures.exists?

        revision = note.revisions.order(revision_no: :desc).first
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
