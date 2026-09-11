require "uri"

module Clinic
  module PatientPortal
    class PatientEducationMaterialsController < BaseController
      def index
        events = portal_events.to_a
        acknowledgments = PatientEducationAcknowledgment.for_practice(portal_practice)
          .where(patient: portal_patient, user: current_user, education_event_id: events.map(&:id))
          .index_by(&:education_event_id)
        record_portal_read("patient_portal.education_material.read")
        render json: {
          materials: events.filter_map do |event|
            material_payload(event, acknowledgment: acknowledgments[event.id])
          end
        }
      end

      def create
        identity = patient_portal_identity
        unless identity
          render json: { error: "An active patient portal account is required to acknowledge this material." },
            status: :forbidden
          return
        end

        input = parameter_hash!(:patient_education_acknowledgment, %i[request_key])
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        education_event_id = requested_id!(params[:education_event_id], :education_event_id)
        event = nil
        acknowledgment = nil
        created = false

        identity.with_lock do
          identity.reload
          unless identity.active? && identity.user_id == current_user.id &&
            identity.practice_id == portal_practice.id && identity.patient_id == portal_patient.id
            raise Clinic::Authorization::Denied
          end

          event = portal_events.find(education_event_id)
          raise ArgumentError, "This education material does not have a valid web link." unless safe_material_url(event.material_url)

          acknowledgment = PatientEducationAcknowledgment.for_practice(portal_practice)
            .find_by(education_event: event, user: current_user)
          created = acknowledgment.nil?
          if created
            acknowledgment = PatientEducationAcknowledgment.create!(
              practice: portal_practice,
              patient: portal_patient,
              education_event: event,
              identity: identity,
              user: current_user,
              request_key: request_key,
              source: "patient_portal",
              acknowledged_at: Current.business_time
            )
            Clinic::AuditRecorder.record!(
              practice: portal_practice,
              actor: current_user,
              action_code: "patient_portal.education_material.acknowledge",
              outcome: :committed,
              resource_version_ref: "patient_education/#{event.id}:acknowledgment/#{acknowledgment.id}"
            )
          end
        end
        render json: { material: material_payload(event, acknowledgment:) }, status: created ? :created : :ok
      end

      private

      def portal_events
        Clinic::Care::PatientEducationEvent.where(
          practice: portal_practice,
          patient: portal_patient,
          delivery_method: "portal"
        ).order(recorded_at: :desc, id: :desc).limit(100)
      end

      def material_payload(event, acknowledgment:)
        material_url = safe_material_url(event.material_url)
        return unless material_url

        {
          id: event.id,
          topic_code: event.topic_code,
          topic_title: event.topic_title,
          material_title: event.material_title,
          material_url: material_url,
          language: event.language,
          delivered_at: event.recorded_at.iso8601(6),
          acknowledged_at: acknowledgment&.acknowledged_at&.iso8601(6)
        }
      end

      def safe_material_url(value)
        uri = URI.parse(value.to_s)
        return unless uri.is_a?(URI::HTTP) && uri.host.present? && uri.userinfo.nil?

        uri.to_s
      rescue URI::InvalidURIError
        nil
      end
    end
  end
end
