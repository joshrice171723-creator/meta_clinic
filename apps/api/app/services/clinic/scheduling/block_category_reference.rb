module Clinic
  module Scheduling
    # Called by the capacity owner inside its existing authorized transaction.
    # No change to interval/resource compatibility or clinical capacity rules.
    class BlockCategoryReference
      def self.resolve(practice:, site:, actor:, expected_revision:, category_key:)
        Clinic::Authorization.authorize!(practice:, actor:, action: "facilities.write", site:)
        raise ArgumentError, "The location must belong to this clinic." unless site.practice_id == practice.id
        # The capacity transaction retains this lock until its block is committed.
        site.lock!
        current = OperationalPolicyVersion.current(practice:, site:)
        categories = current&.block_categories || []
        if categories.empty? && category_key.blank?
          return { operational_policy_version_id: nil, reason_category_key: nil }
        end
        unless (current&.revision || 0) == expected_revision
          raise ActiveRecord::StaleObjectError.new(site, "select block reason category")
        end
        category = categories.find { |entry| entry.fetch("key") == category_key.to_s }
        raise ArgumentError, "Choose a category from the current clinic policy." unless category
        { operational_policy_version_id: current.id, reason_category_key: category.fetch("key") }
      end

      def self.snapshot(practice:, site:, policy_id:, category_key:)
        return { state: "not_recorded", key: nil, label: nil, policy_revision: nil } unless policy_id && category_key
        policy = OperationalPolicyVersion.find_by(practice:, site:, id: policy_id)
        category = policy&.block_categories&.find { |entry| entry.fetch("key") == category_key }
        return { state: "unavailable", key: category_key, label: nil, policy_revision: nil } unless category
        { state: "recorded", key: category_key, label: category.fetch("label"), policy_revision: policy.revision }
      end
    end
  end
end
