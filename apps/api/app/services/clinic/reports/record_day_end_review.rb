module Clinic
  module Reports
    class RecordDayEndReview
      def self.call(practice:, actor:, date:, review_note:, request_key:, reconciliation: nil)
        authorize!(practice:, actor:)
        if reconciliation
          site = reconciliation.fetch(:site)
          raise ActiveRecord::RecordNotFound unless site.practice_id == practice.id

          Clinic::Authorization.authorize!(actor:, practice:, action: "appointments.read", site:)
        end
        note = review_note.to_s.strip
        raise ArgumentError, "Record what was reviewed or what needs follow-up." if note.empty? || note.length > 500
        raise ArgumentError, "The request key is invalid." unless request_key.to_s.match?(Clinic::Idempotency::KEY_PATTERN)

        zone = ActiveSupport::TimeZone[practice.timezone] || raise(ArgumentError, "The clinic timezone is unavailable.")
        raise ArgumentError, "A future clinic date cannot be reviewed." if date > Time.current.in_time_zone(zone).to_date

        existing = Clinic::DayEndReview.find_by(practice:, request_key:)
        return matching_review!(existing, date:, note:, reconciliation:) if existing

        if reconciliation
          outcome = reconciliation.fetch(:outcome).to_s
          raise ArgumentError, "Select a comparison outcome." unless %w[no_discrepancy_observed follow_up_required].include?(outcome)
          source_digest = reconciliation.fetch(:source_digest).to_s
          raise ArgumentError, "The source digest is invalid." unless source_digest.match?(/\A[0-9a-f]{64}\z/)

          captured = DayEndReconciliation.call(practice:, actor:, date:, site: reconciliation.fetch(:site))
          raise DayEndReconciliation::SourceChanged unless captured[:source_digest] == source_digest

          snapshot = captured[:snapshot]
          snapshot["reconciliation"].merge!("outcome" => outcome, "source_digest" => source_digest)
          return Clinic::DayEndReview.create!(practice:, reviewed_by: actor, review_date: date,
            timezone: zone.tzinfo.name, request_key:, review_note: note, snapshot:)
        end

        invoices = DailyInvoices.call(practice:, actor:, date:)
        payments = DailyPaymentActivity.call(practice:, actor:, date:)
        drawers = DailyCashDrawers.call(practice:, actor:, date:)
        snapshot = {
          "invoices" => invoices.slice(:definition, :date, :timezone, :as_of, :currencies),
          "payments" => payments.slice(:definition, :date, :timezone, :as_of, :currencies),
          "drawers" => drawers.slice(:definition, :date, :timezone, :as_of, :open_count,
            :awaiting_reconciliation_count, :variance_count, :carried_count)
        }
        Clinic::DayEndReview.create!(practice:, reviewed_by: actor, review_date: date,
          timezone: zone.tzinfo.name, request_key:, review_note: note, snapshot:)
      rescue ActiveRecord::RecordNotUnique
        matching_review!(Clinic::DayEndReview.find_by!(practice:, request_key:), date:, note:, reconciliation:)
      end

      def self.authorize!(practice:, actor:)
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:, action: "billing.cash_reconcile", legacy_action: "billing.write")
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:, action: "billing.read", legacy_action: "billing.write")
      end

      def self.matching_review!(review, date:, note:, reconciliation:)
        saved = review.snapshot["reconciliation"]
        same_reconciliation = if reconciliation
          saved && saved["site_id"] == reconciliation.fetch(:site).id &&
            saved["source_digest"] == reconciliation.fetch(:source_digest) && saved["outcome"] == reconciliation.fetch(:outcome)
        else
          saved.nil?
        end
        return review if review.review_date == date && review.review_note == note && same_reconciliation

        raise Clinic::Idempotency::Conflict
      end
      private_class_method :matching_review!
    end
  end
end
