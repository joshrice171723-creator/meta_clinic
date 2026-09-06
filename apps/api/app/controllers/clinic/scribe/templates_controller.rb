module Clinic
  module Scribe
    class TemplatesController < Clinic::ApiController
      before_action -> { require_capability("scribe.read", any_site: true) }

      def index
        render json: { templates: TemplateCatalog.published.map { |template| Serializer.template(template) } }
      end

      private

      def sensitive_read_action
        "scribe.read"
      end
    end
  end
end
