namespace :members do
  desc "Prepare reusable local-only synthetic test logins without resetting progress or passwords"
  task prepare_test_accounts: :environment do
    accounts = Development::TestAccounts.prepare!
    accounts.each { |user| puts "#{user.email_address}: #{user.active? ? 'available' : 'disabled'}" }
    puts "Use the named test selector on the loopback development login page. No passwords or invitations are issued."
  rescue Development::TestAccounts::Unavailable => error
    abort error.message
  end
end
