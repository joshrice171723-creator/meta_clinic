module Clinic
  module StaffMemberSerializer
    def self.call(member)
      {
        id: member.id,
        display_name: member.display_name,
        job_title: member.job_title,
        active: member.active,
        primary_address_version_id: member.primary_address_version_id
      }
    end
  end
end
