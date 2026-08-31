module Clinic
  class DashboardController < BaseController
    def show
      @patient_count = current_practice.patients.count if clinic_membership.patients_access?
      @low_stock = current_practice.items.where("quantity <= reorder_level").order(:name) if clinic_membership.inventory_access?
      @active_staff_count = current_practice.staff_members.where(active: true).count if clinic_membership.staff_access?
    end
  end
end
