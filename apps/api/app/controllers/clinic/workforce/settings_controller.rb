module Clinic
  module Workforce
    class SettingsController < BaseController
      def show
        site = requested_site
        workforce_access.authorize!("workforce.settings", site: site)
        render json: settings_payload(site)
      end

      def update
        raw = params.require(:workforce_settings)
        unless raw.is_a?(ActionController::Parameters)
          raise Clinic::Api::RequestParameters::Invalid.new("workforce_settings must be an object.", field: :workforce_settings)
        end
        unknown = raw.keys.map(&:to_sym) - %i[scope_kind site_id effective_from expected_revision values]
        if unknown.any?
          raise Clinic::Api::RequestParameters::Invalid.new("#{unknown.first} is not a supported field.", field: unknown.first)
        end
        values = raw[:values]
        unless values.is_a?(ActionController::Parameters)
          raise Clinic::Api::RequestParameters::Invalid.new("values must be an object.", field: :values)
        end

        scope_kind = enum_param!(raw[:scope_kind], field: :scope_kind, allowed: %w[practice site])
        site = scope_kind == "site" ? current_practice.sites.find(integer_id!(raw[:site_id], field: :site_id)) : nil
        workforce_access.authorize!("workforce.settings", site: site)
        effective_from = time_param!(raw[:effective_from], field: :effective_from)
        expected_revision = bounded_integer!(raw[:expected_revision], field: :expected_revision, min: 0, max: 1_000_000)

        version = ApplicationRecord.transaction do
          Clinic::Practice.lock.find(current_practice.id)
          relation = SettingsVersion.where(practice_id: current_practice.id, site_id: site&.id)
          latest_revision = relation.maximum(:revision) || 0
          raise ActiveRecord::StaleObjectError.new(relation, "create") unless latest_revision == expected_revision

          relation.create!(scope_kind: scope_kind, site: site, revision: latest_revision + 1,
            effective_from: effective_from, values: values.to_unsafe_h, created_by_membership: clinic_membership)
        end
        render json: settings_payload(site).merge(settings_version: serialize_version(version))
      end

      private

      def requested_site
        return nil if params[:site_id].blank?

        current_practice.sites.find(integer_id!(params[:site_id], field: :site_id))
      end

      def settings_payload(site)
        relation = SettingsVersion.where(practice_id: current_practice.id, site_id: site&.id)
        current_version = relation.effective_at(Time.current).order(effective_from: :desc, revision: :desc).first
        effective = begin
          EffectiveSettings.call(practice: current_practice, site: site)
        rescue EffectiveSettings::Unconfigured
          nil
        end
        {
          schema_version: 1,
          scope: { kind: site ? "site" : "practice", site_id: site&.id },
          current_version: current_version && serialize_version(current_version),
          latest_revision: relation.maximum(:revision) || 0,
          effective_settings: effective,
          sites: current_practice.sites.where(status: "active").order(:name, :id).map { |record|
            { id: record.id, code: record.code, name: record.name }
          },
          setting_contract: {
            required_keys: SettingsVersion::REQUIRED_KEYS,
            site_keys: SettingsVersion::SITE_KEYS,
            practice_only_keys: SettingsVersion::PRACTICE_ONLY_KEYS,
            boolean_keys: SettingsVersion::BOOLEAN_KEYS,
            nullable_integer_keys: SettingsVersion::NULLABLE_INTEGER_KEYS,
            enum_values: SettingsVersion::ENUMS
          }
        }
      end

      def serialize_version(version)
        {
          id: version.id,
          scope_kind: version.scope_kind,
          site_id: version.site_id,
          revision: version.revision,
          effective_from: version.effective_from.iso8601,
          values: version.values
        }
      end
    end
  end
end
