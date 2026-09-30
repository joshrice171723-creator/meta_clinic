module Clinic
  module Reports
    class RecordDayEndReview
      def self.call(practice:, actor:, date:, review_note:, request_key:)
        authorize!(practice:, actor:)
        note = review_note.to_s.strip
        raise ArgumentError, "Record what was reviewed or what needs follow-up." if note.empty? || note.length > 500
        raise ArgumentError, "The request key is invalid." unless request_key.to_s.match?(Clinic::Idempotency::KEY_PATTERN)

        zone = ActiveSupport::TimeZone[practice.timezone] || raise(ArgumentError, "The clinic timezone is unavailable.")
        raise ArgumentError, "A future clinic date cannot be reviewed." if date > Time.current.in_time_zone(zone).to_date

        existing = Clinic::DayEndReview.find_by(practice:, request_key:)
        return matching_review!(existing, date:, note:) if existing

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
        matching_review!(Clinic::DayEndReview.find_by!(practice:, request_key:), date:, note:)
      end

      def self.authorize!(practice:, actor:)
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:, action: "billing.cash_reconcile", legacy_action: "billing.write")
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:, action: "billing.read", legacy_action: "billing.write")
      end

      def self.matching_review!(review, date:, note:)
        return review if review.review_date == date && review.review_note == note

        raise Clinic::Idempotency::Conflict
      end
      private_class_method :authorize!, :matching_review!
    end
  end
end
