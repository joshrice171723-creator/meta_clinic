module Clinic
  class DocumentProvenanceController < ApiController
    before_action -> { require_capability("documents.read") }

    def index
      document = readable_document
      scope = Documents::Provenance.revisions(document).includes(:configuration)
      records, pagination = paginated_records(scope, order: { revision: :desc, id: :desc })
      current = scope.order(revision: :desc).first
      AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "documents.metadata.read", outcome: :released,
        resource_version_ref: "document_metadata:#{document.id}:#{current&.revision || 0}:#{document.object_version}")
      render json: {
        document: DocumentSerializer.call(document).merge(category: DocumentSerializer.category(document.category)),
        configuration: Documents::Provenance.configuration_snapshot(document.category),
        current: current&.then { |record| Documents::Provenance.serialize(record) },
        revisions: records.map { |record| Documents::Provenance.serialize(record) }, pagination:,
        can_configure: ::Ability.new(current_user, practice: current_practice).allowed_permission?("facilities.write"),
        can_write: false, write_blocker: "Metadata writing requires an approved document writer authority. Category configuration does not grant write access."
      }
    end

    def create
      document = readable_document
      input = parameter_hash!(:metadata, %i[request_key expected_revision expected_configuration_revision object_version checksum source issuer
        issued_date issued_precision received_date received_precision correction_reason])
      record = Documents::Provenance.record(practice: current_practice, actor: current_user, document:, input:)
      render json: { metadata: Documents::Provenance.serialize(record) }, status: :created
    end

    private

    def readable_document
      document = current_practice.documents.includes(:category, :patient, encounter: :site)
        .find(requested_id!(params[:document_id], :document_id))
      raise ActiveRecord::RecordNotFound unless document.patient_id == requested_id!(params[:patient_id], :patient_id)
      Documents::Provenance.authorize_reader!(practice: current_practice, actor: current_user, document:)
      document
    end
  end
end
