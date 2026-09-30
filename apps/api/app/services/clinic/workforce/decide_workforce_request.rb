require "digest"

module Clinic
  module Workforce
    class DecideWorkforceRequest
      Result = Data.define(:request, :publication, :replayed)

      def self.call(request:, decision:, actor:, access:, expected_revision:, idempotency_key:, reason: nil)
        new(request:, decision:, actor:, access:, expected_revision:, idempotency_key:, reason:).call
      end

      def initialize(request:, decision:, actor:, access:, expected_revision:, idempotency_key:, reason:)
        @request = request
        @decision = decision.to_s
        @actor = actor
        @access = access
        @expected_revision = Integer(expected_revision)
        @idempotency_key = idempotency_key.to_s.strip
        @reason = reason.to_s.strip.presence
        raise ArgumentError, "Decision key is required." if @idempotency_key.blank?
        raise ArgumentError, "Reason is too long." if @reason&.length.to_i > 500
      end

      def call
        request.class.transaction do
          request.lock!
          digest = Digest::SHA256.hexdigest(JSON.generate([ request.public_id, decision, expected_revision, reason ]))
          receipt = request.decision_receipts[idempotency_key]
          if receipt
            raise Clinic::Idempotency::Conflict unless receipt["digest"] == digest
            return Result.new(request, receipt["publication_id"] && SchedulePublication.find(receipt["publication_id"]), true)
          end
          raise ActiveRecord::StaleObjectError.new(request, "decide") unless request.revision == expected_revision

          publication = transition!
          receipts = request.decision_receipts.merge(idempotency_key => {
            "digest" => digest, "decision" => decision, "status" => request.status,
            "publication_id" => publication&.id, "decided_at" => Current.business_time.iso8601(6)
          })
          request.update!(decision_receipts: receipts)
          Result.new(request, publication, false)
        end
      end

      private

      attr_reader :request, :decision, :actor, :access, :expected_revision, :idempotency_key, :reason

      def transition!
        return cancel! if decision == "cancel"
        return decide_swap! if request.is_a?(ShiftSwapRequest)
        decide_approval!
      end

      def cancel!
        own = access.own_employment
        owner_id = request.respond_to?(:requester_employment_id) ? request.requester_employment_id : request.employment_id
        raise Clinic::Authorization::Denied unless own&.id == owner_id
        raise ArgumentError, "Only a pending request can be cancelled." unless %w[submitted accepted].include?(request.status)

        request.update!(status: "cancelled", cancelled_at: Current.business_time, revision: request.revision + 1)
        nil
      end

      def decide_approval!
        access.authorize!("workforce.requests.review", site: request.site)
        raise ArgumentError, "Only a submitted request can be decided." unless request.status == "submitted"
        status = { "manager_approve" => "approved", "manager_deny" => "denied" }.fetch(decision) do
          raise ArgumentError, "Decision is not valid for this request."
        end
        supersede_availability! if request.is_a?(AvailabilityVersion) && status == "approved"
        request.update!(status: status, reviewed_by_id: actor.id, decision_reason: reason,
          decided_at: Current.business_time, revision: request.revision + 1)
        nil
      end

      def decide_swap!
        case decision
        when "target_accept", "target_decline"
          target = access.own_employment
          raise Clinic::Authorization::Denied unless target&.id == request.target_employment_id
          raise ArgumentError, "Only a submitted swap can be answered." unless request.status == "submitted"
          ensure_swap_not_expired! if decision == "target_accept"
          ensure_target_eligible!
          if decision == "target_decline"
            request.update!(status: "declined", target_decided_by_id: actor.id, target_reason: reason,
              target_decided_at: Current.business_time, revision: request.revision + 1)
            return nil
          end
          request.update!(status: "accepted", target_decided_by_id: actor.id, target_reason: reason,
            target_decided_at: Current.business_time, revision: request.revision + 1)
          return approve_swap! unless setting_enabled?("shift_swap_approval_required")
          nil
        when "manager_approve", "manager_deny"
          access.authorize!("workforce.requests.review", site: request.site)
          raise ArgumentError, "Target employee consent is required first." unless request.status == "accepted"
          ensure_swap_not_expired! if decision == "manager_approve"
          if decision == "manager_deny"
            request.update!(status: "denied", reviewed_by_id: actor.id, decision_reason: reason,
              decided_at: Current.business_time, revision: request.revision + 1)
            nil
          else
            approve_swap!
          end
        else
          raise ArgumentError, "Decision is not valid for a shift swap."
        end
      end

      def ensure_swap_not_expired!
        if request.expires_at && request.expires_at <= Current.business_time
          raise ArgumentError, "This shift swap has expired. Cancel it or request a new swap."
        end
      end

      def approve_swap!
        ensure_target_eligible!
        publication = publish_swap_revision!
        request.update!(status: "approved", reviewed_by_id: actor.id, decision_reason: reason,
          decided_at: Current.business_time, revision: request.revision + 1)
        publication
      end

      def publish_swap_revision!
        offered = request.offered_shift
        raise ArgumentError, "The offered published shift is unavailable." unless offered
        raise ArgumentError, "The offered shift is not assigned to the requester." unless offered["employment_id"].to_i == request.requester_employment_id
        latest = SchedulePublication.where(practice_id: request.practice_id, site_id: request.site_id,
          week_start_on: request.schedule_publication.week_start_on).latest_first.first
        raise ActiveRecord::StaleObjectError.new(request, "swap") unless latest&.id == request.schedule_publication_id

        draft = ScheduleDraft.create!(practice_id: request.practice_id, site: request.site,
          created_by_id: actor.id, week_start_on: latest.week_start_on, timezone: latest.timezone,
          status: "draft", revision: 1)
        latest.shift_snapshot.each do |row|
          employment_id = row["id"] == request.offered_shift_public_id ? request.target_employment_id : row["employment_id"]
          draft.shifts.create!(practice_id: request.practice_id, employment_id: employment_id,
            public_id: SecureRandom.uuid, timezone: row["timezone"], local_start: row["local_start"], local_end: row["local_end"],
            starts_at: row["starts_at"], ends_at: row["ends_at"], start_occurrence: "only", end_occurrence: "only",
            role_name: row["role_name"], break_minutes: row["break_minutes"])
        end
        PublishSchedule.call(draft: draft, actor: actor, expected_revision: 1,
          idempotency_key: "swap:#{request.public_id}:#{request.revision}")
      end

      def ensure_target_eligible!
        shift = request.offered_shift
        raise ArgumentError, "The offered published shift is unavailable." unless shift
        starts_at = Time.iso8601(shift.fetch("starts_at"))
        ends_at = Time.iso8601(shift.fetch("ends_at"))
        target = request.target_employment
        shift_end = ends_at - Rational(1, 1_000_000)
        unless target.active_for_work?(at: starts_at) && target.active_for_work?(at: shift_end) &&
            target.eligible_site?(request.site, at: starts_at) && target.eligible_site?(request.site, at: shift_end)
          raise ArgumentError, "Target employee is not active or eligible for the full shift."
        end
        if TimeOffRequest.where(practice_id: request.practice_id, employment_id: target.id, status: "approved").overlapping(starts_at, ends_at).exists?
          raise ArgumentError, "Target employee has approved time off during this shift."
        end
      end

      def setting_enabled?(key)
        EffectiveSettings.call(practice: request.practice, site: request.site, at: Current.business_time).fetch(:values).fetch(key) == true
      end

      def supersede_availability!
        AvailabilityVersion.where(practice_id: request.practice_id, site_id: request.site_id,
          employment_id: request.employment_id, status: "approved").where.not(id: request.id)
          .find_each do |prior|
            raise ArgumentError, "Availability cannot take effect before the current version." if request.effective_from < prior.effective_from
            prior.update!(status: "superseded",
              effective_until: request.effective_from > prior.effective_from ? [ prior.effective_until, request.effective_from - 1.day ].compact.min : prior.effective_until,
              revision: prior.revision + 1)
          end
      end
    end
  end
end
