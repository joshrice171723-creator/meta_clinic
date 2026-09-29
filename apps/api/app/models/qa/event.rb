module Qa
  class Event < ApplicationRecord
    self.table_name = "qa_events"
    belongs_to :user
    validates :event_key, :kind, :summary, presence: true
    validates :summary, length: { maximum: 500 }
    validates :kind, format: { with: /\A[a-z][a-z0-9_]{0,59}\z/ }
    def readonly? = persisted?
  end
end
