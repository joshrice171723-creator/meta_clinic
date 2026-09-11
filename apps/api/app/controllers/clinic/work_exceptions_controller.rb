module Clinic
  class WorkExceptionsController < Clinic::ApiController
    def show
      site = if params[:site_id].present?
        current_practice.sites.find(requested_id!(params[:site_id], :site_id))
      end
      unsigned_notes_available = notes_available?(site)
      payment_exceptions_available = billing_available?
      raise Clinic::Authorization::Denied unless unsigned_notes_available || payment_exceptions_available

      result = Clinic::WorkExceptions.call(
        practice: current_practice,
        ability: current_ability,
        site: site,
        unsigned_notes_available: unsigned_notes_available,
        payment_exceptions_available: payment_exceptions_available
      )
      record_source_reads!(result.fetch(:sources))
      render json: result
    end

    private

    def notes_available?(site)
      current_ability.allowed_permission?("patients.read") &&
        current_ability.allowed_permission?("notes.read", site: site, any_site: site.nil?)
    end

    def billing_available?
      current_ability.allowed_permission?("billing.read") ||
        current_ability.allowed_permission?("billing.write")
    end

    def record_source_reads!(sources)
      if sources.dig(:unsigned_notes, :available)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "notes.read", outcome: :released)
      end
      if sources.dig(:payment_exceptions, :available)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "billing.read", outcome: :released)
      end
    end
  end
end
