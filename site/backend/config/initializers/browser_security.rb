Rails.application.config.content_security_policy do |policy|
  policy.default_src :self
  policy.script_src :none
  policy.style_src :self
  policy.img_src :self
  policy.font_src :self
  policy.connect_src :self
  policy.object_src :none
  policy.base_uri :self
  policy.form_action :self
  policy.frame_ancestors :none
end
Rails.application.config.action_dispatch.default_headers.merge!(
  "Referrer-Policy" => "no-referrer",
  "Permissions-Policy" => "camera=(), microphone=(), geolocation=()"
)
