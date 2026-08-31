module Web
  class PagesController < BaseController
    before_action :require_member, only: :portal
    rate_limit to: 20, within: 1.hour, only: :submit_contact,
      with: -> { render_error("Too many inquiries. Please try again later.", :too_many_requests) }

    def home
    end

    def contact
      @message = ContactMessage.new
    end

    def submit_contact
      details = params.require(:contact_message).permit(:name, :email, :message, :website)
      return render_error("We couldn't accept this inquiry.", :unprocessable_entity) unless details.delete(:website).blank?
      @message = ContactMessage.new(details)
      if @message.save
        redirect_to contact_path, status: :see_other, notice: "Your inquiry has been saved for APPly. No email notification is sent in this prototype."
      else
        flash.now[:alert] = @message.errors.full_messages.to_sentence
        render :contact, status: :unprocessable_entity
      end
    end

    def portal
      @paperworks = current_user.paperworks
      @materials = available_materials
      @completed_training = current_user.learning_progresses.where(material: @materials).where.not(completed_at: nil).count
    end
  end
end
