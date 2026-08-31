module Api
  class PaperworksController < ApplicationController
    before_action :require_member
    rate_limit to: 10, within: 5.minutes, only: :sign,
      by: -> { current_user.id },
      with: -> { render json: { error: "Too many signing attempts. Please try again in five minutes." }, status: :too_many_requests }

    rescue_from Paperwork::SigningConflict do |error|
      render json: { error: error.message }, status: :conflict
    end

    def index
      render json: { paperworks: current_user.paperworks.order(:id).map(&:portal_json) }
    end

    def show
      render json: { paperwork: assigned_document.portal_json(detail: true) }
    end

    def start
      document = assigned_document
      document.begin_review!
      render json: { paperwork: document.portal_json(detail: true) }
    end

    def sign
      document = assigned_document
      unless params[:consent] == true
        return render json: { error: "Confirm your intent to record this demonstration signature." }, status: :unprocessable_entity
      end
      password = params[:password].to_s
      unless (development_demo? && document.demo?) || (password.bytesize <= 72 && current_user.authenticate(password))
        return render json: { error: "Please confirm your account password." }, status: :unauthorized
      end
      document.sign!(name: params[:signature_name], reviewed_digest: params[:content_digest])
      render json: { paperwork: document.portal_json(detail: true) }
    end

    private

    def assigned_document
      current_user.paperworks.find(params[:id])
    end
  end
end
