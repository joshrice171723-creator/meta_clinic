module Clinic
  module Authorization
    class Denied < StandardError; end

    def self.authorize!(actor:, practice:, action:, site: nil, subject: nil, any_site: false, at: Time.current)
      normalized_action = Ability.normalize_permission(action)
      rule = Ability.rule_for(normalized_action)
      ability = Ability.new(actor, practice: practice, at: at)
      target = subject || Ability.subjects_for(normalized_action).first
      can_action = Ability.action_for(normalized_action)

      allowed = if subject
        rule && target && can_action && ability.can?(can_action, subject)
      else
        ability.allowed_permission?(normalized_action, site: site, any_site: any_site)
      end
      unless allowed
        AuditRecorder.record!(practice: practice, actor: actor, action_code: normalized_action, outcome: :denied)
        raise Denied, "Your account does not have permission for this clinic action."
      end

      ability.membership
    end

    def self.allowed?(**arguments)
      authorize!(**arguments)
      true
    rescue Denied
      false
    end

    def self.normalize_action(action)
      Ability.normalize_permission(action)
    end
  end
end
