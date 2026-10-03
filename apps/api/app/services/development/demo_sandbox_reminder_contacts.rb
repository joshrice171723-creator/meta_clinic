require "digest"

module Development
  class DemoSandboxReminderContacts
    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? && run.active? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?
      primary = DemoLesson.find_by!(lesson_key: DemoLessonCatalog::SANDBOX_KEY, practice_id: run.practice_id)
      companion = DemoLesson.find_by!(lesson_key: DemoLessonCatalog::SANDBOX_COMPANION_KEY,
        practice_id: primary.practice.organization.practice_ids)
      practices = [ primary.practice, companion.practice ]
      raise ArgumentError, "Sandbox organization has unexpected clinics" unless
        primary.practice.organization.practice_ids.sort == practices.map(&:id).sort

      ApplicationRecord.transaction do
        run.lock!
        raise ActiveRecord::RecordNotFound unless run.active?
        practices.each do |practice|
          patient_ids = practice.appointments.where("starts_at > ?", Current.business_time).select(:patient_id)
          practice.patients.where(id: patient_ids).find_each do |patient|
            patient.lock!
            # Existing consent, opt-outs and invalidated destinations belong to the ongoing QA journey.
            patient.create_communication_preference!(practice:, preferred_contact_method: "text",
              appointment_reminders_consent: true, general_communications_consent: false) unless patient.communication_preference
            next if patient.communication_endpoints.phone.exists?

            value = "+1202555#{format('%04d', 100 + patient.id % 100)}"
            patient.communication_endpoints.create!(practice:, endpoint_type: "phone", value:,
              value_digest: Digest::SHA256.hexdigest(value), label: "SMS", verified_at: Current.business_time)
          end
        end
      end
    end

    def self.refresh_preserved!
      return unless GuidedDemoAccess.enabled?

      DemoRun.active.where(lesson_key: DemoLessonCatalog::SANDBOX_KEY).find_each do |run|
        prepare!(run) if SandboxAccounts.prepared?(run)
      end
    end
  end
end
