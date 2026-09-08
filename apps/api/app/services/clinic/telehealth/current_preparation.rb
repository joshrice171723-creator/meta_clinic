module Clinic
  module Telehealth
    module CurrentPreparation
      module_function

      def call(visit:, at: Time.current)
        participant = visit.participants.find_by(role: "patient")
        checkin = visit.checkins.where(access_generation: visit.access_generation).order(sequence: :desc).first
        consent = participant && visit.consents.where(participant_id: participant.id, purpose: "telehealth").order(sequence: :desc).first
        verification = checkin && Clinic::AuditResourceManifest.joins(:audit_event).where(
          clinic_audit_events: { practice_id: visit.practice_id, action_code: "telehealth.preparation.verify", outcome: "committed" },
          protected_resource_version_ref: "telehealth-checkin:#{checkin.id}"
        ).order(id: :desc).first
        reasons = []
        policy = visit.policy_version
        reasons << "checkin_required" unless checkin
        reasons << "checkin_expired" if checkin && checkin.submitted_at < at - policy.checkin_max_age_minutes.minutes
        reasons << "location_required" if checkin && policy.require_location? && checkin.location_payload.blank?
        reasons << "location_attestation_required" if checkin && policy.require_location? && !checkin.location_attested?
        reasons << "callback_required" if checkin && policy.require_callback? && checkin.callback_phone.blank?
        if checkin
          devices = checkin.device_results.to_h.stringify_keys
          audio_only = ActiveModel::Type::Boolean.new.cast(devices["audio_only_requested"])
          reasons << "browser_unsupported" unless devices["browser"] == "supported"
          reasons << "microphone_unavailable" unless devices["microphone"] == "passed"
          reasons << "speaker_unavailable" unless devices["speaker"] == "passed"
          reasons << "camera_unavailable" unless audio_only && policy.allow_audio_only? || devices["camera"] == "passed"
          rule = VisitTypeRule.where(practice_id: visit.practice_id,
            visit_type_id: visit.appointment.visit_type_id).find_by(site_id: visit.appointment.site_id) ||
            VisitTypeRule.where(practice_id: visit.practice_id,
              visit_type_id: visit.appointment.visit_type_id).find_by(site_id: nil)
          region_code = checkin.location&.fetch("region_code", nil).to_s.upcase
          if region_code.present? && (!rule&.enabled? || !Array(rule.allowed_region_codes).map(&:upcase).include?(region_code))
            reasons << "region_ineligible"
          end
        end
        reasons << "telehealth_consent_required" unless consent&.accepted? && consent.policy_version_id == policy.id &&
          consent.policy_content_digest == policy.content_digest
        {
          participant: participant, checkin: checkin, consent: consent, verification: verification,
          complete: reasons.empty?, verified: verification.present?, reasons: reasons
        }
      end
    end
  end
end
