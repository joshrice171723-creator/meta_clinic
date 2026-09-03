module Development
  class TestAccounts
    class Unavailable < StandardError; end

    PROFILES = {
      "omni" => { email: "omni@test.com", admin: true, active: true, omni: true },
      "admin" => { email: "test-admin@example.invalid", admin: true, active: true },
      "client-a" => { email: "test-client-a@example.invalid", admin: false, active: true, clinic: "Test Clinic A" },
      "client-b" => { email: "test-client-b@example.invalid", admin: false, active: true, clinic: "Test Clinic B" },
      "disabled" => { email: "test-disabled@example.invalid", admin: false, active: false }
    }.transform_values(&:freeze).freeze

    def self.reserved_email?(email)
      PROFILES.values.any? { |profile| profile[:email] == email }
    end

    def self.omni?(user)
      return false unless user.is_a?(User) &&
        user.email_address == PROFILES.fetch("omni")[:email]

      Rails.env.test? || (Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1")
    end

    def self.matches?(user, profile)
      settings = PROFILES[profile]
      return false unless settings && user.email_address == settings[:email]
      return OmniAccess.profile_for(user).present? if settings[:omni]

      user.admin? == settings[:admin]
    end

    def self.sign_in_account(profile)
      ensure_local!
      settings = PROFILES[profile]
      return unless settings && settings[:active]
      user = User.find_by(email_address: settings[:email])
      user if user && user.active? && matches?(user, profile) && user.authenticate(password_for(profile))
    end

    def self.prepare!
      ensure_local!
      User.transaction do
        # Serialize this fixture setup only; retries never reset passwords, access or progress.
        User.connection.execute("SELECT pg_advisory_xact_lock(20260831, 231)")
        PROFILES.map do |profile, settings|
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
      end
    end

    def self.ensure_local!
      return if Rails.env.test? || (Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1")
      raise Unavailable, "Named test accounts require explicitly enabled local development."
    end
    private_class_method :ensure_local!

    def self.password_for(profile)
      # A per-installation opaque verifier proves fixture ownership without a published
      # password or a second credential store. These identities cannot use normal login.
      Rails.application.key_generator.generate_key("apply/local-test-account/v1/#{profile}", 32).unpack1("H*")
    end
    private_class_method :password_for
  end
end
