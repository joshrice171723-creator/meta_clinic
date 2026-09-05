module Clinic
  module Billing
    class SubscriptionsController < Clinic::BaseController
      before_action -> { require_capability("billing.read") }
      rescue_from ArgumentError do |error|
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def index
        records = Care::SubscriptionAgreement.where(practice: current_practice).includes(:invoice, :events).order(id: :desc)
        records = records.where(patient_id: params[:patient_id]) if params[:patient_id].present?
        records = records.where("snapshot ->> 'package_id' = ?", params[:package_id].to_s) if params[:package_id].present?
        records = records.where("snapshot ->> 'family_id' = ?", params[:family_id].to_s) if params[:family_id].present?
        records = records.where("snapshot ->> 'tier' = ?", params[:tier].to_s) if params[:tier].present?
        records = records.where("snapshot -> 'selected_components' @> ?::jsonb", [{ service_id: requested_id!(params[:service_id], :service_id) }].to_json) if params[:service_id].present?
        items = records.limit(201).map { |r| Care::SubscriptionProjection.agreement(r) }
        items.select! { |r| r[:state] == params[:state] } if params[:state].present?
        ability = Ability.new(current_user, practice: current_practice)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "subscriptions.billing.read", outcome: :released)
        render json: { subscriptions: items.first(200), truncated: items.length > 200,
          capabilities: { review: ability.allowed_permission?("subscriptions.review"),
            reconcile: ability.allowed_permission?("billing.payment_record") || ability.allowed_permission?("billing.write"),
            fixture_processor: Rails.env.test? || DevelopmentAccess.allowed?(request) } }
      end

      def review
        render_agreement Care::SubscriptionPurchase.review(agreement: agreement, actor: current_user, approved: params[:approved], request_key: params[:request_key])
      end

      def reconcile
        head :not_found and return unless Rails.env.test? || DevelopmentAccess.allowed?(request)
        render_agreement SubscriptionPayments.deliver_fixture(agreement: agreement, actor: current_user, outcome: params[:outcome], request_key: params[:request_key])
      end

      def cancel
        require_capability_with_legacy("billing.payment_record", "billing.write")
        render_agreement Care::SubscriptionPurchase.cancel(agreement: agreement, actor: current_user, request_key: params[:request_key])
      end

      def refund
        head :not_found and return unless Rails.env.test? || DevelopmentAccess.allowed?(request)
        render_agreement SubscriptionPayments.refund(agreement: agreement, actor: current_user, amount: params[:amount], request_key: params[:request_key])
      end

      def reconcile_ledger
        render_agreement SubscriptionPayments.reconcile_ledger(agreement: agreement, actor: current_user, request_key: params[:request_key])
      end

      private

      def agreement
        Care::SubscriptionAgreement.where(practice: current_practice).find(params[:id])
      end

      def render_agreement(record)
        render json: Care::SubscriptionProjection.agreement(record)
      end
    end
  end
end
