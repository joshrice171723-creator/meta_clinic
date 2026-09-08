module Clinic
  module Telehealth
    module ExpireAccess
      module_function

      def call(now: Time.current, limit: 100)
        expired = JoinGrant.where(revoked_at: nil).where("expires_at <= ?", now).order(:id).limit(limit)
        expired.each { |grant| grant.update!(revoked_at: now, revocation_reason: "expired") }
        Visit.where.not(scribe_capture_owner_participant_id: nil).where("scribe_capture_lease_expires_at <= ?", now)
          .order(:id).limit(limit).find_each do |visit|
            visit.with_lock do
              next unless visit.scribe_capture_lease_expires_at && visit.scribe_capture_lease_expires_at <= now
              visit.update!(scribe_capture_owner_participant_id: nil, scribe_capture_owner_token_digest: nil,
                scribe_capture_lease_expires_at: nil, scribe_capture_epoch: visit.scribe_capture_epoch + 1)
            end
          end
        expired.size
      end
    end
  end
end
