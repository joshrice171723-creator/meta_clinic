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
    end
  end
end
