module Development
  class DemoAccount
    def self.create!
      raise "Demo accounts are only available in development and test." unless Rails.env.development? || Rails.env.test?

      User.transaction do
        account = User.create!(email_address: "demo-#{SecureRandom.uuid}@example.invalid", password: SecureRandom.hex(32), admin: false)
        Launch::Paperwork.assign_demo!(account)
        TestClinic.create!(account)
        account
      end
    end
  end
end
