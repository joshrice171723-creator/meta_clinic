Rails.application.config.session_store :cookie_store,
  key: "_apply_session", same_site: :lax, secure: Rails.env.production?,
  httponly: true, expire_after: 24.hours
