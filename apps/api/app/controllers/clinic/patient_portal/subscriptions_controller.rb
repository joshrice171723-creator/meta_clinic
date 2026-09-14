module Clinic
  module PatientPortal
    class SubscriptionsController < BaseController
      before_action :require_local_subscription_boundary
      rescue_from Billing::StripeGateway::Unavailable do |error|
        render json: { error: error.message }, status: :service_unavailable
      end
      rescue_from Billing::StripeGateway::Invalid do |error|
        render json: { error: error.message }, status: :unprocessable_entity
      end
      rescue_from Clinic::Authorization::Denied do
        render json: { error: "Subscription access is unavailable." }, status: :forbidden
      end
      rescue_from Clinic::AuditRecorder::Unavailable do
        render json: { error: "Required audit evidence is unavailable." }, status: :service_unavailable
      end

      def index
        record_portal_read("patient_portal.subscriptions.read")
        checkout_available = Billing::StripeConnect.patient_checkout_available?(portal_practice)
        connection = Billing::StripeConnect.connection(portal_practice)
        local_simulator = Development::MembershipPaymentSimulator.connection?(connection)
        processor = if local_simulator
          "local_membership_simulator"
        elsif connection&.account_id
          "stripe"
        else
          "development_fixture"
        end
        payment = {
          checkout_available: checkout_available,
          next_step: checkout_available ? "checkout" : "clinic_follow_up"
        }
        payment.merge!(source: Development::MembershipPaymentSimulator::SOURCE,
          vendor_confirmed: false) if local_simulator
        render json: { catalog: Care::SubscriptionProjection.catalog(practice: portal_practice),
          subscriptions: Care::SubscriptionProjection.collection(agreements.order(id: :desc)).map { |r| r.except(:patient_id) },
          can_purchase: patient_portal_identity.present? && !development_omni_preview?,
          processor: processor,
          payment: payment }
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
        if agreement.snapshot["renewal"] == "automatic" || Billing::StripeConnect.connection(portal_practice)&.account_id
          url = Billing::StripeMembershipPayments.start(agreement: agreement, actor: current_user, request_key: params[:request_key])
          render json: { checkout_url: url, processor: "stripe", payment_state: "processing" }, status: :accepted
          return
        end
        intent = Billing::SubscriptionPayments.start(agreement: agreement, actor: current_user, request_key: params[:request_key])
        render json: { subscription: Care::SubscriptionProjection.agreement(agreement).except(:patient_id),
          processor: "development_fixture", payment_state: intent.state,
          message: "Payment arrangements are pending with the clinic. Your membership will activate after payment is verified." }, status: :accepted
      end

      def cancel
        require_purchase_identity!
        record = agreements.find(params[:id])
        checkout = Billing::StripeCheckout.find_by(practice: portal_practice, agreement: record)
        agreement = if checkout && record.snapshot["renewal"] == "automatic"
          Billing::StripeRecurringPayments.cancel(checkout: checkout, actor: current_user)
        else
          Care::SubscriptionPurchase.cancel(agreement: record, actor: current_user, request_key: params[:request_key])
        end
        render json: Care::SubscriptionProjection.agreement(agreement).except(:patient_id)
      end

      def reconcile
        require_purchase_identity!
        agreement = agreements.find(params[:id])
        checkout = Billing::StripeCheckout.find_by!(practice: portal_practice, agreement: agreement)
        record = if agreement.snapshot["renewal"] == "automatic"
          Billing::StripeRecurringPayments.recover_history(checkout: checkout, actor: current_user)
        else
          Billing::StripeMembershipPayments.reconcile(checkout: checkout, actor: current_user)
        end
        render json: Care::SubscriptionProjection.agreement(record).except(:patient_id)
      end

      def receipt
        agreement = agreements.find(params[:id])
        record_portal_read("patient_portal.subscription_receipt.read")
        checkout = Billing::StripeCheckout.find_by(practice: portal_practice, agreement: agreement)
        invoice_ids = [agreement.invoice_id]
        invoice_ids += Billing::StripeMembershipCycle.where(practice: portal_practice, checkout: checkout).pluck(:invoice_id) if checkout
        receipts = Clinic::BillingReceipt.where(practice: portal_practice, patient: portal_patient, invoice_id: invoice_ids)
        cycles = checkout ? Billing::StripeMembershipCycle.where(practice: portal_practice, checkout: checkout).index_by(&:invoice_id) : {}
        render json: { receipts: receipts.order(:id).map do |receipt|
          cycle = cycles[receipt.invoice_id]
          { id: receipt.id, invoice_id: receipt.invoice_id, kind: receipt.kind, issued_at: receipt.issued_at.iso8601,
            amount: receipt.payload["amount"], currency: receipt.payload["currency"],
            period_start: cycle&.period_start&.iso8601, period_end: cycle&.period_end&.iso8601 }
        end }
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
