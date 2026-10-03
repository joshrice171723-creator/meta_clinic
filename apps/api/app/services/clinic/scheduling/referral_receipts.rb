module Clinic
  module Scheduling
    class ReferralReceipts
      def self.authorize!(practice:, actor:, patient:, site:)
        raise ActiveRecord::RecordNotFound unless patient.practice_id == practice.id && site&.practice_id == practice.id
        Authorization.authorize_with_legacy!(practice:, actor:, action: "appointments.book", legacy_action: "appointments.write", site:)
        Authorization.authorize!(practice:, actor:, action: "patients.read", subject: patient)
        Authorization.authorize!(practice:, actor:, action: "patients.read", site:)
      end

      def self.record(practice:, actor:, patient:, site:, offering_id:, expected_receipt_id:, state:, received_on:, valid_until:, details:, request_key:)
        authorize!(practice:, actor:, patient:, site:)
        raise ArgumentError, "Choose received or withdrawn." unless %w[received withdrawn].include?(state)
        raise ArgumentError, "Enter a source, reference and note as text." unless details.is_a?(Hash) && details.keys.sort == %w[note reference source] && details.values.all? { |value| value.is_a?(String) }
        details = details.transform_values(&:strip)
        raise ArgumentError, "Enter a note of 1–500 characters." unless details["note"].length.between?(1, 500)
        raise ArgumentError, "Referral details must be at most 500 characters." if details.values.any? { |value| value.length > 500 }
        if state == "received"
          raise ArgumentError, "Record the supplied referral source, reference and received date." if details["source"].blank? || details["reference"].blank? || received_on.nil?
          today = Current.business_time.in_time_zone(site.timezone_override.presence || practice.timezone).to_date
          raise ArgumentError, "Received date cannot be in the future." if received_on > today
          raise ArgumentError, "Valid until cannot precede receipt." if valid_until && valid_until < received_on
        elsif received_on || valid_until
          raise ArgumentError, "Withdrawal records need a reason, not new receipt dates."
        end
        payload = { patient_id: patient.id, site_id: site.id, offering_id:, expected_receipt_id:, state:, received_on:, valid_until:, details: }
        outcome = Clinic::Idempotency.execute(practice:, actor:, request_key:, operation_code: "referral.receipt.record", payload:,
          authorization: -> { authorize!(practice:, actor:, patient:, site:) }, authorization_action: "appointments.book",
          result_resource: ->(record) { record }, resource_resolver: ->(practice:, receipt:) { Clinic::ReferralReceipt.find_by(practice:, patient:, site:, id: receipt.resource_id) }) do
          practice.lock!
          offering = practice.service_offerings.lock.find(offering_id)
          latest = Clinic::ReferralReceipt.where(practice:, patient:, site:, service_offering: offering).order(:id).last
          raise ActiveRecord::StaleObjectError.new(offering, "record referral") unless latest&.id == expected_receipt_id
          if state == "received"
            raise ArgumentError, "Choose a published service at this active location." unless site.reload.status == "active" && offering.published? && offering.sites.exists?(id: site.id)
          else
            raise ArgumentError, "There is no current receipt to withdraw." unless latest&.state == "received"
          end
          record = Clinic::ReferralReceipt.create!(practice:, patient:, site:, service_offering: offering, recorded_by: actor,
            prior_receipt: latest, state:, received_on:, valid_until:, details: details.to_json, request_key:)
          AuditRecorder.record!(practice:, actor:, action_code: "appointments.book", outcome: :released, resource_version_ref: "Clinic::ReferralReceipt/#{record.id}")
          record
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def self.booking_snapshot!(practice:, patient:, site:, offering:, starts_at:)
        return { "required" => false } unless offering.referral_required
        receipt = Clinic::ReferralReceipt.where(practice:, patient:, site:, service_offering: offering).order(:id).last
        date = starts_at.in_time_zone(site.timezone_override.presence || practice.timezone).to_date
        unless receipt&.state == "received" && receipt.received_on <= date && (!receipt.valid_until || receipt.valid_until >= date)
          raise ArgumentError, "This service requires a recorded referral covering the visit date. Open the patient's Referral receipts at this location before booking."
        end
        { "required" => true, "receipt_id" => receipt.id, "recorded_at" => receipt.created_at.iso8601(6) }
      end
    end
  end
end
