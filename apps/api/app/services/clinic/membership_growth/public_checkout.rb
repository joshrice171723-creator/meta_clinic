module Clinic
  module MembershipGrowth
    class PublicCheckout
      Result = Struct.new(:prospect, :checkout_url, :replayed, keyword_init: true)
      EVENT_TYPES = %w[
        checkout.session.completed
        checkout.session.async_payment_succeeded
        checkout.session.async_payment_failed
        checkout.session.expired
      ].freeze

      class << self
        def start(practice:, version_id:, selections:, display_name:, email_address:, phone_number:, source:,
          outreach_consent:, request_key:, gateway: Clinic::Billing::StripeGateway.new)
          raise Clinic::Billing::StripeGateway::Unavailable, "Stripe sandbox is not configured." unless
            Clinic::Billing::StripeGateway.configured?

          captured = CaptureProspect.call(practice:, version_id:, selections:, display_name:, email_address:,
            phone_number:, source:, outreach_consent:, request_key:, intent_type: "purchase")
          start_for_prospect(practice:, prospect: captured.prospect, replayed: captured.replayed, gateway:)
        end

        def start_for_account(practice:, prospect:, user:, gateway: Clinic::Billing::StripeGateway.new)
          raise Clinic::Billing::StripeGateway::Unavailable, "Stripe sandbox is not configured." unless
            Clinic::Billing::StripeGateway.configured?
          unless prospect.practice_id == practice.id && prospect.intent_type == "purchase" &&
              prospect.account_user_id == user.id && prospect.account_activated_at && user.active?
            raise ArgumentError, "Sign in to the membership account that started this enrollment."
          end

          start_for_prospect(practice:, prospect:, replayed: false, gateway:)
        end

        def start_for_prospect(practice:, prospect:, replayed:, gateway:)
          begin
            if prospect.agreement_id
              raise ArgumentError, "This membership purchase is already recorded. Use the patient portal or contact the clinic."
            end
            if prospect.account_user_id.nil? && User.exists?(email_address: prospect.email_address)
              raise ArgumentError, "An account already uses this email address. Sign in to the patient portal or contact the clinic."
            end
            raise ArgumentError, "This membership requires clinic review before payment. Ask the clinic to contact you." if
              prospect.selected_terms.fetch("eligibility_review")

            connection = Clinic::Billing::StripeConnect.connection(practice)
            raise ArgumentError, "The clinic must complete Stripe onboarding before accepting online payment." unless connection&.account_id
            platform_account_id = Clinic::Billing::StripeGateway.configuration["STRIPE_SANDBOX_ACCOUNT_ID"]
            platform_sandbox = Clinic::Billing::StripeGateway.platform_sandbox_account?(platform_account_id)
            checkout_account_id = platform_sandbox ? platform_account_id : connection.account_id
            unless platform_sandbox
              account = Clinic::Billing::StripeConnect.verified_account(connection, gateway)
              unless account.dig("configuration", "merchant", "capabilities", "card_payments", "status") == "active"
                raise ArgumentError, "The clinic is not ready to accept online card payments. Ask the clinic to contact you."
              end
            end

            configure_routing!(prospect, checkout_account_id, collect_platform_fee: !platform_sandbox)
            session = checkout_session(prospect, gateway)
            unless session["id"].to_s.match?(/\Acs_test_[a-zA-Z0-9]+\z/)
              raise Clinic::Billing::StripeGateway::Invalid, "Stripe returned an invalid checkout session."
            end
            prospect.with_lock do
              prospect.update!(checkout_session_id: session.fetch("id"), checkout_status: session.fetch("status"))
            end
            verify_session!(prospect, session)
            Result.new(prospect:, checkout_url: Clinic::Billing::StripeGateway.external_url(session.fetch("url"),
              host: "checkout.stripe.com"), replayed:)
          rescue ArgumentError
            prospect.with_lock { prospect.update!(status: "payment_failed") unless prospect.checkout_session_id }
            raise
          end
        end

        def webhook(payload:, gateway: Clinic::Billing::StripeGateway.new)
          return unless payload.is_a?(Hash) && payload["livemode"] == false && EVENT_TYPES.include?(payload["type"])

          session = payload.dig("data", "object")
          return unless session.is_a?(Hash)
          reference = session.dig("metadata", "apply_membership_prospect")
          return unless reference

          account_id = payload["account"].presence
          if account_id
            connection = Clinic::Billing::StripeConnection.find_by(account_id: account_id)
            return unless connection
            prospect = MembershipProspect.find_by(practice_id: connection.practice_id, checkout_reference: reference,
              checkout_account_id: account_id, intent_type: "purchase")
          else
            account_id = Clinic::Billing::StripeGateway.configuration["STRIPE_SANDBOX_ACCOUNT_ID"]
            return unless Clinic::Billing::StripeGateway.platform_sandbox_account?(account_id)
            prospect = MembershipProspect.find_by(checkout_reference: reference,
              checkout_account_id: account_id, intent_type: "purchase")
            connection = Clinic::Billing::StripeConnect.connection(prospect.practice) if prospect
          end
          return unless prospect
          return unless connection
          return prospect if prospect.recurring_authorized_at

          prospect.with_lock do
            prospect.update!(checkout_session_id: session.fetch("id")) unless prospect.checkout_session_id
          end
          verify_session!(prospect, session)
          prospect.with_lock { prospect.update!(checkout_status: session.fetch("status")) }

          if payload["type"] == "checkout.session.expired"
            mark_terminal!(prospect, "checkout_expired")
            return prospect
          end
          if payload["type"] == "checkout.session.async_payment_failed"
            fresh = gateway.request(:get, "/v1/checkout/sessions/#{prospect.checkout_session_id}",
              account: prospect.checkout_account_id)
            verify_session!(prospect, fresh)
            unless fresh["payment_status"] == "paid"
              mark_terminal!(prospect, "payment_failed") if fresh["status"].in?(%w[complete expired])
              return prospect
            end
            session = fresh
          end
          return prospect unless session["payment_status"] == "paid"

          ApplicationRecord.transaction do
            checkout = ensure_purchase_records!(prospect, connection)
            agreement = Clinic::Billing::StripeMembershipPayments.reconcile(
              checkout:, actor: connection.connected_by, gateway:, verified_webhook: true
            )
            raise Clinic::Billing::StripeGateway::Unavailable, "Paid membership is awaiting reconciliation." unless
              agreement.current_state == "active"
          end

          finish_onboarding!(prospect, connection.connected_by)
        end

        def verify_session!(prospect, session)
          terms = prospect.selected_terms
          expected_mode = terms.fetch("renewal") == "automatic" ? "subscription" : "payment"
          raise Clinic::Billing::StripeGateway::Invalid, "Stripe checkout does not match the storefront purchase." unless
            session["id"] == prospect.checkout_session_id && session["livemode"] == false &&
            session["mode"] == expected_mode && session["amount_total"] == amount_cents(terms) &&
            session["currency"] == terms.fetch("currency").downcase &&
            session.dig("metadata", "apply_membership_prospect") == prospect.checkout_reference &&
            session.dig("metadata", "apply_collection_intent") == prospect.checkout_reference
        end

        def fulfill_staff_subscription!(prospect:, connection:, subscription:, gateway:)
          ApplicationRecord.transaction do
            checkout = ensure_purchase_records!(prospect, connection,
              subscription_id: subscription.fetch("id"))
            agreement = Clinic::Billing::StripeRecurringPayments.sync(
              checkout:, actor: connection.connected_by, subscription:, gateway:
            )
            raise Clinic::Billing::StripeGateway::Unavailable,
              "Paid membership is awaiting reconciliation." unless agreement.current_state == "active"
          end

          finish_onboarding!(prospect, connection.connected_by)
        end

        private

        def configure_routing!(prospect, account_id, collect_platform_fee:)
          prospect.with_lock do
            if prospect.checkout_account_id && prospect.checkout_account_id != account_id
              raise Clinic::Billing::StripeGateway::Invalid, "Checkout routing no longer matches this clinic."
            end
            prospect.update!(
              status: "checkout_pending",
              checkout_reference: prospect.checkout_reference || "ci_#{SecureRandom.hex(16)}",
              checkout_account_id: account_id,
              checkout_mode: prospect.selected_terms.fetch("renewal") == "automatic" ? "subscription" : "payment",
              application_fee_cents: collect_platform_fee ? Clinic::Billing::StripeMembershipPayments.fee_cents(
                prospect.selected_terms.fetch("total")
              ) : 0,
              follow_up_state: prospect.follow_up_state == "not_required" ? "open" : prospect.follow_up_state,
              follow_up_due_at: prospect.follow_up_state == "not_required" ? Current.business_time : prospect.follow_up_due_at
            )
          end
        end

        def checkout_session(prospect, gateway)
          if prospect.checkout_session_id
            return gateway.request(:get, "/v1/checkout/sessions/#{prospect.checkout_session_id}",
              account: prospect.checkout_account_id)
          end
          gateway.request(:post, "/v1/checkout/sessions", account: prospect.checkout_account_id,
            key: prospect.checkout_reference, fields: checkout_fields(prospect))
        end

        def checkout_fields(prospect)
          terms = prospect.selected_terms
          fields = {
            "mode" => prospect.checkout_mode,
            "integration_identifier" => "apply_storefront_#{Digest::SHA256.hexdigest(prospect.checkout_reference).first(8).tr('0-9', 'a-j')}",
            "customer_email" => prospect.email_address,
            "line_items[0][price_data][currency]" => terms.fetch("currency").downcase,
            "line_items[0][price_data][unit_amount]" => amount_cents(terms).to_s,
            "line_items[0][price_data][product_data][name]" => "Clinic membership",
            "line_items[0][quantity]" => "1",
            "metadata[apply_membership_prospect]" => prospect.checkout_reference,
            "metadata[apply_collection_intent]" => prospect.checkout_reference,
            "success_url" => storefront_return_url(prospect, "return"),
            "cancel_url" => storefront_return_url(prospect, "cancel")
          }
          if prospect.checkout_mode == "subscription"
            raise ArgumentError, "Automatic memberships must renew monthly." unless
              terms.fetch("duration_unit") == "months" && terms.fetch("duration") == 1
            fields["line_items[0][price_data][recurring][interval]"] = "month"
            fields["line_items[0][price_data][recurring][interval_count]"] = "1"
            fields["subscription_data[application_fee_percent]"] = "2.1" if prospect.application_fee_cents.positive?
            fields["subscription_data[metadata][apply_collection_intent]"] = prospect.checkout_reference
          elsif prospect.application_fee_cents.positive?
            fields["payment_intent_data[application_fee_amount]"] = prospect.application_fee_cents.to_s
            fields["payment_intent_data[metadata][apply_collection_intent]"] = prospect.checkout_reference
          end
          fields
        end

        def storefront_return_url(prospect, outcome)
          slug = prospect.practice.public_membership_slug
          path = "/memberships/#{ERB::Util.url_encode(slug)}?payment=#{outcome}"
          path += "#handoff_token=#{ERB::Util.url_encode(prospect.checkout_reference)}" if outcome == "return"
          Clinic::Billing::StripeGateway.return_url(path)
        end

        def ensure_purchase_records!(prospect, connection, subscription_id: nil)
          ApplicationRecord.transaction do
            prospect.practice.lock!
            prospect.lock!
            if prospect.agreement_id
              next Clinic::Billing::StripeCheckout.find_by!(practice_id: prospect.practice_id,
                agreement_id: prospect.agreement_id)
            end

            actor_membership = clinic_membership!(prospect.practice, connection.connected_by)
            patient = prospect.practice.patients.create!(display_name: prospect.display_name,
              reference: "MEM-#{prospect.id.to_s(36).upcase}-#{SecureRandom.hex(4).upcase}")
            add_patient_contact!(patient, prospect, "email", prospect.email_address, true)
            add_patient_contact!(patient, prospect, "phone", prospect.phone_number, false) if prospect.phone_number.present?
            patient.create_communication_preference!(practice: prospect.practice, preferred_contact_method: "email",
              appointment_reminders_consent: false, general_communications_consent: false)

            terms = prospect.selected_terms
            invoice = prospect.practice.invoices.create!(patient:, currency: terms.fetch("currency"), status: "draft",
              rounding_policy_version: Clinic::Billing::Money::POLICY_VERSION)
            invoice.lines.create!(practice: prospect.practice, patient:, quantity: 1,
              unit_amount: terms.fetch("total"), posted_amount: terms.fetch("total"),
              description_snapshot: "#{terms.fetch('family_name')} / #{terms.fetch('package_name')}: " \
                "#{terms.fetch('selected_components').map { |component| component.fetch('name') }.join(', ')}")
            invoice.transition_to!("posted")
            agreement = Clinic::Care::SubscriptionAgreement.create!(practice: prospect.practice, patient:,
              package_version: prospect.subscription_version, invoice:, snapshot: terms,
              amount: terms.fetch("total"), currency: terms.fetch("currency"), request_key: "storefront:#{prospect.id}",
              request_digest: prospect.request_digest)
            agreement.events.create!(practice: prospect.practice, kind: "processing", request_key: "storefront:checkout")
            intent = Clinic::PaymentCollectionIntent.create!(practice: prospect.practice, patient:, invoice:,
              reference: prospect.checkout_reference, request_key: "storefront:#{prospect.id}", processor: "stripe",
              mode: "test", currency: agreement.currency, amount: agreement.amount, state: "processing")
            checkout = Clinic::Billing::StripeCheckout.create!(practice: prospect.practice, connection:, agreement:,
              collection_intent: intent, account_id: prospect.checkout_account_id,
              application_fee_cents: prospect.application_fee_cents,
              session_id: subscription_id ? nil : prospect.checkout_session_id,
              session_status: subscription_id ? nil : prospect.checkout_status, subscription_id:)
            prospect.update!(status: "payment_processing", patient:, agreement:, reviewed_by_membership: actor_membership,
              reviewed_at: Current.business_time)
            checkout
          end
        end

        def finish_onboarding!(prospect, actor)
          delivery = nil
          ApplicationRecord.transaction do
            prospect.lock!
            receipt = Clinic::BillingReceipt.where(practice_id: prospect.practice_id,
              invoice_id: prospect.agreement.invoice_id, kind: "subscription_payment").order(id: :desc).first!
            unless prospect.status_paid_onboarding? || prospect.status_converted?
              invitation = if prospect.account_user
                identity = Clinic::PatientPortal::Identity.create!(practice: prospect.practice, patient: prospect.patient,
                  user: prospect.account_user, status: :active, invited_at: prospect.account_activated_at,
                  activated_at: prospect.account_activated_at, accepted_terms_version: prospect.accepted_terms_version,
                  accepted_terms_at: prospect.accepted_terms_at)
                { identity:, token: nil, purpose: nil }
              else
                Clinic::PatientPortal::InviteIdentity.call(practice: prospect.practice,
                  patient: prospect.patient, actor:, email_address: prospect.email_address)
              end
              member = clinic_membership!(prospect.practice, actor)
              task = Clinic::ClinicalTask.create!(practice: prospect.practice, patient: prospect.patient,
                task_kind: "patient_call", state: "open", pool_code: "front_desk", due_at: 1.day.from_now,
                source_type: "manual", source_id: prospect.id, recorded_by_membership: member)
              prospect.update!(status: "paid_onboarding", portal_identity: invitation.fetch(:identity),
                receipt:, onboarding_task: task, invited_at: Current.business_time, paid_at: receipt.issued_at,
                portal_setup_token: invitation.fetch(:token),
                portal_setup_expires_at: invitation.fetch(:identity).invitation_expires_at,
                follow_up_state: "completed", follow_up_outcome: "payment_verified", follow_up_due_at: nil)
              delivery = invitation
              Clinic::AuditRecorder.record!(practice: prospect.practice, actor:,
                action_code: "membership_storefront.payment_onboarding", outcome: :committed,
                resource_version_ref: "membership_prospect:#{prospect.id}")
            end
          end
          deliver_receipt!(prospect.reload, actor, delivery)
          prospect
        end

        def deliver_receipt!(prospect, actor, invitation)
          prospect.with_lock do
            return if prospect.receipt_sent_at
            if prospect.account_user_id
              Clinic::MembershipReceiptMailer.receipt(prospect.id).deliver_now
            else
              invitation ||= Clinic::PatientPortal::InviteIdentity.call(practice: prospect.practice,
                patient: prospect.patient, actor:, email_address: prospect.email_address)
              Clinic::MembershipReceiptMailer.receipt(prospect.id, invitation.fetch(:token),
                invitation.fetch(:purpose)).deliver_now
            end
            prospect.update!(receipt_sent_at: Current.business_time)
          end
        end

        def add_patient_contact!(patient, prospect, type, value, preferred)
          patient.contacts.create!(practice: prospect.practice, contact_type: type, contact_value: value,
            preferred:, effective_from: Current.business_time)
        end

        def mark_terminal!(prospect, status)
          prospect.with_lock do
            return if prospect.status_paid_onboarding? || prospect.status_converted?
            prospect.update!(status:, follow_up_state: "open", follow_up_due_at: Current.business_time)
          end
          prospect
        end

        def clinic_membership!(practice, actor)
          practice.memberships.find_by!(user_id: actor.id)
        end

        def amount_cents(terms)
          (BigDecimal(terms.fetch("total").to_s) * 100).to_i
        end
      end
    end
  end
end
