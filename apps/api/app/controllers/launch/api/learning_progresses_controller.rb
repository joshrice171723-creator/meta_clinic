module Launch
  module Api
    class LearningProgressesController < ApplicationController
      before_action :require_member

      def start
        progress = TrainingProgress.start!(user: current_user, material_id: params[:material_id], sample_only: development_demo?)
        render json: { status: progress.status }
      end

      def complete
        progress = TrainingProgress.complete!(user: current_user, material_id: params[:material_id], sample_only: development_demo?)
        render json: { status: progress.status }
      end
    end
  end
end
