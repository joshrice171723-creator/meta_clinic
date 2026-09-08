module Clinic
  class StaffMessageRequest < ApplicationRecord
    self.table_name = "clinic_staff_message_requests"
    include TenantScoped
    include Auditable

    STATES = %w[open acknowledged in_progress resolved declined expired].freeze
    TRANSITIONS = {
      "open" => %w[acknowledged in_progress resolved declined expired],
      "acknowledged" => %w[in_progress resolved declined expired],
      "in_progress" => %w[resolved declined expired],
      "resolved" => [], "declined" => [], "expired" => []
    }.freeze

    belongs_to :message, class_name: "Clinic::StaffMessage"
    belongs_to :assignee_membership, class_name: "Clinic::Membership", optional: true
    has_many :escalations, class_name: "Clinic::StaffMessageEscalation", foreign_key: :request_id, dependent: :restrict_with_error

    validates :state, inclusion: { in: STATES }
    validates :due_at, presence: true
    validate :related_records_belong_to_practice

    def transition_to!(target, resolution_code: nil, resolution_note: nil)
      target = target.to_s
      unless TRANSITIONS.fetch(state, []).include?(target)
        raise ArgumentError, "Request cannot transition from #{state} to #{target}."
      end

      update!(state: target, resolved_at: target == "resolved" ? Time.current : resolved_at,
        resolution_code: resolution_code, resolution_note: resolution_note)
      self
    end

    private

    def related_records_belong_to_practice
      { message: message, assignee_membership: assignee_membership }.each do |attribute, record|
        errors.add(attribute, "must belong to this practice") if record && record.practice_id != practice_id
      end
    end
  end
end
