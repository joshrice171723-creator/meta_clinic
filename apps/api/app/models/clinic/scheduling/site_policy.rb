module Clinic
  module Scheduling
    class SitePolicy < ApplicationRecord
      self.table_name = "clinic_site_scheduling_policies"
      include TenantScoped

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :written_by_membership, class_name: "Clinic::Membership"

      def self.current(practice:, site:)
        where(practice: practice, site: site).where("effective_from <= ?", Current.business_time)
          .order(revision: :desc).first
      end

      def self.snapshot(policy)
        {
          revision: policy&.revision || 0,
          recurrence_enabled: policy&.recurrence_enabled || false,
          overbook_enabled: policy&.overbook_enabled || false,
          eligible_visit_type_ids: policy&.eligible_visit_type_ids || [],
          effective_from: policy&.effective_from&.iso8601(6),
          written_by_membership_id: policy&.written_by_membership_id
        }
      end

      def self.save_revision!(practice:, site:, actor:, expected_revision:, recurrence_enabled:, overbook_enabled:,
        eligible_visit_type_ids:)
        membership = Authorization.authorize!(actor: actor, practice: practice, action: "facilities.write", site: site)
        ids = Array(eligible_visit_type_ids).map { |id| Integer(id.to_s, 10) rescue nil }
        raise ArgumentError, "Choose valid visit types for overbooking." if ids.any?(&:nil?) || ids.uniq.length != ids.length
        if overbook_enabled && ids.empty?
          raise ArgumentError, "Choose at least one eligible visit type before enabling overbooking."
        end
        if ids.any? && practice.visit_types.active.where(id: ids).count != ids.length
          raise ArgumentError, "Every eligible visit type must be active in this clinic."
        end

        ApplicationRecord.transaction do
          site.lock!
          previous = current(practice: practice, site: site)
          revision = previous&.revision || 0
          raise ArgumentError, "Scheduling policy changed. Review current settings." unless revision == expected_revision

          create!(practice: practice, site: site, revision: revision + 1,
            recurrence_enabled: recurrence_enabled, overbook_enabled: overbook_enabled,
            eligible_visit_type_ids: ids.sort, written_by_membership: membership,
            effective_from: Current.business_time)
        end
      end
    end
  end
end
