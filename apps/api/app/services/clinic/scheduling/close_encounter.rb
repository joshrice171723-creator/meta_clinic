module Clinic
  module Scheduling
    class CloseEncounter
      def self.call(encounter:, actor:, ended_at: Time.current)
        Authorization.authorize!(actor: actor, practice: encounter.practice, action: "encounters.write", site: encounter.site)
        encounter.close!(ended_at: ended_at)
      end
    end
  end
end
