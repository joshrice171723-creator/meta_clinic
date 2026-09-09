module Launch
  module Api
    class ContactMessagesController < ApplicationController
      rate_limit to: 20, within: 1.hour,
        with: -> { render json: { error: "Too many inquiries. Please try again later." }, status: :too_many_requests }
      rescue_from ContactSubmission::Rejected do |error|
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def create
        unless params[:contact_message].is_a?(ActionController::Parameters)
          return render json: { error: "Please complete the required fields." }, status: :bad_request
        end
        details = params.require(:contact_message).permit(:name, :email, :message, :website)
        message = ContactSubmission.call(details: details)
        if message.persisted?
          render json: { received: true }, status: :created
        else
          render json: { error: message.errors.full_messages.to_sentence }, status: :unprocessable_entity
        end
      end
    end
  end
end
