require "digest"

module Clinic
  module Telehealth
    module Scribe
      module OrderedScribeSources
        Result = Data.define(:sources, :digest)
        module_function

        def call(encounter:, requested_ids: nil)
          visit = Clinic::Telehealth::Visit.find_by(practice_id: encounter.practice_id, scribe_encounter_id: encounter.id)
          unless visit
            latest = encounter.sources.where(status: "ready").order(:id).last
            return Result.new(sources: latest ? [ latest ] : [], digest: nil)
          end

          Support.ensure_exact_binding!(visit)
          snapshot = Support.consent_snapshot(visit)
          unless snapshot[:state] == "accepted" &&
              encounter.consent_policy_version == Support.consent_epoch_version(visit, snapshot)
            raise Clinic::Telehealth::Error.new("Current participant consent does not allow Scribe processing.",
              code: "scribe_consent_not_current", status: :conflict)
          end

          sources = encounter.sources.where(status: "ready", telehealth_visit_id: visit.id)
            .order(:capture_epoch, :source_order, :id).to_a
          requested = Array(requested_ids).map { |value| Integer(value, exception: false) }
          if requested_ids.present?
            unless requested.all? && requested.uniq.sort == sources.map(&:id).uniq.sort
              raise Clinic::Telehealth::Error.new(
                "Generate from the complete current ordered Scribe source set.",
                code: "scribe_source_set_changed", status: :conflict
              )
            end
          end
          values = sources.map do |source|
            [ source.id, source.content_digest, source.capture_epoch, source.recording_segment_index, source.source_order ]
          end
          Result.new(sources: sources.uniq(&:id), digest: Digest::SHA256.hexdigest(values.flatten.join("\0")))
        end
      end
    end
  end
end
