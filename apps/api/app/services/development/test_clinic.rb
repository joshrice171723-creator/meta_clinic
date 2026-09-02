module Development
  class TestClinic
    MANAGED_PATIENTS = [
      {
        display_name: "SYN_Mercer, Alex",
        reference: "SYN-BASE-001",
        legacy_display_names: [ "Sample Patient A", "Sample Patient Aa" ],
        legacy_reference: "DEMO-001"
      },
      {
        display_name: "SYN_Vale, Briar",
        reference: "SYN-BASE-002",
        legacy_display_names: [ "Sample Patient B" ],
        legacy_reference: "DEMO-002"
      }
    ].freeze
    DEFAULT_PERMISSIONS = %w[
      patients.read patients.write staff.read staff.write inventory.read
      inventory.catalog inventory.receive inventory.adjust inventory.hold
      inventory.release inventory.count inventory.configure appointments.write
      inventory.transfer inventory.put_away procurement.read procurement.create
      procurement.submit procurement.approve recall.read recall.lock recall.dispose
      controlled.read controlled.count controlled.certify
      encounters.write notes.read notes.write notes.sign observations.write messages.write
      documents.read billing.write roles.manage
    ].freeze

    def self.create!(user, permissions: DEFAULT_PERMISSIONS)
      raise "Test clinics are only available in development and test." unless Rails.env.development? || Rails.env.test?

      User.transaction do
        user.lock!
        existing = Clinic::Membership.find_by(user: user)
        if existing
          normalize_managed_patients!(existing.practice)
          return grant_access!(existing, permissions)
        end
        practice = Clinic::Practice.create!(name: "Test Clinic")
        membership = Clinic::Membership.create!(practice: practice, user: user)
        grant_access!(membership, permissions)
        MANAGED_PATIENTS.each do |fixture|
          practice.patients.create!(display_name: fixture.fetch(:display_name), reference: fixture.fetch(:reference))
        end
        paper = practice.items.create!(name: "Printer paper", sku: "OFFICE-001", reorder_level: 5)
        folders = practice.items.create!(name: "File folders", sku: "OFFICE-002", reorder_level: 10)
        if permissions.include?("inventory.adjust")
          paper.adjust!(delta: 3, reason: "Synthetic opening stock", actor: user, request_key: SecureRandom.uuid)
          folders.adjust!(delta: 24, reason: "Synthetic opening stock", actor: user, request_key: SecureRandom.uuid)
        end
        practice.staff_members.create!(display_name: "Alex Example", job_title: "Office coordinator")
        membership
      end
    end

    def self.grant_access!(membership, permissions)
      return membership unless membership

      permissions.each do |action_code|
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
    private_class_method :grant_access!

    def self.normalize_managed_patients!(practice)
      MANAGED_PATIENTS.each do |fixture|
        legacy = practice.patients.find_by(reference: fixture.fetch(:legacy_reference))
        next unless legacy && fixture.fetch(:legacy_display_names).include?(legacy.display_name)
        next if practice.patients.where.not(id: legacy.id).exists?(reference: fixture.fetch(:reference))

        legacy.update!(display_name: fixture.fetch(:display_name), reference: fixture.fetch(:reference))
      end
    end
    private_class_method :normalize_managed_patients!
  end
end
