# Run: bundle exec rails runner ../../ops/qa/check_workspace.rb (from apps/api).
# Scoped assertions, rolled back: no QA approvals or durable probe tasks.
raise "Development only" unless Rails.env.development?

snapshot = JSON.parse(Rails.root.join("config/qa_atlas.json").read)
tracker = Rails.root.join("../..", Qa::Atlas::SOURCE).read
parsed = Qa::Atlas.parse(tracker)
raise "Atlas scoring drift" unless parsed[:averages] == { build: 73.2, validation: 46.3, external: 0.0 }
raise "Missing source timestamp" unless parsed[:tracker_updated_at]
raise "Current inventory marked stale" unless Qa::Atlas.read[:inventory_status] == "current_repository"
raise "Incomplete inventory" unless snapshot.fetch("inventory").length == 81 && snapshot.fetch("inventory").map { |row| row.fetch("code") }.uniq.length == 81
begin
  Qa::Atlas.parse(tracker.sub("| 86% |", "| 101% |"))
  raise "Invalid percentages accepted"
rescue ArgumentError
end

original = Qa::Workspace.method(:build)
revision = "a" * 40
build = { "revision" => revision, "version" => "probe", "dirty" => true }
Qa::Workspace.define_singleton_method(:build) { build }
checks = 0
begin
  ActiveRecord::Base.transaction do
    owner = User.find_by!(email_address: "platform.owner@example.invalid")
    raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    Qa::ServiceToken.create!(user: owner, name: "Rolled-back build gate check", recipient: "muse", digest: Digest::SHA256.hexdigest(raw))
    browser = ActionDispatch::Integration::Session.new(Rails.application)
    browser.host!("127.0.0.1")
    headers = { "Authorization" => "Bearer #{raw}" }
    request = lambda do |path, body, expected|
      browser.post(path, params: body, headers:, as: :json)
      raise "#{path}: expected #{expected}, got #{browser.response.status}: #{browser.response.body}" unless browser.response.status == expected
      checks += 1
      JSON.parse(browser.response.body)
    end
    browser.get("/api/qa/atlas.json", headers:, as: :json)
    raise "Private Atlas unavailable" unless browser.response.status == 200 && JSON.parse(browser.response.body).fetch("inventory").length == 81
    browser.get("/api/qa/atlas.json", as: :json)
    raise "Anonymous Atlas exposure" unless browser.response.status == 401
    request.call("/api/qa/pin", { revision:, reason: "Rolled-back exact-build probe" }, 422)
    request.call("/api/qa/baseline", { revision: }, 422)
    task = { request_key: SecureRandom.uuid, kind: "retest", title: "Rolled-back probe", recipient: "muse", revision:, payload: {} }
    request.call("/api/qa/tasks", { task: }, 422)
    build["dirty"] = false
    request.call("/api/qa/pin", { revision:, reason: "Rolled-back exact-build probe" }, 200)
    id = request.call("/api/qa/tasks", { task: }, 201).fetch("id")
    request.call("/api/qa/tasks/#{id}/transition", { status: "claimed", run_id: "atlas-probe", revision: }, 200)
    build["dirty"] = true
    request.call("/api/qa/tasks/#{id}/transition", { status: "completed", run_id: "atlas-probe", revision:, result: {} }, 409)
    raise "Dirty build did not release claim" unless Qa::Task.find(id).status == "queued" && Qa::Event.where(kind: "run_aborted").exists?
    puts "Atlas parser, 81 unique rows, private access and #{checks} exact-build gate assertions passed; probe records rolled back."
    raise ActiveRecord::Rollback
  end
ensure
  Qa::Workspace.define_singleton_method(:build, original)
end
