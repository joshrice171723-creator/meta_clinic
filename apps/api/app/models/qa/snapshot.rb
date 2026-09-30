module Qa
  class Snapshot < ApplicationRecord
    self.table_name = "qa_snapshots"
    validates :key, presence: true, uniqueness: true
    def self.put(key, data)
      upsert({ key:, data:, created_at: Time.current, updated_at: Time.current }, unique_by: :key)
    end
  end
end
