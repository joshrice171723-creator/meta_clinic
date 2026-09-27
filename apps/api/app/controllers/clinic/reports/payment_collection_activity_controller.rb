module Clinic
  module Reports
    class PaymentCollectionActivityController < Clinic::ApiController
      def show
        render json: { report: PaymentCollectionActivity.call(practice: current_practice, actor: current_user) }
      end
    end
  end
end
