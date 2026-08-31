module Clinic
  class DemoSetup
    def self.create!(user)
      User.transaction do
        user.lock!
        existing = Membership.find_by(user: user)
        return existing if existing
        practice = Practice.create!(name: "Example Clinic · Synthetic")
        membership = Membership.create!(practice: practice, user: user, patients_access: true, inventory_access: true, staff_access: true)
        practice.patients.create!(display_name: "Sample Patient A", reference: "DEMO-001")
        practice.patients.create!(display_name: "Sample Patient B", reference: "DEMO-002")
        practice.items.create!(name: "Printer paper", sku: "OFFICE-001", quantity: 3, reorder_level: 5)
        practice.items.create!(name: "File folders", sku: "OFFICE-002", quantity: 24, reorder_level: 10)
        practice.staff_members.create!(display_name: "Alex Example", job_title: "Office coordinator")
        membership
      end
    end
  end
end
