module Clinic
  module Telehealth
    module Scribe
      module BindScribeEncounter
        module_function

        def call(visit:, actor:)
          Support.ensure_scribe_policy!(visit)
          clinical = visit.encounter || raise(Clinic::Telehealth::Error.new(
            "The video visit must have its clinical encounter before Scribe is requested.",
            code: "scribe_encounter_unbound", status: :conflict
          ))
          if visit.scribe_encounter
            Support.ensure_exact_binding!(visit)
            return visit.scribe_encounter
          end

          linked_ids = Clinic::Telehealth::Visit.where(practice_id: visit.practice_id)
            .where.not(scribe_encounter_id: nil).select(:scribe_encounter_id)
          existing = Clinic::Scribe::Encounter.where(practice_id: visit.practice_id,
            patient_id: visit.patient_id, clinical_encounter_id: clinical.id, deleted_at: nil)
            .where.not(id: linked_ids).order(:id).first
          scribe = existing || Clinic::Scribe::Workflow.create_encounter(
            practice: visit.practice, actor:, patient: visit.patient,
            site: clinical.site, clinical_encounter: clinical
          )
          visit.update!(scribe_encounter: scribe)
          Support.ensure_exact_binding!(visit.reload)
        end
      end
    end
  end
end
