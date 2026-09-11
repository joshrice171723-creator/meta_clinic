abort "Only staging demo provisioning is supported" unless Staging::DemoClinic.deployment?
abort "Run provisioning as the database owner" unless ApplicationRecord.connection.select_value("SELECT current_user") == "apply_owner"
password = File.read("/run/secrets/demo-password").strip
abort "A strong generated password is required" if password.length < 32
ApplicationRecord.transaction do
  Clinic::Authorization::PilotRoleCatalog.install!
  Staging::DemoClinic.seed_authorization!
  user = User.find_by(email_address: Staging::DemoClinic::EMAIL)
  if user
    abort "Existing demo credentials differ; refusing to replace them" unless user.authenticate(password)
  else
    user = User.create!(email_address: Staging::DemoClinic::EMAIL, password: password)
  end
  Staging::DemoClinic.prepare!(user)
end
puts "Staging workspace provisioned; credentials were not printed."
