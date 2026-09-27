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
        overdue = tasks.where("due_at < ?", Current.business_time).count

        {
          definition: Catalog::OPEN_CLINICAL_WORK, practice_id: practice.id, site_id: site&.id,
          as_of: Current.business_time.iso8601(6), freshness: "live_source_query_no_cache",
          total: tasks.count, overdue_count: overdue,
          kinds: Clinic::ClinicalTask::KINDS.filter_map do |kind|
            counts = Clinic::ClinicalTask::ACTIVE_STATES.index_with { |state| grouped.fetch([ kind, state ], 0) }
            { kind:, counts:, total: counts.values.sum } if counts.values.sum.positive?
          end
        }
      end
    end
  end
end
