module Clinic
  module Assistant
    class BookingController < Clinic::ApiController
      wrap_parameters false

      rescue_from Clinic::Assistant::ContextRegistry::StaleContext do
        record_assistant_audit("assistant.context.conflict", :failed) if audit_context_available?
        render json: { error: "Your clinic, location, patient, or demo role changed. Reopen the assistant context.", code: "stale_context" }, status: :conflict
      end

      rescue_from Clinic::Authorization::Denied, CanCan::AccessDenied do
        record_assistant_audit("assistant.action.denied", :denied) if audit_context_available?
        render json: { error: "Your account does not have permission for this clinic action.", code: "permission_denied" }, status: :forbidden
      end

      rescue_from ActiveRecord::StaleObjectError do
        record_assistant_audit("assistant.booking.conflict", :failed) if audit_context_available?
        render json: { error: "The appointment opening changed. Check availability again.", code: "stale_availability" }, status: :conflict
      end

      rescue_from ActiveRecord::RecordNotUnique do
        record_assistant_audit("assistant.booking.conflict", :failed) if audit_context_available?
        render json: { error: "This booking was already submitted or conflicts with a saved appointment.", code: "duplicate_submission" }, status: :conflict
      end

      rescue_from ActiveRecord::RecordNotFound do
        record_assistant_audit("assistant.action.denied", :denied) if audit_context_available?
        render json: { error: "The selected clinic item is no longer available.", code: "not_found" }, status: :not_found
      end

      rescue_from Clinic::Api::RequestParameters::Invalid do |error|
        record_assistant_audit("assistant.action.invalid", :failed) if audit_context_available?
        render_parameter_error(error)
      end

      rescue_from ActiveRecord::RecordInvalid do |error|
        record_assistant_audit("assistant.action.invalid", :failed) if audit_context_available?
        render json: { error: error.record.errors.full_messages.to_sentence, code: "invalid_request" }, status: :unprocessable_entity
      end

      rescue_from ArgumentError do |error|
        record_assistant_audit("assistant.action.invalid", :failed) if audit_context_available?
        render json: { error: error.message, code: "invalid_request" }, status: :unprocessable_entity
      end

      def create_context
        input = assistant_input!(%i[patient_id encounter_id])
        site = current_clinic_site || raise(Clinic::Authorization::Denied)
        Clinic::Authorization.authorize_with_legacy!(actor: current_user, practice: current_practice,
          action: "appointments.read", legacy_action: "appointments.write", site:)
        patient = assistant_patient_scope(site).find(requested_id!(input[:patient_id], :patient_id))
        authorize_assistant_patient!(patient, site)
        encounter = input[:encounter_id].present? ? current_practice.encounters.find(requested_id!(input[:encounter_id], :encounter_id)) : nil
        if encounter
          raise ActiveRecord::RecordNotFound unless encounter.patient_id == patient.id && encounter.site_id == site.id
          Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
            action: "encounters.read", subject: encounter, site: site)
        end
        context = ContextRegistry.create!(practice: current_practice, actor: current_user, membership: clinic_membership,
          member_session: current_member_session, site:, patient:, encounter:, session:)
        record_assistant_audit("assistant.context.created", :prepared, "assistant_context/#{context.public_id}")
        record_assistant_audit("assistant.context.read", :released, "patient/#{context.patient_id}")
        render json: ContextRegistry.response(context), status: :created
      end

      def create_openings
        input = assistant_input!(%i[context_id visit_type_selection_id clinician_selection_id date duration_minutes time])
        context = context_for!(input[:context_id])
        return unless context

        require_read_authority!(context)
        visit_type = selected_record!(context, "visit_types", input[:visit_type_selection_id], current_practice.visit_types.active)
        clinician = selected_record!(context, "clinicians", input[:clinician_selection_id], current_practice.clinician_profiles)
        date = date_param!(input[:date], field: :date)
        duration = input[:duration_minutes].present? ? bounded_integer!(input[:duration_minutes], field: :duration_minutes, min: 5, max: 240) : Clinic::Scheduling::Calendar::SLOT_MINUTES
        requested_time = optional_string(input[:time], field: :time, maximum: 5)
        validate_time!(requested_time) if requested_time
        invalidate_pending_proposals!(context)
        openings = Scheduling.openings!(context:, practice: current_practice, actor: current_user, date:, duration_minutes: duration,
          visit_type:, clinician:, requested_time:)
        record_assistant_audit("assistant.availability.read", :released, "patient/#{context.patient_id}")
        render json: { openings:, timezone: site_timezone(context.site), duration_minutes: duration }
      end

      def create_message
        input = assistant_input!(%i[context_id message visit_type_selection_id clinician_selection_id date duration_minutes])
        context = context_for!(input[:context_id])
        return unless context

        require_read_authority!(context)
        message = required_string!(input[:message], field: :message, maximum: 2000)
        if input[:visit_type_selection_id].blank? || input[:clinician_selection_id].blank?
          record_assistant_audit("assistant.message.clarified", :released, "assistant_context/#{context.public_id}")
          return render json: { status: "clarify", message: "Choose a visit type and clinician so I can check the schedule." }
        end
        ContextRegistry.selection!(context, "visit_types", input[:visit_type_selection_id])
        ContextRegistry.selection!(context, "clinicians", input[:clinician_selection_id])
        requested_date = input[:date].present? ? date_param!(input[:date], field: :date).iso8601 : nil
        duration = input[:duration_minutes].present? ? bounded_integer!(input[:duration_minutes], field: :duration_minutes, min: 5, max: 240) : nil
        invalidate_pending_proposals!(context)
        record_assistant_audit("assistant.model.requested", :attempted, "assistant_context/#{context.public_id}")

        result = begin
          Clinic::Assistant::ModelGateway.call(request_text: message, requested_date:,
            current_date: Current.business_time.in_time_zone(site_timezone(context.site)).to_date.iso8601,
            timezone: site_timezone(context.site),
            user_id: current_user.id, practice_id: current_practice.id)
        rescue Clinic::Assistant::ModelGateway::BudgetExceeded
          record_assistant_audit("assistant.model.quota_exhausted", :failed, "assistant_context/#{context.public_id}")
          return render json: { error: "The assistant has reached its demo request limit. Try again later.", code: "quota_exhausted" }, status: :too_many_requests
        rescue Clinic::Assistant::ModelGateway::ProviderQuotaExceeded
          record_assistant_audit("assistant.model.quota_exhausted", :failed, "assistant_context/#{context.public_id}")
          return render json: { error: "The assistant has reached its demo request limit. Try again later.", code: "quota_exhausted" }, status: :too_many_requests
        rescue Clinic::Assistant::ModelGateway::Unavailable
          record_assistant_audit("assistant.model.unavailable", :failed, "assistant_context/#{context.public_id}")
          return render json: { error: "The assistant is not available right now.", code: "assistant_unavailable" }, status: :service_unavailable
        rescue Clinic::Assistant::ModelGateway::ProviderError
          record_assistant_audit("assistant.model.failed", :failed, "assistant_context/#{context.public_id}")
          return render json: { error: "I could not read that scheduling request. Please try again.", code: "assistant_request_failed" }, status: :bad_gateway
        rescue Clinic::Assistant::ModelGateway::InvalidRequest
          record_assistant_audit("assistant.model.failed", :failed, "assistant_context/#{context.public_id}")
          return render json: { error: "Please use a short request with a valid date and time.", code: "invalid_request" }, status: :unprocessable_entity
        end

        context.reload
        ContextRegistry.validate!(context, practice: current_practice, actor: current_user, membership: clinic_membership,
          member_session: current_member_session, site: current_clinic_site, session:)
        require_read_authority!(context)
        if result.fetch(:status).to_s == "clarify"
          record_assistant_audit("assistant.model.clarified", :released, "assistant_context/#{context.public_id}")
          return render json: { status: "clarify", message: result.fetch(:message).to_s }
        end

        intent = result.fetch(:intent)
        date_value = intent.fetch(:date).presence || requested_date
        unless date_value
          record_assistant_audit("assistant.model.clarified", :released, "assistant_context/#{context.public_id}")
          return render json: { status: "clarify", message: "Which date should I check?" }
        end
        date = Date.iso8601(date_value)
        requested_time = intent[:time].presence
        validate_time!(requested_time) if requested_time
        duration_value = intent[:duration_minutes].presence || duration || Clinic::Scheduling::Calendar::SLOT_MINUTES
        duration_value = bounded_integer!(duration_value, field: :duration_minutes, min: 5, max: 240)
        visit_type = selected_record!(context, "visit_types", input[:visit_type_selection_id], current_practice.visit_types.active)
        clinician = selected_record!(context, "clinicians", input[:clinician_selection_id], current_practice.clinician_profiles)
        openings = Scheduling.openings!(context:, practice: current_practice, actor: current_user, date:, duration_minutes: duration_value,
          visit_type:, clinician:, requested_time:)
        record_assistant_audit("assistant.model.intent", :released, "patient/#{context.patient_id}")
        render json: { status: "intent", intent: { date: date.iso8601, time: requested_time, duration_minutes: duration_value },
          openings:, timezone: site_timezone(context.site) }
      rescue Date::Error
        record_assistant_audit("assistant.model.failed", :failed, "assistant_context/#{context.public_id}") if context
        render json: { error: "The assistant returned a date that could not be checked.", code: "invalid_intent" }, status: :unprocessable_entity
      end

      def create_proposal
        input = assistant_input!(%i[context_id opening_id])
        context = context_for!(input[:context_id])
        return unless context

        require_booking_authority!(context)
        opening = Scheduling.opening!(context, required_string!(input[:opening_id], field: :opening_id, maximum: 64))
        arguments = opening.fetch("arguments")
        versions = opening.fetch("record_versions")
        unless arguments.fetch("site_id") == context.site_id && arguments.fetch("patient_id") == context.patient_id &&
            Scheduling.current_opening?(context:, arguments:, record_versions: versions, actor: current_user)
          record_assistant_audit("assistant.proposal.conflict", :failed, "assistant_context/#{context.public_id}")
          return render json: { error: "That opening changed. Check availability again.", code: "stale_availability" }, status: :conflict
        end
        invalidate_pending_proposals!(context)
        proposal = BookingProposal.create!(practice: current_practice, assistant_context: context, actor_user: current_user,
          membership: clinic_membership, site: context.site, patient: context.patient,
          visit_type: current_practice.visit_types.find(arguments.fetch("visit_type_id")),
          booked_clinician: current_practice.clinician_profiles.find(arguments.fetch("clinician_id")),
          room: (arguments["room_id"] && current_practice.rooms.find(arguments["room_id"])),
          public_id: SecureRandom.uuid, status: "pending", visit_modality: arguments.fetch("visit_modality"),
          starts_at: Time.iso8601(arguments.fetch("starts_at")), ends_at: Time.iso8601(arguments.fetch("ends_at")),
          arguments:, record_versions: versions, expires_at: 5.minutes.from_now)
        record_assistant_audit("assistant.booking.proposed", :prepared, "assistant_proposal/#{proposal.public_id}")
        render json: proposal_response(proposal), status: :created
      end

      def confirm
        input = assistant_input!(%i[context_id])
        public_id = required_string!(params[:id], field: :id, maximum: 64)
        session_contexts = Context.where(member_session_id: current_member_session.id, practice: current_practice)
        proposal = BookingProposal.where(practice: current_practice, actor_user: current_user,
          membership: clinic_membership, assistant_context_id: session_contexts.select(:id)).find_by!(public_id:)
        context = context_for!(input[:context_id])
        return unless context
        raise ActiveRecord::RecordNotFound unless proposal.assistant_context_id == context.id
        require_booking_authority!(context)

        proposal.with_lock do
          @current_ability = nil
          require_booking_authority!(context)
          raise ActiveRecord::RecordNotFound unless proposal.assistant_context_id == context.id && proposal.status.in?(BookingProposal::STATES)
          unless proposal.status == "pending"
            record_assistant_audit("assistant.booking.duplicate", :failed, "assistant_proposal/#{proposal.public_id}")
            return render json: { error: "This proposal was already used. Read its receipt before taking another action.", code: "duplicate_submission" }, status: :conflict
          end
          if proposal.expires_at <= Time.current
            proposal.update!(status: "expired")
            record_assistant_audit("assistant.booking.expired", :failed, "assistant_proposal/#{proposal.public_id}")
            return render json: { error: "This proposal expired. Check availability again.", code: "proposal_expired" }, status: :conflict
          end
          unless Scheduling.current_opening?(context:, arguments: proposal.arguments,
            record_versions: proposal.record_versions, actor: current_user)
            proposal.update!(status: "conflicted")
            record_assistant_audit("assistant.booking.conflict", :failed, "assistant_proposal/#{proposal.public_id}")
            return render json: { error: "The opening or its scheduling rules changed. Check availability again.", code: "stale_availability" }, status: :conflict
          end

          appointment = Clinic::Scheduling::BookAppointment.call(practice: current_practice, actor: current_user,
            patient: proposal.patient, site: proposal.site, room: proposal.room, booked_clinician: proposal.booked_clinician,
            visit_type: proposal.visit_type, starts_at: proposal.starts_at, ends_at: proposal.ends_at,
            visit_modality: proposal.visit_modality, request_key: "assistant-confirm-#{proposal.public_id}")
          proposal.update!(status: "confirmed", appointment:, confirmed_at: Time.current)
          record_assistant_audit("assistant.booking.confirmed", :committed, "appointment/#{appointment.id}")
          render json: receipt_response(proposal.reload), status: :created
        rescue ArgumentError => error
          raise unless error.message.match?(/available|reserved|changed|conflict|capacity/i)

          proposal.update!(status: "conflicted")
          record_assistant_audit("assistant.booking.conflict", :failed, "assistant_proposal/#{proposal.public_id}")
          render json: { error: "That opening changed before it could be booked. Check availability again.", code: "stale_availability" }, status: :conflict
        end
      end

      def show
        public_id = required_string!(params[:id], field: :id, maximum: 64)
        session_contexts = Context.where(member_session_id: current_member_session.id, practice: current_practice)
        proposal = BookingProposal.where(practice: current_practice, actor_user: current_user,
          membership: clinic_membership, assistant_context_id: session_contexts.select(:id)).find_by!(public_id:)
        context = proposal.assistant_context
        validate_context!(context)
        Clinic::Authorization.authorize_with_legacy!(actor: current_user, practice: current_practice,
          action: "appointments.read", legacy_action: "appointments.write", site: context.site)
        record_assistant_audit("assistant.proposal.read", :released, "assistant_proposal/#{proposal.public_id}")
        render json: proposal.status == "confirmed" ? receipt_response(proposal) : proposal_response(proposal)
      end

      def invalidate_context
        context = Context.where(actor_user: current_user, member_session_id: current_member_session.id)
          .find_by(public_id: session[:clinic_assistant_context_public_id])
        if context
          ContextRegistry.invalidate!(context, actor: current_user)
          Clinic::AuditRecorder.record!(practice: context.practice, actor: current_user,
            action_code: "assistant.context.invalidated", outcome: :failed,
            resource_version_ref: "assistant_context/#{context.public_id}")
        end
        session.delete(:clinic_assistant_context_public_id)
        head :no_content
      end

      private

      def require_prototype
        super
        audit_preflight_failure("assistant.workspace.denied") if performed?
      end

      def require_expected_actor
        super
        audit_preflight_failure("assistant.session.conflict") if performed?
      end

      def require_clinic
        super
        audit_preflight_failure("assistant.clinic.denied") if performed?
      end

      def require_expected_practice
        super
        audit_preflight_failure("assistant.clinic.conflict") if performed?
      end

      def require_expected_site
        super
        audit_preflight_failure("assistant.site.conflict") if performed?
      end

      def require_finalized_site_profile
        return if action_name == "invalidate_context"

        super
        audit_preflight_failure("assistant.site.denied") if performed?
      end

      def attribute_clinic_mutations
        return super unless action_name == "create_message"

        PaperTrail.request(whodunnit: current_user.id.to_s,
          controller_info: { request_id: SecureRandom.uuid }) { yield }
      end

      def assistant_input!(allowed)
        raw = request.request_parameters
        unknown = raw.keys.map(&:to_sym) - allowed
        if unknown.any?
          raise Clinic::Api::RequestParameters::Invalid.new("#{unknown.first} is not a supported field.", field: unknown.first)
        end
        ActionController::Parameters.new(raw).permit(*allowed)
      end

      def context_for!(public_id)
        id = required_string!(public_id, field: :context_id, maximum: 64)
        context = ContextRegistry.find!(public_id: id, practice: current_practice, actor: current_user,
          member_session: current_member_session)
        validate_context!(context)
        context
      rescue ContextRegistry::StaleContext
        ContextRegistry.invalidate!(context, actor: current_user) if context
        record_assistant_audit("assistant.context.conflict", :failed, "assistant_context/#{context.public_id}") if context
        render json: { error: "Your clinic, location, patient, or demo role changed. Reopen the assistant context.", code: "stale_context" }, status: :conflict
        nil
      end

      def validate_context!(context)
        site = current_clinic_site
        ContextRegistry.validate!(context, practice: current_practice, actor: current_user,
          membership: clinic_membership, member_session: current_member_session, site:, session:)
        authorize_assistant_patient!(context.patient, context.site)
        context
      rescue ContextRegistry::StaleContext
        ContextRegistry.invalidate!(context, actor: current_user) if context
        raise
      end

      def require_read_authority!(context)
        validate_context!(context)
        Clinic::Authorization.authorize_with_legacy!(actor: current_user, practice: current_practice,
          action: "appointments.read", legacy_action: "appointments.write", site: context.site)
      end

      def require_booking_authority!(context)
        validate_context!(context)
        Clinic::Authorization.authorize_with_legacy!(actor: current_user, practice: current_practice,
          action: "appointments.book", legacy_action: "appointments.write", site: context.site)
      end

      def selected_record!(context, kind, selection_id, relation)
        choice = ContextRegistry.selection!(context, kind, selection_id)
        relation.find(choice.fetch("record_id"))
      end

      def assistant_patient_scope(site)
        if current_ability.allowed_permission?("patients.read", site:)
          current_practice.patients.accessible_by(current_ability, :read)
        elsif current_ability.allowed_permission?("patients.identity.read", site:)
          current_practice.patients.where(merged_into_patient_id: nil).accessible_by(current_ability, :read_identity)
        else
          raise Clinic::Authorization::Denied
        end
      end

      def authorize_assistant_patient!(patient, site)
        action = current_ability.allowed_permission?("patients.read", site:) ? "patients.read" : "patients.identity.read"
        Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
          action:, subject: patient, site:)
        record_assistant_audit("assistant.context.read", :released, "patient/#{patient.id}")
      end

      def invalidate_pending_proposals!(context)
        proposals = context.proposals.where(status: "pending").to_a
        proposals.each do |proposal|
          record_assistant_audit("assistant.proposal.invalidated", :failed, "assistant_proposal/#{proposal.public_id}")
        end
        context.proposals.where(id: proposals.map(&:id)).update_all(status: "invalidated", updated_at: Time.current) if proposals.any?
        context.update!(opening_options: [])
      end

      def validate_time!(value)
        raise Clinic::Api::RequestParameters::Invalid.new("time must use HH:MM.", field: :time) unless value.match?(/\A(?:[01]\d|2[0-3]):[0-5]\d\z/)
      end

      def site_timezone(site)
        site.timezone_override.presence || current_practice.timezone
      end

      def proposal_response(proposal)
        display = display_for(proposal)
        { proposal_id: proposal.public_id, status: proposal.status, expires_at: proposal.expires_at.iso8601(6),
          appointment_preview: display, confirmation_required: true }
      end

      def receipt_response(proposal)
        appointment = proposal.appointment.reload
        zone = ActiveSupport::TimeZone[site_timezone(appointment.site)]
        { receipt_id: proposal.public_id, confirmed_at: proposal.confirmed_at.iso8601(6),
          appointment: {
            patient: appointment.patient.display_name,
            site: FacilitySerializer.site(appointment.site)[:name] || appointment.site.code,
            clinician: appointment.booked_clinician.display_name.presence || "Clinician",
            visit_type: appointment.visit_type.code,
            starts_at: appointment.starts_at.in_time_zone(zone).iso8601(6),
            ends_at: appointment.ends_at.in_time_zone(zone).iso8601(6),
            timezone: zone.name,
            status: appointment.status
          } }
      end

      def display_for(proposal)
        zone = ActiveSupport::TimeZone[site_timezone(proposal.site)]
        {
          patient: proposal.patient.display_name,
          site: FacilitySerializer.site(proposal.site)[:name] || proposal.site.code,
          clinician: proposal.booked_clinician.display_name.presence || "Clinician",
          visit_type: proposal.visit_type.code,
          starts_at: proposal.starts_at.in_time_zone(zone).iso8601(6),
          ends_at: proposal.ends_at.in_time_zone(zone).iso8601(6),
          timezone: zone.name
        }
      end

      def audit_context_available?
        current_user && current_practice
      rescue StandardError
        false
      end

      def audit_preflight_failure(action_code)
        return unless request.path.include?("/assistant/") && current_user && current_practice

        outcome = response.status.to_i == 403 ? :denied : :failed
        record_assistant_audit(action_code, outcome)
      end

      def record_assistant_audit(action_code, outcome, resource_version_ref = nil)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code:, outcome:, resource_version_ref:)
      end
    end
  end
end
