module Clinic
  module Auditable
    extend ActiveSupport::Concern

    included do
      has_paper_trail(
        versions: { class_name: "Clinic::ModelVersion" },
        meta: {
          practice_id: :practice_id,
          actor_reference: ->(_record) { PaperTrail.request.whodunnit },
          request_id: ->(_record) { PaperTrail.request.controller_info&.[](:request_id) },
          causal_id: ->(_record) { PaperTrail.request.controller_info&.[](:causal_id) },
          job_id: ->(_record) { PaperTrail.request.controller_info&.[](:job_id) },
          occurred_at: ->(_record) { Time.current },
          changed_fields: ->(record) {
            changes = record.saved_changes.presence || record.changes
            changes.keys
          }
        }
      )
    end
  end
end
