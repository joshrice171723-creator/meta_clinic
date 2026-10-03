module Clinic
  module PatientPortal
    class AppointmentRequestsController < BaseController
      REQUEST_INCLUDES = [ :site, :visit_type, :source_site, :source_appointment, :patient,
        { appointment: [ :site, :room, :booked_clinician, :visit_type,
          :telehealth_visit ] } ].freeze
      APPOINTMENT_INCLUDES = [ :site, :room, :booked_clinician, :visit_type, :encounter, :telehealth_visit ].freeze

      rescue_from ActiveRecord::StaleObjectError do
        render json: {
          error: "This appointment changed. Reload your appointments before requesting a change.",
          code: "stale_record"
        }, status: :conflict
      end
      rescue_from Clinic::Idempotency::Conflict do |error|
        render json: { error: error.message, code: "request_conflict" }, status: :conflict
      end

      def index
        request_scope = AppointmentRequest.for_practice(portal_practice).where(patient: portal_patient)
        ExpireAppointmentRequests.call(scope: request_scope, actor: current_user)
        requests = request_scope.includes(*REQUEST_INCLUDES).recent.limit(20)
        appointments = upcoming_appointments.to_a
        pending_change_ids = AppointmentConfirmation.pending_change_ids(
          practice: portal_practice,
          patient: portal_patient,
          appointment_ids: appointments.map(&:id)
        )
        record_portal_read("patient_portal.appointment_request.read")
        render json: {
          appointment_requests: requests.map { |request| AppointmentRequestSerializer.call(request) },
          upcoming_appointments: appointments.map do |appointment|
            AppointmentConfirmation.portal_appointment(
              appointment,
              pending_change: pending_change_ids.include?(appointment.id)
            )
          end,
          options: request_options
        }
      end

      def create
        input = parameter_hash!(
          :appointment_request,
          %i[request_key request_kind source_appointment_id source_appointment_updated_at starts_at ends_at site_id visit_type_id requested_modality]
        )
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        normalized = normalized_request(input)
        normalized[:requested_modality] ||= "in_person" if normalized[:request_kind] == "new_booking"
        existing = AppointmentRequest.find_by(practice: portal_practice, request_key: request_key)
        normalized[:requested_modality] ||= existing&.requested_modality
        return render_existing(existing, normalized:) if existing

        request = AppointmentRequest.transaction do
          portal_practice.lock!
          if normalized[:request_kind] == "new_booking" && !BookingEligibility.active?(practice: portal_practice, patient: portal_patient)
            raise ArgumentError, BookingEligibility::MESSAGE
          end
          source_appointment = appointment_change_source!(normalized)
          normalized[:requested_modality] ||= source_appointment&.visit_modality || "in_person" unless normalized[:request_kind] == "cancel"
          validate_request!(normalized, source_appointment)
          site = normalized[:site_id] ? portal_practice.sites.where(status: "active").find(normalized[:site_id]) : nil
          visit_type = normalized[:visit_type_id] ? portal_practice.visit_types.active.find(normalized[:visit_type_id]) : nil
          if normalized[:request_kind] == "new_booking"
            features = Clinic::Configuration::PracticeFeatures.snapshot(practice: portal_practice, site: site)
            unless Clinic::Configuration::StarterProfile.ready?(site, features)
              raise ArgumentError, "Choose a location with completed specialty setup before requesting a new appointment."
            end
            Clinic::Configuration::StarterProfile.require_visit!(practice: portal_practice, site: site, visit_type: visit_type) if visit_type
          end
          validate_modality!(normalized, site: site || source_appointment&.site,
            visit_type: visit_type || source_appointment&.visit_type, source_appointment: source_appointment)
          ensure_no_patient_overlap!(normalized, source_appointment) unless normalized[:request_kind] == "cancel"

          AppointmentRequest.create!(
            practice: portal_practice,
            request_key: request_key,
            request_kind: normalized[:request_kind],
            patient: portal_patient,
            identity: patient_portal_identity,
            starts_at: normalized[:starts_at],
            ends_at: normalized[:ends_at],
            site: site,
            visit_type: visit_type,
            requested_modality: normalized[:requested_modality],
            source_appointment: source_appointment,
            source_appointment_updated_at: source_appointment&.updated_at,
            source_starts_at: source_appointment&.starts_at,
            source_ends_at: source_appointment&.ends_at,
            source_site: source_appointment&.site,
            source_status: source_appointment&.status,
            requested_at: Current.business_time,
            status: :pending
          )
        end
        record_portal_read("patient_portal.appointment_request.create")
        render json: { appointment_request: AppointmentRequestSerializer.call(request) }, status: :created
      rescue ActiveRecord::RecordNotUnique
        retry_existing = AppointmentRequest.find_by(practice: portal_practice, request_key: request_key)
        raise unless retry_existing

        render_existing(retry_existing, normalized:)
      end

      private

      def normalized_request(input)
        {
          request_kind: enum_param!(
            input[:request_kind].presence || "new_booking",
            field: :request_kind,
            allowed: AppointmentRequest.request_kinds.keys
          ),
          source_appointment_id: input[:source_appointment_id].present? ?
            integer_id!(input[:source_appointment_id], field: :source_appointment_id) : nil,
          source_appointment_updated_at: input[:source_appointment_updated_at].present? ?
            time_param!(input[:source_appointment_updated_at], field: :source_appointment_updated_at) : nil,
          starts_at: input[:starts_at].present? ? time_param!(input[:starts_at], field: :starts_at) : nil,
          ends_at: input[:ends_at].present? ? time_param!(input[:ends_at], field: :ends_at) : nil,
          site_id: input[:site_id].present? ? integer_id!(input[:site_id], field: :site_id) : nil,
          visit_type_id: input[:visit_type_id].present? ? integer_id!(input[:visit_type_id], field: :visit_type_id) : nil,
          requested_modality: input[:requested_modality].presence && enum_param!(input[:requested_modality],
            field: :requested_modality, allowed: %w[in_person video])
        }
      end

      def compatible?(request, normalized:)
        request.patient_id == portal_patient.id && request.identity_id == patient_portal_identity&.id &&
          request.request_kind == normalized[:request_kind] &&
          request.source_appointment_id == normalized[:source_appointment_id] &&
          request.source_appointment_updated_at == normalized[:source_appointment_updated_at] &&
          request.starts_at == normalized[:starts_at] && request.ends_at == normalized[:ends_at] &&
          request.site_id == normalized[:site_id] && request.visit_type_id == normalized[:visit_type_id] &&
          request.requested_modality == normalized[:requested_modality]
      end

      def render_existing(request, normalized:)
        unless compatible?(request, normalized:)
          raise Clinic::Idempotency::Conflict, "This request key was already used for different appointment data."
        end

        render json: { appointment_request: AppointmentRequestSerializer.call(request) }, status: :ok
      end

      def appointment_change_source!(normalized)
        return if normalized[:request_kind] == "new_booking"
        raise ArgumentError, "Choose the appointment to change." unless normalized[:source_appointment_id]
        unless normalized[:source_appointment_updated_at]
          raise ArgumentError, "Reload the appointment before requesting a change."
        end

        source = portal_patient.appointments.lock.includes(:encounter).find(normalized[:source_appointment_id])
        unless source.updated_at == normalized[:source_appointment_updated_at]
          raise ActiveRecord::StaleObjectError.new(source, "request appointment change")
        end
        eligible = %w[scheduled confirmed].include?(source.status) && source.starts_at > Current.business_time && source.encounter.nil?
        unless eligible
          raise ArgumentError, "Only an upcoming scheduled or confirmed appointment that has not started can be changed."
        end

        source
      end

      def validate_request!(normalized, source_appointment)
        if normalized[:request_kind] == "new_booking"
          if source_appointment || normalized[:source_appointment_id] || normalized[:source_appointment_updated_at]
            raise ArgumentError, "A new appointment request cannot include an existing appointment."
          end
        elsif normalized[:site_id] || normalized[:visit_type_id]
          raise ArgumentError, "Location and visit type stay with the existing appointment."
        end

        if normalized[:request_kind] == "cancel"
          if normalized[:starts_at] || normalized[:ends_at] || normalized[:requested_modality]
            raise ArgumentError, "A cancellation request cannot include a preferred time window."
          end
          return
        end

        starts_at = normalized[:starts_at]
        ends_at = normalized[:ends_at]
        raise ArgumentError, "Choose a preferred start and end time." unless starts_at && ends_at
        raise ArgumentError, "Choose an end time after the start time." unless ends_at > starts_at
        raise ArgumentError, "Appointment requests must start in the future." unless starts_at > Current.business_time
        raise ArgumentError, "Choose a time window no longer than four hours." if ends_at - starts_at > 4.hours
      end

      def ensure_no_patient_overlap!(normalized, source_appointment)
        appointments = portal_patient.appointments.where(status: %w[scheduled confirmed])
        appointments = appointments.where.not(id: source_appointment.id) if source_appointment
        conflict = appointments.where(
          "starts_at < ? AND ends_at > ?",
          normalized[:ends_at],
          normalized[:starts_at]
        ).exists?
        raise ArgumentError, "That time overlaps an existing appointment." if conflict
      end

      def validate_modality!(normalized, site:, visit_type:, source_appointment:)
        return unless normalized[:requested_modality] == "video"
        return if source_appointment&.visit_modality == "video"

        raise ArgumentError, "Choose a clinic location and visit type for a video request." unless site && visit_type
        Clinic::Configuration::StarterProfile.require_service!(practice: portal_practice, site: site, service: "telehealth")
        rules = Clinic::Telehealth::VisitTypeRule.where(practice_id: portal_practice.id, visit_type_id: visit_type.id)
        rule = rules.find_by(site_id: site.id) || rules.find_by(site_id: nil)
        unless rule&.enabled?
          raise ArgumentError, "Video is not available for this visit type and clinic location."
        end
      end

      def upcoming_appointments
        portal_patient.appointments.where(status: %w[scheduled confirmed])
          .where("starts_at > ?", Current.business_time)
          .includes(*APPOINTMENT_INCLUDES)
          .order(:starts_at, :id)
      end

      def request_options
        setting = Clinic::Telehealth::Setting.find_by(practice_id: portal_practice.id)
        video_ready = Clinic::Telehealth::Config.configured_for?(setting) && setting&.enabled? &&
          setting.active_policy_version&.published? && setting.health_status == "ready"
        video_rules = Clinic::Telehealth::VisitTypeRule.where(practice_id: portal_practice.id).to_a
        sites = portal_practice.sites.where(status: "active").order(:code, :id).filter_map do |site|
          features = Clinic::Configuration::PracticeFeatures.snapshot(practice: portal_practice, site: site)
          next unless Clinic::Configuration::StarterProfile.ready?(site, features)

          video_ids = if video_ready && features[:service_scope].include?("telehealth")
            features[:available_visit_type_ids].select do |id|
              rule = video_rules.find { |item| item.visit_type_id == id && item.site_id == site.id } ||
                video_rules.find { |item| item.visit_type_id == id && item.site_id.nil? }
              rule&.enabled?
            end
          else
            []
          end
          AppointmentRequestSerializer.site(site).merge(available_visit_type_ids: features[:available_visit_type_ids],
            video_visit_type_ids: video_ids)
        end
        visit_type_ids = sites.flat_map { |site| site[:available_visit_type_ids] }.uniq
        video_visit_type_ids = sites.flat_map { |site| site[:video_visit_type_ids] }.uniq
        {
          can_request_new_booking: sites.any? && BookingEligibility.active?(practice: portal_practice, patient: portal_patient),
          booking_requirement: BookingEligibility::MESSAGE,
          video_connection_ready: !!video_ready,
          sites: sites,
          visit_types: portal_practice.visit_types.active.where(id: visit_type_ids).order(:code, :id).map do |visit_type|
            AppointmentRequestSerializer.visit_type(visit_type,
              allowed_modalities: video_visit_type_ids.include?(visit_type.id) ? %w[in_person video] : %w[in_person])
          end
        }
      end
    end
  end
end
