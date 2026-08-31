module Clinic
  module Authorization
    class Denied < StandardError; end

    LEGACY_ACTIONS = {
      "patients.read" => :patients_access?,
      "patients.write" => :patients_access?,
      "staff.read" => :staff_access?,
      "staff.write" => :staff_access?,
      "inventory.read" => :inventory_access?,
      "inventory.catalog" => :inventory_catalog?,
      "inventory.receive" => :inventory_receive?,
      "inventory.adjust" => :inventory_adjust?,
      "inventory.hold" => :inventory_hold?,
      "inventory.release" => :inventory_release?,
      "inventory.count" => :inventory_count?,
      "inventory.configure" => :inventory_configure?,
      "appointments.write" => :patients_access?,
      "encounters.write" => :patients_access?,
      "notes.write" => :patients_access?,
      "notes.sign" => :patients_access?,
      "observations.write" => :patients_access?,
      "messages.write" => :patients_access?,
      "documents.read" => :patients_access?,
      "billing.write" => :patients_access?,
      "roles.manage" => nil
    }.freeze

    ACTION_ALIASES = {
      "patients_access?" => "patients.read",
      "staff_access?" => "staff.read",
      "inventory_access?" => "inventory.read",
      "catalog" => "inventory.catalog",
      "receive" => "inventory.receive",
      "adjust" => "inventory.adjust",
      "hold" => "inventory.hold",
      "release" => "inventory.release",
      "count" => "inventory.count",
      "configure" => "inventory.configure"
    }.freeze

    def self.authorize!(actor:, practice:, action:, site: nil, at: Time.current)
      membership = membership_for(actor, practice)
      normalized_action = normalize_action(action)
      grants = membership.role_grants.active(at).includes(role_version: :permissions).to_a

      allowed = if grants.any?
        grants.any? { |grant| grant.applies_to?(site) && grant.role_version.permissions.any? { |permission| permission.action_code == normalized_action } }
      else
        legacy_allowed?(membership, normalized_action)
      end

      raise Denied, "Your account does not have permission for this clinic action." unless allowed

      membership
    end

    def self.allowed?(**arguments)
      authorize!(**arguments)
      true
    rescue Denied
      false
    end

    def self.normalize_action(action)
      value = action.to_s
      ACTION_ALIASES.fetch(value, value).sub(/\?\z/, "")
    end

    def self.membership_for(actor, practice)
      practice_id = practice.respond_to?(:id) ? practice.id : practice
      membership = Clinic::Membership.find_by(practice_id: practice_id, user_id: actor&.id)
      unless actor.is_a?(User) && actor.active? && membership&.active?
        raise Denied, "Your clinic session is not authorized."
      end

      membership
    end
    private_class_method :membership_for

    def self.legacy_allowed?(membership, action)
      capability = LEGACY_ACTIONS.fetch(action) { return false }
      capability.present? && membership.public_send(capability)
    end
    private_class_method :legacy_allowed?
  end
end
