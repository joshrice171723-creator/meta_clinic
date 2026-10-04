module Clinic
  module Workforce
    class TimecardSiteScope
      SOURCE_PUNCH_IDS_SQL = "COALESCE(clinic_workforce_timecard_versions.snapshot -> 'source_punch_ids', '[]'::jsonb)".freeze

      def self.call(scope:, site:)
        scope = scope.where(practice_id: site.practice_id)
        with_intervals = scope.joins(:time_segments)
          .where(clinic_workforce_time_segments: { site_id: site.id }).select(:id)
        without_intervals = empty_cards(scope: scope, site: site).select(:id)
        scope.where(id: with_intervals).or(scope.where(id: without_intervals))
      end

      def self.empty_cards(scope:, site:)
        empty = scope.where(practice_id: site.practice_id).where.missing(:time_segments)
        sourced = source_punches_at_site(scope: empty, site: site)
          .where("#{SOURCE_PUNCH_IDS_SQL} <> '[]'::jsonb")
        assigned = EmploymentSite.where(practice_id: site.practice_id, site_id: site.id)
          .active.effective_at(Current.business_time).select(:employment_id)
        blank = empty.where("#{SOURCE_PUNCH_IDS_SQL} = '[]'::jsonb").where(employment_id: assigned)
        sourced.or(blank)
      end

      def self.fully_at_site(scope:, site:)
        scoped = call(scope: scope, site: site)
        other_intervals = TimeSegment.where(practice_id: site.practice_id).where.not(site_id: site.id).select(:timecard_version_id)
        source_punches_at_site(scope: scoped.where.not(id: other_intervals), site: site)
      end

      def self.source_punches_at_site(scope:, site:)
        scope.where(<<~SQL, site.id)
          NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(#{SOURCE_PUNCH_IDS_SQL}) AS source_punch(id)
            WHERE NOT EXISTS (
              SELECT 1 FROM clinic_workforce_punches punch
              WHERE punch.id = source_punch.id::bigint
                AND punch.practice_id = clinic_workforce_timecard_versions.practice_id
                AND punch.employment_id = clinic_workforce_timecard_versions.employment_id
                AND punch.site_id = ?
            )
          )
        SQL
      end
      private_class_method :source_punches_at_site
    end
  end
end
