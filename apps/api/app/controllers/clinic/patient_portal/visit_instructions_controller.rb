module Clinic
  module PatientPortal
    class VisitInstructionsController < BaseController
      DEFAULT_PER_PAGE = 10
      MAX_PER_PAGE = 25

      def index
        page = positive_param(:page, default: 1)
        per_page = positive_param(:per_page, default: DEFAULT_PER_PAGE, maximum: MAX_PER_PAGE)
        items = Clinic::Care::ReleasedVisitInstructions.items(practice: portal_practice, patient: portal_patient)
        total = items.length
        visible = items.slice((page - 1) * per_page, per_page) || []

        record_portal_read("patient_portal.visit_instructions.read")
        render json: { items: visible, pagination: { page:, per_page:, total: } }
      end

      def show
        encounter = portal_practice.encounters.where(patient: portal_patient)
          .find(integer_id!(params[:encounter_id], field: :encounter_id))
        item = Clinic::Care::ReleasedVisitInstructions.handout(
          practice: portal_practice, patient: portal_patient, encounter: encounter
        )
        record_portal_read("patient_portal.visit_instructions.read")
        render json: { item: item }
      end

      private

      def positive_param(name, default:, maximum: 1_000_000)
        return default unless params[name].present?

        bounded_integer!(params[name], field: name, min: 1, max: maximum)
      end
    end
  end
end
