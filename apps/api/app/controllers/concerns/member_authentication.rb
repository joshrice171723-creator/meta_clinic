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

  def establish_session(user, workspace_owner: nil)
    replacement = User.transaction do
      current_member_session&.destroy! unless current_member_session&.id == workspace_owner&.id
      if session[:workspace_tools_owner_session_id] && !workspace_owner
        MemberSession.find_by(id: session[:workspace_tools_owner_session_id])&.destroy!
      end
      user.member_sessions.create!(expires_at: MemberSession::MAX_DURATION.from_now, last_activity_at: Time.current)
    end
    reset_session
    @current_member_session = replacement
    session[:member_session_id] = @current_member_session.id
    session[:workspace_tools_owner_session_id] = workspace_owner.id if workspace_owner
    # Seed the rotated cookie before the demo parent and iframe bootstrap in parallel.
    form_authenticity_token
  end
end
