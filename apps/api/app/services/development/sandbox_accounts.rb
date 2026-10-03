module Development
  # Select existing synthetic actors. This never creates users, identities or grants.
  class SandboxAccounts
    OPTIONS = {
      "admin" => [ "Admin", nil ],
      "manager" => [ "Manager", "clinic-administrator" ],
      "front_desk" => [ "Front Desk", "front-desk-coordinator" ],
      "clinician" => [ "Clinician", "clinician" ],
      "inventory" => [ "Inventory", "inventory-coordinator" ],
      "patient" => [ "Patient", nil ]
    }.freeze
    Account = Data.define(:key, :label, :user, :portal, :membership, :site, :patient)

    def self.validate_key!(key)
      raise ArgumentError, "Choose an available sandbox account." unless OPTIONS.key?(key)
      key
    end

    def self.prepared?(run)
      step = run.baseline.to_h["sandbox_preparation_step"]
      step.is_a?(Integer) && step >= SharedDemoLesson::SANDBOX_PREPARERS.length
    end

    def self.resolve(run, key)
      validate_key!(key)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? && run.active? &&
        DemoLessonCatalog.sandbox?(run.lesson_key) && prepared?(run) &&
        DemoLesson.exists?(lesson_key: run.lesson_key, practice_id: run.practice_id)
      practice = run.practice
      site = practice.sites.order(:id).first!
      label, role_code = OPTIONS.fetch(key)
      if key == "patient"
        identity = Clinic::PatientPortal::Identity.available.where(practice: practice)
          .joins(:patient, :user)
          .where(users: { active: true, email_address: "sandbox-member-#{practice.id}-1@example.test" })
          .where("clinic_patients.reference LIKE 'SBX-%'").order(:id).first!
        return Account.new(key:, label:, user: identity.user, portal: "patient", membership: nil,
          site: nil, patient: identity.patient)
      end
      memberships = practice.memberships.active.joins(:user).where(users: { active: true, admin: false }).order(:id)
      membership = if key == "admin"
        memberships.find_by!(user: run.operator_user)
      else
        memberships.where("users.email_address LIKE ?", "sandbox-staff-#{practice.id}-%@example.test")
          .find { |candidate| candidate.role_grants.active.joins(:role_version)
            .where(role_versions: { role_code: role_code }).any? { |grant| grant.applies_to?(site) } } ||
          raise(ActiveRecord::RecordNotFound)
      end
      raise ActiveRecord::RecordNotFound unless membership.role_grants.active.any? { |grant| grant.applies_to?(site) }
      Account.new(key:, label:, user: membership.user, portal: "clinic", membership:, site:, patient: nil)
    end

    def self.choices(run)
      OPTIONS.map do |key, (label, _)|
        account = resolve(run, key)
        { key:, label:, available: true, user_id: account.user.id, portal: account.portal }
      rescue ActiveRecord::RecordNotFound
        { key:, label:, available: false }
      end
    end

    def self.current(run, user)
      return unless user
      OPTIONS.each_key do |key|
        account = resolve(run, key)
        return account if account.user.id == user.id
      rescue ActiveRecord::RecordNotFound
        next
      end
      nil
    end

    def self.valid_user?(run, user)
      current(run, user).present?
    end

    def self.payload(account)
      { key: account.key, label: account.label, user_id: account.user.id, portal: account.portal,
        practice_id: account.membership&.practice_id || account.patient.practice_id,
        membership_id: account.membership&.id, site_id: account.site&.id, patient_id: account.patient&.id }
    end
  end
end
