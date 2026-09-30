module Clinic
  module Reports
    class DayEndReviewsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.cash_reconcile", "billing.write") }
      before_action -> { require_capability_with_legacy("billing.read", "billing.write") }

      def index
        date = date_param!(params[:date], field: :date)
        reviews = Clinic::DayEndReview.where(practice: current_practice, review_date: date)
          .includes(:reviewed_by).order(created_at: :desc, id: :desc).limit(20)
        render json: { reviews: reviews.map { |review| payload(review) } }
      end

      def create
        input = parameter_hash!(:day_end_review, %i[date review_note request_key])
        review = RecordDayEndReview.call(
          practice: current_practice, actor: current_user,
          date: date_param!(input[:date], field: :date),
          review_note: required_string!(input[:review_note], field: :review_note, maximum: 500),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
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
