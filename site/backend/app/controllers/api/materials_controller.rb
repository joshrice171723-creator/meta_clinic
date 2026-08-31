module Api
  class MaterialsController < ApplicationController
    before_action :require_member

    def index
      progress = current_user.learning_progresses.index_by(&:material_id)
      render json: { materials: available_materials.order(:id).map { |item|
        item.as_json(only: %i[id title summary published_at sample]).merge("status" => progress[item.id]&.status || "not_started")
      } }
    end

    def show
      material = available_materials.find(params[:id])
      progress = current_user.learning_progresses.find_by(material: material)
      render json: { material: material.as_json(only: %i[id title summary body published_at sample]).merge("status" => progress&.status || "not_started") }
    end
  end
end
