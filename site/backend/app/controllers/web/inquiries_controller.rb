module Web
  class InquiriesController < BaseController
    before_action :require_admin

    def index
      records = ContactMessage.order(id: :desc)
      records = records.where("id < ?", params[:before].to_i) if params[:before].present?
      page = records.limit(51).to_a
      @inquiries = page.first(50)
      @next_cursor = page.length > 50 ? page[49].id : nil
    end
  end
end
