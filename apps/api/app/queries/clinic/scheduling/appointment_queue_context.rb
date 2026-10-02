module Clinic
  module Scheduling
    # Page-bounded metadata only: no answers, invoice lines or payment evidence.
    class AppointmentQueueContext
      def self.call(practice:, ability:, appointments:)
        new(practice:, ability:, appointments:).call
      end

      def initialize(practice:, ability:, appointments:)
        @practice = practice
        @ability = ability
        @appointments = appointments
      end

      def call
        return {} if @appointments.empty?
        raise ArgumentError, "Queue rows must belong to this practice." unless @appointments.all? { |row| row.practice_id == @practice.id }

        can_patients = @ability.allowed_permission?("patients.read")
        note_rows = can_patients ? @appointments.select { |row| @ability.allowed_permission?("notes.read", site: row.site_id) } : []
        note_ids = note_rows.map(&:id)
        notes = latest_notes(note_ids)
        intakes = can_patients ? latest_intakes : {}
        balances = patient_balances

        @appointments.to_h do |row|
          encounter = row.encounter
          intake = intakes[encounter&.id]
          note = notes[row.id]
          raise ArgumentError, "Queue context must belong to this patient." if
            (encounter && (encounter.practice_id != @practice.id || encounter.patient_id != row.patient_id)) ||
            (intake && intake.patient_id != row.patient_id) || (note && note.patient_id != row.patient_id)
          [row.id, {
            previsit_intake: note_ids.include?(row.id) ? previsit_summary(note) : { status: "unavailable" },
            encounter_intake: {
              status: can_patients ? (encounter ? intake&.status || "not_recorded" : "not_started") : "unavailable"
            },
            balance_due: balances.fetch(row.patient_id, { status: "unavailable" })
          }]
        end
      end

      private

      def latest_notes(ids)
        return {} if ids.empty?

        Clinic::Care::PrevisitNote.where(practice_id: @practice.id, appointment_id: ids)
          .select("DISTINCT ON (appointment_id) appointment_id, patient_id, encrypted_text")
          .order(appointment_id: :asc, version_number: :desc, id: :desc).index_by(&:appointment_id)
      end

      def latest_intakes
        ids = @appointments.filter_map { |row| row.encounter&.id }
        return {} if ids.empty?

        Clinic::EncounterIntakeRevision.where(practice_id: @practice.id, encounter_id: ids)
          .select("DISTINCT ON (encounter_id) encounter_id, patient_id, status")
          .order(encounter_id: :asc, version_number: :desc, id: :desc).index_by(&:encounter_id)
      end

      def previsit_summary(note)
        return { status: "not_recorded" } unless note

        payload = Clinic::Care::PrevisitIntake.decode(note.encrypted_text)
        # A free-text/legacy note is evidence of receipt, not form completeness.
        return { status: "unavailable" } unless payload && payload["status"].in?(%w[draft submitted])

        form_id = payload.fetch("form_id")
        answers = payload.fetch("answers")
        fields = Clinic::Care::PrevisitIntake.fields_for_recorder(form_id, recorder: payload["recorder"] == "staff" ? "staff" : "patient")
          .select { |field| Clinic::Care::PrevisitIntake.visible?(field, answers, form_id:) }
        answered = fields.count do |field|
          answer = answers[field[:id]]
          answer.is_a?(Hash) && Clinic::Care::PrevisitIntake::ANSWER_STATES.include?(answer["state"]) &&
            !%w[unanswered not_asked].include?(answer["state"]) &&
            (answer["state"] != "answered" || answer.values_at("value", "values", "entries").any?(&:present?))
        end
        status = if payload["status"] == "draft"
          "draft"
        elsif fields.any? && answered == fields.length
          "complete"
        else
          "incomplete"
        end
        { status:, answered_count: answered, question_count: fields.length }
      end

      def patient_balances
        # Match the ledger's explicit legacy bridge; appointment access alone
        # never establishes financial access.
        return {} unless @ability.allowed_permission?("billing.read") || @ability.allowed_permission?("billing.write")

        patient_ids = @appointments.map(&:patient_id).uniq
        posted = Clinic::Invoice.where(practice_id: @practice.id, patient_id: patient_ids, status: "posted")
        keys = posted.group(:patient_id, :currency).count.keys
        totals = Clinic::InvoiceLine.where(practice_id: @practice.id).joins(:invoice).merge(posted)
          .group("clinic_invoices.patient_id", "clinic_invoices.currency").sum(:posted_amount)
        allocated = Clinic::PaymentAllocation.where(practice_id: @practice.id).joins(:invoice).merge(posted)
          .group("clinic_invoices.patient_id", "clinic_invoices.currency").sum(:amount)
        credits = Clinic::CreditNote.where(practice_id: @practice.id).joins(:invoice).merge(posted)
          .group("clinic_invoices.patient_id", "clinic_invoices.currency").sum(:amount)
        by_patient = keys.group_by(&:first)
        zero = BigDecimal("0")
        patient_ids.to_h do |patient_id|
          currencies = by_patient.fetch(patient_id, []).sort_by(&:last).map do |key|
            amount = [totals.fetch(key, zero) - allocated.fetch(key, zero) - credits.fetch(key, zero), zero].max
            { currency: key.last, balance_amount: amount.to_s("F") }
          end
          [patient_id, { status: currencies.empty? ? "no_posted_invoices" : "available", currencies: }]
        end
      end
    end
  end
end
