module Clinic
  module Operations
    module ClinicalTaskSerializer
      def self.call(task)
        {
          id: task.id.to_s, patient_id: task.patient_id.to_s,
          encounter_id: task.encounter_id.to_s, kind: task.kind,
          status: task.status, priority: task.priority, pool_code: task.pool_code,
          assigned_to_membership_id: task.assigned_to_membership_id&.to_s,
          due_at: task.due_at&.iso8601(6), resolved_at: task.resolved_at&.iso8601(6),
          resolution_code: task.resolution_code, source_type: task.source_type,
          source_id: task.source_id.to_s, version: task.lock_version,
          updated_at: task.updated_at.iso8601(6)
        }
      end

      def self.collection(tasks)
        tasks.map { |task| call(task) }
      end
    end
  end
end
