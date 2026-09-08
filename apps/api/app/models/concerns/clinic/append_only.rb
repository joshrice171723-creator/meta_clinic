module Clinic
  module AppendOnly
    extend ActiveSupport::Concern

    included do
      before_update { throw :abort }
      before_destroy { throw :abort }
      has_paper_trail(
        on: [ :create ],
        versions: { class_name: "Clinic::ModelVersion" },
        meta: {
          practice_id: :practice_id,
          actor_reference: ->(_record) { PaperTrail.request.whodunnit },
          request_id: ->(_record) { PaperTrail.request.controller_info&.[](:request_id) },
          causal_id: ->(_record) { PaperTrail.request.controller_info&.[](:causal_id) },
          job_id: ->(_record) { PaperTrail.request.controller_info&.[](:job_id) },
          occurred_at: ->(_record) { Time.current },
          changed_fields: ->(record) { record.attributes.keys }
        }
      )
    end
  end
end
