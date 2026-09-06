module Launch
  class TrainingProgress
    def self.start!(user:, material_id:, sample_only: false)
      material = MaterialsQuery.call(sample_only: sample_only).find(material_id)
      user.learning_progresses.create_or_find_by!(material: material) { |record| record.started_at = Current.business_time }
    end

    def self.complete!(user:, material_id:, sample_only: false)
      material = MaterialsQuery.call(sample_only: sample_only).find(material_id)
      progress = user.learning_progresses.find_by!(material: material)
      progress.with_lock { progress.update!(completed_at: Current.business_time) unless progress.completed_at? }
      progress
    end
  end
end
