module Web
  class PaperworksController < BaseController
    before_action :require_member
    before_action :load_document, except: :index
    rate_limit to: 10, within: 5.minutes, only: :sign,
      by: -> { current_user.id },
      with: -> { render_error("Too many signing attempts. Try again in five minutes.", :too_many_requests) }
    rescue_from Paperwork::SigningConflict do |error|
      flash.now[:alert] = error.message
      render :show, status: :conflict
    end

    def index
      @paperworks = current_user.paperworks.order(:id)
    end

    def show
    end

    def start
      @document.begin_review!
      redirect_to paperwork_path(@document), status: :see_other
    end

    def sign
      unless params[:consent] == "1"
        flash.now[:alert] = "Confirm your intent to record this demonstration signature."
        return render :show, status: :unprocessable_entity
      end
      password = params[:password].to_s
      unless (development_demo? && @document.demo?) || (password.bytesize <= 72 && current_user.authenticate(password))
        flash.now[:alert] = "Please confirm your account password."
        return render :show, status: :unauthorized
      end
      @document.sign!(name: params[:signature_name], reviewed_digest: params[:content_digest])
      redirect_to paperwork_path(@document), status: :see_other, notice: "Demo completed. Nothing has been filed or submitted."
    end

    def receipt
      return render_error("Complete the demonstration before downloading its record.", :conflict) unless @document.signed_at?
      record = [ "APPly DEMONSTRATION ONLY — not a legal signature certificate or institutional acceptance",
        @document.title, "Document version: #{@document.document_version}", "Content digest: #{@document.content_digest}",
        "Signed by: #{@document.signature_name}", "Signed at (UTC): #{@document.signed_at.utc.iso8601(6)}",
        "Consent: #{@document.consent_version}", "Signature digest: #{@document.signature_digest}", "", @document.body ].join("\n")
      send_data record, type: "text/plain; charset=utf-8", disposition: "attachment", filename: "apply-demo-#{@document.id}.txt"
    end

    private

    def load_document
      @document = current_user.paperworks.find(params[:id])
    end
  end
end
