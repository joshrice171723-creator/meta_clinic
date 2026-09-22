require Rails.root.join("lib/guided_demo_session_store")

session_key = if Rails.env.development?
  "_apply_session_#{Integer(ENV.fetch("APPLY_WEB_PORT", "3000"), 10)}"
else
  "_apply_session"
end

Rails.application.config.session_store GuidedDemoSessionStore,
  key: session_key, same_site: :lax, secure: Rails.env.production?,
  httponly: true, expire_after: 12.hours
