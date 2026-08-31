module Api
  class LearningProgressesController < ApplicationController
    before_action :require_member

    def start
      material = available_materials.find(params[:material_id])
      progress = current_user.learning_progresses.create_or_find_by!(material: material) { |record| record.started_at = Time.current }
      render json: { status: progress.status }
    end

    def complete
      material = available_materials.find(params[:material_id])
      progress = current_user.learning_progresses.find_by!(material: material)
      progress.with_lock { progress.update!(completed_at: Time.current) unless progress.completed_at? }
      render json: { status: progress.status }
    end
  end
end
