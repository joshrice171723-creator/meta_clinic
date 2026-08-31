module Launch
  module Api
    class PaperworksController < ApplicationController
      before_action :require_member
      rate_limit to: 10, within: 5.minutes, only: :sign,
        by: -> { current_user.id },
        with: -> { render json: { error: "Too many signing attempts. Please try again in five minutes." }, status: :too_many_requests }

      rescue_from Launch::Paperwork::SigningConflict do |error|
        render json: { error: error.message }, status: :conflict
      end
      rescue_from SignPaperwork::ConsentRequired do |error|
        render json: { error: error.message }, status: :unprocessable_entity
      end
      rescue_from SignPaperwork::PasswordRequired do |error|
        render json: { error: error.message }, status: :unauthorized
      end

      def index
        render json: { paperworks: current_user.paperworks.available_in_portal.order(:id).map { |document| document_json(document) } }
      end

      def show
        render json: { paperwork: document_json(assigned_document, detail: true) }
      end

      def start
        document = assigned_document
        document.begin_review!
        render json: { paperwork: document_json(document, detail: true) }
      end

      def sign
        document = SignPaperwork.call(user: current_user, document_id: params[:id],
          consent: params[:consent] == true, password: params[:password], name: params[:signature_name],
          reviewed_digest: params[:content_digest], development_demo: development_demo?)
        render json: { paperwork: document_json(document, detail: true) }
      end

      def receipt
        @document = assigned_document
        return render(json: { error: "Complete the demonstration before downloading its record." }, status: :conflict) unless @document.signed_at?
        record = [ "APPly DEMONSTRATION ONLY — not a legal signature certificate or institutional acceptance",
          @document.title, "Document version: #{@document.document_version}", "Content digest: #{@document.content_digest}",
          "Signed by: #{@document.signature_name}", "Signed at (UTC): #{@document.signed_at.utc.iso8601(6)}",
          "Consent: #{@document.consent_version}", "Signature digest: #{@document.signature_digest}", "", @document.body ].join("\n")
        send_data record, type: "text/plain; charset=utf-8", disposition: "attachment", filename: "apply-demo-#{@document.id}.txt"
      end

      private

      def document_json(document, detail: false)
        document.portal_json(detail: detail).merge(signing_available: document.demo? && DemoContent.enabled?)
      end

      def assigned_document
        current_user.paperworks.available_in_portal.find(params[:id])
      end
    end
  end
end
