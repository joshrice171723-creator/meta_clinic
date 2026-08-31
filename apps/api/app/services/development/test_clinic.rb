module Development
  class TestClinic
    DEFAULT_PERMISSIONS = %w[
      patients.read patients.write staff.read staff.write inventory.read
      inventory.catalog inventory.receive inventory.adjust inventory.hold
      inventory.release inventory.count inventory.configure appointments.write
      encounters.write notes.write notes.sign observations.write messages.write
      documents.read billing.write roles.manage
    ].freeze

    def self.create!(user)
      raise "Test clinics are only available in development and test." unless Rails.env.development? || Rails.env.test?

      User.transaction do
        user.lock!
        existing = Clinic::Membership.find_by(user: user)
        return grant_default_access!(existing) if existing
        practice = Clinic::Practice.create!(name: "Test Clinic")
        membership = Clinic::Membership.create!(practice: practice, user: user)
        grant_default_access!(membership)
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

    def self.grant_default_access!(membership)
      return membership unless membership

      DEFAULT_PERMISSIONS.each do |action_code|
        role_code = "test-#{action_code.tr('.', '-')}"
        role = RoleVersion.find_or_create_by!(role_code: role_code, version: 1)
        permission = Permission.find_or_create_by!(action_code: action_code)
        RoleVersionPermission.find_or_create_by!(role_version: role, permission: permission)
        unless membership.role_grants.exists?(role_version: role, scope_kind: "practice")
          membership.role_grants.create!(practice: membership.practice, role_version: role, scope_kind: "practice",
            # TestClinic bootstraps inside the same transaction that later
            # posts opening stock; leave room for PostgreSQL's transaction
            # timestamp to observe the grant as effective.
            effective_from: 1.minute.ago, revision: 1)
        end
      end
      membership
    end
    private_class_method :grant_default_access!
  end
end
