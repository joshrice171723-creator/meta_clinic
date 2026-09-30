module Clinic
  module Billing
    class SubscriptionsController < Clinic::BaseController
      before_action -> { require_capability_with_legacy("billing.read", "billing.write") }, only: :index
      before_action -> { require_capability("billing.read") }, except: :index
      rescue_from StripeGateway::Unavailable do |error|
        render json: { error: error.message }, status: :service_unavailable
      end
      rescue_from StripeGateway::Invalid do |error|
        render json: { error: error.message }, status: :unprocessable_entity
      end
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
        if params[:search].present?
          records = records.where("concat_ws(' ', snapshot ->> 'family_name', snapshot ->> 'package_name', snapshot ->> 'tier', snapshot -> 'selected_components') ILIKE ?",
            "%#{ApplicationRecord.sanitize_sql_like(params[:search].to_s.first(160))}%")
        end
        if params[:state].present?
          records = records.joins(<<~SQL)
            LEFT JOIN LATERAL (
              SELECT kind, details FROM clinic_subscription_events
              WHERE agreement_id = clinic_subscription_agreements.id
                AND practice_id = clinic_subscription_agreements.practice_id
              ORDER BY id DESC LIMIT 1
            ) subscription_latest ON true
          SQL
          records = records.where(<<~SQL, now: Time.current, state: params[:state].to_s)
            CASE
              WHEN subscription_latest.kind = 'active' AND (subscription_latest.details ->> 'ends_at')::timestamptz <= :now THEN 'expired'
              WHEN subscription_latest.kind = 'canceled' AND (subscription_latest.details ->> 'effective_at')::timestamptz > :now THEN 'active'
              ELSE COALESCE(subscription_latest.kind, 'pending_payment')
            END = :state
          SQL
        end
        items = Care::SubscriptionProjection.collection(records.limit(201))
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
        checkout = StripeCheckout.find_by(practice: current_practice, agreement: agreement)
        if checkout
          require_capability_with_legacy("billing.payment_record", "billing.write")
          record = if checkout.agreement.snapshot["renewal"] == "automatic"
            StripeRecurringPayments.recover_history(checkout: checkout, actor: current_user)
          else
            StripeMembershipPayments.reconcile(checkout: checkout, actor: current_user)
          end
          render_agreement record
          return
        end
        render_agreement SubscriptionPayments.deliver_fixture(agreement: agreement, actor: current_user, outcome: params[:outcome], request_key: params[:request_key])
      end

      def cancel
        require_capability_with_legacy("billing.payment_record", "billing.write")
        checkout = StripeCheckout.find_by(practice: current_practice, agreement: agreement)
        if checkout && checkout.agreement.snapshot["renewal"] == "automatic"
          render_agreement StripeRecurringPayments.cancel(checkout: checkout, actor: current_user)
          return
        end
        render_agreement Care::SubscriptionPurchase.cancel(agreement: agreement, actor: current_user, request_key: params[:request_key])
      end

      def refund
        head :not_found and return unless Rails.env.test? || DevelopmentAccess.allowed?(request)
        render_agreement SubscriptionPayments.refund(agreement: agreement, actor: current_user, amount: params[:amount], request_key: params[:request_key])
      end

      def reconcile_ledger
        render_agreement SubscriptionPayments.reconcile_ledger(agreement: agreement, actor: current_user, request_key: params[:request_key])
      end

      def entitlement
        input = parameter_hash!(:entitlement, %i[kind service_id quantity reversed_entry_id source_reference request_key])
        entry = Care::SubscriptionEntitlements.record(agreement: agreement, actor: current_user,
          kind: input[:kind], service_id: input[:service_id], quantity: input[:quantity],
          reversed_entry_id: input[:reversed_entry_id], source_reference: input[:source_reference],
          request_key: input[:request_key])
        render json: { entry: { id: entry.id, kind: entry.kind, service_id: entry.service_id,
          quantity: entry.quantity, reversed_entry_id: entry.reversed_entry_id,
          source_reference: entry.source_reference, occurred_at: entry.created_at.iso8601 },
          subscription: Care::SubscriptionProjection.agreement(agreement) }
      end

      def entitlements
        page = bounded_integer!(params.fetch(:page, 1), field: :page, min: 1, max: 1_000_000)
        records = Care::SubscriptionEntitlements.records(agreement)
        total = records.count
        entries = records.order(id: :desc).offset((page - 1) * 50).limit(50)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "subscriptions.entitlements.read", outcome: :released,
          resource_version_ref: "subscription:#{agreement.id}")
        render json: { subscription: Care::SubscriptionProjection.agreement(agreement),
          entries: entries.map { |entry| { id: entry.id, kind: entry.kind, service_id: entry.service_id,
            quantity: entry.quantity, reversed_entry_id: entry.reversed_entry_id,
            source_reference: entry.source_reference, occurred_at: entry.created_at.iso8601 } },
          page: page, per_page: 50, total_count: total, total_pages: (total / 50.0).ceil }
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
