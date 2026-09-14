module Clinic
  module PatientPortal
    module BookingEligibility
      MESSAGE = "Online scheduling requires an active membership. Request a call from the clinic.".freeze
      module_function

      def active?(practice:, patient:, at: Current.business_time)
        agreements = Clinic::Care::SubscriptionAgreement.where(practice_id: practice.id, patient_id: patient.id)
        return true if agreements.any? do |agreement|
          active = agreement.events.where(kind: "active").order(id: :desc).first
          agreement.current_state(at:) == "active" && active &&
            Time.iso8601(active.details.fetch("starts_at")) <= at &&
            Time.iso8601(active.details.fetch("ends_at")) > at
        end
        # Preserve clinic-recorded commercial membership, distinct from employee
        # access grants. A later nonmember entry supersedes an earlier member.
        membership = patient.patient_memberships.where(practice_id: practice.id)
          .where("effective_from <= ?", at).order(effective_from: :desc, version: :desc, id: :desc).first
        membership&.member? && membership.effective_at?(at) || false
      end
    end
  end
end
