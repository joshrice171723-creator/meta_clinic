module Development
  class OmniAccess
    DEFAULT_PROFILE = "administrator".freeze
    ROLE_PREFIX = "development-omni-".freeze
    ROLE_VERSION = 4
    INVENTORY_DATABASE_PERMISSIONS = TestClinic::DEFAULT_PERMISSIONS.grep(
      /\A(?:inventory|procurement|recall|controlled)\./
    ).freeze
    PROFILES = {
      "administrator" => {
        label: "Administrator",
        description: "Administrator UI label; unrestricted local clinic workspace plus the APPly inquiry inbox.",
        admin: true,
        # Omni authorization is deliberately overridden in Ability. Keep the
        # original immutable role definition stable when new permissions are added.
        permissions: (TestClinic::DEFAULT_PERMISSIONS - [ "notes.read" ] + INVENTORY_DATABASE_PERMISSIONS).uniq
      },
      "clinician" => {
        label: "Clinician",
        description: "Clinician UI label for note and encounter rehearsal; local clinic access remains unrestricted.",
        admin: false,
        permissions: (%w[
          patients.read patients.write appointments.write encounters.write
          notes.write notes.sign observations.write documents.read
        ] + INVENTORY_DATABASE_PERMISSIONS).uniq
      },
      "staff" => {
        label: "Clinic staff",
        description: "Clinic staff UI label for intake and operations rehearsal; local clinic access remains unrestricted.",
        admin: false,
        permissions: (%w[
          patients.read patients.write appointments.write inventory.read
          staff.read messages.write
        ] + INVENTORY_DATABASE_PERMISSIONS).uniq
      },
      "inventory" => {
        label: "Inventory manager",
        description: "Inventory UI label for pharmacy and office workflows; local clinic access remains unrestricted.",
        admin: false,
        permissions: (%w[
          inventory.read inventory.catalog inventory.receive inventory.adjust
          inventory.hold inventory.release inventory.count inventory.configure
        ] + INVENTORY_DATABASE_PERMISSIONS).uniq
      },
      "reader" => {
        label: "Read-only",
        description: "Read-only UI label for access-state rehearsal; local clinic access remains unrestricted.",
        admin: false,
        permissions: (%w[patients.read documents.read inventory.read staff.read] + INVENTORY_DATABASE_PERMISSIONS).uniq
      },
      "client" => {
        label: "Client / portal",
        description: "Client / portal UI label; local clinic access remains unrestricted for iteration.",
        admin: false,
        permissions: INVENTORY_DATABASE_PERMISSIONS
      }
    }.transform_values { |profile| profile.merge(permissions: profile[:permissions].freeze).freeze }.freeze

    def self.prepare!(user)
      ensure_local!
      membership = TestClinic.create!(user, permissions: [])
      membership.practice.update!(name: "Omni Test Clinic") unless membership.practice.name == "Omni Test Clinic"
      ensure_roles!
      active = active_omni_grants(membership)
      if active.empty?
        switch_locked!(user, membership, DEFAULT_PROFILE)
        seed_workflow!(membership)
      elsif active.one? && (profile = profile_for(user))
        switch_locked!(user, membership, profile)
      else
        raise TestAccounts::Unavailable, "The Omni test identity has conflicting development grants. No access was changed."
      end
      BackendSamples.populate_practice!(practice: membership.practice, actor: user, label: "OMNI")
      retire_legacy_workflow!(membership)
      membership
    end

    def self.switch!(user, profile)
      ensure_local!
      profile = profile.to_s
      raise ArgumentError, "Choose a listed development view." unless PROFILES.key?(profile)
      unless user.email_address == TestAccounts::PROFILES.dig("omni", :email)
        raise TestAccounts::Unavailable, "Only OmniLogin can switch development views."
      end

      ApplicationRecord.transaction do
        locked_user = User.lock.find(user.id)
        membership = Clinic::Membership.lock.find_by!(user: locked_user)
        ensure_roles!
        unexpected = membership.role_grants.active.includes(:role_version).reject do |grant|
          grant.role_version.role_code.start_with?(ROLE_PREFIX)
        end
        if unexpected.any?
          raise TestAccounts::Unavailable, "The Omni test identity has an unexpected active grant. No access was changed."
        end
        switch_locked!(locked_user, membership, profile)
      end
      settings_for(user.reload)
    end

    def self.profile_for(user)
      return unless user
      membership = user.clinic_membership
      return unless membership&.active?
      grants = active_omni_grants(membership)
      return unless grants.one?

      profile = grants.first.role_version.role_code.delete_prefix(ROLE_PREFIX)
      settings = PROFILES[profile]
      profile if settings && user.admin? == settings[:admin]
    end

    def self.settings_for(user)
      profile = profile_for(user)
      raise TestAccounts::Unavailable, "The Omni development view could not be verified." unless profile

      {
        profile: profile,
        options: PROFILES.map do |id, settings|
          { id: id, label: settings[:label], description: settings[:description] }
        end
      }
    end

    def self.switch_locked!(user, membership, profile)
      current = profile_for(user)
      role = roles_by_profile.fetch(profile)
      active = active_omni_grants(membership)
      return membership if current == profile && active.one? && active.first.role_version_id == role.id

      now = Time.current
      PaperTrail.request(whodunnit: user.id.to_s,
        controller_info: { causal_id: "development-omni-switch" }) do
        active_omni_grants(membership).each do |grant|
          grant.update!(revoked_at: now, revision: grant.revision + 1)
          grant.events.create!(practice: membership.practice, grantor_membership: membership,
            grant_revision: grant.revision, event_kind: "development_view_revoked")
        end
        grant = membership.role_grants.find_or_initialize_by(practice: membership.practice,
          role_version: role, scope_kind: "practice")
        grant.assign_attributes(effective_from: now - 1.minute, effective_until: nil, revoked_at: nil,
          revision: grant.new_record? ? 1 : grant.revision + 1)
        grant.save!
        grant.events.create!(practice: membership.practice, grantor_membership: membership,
          grant_revision: grant.revision, event_kind: "development_view_granted")
        user.update!(admin: PROFILES.fetch(profile)[:admin])
        Clinic::AuditRecorder.record!(practice: membership.practice, actor: user,
          action_code: "development.omni.swap", outcome: :committed,
          resource_version_ref: "omni-view:#{profile}:grant:#{grant.id}")
      end
      membership
    end
    private_class_method :switch_locked!

    def self.ensure_roles!
      PROFILES.each do |profile, settings|
        role = RoleVersion.find_or_create_by!(role_code: "#{ROLE_PREFIX}#{profile}", version: ROLE_VERSION)
        settings[:permissions].each do |action_code|
          permission = Permission.find_or_create_by!(action_code: action_code)
          RoleVersionPermission.find_or_create_by!(role_version: role, permission: permission)
        end
      end
    end
    private_class_method :ensure_roles!

    def self.roles_by_profile
      RoleVersion.where(role_code: PROFILES.keys.map { |profile| "#{ROLE_PREFIX}#{profile}" }, version: ROLE_VERSION)
        .index_by { |role| role.role_code.delete_prefix(ROLE_PREFIX) }
    end
    private_class_method :roles_by_profile

    def self.active_omni_grants(membership)
      membership.role_grants.active.includes(:role_version)
        .select { |grant| grant.role_version.role_code.start_with?(ROLE_PREFIX) }
    end
    private_class_method :active_omni_grants

    def self.seed_workflow!(membership)
      practice = membership.practice
      user = membership.user
      site = practice.sites.find_or_create_by!(code: "MAIN")
      department = practice.departments.find_or_create_by!(code: "PRIMARY")
      clinician = practice.clinician_profiles.find_or_create_by!(membership: membership)
      clinician.assignments.find_or_create_by!(practice: practice, site: site,
        department: department, effective_from: Time.utc(2026, 1, 1))
      { "OFFICE-001" => 3, "OFFICE-002" => 24 }.each do |sku, quantity|
        item = practice.items.find_by!(sku: sku)
        item&.adjust!(delta: quantity, reason: "Synthetic Omni opening stock",
          actor: user, request_key: SecureRandom.uuid) unless item&.entries&.exists?
      end
    end
    private_class_method :seed_workflow!

    def self.retire_legacy_workflow!(membership)
      practice = membership.practice
      legacy_visit_type = practice.visit_types.find_by(code: "SYNTHETIC-REVIEW")
      return unless legacy_visit_type

      practice.encounters.joins(:appointment)
        .where(clinic_appointments: { visit_type_id: legacy_visit_type.id }).find_each do |encounter|
        appointment = encounter.appointment
        if encounter.status == "open"
          Clinic::Scheduling::CloseEncounter.call(
            encounter: encounter,
            actor: membership.user,
            ended_at: encounter.started_at + 30.minutes,
            request_key: "synthetic-legacy-close-#{encounter.id}"
          )
        end
        if appointment.status == "scheduled"
          Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: membership.user, to: "confirmed")
        end
        if appointment.status == "confirmed"
          Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: membership.user, to: "completed")
        end
      end
    end
    private_class_method :retire_legacy_workflow!

    def self.ensure_local!
      return if Rails.env.test? || (Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1")
      raise TestAccounts::Unavailable, "OmniLogin requires explicitly enabled local development."
    end
    private_class_method :ensure_local!
  end
end
