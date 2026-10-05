# Run: bin/rails runner script/check_session_csrf_bootstrap.rb
# Recreates two browser contexts bootstrapping from the same login cookie.
require "action_dispatch/testing/integration"
abort "Local development only" unless Rails.env.development?
config = ApplicationRecord.connection_db_config
abort "Use a local development database" unless config.database.match?(/\Aapply.*_development\z/) &&
  %w[127.0.0.1 localhost].include?(config.configuration_hash[:host])
raise "CSRF protection must be enabled" if ApplicationController.allow_forgery_protection == false

browser = lambda do
  ActionDispatch::Integration::Session.new(Rails.application).tap { |client| client.host! "127.0.0.1" }
end
copy_cookies = ->(source, target) { source.cookies.to_hash.each { |key, value| target.cookies[key] = value } }
origin = "http://127.0.0.1"

ApplicationRecord.transaction do
  password = SecureRandom.hex(24)
  user = User.create!(email_address: "session-check-#{SecureRandom.hex(8)}@example.test", password:, active: true)
  login = browser.call
  login.get "/api/csrf"
  login.post "/api/session", params: { email_address: user.email_address, password: },
    headers: { "Origin" => origin, "X-CSRF-Token" => login.response.parsed_body.fetch("csrf_token") }, as: :json
  raise "Sign-in failed" unless login.response.successful?

  parent, frame = browser.call, browser.call
  copy_cookies.call(login, parent)
  copy_cookies.call(login, frame)
  parent.get "/api/csrf"
  parent_token = parent.response.parsed_body.fetch("csrf_token")
  frame.get "/api/csrf"
  copy_cookies.call(frame, parent) # The frame's response wins the shared-cookie race.
  parent.patch "/api/session", headers: { "Origin" => origin, "X-CSRF-Token" => parent_token }, as: :json
  raise "Competing bootstrap invalidated the heartbeat: #{parent.response.status}" unless parent.response.successful?
  parent.patch "/api/session", headers: { "Origin" => origin }, as: :json
  raise "Missing CSRF token was accepted" unless parent.response.status == 422
  puts "PASS: competing CSRF bootstraps preserve the heartbeat; missing tokens remain rejected."
  raise ActiveRecord::Rollback
end
