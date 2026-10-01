module Development
  class SharedDemoLesson
    TEMPLATE_KEY = "primary_care".freeze
    SANDBOX_PREPARERS = [
      DemoSandboxPopulation,
      DemoSandboxStaffActivity,
      DemoSandboxSchedulingExceptions,
      DemoSandboxSchedulingVariants,
      DemoSandboxChartMeasurements,
      DemoSandboxChartHistory,
      DemoSandboxLongitudinalChart,
      DemoSandboxLabHistory,
      DemoSandboxLabContact,
      DemoSandboxInventoryHistory,
      DemoSandboxInventoryReplenishment,
      DemoSandboxJourneys,
      DemoSandboxPrescriptionOutcomes,
      DemoSandboxBillingExceptions,
      DemoSandboxQueue,
      DemoSandboxCarePlanHistory,
      DemoSandboxTelehealth,
      DemoSandboxPatientContact,
      DemoSandboxRefillCompletion,
      DemoSandboxGrowth,
      DemoSandboxMembershipHistory
    ].freeze

    def self.enter!(lesson_key, visitor:, previous_run: nil, restart: false)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled?
      definition = DemoLessonCatalog.definition!(lesson_key)
      template_key = definition.fetch(:template_key, TEMPLATE_KEY)
      sandbox = lesson_key == DemoLessonCatalog::SANDBOX_KEY
      raise ActiveRecord::RecordNotFound if visitor.nil? && lesson_key != "navigation_tour"
      raise ActiveRecord::RecordNotFound if previous_run &&
        !DemoLessonCatalog.sandbox?(previous_run.lesson_key) && previous_run.visitor_id != visitor&.id
      ApplicationRecord.transaction do
        if sandbox
          ApplicationRecord.connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended('apply:demo-sandbox-pool', 0))"
          )
        end
        [ lesson_key, previous_run&.lesson_key ].compact.uniq.sort.each do |key|
          ApplicationRecord.connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(#{ApplicationRecord.connection.quote("apply:demo-lesson:#{key}")}, 0))"
          )
        end
        lesson = if sandbox
          active_practice_id = DemoRun.active.where(lesson_key:).order(id: :desc).pick(:practice_id)
          (DemoLesson.find_by(lesson_key:, practice_id: active_practice_id) if active_practice_id) ||
            DemoLesson.where(lesson_key:).order(:id).first ||
            create_lesson!(definition, visitor:)
        else
          DemoLesson.where(lesson_key:, visitor_id: nil).lock.first || create_lesson!(definition)
        end
        lesson.lock!
        lesson.update!(visitor:) if sandbox && lesson.visitor_id.nil?
        if sandbox && !restart
          existing_run = DemoRun.active.find_by(lesson_key:, practice: lesson.practice)
          if existing_run
            if previous_run&.reload&.active? && previous_run.id != existing_run.id &&
                !DemoLessonCatalog.sandbox?(previous_run.lesson_key)
              [ previous_run.operator_user, previous_run.patient_user ].compact.each do |user|
                user.member_sessions.destroy_all
              end
              finish!(previous_run)
            end
            next existing_run
          end
        end
        if previous_run&.reload&.active? && previous_run.lesson_key != lesson_key &&
            !DemoLessonCatalog.sandbox?(previous_run.lesson_key)
          [ previous_run.operator_user, previous_run.patient_user ].compact.each do |user|
            user.member_sessions.destroy_all
          end
          finish!(previous_run)
        end
        old_runs = DemoRun.where(lesson_key:)
        old_runs = old_runs.where(practice_id: lesson.practice_id) if sandbox
        old_runs = old_runs.lock.to_a
        patient_users = old_runs.filter_map(&:patient_user).uniq(&:id)
        old_runs.each do |run|
          [ run.operator_user, run.patient_user ].compact.each { |user| user.member_sessions.destroy_all }
          finish!(run) if run.active?
          run.update!(patient_user: nil, membership_prospect: nil)
        end
        lesson.operator_user.member_sessions.destroy_all

        DemoClinicReset.call!(lesson)
        patient_users.each { |user| user.destroy! if user.reload.member_sessions.empty? }
        GuidedClinicDemo.prepare_clinic!(
          practice: lesson.practice, operator: lesson.operator_user, template_key:,
          suffix: "lesson-#{lesson.lesson_key}"
        )
        DemoSandboxOrganization.prepare!(lesson) if sandbox
        run = DemoRun.create!(template_key:, lesson_key:, practice: lesson.practice,
          operator_user: lesson.operator_user, visitor:)
        DemoLessonCatalog.prepare!(run)
        if sandbox
          run.update!(baseline: run.baseline.to_h.merge("sandbox_preparation_step" => 0))
        else
          lesson.update!(generation: lesson.generation + 1)
        end
        run
      end
    end

    def self.prepare_sandbox_step!(run, visitor:)
      raise ArgumentError, "Open the full sandbox before continuing preparation." unless
        DemoLessonCatalog.sandbox?(run.lesson_key)

      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute(
          "SELECT pg_advisory_xact_lock(hashtextextended('apply:demo-sandbox-pool', 0))"
        )
        run.lock!
        raise ActiveRecord::RecordNotFound unless run.active?

        step = Integer(run.baseline.to_h.fetch("sandbox_preparation_step", 0))
        # Registered visitors bound to this shared run may confirm completion.
        # Only its creator may advance incomplete preparation; check under the
        # same locks as the stage write so a concurrent reset cannot bypass it.
        raise ActiveRecord::RecordNotFound unless visitor
        next true if step >= SANDBOX_PREPARERS.length
        raise ActiveRecord::RecordNotFound unless run.visitor_id == visitor.id

        if (preparer = SANDBOX_PREPARERS[step])
          preparer.prepare!(run)
          step += 1
          run.update!(baseline: run.baseline.to_h.merge("sandbox_preparation_step" => step))
          if step >= SANDBOX_PREPARERS.length
            lesson = DemoLesson.find_by!(lesson_key: run.lesson_key, practice_id: run.practice_id)
            lesson.lock!.update!(generation: lesson.generation + 1)
          end
        end
        step >= SANDBOX_PREPARERS.length
      end
    end

    def self.leave!(run)
      run.with_lock do
        return run unless run.active?
        run.operator_user.member_sessions.destroy_all
        run.patient_user&.member_sessions&.destroy_all
        finish!(run)
      end
      run
    end

    def self.record_completion!(run, at: Time.current)
      run.with_lock do
        return run unless run.active? && run.completed_at.nil?
        run.update!(completed_at: at) if DemoLessonCatalog.complete?(run)
      end
      run
    end

    def self.create_lesson!(definition, visitor: nil)
      lesson_key = definition.fetch(:id)
      operator_email = if visitor
        "guided-lesson-#{lesson_key.tr('_', '-')}-visitor-#{visitor.id}@example.test"
      else
        "guided-lesson-#{lesson_key.tr('_', '-')}@example.test"
      end
      clinic = GuidedClinicDemo.create_clinic!(
        clinic_name: "Meta Clinic Lesson — #{definition.fetch(:title)}".first(160),
        operator_email:
      )
      DemoLesson.create!(lesson_key:, practice: clinic.practice, operator_user: clinic.operator, visitor:)
    end

    def self.finish!(run, at: Time.current)
      run.update!(
        active: false,
        baseline: {},
        completed_at: run.completed_at || (at if DemoLessonCatalog.complete?(run)),
        elapsed_seconds: run.elapsed_seconds_at(at)
      )
    end
    private_class_method :create_lesson!, :finish!
  end
end
