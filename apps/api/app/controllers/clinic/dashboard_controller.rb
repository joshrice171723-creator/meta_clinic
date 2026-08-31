module Clinic
  class DashboardController < BaseController
    def show
      render json: {
        practice: current_practice.as_json(only: %i[id name timezone]),
        capabilities: clinic_membership.as_json(only: %i[patients_access inventory_access staff_access]),
        inventory_actions: Inventory::Access::ACTIONS.to_h { |action| [ action, clinic_membership.public_send("inventory_#{action}?") ] },
        development_demo: !!development_demo?,
        patient_count: clinic_membership.patients_access? ? current_practice.patients.count : nil,
        active_staff_count: clinic_membership.staff_access? ? current_practice.staff_members.where(active: true).count : nil,
        low_stock: clinic_membership.inventory_access? ? current_practice.items.where("quantity <= reorder_level").order(:name).as_json(only: %i[id name quantity reorder_level]) : nil
      }
    end
  end
end
