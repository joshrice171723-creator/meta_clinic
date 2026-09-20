class GuidedDemoAccess
  # Hosted lessons run in a dedicated database, never the ordinary clinic store.
  def self.hosted?
    Rails.env.production? && ENV["APP_DEPLOYMENT_ENV"] == "staging" &&
      ENV["APP_GUIDED_DEMO"] == "1" && ENV["PGDATABASE"] == "apply_guided_demo"
  end

  def self.enabled?
    Rails.env.development? || Rails.env.test? || hosted?
  end

  def self.allowed?(request)
    DevelopmentAccess.allowed?(request) ||
      (hosted? && (request.origin == request.base_url || ((request.get? || request.head?) && request.origin.nil?)))
  end
end
