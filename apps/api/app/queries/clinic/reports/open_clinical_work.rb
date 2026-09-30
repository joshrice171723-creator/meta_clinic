module Clinic
  module Reports
    class OpenClinicalWork
      def self.call(practice:, actor:, site: nil)
        raise ActiveRecord::RecordNotFound if site && site.practice_id != practice.id

        ability = Ability.new(actor, practice: practice)
        if site
          Clinic::Authorization.authorize!(actor:, practice:, action: "patients.read", site:)
          Clinic::Authorization.authorize!(actor:, practice:, action: "encounters.write", site:)
        elsif !ability.practice_scope_for?("patients.read") || !ability.practice_scope_for?("encounters.write")
          raise Clinic::Authorization::Denied
        end

        tasks = Clinic::ClinicalTask.where(practice_id: practice.id, state: Clinic::ClinicalTask::ACTIVE_STATES)
        tasks = tasks.where(site_id: site.id) if site
        grouped = tasks.group(:task_kind, :state).count
        as_of = Current.business_time
        overdue_tasks = tasks.where("due_at < ?", as_of)
        owner_totals = tasks.group(:assigned_to_membership_id).count
        owner_overdue = overdue_tasks.group(:assigned_to_membership_id).count
        owners = practice.memberships.where(id: owner_totals.keys.compact).includes(:user).index_by(&:id)

        {
          definition: Catalog::OPEN_CLINICAL_WORK, practice_id: practice.id, site_id: site&.id,
          as_of: as_of.iso8601(6), freshness: "live_source_query_no_cache",
          total: owner_totals.values.sum, overdue_count: owner_overdue.values.sum,
          owners: owner_totals.map do |membership_id, total|
            owner = owners[membership_id]
            label = membership_id.nil? ? "Unassigned" : (owner&.user&.email_address || "Unavailable owner")
            { membership_id:, label:, total:, overdue_count: owner_overdue.fetch(membership_id, 0) }
          end.sort_by { |row| [ row[:membership_id].nil? ? 0 : 1, row[:label], row[:membership_id].to_i ] },
          kinds: Clinic::ClinicalTask::KINDS.filter_map do |kind|
            counts = Clinic::ClinicalTask::ACTIVE_STATES.index_with { |state| grouped.fetch([ kind, state ], 0) }
            { kind:, counts:, total: counts.values.sum } if counts.values.sum.positive?
          end
        }
      end
    end
  end
end
