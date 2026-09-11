module Staging
  class DemoClinic
    EMAIL = "staging-demo-user@example.test".freeze
    ORGANIZATION_NAME = "Meta Clinic Organization".freeze
    PRACTICE_NAME = "Meta Clinic".freeze
    LEGACY_ORGANIZATION_NAME = "APPly Staging Demo Organization [Synthetic]".freeze
    LEGACY_PRACTICE_NAME = "APPly Staging Demo Clinic [Synthetic]".freeze
    ROLE_CODE = "staging-demo-clinic-administrator".freeze
    PERMISSIONS = Development::TestClinic::DEFAULT_PERMISSIONS

    class Unavailable < StandardError; end

    def self.deployment?
      Rails.env.production? && ENV["APP_DEPLOYMENT_ENV"] == "staging"
    end

    def self.available_to?(user)
      return false unless identity?(user)

      membership = user.clinic_membership
      membership&.active? && managed_practice?(membership.practice)
    end

    def self.seed_authorization!
      raise Unavailable, "Staging demo clinic is unavailable." unless deployment?

      ApplicationRecord.transaction do
        lock_demo!
        role = RoleVersion.find_or_initialize_by(role_code: ROLE_CODE, version: 1)
        if role.new_record?
          role.save!
          PERMISSIONS.each do |action_code|
            permission = Permission.find_or_create_by!(action_code: action_code)
            RoleVersionPermission.create!(role_version: role, permission: permission)
          end
        end
        verify_administrator_role!(role)
      end
    end

    def self.prepare!(user)
      raise Unavailable, "Staging demo clinic is unavailable." unless identity?(user)

      ApplicationRecord.transaction do
        lock_demo!
        user.lock!
        raise Unavailable, "Staging demo identity changed." unless identity?(user)

        membership = user.clinic_membership
        if membership
          raise Unavailable, "Existing clinic assignment is not managed by this demo." unless
            membership.active? && managed_practice?(membership.practice)
          normalize_names!(membership.practice)
        else
          organization = Organization.find_by(name: ORGANIZATION_NAME) ||
            Organization.find_by(name: LEGACY_ORGANIZATION_NAME) || Organization.new(name: ORGANIZATION_NAME)
          organization.name = ORGANIZATION_NAME
          organization.save!
          practice = organization.practices.find_by(name: PRACTICE_NAME) ||
            organization.practices.find_by(name: LEGACY_PRACTICE_NAME) || organization.practices.new(name: PRACTICE_NAME)
          practice.name = PRACTICE_NAME
          practice.timezone = "America/Chicago" if practice.new_record?
          practice.save!
          membership = Clinic::Membership.create!(practice: practice, user: user)
        end

        ensure_administrator_grant!(membership)
        seed_dataset!(membership)
        membership
      end
    end

    def self.identity?(user)
      deployment? && user.is_a?(User) && user.active? && !user.admin? && user.email_address == EMAIL
    end
    private_class_method :identity?

    def self.managed_practice?(practice)
      [ PRACTICE_NAME, LEGACY_PRACTICE_NAME ].include?(practice&.name) &&
        [ ORGANIZATION_NAME, LEGACY_ORGANIZATION_NAME ].include?(practice&.organization&.name)
    end
    private_class_method :managed_practice?

    def self.normalize_names!(practice)
      practice.organization.update!(name: ORGANIZATION_NAME) unless practice.organization.name == ORGANIZATION_NAME
      practice.update!(name: PRACTICE_NAME) unless practice.name == PRACTICE_NAME
    end
    private_class_method :normalize_names!

    def self.lock_demo!
      ApplicationRecord.connection.execute("SELECT pg_advisory_xact_lock(hashtextextended('apply:staging-demo-clinic:v1', 0))")
    end
    private_class_method :lock_demo!

    def self.administrator_role!
      role = RoleVersion.find_by(role_code: ROLE_CODE, version: 1)
      raise Unavailable, "The staging demo administrator role is unavailable." unless role

      verify_administrator_role!(role)
    end
    private_class_method :administrator_role!

    def self.verify_administrator_role!(role)
      if role.permissions.pluck(:action_code).sort != PERMISSIONS.sort
        raise Unavailable, "The staging demo administrator role changed."
      end
      role
    end
    private_class_method :verify_administrator_role!

    def self.ensure_administrator_grant!(membership)
      role = administrator_role!
      grant = membership.role_grants.find_by(role_version: role, scope_kind: "practice", site_id: nil)
      if grant
        raise Unavailable, "The staging demo administrator grant was revoked." unless
          grant.effective_from <= Time.current && (grant.effective_until.nil? || grant.effective_until > Time.current)
      else
        membership.role_grants.create!(practice: membership.practice, role_version: role,
          scope_kind: "practice", effective_from: 1.minute.ago, revision: 1)
      end
    end
    private_class_method :ensure_administrator_grant!

    def self.seed_dataset!(membership)
      practice = membership.practice
      user = membership.user
      PaperTrail.request(whodunnit: user.id.to_s,
        controller_info: { causal_id: "staging-demo-clinic-seed-v1" }) do
        patients = [
          [ "DEMO-001", "Avery Example" ],
          [ "DEMO-002", "Jordan Example" ],
          [ "DEMO-003", "Morgan Example" ],
          [ "DEMO-004", "Riley Example" ]
        ].map do |reference, display_name|
          practice.patients.find_or_initialize_by(reference: reference).tap do |patient|
            patient.display_name = display_name
            patient.save!
          end
        end
        patients.each_with_index do |patient, index|
          patient.notes.create!(practice: practice, author: user,
            body: "Example chart note #{index + 1}; no clinical assertion or medical advice.") unless patient.notes.exists?
        end

        [
          [ "SYN-OFFICE-001", "Printer paper", 5, 18, "10000000-0000-4000-8000-000000000001" ],
          [ "SYN-OFFICE-002", "File folders", 10, 24, "10000000-0000-4000-8000-000000000002" ],
          [ "SYN-OFFICE-003", "Label rolls", 4, 9, "10000000-0000-4000-8000-000000000003" ]
        ].each do |sku, name, reorder_level, opening_quantity, request_key|
          item = practice.items.find_or_initialize_by(sku: sku)
          item.assign_attributes(name:, reorder_level:)
          item.save!
          item.adjust!(delta: opening_quantity, reason: "Opening stock", actor: user,
            request_key: request_key) unless item.stock_movements.exists?(request_key: request_key)
        end

        [
          [ "Alex Example", "Clinic coordinator" ],
          [ "Taylor Example", "Medical assistant" ]
        ].each do |display_name, job_title|
          member = practice.staff_members.find_or_initialize_by(job_title: job_title)
          member.display_name = display_name
          member.save!
        end
      end
    end
    private_class_method :seed_dataset!
  end
end
