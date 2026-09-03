module Clinic
  module Billing
    class CashDrawersController < Clinic::ApiController
      before_action :authorize_drawer_access, only: %i[index create close]
      before_action -> { require_capability("billing.cash_reconcile") }, only: :reconcile

      def index
        sessions = current_practice.cash_drawer_sessions.includes(cash_tenders: { payment_event: :refund_events }).order(created_at: :desc)
        render json: { drawers: sessions.map { |session| CashDrawer.call(session) } }
      end

      def create
        input = parameter_hash!(:drawer, %i[site_id opening_float])
        site = current_practice.sites.find(requested_id!(input[:site_id], :site_id))
        session = current_practice.cash_drawer_sessions.create!(site: site, opened_by: current_user, opening_float: decimal_string!(input[:opening_float], field: :opening_float))
        render json: { drawer: CashDrawer.call(session) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        render json: { error: "This location already has an open cash drawer." }, status: :conflict
      end

      def close
        input = parameter_hash!(:drawer, %i[counted_cash discrepancy_explanation])
        session = current_practice.cash_drawer_sessions.lock.find(requested_id!(params[:id], :id))
        raise ArgumentError, "The cash drawer is already closed." unless session.status == "open"
        counted = BigDecimal(decimal_string!(input[:counted_cash], field: :counted_cash))
        expected = BigDecimal(CashDrawer.call(session).fetch(:expected_cash))
        session.update!(status: "closed", counted_cash: counted, discrepancy: counted - expected,
          discrepancy_explanation: input[:discrepancy_explanation].presence, closed_by: current_user, closed_at: Time.current)
        render json: { drawer: CashDrawer.call(session.reload) }
      end

      def reconcile
        input = parameter_hash!(:drawer, %i[reconciliation_note request_key])
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 100)
        session = current_practice.cash_drawer_sessions.lock.find(requested_id!(params[:id], :id))
        raise ArgumentError, "Only a closed cash drawer can be reconciled." unless session.status == "closed"
        raise ArgumentError, "A reconciliation note is required." unless input[:reconciliation_note].to_s.strip.present?
        if session.reconciliation_status == "reconciled"
          raise ArgumentError, "The cash drawer is already reconciled." unless session.reconciliation_request_key == request_key
          return render json: { drawer: CashDrawer.call(session) }
        end
        session.update!(reconciliation_status: "reconciled", reconciled_by: current_user, reconciled_at: Time.current,
          reconciliation_note: required_string!(input[:reconciliation_note], field: :reconciliation_note, maximum: 1000), reconciliation_request_key: request_key)
        render json: { drawer: CashDrawer.call(session.reload) }
      end

      private

      def authorize_drawer_access
        require_capability_with_legacy("billing.payment_record", "billing.write")
      rescue Clinic::Authorization::Denied, CanCan::AccessDenied
        require_capability("billing.cash_reconcile")
      end
    end
  end
end
