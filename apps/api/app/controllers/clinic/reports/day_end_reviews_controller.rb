module Clinic
  module Reports
    class DayEndReviewsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.cash_reconcile", "billing.write") }
      before_action -> { require_capability_with_legacy("billing.read", "billing.write") }

      rescue_from DayEndReconciliation::SourceChanged do
        render json: { error: "Source records changed. Refresh and compare again before saving.", code: "source_changed" }, status: :conflict
      end

      def preview
        response.headers["Cache-Control"] = "no-store"
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        render json: DayEndReconciliation.call(practice: current_practice, actor: current_user,
          date: date_param!(params[:date], field: :date), site:)
      end

      def index
        date = date_param!(params[:date], field: :date)
        reviews = Clinic::DayEndReview.where(practice: current_practice, review_date: date)
          .includes(:reviewed_by).order(created_at: :desc, id: :desc).limit(20)
        response.headers["Cache-Control"] = "no-store"
        ability = Ability.new(current_user, practice: current_practice)
        visible = reviews.select do |review|
          reconciliation = review.snapshot["reconciliation"]
          reconciliation.nil? || ability.allowed_permission?("appointments.read", site: reconciliation["site_id"])
        end
        render json: { reviews: visible.map { |review| payload(review) } }
      end

      def create
        input = parameter_hash!(:day_end_review, %i[date review_note request_key comparison_outcome source_digest site_id])
        reconciliation = if input[:comparison_outcome].present? || input[:source_digest].present? || input[:site_id].present?
          site = current_practice.sites.find(requested_id!(input[:site_id], :site_id))
          Clinic::Authorization.authorize!(actor: current_user, practice: current_practice, action: "appointments.read", site:)
          { site:, outcome: required_string!(input[:comparison_outcome], field: :comparison_outcome, maximum: 40),
            source_digest: required_string!(input[:source_digest], field: :source_digest, maximum: 64) }
        end
        review = RecordDayEndReview.call(
          practice: current_practice, actor: current_user,
          date: date_param!(input[:date], field: :date),
          review_note: required_string!(input[:review_note], field: :review_note, maximum: 500),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160), reconciliation:
        )
        render json: { review: payload(review) }, status: :created
      end

      private

      def payload(review)
        {
          id: review.id, date: review.review_date.iso8601, timezone: review.timezone,
          reviewed_at: review.created_at.iso8601(6), reviewed_by: review.reviewed_by.email_address,
          review_note: review.review_note, snapshot: review.snapshot
        }
      end
    end
  end
end
