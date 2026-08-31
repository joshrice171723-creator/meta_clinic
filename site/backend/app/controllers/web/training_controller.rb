module Web
  class TrainingController < BaseController
    before_action :require_member
    before_action :load_material, except: :index

    def index
      @materials = available_materials.order(:id)
      @progress = current_user.learning_progresses.where(material: @materials).index_by(&:material_id)
    end

    def show
      @progress = current_user.learning_progresses.find_by(material: @material)
    end

    def start
      current_user.learning_progresses.create_or_find_by!(material: @material) { |record| record.started_at = Time.current }
      redirect_to training_path(@material), status: :see_other
    end

    def complete
      progress = current_user.learning_progresses.find_by!(material: @material)
      progress.with_lock { progress.update!(completed_at: Time.current) unless progress.completed_at? }
      redirect_to training_path(@material), status: :see_other, notice: "Guide marked complete."
    end

    private

    def load_material
      @material = available_materials.find(params[:id])
    end
  end
end
