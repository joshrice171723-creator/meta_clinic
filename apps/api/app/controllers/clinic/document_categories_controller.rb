module Clinic
  class DocumentCategoriesController < ApiController
    before_action -> { require_capability("documents.read") }

    def index
      categories = Clinic::DocumentCategory.where(practice_id: current_practice.id)
      query = query_param
      categories = categories.where("code ILIKE :query OR name ILIKE :query", query: "%#{Clinic::DocumentCategory.sanitize_sql_like(query)}%") if query.present?
      can_configure = ::Ability.new(current_user, practice: current_practice).allowed_permission?("facilities.write")
      paginate(categories, key: :categories, serializer: ->(category) {
        DocumentSerializer.category(category).merge(provenance_configuration: Documents::Provenance.configuration_snapshot(category), can_configure:)
      }, order: { code: :asc, id: :asc })
    end

    def provenance_configuration
      category = Clinic::DocumentCategory.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
      versions = DocumentProvenanceConfiguration.where(practice: current_practice, category:)
      records, pagination = paginated_records(versions, order: { revision: :desc, id: :desc })
      render json: { configuration: Documents::Provenance.configuration_snapshot(category),
        revisions: records.map { |record| Documents::Provenance.serialize_configuration(record) }, pagination: }
    end

    def configure_provenance
      category = Clinic::DocumentCategory.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
      input = parameter_hash!(:configuration, %i[request_key expected_revision applicable], arrays: %i[fields])
      record = Documents::Provenance.configure(practice: current_practice, actor: current_user, category:,
        applicable: boolean_param(input[:applicable], field: :applicable), fields: input[:fields],
        expected_revision: input[:expected_revision], request_key: input[:request_key])
      render json: { configuration: Documents::Provenance.serialize_configuration(record) }, status: :created
    end
  end
end
