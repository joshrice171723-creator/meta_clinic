module Development
  class TestAccounts
    class Unavailable < StandardError; end

    PROFILES = {
      "omni" => { email: "omni@test.com", admin: true, active: true, omni: true },
      "admin" => { email: "test-admin@example.invalid", admin: true, active: true },
      "client-a" => { email: "test-client-a@example.invalid", admin: false, active: true, clinic: "Test Clinic A" },
      "client-b" => { email: "test-client-b@example.invalid", admin: false, active: true, clinic: "Test Clinic B" },
      "patient" => { email: "synthetic-patient@example.invalid", admin: false, active: true, patient: true },
      "disabled" => { email: "test-disabled@example.invalid", admin: false, active: false }
    }.transform_values(&:freeze).freeze

    PREVIEW_ACCOUNTS = [
      { id: "employee-administrator", email: "admin@test.com", label: "Administrator", account_type: "employee",
        destination: "/clinic", role_code: "dev-seed-administrator" },
      { id: "employee-clinician", email: "clinician1@test.com", label: "Clinician", account_type: "employee",
        destination: "/clinic", role_code: "dev-seed-clinician" },
      { id: "employee-staff", email: "staff1@test.com", label: "Clinic staff", account_type: "employee",
        destination: "/clinic", role_code: "dev-seed-staff" },
      { id: "employee-front-desk", email: "frontdesk@test.com", label: "Front desk", account_type: "employee",
        destination: "/clinic", role_code: "dev-seed-front-desk" },
      { id: "employee-inventory", email: "inventory1@test.com", label: "Inventory coordinator", account_type: "employee",
        destination: "/clinic/inventory", role_code: "dev-seed-inventory" },
      { id: "employee-billing", email: "billing1@test.com", label: "Billing specialist", account_type: "employee",
        destination: "/clinic/billing", role_code: "dev-seed-billing" },
      { id: "employee-read-only", email: "reader@test.com", label: "Read-only employee", account_type: "employee",
        destination: "/clinic", role_code: "dev-seed-reader" },
      { id: "customer-client-a", profile: "client-a", label: "Customer A", account_type: "customer",
        destination: "/portal" },
      { id: "customer-client-b", profile: "client-b", label: "Customer B", account_type: "customer",
        destination: "/portal" },
      { id: "customer-patient", profile: "patient", label: "Patient account", account_type: "customer",
        destination: "/patient-portal" }
    ].map(&:freeze).freeze

    def self.reserved_email?(email)
      PROFILES.values.any? { |profile| profile[:email] == email } ||
        PREVIEW_ACCOUNTS.any? { |account| account[:email] == email }
    end

    def self.omni?(user)
      return false unless user.is_a?(User) &&
        user.email_address == PROFILES.fetch("omni")[:email]

      Rails.env.test? || (Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1")
    end

    def self.patient?(user)
      return false unless user.is_a?(User) && user.email_address == PROFILES.fetch("patient")[:email]

      Rails.env.test? || (Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1")
    end

    def self.matches?(user, profile)
      preview = PREVIEW_ACCOUNTS.find { |account| account.fetch(:id) == profile }
      return preview_user(preview, authenticate: false)&.id == user&.id if preview

      settings = PROFILES[profile]
      return false unless settings && user.email_address == settings[:email]
      return OmniAccess.profile_for(user).present? if settings[:omni]

      user.admin? == settings[:admin]
    end

    def self.sign_in_account(profile)
      ensure_local!
      preview = PREVIEW_ACCOUNTS.find { |account| account.fetch(:id) == profile }
      return preview_user(preview) if preview

      settings = PROFILES[profile]
      return unless settings && settings[:active]
      user = User.find_by(email_address: settings[:email])
      user if user && user.active? && matches?(user, profile) && user.authenticate(password_for(profile))
    end

    def self.preview_accounts
      ensure_local!
      PREVIEW_ACCOUNTS.filter_map do |account|
        user = preview_user(account, authenticate: false)
        next unless user

        account.slice(:id, :label, :account_type, :destination).merge(email_address: user.email_address)
      end
    end

    def self.preview_account_for(user)
      return unless user

      PREVIEW_ACCOUNTS.find { |account| preview_user(account, authenticate: false)&.id == user.id }
    end

    def self.prepare!
      ensure_local!
      User.transaction do
        # Serialize this fixture setup only; retries never reset passwords, access or progress.
        User.connection.execute("SELECT pg_advisory_xact_lock(20260831, 231)")
        accounts = PROFILES.map do |profile, settings|
          user = User.find_by(email_address: settings[:email])
          if user
            identity_matches = user.email_address == settings[:email] &&
              (settings[:omni] || user.admin? == settings[:admin])
            unless identity_matches && user.authenticate(password_for(profile))
              raise Unavailable, "A test identity conflicts with an existing account. No accounts were changed."
            end
          else
            user = User.create!(email_address: settings[:email], admin: settings[:admin],
              active: settings[:active], password: password_for(profile))
            if settings[:omni]
              Launch::Paperwork.assign_demo!(user)
              OmniAccess.prepare!(user)
            elsif settings[:clinic]
              Launch::Paperwork.assign_demo!(user)
              TestClinic.create!(user).practice.update!(name: settings[:clinic])
            end
          end
          OmniAccess.prepare!(user) if settings[:omni] && !user.previously_new_record?
          user
        end
        Development::PatientPortal.prepare!(User.find_by!(email_address: PROFILES.fetch("patient")[:email]))
        accounts
      end
    end

    def self.prepare_omni!
      ensure_local!
      settings = PROFILES.fetch("omni")
      User.transaction do
        user = User.lock.find_by(email_address: settings.fetch(:email))
        if user
          identity_matches = user.email_address == settings.fetch(:email) &&
            user.admin? == settings.fetch(:admin)
          unless identity_matches && user.authenticate(password_for("omni"))
            raise Unavailable, "A test identity conflicts with an existing account. No accounts were changed."
          end
        else
          user = User.create!(email_address: settings.fetch(:email), admin: settings.fetch(:admin),
            active: settings.fetch(:active), password: password_for("omni"))
          Launch::Paperwork.assign_demo!(user)
        end
        OmniAccess.prepare!(user)
        user
      end
    end

    def self.prepare_patient!
      ensure_local!
      User.transaction do
        User.connection.execute("SELECT pg_advisory_xact_lock(20260831, 231)")
        settings = PROFILES.fetch("patient")
        user = User.find_by(email_address: settings.fetch(:email))
        if user
          unless user.active? && matches?(user, "patient") && user.authenticate(password_for("patient"))
            raise Unavailable, "The assigned patient fixture conflicts with an existing account. No account was changed."
          end
        else
          user = User.create!(email_address: settings.fetch(:email), admin: false, active: true, password: password_for("patient"))
        end
        # Reuse the established Omni clinic. A missing independently invented
        # patient can be seeded without rebuilding inventory or historical roles.
        omni = User.find_by!(email_address: PROFILES.fetch("omni").fetch(:email))
        practice = omni.clinic_membership&.practice
        raise Unavailable, "Prepare the local Omni clinic first." unless practice
        unless practice.patients.where("reference LIKE ?", "SYN-OMNI-%").exists?
          practice.patients.create!(display_name: "Dev seed subscription patient", reference: "SYN-OMNI-SUBSCRIPTION")
        end
        Development::PatientPortal.prepare!(user)
        user
      end
    end

    def self.ensure_local!
      return if Rails.env.test? || (Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1")
      raise Unavailable, "Named test accounts require explicitly enabled local development."
    end
    private_class_method :ensure_local!

    def self.preview_user(account, authenticate: true)
      return unless account
      if account[:profile]
        profile = account.fetch(:profile)
        settings = PROFILES.fetch(profile)
        user = User.find_by(email_address: settings.fetch(:email))
        return unless user&.active? && user.admin? == settings.fetch(:admin)
        return unless !authenticate || user.authenticate(password_for(profile))

        return user
      end

      user = User.find_by(email_address: account.fetch(:email))
      membership = user&.clinic_membership
      return unless user&.active? && membership&.active?

      grant_matches = membership.role_grants.active.joins(:role_version)
        .exists?(role_versions: { role_code: account.fetch(:role_code) })
      user if grant_matches
    end
    private_class_method :preview_user

    def self.password_for(profile)
      # A per-installation opaque verifier proves fixture ownership without a published
      # password or a second credential store. These identities cannot use normal login.
      Rails.application.key_generator.generate_key("apply/local-test-account/v1/#{profile}", 32).unpack1("H*")
    end
    private_class_method :password_for
  end
end
