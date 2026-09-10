module Clinic
  module MutationReceiptSerializer
    def self.call(outcome)
      receipt = outcome.receipt
      {
        request_key: receipt.request_key,
        outcome: receipt.outcome,
        replayed: outcome.replayed,
        reconciliation_required: receipt.outcome_outcome_unconfirmed?,
        automatic_retry: false,
        resource_type: receipt.resource_type,
        resource_id: receipt.resource_id&.to_s,
        resource_version: receipt.resource_version
      }
    end
  end
end
