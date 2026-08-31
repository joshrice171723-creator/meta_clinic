module Clinic
  module Inventory
    class Profile < ApplicationRecord
      self.table_name = "clinic_inventory_profiles"
      include Clinic::TenantScoped
      has_many :receipts, class_name: "Clinic::Inventory::Receipt", foreign_key: :profile_id, dependent: :restrict_with_error
      has_many :counts, class_name: "Clinic::Inventory::Count", foreign_key: :profile_id, dependent: :restrict_with_error
      has_many :entries, class_name: "Clinic::Inventory::Entry", foreign_key: :profile_id, dependent: :restrict_with_error
      validates :status, inclusion: { in: %w[draft synthetic suspended retired] }
      validates :reason, presence: true, length: { maximum: 200 }
      before_update { throw :abort }
      before_destroy { throw :abort }

      def self.revise!(practice:, actor:, status:, reason:, operator_reference: nil)
        practice.with_lock do
          Clinic::Inventory::Access.with(practice.id, actor, "configure") do |previous|
            create!(practice: practice, version: previous.version + 1, status: status, reason: reason, actor_id: actor.id, operator_reference: operator_reference)
          end
        end
      end
    end
  end
end
