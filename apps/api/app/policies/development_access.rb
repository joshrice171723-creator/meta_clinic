class DevelopmentAccess
  def self.enabled?
    (Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1") || GuidedDemoAccess.hosted? ||
      Current.workspace_tools_owner_session.present?
  end

  def self.hosted_owner_session(request)
    return unless Rails.env.production? && !GuidedDemoAccess.hosted?
    return unless request.origin == request.base_url || ((request.get? || request.head?) && request.origin.nil?)

    id = request.session[:workspace_tools_owner_session_id] || request.session[:member_session_id]
    record = MemberSession.includes(:user).find_by(id: id)
    user = record&.user
    record if record&.unexpired? && user.active? && (user.platform_owner? || user.admin?) &&
      !Development::TestAccounts.reserved_email?(user.email_address)
  end

  # Defense in depth for the optional, loopback-bound synthetic walkthrough.
  # Host/Origin checks are not a substitute for binding Rails to loopback.
  def self.allowed?(request)
    return true if hosted_owner_session(request)

    if GuidedDemoAccess.hosted?
      return request.origin == request.base_url || ((request.get? || request.head?) && request.origin.nil?)
    end

    Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1" &&
      %w[127.0.0.1 ::1].include?(request.remote_ip) &&
      %w[localhost 127.0.0.1 ::1].include?(request.host) &&
      (request.origin == request.base_url || ((request.get? || request.head?) && request.origin.nil?))
  end
end
