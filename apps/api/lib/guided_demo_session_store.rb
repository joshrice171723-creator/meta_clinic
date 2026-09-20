require "action_dispatch/middleware/session/cookie_store"

# Keep tutorial authentication and CSRF state separate from ordinary app tabs.
class GuidedDemoSessionStore
  def initialize(app, options = {})
    @regular = ActionDispatch::Session::CookieStore.new(app, options)
    @demo = ActionDispatch::Session::CookieStore.new(app, options.merge(key: "_apply_demo_session"))
  end

  def call(env)
    if env["PATH_INFO"].to_s.start_with?("/api/demo-workspace/")
      env["PATH_INFO"] = env["PATH_INFO"].sub("/api/demo-workspace/", "/api/")
      env["HTTP_X_CLINIC_DEMO"] = "1"
    end
    demo = env["HTTP_X_CLINIC_DEMO"] == "1" || env["PATH_INFO"].to_s.start_with?("/api/demo/")
    (demo ? @demo : @regular).call(env)
  end
end
