module Development
  class DemoClinicReset
    def self.call!(lesson)
      raise ActiveRecord::RecordNotFound unless Rails.env.development? || Rails.env.test?
      raise ArgumentError, "Choose a registered lesson clinic." unless
        DemoLesson.where(id: lesson.id, lesson_key: lesson.lesson_key, practice_id: lesson.practice_id).exists?

      binds = [
        ActiveRecord::Relation::QueryAttribute.new("lesson_key", lesson.lesson_key, ActiveRecord::Type::String.new),
        ActiveRecord::Relation::QueryAttribute.new("practice_id", lesson.practice_id, ActiveRecord::Type::Integer.new)
      ]
      ApplicationRecord.connection.exec_query(
        "SELECT development_reset_demo_practice($1, $2)", "Reset registered demo lesson clinic", binds
      )
    end
  end
end
