module Clinic
  module Reports
    module Catalog
      DAILY_VISITS_BY_STATE = {
        id: "daily_visits_by_state",
        revision: 2,
        purpose: "Count appointments by their current appointment state for a clinic-local day.",
        source: "clinic_appointments",
        date_basis: "starts_at",
        state_basis: "current appointment status at query time",
        population: "One appointment whose start falls on the selected local date; includes cancelled and no-show appointments.",
        exclusions: "Appointment requests, schedule holds, and encounter-derived calendar states are excluded."
      }.freeze
      DAILY_CASH_DRAWERS = {
        id: "daily_cash_drawers", revision: 3, source: "clinic_cash_drawer_sessions, clinic_cash_tenders and linked refunds",
        date_basis: "drawer created_at", population: "Sessions opened on the clinic-local date, plus a separate current worklist of earlier open or pending-reconciliation drawers.",
        exclusions: "Current session activity is not daily cash flow. No combined money total. Older reconciled drawers are excluded from the carryover worklist. Older drawers can lack a recorded currency; payment currencies do not establish the denomination of their opening float."
      }.freeze
      DAILY_INVOICES = {
        id: "daily_invoices", revision: 3, source: "clinic_invoices, clinic_invoice_lines, clinic_payment_allocations and clinic_credit_notes",
        date_basis: "invoice created_at", state_basis: "current invoice status at query time",
        population: "Invoices created on the clinic-local date.",
        exclusions: "Payments, refunds, credits and later invoice state changes are not cash received."
      }.freeze
      DAILY_STOCK_MOVEMENTS = {
        id: "daily_stock_movements", revision: 3, source: "clinic_inventory_entries",
        date_basis: "entry occurred_at", population: "Recorded office and pharmacy inventory entries on the clinic-local date, including migrated entries.",
        exclusions: "Quantities with different stock types or units are never combined."
      }.freeze
      DAILY_PAYMENT_ACTIVITY = {
        id: "daily_payment_activity", revision: 1, source: "clinic_payment_events and clinic_refund_events",
        date_basis: "event created_at", population: "Payments and refunds recorded on the clinic-local date, grouped by currency.",
        exclusions: "Payment amount is not invoice allocation or drawer cash. Refunds may relate to payments from another day. This is not a net cash or processor settlement report."
      }.freeze
      CURRENT_STOCK = {
        id: "current_stock", revision: 2,
        source: "clinic_pharmacy_batches, clinic_inventory_holds, clinic_pharmacy_products and clinic_items",
        date_basis: "current balances at query time; inventory_date controls expiry and availability",
        population: "Current filtered pharmacy positions and all office items.",
        exclusions: "Not historical balances. Office stock has no location or expiry tracking. Units remain separate."
      }.freeze
      OPEN_CLINICAL_WORK = {
        id: "open_clinical_work", revision: 2, source: "clinic_clinical_tasks",
        date_basis: "current state at query time", population: "Active clinical tasks in the selected clinic or site, grouped by current recorded owner, including unassigned work and owners whose access is inactive. Pending transfers do not change the recorded owner.",
        exclusions: "Completed and cancelled tasks, encounter follow-ups, messages, and billing work are excluded. This is not a historical daily census."
      }.freeze
    end
  end
end
