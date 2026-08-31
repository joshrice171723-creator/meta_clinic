class DevelopmentAccess
  # Defense in depth for the optional, loopback-bound synthetic walkthrough.
  # Host/Origin checks are not a substitute for binding Rails to loopback.
  def self.allowed?(request)
    Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1" &&
      %w[127.0.0.1 ::1].include?(request.remote_ip) &&
      %w[localhost 127.0.0.1 ::1].include?(request.host) &&
      (request.origin == request.base_url || ((request.get? || request.head?) && request.origin.nil?))
  end
end
