module Development
  class RoleAccounts
    PRACTICE_NAME = "Local Clinic Workspace".freeze
    ORGANIZATION_NAME = "Local Clinic Organization".freeze
    RETIRED_ACCOUNT_PATTERN = "demo-%@example.invalid".freeze
    CLINIC_ADMINISTRATOR_PERMISSIONS = (
      TestClinic::DEFAULT_PERMISSIONS + %w[
        telehealth.read telehealth.prepare.read telehealth.prepare.verify
        telehealth.configure telehealth.reconcile
        workforce.admin workforce.settings workforce.badges
        workforce.timecards.read workforce.timecards.review workforce.timecards.approve
        workforce.schedule.read workforce.schedule.manage workforce.schedule.publish
        workforce.requests.review
        subscription_catalog.read subscription_catalog.write subscription_catalog.publish
      ]
    ).freeze

    ACCOUNTS = {
      "clinic-administrator" => {
        label: "Clinic Administrator",
        email: "clinic-administrator@local.invalid",
        admin: true,
        version: 3,
        permissions: CLINIC_ADMINISTRATOR_PERMISSIONS
      },
      "billing-accounting" => {
        label: "Billing & Accounting",
        email: "billing-accounting@local.invalid",
        permissions: %w[
          patients.read patients.identity.read billing.read billing.write billing.invoice_draft
          billing.invoice_post billing.payment_record billing.cash_reconcile documents.read
        ]
      },
      "front-desk-coordinator" => {
        label: "Front Desk Coordinator",
        email: "front-desk@local.invalid",
        permissions: %w[patients.identity.read appointments.read appointments.book appointments.status_transition]
      },
      "clinician" => {
        label: "Clinician",
        email: "clinician@local.invalid",
        version: 2,
        permissions: %w[
          patients.read patients.write appointments.read appointments.write appointments.book
          appointments.status_transition encounters.write encounters.assign_provider intake.write notes.read
          notes.write notes.sign observations.write documents.read
        ]
      },
      "clinical-staff" => {
        label: "Clinical Staff",
        email: "clinical-staff@local.invalid",
        version: 2,
        permissions: %w[
          patients.read patients.identity.read patients.write appointments.read appointments.write
          appointments.book appointments.status_transition encounters.write encounters.assign_provider intake.write
          notes.read observations.write inventory.read staff.read messages.write staff_messaging.read
          staff_messaging.send staff_messaging.create_conversation staff_messaging.acknowledge
          staff_messaging.transition staff_messaging.escalate staff_messaging.attach
        ]
      },
      "inventory-coordinator" => {
        label: "Inventory Coordinator",
        email: "inventory-coordinator@local.invalid",
        permissions: %w[
          inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold
          inventory.release inventory.count inventory.configure inventory.transfer inventory.put_away
          procurement.read procurement.create procurement.submit procurement.approve recall.read
          recall.lock recall.dispose controlled.read controlled.count controlled.certify
        ]
      },
      "records-viewer" => {
        label: "Records Viewer",
        email: "records-viewer@local.invalid",
        permissions: %w[
          patients.read patients.identity.read appointments.read encounters.assign_provider notes.read
          documents.read inventory.read staff.read billing.read
        ]
      }
    }.transform_values(&:freeze).freeze

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
