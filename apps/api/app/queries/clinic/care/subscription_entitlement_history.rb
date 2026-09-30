module Clinic
  module Care
    class SubscriptionEntitlementHistory
      def self.page(agreement:, page:)
        sql = ApplicationRecord.sanitize_sql_array([<<~SQL, { practice: agreement.practice_id, agreement: agreement.id, offset: (page - 1) * 50 }])
          SELECT * FROM (
            SELECT id, created_at, 'fixed' AS ledger FROM clinic_subscription_entitlement_entries
              WHERE practice_id = :practice AND agreement_id = :agreement
            UNION ALL
            SELECT id, created_at, 'recurring' AS ledger FROM clinic_subscription_allowance_entries
              WHERE practice_id = :practice AND agreement_id = :agreement
          ) history ORDER BY created_at DESC, ledger DESC, id DESC LIMIT 50 OFFSET :offset
        SQL
        identities = ApplicationRecord.connection.select_all(sql).to_a
        fixed = SubscriptionEntitlements.records(agreement).where(id: identities.select { |row| row["ledger"] == "fixed" }.map { |row| row["id"] }).index_by(&:id)
        recurring = SubscriptionAllowances.records(agreement).where(id: identities.select { |row| row["ledger"] == "recurring" }.map { |row| row["id"] }).index_by(&:id)
        identities.map { |row| (row["ledger"] == "fixed" ? fixed : recurring).fetch(row["id"].to_i) }
      end

      def self.entry(entry)
        recurring = entry.is_a?(SubscriptionAllowanceEntry)
        { id: entry.id, kind: entry.kind, service_id: entry.service_id,
          quantity: entry.quantity, reversed_entry_id: entry.reversed_entry_id,
          source_reference: entry.source_reference, occurred_at: entry.created_at.iso8601,
          ledger: recurring ? "recurring" : "fixed",
          allowance_window: recurring ? SubscriptionAllowances.token(entry.attributes.symbolize_keys) : nil }
      end
    end
  end
end
