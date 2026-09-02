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

    # Existing broad permissions remain usable by established clients while
    # new roles receive only atomic capabilities. This bridge is explicit at
    # each call site and does not make an atomic capability imply another one.
    def self.authorize_with_legacy!(actor:, practice:, action:, legacy_action:, site: nil, any_site: false, at: Time.current)
      normalized = Ability.normalize_permission(action)
      ability = Ability.new(actor, practice: practice, at: at)
      return ability.membership if ability.allowed_permission?(normalized, site: site, any_site: any_site)

      legacy = Ability.normalize_permission(legacy_action)
      return ability.membership if ability.allowed_permission?(legacy, site: site, any_site: any_site)

      AuditRecorder.record!(practice: practice, actor: actor, action_code: normalized, outcome: :denied)
      raise Denied, "Your account does not have permission for this clinic action."
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
