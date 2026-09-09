module Clinic
  module PatientPortal
    class InvitationsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("patient_portal.identity.invite", "roles.manage") }

      def create
        input = parameter_hash!(:patient_portal_invitation, %i[patient_id])
        patient = current_practice.patients.find(requested_id!(input[:patient_id], :patient_id))
        contact = patient.contacts.contact_type_email.where(effective_until: nil).order(created_at: :desc, id: :desc).first
        raise ArgumentError, "Record a current patient email before creating portal access." unless contact

        result = InviteIdentity.call(practice: current_practice, patient:, email_address: contact.contact_value,
          actor: current_user)
        identity = result.fetch(:identity)
        render json: { invitation: {
          identity_id: identity.id,
          status: identity.status,
          expires_at: identity.invitation_expires_at.iso8601(6),
          email_address: identity.user.email_address,
          activation_path: "/patient-portal/activate#token=#{ERB::Util.url_encode(result.fetch(:token))}"
        } }, status: :created
      end
    end
  end
end
