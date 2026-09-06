module Clinic
  module Care
    class SubscriptionPurchase
      def self.checkout(identity:, actor:, version_id:, selections:, request_key:)
        identity = Clinic::PatientPortal::Identity.available.find_by!(id: identity.id, user_id: actor.id)
        practice = identity.practice
        key = SubscriptionDefinition.request_key(request_key)
        selection_ids = selections.is_a?(Array) ? selections.map(&:to_s).sort : selections
        digest = SubscriptionDefinition.fingerprint({ "version_id" => version_id.to_s, "selections" => selection_ids })
        ApplicationRecord.transaction do
          practice.lock!
          identity.lock!
          raise ActiveRecord::RecordNotFound unless identity.active? && actor.reload.active?
          patient = practice.patients.lock.find(identity.patient_id)
          previous = SubscriptionAgreement.where(practice: practice, patient: patient).find_by(request_key: key)
          if previous
            raise ArgumentError, "Request key was already used for a different purchase." unless previous.request_digest == digest
            next previous
          end
          version = SubscriptionVersion.where(practice: practice).find(version_id)
          package = SubscriptionPackage.where(practice: practice).lock.find(version.package_id)
          raise ArgumentError, "This package changed or is no longer available. Review the current catalog." if package.retired || package.family.retired || package.published_version_id != version.id
          snapshot = SubscriptionDefinition.select(version.snapshot, selections)
          now = Time.current
          raise ArgumentError, "This package is outside its purchase window." if
            (snapshot["available_from"] && Time.iso8601(snapshot["available_from"]) > now) ||
            (snapshot["available_until"] && Time.iso8601(snapshot["available_until"]) <= now)
          purchases = SubscriptionAgreement.where(practice: practice, patient: patient).joins(:package_version).where(clinic_subscription_versions: { package_id: package.id })
          occupied = purchases.count { |purchase| !%w[canceled expired review_declined refunded].include?(purchase.current_state) }
          raise ArgumentError, "You have reached this package's purchase limit." if occupied >= snapshot["max_per_patient"]
          invoice = practice.invoices.create!(patient: patient, currency: snapshot["currency"], status: "draft", rounding_policy_version: Clinic::Billing::Money::POLICY_VERSION)
          invoice.lines.create!(practice: practice, patient: patient, quantity: 1,
            unit_amount: snapshot["total"], posted_amount: snapshot["total"],
            description_snapshot: "#{snapshot['family_name']} / #{snapshot['package_name']} (version #{version.number}): #{snapshot['selected_components'].map { |c| c['name'] }.join(', ')}")
          invoice.transition_to!("posted")
          agreement = SubscriptionAgreement.create!(practice: practice, patient: patient, package_version: version, invoice: invoice,
            snapshot: snapshot, amount: snapshot["total"], currency: snapshot["currency"], request_key: key, request_digest: digest)
          agreement.events.create!(practice: practice, kind: snapshot["eligibility_review"] ? "pending_review" : "pending_payment", request_key: "checkout")
          Clinic::AuditRecorder.record!(practice: practice, actor: actor, action_code: "subscriptions.checkout", outcome: :committed, resource_version_ref: "subscription:#{agreement.id}")
          agreement
        end
      end

      def self.cancel(agreement:, actor:, request_key:)
        SubscriptionAccess.authorize!(agreement: agreement, actor: actor)
        key = SubscriptionDefinition.request_key(request_key)
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.lock!
          existing = agreement.events.find_by(request_key: key)
          if existing
            raise ArgumentError, "Request key was already used for a different action." unless existing.kind == "canceled"
            next agreement
          end
          state = agreement.current_state
          next agreement if agreement.events.exists?(kind: "canceled")
          raise ArgumentError, "Resolve the payment outcome before cancellation." if %w[processing outcome_unknown].include?(state)
          next agreement if %w[canceled expired refunded review_declined].include?(state)
          active = agreement.events.find_by(kind: "active")
          effective_at = if state == "active" && agreement.snapshot["cancellation"] == "end_of_term"
            active.details.fetch("ends_at")
          else
            Time.current.iso8601
          end
          agreement.events.create!(practice: agreement.practice, kind: "canceled", request_key: key, details: { effective_at: effective_at })
          unless active
            raise ArgumentError, "Reconcile existing invoice payments before cancellation." if agreement.invoice.payment_allocations.exists? || agreement.invoice.credit_notes.exists?
            # A canceled, never-paid purchase is voided without changing posted lines.
            agreement.invoice.with_lock { agreement.invoice.transition_to!("void") if agreement.invoice.status == "posted" }
          end
          Clinic::AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "subscriptions.cancel", outcome: :committed, resource_version_ref: "subscription:#{agreement.id}")
          agreement
        end
      end

      def self.review(agreement:, actor:, approved:, request_key:)
        Clinic::Authorization.authorize!(practice: agreement.practice, actor: actor, action: "subscriptions.review")
        approved = SubscriptionDefinition.boolean(approved)
        key = SubscriptionDefinition.request_key(request_key)
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.lock!
          kind = approved ? "review_approved" : "review_declined"
          existing = agreement.events.find_by(request_key: key)
          if existing
            raise ArgumentError, "Request key was used for a different review." unless existing.kind == kind
            next agreement
          end
          raise ArgumentError, "This purchase is not awaiting review." unless agreement.current_state == "pending_review"
          agreement.events.create!(practice: agreement.practice, kind: kind, request_key: key)
          raise ArgumentError, "Reconcile existing invoice payments before declining review." if !approved && agreement.invoice.payment_allocations.exists?
          agreement.invoice.with_lock { agreement.invoice.transition_to!("void") } unless approved
          Clinic::AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "subscriptions.review", outcome: :committed, resource_version_ref: "subscription:#{agreement.id}")
          agreement
        end
      end
    end
  end
end
