module Clinic
  module Care
    module IntakeEvidence
      module_function

      MAX_REFERENCES = 50

      def options(practice:, actor:, patient:, encounter:)
        ability = Ability.new(actor, practice:)
        result = []
        if ability.allowed_permission?("documents.read")
          patient.documents.where(practice:).includes(:category).order(id: :desc).limit(100).each do |document|
            result << { key: "document:#{document.id}", kind: "document", id: document.id,
              version: document.object_version, label: "#{document.category.name} · document #{document.id}",
              source: document.category.name, recorded_at: document.created_at.iso8601(6),
              status: document.scan_state, digest: document.checksum }
          end
        end
        reports = practice.lab_reports.where(patient:).includes(:current_version).order(id: :desc).limit(100)
        reports.each do |report|
          next unless ability.allowed_permission?("notes.read", site: report.site)
          version = report.current_version
          next unless version
          result << { key: "lab_version:#{version.id}", kind: "lab_version", id: version.id,
            version: version.version_number, label: version.title, source: report.source_name,
            recorded_at: version.recorded_at.iso8601(6), collected_at: version.collected_at&.iso8601(6),
            status: version.status, digest: version.content_digest,
            results: version.results, href: "/clinic/patients/#{patient.id}?lab_report_id=#{report.id}&lab_version_id=#{version.id}" }
        end
        if encounter.appointment_id && ability.allowed_permission?("telehealth.read", site: encounter.site)
          visits = Clinic::Telehealth::Visit.where(practice:, appointment_id: encounter.appointment_id)
          Clinic::Telehealth::Consent.where(practice:, visit_id: visits.select(:id))
            .includes(:visit, :policy_version).order(id: :desc).limit(100).each do |consent|
            result << { key: "telehealth_consent:#{consent.id}", kind: "telehealth_consent", id: consent.id,
              version: consent.policy_version.version, label: consent.purpose.humanize,
              source: "Telehealth consent record", recorded_at: consent.decided_at.iso8601(6),
              status: consent.decision, digest: consent.policy_content_digest,
              href: "/clinic/telehealth/#{consent.visit.public_id}" }
          end
        end
        Clinic::Care::IntakeConsentRevision.where(practice:, patient:).order(id: :desc).limit(50).each do |consent|
          result << { key: "intake_consent:#{consent.id}", kind: "intake_consent", id: consent.id,
            version: consent.revision, label: "#{consent.purpose.humanize} evidence",
            source: "Staff-recorded consent evidence", recorded_at: consent.recorded_at.iso8601(6),
            status: consent.payload.fetch("decision") }
        end
        if ability.allowed_permission?("subscriptions.review")
          Clinic::Care::SubscriptionAgreement.where(practice:, patient:).order(id: :desc).limit(50).each do |agreement|
            result << { key: "agreement:#{agreement.id}", kind: "agreement", id: agreement.id,
              version: agreement.version_id, label: "Financial agreement #{agreement.id}",
              source: "Membership agreement", recorded_at: agreement.created_at.iso8601(6),
              status: agreement.current_state,
              href: "/clinic/billing" }
          end
        end
        if ability.allowed_permission?("billing.read")
          Clinic::CoverageVersion.where(practice:, patient:).order(version: :desc).limit(50).each do |coverage|
            result << { key: "coverage:#{coverage.id}", kind: "coverage", id: coverage.id,
              version: coverage.version, label: "Insurance evidence version #{coverage.version}",
              source: "Patient coverage record", recorded_at: coverage.created_at.iso8601(6),
              status: "recorded_not_verified" }
          end
        end
        result
      end

      def normalize(value, practice:, actor:, patient:, encounter:)
        raise ArgumentError, "Choose a list of existing evidence references." unless value.is_a?(Array)
        raise ArgumentError, "Link at most #{MAX_REFERENCES} records per intake." if value.length > MAX_REFERENCES
        raise ArgumentError, "Evidence references must be distinct record keys." unless value.all? { |key| key.is_a?(String) } && value.uniq == value
        available = options(practice:, actor:, patient:, encounter:).index_by { |item| item[:key] }
        value.map do |key|
          reference = available[key]
          raise ArgumentError, "A selected record is unavailable or outside your access. Refresh the evidence list." unless reference
          reference.slice(:key, :kind, :id, :version, :digest).stringify_keys
        end
      end
    end
  end
end
