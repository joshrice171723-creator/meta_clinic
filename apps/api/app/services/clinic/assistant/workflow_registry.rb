module Clinic
  module Assistant
    class WorkflowRegistry
      HANDLER_NAMES = %w[
        Clinic::Assistant::Workflows::Clinical
        Clinic::Assistant::Workflows::Administration
        Clinic::Assistant::Workflows::Operations
        Clinic::Assistant::Workflows::Office
        Clinic::Assistant::Workflows::Scheduling
      ].freeze
      GATED_KEYS = {
        "care.encounter_complete" => "Encounter completion remains a clinician decision in the chart workspace.",
        "care.note_sign" => "Clinical note signing remains a clinician action in the chart workspace.",
        "care.refill_approve" => "Refill approval remains a separate human review.",
        "care.correction_decide" => "A correction requester cannot decide that correction.",
        "schedule.recurring_change" => "Recurring schedule changes remain behind their existing review gate.",
        "schedule.overbook" => "Overbooking remains behind its existing authorization gate.",
        "external.send" => "External messages are not available through the assistant."
      }.freeze
      HUMAN_ONLY = [
        ["care.note_sign", "Sign clinical note", "clinical", "Signing remains a separate clinician action in the chart workspace.", "/clinic/patients"],
        ["care.encounter_complete", "Complete an encounter", "clinical", "Encounter completion remains a clinician decision in the chart workspace.", "/clinic/patients"],
        ["care.refill_approve", "Approve a refill", "clinical", "Refill approval remains a separate human review.", "/clinic/patients"],
        ["care.correction_decide", "Decide a correction request", "clinical", "A correction requester cannot decide that correction.", "/clinic/patients"],
        ["schedule.recurring_change", "Change a recurring schedule", "scheduling", "Recurring schedule changes remain behind their existing review gate.", "/clinic/schedule"],
        ["schedule.overbook", "Overbook an appointment", "scheduling", "Overbooking remains behind its existing authorization gate.", "/clinic/schedule"],
        ["messaging.external_send", "Send an external message", "communications", "External messages are not available through the assistant.", "/clinic/messages"],
        ["security.grant_role", "Grant or change access", "security", "Access changes remain in the dedicated membership review.", "/clinic/settings"],
        ["security.invite_user", "Invite a user", "security", "User invitations remain in the dedicated membership workflow.", "/clinic/settings"],
        ["settings.shared_reset", "Reset shared clinic settings", "settings", "Shared settings resets require the existing protected workflow.", "/clinic/settings"],
        ["external.integration_activate", "Activate an external integration", "integrations", "External integration activation remains in its protected setup workflow.", "/clinic/settings"]
      ].freeze

      class Unavailable < StandardError; end
      class Gated < StandardError; end

      def self.definitions
        entries = HANDLER_NAMES.flat_map do |name|
          handler = name.safe_constantize
          next [] unless handler
          handler.definitions.map { |definition| normalize_definition(definition, handler) }
        end
        duplicate = entries.group_by { |entry| entry.fetch("key") }.find { |_key, values| values.length > 1 }
        raise "Duplicate assistant workflow key: #{duplicate.first}" if duplicate

        human_gates = HUMAN_ONLY.to_h { |key, title, domain, reason, path| [key, [title, domain, reason, path]] }
        entries = entries.map do |entry|
          gate = human_gates[entry.fetch("key")]
          gate ? entry.merge("gated_reason" => gate[2], "source_path" => gate[3]) : entry
        end
        missing_gates = human_gates.filter_map do |key, (title, domain, reason, source_path)|
          next if entries.any? { |entry| entry.fetch("key") == key }
          { "key" => key, "title" => title, "domain" => domain, "description" => reason,
            "kind" => "gated", "fields" => [], "patient_required" => false,
            "encounter_required" => false, "gated_reason" => reason,
            "source_path" => source_path, "handler" => nil }
        end
        entries + missing_gates
      end

      def self.find(key)
        definitions.find { |entry| entry.fetch("key") == key.to_s }
      end

      def self.human_gate(key)
        gate = HUMAN_ONLY.find { |entry| entry.first == key.to_s }
        gate && { reason: gate[3], source_path: gate[4] }
      end

      def self.fetch!(key)
        definition = find(key)
        raise Unavailable, "That assistant workflow is not available." unless definition
        raise Gated, definition.fetch("gated_reason") if gated?(definition)

        definition
      end

      def self.handler_for(definition, context:)
        raise Gated, definition.fetch("gated_reason") if definition["handler"].nil?
        definition.fetch("handler").new(
          practice: context.practice, actor: context.actor_user, site: context.site,
          patient: context.patient, encounter: context.encounter
        )
      end

      def self.catalog(context:)
        entries = definitions
        site_ready = site_ready?(context) unless entries.all? { |definition| setup_workflow?(definition) }
        entries.map do |definition|
          item = definition.except("handler")
          reason = gate_reason(definition)
          reason ||= "Complete clinic setup for this location before using this workflow." unless setup_workflow?(definition) || site_ready
          if reason.nil? && context.patient.nil? && definition.fetch("patient_required")
            reason = "Select a patient to use this workflow."
          elsif reason.nil? && context.encounter.nil? && definition.fetch("encounter_required")
            reason = "Select an encounter to use this workflow."
          end
          if reason.nil?
            requires_context = (context.patient.nil? && definition.fetch("patient_required")) ||
              (context.encounter.nil? && definition.fetch("encounter_required"))
            unless requires_context
              begin
                handler_for(definition, context:).authorize!(key: definition.fetch("key"), inputs: {})
              rescue Clinic::Authorization::Denied, CanCan::AccessDenied
                reason = "Your current role does not have access to this workflow."
              rescue Gated => error
                reason = WorkflowPresenter.safe_text(error.message, maximum: 240).presence ||
                  "This workflow is not configured for the selected location."
              end
            end
          end
          item.merge("availability" => reason ? "gated" : "available", "reason" => reason).compact
        end
      end

      def self.available_catalog(context:)
        catalog(context:).select { |definition| definition["availability"] == "available" }
      end

      def self.model_catalog(context:)
        catalog(context:).select do |definition|
          definition["availability"] == "available" ||
            [ "Select a patient to use this workflow.", "Select an encounter to use this workflow." ].include?(definition["reason"])
        end
      end

      def self.require_available!(definition, context:)
        reason = gate_reason(definition)
        reason ||= "Complete clinic setup for this location before using this workflow." unless setup_workflow?(definition) || site_ready?(context)
        reason ||= "Select a patient to use this workflow." if context.patient.nil? && definition.fetch("patient_required")
        reason ||= "Select an encounter to use this workflow." if context.encounter.nil? && definition.fetch("encounter_required")
        raise Gated, reason if reason

        handler_for(definition, context:).authorize!(key: definition.fetch("key"), inputs: {})
        definition
      end

      def self.normalize_definition(definition, handler)
        value = definition.deep_stringify_keys
        key = value["key"].to_s
        unless key.match?(/\A[a-z0-9][a-z0-9_.-]{0,79}\z/)
          raise "Invalid assistant workflow key"
        end
        value["kind"] = value["kind"].to_s
        raise "Invalid assistant workflow kind" unless value["kind"].in?(%w[read change])
        value["fields"] = Array(value["fields"]).map { |field| normalize_field(field) }
        value["patient_required"] = value.key?("patient_required?") ? value.delete("patient_required?") : value.fetch("patient_required", false)
        value["encounter_required"] = value.key?("encounter_required?") ? value.delete("encounter_required?") : value.fetch("encounter_required", false)
        value["handler"] = handler
        value
      end

      def self.normalize_field(field)
        value = field.deep_stringify_keys
        value["key"] = value.fetch("key").to_s
        value["type"] = value.fetch("type").to_s
        value["required"] = !!value["required"]
        if value["options"].is_a?(Array)
          value["options"] = value["options"].map do |option|
            option.is_a?(Hash) ? option.deep_stringify_keys.slice("value", "label") : { "value" => option.to_s, "label" => option.to_s }
          end
        end
        value
      end

      def self.gated?(definition)
        gate_reason(definition).present?
      end

      def self.gate_reason(definition)
        GATED_KEYS[definition.fetch("key")] || definition["gated_reason"].presence
      end

      def self.site_ready?(context)
        features = Clinic::Configuration::PracticeFeatures.snapshot(practice: context.practice, site: context.site)
        features[:site_specialty_configured] && features[:finalized]
      end

      def self.setup_workflow?(definition)
        definition["handler"]&.name == "Clinic::Assistant::Workflows::Administration"
      end

      private_class_method :normalize_definition, :normalize_field, :gated?, :gate_reason, :site_ready?, :setup_workflow?
    end
  end
end
