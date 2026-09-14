module Clinic
  module Care
    module ClinicalPlanWorkflow
      module_function

      MAX_CURRENT_RECORDS = 200
      UUID_PATTERN = /\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i
      COMMON_FIELDS = %i[status].freeze
      DEFINITIONS = {
        medication_requests: {
          klass: MedicationRequestRevision,
          permission: "medication_requests.write",
          root: :medication_request,
          default_status: "draft",
          transitions: {
            "draft" => %w[authorized cancelled entered_in_error],
            "authorized" => %w[on_hold completed cancelled entered_in_error],
            "on_hold" => %w[authorized cancelled entered_in_error],
            "completed" => %w[entered_in_error], "cancelled" => %w[entered_in_error],
            "entered_in_error" => []
          },
          fields: %i[intent transmission_state inventory_product_id requester_membership_id medication_name dose_value dose_unit_code
            dose_text route_code route_text frequency_text quantity_text scheduled_for reason_text instructions
            source_medication_statement_id completion_exception fulfillment_route medication_strength medication_form
            medication_code_system medication_code medication_code_version catalog_source pharmacy_name pharmacy_location
            pharmacy_identifier prescribed_quantity quantity_unit refills starts_on duration_text]
        },
        service_requests: {
          klass: ServiceRequestRevision,
          permission: "service_requests.write",
          root: :service_request,
          default_status: "draft",
          transitions: {
            "draft" => %w[active cancelled entered_in_error],
            "active" => %w[on_hold completed cancelled entered_in_error],
            "on_hold" => %w[active cancelled entered_in_error],
            "completed" => %w[entered_in_error], "cancelled" => %w[entered_in_error],
            "entered_in_error" => []
          },
          fields: %i[request_kind intent priority requested_code_system requested_code requested_display destination
            reason_text due_at completion_exception]
        },
        diagnoses: {
          klass: EncounterDiagnosisRevision,
          permission: "diagnoses.write",
          root: :diagnosis,
          default_status: "draft",
          transitions: {
            "draft" => %w[provisional confirmed refuted entered_in_error],
            "provisional" => %w[confirmed refuted resolved entered_in_error],
            "confirmed" => %w[resolved refuted entered_in_error],
            "refuted" => %w[entered_in_error], "resolved" => %w[entered_in_error],
            "entered_in_error" => []
          },
          fields: %i[classification code_system diagnosis_code diagnosis_display clinical_note]
        },
        procedures: {
          klass: ProcedureRevision,
          permission: "procedures.write",
          root: :procedure,
          default_status: "planned",
          transitions: {
            "planned" => %w[in_progress completed not_done entered_in_error],
            "in_progress" => %w[completed not_done entered_in_error],
            "completed" => %w[entered_in_error], "not_done" => %w[entered_in_error],
            "entered_in_error" => []
          },
          fields: %i[code_system procedure_code procedure_display performed_at outcome_text complication_state
            complication_text service_request_revision_id]
        },
        care_plans: {
          klass: CarePlanRevision,
          permission: "care_plans.write",
          root: :care_plan,
          default_status: "draft",
          transitions: {
            "draft" => %w[active cancelled entered_in_error],
            "active" => %w[on_hold completed cancelled entered_in_error],
            "on_hold" => %w[active completed cancelled entered_in_error],
            "completed" => %w[entered_in_error], "cancelled" => %w[entered_in_error],
            "entered_in_error" => []
          },
          fields: %i[title description starts_on ends_on]
        },
        care_goals: {
          klass: CareGoalRevision,
          permission: "care_plans.write",
          root: :care_goal,
          default_status: "proposed",
          transitions: {
            "proposed" => %w[active cancelled entered_in_error],
            "active" => %w[achieved not_achieved cancelled entered_in_error],
            "achieved" => %w[entered_in_error], "not_achieved" => %w[entered_in_error],
            "cancelled" => %w[entered_in_error], "entered_in_error" => []
          },
          fields: %i[care_plan_revision_id description outcome_text target_on]
        },
        immunizations: {
          klass: ImmunizationRevision,
          permission: "immunizations.write",
          root: :immunization,
          default_status: "planned",
          transitions: {
            "planned" => %w[completed not_done entered_in_error],
            "completed" => %w[entered_in_error], "not_done" => %w[entered_in_error],
            "entered_in_error" => []
          },
          fields: %i[vaccine_name cvx_code manufacturer manufacturer_mvx_code lot_number lot_expiration_date
            dose_text route_text administration_site_text administered_at occurrence_source refusal_reason
            source_document_id medication_administration_id vis_edition_date vis_given_date]
        },
        assessments: {
          klass: AssessmentRevision,
          permission: "intake.write",
          root: :assessment,
          default_status: "in_progress",
          transitions: {
            "in_progress" => %w[completed entered_in_error],
            "completed" => %w[entered_in_error],
            "entered_in_error" => []
          },
          fields: %i[category instrument_name instrument_version score_value interpretation response_summary
            follow_up_plan assessed_at]
        }
      }.freeze

      def workspace(practice:, actor:, patient:, encounter:)
        authorize_read!(practice, actor, patient, encounter)
        records = {}
        truncated = {}
        DEFINITIONS.each do |kind, definition|
          current = latest_records(definition.fetch(:klass), practice, patient, encounter)
          truncated[kind] = current.length > MAX_CURRENT_RECORDS
          records[kind] = current.first(MAX_CURRENT_RECORDS).map { |record| serialize(kind, record) }
        end
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "clinical_plan_workspace.read", outcome: :released,
          resource_version_ref: "patient/#{patient.id}:encounter/#{encounter.id}")
        {
          schema_version: "clinical-plan-workspace-v2",
          patient_id: patient.id,
          encounter_id: encounter.id,
          records: records,
          truncated: truncated,
          capabilities: DEFINITIONS.to_h do |kind, definition|
            [ kind, allowed?(practice, actor, definition.fetch(:permission), encounter) ]
          end,
          medication_products: medication_products(practice),
          medication_order_options: {
            dose_units: MedicationRequestRevision::DOSE_UNITS.map { |code, label| { code:, label: } },
            routes: MedicationRequestRevision::ROUTES.map { |code, label| { code:, label: } }
          },
          assessment_scope: Clinic::Configuration::PracticeFeatures.snapshot(practice:).fetch(:assessment_scope)
        }.merge(ClinicalPlanClosureWorkflow.workspace(practice:, actor:, patient:, encounter:))
      end

      def create(kind:, practice:, actor:, patient:, encounter:, attributes:, request_key:)
        definition = definition!(kind)
        ensure_writable_encounter!(practice, patient, encounter)
        membership = authorize_write!(practice, actor, encounter, definition)
        values = normalized_attributes(definition, attributes)
        values[:status] = definition.fetch(:default_status)
        values[:transmission_state] = "not_requested" if kind.to_sym == :medication_requests
        values[:requester_membership_id] = membership.id if kind.to_sym == :medication_requests
        prepare_values!(kind, practice, values, patient:, encounter:)
        validate_references!(kind, practice, patient, encounter, values)
        series_id = SecureRandom.uuid
        payload = { patient_id: patient.id, encounter_id: encounter.id, site_id: encounter.site_id,
          series_id:, values: }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: operation_code(kind, :create), request_key:, payload:,
          authorization_action: definition.fetch(:permission),
          authorization: -> { authorize_write!(practice, actor, encounter, definition) },
          result_resource: ->(record) { record },
          resource_resolver: resolver(definition.fetch(:klass), encounter)
        ) do
          definition.fetch(:klass).create!(
            values.merge(common_attributes(practice, patient, encounter, membership, request_key, values:,
              series_id:, version_number: 1, prior_revision: nil))
          )
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def revise(kind:, series_id:, practice:, actor:, patient:, encounter:, attributes:, expected_version:, request_key:)
        definition = definition!(kind)
        ensure_encounter_context!(practice, patient, encounter)
        membership = authorize_write!(practice, actor, encounter, definition)
        series = normalized_series_id!(series_id)
        changes = normalized_attributes(definition, attributes)
        if kind.to_sym == :medication_requests && changes.key?(:transmission_state)
          raise ArgumentError, "Transmission evidence is recorded through prescription attempts, not an editable status."
        end
        payload = { patient_id: patient.id, encounter_id: encounter.id, series_id: series,
          expected_version:, changes: }
        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: operation_code(kind, :revise), request_key:, payload:,
          authorization_action: definition.fetch(:permission),
          authorization: -> { authorize_write!(practice, actor, encounter, definition) },
          result_resource: ->(record) { record },
          resource_resolver: resolver(definition.fetch(:klass), encounter)
        ) do
          ApplicationRecord.connection.execute(ApplicationRecord.sanitize_sql_array([
            "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", "clinical-plan:#{practice.id}:#{kind}:#{series}"
          ]))
          previous = definition.fetch(:klass).where(practice:, patient:, encounter:, series_id: series)
            .order(version_number: :desc, id: :desc).lock.first!
          unless previous.version_number == expected_version.to_i
            raise ActiveRecord::StaleObjectError.new(previous, "create revision")
          end
          values = revision_values(definition, previous).merge(changes)
          if kind.to_sym == :medication_requests && PrescriptionWorkflow.unresolved?(previous)
            raise ArgumentError, "Confirm the previous prescription outcome before changing its destination or instructions."
          end
          if kind.to_sym == :medication_requests && MedicationDispensing.records(previous).sum(:quantity).positive?
            if %i[inventory_product_id quantity_unit fulfillment_route].any? { |field| changes.key?(field) && changes[field] != previous.public_send(field) }
              raise ArgumentError, "Reconcile recorded handovers before changing fulfillment or stock identity."
            end
            if values[:prescribed_quantity] && BigDecimal(values[:prescribed_quantity].to_s) < MedicationDispensing.records(previous).sum(:quantity)
              raise ArgumentError, "Prescribed quantity cannot be less than the recorded handovers."
            end
          end
          validate_revision_change!(kind, definition, previous, changes, values)
          prepare_values!(kind, practice, values, patient:, encounter:)
          validate_references!(kind, practice, patient, encounter, values)
          record = definition.fetch(:klass).create!(
            values.merge(common_attributes(practice, patient, encounter, membership, request_key, values:,
              series_id: series, version_number: previous.version_number + 1, prior_revision: previous))
          )
          sync_order_task!(kind, record, previous, membership)
          record
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def serialize(kind, record)
        definition = definition!(kind)
        payload = {
          id: record.id,
          patient_id: record.patient_id,
          encounter_id: record.encounter_id,
          site_id: record.site_id,
          series_id: record.series_id,
          version_number: record.version_number,
          prior_revision_id: record.prior_revision_id,
          status: record.status,
          allowed_statuses: definition.fetch(:transitions).fetch(record.status, []),
          recorded_by_membership_id: record.recorded_by_membership_id,
          recorded_at: record.recorded_at.iso8601(6)
        }
        definition.fetch(:fields).each do |field|
          value = record.public_send(field)
          payload[field] = if value.respond_to?(:iso8601)
            value.iso8601
          elsif value.is_a?(BigDecimal)
            value.to_s("F")
          else
            value
          end
        end
        payload.merge!(immunization_administration_evidence(record)) if kind.to_sym == :immunizations
        payload
      end

      def definition!(kind)
        DEFINITIONS.fetch(kind.to_sym)
      rescue KeyError
        raise ArgumentError, "Choose a supported clinical record type."
      end
      private_class_method :definition!

      def latest_records(klass, practice, patient, encounter)
        table = klass.table_name
        klass.where(practice:, patient:, encounter:)
          .select("DISTINCT ON (#{table}.series_id) #{table}.*")
          .order(Arel.sql("#{table}.series_id, #{table}.version_number DESC, #{table}.id DESC"))
          .limit(MAX_CURRENT_RECORDS + 1).to_a.sort_by { |record| [ record.recorded_at, record.id ] }.reverse
      end
      private_class_method :latest_records

      def normalized_attributes(definition, attributes)
        allowed = COMMON_FIELDS + definition.fetch(:fields)
        attributes.to_h.symbolize_keys.slice(*allowed).transform_values do |value|
          value.is_a?(String) ? value.strip.presence : value
        end
      end
      private_class_method :normalized_attributes

      def revision_values(definition, record)
        (COMMON_FIELDS + definition.fetch(:fields)).to_h { |field| [ field, record.public_send(field) ] }
      end
      private_class_method :revision_values

      def immunization_administration_evidence(record)
        administration = record.medication_administration
        return {
          vaccinator_membership_id: nil, vaccinator_label: nil,
          administering_site_id: nil, administering_site_label: nil
        } unless administration

        membership = administration.administered_by_membership
        label = membership.clinician_profile&.display_name.presence || membership.user.email_address
        {
          vaccinator_membership_id: membership.id,
          vaccinator_label: label,
          administering_site_id: administration.site_id,
          administering_site_label: administration.site.name
        }
      end
      private_class_method :immunization_administration_evidence

      def common_attributes(practice, patient, encounter, membership, request_key, values:, series_id:, version_number:, prior_revision:)
        content = { patient_id: patient.id, encounter_id: encounter.id, series_id:, version_number:, values: }
        {
          practice:, patient:, encounter:, site: encounter.site, series_id:, version_number:, prior_revision:,
          recorded_by_membership: membership, recorded_at: Current.business_time, request_key:,
          content_digest: protected_digest(content)
        }
      end
      private_class_method :common_attributes

      def protected_digest(payload)
        canonical = Clinic::Idempotency.send(:canonical_payload, payload)
        secret = Rails.application.key_generator.generate_key("clinic-clinical-plan-records-v1", 32)
        OpenSSL::HMAC.hexdigest("SHA256", secret, canonical)
      end
      private_class_method :protected_digest

      def operation_code(kind, action)
        "clinical_plan.#{kind}.#{action}"
      end
      private_class_method :operation_code

      def resolver(klass, encounter)
        lambda do |practice:, receipt:|
          klass.find_by(practice_id: practice.id, encounter_id: encounter.id, id: receipt.resource_id)
        end
      end
      private_class_method :resolver

      def normalized_series_id!(value)
        series = value.to_s.strip.downcase
        raise ArgumentError, "The clinical record reference is invalid." unless series.match?(UUID_PATTERN)
        series
      end
      private_class_method :normalized_series_id!

      def validate_references!(kind, practice, patient, encounter, values)
        case kind.to_sym
        when :medication_requests
          reference = values[:source_medication_statement_id]
          MedicationStatement.where(practice:, patient:).find(reference) if reference.present?
          product_reference = values[:inventory_product_id]
          Clinic::Inventory::PharmacyProduct.where(practice:, category: "medication", active: true)
            .find(product_reference) if product_reference.present?
        when :procedures
          reference = values[:service_request_revision_id]
          ServiceRequestRevision.where(practice:, patient:, encounter:).find(reference) if reference.present?
        when :care_goals
          reference = values[:care_plan_revision_id]
          CarePlanRevision.where(practice:, patient:, encounter:).find(reference)
        when :immunizations
          reference = values[:source_document_id]
          Clinic::Document.where(practice:, patient:).find(reference) if reference.present?
          administration_reference = values[:medication_administration_id]
          MedicationAdministration.where(practice:, patient:, encounter:).find(administration_reference) if administration_reference.present?
        when :assessments
          configured = Clinic::Configuration::PracticeFeatures.snapshot(practice:).fetch(:assessment_scope)
          unless configured.include?(values[:category])
            raise ArgumentError, "This assessment category is not enabled in Clinic Setup."
          end
        end
      end
      private_class_method :validate_references!

      def prepare_values!(kind, practice, values, patient:, encounter:)
        if kind.to_sym == :immunizations
          prepare_immunization_values!(practice, patient, encounter, values)
          return
        end
        return unless kind.to_sym == :medication_requests

        if values[:inventory_product_id].present?
          product = Clinic::Inventory::PharmacyProduct.where(practice:, category: "medication", active: true)
            .find(values[:inventory_product_id])
          values[:medication_name] = product.name
        end
        if values[:dose_value].present? && values[:dose_unit_code].present?
          display_unit = MedicationRequestRevision::DOSE_UNITS.fetch(values[:dose_unit_code].to_s) do
            raise ArgumentError, "Choose a supported dose unit."
          end
          values[:dose_text] = "#{BigDecimal(values[:dose_value].to_s).to_s('F')} #{display_unit}"
        end
        if values[:route_code].present?
          values[:route_text] = MedicationRequestRevision::ROUTES.fetch(values[:route_code].to_s) do
            raise ArgumentError, "Choose a supported administration route."
          end
        end
      rescue ArgumentError => error
        raise ArgumentError, error.message
      end
      private_class_method :prepare_values!

      def prepare_immunization_values!(practice, patient, encounter, values)
        values[:manufacturer_mvx_code] = values[:manufacturer_mvx_code].to_s.upcase.presence
        return unless values[:status] == "completed" && values[:occurrence_source] == "administered_here" &&
          values[:medication_administration_id].present?

        administration = MedicationAdministration.where(practice:, patient:, encounter:, status: "completed")
          .includes(:movement_links)
          .find(values[:medication_administration_id])
        stock = administration.movement_links.map(&:stock_identity)
        identities = stock.map { |row| [ row[:lot_number].to_s, row[:expires_on].to_s ] }.uniq
        raise ArgumentError, "The linked administration must resolve to exactly one inventory lot." unless identities.one?

        lot_number, expires_on = identities.sole
        values[:administered_at] = administration.administered_at
        values[:lot_number] = lot_number
        values[:lot_expiration_date] = Date.iso8601(expires_on)
        values[:dose_text] = administration.dose_text
        values[:route_text] = administration.route_text
        values[:administration_site_text] = administration.administration_site_text
      rescue Date::Error, ArgumentError => error
        raise ArgumentError, error.message
      end
      private_class_method :prepare_immunization_values!

      def medication_products(practice)
        Clinic::Inventory::PharmacyProduct.where(practice:, category: "medication", active: true)
          .order(:name, :id).limit(500).map do |product|
            {
              id: product.id, name: product.name, generic_name: product.generic_name, ndc: product.ndc,
              dosage_form: product.dosage_form, route: product.route, stock_unit: product.stock_unit
            }
          end
      end
      private_class_method :medication_products

      def validate_revision_change!(kind, definition, previous, changes, values)
        require_completion_evidence!(kind, previous, values) if values[:status] == "completed"
        changed = changes.any? { |field, value| previous.public_send(field) != value }
        raise ArgumentError, "Change at least one field before saving a revision." unless changed
        if kind.to_sym == :immunizations && changes[:status] == "entered_in_error"
          changed_evidence = changes.any? do |field, value|
            field != :status && previous.public_send(field) != value
          end
          raise ArgumentError, "Mark an immunization entered in error without rewriting its evidence." if changed_evidence
        end
        return unless changes.key?(:status) && changes[:status] != previous.status

        allowed = definition.fetch(:transitions).fetch(previous.status, [])
        raise ArgumentError, "That status transition is not allowed." unless allowed.include?(changes[:status])
      end
      private_class_method :validate_revision_change!

      def require_completion_evidence!(kind, previous, values)
        return unless %i[medication_requests service_requests].include?(kind.to_sym)
        if kind.to_sym == :medication_requests && previous.fulfillment_route == "take_home"
          raise ArgumentError, "The remaining take-home quantity is still open." unless MedicationDispensing.remaining(previous).zero?
          return
        end

        revision_ids = previous.class.where(practice_id: previous.practice_id, series_id: previous.series_id).select(:id)
        if kind.to_sym == :service_requests && previous.request_kind == "lab"
          reports = LabReport.where(practice_id: previous.practice_id, service_request_revision_id: revision_ids).includes(:current_version)
          if reports.any? && reports.none? { |report| report.current_version.reviewed_at && %w[final amended corrected].include?(report.current_version.status) && report.current_version.results.none? { |row| row["value_kind"] == "absent" } }
            raise ArgumentError, "Some lab results remain pending. Review available results or follow up with the laboratory."
          end
        end
        linked = if kind.to_sym == :medication_requests
          MedicationAdministration.exists?(practice_id: previous.practice_id,
            medication_request_revision_id: revision_ids, status: "completed") ||
            ClinicalPlanLink.exists?(practice_id: previous.practice_id, medication_request_revision_id: revision_ids)
        else
          ClinicalPlanLink.exists?(practice_id: previous.practice_id, service_request_revision_id: revision_ids) ||
            ReferralExchangeEvent.exists?(practice_id: previous.practice_id,
              service_request_series_id: previous.series_id, stage: "closed")
        end
        return if linked || values[:completion_exception].present?

        raise ArgumentError,
          "Link the fulfillment record before completing this order, or record a completion exception."
      end
      private_class_method :require_completion_evidence!

      def sync_order_task!(kind, record, previous, membership)
        source_kind = { medication_requests: "medication_request", service_requests: "service_request" }[kind.to_sym]
        return unless source_kind

        active_status = source_kind == "medication_request" ? "authorized" : "active"
        root = record.class.where(practice_id: record.practice_id, series_id: record.series_id, version_number: 1).sole
        task = Clinic::ClinicalTask.where(practice_id: record.practice_id, source_type: "order",
          source_kind:, source_id: root.id, state: %w[open claimed in_progress on_hold]).lock.first
        if record.status == active_status
          if task
            task.update!(state: task.assigned_to_membership_id ? "claimed" : "open") if task.state == "on_hold"
            due_at = record.respond_to?(:due_at) ? record.due_at : nil
            task.update!(due_at:) if task.due_at != due_at
          elsif previous.status != active_status
            Clinic::ClinicalTask.create!(practice_id: record.practice_id, patient_id: record.patient_id,
              encounter_id: record.encounter_id, site_id: record.site_id, task_kind: "order_execution",
              state: "open", pool_code: "clinical", source_type: "order", source_kind:, source_id: root.id,
              due_at: record.respond_to?(:due_at) ? record.due_at : nil, recorded_by_membership: membership)
          end
        elsif task
          if record.status == "completed"
            task.update!(state: "completed", resolution_code: "completed", completed_by_membership: membership,
              completed_at: Current.business_time)
          elsif record.status == "on_hold"
            task.update!(state: "on_hold")
          elsif record.status.in?(%w[cancelled entered_in_error])
            task.update!(state: "cancelled")
          end
        end
      end
      private_class_method :sync_order_task!

      def ensure_writable_encounter!(practice, patient, encounter)
        ensure_encounter_context!(practice, patient, encounter)
        unless encounter.status == "open" && encounter.ended_at.nil? && encounter.site_id.present?
          raise ArgumentError, "Clinical plan records require an open encounter with a facility."
        end
      end
      private_class_method :ensure_writable_encounter!

      def ensure_encounter_context!(practice, patient, encounter)
        raise ActiveRecord::RecordNotFound unless encounter.practice_id == practice.id && encounter.patient_id == patient.id
        raise ArgumentError, "Clinical plan records require an encounter facility." unless encounter.site_id.present?
      end
      private_class_method :ensure_encounter_context!

      def authorize_read!(practice, actor, patient, encounter)
        Clinic::Authorization.authorize!(actor:, practice:, action: "patients.read", subject: patient)
        Clinic::Authorization.authorize!(actor:, practice:, action: "clinical_records.read", site: encounter.site)
      end
      private_class_method :authorize_read!

      def authorize_write!(practice, actor, encounter, definition)
        Clinic::Authorization.authorize!(actor:, practice:, action: definition.fetch(:permission), site: encounter.site)
      end
      private_class_method :authorize_write!

      def allowed?(practice, actor, permission, encounter)
        Ability.new(actor, practice:).allowed_permission?(permission, site: encounter.site)
      end
      private_class_method :allowed?
    end
  end
end
