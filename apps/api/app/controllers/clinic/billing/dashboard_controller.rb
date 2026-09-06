module Clinic
  module Billing
    class DashboardController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.read", "billing.write") }

      def show
        render json: Dashboard.call(
          practice: current_practice,
          page: page_param,
          per_page: per_page_param(default: 25, maximum: 100),
          query: query_param,
          filter: invoice_filter_param,
          sort: invoice_sort_param,
          outlook_months: outlook_months_param,
          outlook_start: outlook_start_param
        )
      end

      private

      def outlook_months_param
        value = params[:outlook_months].presence || "6"
        unless %w[3 6 12].include?(value.to_s)
          raise Clinic::Api::RequestParameters::Invalid.new("Choose 3, 6 or 12 months.", field: :outlook_months)
        end
        value.to_i
      end

      def outlook_start_param
        return nil if params[:outlook_start].blank?

        value = params[:outlook_start].to_s
        date = Date.strptime("#{value}-01", "%Y-%m-%d") if /\A\d{4}-\d{2}\z/.match?(value)
        current = Current.business_time.in_time_zone(current_practice.timezone).to_date.beginning_of_month
        unless date && date.between?(current.next_month, current + 24.months)
          raise ArgumentError
        end
        date
      rescue ArgumentError
        raise Clinic::Api::RequestParameters::Invalid.new("Choose a future month within the next two years.", field: :outlook_start)
      end

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
