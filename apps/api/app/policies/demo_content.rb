class DemoContent
  # Staging uses production runtime settings, but never production data or keys.
  # Missing/unknown deployment names fail closed; the local-login flag is unrelated.
  def self.enabled?
    Rails.env.development? || Rails.env.test? ||
      (Rails.env.production? && ENV["APP_DEPLOYMENT_ENV"] == "staging")
  end
end
