require "digest"

module Clinic
  module Configuration
    # Read-only, permission-scoped inventory for supported configuration removals.
    class ServiceDisablePreview
      class Stale < StandardError; end

      def self.call(practice:, actor:, site:, service_scope:, expected_revision:, assessment_scope: nil)
        Clinic::Authorization.authorize!(practice:, actor:, action: "facilities.write", site:)
        current = PracticeFeatures.snapshot(practice:, site:)
        unless current.fetch(:revision) == expected_revision.to_i
          raise ActiveRecord::StaleObjectError.new(practice, "preview practice features")
        end
        requested = Array(service_scope).map { |code| code.to_s.strip }.uniq
        assessments = assessment_scope.nil? ? current[:assessment_scope] : Array(assessment_scope).map { |code| code.to_s.strip }.uniq
        raise ArgumentError, "service_scope includes unsupported services" if (requested - PracticeFeatures::SERVICE_SCOPE).any?
        raise ArgumentError, "assessment_scope includes unsupported assessments" if (assessments - PracticeFeatures::ASSESSMENT_SCOPE).any?
        if current[:finalized] && (requested - current[:selected_services]).any?
          raise ArgumentError, "Protected profile change: request Meta Clinic review."
        end
        disabled = current[:finalized] ? current[:service_scope] - requested : []
        removed_assessments = current[:assessment_scope] - assessments
        site_ids = if site
          [ site.id ]
        else
          overrides = Clinic::PracticeFeatureVersion.where(practice:).where.not(site_id: nil)
            .where(effective_from: ..Current.business_time).select(:site_id)
          practice.sites.where.not(id: overrides).pluck(:id)
        end
        providers = ServiceImpactProviders.new(practice:, actor:, site:, site_ids:, current:)
        rows = disabled.map { |service| providers.service(service) }
        assessment_rows = removed_assessments.map { |assessment| providers.assessment(assessment) }
        identity = { site_id: site&.id, revision: current.fetch(:revision),
          requested_services: PracticeFeatures::SERVICE_SCOPE & requested,
          requested_assessments: PracticeFeatures::ASSESSMENT_SCOPE & assessments,
          effective_site_ids: site_ids.sort, services: rows, assessments: assessment_rows }
        { site_id: site&.id, revision: current.fetch(:revision), generated_at: Current.business_time.iso8601(6),
          services: rows.map { |row| row.except(:source_digest) },
          assessments: assessment_rows.map { |row| row.except(:source_digest) },
          coverage: "source_backed_references", review_complete: (rows + assessment_rows).all? { |row| row[:review_complete] },
          limitations: [
            "Counts cover exact recorded associations at affected sites and patients this reader may access, not all possible clinic work. Restricted, unavailable or unclassified required sources prevent a fresh removal.",
            "A source-backed review does not certify unlinked work, free-text intent, other readers' protected records or future unimplemented modules. Review domain limits and retain the selection where consequences remain unknown.",
            "Configuration revision and source fingerprints are checked again when saving. Domain work may continue concurrently; this preview is not a reservation or cancellation transaction."
          ],
          impact_digest: Digest::SHA256.hexdigest(identity.to_json),
          preservation: "This change does not cancel appointments, complete tasks, erase history or reassign work. Existing permissions and action-specific rules still apply; unrelated services remain available." }
      end
    end
  end
end
