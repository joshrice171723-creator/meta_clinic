module Development
  class DemoAccount
    def self.create!
      raise "Demo accounts are only available in development and test." unless Rails.env.development? || Rails.env.test?

      RoleAccounts.prepare!.fetch("clinic-administrator")
    end
  end
end
