module Platform
  class PageVisit < ApplicationRecord
    self.table_name = "platform_page_visits"

    PATHS = %w[/joshua /demo].freeze
    validates :path, inclusion: { in: PATHS }
    validates :event_id, :visitor_id, presence: true
    validates :referrer_host, length: { maximum: 253 }
  end
end
