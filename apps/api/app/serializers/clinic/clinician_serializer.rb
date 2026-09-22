module Clinic
  module ClinicianSerializer
    def self.call(profile, detail: false)
      payload = {
        id: profile.id,
        membership_id: profile.membership_id,
        display_name: profile.display_name,
        reference: profile.reference
      }
      return payload unless detail

      payload.merge(
        assignments: profile.assignments.sort_by { |row| [ row.effective_from, row.id ] }.map { |assignment|
          {
            id: assignment.id,
            department_id: assignment.department_id,
            site_id: assignment.site_id,
            effective_from: assignment.effective_from&.iso8601(6),
            effective_until: assignment.effective_until&.iso8601(6)
          }
        },
        credentials: profile.credentials.sort_by(&:id).map { |credential|
          {
            id: credential.id,
            credential_type: credential.credential_type,
            jurisdiction: credential.jurisdiction,
            review_status: credential.review_status,
            valid_until: credential.valid_until&.iso8601(6)
          }
        }
      )
    end
  end
end
