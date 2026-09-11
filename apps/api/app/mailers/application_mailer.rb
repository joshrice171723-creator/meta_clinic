class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV.fetch("APP_EMAIL_FROM", "Meta Clinic <no-reply@localhost>") }
  layout "mailer"
end
