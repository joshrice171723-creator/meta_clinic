module Clinic
  module Scribe
    class DraftsController < Clinic::ApiController
      before_action :load_draft

      def review
        require_capability("scribe.write")
        input = parameter_hash!(:review, %i[action section_key content expected_version])
        value = Workflow.review!(draft: @draft, actor: current_user,
          action: required_string!(input[:action], field: :action, maximum: 20),
          section_key: required_string!(input[:section_key], field: :section_key, maximum: 40), content: input[:content],
          expected_version: input[:expected_version].nil? ? nil : bounded_integer!(input[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647))
        render json: { draft: Serializer.draft(value) }
      end

      def approve
        require_capability("scribe.approve")
        expected_version = params[:expected_version].nil? ? nil : bounded_integer!(params[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647)
        draft = Workflow.approve!(draft: @draft, actor: current_user, expected_version: expected_version)
        render json: { draft: Serializer.draft(draft) }
      end

      def export
        require_capability("scribe.export")
        input = parameter_hash!(:export, %i[destination idempotency_key confirmed expected_version])
        export = Workflow.export!(draft: @draft, actor: current_user,
          destination: required_string!(input[:destination], field: :destination, maximum: 60),
          idempotency_key: required_string!(input[:idempotency_key], field: :idempotency_key, maximum: 160),
          confirmed: input[:confirmed] == true,
          expected_version: input[:expected_version].nil? ? nil : bounded_integer!(input[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647))
        render json: { export: Serializer.export(export), draft: Serializer.draft(@draft.reload) }, status: :created
      end

      private

      def load_draft
        @draft = current_practice.scribe_drafts.find(requested_id!(params[:id], :id))
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice, action: "scribe.read", site: @draft.encounter.site)
      end
    end
  end
end
