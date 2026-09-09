module Clinic
  class DashboardController < BaseController
    def show
      ability = current_ability
      patients_read = ability.allowed_permission?("patients.read")
      inventory_read = ability.allowed_permission?("inventory.read")
      staff_read = ability.allowed_permission?("staff.read")
      render json: {
        practice: current_practice.as_json(only: %i[id name timezone]),
        capabilities: {
          patients_access: patients_read,
          inventory_access: inventory_read,
          staff_access: staff_read
        },
        inventory_actions: Inventory::Access::ACTIONS.to_h { |action| [ action, ability.allowed_permission?("inventory.#{action}") ] },
        development_demo: !!development_demo?,
        patient_count: patients_read ? current_practice.patients.accessible_by(current_ability, :read).count : nil,
        active_staff_count: staff_read ? current_practice.staff_members.accessible_by(current_ability, :read).where(active: true).count : nil,
        low_stock: inventory_read ? current_practice.items.accessible_by(current_ability, :read).where("quantity <= reorder_level").order(:name).as_json(only: %i[id name quantity reorder_level]) : nil
      }
    end
  end
end
