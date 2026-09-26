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
      patients.read patients.identity.read patients.write staff.read staff.write facilities.read facilities.write inventory.read
      inventory.catalog inventory.receive inventory.adjust inventory.hold
      inventory.release inventory.count inventory.configure appointments.write
      inventory.transfer inventory.put_away procurement.read procurement.create
      procurement.submit procurement.approve recall.read recall.lock recall.dispose
      controlled.read controlled.count controlled.certify
      appointments.read appointments.book appointments.status_transition
      encounters.write encounters.assign_provider intake.write notes.read notes.write notes.sign observations.write medication_administrations.write messages.write staff_messaging.read staff_messaging.send staff_messaging.create_conversation staff_messaging.acknowledge staff_messaging.transition staff_messaging.escalate staff_messaging.attach reminders.read reminders.write
      documents.read billing.write billing.read billing.invoice_draft billing.invoice_post billing.payment_record billing.catalog.manage roles.manage
    ].freeze

    # Omni's historical role versions reference DEFAULT_PERMISSIONS. New local
    # clinic capabilities must not mutate those already-granted definitions.
    SUBSCRIPTION_PERMISSIONS = %w[subscription_catalog.read subscription_catalog.write subscription_catalog.publish subscriptions.review].freeze

    def self.create!(user, permissions: DEFAULT_PERMISSIONS + SUBSCRIPTION_PERMISSIONS, practice: nil, seed_fixtures: true)
      raise "Test clinics require development or authorized workspace tools." unless
        GuidedDemoAccess.enabled? || DevelopmentAccess.public_staging_demo? || Current.workspace_tools_owner_session

      User.transaction do
        user.lock!
        existing = Clinic::Membership.find_by(user: user, practice: practice) if practice
        raise ActiveRecord::RecordNotFound if practice && existing.nil?
        existing ||= Clinic::Membership.find_by(user: user)
        if existing
          normalize_managed_patients!(existing.practice)
          return grant_access!(existing, permissions)
        end
        practice = Clinic::Practice.create!(name: "Test Clinic")
        membership = Clinic::Membership.create!(practice: practice, user: user)
        grant_access!(membership, permissions)
        if seed_fixtures
          MANAGED_PATIENTS.each do |fixture|
            patient = practice.patients.create!(display_name: fixture.fetch(:display_name), reference: fixture.fetch(:reference))
            create_reminder_defaults!(practice, patient)
          end
          paper = practice.items.create!(name: "Printer paper", sku: "OFFICE-001", reorder_level: 5)
          folders = practice.items.create!(name: "File folders", sku: "OFFICE-002", reorder_level: 10)
          if permissions.include?("inventory.adjust")
            paper.adjust!(delta: 3, reason: "Synthetic opening stock", actor: user, request_key: SecureRandom.uuid)
            folders.adjust!(delta: 24, reason: "Synthetic opening stock", actor: user, request_key: SecureRandom.uuid)
          end
          practice.staff_members.create!(display_name: "Alex Example", job_title: "Office coordinator")
        end
        membership
      end
    end

    def self.grant_access!(membership, permissions)
      return membership unless membership

      effective_from = membership.class.connection.select_value("SELECT CURRENT_TIMESTAMP")
      permissions.each do |action_code|
        role_code = "test-#{action_code.tr('.', '-')}"
        role = RoleVersion.find_or_create_by!(role_code: role_code, version: 1)
        permission = Permission.find_or_create_by!(action_code: action_code)
        RoleVersionPermission.find_or_create_by!(role_version: role, permission: permission)
        unless membership.role_grants.exists?(role_version: role, scope_kind: "practice")
          membership.role_grants.create!(practice: membership.practice, role_version: role, scope_kind: "practice",
            # Opening stock is posted in this transaction. Use its database
            # clock even when fixture preparation takes several minutes.
            effective_from: effective_from, revision: 1)
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
      practice.patients.find_each { |patient| create_reminder_defaults!(practice, patient) }
    end
    private_class_method :normalize_managed_patients!

    def self.create_reminder_defaults!(practice, patient)
      endpoint = practice.communication_endpoints.find_or_create_by!(patient: patient, endpoint_type: "portal", value_digest: Digest::SHA256.hexdigest("portal:#{practice.id}:#{patient.id}")) do |record|
        record.value = "portal:synthetic:#{patient.id}"
        record.label = "Private portal"
        record.verified_at = Time.current
      end
      preference = practice.communication_preferences.where(patient: patient, category: "operational", channel: "portal").order(version: :desc).first
      return if preference

      practice.communication_preferences.create!(patient: patient, category: "operational", channel: "portal", setting: "allowed", timezone: practice.timezone, effective_at: Time.current, source: "synthetic_seed", version: 1)
    end
    private_class_method :create_reminder_defaults!
  end
end
