class WorkflowPropertyCase
  def activation_contract(input)
    now = Current.business_time
    staff = @practice.staff_members.create!(display_name: "Activation property employee", job_title: "Coordinator")
    site = @practice.sites.create!(name: "Activation site", code: "ACTIVATION", status: "active",
      address_line1: "1 Example Way", city: "Example", state: "TX", postal_code: "75000", country: "US")
    role = RoleVersion.create!(role_code: "workforce-property-employee", version: 1)
    token = SecureRandom.urlsafe_base64(48)
    invitation = Clinic::Workforce::EmployeeInvitation.create!(practice: @practice, staff_member: staff,
      invited_by_membership: @membership, role_version: role, email_address: "activation-#{SecureRandom.hex(8)}@example.invalid",
      token_digest: Clinic::Workforce::EmployeeInvitation.digest(token), status: "pending", invited_at: now - 1.hour,
      expires_at: now + 1.hour, effective_from: now - 1.day, site_ids: [site.id])
    operation = input.fetch("operation")
    invitation.update!(expires_at: now - input.fetch("minutes", 0).minutes) if operation == "expired"
    password = operation == "password" ? input.fetch("password") : "Property-activation-2026!"
    confirmation = operation == "mismatch" ? "Different-confirmation-2026!" : password
    before_users = User.count
    before_employments = Clinic::Workforce::Employment.count
    error = nil
    replay_error = nil
    begin
      result = Clinic::Workforce::EmployeeOnboarding.activate!(token: token, password: password, password_confirmation: confirmation, now: now)
      if operation == "valid"
        begin
          Clinic::Workforce::EmployeeOnboarding.activate!(token: token, password: password, password_confirmation: confirmation, now: now)
        rescue Clinic::Workforce::EmployeeOnboarding::InvalidInvitation => failure
          replay_error = failure.class.name
        end
      end
    rescue Clinic::Workforce::EmployeeOnboarding::InvalidInvitation, Clinic::Workforce::EmployeeOnboarding::InvalidPassword => failure
      error = failure.class.name
    end
    { error: error, replay_error: replay_error, users: User.count - before_users,
      employments: Clinic::Workforce::Employment.count - before_employments, status: invitation.reload.status,
      token_cleared: invitation.token_digest.nil?, site_links: result&.dig(:employment)&.employment_sites&.count }
  end
end
