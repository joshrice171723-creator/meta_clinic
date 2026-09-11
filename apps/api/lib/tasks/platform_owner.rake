namespace :platform do
  namespace :owner do
    desc "Email the one-time platform-owner invitation"
    task invite: :environment do
      email = ENV.fetch("APP_PLATFORM_OWNER_EMAIL")
      Platform::IssueOwnerInvitation.call(email_address: email)
      puts "Platform owner invitation delivered."
    end
  end
end
