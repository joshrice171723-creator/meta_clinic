module Development
  class DemoNavigationLessons
    DEFINITIONS = [
      ["navigation_tour", "Tour the clinic workspace", "Use the navigation to preview each clinic workspace. Page controls are disabled during this read-only tour.", "administrator", "Clinic navigation", ["Full clinic navigation", "Prepared clinic workspace"], :clinic, "/clinic"],
      ["patient_flow_review", "Review patient flow", "Review the prepared sample patient flow.", "front_desk", "Patient Flow", ["Sample patient and pending work"], :patient, "/clinic/work"],
      ["tracking_board_review", "Review tracking board", "Review recorded operational state for the sample visit.", "front_desk", "Tracking Board", ["Sample patient and open visit"], :encounter, "/clinic"],
      ["patient_register", "Register a patient", "Create a new sample patient record.", "front_desk", "Patients", ["Prepared clinic"], :clinic, "/clinic/patients"],
      ["refill_review", "Review refill requests", "Review the prepared refill request; no external pharmacy request is sent.", "clinical_team", "Refill requests", ["Sample patient and refill request"], :patient, "/clinic/refills"],
      ["recall_review", "Review recalls and care gaps", "Review prepared local care-gap work; no external notification is sent.", "clinical_team", "Recalls and care gaps", ["Sample patient and care-gap item"], :patient, "/clinic/recalls"],
      ["telehealth_review", "Review telehealth", "Review the telehealth queue; no call is started.", "clinical_team", "Telehealth", ["Sample appointment"], :appointment, "/clinic/telehealth"],
      ["scribe_review", "Review scribe workspace", "Review the prepared chart context and persistent recording dock; voice-to-text and AI drafting are unavailable in this demo.", "clinical_team", "Scribe", ["Sample patient and open visit"], :encounter, "/clinic/scribe"],
      ["waitlist_review", "Review waitlist", "Review the prepared waitlist entry; no outreach is sent.", "front_desk", "Capacity and waitlist", ["Sample patient and waitlist entry"], :patient, "/clinic/waitlist"],
      ["operations_review", "Review operations", "Review operations readiness content.", "administrator", "Operations overview", ["Sample patient and open visit"], :encounter, "/clinic/operations"],
      ["reminders_review", "Review reminders", "Review prepared reminder handling; no SMS or email is sent.", "front_desk", "Reminders", ["Sample appointment and reminder"], :appointment, "/clinic/reminders"],
      ["messages_review", "Review messages", "Review prepared staff messaging; no external message is sent.", "administrator", "Messages", ["Prepared staff message"], :clinic, "/clinic/messages"],
      ["workforce_review", "Review workforce", "Review prepared workforce record.", "administrator", "Workforce", ["Prepared workforce record"], :clinic, "/clinic/workforce/employees"],
      ["billing_review", "Review billing", "Review local billing workspace; no charge is made.", "administrator", "Billing", ["Sample patient and appointment"], :appointment, "/clinic/billing"],
      ["growth_review", "Review growth", "Review membership growth workspace.", "administrator", "Growth", ["Sample patient membership"], :patient, "/clinic/growth"],
      ["settings_review", "Review settings", "Review clinic settings without changing shared configuration.", "administrator", "Settings", ["Prepared clinic"], :clinic, "/clinic/settings"],
      ["inventory_overview_review", "Review inventory", "Review prepared stock inventory.", "inventory", "Inventory", ["Received sample stock"], :stock, "/clinic/inventory"],
      ["inventory_ledger_review", "Review inventory ledger", "Review local stock movement history.", "inventory", "Inventory", ["Received sample stock"], :stock, "/clinic/inventory/activity"]
    ].map { |id, title, description, role, section, prepared, context, href| { id:, title:, description:, role:, section:, prepared:, context:, href: } }.freeze

    class << self
      def definition!(key)
        DEFINITIONS.find { |definition| definition[:id] == key.to_s } || raise(ArgumentError, "Choose an available demo lesson.")
      end

      def prepare!(run)
        definition = definition!(run.lesson_key)
        DemoLessonCatalog.prepare_context!(run, kind: definition.fetch(:context))
        DemoNavigationPreparation.prepare!(run)
        DemoWorkspacePreparation.prepare!(run)
        baseline = run.baseline.to_h.merge("review_acknowledged" => false)
        if run.lesson_key == "patient_register"
          baseline["patient_ids"] = run.practice.patients.pluck(:id)
        end
        run.update!(baseline:)
      end

      def complete?(run)
        return run.practice.patients.where.not(id: Array(run.baseline.to_h["patient_ids"])).exists? if run.lesson_key == "patient_register"
        run.baseline.to_h["review_acknowledged"] == true
      end

      def href_for(run)
        return definition!(run.lesson_key).fetch(:href) unless run.lesson_key == "telehealth_review"

        appointment = run.practice.appointments.order(:id).last!
        date = appointment.starts_at.in_time_zone(run.practice.timezone).to_date.iso8601
        "/clinic/telehealth?date=#{date}"
      end
      def review?(key) = definition!(key).fetch(:id) != "patient_register"
    end
  end
end
