module Development
  class SharedDemoLesson
    TEMPLATE_KEY = "primary_care".freeze

    def self.enter!(lesson_key, visitor:, previous_run: nil)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled?
      definition = DemoLessonCatalog.definition!(lesson_key)
      template_key = definition.fetch(:template_key, TEMPLATE_KEY)
      ApplicationRecord.transaction do
        [ lesson_key, previous_run&.lesson_key ].compact.uniq.sort.each do |key|
          ApplicationRecord.connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(#{ApplicationRecord.connection.quote("apply:demo-lesson:#{key}")}, 0))"
          )
        end
        lesson = DemoLesson.lock.find_by(lesson_key:) || create_lesson!(definition)
        lesson.lock!
        if previous_run&.reload&.active? && previous_run.lesson_key != lesson_key
          [ previous_run.operator_user, previous_run.patient_user ].compact.each do |user|
            user.member_sessions.destroy_all
          end
          previous_run.update!(active: false, baseline: {})
        end
        old_runs = DemoRun.where(lesson_key:).lock.to_a
        patient_users = old_runs.filter_map(&:patient_user).uniq(&:id)
        old_runs.each do |run|
          [ run.operator_user, run.patient_user ].compact.each { |user| user.member_sessions.destroy_all }
          run.update!(active: false, baseline: {}, patient_user: nil, membership_prospect: nil)
        end
        lesson.operator_user.member_sessions.destroy_all

        DemoClinicReset.call!(lesson)
        patient_users.each { |user| user.destroy! if user.reload.member_sessions.empty? }
        GuidedClinicDemo.prepare_clinic!(
          practice: lesson.practice, operator: lesson.operator_user, template_key:,
          suffix: "lesson-#{lesson.lesson_key}"
        )
        run = DemoRun.create!(template_key:, lesson_key:, practice: lesson.practice,
          operator_user: lesson.operator_user, visitor:)
        DemoLessonCatalog.prepare!(run)
        lesson.update!(generation: lesson.generation + 1)
        run
      end
    end

    def self.leave!(run)
      run.with_lock do
        return run unless run.active?
        run.operator_user.member_sessions.destroy_all
        run.patient_user&.member_sessions&.destroy_all
        run.update!(active: false, baseline: {})
      end
      run
    end

    def self.create_lesson!(definition)
      lesson_key = definition.fetch(:id)
      clinic = GuidedClinicDemo.create_clinic!(
        clinic_name: "Meta Clinic Lesson — #{definition.fetch(:title)}".first(160),
        operator_email: "guided-lesson-#{lesson_key.tr('_', '-')}@example.test"
      )
      DemoLesson.create!(lesson_key:, practice: clinic.practice, operator_user: clinic.operator)
    end
    private_class_method :create_lesson!
  end
end
