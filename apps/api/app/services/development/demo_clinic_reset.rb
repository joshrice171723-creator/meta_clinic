module Development
  class DemoClinicReset
    def self.call!(lesson)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled?
      raise ArgumentError, "Choose a registered lesson clinic." unless
        DemoLesson.where(id: lesson.id, lesson_key: lesson.lesson_key, practice_id: lesson.practice_id).exists?

      binds = [
        ActiveRecord::Relation::QueryAttribute.new("lesson_key", lesson.lesson_key, ActiveRecord::Type::String.new),
        ActiveRecord::Relation::QueryAttribute.new("practice_id", lesson.practice_id, ActiveRecord::Type::Integer.new)
      ]
      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute("SET LOCAL statement_timeout = '120s'")
        ApplicationRecord.connection.exec_query(
          "SELECT set_config('apply.development_demo_reset_practice_id', $2::text, true), " \
            "set_config('apply.development_demo_reset_lesson_key', $1::text, true)",
          "Scope demo reset", binds
        )
        ApplicationRecord.connection.exec_query(
          "DELETE FROM clinic_role_grant_events WHERE practice_id = $1 AND grant_id IN (" \
            "SELECT id FROM clinic_role_grants WHERE practice_id = $1 " \
            "AND (site_id IS NOT NULL OR source_employment_id IS NOT NULL))",
          "Clear demo staff grant events", [ binds.last ]
        )
        ApplicationRecord.connection.exec_query(
          "DELETE FROM clinic_role_grants WHERE practice_id = $1 " \
            "AND (site_id IS NOT NULL OR source_employment_id IS NOT NULL)",
          "Clear demo staff grants", [ binds.last ]
        )
        ApplicationRecord.connection.exec_query(
          "SELECT development_reset_demo_practice($1, $2)", "Reset registered demo lesson clinic", binds
        )
      end
    end
  end
end
