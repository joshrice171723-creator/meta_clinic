# This endpoint authenticates Stripe's signed raw body instead of a browser
# session. CSRF remains enabled on every patient and clinic mutation endpoint.
class StripeWebhooksController < ApplicationController
  skip_forgery_protection only: :create

  def create
    head :not_found and return unless Rails.env.development? || Rails.env.test?
    head :payload_too_large and return if request.content_length.to_i > 1_000_000
    raw_body = request.raw_post
    head :payload_too_large and return if raw_body.bytesize > 1_000_000
    secret = Clinic::Billing::StripeGateway.configuration["STRIPE_CONNECT_WEBHOOK_SECRET"]
    Clinic::Billing::ProcessorWebhookVerifier::Stripe.verify!(raw_body: raw_body, signature_header: request.headers["Stripe-Signature"], secret: secret)
    payload = JSON.parse(raw_body)
    raise Clinic::Billing::StripeGateway::Invalid unless payload.is_a?(Hash) && payload["livemode"] == false
    connection = Clinic::Billing::StripeConnection.find_by(account_id: payload["account"])
    if connection
      evidence = Clinic::Billing::IngestProcessorEvent.call(practice: connection.practice, raw_body: raw_body,
        signature_header: request.headers["Stripe-Signature"], secret: secret).event
    end
    result = Clinic::Billing::StripeInvoicePayments.webhook(payload: payload, gateway: Clinic::Billing::StripeGateway.new)
    result ||= Clinic::MembershipGrowth::PublicCheckout.webhook(payload: payload,
      gateway: Clinic::Billing::StripeGateway.new)
    result ||= Clinic::Billing::StripeMembershipPayments.webhook(raw_body: raw_body, signature_header: request.headers["Stripe-Signature"])
    evidence&.update!(processing_state: result ? "applied" : "needs_reconciliation")
    head :no_content
  rescue JSON::ParserError, Clinic::Billing::IngestProcessorEvent::InvalidPayload, Clinic::Billing::IngestProcessorEvent::ConflictingEvent,
    Clinic::Billing::ProcessorWebhookVerifier::InvalidSignature, Clinic::Billing::StripeGateway::Invalid, ActiveRecord::RecordNotFound
    head :bad_request
  rescue Clinic::Billing::StripeGateway::Unavailable, Clinic::Authorization::Denied, Clinic::AuditRecorder::Unavailable, ArgumentError
    # Let Stripe retry; never acknowledge a financial operation that did not apply.
    head :service_unavailable
  end
end
