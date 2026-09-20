require "active_support/core_ext/integer/time"

Rails.application.configure do
  unless %w[staging production].include?(ENV.fetch("APP_DEPLOYMENT_ENV", "production"))
    raise "APP_DEPLOYMENT_ENV must be staging or production."
  end
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Turn on fragment caching in view templates.
  config.action_controller.perform_caching = true

  # Static CSS is served directly; revalidate instead of assuming digested names.
  config.public_file_server.headers = { "cache-control" => "public, max-age=0, must-revalidate" }

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Assume all access to the app is happening through a SSL-terminating reverse proxy.
  config.assume_ssl = true

  # Force all access to the app over SSL, use Strict-Transport-Security, and use secure cookies.
  config.force_ssl = true
  origin = URI(ENV.fetch("APP_SITE_ORIGIN"))
  unless origin.is_a?(URI::HTTPS) && origin.host.present? && origin.userinfo.nil? &&
      origin.query.nil? && origin.fragment.nil? && [ "", "/" ].include?(origin.path)
    raise "APP_SITE_ORIGIN must be one exact HTTPS origin, without credentials or a path."
  end
  config.hosts = [ origin.host ]
  config.cache_store = :memory_store

  # Skip http-to-https redirect for the default health check endpoint.
  # config.ssl_options = { redirect: { exclude: ->(request) { request.path == "/up" } } }

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Replace the default in-process memory cache store with a durable alternative.
  # config.cache_store = :mem_cache_store

  # Replace the default in-process and non-durable queuing backend for Active Job.
  # config.active_job.queue_adapter = :resque

  config.action_mailer.raise_delivery_errors = true
  # Public lessons simulate receipt and invitation delivery in their own database.
  if ENV["APP_DEPLOYMENT_ENV"] == "staging" && ENV["APP_GUIDED_DEMO"] == "1" &&
      ENV["PGDATABASE"] == "apply_guided_demo"
    config.action_mailer.perform_deliveries = false
  end
  config.action_mailer.default_url_options = {
    host: origin.host, protocol: origin.scheme, port: origin.port == 443 ? nil : origin.port
  }.compact
  if ENV["APP_SMTP_ADDRESS"].present?
    config.action_mailer.delivery_method = :smtp
    config.action_mailer.smtp_settings = {
      address: ENV.fetch("APP_SMTP_ADDRESS"),
      port: Integer(ENV.fetch("APP_SMTP_PORT", "587")),
      user_name: ENV["APP_SMTP_USERNAME"].presence,
      password: ENV["APP_SMTP_PASSWORD"].presence,
      authentication: ENV.fetch("APP_SMTP_AUTHENTICATION", "plain").to_sym,
      enable_starttls_auto: true
    }.compact
  end

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # Enable DNS rebinding protection and other `Host` header attacks.
  # config.hosts = [
  #   "example.com",     # Allow requests from example.com
  #   /.*\.example\.com/ # Allow requests from subdomains like `www.example.com`
  # ]
  #
  # Skip DNS rebinding protection for the default health check endpoint.
  # config.host_authorization = { exclude: ->(request) { request.path == "/up" } }
end
