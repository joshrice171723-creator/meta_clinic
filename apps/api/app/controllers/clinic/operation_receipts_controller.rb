module Clinic
  class OperationReceiptsController < ApiController
    def show
      receipt = Clinic::OperationReceipt.find_by(
        practice_id: current_practice.id,
        actor_membership_id: clinic_membership.id,
        request_key: params[:request_key].to_s
      )
      return render_error("Operation receipt not found.", :not_found) unless receipt

      render json: {
        schema_version: "clinic-operation-receipt-v1",
        receipt: {
          id: receipt.id,
          operation_code: receipt.operation_code,
          digest_algorithm: receipt.digest_algorithm,
          outcome: receipt.outcome,
          reconciliation_required: receipt.outcome_outcome_unconfirmed?,
          automatic_retry: false,
          resource_type: receipt.resource_type,
          resource_id: receipt.resource_id,
          resource_version: receipt.resource_version,
          created_at: receipt.created_at.iso8601(6),
          updated_at: receipt.updated_at.iso8601(6)
        }
      }
    end
  end
end
