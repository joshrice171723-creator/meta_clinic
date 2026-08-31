module MemberAuthentication
  extend ActiveSupport::Concern

  private

  def authenticated_member
    email = params[:email_address].to_s.strip.downcase
    password = params[:password].to_s
    return if email.bytesize > 254 || password.bytesize > 72
    user = User.find_by(email_address: email)
    authenticated = user ? user.authenticate(password) : BCrypt::Password.new(User::DUMMY_PASSWORD_DIGEST).is_password?(password)
    user if user && authenticated && user.active? && !Development::TestAccounts.reserved_email?(email)
  end

  def establish_session(user)
    current_member_session&.destroy!
    reset_session
    @current_member_session = user.member_sessions.create!(expires_at: MemberSession::MAX_DURATION.from_now)
    session[:member_session_id] = @current_member_session.id
  end
end
