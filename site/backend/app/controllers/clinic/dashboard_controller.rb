module Clinic
  class DashboardController < BaseController
    skip_before_action :require_clinic, only: :demo

    def show
      @patient_count = current_practice.patients.count if clinic_membership.patients_access?
      @low_stock = current_practice.items.where("quantity <= reorder_level").order(:name) if clinic_membership.inventory_access?
      @active_staff_count = current_practice.staff_members.where(active: true).count if clinic_membership.staff_access?
    end

    def demo
      return render_error("Not found.", :not_found) unless development_demo?
      DemoSetup.create!(current_user)
      redirect_to clinic_root_path, status: :see_other
    end
  end
end
