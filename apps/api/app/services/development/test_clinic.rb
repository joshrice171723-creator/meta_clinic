module Development
  class TestClinic
    def self.create!(user)
      raise "Test clinics are only available in development and test." unless Rails.env.development? || Rails.env.test?

      User.transaction do
        user.lock!
        existing = Clinic::Membership.find_by(user: user)
        return existing if existing
        practice = Clinic::Practice.create!(name: "Test Clinic")
        membership = Clinic::Membership.create!(practice: practice, user: user, patients_access: true, inventory_access: true, staff_access: true, **Clinic::Inventory::Access::ACTIONS.to_h { |action| [ "inventory_#{action}", true ] })
        practice.patients.create!(display_name: "Sample Patient A", reference: "DEMO-001")
        practice.patients.create!(display_name: "Sample Patient B", reference: "DEMO-002")
        paper = practice.items.create!(name: "Printer paper", sku: "OFFICE-001", reorder_level: 5)
        paper.adjust!(delta: 3, reason: "Synthetic opening stock", actor: user, request_key: SecureRandom.uuid)
        folders = practice.items.create!(name: "File folders", sku: "OFFICE-002", reorder_level: 10)
        folders.adjust!(delta: 24, reason: "Synthetic opening stock", actor: user, request_key: SecureRandom.uuid)
        practice.staff_members.create!(display_name: "Alex Example", job_title: "Office coordinator")
        membership
      end
    end
  end
end
