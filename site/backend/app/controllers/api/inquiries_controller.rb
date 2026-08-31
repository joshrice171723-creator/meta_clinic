module Api
  class InquiriesController < ApplicationController
    before_action :require_admin

    def index
      records = ContactMessage.order(id: :desc)
      records = records.where("id < ?", params[:before].to_i) if params[:before].present?
      page = records.limit(51).to_a
      render json: {
        inquiries: page.first(50).as_json(only: %i[id name email message created_at]),
        next_cursor: page.length > 50 ? page[49].id : nil
      }
    end
  end
end
