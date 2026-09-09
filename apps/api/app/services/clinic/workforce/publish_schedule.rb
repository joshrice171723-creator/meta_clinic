require "digest"

module Clinic
  module Workforce
    class PublishSchedule
      class InvalidSchedule < ArgumentError
        attr_reader :details
        def initialize(details)
          @details = details
          super("Schedule validation failed.")
        end
      end

      def self.call(draft:, actor:, expected_revision:, idempotency_key:)
        new(draft:, actor:, expected_revision:, idempotency_key:).call
      end

      def initialize(draft:, actor:, expected_revision:, idempotency_key:)
        @draft = draft
        @actor = actor
        @expected_revision = Integer(expected_revision)
        @idempotency_key = idempotency_key.to_s.strip
        raise ArgumentError, "Idempotency key is required." if @idempotency_key.blank?
      end

      def call
        request_digest = Digest::SHA256.hexdigest([ draft.id, expected_revision ].join(":"))
        existing = SchedulePublication.find_by(practice_id: draft.practice_id, idempotency_key: idempotency_key)
        return compatible_retry(existing, request_digest) if existing

        SchedulePublication.transaction do
          draft.site.lock!
          draft.lock!
          existing = SchedulePublication.find_by(practice_id: draft.practice_id, idempotency_key: idempotency_key)
          return compatible_retry(existing, request_digest) if existing
          raise ActiveRecord::StaleObjectError.new(draft, "publish") unless draft.revision == expected_revision
          raise ArgumentError, "Only a draft schedule can be published." unless draft.editable?

          employment_ids = draft.shifts.order(:employment_id).distinct.pluck(:employment_id)
          locked_employments = Employment.where(practice_id: draft.practice_id, id: employment_ids).order(:id).lock.index_by(&:id)
          employment_ids.each { |employment_id| locked_employments.fetch(employment_id) { raise ActiveRecord::RecordNotFound } }
          result = ValidateSchedule.call(draft: draft)
          raise InvalidSchedule, result.errors unless result.valid?

          snapshot = draft.shifts.includes(employment: :staff_member).order(:starts_at, :id).map { |shift| snapshot_shift(shift) }
          digest = Digest::SHA256.hexdigest(JSON.generate(snapshot))
          prior = SchedulePublication.where(practice_id: draft.practice_id, site_id: draft.site_id,
            week_start_on: draft.week_start_on).latest_first.first
          publication = SchedulePublication.create!(practice_id: draft.practice_id, site: draft.site,
            schedule_draft: draft, published_by_id: actor.id, supersedes: prior,
            week_start_on: draft.week_start_on, timezone: draft.timezone, version: prior&.version.to_i + 1,
            shift_snapshot: snapshot, snapshot_digest: digest, published_at: Current.business_time,
            idempotency_key: idempotency_key, request_digest: request_digest)
          draft.update!(status: "published", revision: draft.revision + 1)
          publication
        end
      end

      private

      attr_reader :draft, :actor, :expected_revision, :idempotency_key

      def compatible_retry(existing, request_digest)
        raise Clinic::Idempotency::Conflict unless existing.request_digest == request_digest
        existing
      end

      def snapshot_shift(shift)
        {
          "id" => shift.public_id,
          "employment_id" => shift.employment_id,
          "employee_name" => shift.employment.staff_member.display_name,
          "starts_at" => shift.starts_at.iso8601(6),
          "ends_at" => shift.ends_at.iso8601(6),
          "local_start" => shift.local_start,
          "local_end" => shift.local_end,
          "timezone" => shift.timezone,
          "role_name" => shift.role_name,
          "break_minutes" => shift.break_minutes
        }
      end
    end
  end
end
