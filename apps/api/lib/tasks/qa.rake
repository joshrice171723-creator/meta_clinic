namespace :qa do
  desc "Register a QA-only service token digest supplied from Secure Vault"
  task provision_token: :environment do
    user = User.find_by!(email_address: ENV.fetch("QA_OWNER_EMAIL"), active: true)
    raise "Platform owner required" unless user.platform_owner?
    digest = ENV.fetch("QA_TOKEN_SHA256")
    raise "Supply a SHA-256 digest from Secure Vault" unless digest.match?(/\A[0-9a-f]{64}\z/)
    Qa::ServiceToken.create!(user:, name: ENV.fetch("QA_TOKEN_NAME", "Muse scheduled QA"),
      recipient: ENV.fetch("QA_RECIPIENT", "muse"), digest:)
    puts "QA token digest registered. The raw token remains in Secure Vault."
  end
end
