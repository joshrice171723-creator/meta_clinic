# Run with APP_DEVELOPMENT_LOGIN=1: bin/rails runner script/check_session_csrf_bootstrap.rb RUN_ID
# Recreates two browser contexts bootstrapping from the same demo login cookie.
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
  run = Development::DemoRun.active.find(ARGV.fetch(0))
  raise "Use an already prepared sandbox" unless Development::SandboxAccounts.prepared?(run)
  login = browser.call
  [ ["visitor", {}], ["lesson", { lesson_key: "sandbox", account: "admin" }],
    ["run/view", { account: "admin", expected_run_id: run.id, expected_user_id: nil }] ].each do |action, params|
    login.get "/api/demo-workspace/csrf"
    login.post "/api/demo-workspace/demo/#{action}", params:,
      headers: { "Origin" => origin, "X-CSRF-Token" => login.response.parsed_body.fetch("csrf_token") }, as: :json
    raise "Demo #{action} failed: #{login.response.status}" unless login.response.successful?
  end

  parent, frame = browser.call, browser.call
  copy_cookies.call(login, parent)
  copy_cookies.call(login, frame)
  parent.get "/api/demo-workspace/csrf"
  parent_token = parent.response.parsed_body.fetch("csrf_token")
  frame.get "/api/demo-workspace/csrf"
  copy_cookies.call(frame, parent) # The frame's response wins the shared-cookie race.
  # Simulate another local checkout replacing the old, shared cookie names.
  %w[_apply_demo_session guided_clinic_demo_run guided_clinic_demo_visitor].each do |name|
    parent.cookies[name] = "another-local-runtime"
  end
  parent.patch "/api/demo-workspace/session", headers: { "Origin" => origin, "X-CSRF-Token" => parent_token }, as: :json
  raise "Competing bootstrap invalidated the heartbeat: #{parent.response.status}" unless parent.response.successful?
  parent.get "/api/demo-workspace/demo/run"
  raise "Another runtime replaced the demo binding" unless parent.response.parsed_body.fetch("active") &&
    parent.response.parsed_body.dig("run", "id").to_i == run.id
  parent.patch "/api/demo-workspace/session", headers: { "Origin" => origin }, as: :json
  raise "Missing CSRF token was accepted" unless parent.response.status == 422
  puts "PASS: competing bootstraps and other local cookies preserve the demo; missing tokens remain rejected."
  raise ActiveRecord::Rollback
end
