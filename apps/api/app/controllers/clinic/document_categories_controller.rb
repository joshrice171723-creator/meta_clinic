module Clinic
  class DocumentCategoriesController < ApiController
    before_action -> { require_capability("documents.read") }

    def index
      categories = Clinic::DocumentCategory.where(practice_id: current_practice.id)
      query = query_param
      categories = categories.where("code ILIKE :query OR name ILIKE :query", query: "%#{Clinic::DocumentCategory.sanitize_sql_like(query)}%") if query.present?
      paginate(categories, key: :categories, serializer: ->(category) { DocumentSerializer.category(category) }, order: { code: :asc, id: :asc })
    end
  end
end
