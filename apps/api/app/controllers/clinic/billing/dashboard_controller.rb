module Clinic
  module Billing
    class DashboardController < Clinic::ApiController
      before_action -> { require_capability("billing.read") }

      def show
        render json: Dashboard.call(
          practice: current_practice,
          page: page_param,
          per_page: per_page_param(default: 25, maximum: 100),
          query: query_param,
          filter: invoice_filter_param,
          sort: invoice_sort_param
        )
      end

      private

      def invoice_filter_param
        value = params[:filter].presence || "all"
        unless %w[all draft open paid void age_0_30 age_31_60 age_61_90 age_91_plus].include?(value)
          raise Clinic::Api::RequestParameters::Invalid.new("filter is not supported.", field: :filter)
        end

        value
      end

      def invoice_sort_param
        value = params[:sort].presence || "recent"
        unless %w[recent oldest balance_desc total_desc].include?(value)
          raise Clinic::Api::RequestParameters::Invalid.new("sort is not supported.", field: :sort)
        end

        value
      end
    end
  end
end
