module Clinic
  module Billing
    class ManageCashDrawer
      def self.authorize!(practice:, actor:)
        ability = Ability.new(actor, practice:)
        action = %w[billing.payment_record billing.write billing.cash_reconcile].find { |code| ability.allowed_permission?(code) }
        Clinic::Authorization.authorize!(practice:, actor:, action: action || "billing.cash_reconcile")
      end

      def self.open(practice:, actor:, site:, currency:, opening_float:)
        authorize!(practice:, actor:)
        site = practice.sites.find(site.id)
        practice.cash_drawer_sessions.transaction(requires_new: true) do
          site.lock!
          raise ActiveRecord::RecordNotUnique, "This location already has an open cash drawer." if practice.cash_drawer_sessions.exists?(site:, status: "open")
          practice.cash_drawer_sessions.create!(site:, opened_by: actor, currency:, opening_float:)
        end
      end

      def self.close(practice:, actor:, session:, counted_cash:, discrepancy_explanation:, request_key:)
        authorize!(practice:, actor:)
        session = practice.cash_drawer_sessions.find(session.id)
        counted = BigDecimal(counted_cash.to_s)
        explanation = discrepancy_explanation.to_s.strip.presence
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "billing.cash_drawer.close", request_key:,
          payload: { cash_drawer_session_id: session.id, counted_cash: counted.to_s("F"), discrepancy_explanation: explanation },
          resource: session, authorization: -> { authorize!(practice:, actor:) },
          authorization_action: "billing.payment_record", result_resource: ->(drawer) { drawer },
          resource_resolver: ->(practice:, receipt:) { practice.cash_drawer_sessions.find_by(id: receipt.resource_id) }
        ) do
          session.with_lock do
            raise ArgumentError, "The cash drawer is already closed." unless session.status == "open"
            expected = BigDecimal(CashDrawer.call(session).fetch(:expected_cash))
            session.update!(status: "closed", counted_cash: counted, discrepancy: counted - expected,
              discrepancy_explanation: explanation, closed_by: actor, closed_at: Time.current)
          end
          session
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?
        outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed cash drawer close is unavailable.")
      end
    end
  end
end
