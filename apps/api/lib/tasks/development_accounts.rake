namespace :members do
  desc "Prepare the local clinic role accounts and retire duplicate permission-list accounts"
  task prepare_role_accounts: :environment do
    accounts = Development::RoleAccounts.prepare!
    accounts.each { |role_code, _user| puts Development::RoleAccounts::ACCOUNTS.fetch(role_code).fetch(:label) }
    puts "Named clinic accounts are ready."
  rescue Development::TestAccounts::Unavailable => error
    abort error.message
  end

  desc "Prepare only the assigned development patient using the existing Omni clinic"
  task prepare_patient_account: :environment do
    Development::TestAccounts.prepare_patient!
    puts "Assigned development patient is ready. Use Open assigned patient portal on the local login page."
  rescue Development::TestAccounts::Unavailable => error
    abort error.message
  end

  desc "Prepare reusable local-only synthetic test logins without resetting progress or passwords"
  task prepare_test_accounts: :environment do
    accounts = Development::TestAccounts.prepare!
    accounts.each { |user| puts "#{user.email_address}: #{user.active? ? 'available' : 'disabled'}" }
    puts "Use the named test selector on the loopback development login page. No passwords or invitations are issued."
  rescue Development::TestAccounts::Unavailable => error
    abort error.message
  end

  desc "Prepare the local-only Omni account and patient portal"
  task prepare_omni_account: :environment do
    user = Development::TestAccounts.prepare_omni!
    puts "#{user.email_address}: available"
    puts "Use Open Omni patient portal on the loopback development login page."
  rescue Development::TestAccounts::Unavailable => error
    abort error.message
  end
end
