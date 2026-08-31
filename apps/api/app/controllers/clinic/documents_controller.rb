module Clinic
  class DocumentsController < ApiController
    before_action -> { require_capability("documents.read") }

    def index
      patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
      documents = patient.documents.includes(:category)
      documents = documents.where(category_id: requested_id!(params[:category_id], :category_id)) if params[:category_id].present?
      documents = documents.where(scan_state: enum_param!(params[:scan_state], field: :scan_state, allowed: %w[pending quarantined clean rejected])) if params[:scan_state].present?
      records, pagination = paginated_records(documents, order: { created_at: :desc, id: :desc })
      render json: {
        documents: records.map { |document| DocumentSerializer.call(document).merge(category: DocumentSerializer.category(document.category)) },
        pagination: pagination
      }
    end

    def show
      document = current_practice.documents.includes(:category).find(requested_id!(params[:id], :id))
      verify_patient_scope!(document) if params[:patient_id].present?
      render json: { document: DocumentSerializer.call(document).merge(category: DocumentSerializer.category(document.category)) }
    end

    private

    def verify_patient_scope!(document)
      expected = requested_id!(params[:patient_id], :patient_id)
      raise ActiveRecord::RecordNotFound unless document.patient_id == expected
    end
  end
end
