module Clinic
  module ServiceOfferingSerializer
    def self.call(offering)
      {
        id: offering.id,
        practice_id: offering.practice_id,
        name: offering.name,
        code: offering.code,
        description: offering.description,
        contact_instructions: offering.contact_instructions,
        referral_instructions: offering.referral_instructions,
        visit_type_id: offering.visit_type_id,
        billing_service_id: offering.billing_service_id,
        duration_minutes: offering.duration_minutes,
        modality: offering.modality,
        booking_required: offering.booking_required,
        requires_room: offering.requires_room,
        public_visible: offering.public_visible,
        status: offering.status,
        eligible_site_ids: offering.sites.map(&:id).sort,
        eligible_clinician_ids: offering.clinicians.map(&:id).sort,
        published_at: offering.published_at&.iso8601(6),
        retired_at: offering.retired_at&.iso8601(6),
        lock_version: offering.lock_version,
        created_at: offering.created_at.iso8601(6),
        updated_at: offering.updated_at.iso8601(6)
      }
    end
  end
end
