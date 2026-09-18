module Clinic
  module Scheduling
    module AssignEncounterRoom
      module_function

      def call(practice:, actor:, encounter:, room_id:, request_key:)
        Authorization.authorize!(actor:, practice:, action: "encounters.write", site: encounter.site)
        room = practice.rooms.find(room_id)
        raise ArgumentError, "Choose a room at the encounter site." if encounter.site_id.blank? || room.site_id != encounter.site_id
        raise ArgumentError, "A telehealth encounter cannot be assigned a physical room." if encounter.appointment&.visit_modality == "video"

        payload = { encounter_id: encounter.id, room_id: room.id }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "scheduling.encounter.assign_room", request_key:, resource: encounter,
          authorization_action: "encounters.write",
          authorization: -> { Authorization.authorize!(actor:, practice:, action: "encounters.write", site: encounter.site) },
          payload:, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Clinic::Encounter.find_by(practice:, id: receipt.resource_id) }
        ) do
          encounter.with_lock do
            encounter.update!(room: room)
            encounter
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
