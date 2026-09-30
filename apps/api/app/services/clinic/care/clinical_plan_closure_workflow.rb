module Clinic
  module Care
    module ClinicalPlanClosureWorkflow
      module_function

      TARGETS = {
        "medication_statement" => { model: MedicationStatement, column: :medication_statement_id, source: "medication_request" },
        "medication_administration" => { model: MedicationAdministration, column: :medication_administration_id,
          source: "medication_request" },
        "lab_report" => { model: LabReport, column: :lab_report_id, source: "service_request" },
        "procedure" => { model: ProcedureRevision, column: :procedure_revision_id, source: "service_request" },
        "document" => { model: Clinic::Document, column: :document_id, source: "service_request" }
      }.freeze
      REFERRAL_TRANSITIONS = {
        nil => %w[prepared sent received],
        "prepared" => %w[sent cancelled],
        "sent" => %w[received acknowledged cancelled],
        "received" => %w[acknowledged closed],
        "acknowledged" => %w[closed],
        "closed" => [],
        "cancelled" => []
      }.freeze

      def workspace(practice:, actor:, patient:, encounter:)
        authorize_read!(practice, actor, patient, encounter)
        {
          links: ClinicalPlanLink.where(practice:, patient:, encounter:).order(recorded_at: :desc, id: :desc)
            .limit(200).map { |record| serialize_link(record) },
          referral_events: ReferralExchangeEvent.where(practice:, patient:, encounter:)
            .order(recorded_at: :desc, id: :desc).limit(200).map { |record| serialize_referral_event(record) },
          available_link_targets: available_link_targets(practice, actor, patient, encounter)
        }
      end

      def link(practice:, actor:, patient:, encounter:, source_kind:, source_revision_id:, target_kind:, target_id:,
        outcome_summary:, request_key:)
        source = owned_source!(practice, patient, encounter, source_kind, source_revision_id)
        target_definition = TARGETS.fetch(target_kind.to_s) { raise ArgumentError, "Choose a supported fulfillment result." }
        unless target_definition.fetch(:source) == source_kind.to_s
          raise ArgumentError, "That result cannot fulfill this request type."
        end
        authorize_source!(practice, actor, encounter, source_kind)
        if target_kind.to_s == "document"
          Clinic::Authorization.authorize!(actor:, practice:, action: "documents.read", any_site: true)
        end
        target = target!(target_definition, practice, patient, encounter, target_id)
        payload = {
          patient_id: patient.id, encounter_id: encounter.id, source_kind: source_kind.to_s,
          source_revision_id: source.id, target_kind: target_kind.to_s, target_id: target.id,
          outcome_summary: normalized_text(outcome_summary, 2_000)
        }
        result = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "clinical_plan.fulfillment.link", request_key:, payload:, resource: encounter,
          authorization_action: permission_for(source_kind),
          authorization: -> {
            authorize_source!(practice, actor, encounter, source_kind)
            if target_kind.to_s == "document"
              Clinic::Authorization.authorize!(actor:, practice:, action: "documents.read", any_site: true)
            end
          },
          result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) {
            ClinicalPlanLink.find_by(practice_id: practice.id, encounter_id: encounter.id, id: receipt.resource_id)
          }
        ) do
          membership = authorize_source!(practice, actor, encounter, source_kind)
          request_family = source_kind.to_s == "medication_request" ? "medication_requests" : "service_requests"
          ApplicationRecord.connection.execute(ApplicationRecord.sanitize_sql_array([
            "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
            "clinical-plan:#{practice.id}:#{request_family}:#{source.series_id}"
          ]))
          source = current_source!(practice, patient, encounter, source_kind, source_revision_id)
          validate_target_compatibility!(source, target_kind)
          validate_target_evidence!(source, target_kind, target)
          ClinicalPlanLink.create!(
            { practice:, patient:, encounter:, site: encounter.site, source_kind: source_kind.to_s,
              target_kind: target_kind.to_s, outcome_summary: payload[:outcome_summary],
              recorded_by_membership: membership, recorded_at: Current.business_time, request_key: }
              .merge(source_column(source_kind) => source.id, target_definition.fetch(:column) => target.id)
          )
        end
        serialize_link(result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed))
      end

      def record_referral_event(practice:, actor:, patient:, encounter:, service_request_revision_id:, direction:, stage:,
        organization_name:, note:, document_id:, request_key:)
        source = current_source!(practice, patient, encounter, "service_request", service_request_revision_id)
        raise ArgumentError, "Referral exchange events require a referral request." unless source.request_kind == "referral"
        authorize_source!(practice, actor, encounter, "service_request")
        direction = normalized_enum(direction, ReferralExchangeEvent::DIRECTIONS, "direction")
        stage = normalized_enum(stage, ReferralExchangeEvent::STAGES, "stage")
        document = document_id.present? ? target!(TARGETS.fetch("document"), practice, patient, encounter, document_id) : nil
        payload = {
          patient_id: patient.id, encounter_id: encounter.id, service_request_revision_id: source.id,
          service_request_series_id: source.series_id, direction:, stage:,
          organization_name: normalized_text(organization_name, 500), note: normalized_text(note, 2_000),
          document_id: document&.id
        }
        result = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "clinical_plan.referral_exchange.record", request_key:, payload:,
          resource: encounter, authorization_action: "service_requests.write",
          authorization: -> { authorize_source!(practice, actor, encounter, "service_request") },
          result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) {
            ReferralExchangeEvent.find_by(practice_id: practice.id, encounter_id: encounter.id, id: receipt.resource_id)
          }
        ) do
          membership = authorize_source!(practice, actor, encounter, "service_request")
          ApplicationRecord.connection.execute(ApplicationRecord.sanitize_sql_array([
            "SELECT pg_advisory_xact_lock(hashtextextended(?, 0))",
            "referral-exchange:#{practice.id}:#{source.series_id}"
          ]))
          previous = ReferralExchangeEvent.where(practice:, service_request_series_id: source.series_id)
            .order(recorded_at: :desc, id: :desc).first
          allowed = REFERRAL_TRANSITIONS.fetch(previous&.stage)
          raise ArgumentError, "That referral exchange transition is not allowed." unless allowed.include?(stage)
          if previous && previous.direction != direction
            raise ArgumentError, "Referral exchange direction cannot change after the first event."
          end
          ReferralExchangeEvent.create!(
            practice:, patient:, encounter:, site: encounter.site, service_request_revision: source,
            service_request_series_id: source.series_id, direction:, stage:,
            organization_name: payload[:organization_name], note: payload[:note], document:,
            recorded_by_membership: membership, recorded_at: Current.business_time, request_key:
          )
        end
        serialize_referral_event(result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed))
      end

      def serialize_link(record)
        {
          id: record.id, source_kind: record.source_kind,
          source_revision_id: record.medication_request_revision_id || record.service_request_revision_id,
          target_kind: record.target_kind,
          target_id: record.public_send(TARGETS.fetch(record.target_kind).fetch(:column)),
          outcome_summary: record.outcome_summary,
          recorded_by_membership_id: record.recorded_by_membership_id,
          recorded_at: record.recorded_at.iso8601(6)
        }
      end

      def serialize_referral_event(record)
        {
          id: record.id, service_request_revision_id: record.service_request_revision_id,
          service_request_series_id: record.service_request_series_id, direction: record.direction, stage: record.stage,
          organization_name: record.organization_name, note: record.note, document_id: record.document_id,
          recorded_by_membership_id: record.recorded_by_membership_id,
          recorded_at: record.recorded_at.iso8601(6)
        }
      end

      def available_link_targets(practice, actor, patient, encounter)
        documents_allowed = Ability.new(actor, practice:).allowed_permission?("documents.read", any_site: true)
        {
          medication_statement: MedicationStatement.where(practice:, patient:).order(updated_at: :desc, id: :desc).limit(100)
            .map { |record| { id: record.id, label: [ record.medication_name, record.dose_text, record.status ].compact.join(" · ") } },
          medication_administration: MedicationAdministration.where(practice:, patient:, encounter:, status: "completed")
            .joins(:movement_links)
            .includes(:site, :movement_links, administered_by_membership: [ :user, :clinician_profile ])
            .distinct.order(administered_at: :desc, id: :desc).limit(100).filter_map do |record|
              medication = record.medication_identity
              stock = record.movement_links.sort_by(&:id).filter_map do |link|
                identity = link.stock_identity
                [ identity[:lot_number].to_s, identity[:expires_on].to_s ]
              rescue ArgumentError
                nil
              end.uniq
              next unless stock.one?

              lot_number, lot_expiration_date = stock.sole
              membership = record.administered_by_membership
              vaccinator_label = membership.clinician_profile&.display_name.presence || membership.user.email_address
              { id: record.id,
                label: [ medication.fetch(:name), record.dose_text,
                  "Lot #{lot_number}",
                  vaccinator_label, record.site.name,
                  record.administered_at.iso8601(6) ].compact.join(" · "),
                status: record.status, movement_count: record.movement_links.length, lot_numbers: [ lot_number ],
                lot_number:, lot_expiration_date:, administered_at: record.administered_at.iso8601(6),
                dose_text: record.dose_text, route_text: record.route_text,
                administration_site_text: record.administration_site_text,
                vaccinator_membership_id: membership.id, vaccinator_label:,
                administering_site_id: record.site_id, administering_site_label: record.site.name }
            end,
          lab_report: LabReport.where(practice:, patient:).includes(:current_version).order(updated_at: :desc, id: :desc)
            .limit(100).map { |record| { id: record.id, label: record.current_version&.title || "Lab report #{record.id}" } },
          procedure: current_procedures(practice, patient, encounter).select { |record| record.status == "completed" }.map do |record|
            { id: record.id, label: "#{record.procedure_display} · #{record.status}" }
          end,
          document: documents_allowed ? Clinic::Document.where(practice:, patient:).includes(:category)
            .order(created_at: :desc, id: :desc).limit(100).map do |record|
              { id: record.id, label: "#{record.category.name} · #{record.media_type} · document #{record.id}" }
            end : []
        }
      end
      private_class_method :available_link_targets

      def current_procedures(practice, patient, encounter)
        table = ProcedureRevision.table_name
        ProcedureRevision.where(practice:, patient:, encounter:)
          .select("DISTINCT ON (#{table}.series_id) #{table}.*")
          .order(Arel.sql("#{table}.series_id, #{table}.version_number DESC, #{table}.id DESC"))
          .limit(100)
      end
      private_class_method :current_procedures

      def owned_source!(practice, patient, encounter, source_kind, source_revision_id)
        model = source_kind.to_s == "medication_request" ? MedicationRequestRevision :
          (source_kind.to_s == "service_request" ? ServiceRequestRevision : nil)
        raise ArgumentError, "Choose a supported request type." unless model
        model.where(practice:, patient:, encounter:).find(source_revision_id)
      end
      private_class_method :owned_source!

      def current_source!(practice, patient, encounter, source_kind, source_revision_id)
        source = owned_source!(practice, patient, encounter, source_kind, source_revision_id)
        current = source.class.where(practice:, patient:, encounter:, series_id: source.series_id)
          .order(version_number: :desc, id: :desc).first
        raise ActiveRecord::StaleObjectError.new(source, "link fulfillment") unless current.id == source.id
        source
      end
      private_class_method :current_source!

      def target!(definition, practice, patient, encounter, target_id)
        scope = definition.fetch(:model).where(practice_id: practice.id, patient_id: patient.id)
        if definition.fetch(:model).column_names.include?("encounter_id")
          scope = scope.where(encounter_id: encounter.id)
        end
        scope.find(target_id)
      end
      private_class_method :target!

      def source_column(source_kind)
        source_kind.to_s == "medication_request" ? :medication_request_revision_id : :service_request_revision_id
      end
      private_class_method :source_column

      def validate_target_compatibility!(source, target_kind)
        raise ArgumentError, "That result type does not match this order." unless target_compatible?(source, target_kind)
      end
      private_class_method :validate_target_compatibility!

      def target_compatible?(source, target_kind, request_kind: nil)
        definition = TARGETS[target_kind.to_s]
        source_kind = source.is_a?(MedicationRequestRevision) ? "medication_request" : "service_request"
        return false unless definition && definition.fetch(:source) == source_kind
        return true unless source.is_a?(ServiceRequestRevision)

        allowed = case request_kind || source.request_kind
        when "lab" then %w[lab_report document]
        when "procedure" then %w[procedure document]
        else %w[document]
        end
        allowed.include?(target_kind.to_s)
      end
      private_class_method :target_compatible?

      def fulfillment_link_evidence?(source, link, request_kind: nil)
        target = link.public_send(TARGETS.fetch(link.target_kind).fetch(:column).to_s.delete_suffix("_id"))
        target_evidence?(source, link.target_kind, target, request_kind:)
      end

      def target_evidence?(source, target_kind, target, request_kind: nil)
        return false unless target && target_compatible?(source, target_kind, request_kind:)

        case target_kind.to_s
        when "medication_administration"
          target.status == "completed" && target.movement_links.exists?
        when "procedure"
          target.status == "completed" && !ProcedureRevision.where(
            practice_id: target.practice_id, patient_id: target.patient_id, encounter_id: target.encounter_id,
            series_id: target.series_id, status: "entered_in_error"
          ).where("version_number > ?", target.version_number).exists?
        when "lab_report"
          order = target.service_request_revision
          order && [ order.practice_id, order.patient_id, order.encounter_id, order.series_id ] ==
            [ source.practice_id, source.patient_id, source.encounter_id, source.series_id ]
        else
          true
        end
      end
      private_class_method :target_evidence?

      def validate_target_evidence!(source, target_kind, target)
        return if target_evidence?(source, target_kind, target)

        message = case target_kind.to_s
        when "procedure" then "Only a completed procedure without a later entered-in-error revision can be linked as fulfillment."
        when "lab_report" then "The lab report must belong to this laboratory order."
        else "Only a completed, stock-linked medication administration can be linked."
        end
        raise ArgumentError, message
      end
      private_class_method :validate_target_evidence!

      def permission_for(source_kind)
        source_kind.to_s == "medication_request" ? "medication_requests.write" : "service_requests.write"
      end
      private_class_method :permission_for

      def authorize_read!(practice, actor, patient, encounter)
        Clinic::Authorization.authorize!(actor:, practice:, action: "patients.read", subject: patient)
        Clinic::Authorization.authorize!(actor:, practice:, action: "clinical_records.read", site: encounter.site)
      end
      private_class_method :authorize_read!

      def authorize_source!(practice, actor, encounter, source_kind)
        Clinic::Authorization.authorize!(actor:, practice:, action: permission_for(source_kind), site: encounter.site)
      end
      private_class_method :authorize_source!

      def normalized_text(value, maximum)
        text = value.to_s.strip.presence
        raise ArgumentError, "Text is too long." if text && text.length > maximum
        text
      end
      private_class_method :normalized_text

      def normalized_enum(value, allowed, field)
        candidate = value.to_s.strip
        raise ArgumentError, "Choose a supported #{field}." unless allowed.include?(candidate)
        candidate
      end
      private_class_method :normalized_enum
    end
  end
end
