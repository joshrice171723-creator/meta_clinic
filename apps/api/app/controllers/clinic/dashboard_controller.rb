module Clinic
  class DashboardController < BaseController
    def show
      patients_read = Authorization.allowed?(actor: current_user, practice: current_practice, action: "patients.read")
      inventory_read = Authorization.allowed?(actor: current_user, practice: current_practice, action: "inventory.read")
      staff_read = Authorization.allowed?(actor: current_user, practice: current_practice, action: "staff.read")
      render json: {
        practice: current_practice.as_json(only: %i[id name timezone]),
        capabilities: {
          patients_access: patients_read,
          inventory_access: inventory_read,
          staff_access: staff_read
        },
        inventory_actions: Inventory::Access::ACTIONS.to_h { |action| [ action, Authorization.allowed?(actor: current_user, practice: current_practice, action: "inventory.#{action}") ] },
        development_demo: !!development_demo?,
        patient_count: patients_read ? current_practice.patients.accessible_by(current_ability, :read).count : nil,
        active_staff_count: staff_read ? current_practice.staff_members.accessible_by(current_ability, :read).where(active: true).count : nil,
        low_stock: inventory_read ? current_practice.items.accessible_by(current_ability, :read).where("quantity <= reorder_level").order(:name).as_json(only: %i[id name quantity reorder_level]) : nil
      }
    end
  end
end
