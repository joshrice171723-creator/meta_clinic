module Development
  class DemoSandboxOrganization
    NAME = "Meta Clinic Sandbox".freeze
    REUSE_AFTER = 7.days
    RunContext = Data.define(:practice, :operator_user)

    def self.reuse_expired!(visitor:, at: Time.current)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled?

      DemoLesson.where(lesson_key: DemoLessonCatalog::SANDBOX_KEY)
        .where.not(visitor_id: nil).where("updated_at < ?", at - REUSE_AFTER)
        .order(:updated_at, :id).limit(20).each do |lesson|
        next if lesson.visitor_id == visitor.id

        companion = DemoLesson.find_by(lesson_key: DemoLessonCatalog::SANDBOX_COMPANION_KEY,
          visitor_id: lesson.visitor_id)
        next unless companion && lesson.practice.organization_id.present? &&
          companion.practice.organization_id == lesson.practice.organization_id &&
          lesson.practice.organization.practices.where.not(id: [ lesson.practice_id, companion.practice_id ]).none?

        users = DemoRun.where(practice_id: lesson.practice_id).pluck(:operator_user_id, :patient_user_id).flatten.compact
        users.concat(Clinic::Membership.where(practice_id: [ lesson.practice_id, companion.practice_id ]).pluck(:user_id))
        next if MemberSession.where(user_id: users.uniq).any?(&:unexpired?)

        lesson.update!(visitor:)
        companion.update!(visitor:)
        return lesson
      end
      nil
    end

    def self.prepare!(primary_lesson)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        primary_lesson.lesson_key == DemoLessonCatalog::SANDBOX_KEY &&
        primary_lesson.visitor_id.present? &&
        DemoLesson.exists?(id: primary_lesson.id, practice_id: primary_lesson.practice_id)

      organization = primary_lesson.practice.organization ||
        Organization.create!(name: "#{NAME} #{primary_lesson.practice_id}")
      companion = DemoLesson.find_by(lesson_key: DemoLessonCatalog::SANDBOX_COMPANION_KEY,
        visitor_id: primary_lesson.visitor_id) || create_companion!(primary_lesson.visitor)
      raise ActiveRecord::RecordNotFound if organization.practices.where.not(id: [ primary_lesson.practice_id, companion.practice_id ]).exists? ||
        (companion.practice.organization_id.present? && companion.practice.organization_id != organization.id)

      primary_lesson.practice.update!(organization:, name: "Sandbox Primary Care")
      companion.practice.update!(organization:, name: "Sandbox Weight Management")

      DemoClinicReset.call!(companion)
      GuidedClinicDemo.prepare_clinic!(practice: companion.practice, operator: companion.operator_user,
        template_key: "weight_management", suffix: "sandbox-companion")
      DemoSandboxPreparation.prepare!(RunContext.new(companion.practice, companion.operator_user))

      membership = Clinic::Membership.find_or_create_by!(practice: companion.practice, user: primary_lesson.operator_user) do |record|
        record.active = true
      end
      effective_from = ApplicationRecord.connection.select_value("SELECT CURRENT_TIMESTAMP")
      primary_lesson.operator_user.clinic_memberships.find_by!(practice: primary_lesson.practice)
        .role_grants.where(scope_kind: "practice", revoked_at: nil).find_each do |grant|
        membership.role_grants.find_or_create_by!(role_version: grant.role_version, scope_kind: "practice") do |new_grant|
          new_grant.practice = companion.practice
          new_grant.effective_from = effective_from
          new_grant.revision = 1
        end
      end
      companion
    end

    def self.create_companion!(visitor)
      clinic = GuidedClinicDemo.create_clinic!(clinic_name: "Sandbox Weight Management")
      DemoLesson.create!(lesson_key: DemoLessonCatalog::SANDBOX_COMPANION_KEY,
        practice: clinic.practice, operator_user: clinic.operator, visitor:)
    end
    private_class_method :create_companion!
  end
end
