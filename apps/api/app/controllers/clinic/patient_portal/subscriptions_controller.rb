module Clinic
  module PatientPortal
    class SubscriptionsController < BaseController
      before_action :require_local_subscription_boundary
      rescue_from Clinic::Authorization::Denied do
        render json: { error: "Subscription access is unavailable." }, status: :forbidden
      end
      rescue_from Clinic::AuditRecorder::Unavailable do
        render json: { error: "Required audit evidence is unavailable." }, status: :service_unavailable
      end

      def index
        record_portal_read("patient_portal.subscriptions.read")
        render json: { catalog: Care::SubscriptionProjection.catalog(practice: portal_practice),
          subscriptions: agreements.order(id: :desc).map { |r| Care::SubscriptionProjection.agreement(r).except(:patient_id) },
          can_purchase: patient_portal_identity.present? && !development_omni_preview?, processor: "development_fixture" }
      end

      def quote
        version = Care::SubscriptionVersion.where(practice: portal_practice).find(params[:version_id])
        raise ArgumentError, "This package is no longer available." unless Care::SubscriptionProjection.catalog(practice: portal_practice).any? { |r| r[:id] == version.id }
        render json: { terms: Care::SubscriptionDefinition.select(version.snapshot, params[:selections]) }
      end

      def checkout
        require_purchase_identity!
        reject_authority_fields!
        agreement = Care::SubscriptionPurchase.checkout(identity: patient_portal_identity, actor: current_user,
          version_id: params[:version_id], selections: params[:selections], request_key: params[:request_key])
        render json: Care::SubscriptionProjection.agreement(agreement).except(:patient_id), status: :created
      end

      def pay
        require_purchase_identity!
        reject_authority_fields!
        agreement = agreements.find(params[:id])
        intent = Billing::SubscriptionPayments.start(agreement: agreement, actor: current_user, request_key: params[:request_key])
        render json: { subscription: Care::SubscriptionProjection.agreement(agreement).except(:patient_id),
          processor: "development_fixture", payment_state: intent.state,
          message: "Test payment requested. Clinic billing staff can deliver the processor fixture and reconcile the result." }, status: :accepted
      end

      def cancel
        require_purchase_identity!
        agreement = Care::SubscriptionPurchase.cancel(agreement: agreements.find(params[:id]), actor: current_user, request_key: params[:request_key])
        render json: Care::SubscriptionProjection.agreement(agreement).except(:patient_id)
      end

      def receipt
        agreement = agreements.find(params[:id])
        record_portal_read("patient_portal.subscription_receipt.read")
        receipts = Clinic::BillingReceipt.where(practice: portal_practice, patient: portal_patient, invoice: agreement.invoice)
        render json: { receipts: receipts.order(:id).map { |r| { id: r.id, kind: r.kind, issued_at: r.issued_at.iso8601, amount: r.payload["amount"], currency: r.payload["currency"] } } }
      end

      private

      def agreements
        Care::SubscriptionAgreement.where(practice: portal_practice, patient: portal_patient).includes(:invoice, :events)
      end

      def require_purchase_identity!
        raise Clinic::Authorization::Denied unless patient_portal_identity && !development_omni_preview?
      end

      def reject_authority_fields!
        fields = %w[patient_id practice_id actor_id amount price currency status balance snapshot invoice_id audit_metadata]
        raise ArgumentError, "Purchase details are owned by the server." if fields.any? { |field| params.key?(field) }
      end

      def require_local_subscription_boundary
        response.headers["Cache-Control"] = "no-store"
        head :not_found unless Rails.env.test? || DevelopmentAccess.allowed?(request)
      end
    end
  end
end
