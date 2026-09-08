require "digest"
require "openssl"

module Clinic
  module Telehealth
    module Scribe
      module Support
        LEASE_DURATION = 45.seconds
        ACTIVE_PARTICIPANT_STATUSES = %w[admitted].freeze
        module_function

        def authorize_staff!(visit:, actor:, action: "scribe.read")
          membership = Clinic::Authorization.authorize!(actor:, practice: visit.practice,
            action:, site: visit.appointment.site)
          Clinic::Telehealth::AccessPolicy.authorize!(
            actor_context: { actor:, practice: visit.practice }, visit:, action: :participate
          )
          participant = visit.participants.active_record.find_by(membership_id: membership.id)
          raise Clinic::Authorization::Denied unless participant&.admitted?
          [ membership, participant ]
        end

        def authorize_host!(visit:, actor:)
          Clinic::Telehealth::AccessPolicy.authorize!(
            actor_context: { actor:, practice: visit.practice }, visit:, action: :prepare_room
          )
        end

        def active_participants(visit)
          visit.participants.active_record.where(status: ACTIVE_PARTICIPANT_STATUSES).order(:id).to_a
        end

        def latest_recording_consents(visit, participants = active_participants(visit))
          participant_ids = participants.map(&:id)
          return {} if participant_ids.empty?

          visit.consents.scribe_recording.where(participant_id: participant_ids)
            .order(:participant_id, sequence: :desc, id: :desc)
            .each_with_object({}) { |consent, result| result[consent.participant_id] ||= consent }
        end

        def consent_snapshot(visit)
          participants = active_participants(visit)
          decisions = latest_recording_consents(visit, participants)
          rows = participants.map do |participant|
            consent = decisions[participant.id]
            {
              participant:,
              consent:,
              status: consent&.decision || "pending"
            }
          end
          state = if rows.empty?
            "pending"
          elsif rows.any? { |row| row[:status] == "withdrawn" }
            "withdrawn"
          elsif rows.any? { |row| row[:status] == "declined" }
            "declined"
          elsif rows.all? { |row| row[:status] == "accepted" }
            "accepted"
          else
            "pending"
          end
          signature_values = rows.map do |row|
            consent = row[:consent]
            [ row[:participant].id, consent&.id, row[:status], consent&.policy_content_digest ]
          end
          digest = Digest::SHA256.hexdigest(signature_values.flatten.join("\0"))
          { state:, rows:, digest:, participants:, decisions: }
        end

        def consent_epoch_version(visit, snapshot = consent_snapshot(visit))
          "telehealth-scribe:#{visit.policy_version_id}:#{snapshot.fetch(:digest)}"
        end

        def ensure_scribe_policy!(visit)
          policy = visit.policy_version
          unless policy&.published? && policy.scribe_enabled? && policy.scribe_consent_digest.present?
            raise Clinic::Telehealth::Error.new("Scribe is not enabled for this visit policy.",
              code: "scribe_not_enabled", status: :unprocessable_entity)
          end
          policy
        end

        def ensure_exact_binding!(visit)
          clinical = visit.encounter || raise(Clinic::Telehealth::Error.new(
            "The visit must be bound to its clinical encounter before Scribe can be used.",
            code: "scribe_encounter_unbound", status: :conflict
          ))
          scribe = visit.scribe_encounter || raise(Clinic::Telehealth::Error.new(
            "The Scribe encounter has not been created for this visit.",
            code: "scribe_not_requested", status: :conflict
          ))
          valid = scribe.practice_id == visit.practice_id && scribe.patient_id == visit.patient_id &&
            scribe.clinical_encounter_id == clinical.id
          unless valid
            raise Clinic::Telehealth::Error.new("Scribe is not bound to this visit's exact clinical encounter.",
              code: "scribe_binding_mismatch", status: :conflict)
          end
          scribe
        end

        def verify_expected_version!(visit, expected_version)
          expected = Integer(expected_version, exception: false)
          unless expected && expected == visit.lock_version
            raise ActiveRecord::StaleObjectError.new(visit, "update")
          end
        end

        def owner_token(visit:, participant:, epoch:, request_key:)
          value = [ visit.id, participant.id, epoch, request_key ].join(":")
          OpenSSL::HMAC.hexdigest("SHA256", Rails.application.secret_key_base, "telehealth-scribe-owner:#{value}")
        end

        def token_digest(token)
          Digest::SHA256.hexdigest(token.to_s)
        end

        def secure_token_match?(stored_digest, token)
          supplied = token_digest(token)
          stored_digest.present? && ActiveSupport::SecurityUtils.secure_compare(stored_digest, supplied)
        end

        def clear_capture_attributes
          {
            scribe_capture_owner_participant: nil,
            scribe_capture_owner_token_digest: nil,
            scribe_capture_lease_expires_at: nil
          }
        end

        def record_audit!(visit:, actor:, action:, outcome: :committed)
          Clinic::AuditRecorder.record!(practice: visit.practice, actor:, action_code: "telehealth.scribe.#{action}",
            outcome:, resource_version_ref: "Clinic::Telehealth::Visit/#{visit.id}")
        end
      end
    end
  end
end
