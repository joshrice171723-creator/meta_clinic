module Clinic
  module Billing
    class InsurancePreparation
      COVERAGE_FIELDS = %w[payer member_id group_number policyholder relationship starts_on ends_on status evidence_source observed_on].freeze
      REQUEST_FIELDS = %w[service_code_system service_code service_description service_date note].freeze
      RESPONSE_FIELDS = %w[reference response_code note observed_on].freeze

      def self.authorize!(practice:, actor:, patient:, site:, write: false)
        raise ActiveRecord::RecordNotFound unless patient.practice_id == practice.id && site&.practice_id == practice.id
        Clinic::Authorization.authorize_with_legacy!(practice:, actor:, action: "billing.read", legacy_action: "billing.write")
        Clinic::Authorization.authorize!(practice:, actor:, action: "billing.write") if write
        Clinic::Authorization.authorize!(practice:, actor:, action: "patients.read", subject: patient)
        Clinic::Authorization.authorize!(practice:, actor:, action: "patients.read", site:)
      end

      def self.enabled!(practice:, site:)
        practice.lock!
        site.lock!
        raise ArgumentError, "Choose an active clinic location." unless site.status == "active"
        features = Clinic::Configuration::PracticeFeatures.snapshot(practice:, site:)
        raise ArgumentError, "Insurance preparation is not enabled for this location. Existing history remains available." unless features[:insurance_workflows_enabled] && features[:finalized]
      end

      def self.save_coverage(practice:, actor:, patient:, site:, input:, expected_version:, request_key:)
        details = fields!(input, COVERAGE_FIELDS)
        %w[payer member_id policyholder relationship status evidence_source observed_on].each { |key| required!(details, key) }
        raise ArgumentError, "Choose the policyholder relationship." unless %w[self spouse child other].include?(details["relationship"])
        raise ArgumentError, "Choose the recorded coverage status." unless %w[active inactive unknown].include?(details["status"])
        %w[starts_on ends_on observed_on].each { |key| date!(details, key) }
        raise ArgumentError, "Coverage end must not precede its start." if details["starts_on"] && details["ends_on"] && details["ends_on"] < details["starts_on"]
        payload = { patient_id: patient.id, site_id: site.id, expected_version:, details: }
        execute(practice:, actor:, patient:, site:, request_key:, operation: "coverage", payload:, model: Clinic::CoverageVersion) do
          enabled!(practice:, site:)
          patient.lock!
          latest = patient.coverage_versions.maximum(:version) || 0
          raise ActiveRecord::StaleObjectError.new(patient, "save coverage") unless latest == expected_version
          Clinic::CoverageVersion.create!(practice:, patient:, site:, recorded_by: actor, version: latest + 1,
            encrypted_coverage_evidence: "Versioned coverage preparation; see protected coverage details.", coverage_details: details.to_json)
        end
      end

      def self.prepare(practice:, actor:, patient:, site:, coverage_id:, kind:, invoice_id:, input:, request_key:)
        raise ArgumentError, "Choose an insurance request type." unless %w[eligibility authorization claim reconciliation].include?(kind)
        details = fields!(input, REQUEST_FIELDS)
        required!(details, "note")
        required!(details, "service_date")
        date!(details, "service_date")
        if kind == "authorization"
          %w[service_code_system service_code service_description].each { |key| required!(details, key) }
        end
        payload = { patient_id: patient.id, site_id: site.id, coverage_id:, kind:, invoice_id:, details: }
        execute(practice:, actor:, patient:, site:, request_key:, operation: "prepare", payload:, model: Clinic::InsuranceWorkflowEvent) do
          enabled!(practice:, site:)
          patient.lock!
          coverage = patient.coverage_versions.where(site:).find(coverage_id)
          raise ArgumentError, "Record structured coverage details first." unless coverage.preparation_details
          invoice = invoice_id ? Clinic::Invoice.where(practice:, patient:).lock.find(invoice_id) : nil
          raise ArgumentError, "Select this patient's posted invoice." if %w[claim reconciliation].include?(kind) && (!invoice || invoice.status != "posted")
          raise ArgumentError, "An invoice is only used for claims and reconciliation." if invoice && !%w[claim reconciliation].include?(kind)
          details["invoice_snapshot"] = { "id" => invoice.id, "currency" => invoice.currency } if invoice
          claim = if kind == "claim"
            Clinic::InsuranceClaim.create!(practice:, patient:, invoice:, coverage_version: coverage)
          end
          Clinic::InsuranceWorkflowEvent.create!(practice:, patient:, site:, coverage_version: coverage,
            recorded_by: actor, invoice:, insurance_claim: claim, kind:, state: "prepared", source: "local", request_key:, details: details.to_json)
        end
      end

      def self.record_response(practice:, actor:, patient:, site:, request_id:, expected_event_id:, state:, source:, input:, request_key:)
        raise ArgumentError, "Choose a recorded outcome." unless %w[pending approved denied unknown cancelled].include?(state)
        raise ArgumentError, "Identify a manual record or simulation." unless %w[manual simulation].include?(source)
        details = fields!(input, RESPONSE_FIELDS)
        %w[note observed_on].each { |key| required!(details, key) }
        date!(details, "observed_on")
        required!(details, "reference") if source == "manual" && %w[approved denied].include?(state)
        payload = { patient_id: patient.id, site_id: site.id, request_id:, expected_event_id:, state:, source:, details: }
        execute(practice:, actor:, patient:, site:, request_key:, operation: "response", payload:, model: Clinic::InsuranceWorkflowEvent) do
          request = Clinic::InsuranceWorkflowEvent.where(practice:, patient:, site:, request_event_id: nil).lock.find(request_id)
          latest = Clinic::InsuranceWorkflowEvent.where(request_event_id: request.id).order(:id).last || request
          raise ActiveRecord::StaleObjectError.new(request, "record response") unless latest.id == expected_event_id
          raise ArgumentError, "This request is already resolved. Prepare a new request for further work." if %w[approved denied cancelled].include?(latest.state)
          if latest.source == "simulation" && source != "simulation"
            raise ArgumentError, "A simulated request cannot become payer evidence. Prepare a separate request."
          end
          if latest.source == "manual" && source != "manual"
            raise ArgumentError, "A manual response cannot be replaced with a simulation."
          end
          Clinic::InsuranceWorkflowEvent.create!(practice:, patient:, site:, coverage_version: request.coverage_version,
            recorded_by: actor, invoice: request.invoice, insurance_claim: request.insurance_claim, kind: request.kind,
            request_event: request, prior_event: latest, state:, source:, request_key:, details: details.to_json)
        end
      end

      def self.execute(practice:, actor:, patient:, site:, request_key:, operation:, payload:, model:, &block)
        authorize!(practice:, actor:, patient:, site:, write: true)
        outcome = Clinic::Idempotency.execute(practice:, actor:, request_key:, operation_code: "insurance.#{operation}", payload:,
          authorization_action: "billing.write", authorization: -> { authorize!(practice:, actor:, patient:, site:, write: true) },
          result_resource: ->(record) { record }, resource_resolver: ->(practice:, receipt:) { model.find_by(practice:, patient:, site:, id: receipt.resource_id) }) do
          record = block.call
          Clinic::AuditRecorder.record!(practice:, actor:, action_code: "billing.write", outcome: :released,
            resource_version_ref: "#{record.class.name}/#{record.id}")
          record
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
      private_class_method :execute

      def self.fields!(input, allowed)
        raise ArgumentError, "Enter structured insurance details." unless input.is_a?(Hash)
        data = input.stringify_keys
        raise ArgumentError, "Unsupported insurance fields." if (data.keys - allowed).any?
        data.transform_values do |value|
          raise ArgumentError, "Insurance values must be text." unless value.nil? || value.is_a?(String)
          text = value.to_s.strip
          raise ArgumentError, "Insurance values must be at most 500 characters." if text.length > 500
          text.presence
        end
      end
      private_class_method :fields!

      def self.required!(details, field)
        raise ArgumentError, "Enter #{field.tr('_', ' ')}." if details[field].blank?
      end
      private_class_method :required!

      def self.date!(details, field)
        value = details[field]
        return if value.blank?
        raise ArgumentError, "Enter a complete #{field.tr('_', ' ')} date." unless value.match?(/\A\d{4}-\d{2}-\d{2}\z/)
        Date.iso8601(value)
      rescue Date::Error
        raise ArgumentError, "Enter a valid #{field.tr('_', ' ')} date."
      end
      private_class_method :date!
    end
  end
end
