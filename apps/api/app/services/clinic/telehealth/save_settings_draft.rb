require "digest"
require "uri"

module Clinic
  module Telehealth
    module SaveSettingsDraft
      POLICY_FIELDS = %i[consent_title consent_body locale patient_instructions support_label support_phone support_url
        join_early_minutes join_late_minutes max_room_minutes grant_ttl_seconds checkin_max_age_minutes allow_audio_only
        allow_staff_screen_share scribe_enabled require_location require_callback scribe_consent_title scribe_consent_body].freeze
      module_function

      def call(practice:, actor:, request_key:, expected_version:, settings:, policy:, visit_type_rules:)
        membership = Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "telehealth.configure", any_site: true)
        setting_input = settings.to_h.deep_symbolize_keys
        policy_input = normalize_policy(policy)
        rules_input = normalize_rules(visit_type_rules)
        outcome = Clinic::Idempotency.execute(practice: practice, actor: actor, operation_code: "telehealth.settings.save_draft",
          request_key: request_key, authorization_action: "telehealth.configure",
          authorization: -> {
            Clinic::Authorization.authorize!(actor: actor, practice: practice, action: "telehealth.configure", any_site: true)
          },
          payload: { expected_version: expected_version, settings: setting_input, policy: policy_input, visit_type_rules: rules_input },
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Setting.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          Setting.transaction do
            current = Setting.lock.find_or_initialize_by(practice_id: practice.id)
            if current.persisted? && current.lock_version != expected_version.to_i
              raise ActiveRecord::StaleObjectError.new(current, "update")
            end
            requested_enabled = enabled_value(setting_input[:enabled])
            requested_provider = Config.provider
            requested_account_ref = setting_input[:provider_account_ref].to_s.strip.presence
            provider_changed = current.persisted? && (current.provider_code != requested_provider ||
              current.provider_account_ref != requested_account_ref)
            if provider_changed && (requested_enabled || active_provider_rooms?(practice, current.provider_code))
              raise Error.new("Disable telehealth and end active rooms before changing the video provider.",
                code: "provider_change_blocked", status: :conflict)
            end
            current.updated_by_membership_id = membership.id
            current.provider_code = requested_provider
            current.provider_account_ref = requested_account_ref
            current.enabled = requested_enabled
            if provider_changed
              current.health_status = "not_checked"
              current.health_checked_at = nil
              current.last_error_code = nil
            end
            if current.enabled?
              unless current.active_policy_version&.published? && current.health_status == "ready" && Config.configured_for?(current)
                raise Error.new("Publish a policy and verify the provider before enabling telehealth.", code: "telehealth_not_ready")
              end
              unless VisitTypeRule.where(practice_id: practice.id, enabled: true).where.not(allowed_region_codes: []).exists?
                raise Error.new("Enable at least one configured visit type rule.", code: "visit_type_rule_required")
              end
            end
            current.save!
            draft = current.policy_versions.lock.where(status: "draft").order(version: :desc).first
            draft ||= current.policy_versions.new(practice_id: practice.id,
              version: current.policy_versions.maximum(:version).to_i + 1, status: "draft",
              created_by_membership_id: membership.id)
            draft.assign_attributes(policy_input.merge(content_digest: policy_digest(policy_input)))
            draft.save!
            apply_rules!(practice, membership, rules_input)
            current
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def normalize_policy(value)
        input = value.to_h.deep_symbolize_keys.slice(*POLICY_FIELDS)
        input[:support_url] = input[:support_url].to_s.strip.presence
        if input[:support_url] && URI(input[:support_url]).scheme != "https"
          raise Error.new("Support URL must use HTTPS.", code: "invalid_support_url", field: "support_url")
        end
        %i[join_early_minutes join_late_minutes max_room_minutes grant_ttl_seconds checkin_max_age_minutes].each do |field|
          input[field] = Integer(input[field])
        end
        %i[allow_audio_only allow_staff_screen_share scribe_enabled require_location require_callback].each do |field|
          input[field] = ActiveModel::Type::Boolean.new.cast(input[field])
        end
        if input[:scribe_consent_title].present? || input[:scribe_consent_body].present?
          input[:scribe_consent_digest] = Digest::SHA256.hexdigest([ input[:scribe_consent_title], input[:scribe_consent_body] ].join("\0"))
        else
          input[:scribe_consent_title] = input[:scribe_consent_body] = input[:scribe_consent_digest] = nil
        end
        input
      rescue URI::InvalidURIError, ArgumentError, TypeError
        raise Error.new("The telehealth policy values are invalid.", code: "invalid_policy")
      end

      def normalize_rules(values)
        Array(values).map do |raw|
          value = raw.to_h.deep_symbolize_keys
          { visit_type_id: Integer(value.fetch(:visit_type_id)), site_id: value[:site_id].present? ? Integer(value[:site_id]) : nil,
            enabled: ActiveModel::Type::Boolean.new.cast(value[:enabled]),
            allowed_region_codes: Array(value[:allowed_region_codes]).map { |code| code.to_s.strip.upcase }.uniq,
            min_patient_age_years: value[:min_patient_age_years].present? ? Integer(value[:min_patient_age_years]) : nil,
            max_patient_age_years: value[:max_patient_age_years].present? ? Integer(value[:max_patient_age_years]) : nil }
        end
      rescue KeyError, ArgumentError, TypeError
        raise Error.new("A visit type rule is invalid.", code: "invalid_visit_type_rule")
      end

      def apply_rules!(practice, membership, rules)
        supplied = rules.map { |rule| [ rule[:visit_type_id], rule[:site_id] ] }
        VisitTypeRule.where(practice_id: practice.id).find_each do |existing|
          existing.update!(enabled: false, updated_by_membership_id: membership.id) unless supplied.include?([ existing.visit_type_id, existing.site_id ])
        end
        visit_type_ids = rules.pluck(:visit_type_id).uniq
        site_ids = rules.pluck(:site_id).compact.uniq
        visit_types_by_id, sites_by_id = validate_rule_resources!(practice, visit_type_ids, site_ids)
        existing_by_rule = VisitTypeRule.where(practice_id: practice.id, visit_type_id: visit_type_ids)
          .index_by { |record| [ record.visit_type_id, record.site_id ] }

        rules.each do |rule|
          key = [ rule[:visit_type_id], rule[:site_id] ]
          record = existing_by_rule[key] || VisitTypeRule.new(practice_id: practice.id,
            visit_type_id: rule[:visit_type_id], site_id: rule[:site_id])
          record.assign_attributes(rule.merge(updated_by_membership_id: membership.id))
          record.visit_type = visit_types_by_id.fetch(rule[:visit_type_id])
          record.site = sites_by_id[rule[:site_id]]
          record.save!
          existing_by_rule[key] = record
        end
      end

      def validate_rule_resources!(practice, visit_type_ids, site_ids)
        visit_types_by_id = practice.visit_types.where(id: visit_type_ids).index_by(&:id)
        if visit_types_by_id.length != visit_type_ids.length
          raise ActiveRecord::RecordNotFound
        end

        sites_by_id = practice.sites.where(id: site_ids).index_by(&:id)
        raise ActiveRecord::RecordNotFound unless sites_by_id.length == site_ids.length

        [ visit_types_by_id, sites_by_id ]
      end
      private_class_method :validate_rule_resources!

      def enabled_value(value)
        ActiveModel::Type::Boolean.new.cast(value)
      end

      def active_provider_rooms?(practice, provider_code)
        RoomAttempt.where(practice_id: practice.id, provider_code: provider_code,
          status: %w[pending provisioning ready active ending unknown]).exists?
      end

      def policy_digest(policy)
        Digest::SHA256.hexdigest(JSON.generate(policy.deep_stringify_keys.sort.to_h))
      end
    end
  end
end
