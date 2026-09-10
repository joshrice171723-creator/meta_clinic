module Development
  class RoleAccounts
    PRACTICE_NAME = "Local Clinic Workspace".freeze
    ORGANIZATION_NAME = "Local Clinic Organization".freeze
    RETIRED_ACCOUNT_PATTERN = "demo-%@example.invalid".freeze
    ACCOUNT_EMAILS = {
      "clinic-administrator" => "clinic-administrator@local.invalid",
      "implementation-specialist" => "implementation-specialist@local.invalid",
      "billing-accounting" => "billing-accounting@local.invalid",
      "front-desk-coordinator" => "front-desk@local.invalid",
      "clinician" => "clinician@local.invalid",
      "clinical-staff" => "clinical-staff@local.invalid",
      "inventory-coordinator" => "inventory-coordinator@local.invalid",
      "records-viewer" => "records-viewer@local.invalid",
      "payroll-operator" => "payroll-operator@local.invalid"
    }.freeze
    ACCOUNTS = Clinic::Authorization::PilotRoleCatalog::DEFINITIONS.slice(*ACCOUNT_EMAILS.keys).to_h do |role_code, definition|
      [ role_code, definition.merge(email: ACCOUNT_EMAILS.fetch(role_code),
        admin: role_code == "clinic-administrator", version: Clinic::Authorization::PilotRoleCatalog::VERSION).freeze ]
    end.freeze

    def self.prepare!
      ensure_local!

      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('apply:role-accounts:v1', 0))")
        practice = workspace!
        accounts = ACCOUNTS.to_h do |role_code, definition|
          role = role_for!(role_code, definition.fetch(:permissions), version: definition.fetch(:version, 1))
          user = account_for!(practice, role, definition)
          [ role_code, user ]
        end
        PilotRehearsal.prepare!(practice: practice, accounts: accounts)
        retire_permission_accounts!
        accounts
      end
    end

    def self.reserved_email?(email)
      ACCOUNTS.values.any? { |account| account.fetch(:email) == email }
    end

    private_class_method def self.ensure_local!
      return if Rails.env.test? || (Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1")

      raise TestAccounts::Unavailable, "Named local accounts require explicitly enabled local access."
    end

    private_class_method def self.workspace!
      organization = Organization.find_or_create_by!(name: ORGANIZATION_NAME)
      Clinic::Practice.find_or_create_by!(organization: organization, name: PRACTICE_NAME) do |practice|
        practice.timezone = "America/Chicago"
      end
    end

    private_class_method def self.role_for!(role_code, permissions, version:)
      role = RoleVersion.find_or_create_by!(role_code: role_code, version: version)
      permissions.each do |action_code|
        permission = Permission.find_or_create_by!(action_code: action_code)
        RoleVersionPermission.find_or_create_by!(role_version: role, permission: permission)
      end
      role
    end

    private_class_method def self.account_for!(practice, role, definition)
      user = User.find_or_initialize_by(email_address: definition.fetch(:email))
      user.password = SecureRandom.hex(32) if user.new_record?
      user.admin = definition.fetch(:admin, false)
      user.active = true
      user.save!

      membership = Clinic::Membership.find_or_initialize_by(user: user)
      if membership.persisted? && membership.practice_id != practice.id
        raise TestAccounts::Unavailable, "A named account is assigned to another clinic. No accounts were changed."
      end

      permissions = definition.fetch(:permissions)
      membership.assign_attributes(
        practice: practice,
        active: true,
        patients_access: permissions.any? { |permission| permission.start_with?("patients.") },
        inventory_access: permissions.any? { |permission| permission.start_with?("inventory.") },
        staff_access: permissions.any? { |permission| permission.start_with?("staff.") },
        inventory_catalog: permissions.include?("inventory.catalog"),
        inventory_receive: permissions.include?("inventory.receive"),
        inventory_adjust: permissions.include?("inventory.adjust"),
        inventory_hold: permissions.include?("inventory.hold"),
        inventory_release: permissions.include?("inventory.release"),
        inventory_count: permissions.include?("inventory.count"),
        inventory_configure: permissions.include?("inventory.configure"),
        inventory_transfer: permissions.include?("inventory.transfer")
      )
      membership.save!

      membership.role_grants.joins(:role_version)
        .where(role_versions: { role_code: role.role_code })
        .where.not(role_version: role)
        .where(scope_kind: "practice", site_id: nil, revoked_at: nil)
        .find_each do |previous_grant|
          previous_grant.update!(revoked_at: Time.current, revision: previous_grant.revision + 1)
        end

      grant = membership.role_grants.find_or_initialize_by(role_version: role, scope_kind: "practice", site_id: nil)
      grant.assign_attributes(practice: practice, effective_from: grant.effective_from || Time.current,
        effective_until: nil, revoked_at: nil, revision: grant.revision || 1)
      grant.save!
      user
    end

    private_class_method def self.retire_permission_accounts!
      memberships = Clinic::Membership.joins(:user, role_grants: :role_version)
        .where("users.email_address LIKE ?", RETIRED_ACCOUNT_PATTERN)
        .where("role_versions.role_code LIKE ?", "test-%")
        .distinct

      memberships.find_each do |membership|
        membership.update!(active: false)
        membership.user.update!(active: false)
      end
    end
  end
end
