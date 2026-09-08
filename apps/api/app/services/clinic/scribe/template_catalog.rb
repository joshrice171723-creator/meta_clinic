module Clinic
  module Scribe
    class TemplateCatalog
      SECTION_KEYS = %w[subjective objective assessment plan].freeze

      class << self
        def published
          NoteTemplate.published.order(:template_id, version: :desc)
        end

        def fetch_active!(template_id)
          template = NoteTemplate.where(template_id: template_id.to_s, status: "active").order(version: :desc).first
          raise ArgumentError, "Choose an available scribe template." unless template

          template
        end
      end
    end
  end
end
