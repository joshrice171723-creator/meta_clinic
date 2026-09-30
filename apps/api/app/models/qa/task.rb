require "digest"

module Qa
  class Task < ApplicationRecord
    self.table_name = "qa_tasks"
    KINDS = %w[qa_run retest issue_report question repair fixture_reset coordination].freeze
    belongs_to :user
    belongs_to :claimed_by, class_name: "User", optional: true
    validates :kind, inclusion: { in: KINDS }
    validates :recipient, inclusion: { in: %w[muse codex] }
    validates :status, inclusion: { in: %w[proposed queued claimed completed failed cancelled] }
    validates :request_key, :title, presence: true
    validates :title, length: { maximum: 200 }

    def self.fingerprint(value)
      canonical = lambda do |item|
        case item
        when Hash then item.sort.to_h.transform_values { |child| canonical.call(child) }
        when Array then item.map { |child| canonical.call(child) }
        else item
        end
      end
      Digest::SHA256.hexdigest(canonical.call(value).to_json)
    end
  end
end
