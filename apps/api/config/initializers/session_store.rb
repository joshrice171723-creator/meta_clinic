require Rails.root.join("lib/guided_demo_session_store")

Rails.application.config.session_store GuidedDemoSessionStore,
  key: "_apply_session", same_site: :lax, secure: Rails.env.production?,
  httponly: true, expire_after: 12.hours
