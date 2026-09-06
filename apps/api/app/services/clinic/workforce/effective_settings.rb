module Clinic
  module Workforce
    class EffectiveSettings
      class Unconfigured < StandardError; end

      def self.call(practice:, site: nil, at: Current.business_time)
        raise ArgumentError, "The selected site does not belong to this practice." if site && site.practice_id != practice.id

        practice_version = SettingsVersion.practice.effective_at(at)
          .where(practice_id: practice.id).order(effective_from: :desc, revision: :desc).first
        raise Unconfigured, "Workforce settings have not been configured for this practice." unless practice_version

        site_version = if site
          SettingsVersion.site.effective_at(at).where(practice_id: practice.id, site_id: site.id)
            .order(effective_from: :desc, revision: :desc).first
        end
        values = practice_version.values.deep_stringify_keys
        site_version&.values&.deep_stringify_keys&.each do |key, value|
          values[key] = value unless value.nil?
        end

        {
          values: values,
          versions: {
            practice: provenance(practice_version),
            site: site_version && provenance(site_version)
          }
        }
      end

      def self.provenance(version)
        {
          id: version.id,
          revision: version.revision,
          effective_from: version.effective_from.iso8601
        }
      end
      private_class_method :provenance
    end
  end
end
