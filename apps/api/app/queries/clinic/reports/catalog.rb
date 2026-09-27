module Clinic
  module Reports
    module Catalog
      DAILY_VISITS_BY_STATE = {
        id: "daily_visits_by_state",
        revision: 1,
        purpose: "Count appointments by their current appointment state for a clinic-local day.",
        source: "clinic_appointments",
        date_basis: "starts_at",
        state_basis: "current appointment status at query time",
        population: "One appointment whose start falls on the selected local date; includes cancelled and no-show appointments.",
        exclusions: "Appointment requests, schedule holds, and encounter-derived calendar states are excluded."
      }.freeze
      DAILY_INVOICES = {
        id: "daily_invoices", revision: 1, source: "clinic_invoices and clinic_invoice_lines",
        date_basis: "invoice created_at", state_basis: "current invoice status at query time",
        population: "Invoices created on the clinic-local date.",
        exclusions: "Payments, refunds, credits and later invoice state changes are not cash received."
      }.freeze
      DAILY_STOCK_MOVEMENTS = {
        id: "daily_stock_movements", revision: 1, source: "clinic_inventory_entries",
        date_basis: "entry occurred_at", population: "Recorded office and pharmacy inventory entries on the clinic-local date, including migrated entries.",
        exclusions: "Quantities with different stock types or units are never combined."
      }.freeze
    end
  end
end
