module Launch
  module Api
    class InquiriesController < ApplicationController
      before_action :require_admin

      def index
        page = InquiriesQuery.call(before: params[:before])
        render json: {
          inquiries: page.inquiries.as_json(only: %i[id name email message created_at]),
          next_cursor: page.next_cursor
        }
      end
    end
  end
end
