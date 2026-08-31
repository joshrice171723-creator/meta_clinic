module Web
  class SessionsController < BaseController
    include MemberAuthentication
    rate_limit to: 10, within: 5.minutes, only: :create, name: "email",
      by: -> { Digest::SHA256.hexdigest(params[:email_address].to_s.strip.downcase) },
      with: -> { render_error("Too many sign-in attempts. Try again in five minutes.", :too_many_requests) }
    rate_limit to: 50, within: 5.minutes, only: %i[create development], name: "ip",
      with: -> { render_error("Too many sign-in attempts. Try again in five minutes.", :too_many_requests) }

    def new
    end

    def create
      user = authenticated_member
      unless user
        flash.now[:alert] = "Email or password is incorrect."
        return render :new, status: :unauthorized
      end
      destination = login_destination
      establish_session(user)
      redirect_to destination, status: :see_other
    end

    def development
      return render_error("Not found.", :not_found) unless DevelopmentAccess.allowed?(request)
      user = create_development_member
      destination = login_destination
      establish_session(user)
      session[:development_demo_user_id] = user.id
      redirect_to destination, status: :see_other
    end

    def destroy
      current_member_session&.destroy!
      reset_session
      redirect_to login_path, status: :see_other, notice: "You have been signed out."
    end

    private

    def login_destination
      case session.delete(:after_login)
      when "/clinic/pharmacy" then clinic_pharmacy_index_path
      when "/clinic" then clinic_root_path
      else portal_path
      end
    end
  end
end
