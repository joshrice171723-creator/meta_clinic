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

      def self.for_sites(practice:, sites:, at: Current.business_time)
        sites = sites.to_a
        return {} if sites.empty?
        raise ArgumentError, "The selected site does not belong to this practice." if sites.any? { |site| site.practice_id != practice.id }

        versions = SettingsVersion.where(practice_id: practice.id, site_id: [ nil, sites.map(&:id) ])
          .effective_at(at).order(effective_from: :desc, revision: :desc).to_a
        practice_version = versions.select(&:practice?).first
        raise Unconfigured, "Workforce settings have not been configured for this practice." unless practice_version

        site_versions = versions.select(&:site?).group_by(&:site_id).transform_values(&:first)
        sites.to_h do |site|
          site_version = site_versions[site.id]
          values = practice_version.values.deep_stringify_keys
          site_version&.values&.deep_stringify_keys&.each do |key, value|
            values[key] = value unless value.nil?
          end
          [ site.id, {
            values: values,
            versions: {
              practice: provenance(practice_version),
              site: site_version && provenance(site_version)
            }
          } ]
        end
      end

      def self.for_site_times(practice:, points:)
        points = points.map { |site, at| [ site, at.utc ] }.uniq
        return {} if points.empty?

        sites = points.map(&:first).uniq
        raise ArgumentError, "The selected site does not belong to this practice." if sites.any? { |site| site.practice_id != practice.id }

        versions = SettingsVersion.where(practice_id: practice.id, site_id: [ nil, sites.map(&:id) ])
          .where("effective_from <= ?", points.map(&:last).max).order(effective_from: :desc, revision: :desc).to_a
        practice_versions = versions.select(&:practice?)
        site_versions = versions.select(&:site?).group_by(&:site_id)

        points.to_h do |site, at|
          practice_version = practice_versions.find { |version| version.effective_from <= at }
          site_version = site_versions.fetch(site.id, []).find { |version| version.effective_from <= at }
          [ [ site.id, at ], practice_version && result_for(practice_version:, site_version:) ]
        end
      end

      def self.provenance(version)
        {
          id: version.id,
          revision: version.revision,
          effective_from: version.effective_from.iso8601
        }
      end

      def self.result_for(practice_version:, site_version:)
        raise Unconfigured, "Workforce settings have not been configured for this practice." unless practice_version

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
      private_class_method :provenance, :result_for
    end
  end
end
