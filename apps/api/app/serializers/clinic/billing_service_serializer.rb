module Clinic
  module BillingServiceSerializer
    def self.call(service)
      {
        id: service.id,
        practice_id: service.practice_id,
        name: service.name,
        code: service.code,
        description: service.description,
        unit_amount: service.unit_amount.to_s("F"),
        currency: service.currency,
        active: service.active,
        lock_version: service.lock_version,
        created_at: service.created_at.iso8601(6),
        updated_at: service.updated_at.iso8601(6)
      }
    end
  end
end
