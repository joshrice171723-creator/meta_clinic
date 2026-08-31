module Api
  class SessionsController < ApplicationController
    before_action :require_member, only: :show
    rate_limit to: 10, within: 5.minutes, only: :create, name: "email",
      by: -> { Digest::SHA256.hexdigest(params[:email_address].to_s.strip.downcase) },
      with: -> { render json: { error: "Too many sign-in attempts. Please try again in five minutes." }, status: :too_many_requests }
    rate_limit to: 50, within: 5.minutes, only: %i[create development], name: "ip",
      with: -> { render json: { error: "Too many sign-in attempts. Please try again in five minutes." }, status: :too_many_requests }

    def csrf
      render json: { csrf_token: form_authenticity_token, development_login: DevelopmentAccess.allowed?(request) }
    end

    def show
      render json: { user: current_user.as_json(only: %i[id email_address admin]).merge(development_demo: !!development_demo?) }
    end

    def create
      email = params[:email_address].to_s.strip.downcase
      password = params[:password].to_s
      return invalid_credentials if email.bytesize > 254 || password.bytesize > 72

      user = User.find_by(email_address: email)
      authenticated = user ? user.authenticate(password) : BCrypt::Password.new(User::DUMMY_PASSWORD_DIGEST).is_password?(password)
      return invalid_credentials unless user && authenticated && user.active?

      establish_session(user)
      render json: { user: user.as_json(only: %i[id email_address admin]) }
    end

    def development
      return head :not_found unless DevelopmentAccess.allowed?(request)

      user = User.transaction do
        account = User.create!(email_address: "demo-#{SecureRandom.uuid}@example.invalid", password: SecureRandom.hex(32), admin: false)
        Paperwork.assign_demo!(account)
        account
      end
      establish_session(user)
      session[:development_demo_user_id] = user.id
      render json: { development_demo: true }, status: :created
    end

    def destroy
      current_member_session&.destroy!
      reset_session
      head :no_content
    end

    private

    def establish_session(user)
      current_member_session&.destroy!
      reset_session
      record = user.member_sessions.create!(expires_at: 24.hours.from_now)
      session[:member_session_id] = record.id
    end

    def invalid_credentials
      render json: { error: "Email or password is incorrect." }, status: :unauthorized
    end
  end
end
