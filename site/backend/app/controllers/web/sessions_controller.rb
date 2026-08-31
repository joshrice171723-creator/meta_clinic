module Web
  class SessionsController < BaseController
    include MemberAuthentication
    rate_limit to: 10, within: 5.minutes, only: :create, name: "email",
      by: -> { Digest::SHA256.hexdigest(params[:email_address].to_s.strip.downcase) },
      with: -> { render_error("Too many sign-in attempts. Try again in five minutes.", :too_many_requests) }
    rate_limit to: 50, within: 5.minutes, only: %i[create development], name: "ip",
      with: -> { render_error("Too many sign-in attempts. Try again in five minutes.", :too_many_requests) }

    def new
      redirect_to portal_path if current_user
    end

    def create
      user = authenticated_member
      unless user
        flash.now[:alert] = "Email or password is incorrect."
        return render :new, status: :unauthorized
      end
      establish_session(user)
      redirect_to portal_path, status: :see_other
    end

    def development
      return render_error("Not found.", :not_found) unless DevelopmentAccess.allowed?(request)
      user = create_development_member
      establish_session(user)
      session[:development_demo_user_id] = user.id
      redirect_to portal_path, status: :see_other
    end

    def destroy
      current_member_session&.destroy!
      reset_session
      redirect_to login_path, status: :see_other, notice: "You have been signed out."
    end
  end
end
