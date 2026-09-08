class WorkflowPropertyCase
  def isolated_login_contract(input)
    password = SecureRandom.hex(20)
    user = User.create!(email_address: "login-#{SecureRandom.hex(10)}@example.invalid", password: password)
    session = ActionDispatch::Integration::Session.new(Rails.application)
    session.host! "localhost:3000"
    headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    send_request = lambda do |method, values = {}|
      ActiveSupport::ExecutionContext.clear
      session.get "/api/csrf", headers: headers
      token = session.response.parsed_body.fetch("csrf_token")
      session.public_send(method, "/api/session", params: values, as: :json,
        headers: headers.merge("X-CSRF-Token" => token))
      session.response.status
    end
    valid = { email_address: user.email_address, password: password }
    baseline = send_request.call(:post, valid)
    raise "Valid independent login failed: #{baseline}" unless baseline == 200 && user.member_sessions.count == 1
    logout = send_request.call(:delete)
    raise "Independent logout failed: #{logout}" unless logout == 204 && user.member_sessions.count.zero?
    if input.fetch("mode") == "logout"
      status = send_request.call(:get)
    else
      user.update!(active: false) if input["mode"] == "inactive"
      values = valid.merge(input.fetch("changes", {}).symbolize_keys)
      status = send_request.call(:post, values)
    end
    { status: status, sessions: user.member_sessions.count }
  end
end
