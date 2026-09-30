module Clinic
  module Documents
    module Provenance
      module_function

      # No generic document writer exists in the accepted permission map. Do not
      # substitute intake, scribe, facilities or document-read authority here.
      def writer_available? = false

      def authorize_reader!(practice:, actor:, document:)
        raise ActiveRecord::RecordNotFound unless document.practice_id == practice.id && document.patient.practice_id == practice.id
        Authorization.authorize!(practice:, actor:, action: "documents.read", site: document.encounter&.site)
      end

      def authorize_writer!(practice:, actor:, document:)
        authorize_reader!(practice:, actor:, document:)
        event = AuditRecorder.record!(practice:, actor:, action_code: "documents.metadata.write", outcome: :denied)
        raise Authorization::Denied.new("Document metadata writing is not configured with an approved writer authority.",
          action_code: "documents.metadata.write", audit_event_id: event.id)
      end

      def latest_configuration(category)
        DocumentProvenanceConfiguration.where(practice_id: category.practice_id, category_id: category.id).order(revision: :desc).first
      end

      def configuration_snapshot(category)
        record = latest_configuration(category)
        serialize_configuration(record)
      end

      def serialize_configuration(record)
        { revision: record&.revision || 0, applicable: record&.applicable || false, fields: record&.fields || [],
          request_key: record&.request_key, recorded_at: record&.recorded_at&.iso8601(6),
          recorded_by_membership_id: record&.recorded_by_membership_id, writer_available: writer_available? }
      end

      def configure(practice:, actor:, category:, applicable:, fields:, expected_revision:, request_key:)
        raise ActiveRecord::RecordNotFound unless category.practice_id == practice.id
        authorize = -> { Authorization.authorize!(practice:, actor:, action: "facilities.write") }
        authorize.call
        raise ArgumentError, "Choose whether metadata is applicable." unless [true, false].include?(applicable)
        unless fields.is_a?(Array) && fields.all? { |field| field.is_a?(String) } && (fields - DocumentProvenanceConfiguration::FIELDS).empty?
          raise ArgumentError, "Select supported metadata fields explicitly."
        end
        selected = DocumentProvenanceConfiguration::FIELDS.select { |field| fields.include?(field) }
        raise ArgumentError, "Select fields for an applicable category; disabled categories must have no fields." unless applicable ? selected.any? : selected.empty?
        expected = Integer(expected_revision, exception: false)
        raise ArgumentError, "Expected configuration revision is required." unless expected && expected >= 0
        result = Idempotency.execute(practice:, actor:, operation_code: "documents.provenance.configure", request_key:,
          payload: { category_id: category.id, applicable:, fields: selected, expected_revision: expected },
          authorization: authorize, result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) { DocumentProvenanceConfiguration.where(practice:, category:).find_by(id: receipt.resource_id) }) do
          category.with_lock do
            current = latest_configuration(category)
            raise ActiveRecord::StaleObjectError.new(category, "metadata configuration") unless (current&.revision || 0) == expected
            membership = authorize.call
            DocumentProvenanceConfiguration.create!(practice:, category:, recorded_by_membership: membership,
              revision: expected + 1, applicable:, fields: selected, request_key:, recorded_at: Current.business_time)
          end
        end
        result.value || raise(Idempotency::OutcomeUnconfirmed)
      end

      def revisions(document)
        DocumentMetadataRevision.where(practice_id: document.practice_id, patient_id: document.patient_id, document_id: document.id)
      end

      def serialize(record)
        record.slice(:id, :revision, :prior_revision_id, :object_version, :checksum, :recorded_by_membership_id, :request_key)
          .merge(recorded_at: record.recorded_at.iso8601(6), configuration_revision: record.configuration.revision, content: record.payload)
      end

      def record(practice:, actor:, document:, input:)
        authorize_writer!(practice:, actor:, document:)
        input = input.to_h.symbolize_keys
        expected = Integer(input[:expected_revision], exception: false)
        raise ArgumentError, "Expected metadata revision is required." unless expected && expected >= 0
        expected_configuration = Integer(input[:expected_configuration_revision], exception: false)
        raise ArgumentError, "Expected category configuration revision is required." unless expected_configuration && expected_configuration > 0
        # Resolve the exact editor contract, including on a retry after a newer
        # category configuration; replay must return the original committed row.
        configuration = DocumentProvenanceConfiguration.where(practice:, category: document.category, revision: expected_configuration).first!
        raise ArgumentError, "Metadata is not applicable to this category." unless configuration.applicable
        normalized = normalize_content(input.except(:request_key, :expected_revision, :expected_configuration_revision, :object_version, :checksum).stringify_keys,
          fields: configuration.fields, correction: expected > 0)
        request_key = input[:request_key]
        authorize = -> { authorize_writer!(practice:, actor:, document:) }
        result = Idempotency.execute(practice:, actor:, operation_code: "documents.metadata.record", request_key:,
          payload: { document_id: document.id, expected_revision: expected, expected_configuration_revision: expected_configuration,
            object_version: input[:object_version], checksum: input[:checksum], content: normalized },
          authorization: authorize, result_resource: ->(revision) { revision },
          resource_resolver: ->(practice:, receipt:) { revisions(document).where(practice:).find_by(id: receipt.resource_id) }) do
          document.with_lock do
            membership = authorize.call
            current = revisions(document).order(revision: :desc).first
            raise ActiveRecord::StaleObjectError.new(document, "document metadata") unless (current&.revision || 0) == expected
            unless document.object_version == input[:object_version] && document.checksum == input[:checksum]
              raise ActiveRecord::StaleObjectError.new(document, "document content reference")
            end
            # Configuration may change independently; lock it before accepting the supplied field contract.
            document.category.with_lock do
              latest = latest_configuration(document.category)
              raise ActiveRecord::StaleObjectError.new(document.category, "metadata applicability") unless latest&.id == configuration.id
              DocumentMetadataRevision.create!(practice:, patient: document.patient, document:, configuration:,
                recorded_by_membership: membership, prior_revision: current, revision: expected + 1,
                object_version: document.object_version, checksum: document.checksum,
                content: JSON.generate(normalized), request_key:, recorded_at: Current.business_time)
            end
          end
        end
        result.value || raise(Idempotency::OutcomeUnconfirmed)
      end

      def normalize_content(value, fields:, correction:)
        keys = %w[source issuer issued_date issued_precision received_date received_precision correction_reason]
        raise ArgumentError, "Only supplied metadata fields are supported." unless value.is_a?(Hash) && (value.keys - keys).empty?
        result = keys.to_h { |key| [key, nil] }
        %w[source issuer correction_reason].each do |key|
          text = value[key]
          raise ArgumentError, "Metadata text must be at most 1000 characters." unless text.nil? || (text.is_a?(String) && text.length <= 1000)
          result[key] = text&.strip&.presence
        end
        %w[issued received].each do |kind|
          date = value["#{kind}_date"]&.presence
          precision = value["#{kind}_precision"]&.presence
          unless date.nil? && precision.nil?
            patterns = { "year" => /\A[0-9]{4}\z/, "month" => /\A[0-9]{4}-[0-9]{2}\z/, "day" => /\A[0-9]{4}-[0-9]{2}-[0-9]{2}\z/ }
            raise ArgumentError, "Supply the date and its exact year, month or day precision." unless date.is_a?(String) && patterns[precision]&.match?(date) && date[0, 4].to_i.positive?
            Date.iso8601(precision == "year" ? "#{date}-01-01" : precision == "month" ? "#{date}-01" : date)
          end
          result["#{kind}_date"] = date
          result["#{kind}_precision"] = precision
        end
        DocumentProvenanceConfiguration::FIELDS.each do |field|
          next if fields.include?(field)
          raise ArgumentError, "This metadata field is not configured for the category." if result[field].present?
        end
        raise ArgumentError, "Supply a correction reason for a new metadata revision." if correction && result["correction_reason"].blank?
        result
      rescue Date::Error
        raise ArgumentError, "The supplied date is invalid at its stated precision."
      end
    end
  end
end
