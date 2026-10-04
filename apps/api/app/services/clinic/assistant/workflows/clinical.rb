module Clinic
  module Assistant
    module Workflows
      class Clinical
        LIMIT = 25
        TASK_ACTIONS = %w[claim assign accept_transfer reject_transfer start complete cancel reopen].freeze
        READS = {
          "patients.search" => ["Find patients", "Search authorized patient identities by name or clinic reference."],
          "patients.detail" => ["Patient details", "Read the selected patient's registration and current measurements."],
          "patients.activity" => ["Patient activity", "Read bounded patient activity metadata with existing permission filtering."],
          "care.summary" => ["Care summary", "Read recorded allergies, medicines, care needs, conditions and review states."],
          "care.history" => ["Clinical history", "Read supplied allergy, medication and condition history, including inactive records."],
          "care.plan_workspace" => ["Clinical plan workspace", "Read saved clinical plans, requests, diagnoses, procedures, goals, immunization and assessment records."],
          "care.coordination" => ["Care coordination", "Read recorded primary care, specialists and pharmacy information."],
          "care.encounters" => ["Patient encounters", "Read the selected patient's encounters at this location."],
          "care.notes" => ["Encounter notes", "Read note revision and signature metadata for the selected encounter."],
          "care.note" => ["Read a note", "Read a selected SOAP note and its saved revision history."],
          "care.templates" => ["Note templates", "Read available SOAP template prompts without recording findings."],
          "care.observations" => ["Measurements and observations", "Read recorded observations with their units, dates and missingness."],
          "care.labs" => ["Patient lab reports", "Read lab reports and existing follow-up states at this location."],
          "care.lab" => ["Read a lab report", "Read a selected report's saved results and version history."],
          "intake.workspace" => ["Intake workspace", "Read the current intake, questions, evidence and handoff state."],
          "intake.question_tasks" => ["Intake follow-up work", "Read deliberately recorded question follow-ups and their task links."],
          "care.tasks" => ["Patient tasks", "Read task ownership, prerequisites and source-workspace restrictions."]
        }.freeze

        def self.field(key, label, type = "text", required: false, options: nil)
          { key:, label:, type:, required: }.tap { |value| value[:options] = options if options }
        end

        def self.definitions
          reads = READS.map do |key, (title, description)|
            fields = case key
            when "patients.search" then [field("query", "Name or clinic reference", required: true)]
            when "care.note" then [field("note", "SOAP note", "record", required: true)]
            when "care.lab" then [field("report", "Lab report", "record", required: true)]
            else []
            end
            { key:, title:, description:, domain: "clinical", kind: "read", fields:,
              patient_required?: key != "patients.search",
              encounter_required?: %w[care.notes care.note care.templates care.plan_workspace intake.workspace intake.question_tasks].include?(key) }
          end
          note_fields = %w[subjective objective assessment plan].map { |key| field(key, key.humanize) }
          reads + history_definitions + registration_definitions + plan_definitions + [
            change("care.note_draft_create", "Create SOAP draft", "Save supplied documentation as an unsigned draft for clinician review.",
              [field("template_id", "Template", "select", required: true,
                  options: Clinic::Care::NoteTemplateCatalog.all.map { |template| template[:id] }), *note_fields,
                field("patient_instructions", "Draft patient instructions"), field("session_duration_minutes", "Actual session minutes", "number")]),
            change("care.note_draft_revise", "Revise SOAP draft", "Replace an unsigned draft's sections; signed content remains immutable.",
              [field("note", "Unsigned SOAP note", "record", required: true), *note_fields,
                field("patient_instructions", "Draft patient instructions"), field("session_duration_minutes", "Actual session minutes", "number")]),
            change("intake.draft_save", "Save intake draft", "Save narrative draft text while preserving saved answers and evidence; reopen question confirmation for review.",
              [field("text", "Draft intake narrative", required: true)]),
            change("intake.question_answer_save", "Save an intake answer draft", "Save one configured answer with its type and choice validation; preserve other answers and reopen confirmation.",
              [field("question_id", "Configured question", "select", required: true, options: intake_question_ids),
                field("state", "Answer state", "select", required: true, options: Clinic::Care::PrevisitIntake::ANSWER_STATES),
                field("value", "Answer"), { key: "values", label: "Selected answers", type: "array", required: false, max_items: 40, items: { type: "text" } },
                field("other_detail", "Other detail"), field("unit", "Measurement unit"), field("measured_at", "Measurement date", "date"),
                field("source", "Measurement source"), field("verification", "Verification state"), field("source_details", "Source detail")]),
            change("intake.record_field_save", "Save an intake record field draft", "Save one configured field in a typed intake record, preserving the other fields and answers for review.",
              [field("question_id", "Configured record question", "select", required: true,
                  options: intake_fields.select { |question| question[:record_fields] }.map { |question| question[:id] }.uniq),
                field("entry_index", "Record position (zero based)", "number", required: true),
                field("field_id", "Configured record field", "select", required: true,
                  options: intake_fields.flat_map { |question| Array(question[:record_fields]).map { |child| child[:id] } }.uniq),
                field("value", "Field value"), { key: "values", label: "Selected field values", type: "array", required: false, max_items: 40, items: { type: "text" } }]),
            change("care.fulfillment_link", "Link supplied fulfillment evidence", "Link an existing same-patient result to its request using the existing evidence checks; preserve request approval and completion.",
              [field("source_kind", "Request type", "select", required: true, options: %w[medication_request service_request]),
                field("source_record", "Current request", "record", required: true),
                field("target_kind", "Result type", "select", required: true, options: Clinic::Care::ClinicalPlanClosureWorkflow::TARGETS.keys),
                field("target_record", "Recorded result", "record", required: true), field("outcome_summary", "Documented outcome")]),
            change("care.referral_event_record", "Record supplied referral history", "Record a supplied referral exchange event with its existing transition rules; this action sends no referral.",
              [field("source_record", "Current referral request", "record", required: true),
                field("direction", "Direction", "select", required: true, options: Clinic::Care::ReferralExchangeEvent::DIRECTIONS),
                field("stage", "Documented stage", "select", required: true, options: Clinic::Care::ReferralExchangeEvent::STAGES),
                field("organization_name", "Organization"), field("note", "Recorded evidence", required: true),
                field("source_document_id", "Supporting document", "record")]),
            change("care.vital_record", "Record a vital sign", "Record one supplied measurement using the existing vital-sign dictionary and unit validation.",
              [field("code", "Measurement", "select", required: true,
                  options: Clinic::Care::VitalSigns.fields.map { |item| item[:code] } - Clinic::Care::VitalSigns::BLOOD_PRESSURE_COMPONENTS),
                field("value", "Exact measured value", required: true), field("unit_code", "Dictionary unit", "select", required: true,
                  options: Clinic::Care::VitalSigns.fields.flat_map { |item| item[:units].map { |unit| unit[:code] } }.uniq),
                field("observed_at", "Measured at", "datetime", required: true), field("confirmed_patient", "Patient explicitly confirmed", "boolean", required: true)]),
            change("care.blood_pressure_record", "Record blood pressure", "Record both supplied blood-pressure components together using the existing dictionary.",
              [field("systolic", "Systolic pressure in mmHg", required: true), field("diastolic", "Diastolic pressure in mmHg", required: true),
                field("observed_at", "Measured at", "datetime", required: true), field("confirmed_patient", "Patient explicitly confirmed", "boolean", required: true)]),
            change("care.task_create", "Create encounter task", "Create manual work in the existing encounter task queue.",
              [field("task_kind", "Task kind", "select", required: true, options: Clinic::ClinicalTask::KINDS),
                field("pool_code", "Team", "select", required: true, options: Clinic::ClinicalTask::POOLS),
                field("assignee", "Assigned staff member", "record"), field("due_at", "Due at", "datetime")]),
            change("care.task_transition", "Update task ownership or state", "Apply an explicit task action; source-managed work must be resolved in its owning workspace.",
              [field("task", "Task", "record", required: true),
                field("action", "Action", "select", required: true, options: TASK_ACTIONS),
                field("assignee", "Transfer to staff member", "record"),
                field("resolution_code", "Recorded resolution", "select", options: Clinic::ClinicalTask::RESOLUTIONS)]),
            change("care.observation_record", "Record an observation", "Record a supplied finding with explicit code, value, unit and observation time.",
              [field("code", "Observation code", required: true), field("code_system", "Code system", required: true),
                field("code_version", "Code version", required: true),
                field("value_kind", "Value kind", "select", required: true, options: %w[numeric text coded missing]),
                field("numeric_value", "Exact decimal value"), field("text_value", "Text finding"),
                field("coded_value", "Coded finding"), field("unit_code", "Unit code"),
                field("missing_reason", "Missing reason"), field("observed_at", "Observed at", "datetime", required: true)]),
            change("care.coordination_add", "Record coordination contact", "Add supplied contact information to this patient's existing coordination record.",
              [field("group", "Contact group", "select", required: true, options: %w[primary_care specialists pharmacy]),
                field("name", "Provider or pharmacy name", required: true), field("practice", "Practice name"),
                field("phone", "Phone"), field("address", "Address"),
                field("source", "Information source", "select", required: true,
                  options: Clinic::Care::PatientCareCoordinationRevision::SOURCES),
                field("source_detail", "Source detail"), field("address_confirmed", "Address explicitly confirmed", "boolean", required: true)],
              encounter_required: false)
          ]
        end

        def self.intake_question_ids
          intake_fields
            .reject { |question| question[:record_fields] || question[:id] == "instrument_status" }.map { |question| question[:id] }.uniq
        end

        def self.intake_fields
          Clinic::Care::PrevisitIntake::FIELDS + Clinic::Care::PrevisitIntake::SPECIALTY_FORMS.values.flatten(1)
        end

        def self.registration_definitions
          texts = %w[display_name legal_name preferred_name primary_address primary_language contact_value emergency_name emergency_relationship emergency_phone
            tobacco_use alcohol_use exercise_habits diet occupation living_situation relevant_social_factors]
          fields = texts.map { |name| field(name, name.humanize) } + [field("date_of_birth", "Date of birth", "date"),
            field("sex", "Recorded sex", "select", options: Clinic::Care::PatientDemographics.sexes.keys),
            field("contact_type", "Contact type", "select", options: %w[phone email]),
            field("preferred_contact_method", "Preferred contact method", "select", options: %w[text phone email portal])] +
            %w[interpreter_required preferred permission_to_contact appointment_reminders_consent general_communications_consent].map do |name|
              field(name, name.humanize, "boolean")
            end
          [change("patients.registration_correct", "Correct patient registration", "Save supplied registration corrections with existing validation and append-only contact history.", fields, encounter_required: false),
            { key: "patients.register", title: "Register a patient", domain: "clinical", kind: "change",
              description: "Register supplied patient details at the configured selected location with existing validation.",
              patient_required?: false, encounter_required?: false,
              fields: [field("reference", "Clinic reference", required: true), *fields.map do |item|
                item.merge(required: %w[display_name sex].include?(item[:key]))
              end] }]
        end

        def self.history_definitions
          models = Clinic::Care::ClinicalHistory::KINDS
          models.flat_map do |kind, definition|
            klass = definition.fetch(:model)
            fields = case kind
            when "allergies"
              [field("allergen_name", "Allergen", required: true), field("reaction", "Reaction"),
                *{ category: klass.categories.keys, clinical_status: klass.clinical_statuses.keys, verification_status: klass.verification_statuses.keys,
                  criticality: klass.criticalities.keys, severity: klass.severities.keys }.map { |name, choices| field(name.to_s, name.to_s.humanize, "select", required: true, options: choices) },
                field("onset_at", "Onset at", "datetime")]
            when "medications"
              [field("medication_name", "Reported medication", required: true), *%w[dose_text route_text frequency_text purpose].map { |name| field(name, name.humanize) },
                field("status", "Status", "select", required: true, options: klass.statuses.keys),
                field("information_source", "Information source", "select", required: true, options: klass.information_sources.keys),
                *%w[effective_from effective_until asserted_at].map { |name| field(name, name.humanize, "datetime") }]
            when "conditions"
              [field("condition_name", "Reported condition", required: true), field("care_instruction", "Care instruction"),
                field("clinical_status", "Clinical status", "select", required: true, options: klass.clinical_statuses.keys),
                field("verification_status", "Verification status", "select", required: true, options: klass.verification_statuses.keys),
                field("affects_current_care", "Affects current care", "boolean", required: true),
                field("onset_at", "Onset at", "datetime"), field("resolved_at", "Resolved at", "datetime")]
            end
            [change("care.history_#{kind}_create", "Record #{kind.singularize} history", "Save supplied history with the existing open-encounter operation.", fields),
              change("care.history_#{kind}_update", "Correct #{kind.singularize} history", "Save supplied corrections to a selected history record with its version check.",
                [field("history_record", "History record", "record", required: true), *fields])]
          end
        end

        def self.plan_definitions
          excluded = %i[status transmission_state requester_membership_id reviewer_membership_id reviewed_at completion_exception refill_of_series_id item_responses]
          references = %i[inventory_product_id source_medication_statement_id service_request_revision_id care_plan_revision_id source_document_id medication_administration_id]
          enums = {
            intent: Clinic::Care::MedicationRequestRevision::INTENTS,
            dose_unit_code: Clinic::Care::MedicationRequestRevision::DOSE_UNITS.keys,
            route_code: Clinic::Care::MedicationRequestRevision::ROUTES.keys,
            substitution_instruction: Clinic::Care::MedicationRequestRevision::SUBSTITUTION_INSTRUCTIONS,
            fulfillment_route: %w[outside_pharmacy take_home administration], request_kind: Clinic::Care::ServiceRequestRevision::KINDS,
            priority: Clinic::Care::ServiceRequestRevision::PRIORITIES, classification: Clinic::Care::EncounterDiagnosisRevision::CLASSIFICATIONS,
            complication_state: Clinic::Care::ProcedureRevision::COMPLICATION_STATES, outcome_source: Clinic::Care::CareGoalRevision::OUTCOME_SOURCES,
            occurrence_source: Clinic::Care::ImmunizationRevision::OCCURRENCE_SOURCES,
            category: Clinic::Configuration::PracticeFeatures::ASSESSMENT_SCOPE,
            response_source: Clinic::Care::AssessmentRevision::RESPONSE_SOURCES,
            score_source: Clinic::Care::AssessmentRevision::SCORE_SOURCES - ["calculated"],
            assessment_state: Clinic::Care::AssessmentRevision::ASSESSMENT_STATES
          }
          required = { medication_requests: %i[medication_name intent], service_requests: %i[request_kind intent priority requested_display],
            diagnoses: %i[classification diagnosis_display], procedures: %i[procedure_display complication_state],
            care_plans: %i[title], care_goals: %i[description], immunizations: %i[vaccine_name occurrence_source], assessments: %i[category instrument_name assessment_state] }
          Clinic::Care::ClinicalPlanWorkflow::DEFINITIONS.flat_map do |kind, definition|
            fields = (definition.fetch(:fields) - excluded).map do |name|
              type = if references.include?(name) then "record"
              elsif enums.key?(name) then "select"
              elsif name.to_s.end_with?("_at") || name == :scheduled_for then "datetime"
              elsif name.to_s.end_with?("_on", "_date") then "date"
              elsif name == :refills then "number"
              else "text"
              end
              field(name.to_s, name.to_s.humanize, type, required: required.fetch(kind).include?(name), options: enums[name])
            end
            [change("care.plan_#{kind}_draft_create", "Create #{kind.to_s.singularize.humanize.downcase} draft", "Save supplied clinical plan information in the existing initial draft state for human review.", fields),
              change("care.plan_#{kind}_draft_revise", "Revise #{kind.to_s.singularize.humanize.downcase} draft", "Revise a selected draft without authorizing, activating, transmitting or completing it.",
                [field("plan_record", "Current draft", "record", required: true), *fields.map { |item| item.merge(required: false) }])]
          end
        end

        def self.change(key, title, description, fields, encounter_required: true)
          { key:, title:, description:, fields:, domain: "clinical", kind: "change",
            patient_required?: true, encounter_required?: encounter_required }
        end
        private_class_method :change, :field

        def initialize(practice:, actor:, site:, patient:, encounter:)
          @practice, @actor, @site, @patient, @encounter = practice, actor, site, patient, encounter
        end

        def authorize!(key:, inputs:)
          definition!(key)
          if key == "patients.search"
            Clinic::Authorization.authorize_with_legacy!(practice: @practice, actor: @actor,
              action: "patients.identity.read", legacy_action: "patients.read", site: @site)
            return
          end
          if key == "patients.register"
            Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: "patients.write", site: @site)
            return
          end
          patient = selected_patient!
          Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: "patients.read", subject: patient)
          permission = case key
          when "care.encounters", "care.tasks" then "encounters.read"
          when "care.notes", "care.note", "care.templates", "care.labs", "care.lab" then "notes.read"
          when "care.plan_workspace" then "clinical_records.read"
          when "care.note_draft_create", "care.note_draft_revise" then "notes.write"
          when "intake.draft_save", "intake.question_answer_save", "intake.record_field_save" then "intake.write"
          when "care.task_create", "care.task_transition" then "encounters.write"
          when "care.observation_record", "care.vital_record", "care.blood_pressure_record" then "observations.write"
          when "care.coordination_add", "patients.registration_correct" then "patients.write"
          when "care.referral_event_record" then "service_requests.write"
          when "care.fulfillment_link"
            if inputs["source_kind"] == "medication_request" then "medication_requests.write"
            elsif inputs["source_kind"] == "service_request" then "service_requests.write"
            else "clinical_records.read"
            end
          end
          permission = "notes.write" if history_kind(key)
          permission = Clinic::Care::ClinicalPlanWorkflow::DEFINITIONS.fetch(plan_kind(key)).fetch(:permission) if plan_kind(key)
          Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: permission, site: @site) if permission
        end

        def options(key:, field:, query:, inputs:)
          authorize!(key:, inputs:)
          return [] unless definition!(key).fetch(:fields).any? { |item| item[:key] == field && item[:type] == "record" }
          case field
          when "note"
            notes = note_scope.order(id: :desc).limit(LIMIT)
            notes = notes.reject { |note| note.revisions.order(revision_no: :desc).first&.signatures&.exists? } if key == "care.note_draft_revise"
            notes.map { |note| option(note, "SOAP draft/history #{note.created_at.strftime('%Y-%m-%d %H:%M')} (revision #{note.revisions.maximum(:revision_no)})") }
          when "report"
            report_scope.includes(:current_version).order(id: :desc).limit(LIMIT).map do |report|
              option(report, "#{report.current_version&.title || report.source_name} — #{report.current_version&.issued_at&.strftime('%Y-%m-%d')}")
            end
          when "task"
            task_scope.includes(:assigned_to_membership).order(id: :desc).limit(LIMIT).map do |task|
              option(task, "#{task.task_kind.humanize} — #{task.state.humanize} — #{task.assigned_to_membership&.user&.email_address.presence || task.pool_code.humanize}")
            end
          when "assignee"
            @practice.memberships.active.includes(:user).order(:id).select do |member|
              member.user&.active? && Ability.new(member.user, practice: @practice).allowed_permission?("encounters.write", site: @site)
            end.first(LIMIT).map { |member| option(member, member.user.email_address) }
          when "history_record"
            history_scope(history_kind(key)).order(recorded_at: :desc, id: :desc).limit(LIMIT).map do |record|
              option(record, history_label(record))
            end
          when "plan_record"
            kind = plan_kind(key)
            current_plan_scope(kind).where(status: Clinic::Care::ClinicalPlanWorkflow::DEFINITIONS.fetch(kind).fetch(:default_status))
              .limit(LIMIT).map { |record| option(record, plan_label(record)) }
          when "source_record"
            source_kind = key == "care.referral_event_record" ? "service_request" : inputs["source_kind"]
            return [] unless %w[medication_request service_request].include?(source_kind)
            records = current_plan_scope(source_kind == "medication_request" ? :medication_requests : :service_requests)
            records = records.where(request_kind: "referral") if key == "care.referral_event_record"
            records.limit(LIMIT).map { |record| option(record, plan_label(record)) }
          when "target_record"
            return [] unless Clinic::Care::ClinicalPlanClosureWorkflow::TARGETS.key?(inputs["target_kind"])
            fulfillment_target_scope(inputs.fetch("target_kind")).limit(LIMIT).map do |record|
              label = if record.respond_to?(:medication_name) then record.medication_name
              elsif record.respond_to?(:procedure_display) then record.procedure_display
              elsif record.respond_to?(:current_version) then record.current_version&.title || record.source_name
              elsif record.respond_to?(:dose_text) then "#{record.dose_text} — #{record.administered_at&.iso8601}"
              else "#{record.media_type} — #{record.created_at.strftime('%Y-%m-%d')}"
              end
              option(record, label)
            end
          else
            reference_options(field)
          end
        end

        def resolve(key:, inputs:)
          definition = definition!(key)
          resolved = inputs.stringify_keys.dup
          authorize!(key:, inputs: resolved)
          selected_encounter! if definition[:encounter_required?]
          if history_kind(key) && resolved["history_record"]
            kind = history_kind(key)
            klass = Clinic::Care::ClinicalHistory::KINDS.fetch(kind).fetch(:model)
            resolved["_history_record"] = history_scope(kind).find(record_id!(resolved["history_record"], klass.name))
          end
          if plan_kind(key)
            kind = plan_kind(key)
            if resolved["plan_record"]
              klass = Clinic::Care::ClinicalPlanWorkflow::DEFINITIONS.fetch(kind).fetch(:klass)
              record = current_plan_scope(kind).find(record_id!(resolved["plan_record"], klass.name))
              unless record.status == Clinic::Care::ClinicalPlanWorkflow::DEFINITIONS.fetch(kind).fetch(:default_status)
                raise ArgumentError, "Revise approved or completed records in the clinical workspace."
              end
              resolved["_plan_record"] = record
            end
            plan_reference_fields.each do |field|
              next unless resolved[field]
              scope = reference_scope(field)
              resolved["_#{field}"] = scope.find(record_id!(resolved[field], scope.klass.name))
            end
          end
          if %w[care.fulfillment_link care.referral_event_record].include?(key)
            source_kind = key == "care.referral_event_record" ? "service_request" : resolved.fetch("source_kind")
            scope = current_plan_scope(source_kind == "medication_request" ? :medication_requests : :service_requests)
            scope = scope.where(request_kind: "referral") if key == "care.referral_event_record"
            resolved["_source_record"] = scope.find(record_id!(resolved.fetch("source_record"), scope.klass.name))
            if key == "care.fulfillment_link"
              target_scope = fulfillment_target_scope(resolved.fetch("target_kind"))
              resolved["_target_record"] = target_scope.find(record_id!(resolved.fetch("target_record"), target_scope.klass.name))
            elsif resolved["source_document_id"]
              scope = reference_scope("source_document_id")
              resolved["_source_document_id"] = scope.find(record_id!(resolved["source_document_id"], scope.klass.name))
            end
          end
          if resolved["note"]
            resolved["_note"] = note_scope.find(record_id!(resolved["note"], "Clinic::EncounterNote"))
          end
          if resolved["report"]
            resolved["_report"] = report_scope.find(record_id!(resolved["report"], "Clinic::Care::LabReport"))
          end
          if resolved["task"]
            resolved["_task"] = task_scope.find(record_id!(resolved["task"], "Clinic::ClinicalTask"))
          end
          if resolved["assignee"]
            member = @practice.memberships.active.includes(:user).find(record_id!(resolved["assignee"], "Clinic::Membership"))
            unless member.user&.active? && Ability.new(member.user, practice: @practice).allowed_permission?("encounters.write", site: @site)
              raise Clinic::Authorization::Denied
            end
            resolved["_assignee"] = member
          end
          if resolved["template_id"]
            template = Clinic::Care::NoteTemplateCatalog.available(practice: @practice, site: @site)
              .find { |candidate| candidate[:id] == resolved["template_id"] } || raise(ArgumentError, "Choose an available SOAP template.")
            Clinic::Care::NoteTemplateCatalog.require_available!(practice: @practice, encounter: selected_encounter!,
              template_id: template[:id], template_version: template[:version])
            resolved["_template"] = template
          end
          if key == "care.note_draft_revise"
            latest = resolved.fetch("_note").revisions.order(revision_no: :desc).first || raise(ArgumentError, "The note has no saved draft.")
            raise ArgumentError, "Signed content must be corrected in the chart workspace." if latest.signatures.exists?
            resolved["_revision"] = latest
          end
          if key == "care.task_transition"
            raise ArgumentError, "Choose an assignee for the transfer." if resolved["action"] == "assign" && !resolved["_assignee"]
            if resolved["action"] == "complete" && resolved["resolution_code"].blank?
              raise ArgumentError, "Provide the documented task resolution before completion."
            end
          end
          if %w[intake.question_answer_save intake.record_field_save].include?(key)
            form = intake_form
            question = form.fetch(:fields).find { |item| item[:id] == resolved["question_id"] } || raise(ArgumentError, "Choose a question from this encounter's current form.")
            previous = latest_intake && Clinic::Care::PrevisitIntake.decode(latest_intake.encrypted_questionnaire) || {}
            unless Clinic::Care::PrevisitIntake.visible?(question, previous.fetch("answers", {}), form_id: form[:id], definitions: form[:fields])
              raise ArgumentError, "Answer this question's prerequisite in the intake workspace first."
            end
            answer = if key == "intake.record_field_save"
              index = resolved.fetch("entry_index")
              raise ArgumentError, "Choose a whole-number record position between zero and nineteen." unless index.is_a?(Integer) && index.between?(0, 19)
              child = Array(question[:record_fields]).find { |item| item[:id] == resolved["field_id"] } || raise(ArgumentError, "Choose a configured field for this record question.")
              previous_answer = previous.fetch("answers", {})[question[:id]]
              entries = previous_answer.is_a?(Hash) ? Array(previous_answer["entries"]).deep_dup : []
              raise ArgumentError, "Add a record at the next available position." if index > entries.length
              entry = entries[index] || {}
              entry[child[:id]] = child[:input_type] == "multiselect" ? resolved.fetch("values", []) : resolved.fetch("value", "")
              entries[index] = entry
              { "state" => "answered", "value" => "", "entries" => entries }
            else
              resolved.slice("state", "value", "values", "other_detail", "unit", "measured_at", "source", "verification", "source_details")
            end
            resolved["_answer"] = Clinic::Care::PrevisitIntake.normalize_answer(answer, question, status: "draft")
          end
          definition.fetch(:fields).select { |field| field[:type] == "record" }.each do |field|
            name = field[:key]
            next unless resolved[name]
            record = resolved.fetch("_#{name}")
            unless resolved.fetch(name).fetch("version").to_s == selection_version(record).to_s
              raise ActiveRecord::StaleObjectError.new(record, "use clinical selection")
            end
          end
          resolved
        end

        def selection_version(record)
          base = ContextRegistry.record_version(record)
          return base unless record.is_a?(Clinic::EncounterNote)

          "#{base}:revision:#{record.revisions.maximum(:revision_no).to_i}:signature:#{record.signatures.maximum(:id).to_i}"
        end

        def versions(key:, resolved:)
          result = {}
          result["patient"] = ContextRegistry.record_version(selected_patient!) unless %w[patients.search patients.register].include?(key)
          result["site"] = ContextRegistry.record_version(@practice.sites.find(@site.id)) if @site
          result["encounter"] = ContextRegistry.record_version(selected_encounter!) if @encounter && !%w[patients.search patients.register].include?(key)
          %w[note report task assignee].each do |name|
            record = resolved["_#{name}"]
            result[name] = ContextRegistry.record_version(record.reload) if record
          end
          resolved.each do |name, record|
            result[name] = ContextRegistry.record_version(record.reload) if name.start_with?("_") && record.is_a?(ApplicationRecord)
          end
          if resolved["_note"]
            note = resolved.fetch("_note")
            result["note_revision"] = note.revisions.maximum(:revision_no).to_i
            result["note_signatures"] = note.signatures.maximum(:id).to_i
          end
          if %w[intake.draft_save intake.question_answer_save intake.record_field_save].include?(key)
            result["intake_revision"] = latest_intake&.version_number || 0
            result["intake_form"] = intake_form.slice(:id, :version).stringify_keys
            result["question_schema"] = intake_form[:fields].find { |field| field[:id] == resolved["question_id"] }&.deep_stringify_keys if resolved["question_id"]
          end
          if key == "care.coordination_add"
            result["coordination_revision"] = coordination&.revision || 0
          end
          if resolved["_template"]
            result["template"] = resolved.fetch("_template").slice(:id, :version).stringify_keys
          end
          result["vital_dictionary"] = Clinic::Care::VitalSigns::DICTIONARY_VERSION if %w[care.vital_record care.blood_pressure_record].include?(key)
          if key == "care.referral_event_record"
            result["referral_event"] = Clinic::Care::ReferralExchangeEvent.where(practice: @practice,
              service_request_series_id: resolved.fetch("_source_record").series_id).maximum(:id).to_i
          end
          result
        end

        def execute(key:, resolved:)
          authorize!(key:, inputs: resolved)
          payload = case key
          when "patients.search"
            patients = Clinic::Care::PatientIdentitySearch.search(scope: identity_scope,
              practice_id: @practice.id, query: resolved.fetch("query")).includes(:demographics, :contacts)
              .order(:reference, :id).limit(LIMIT + 1).to_a
            { patients: patients.first(LIMIT).map { |patient| Clinic::Care::PatientSerializer.identity_lookup(patient) },
              limited: patients.length > LIMIT, next_action: "Choose the patient in the workspace to establish an assistant context." }
          when "patients.detail" then Clinic::Care::PatientSerializer.call(selected_patient!, detail: true)
          when "patients.register", "patients.registration_correct" then save_registration(key, resolved)
          when "patients.activity" then Clinic::Care::PatientActivityHistory.call(patient: selected_patient!, ability: ability)
          when "care.summary" then Clinic::Care::PatientCareSummarySerializer.call(selected_patient!, encounter: @encounter && selected_encounter!)
          when "care.history"
            Clinic::Care::ClinicalHistorySerializer.call(selected_patient!, encounter: @encounter && selected_encounter!, can_write: false)
          when "care.plan_workspace"
            Clinic::Care::ClinicalPlanWorkflow.workspace(practice: @practice, actor: @actor, patient: selected_patient!, encounter: selected_encounter!)
          when "care.coordination" then Clinic::Care::PatientCareCoordinationSerializer.call(coordination, patient: selected_patient!)
          when "care.encounters"
            bounded(@practice.encounters.where(patient: selected_patient!, site: @site).accessible_by(ability, :read)
              .order(started_at: :desc, id: :desc)) { |encounter| Clinic::Scheduling::EncounterSerializer.call(encounter, actor: @actor) }
          when "care.notes" then { notes: Clinic::Care::EncounterNoteSerializer.collection(note_scope.order(:id).limit(LIMIT)), limit: LIMIT }
          when "care.note" then Clinic::Care::EncounterNoteSerializer.call(resolved.fetch("_note"), detail: true)
          when "care.templates"
            { templates: Clinic::Care::NoteTemplateCatalog.available(practice: @practice, site: @site).map do |template|
              template.slice(:label, :version, :caution, :sections)
            end }
          when "care.observations"
            observations = @practice.observations.where(patient: selected_patient!)
            observations = observations.where(encounter: selected_encounter!) if @encounter
            bounded(observations.order(observed_at: :desc, id: :desc)) { |observation| Clinic::Care::ObservationSerializer.call(observation) }
          when "care.labs"
            bounded(report_scope.includes(:lab_specimen, current_version: :follow_up).order(id: :desc)) do |report|
              Clinic::Care::LabReportSerializer.report(report)
            end
          when "care.lab" then Clinic::Care::LabReportSerializer.report(resolved.fetch("_report"), detail: true)
          when "intake.workspace"
            Clinic::Care::NurseWorkflow.workspace(practice: @practice, actor: @actor, patient: selected_patient!, encounter: selected_encounter!)
          when "intake.question_tasks"
            Clinic::Care::IntakeQuestionTasks.index(practice: @practice, actor: @actor, patient: selected_patient!, encounter: selected_encounter!)
          when "care.tasks"
            tasks = task_scope.includes(:events, :assigned_to_membership, :site, dependencies: :prerequisite).order(:due_at, :id).limit(LIMIT + 1).to_a
            projections = Clinic::Care::NurseWorkflow.task_projections(practice: @practice, tasks: tasks.first(LIMIT))
            { tasks: tasks.first(LIMIT).map { |task| Clinic::Care::NurseWorkflow.serialize_task(task, continuity: projections.fetch(task.id)) }, limited: tasks.length > LIMIT }
          when "care.note_draft_create", "care.note_draft_revise" then save_note(key, resolved)
          when "intake.draft_save", "intake.question_answer_save", "intake.record_field_save" then save_intake(resolved)
          when "care.task_create", "care.task_transition" then save_task(key, resolved)
          when "care.observation_record" then save_observation(resolved)
          when "care.vital_record", "care.blood_pressure_record" then save_vitals(key, resolved)
          when "care.coordination_add" then save_coordination(resolved)
          when "care.fulfillment_link", "care.referral_event_record" then save_closure(key, resolved)
          else
            if history_kind(key) then save_history(key, resolved)
            elsif plan_kind(key) then save_plan(key, resolved)
            else raise ArgumentError, "Unsupported clinical assistant action."
            end
          end
          { title: definition!(key).fetch(:title), sections: [{ fields: display_fields(payload) }], source_path: source_path(key) }
        end

        private

        def definition!(key)
          self.class.definitions.find { |entry| entry[:key] == key } || raise(ArgumentError, "Unsupported clinical assistant action.")
        end

        def ability
          Ability.new(@actor, practice: @practice)
        end

        def identity_scope
          @practice.patients.where(merged_into_patient_id: nil).accessible_by(ability, :read_identity)
        end

        def selected_patient!
          raise ArgumentError, "Select a patient in the workspace first." unless @patient
          @practice.patients.where(merged_into_patient_id: nil).accessible_by(ability, :read).find(@patient.id)
        end

        def selected_encounter!
          raise ArgumentError, "Select an encounter in the workspace first." unless @encounter && @site
          @practice.encounters.where(patient: selected_patient!, site: @site).find(@encounter.id)
        end

        def note_scope
          @practice.encounter_notes.where(patient: selected_patient!, encounter: selected_encounter!, note_kind: "soap")
        end

        def report_scope
          @practice.lab_reports.where(patient: selected_patient!, site: @site)
        end

        def task_scope
          scope = Clinic::ClinicalTask.where(practice: @practice, patient: selected_patient!, site: @site)
          @encounter ? scope.where(encounter: selected_encounter!) : scope
        end

        def record_id!(ref, type)
          raise ArgumentError, "Choose a record from the current workspace." unless ref.is_a?(Hash) && ref["record_type"] == type
          ref.fetch("record_id")
        end

        def option(record, label)
          { record_type: record.class.name, record_id: record.id, label:, version: selection_version(record) }
        end

        def bounded(scope)
          values = scope.limit(LIMIT + 1).to_a
          { items: values.first(LIMIT).map { |value| yield value }, limited: values.length > LIMIT }
        end

        def latest_intake
          Clinic::Care::NurseWorkflow.latest_intake(@practice, selected_encounter!)
        end

        def intake_form
          previous = latest_intake
          Clinic::Care::PrevisitIntake.form_for(practice: @practice, appointment: selected_encounter!.appointment,
            recorder: "staff", payload: previous && Clinic::Care::PrevisitIntake.decode(previous.encrypted_questionnaire))
        end

        def history_kind(key)
          match = /\Acare\.history_(allergies|medications|conditions)_(create|update)\z/.match(key)
          match && match[1]
        end

        def history_scope(kind)
          Clinic::Care::ClinicalHistory::KINDS.fetch(kind).fetch(:model).where(practice: @practice, patient: selected_patient!)
        end

        def history_label(record)
          if record.respond_to?(:allergen_name) then record.allergen_name
          elsif record.respond_to?(:medication_name) then record.medication_name
          else record.condition_name
          end
        end

        def plan_kind(key)
          match = /\Acare\.plan_([a-z_]+)_draft_(create|revise)\z/.match(key)
          return unless match && Clinic::Care::ClinicalPlanWorkflow::DEFINITIONS.key?(match[1].to_sym)
          match[1].to_sym
        end

        def current_plan_scope(kind)
          klass = Clinic::Care::ClinicalPlanWorkflow::DEFINITIONS.fetch(kind).fetch(:klass)
          table = klass.table_name
          klass.where(practice: @practice, patient: selected_patient!, encounter: selected_encounter!)
            .where("NOT EXISTS (SELECT 1 FROM #{table} newer WHERE newer.practice_id = #{table}.practice_id AND newer.series_id = #{table}.series_id AND newer.version_number > #{table}.version_number)")
            .order(recorded_at: :desc, id: :desc)
        end

        def plan_label(record)
          field = %i[medication_name requested_display diagnosis_display procedure_display title description vaccine_name instrument_name]
            .find { |name| record.respond_to?(name) }
          "#{record.public_send(field)} — #{record.status.humanize} (revision #{record.version_number})"
        end

        def plan_reference_fields
          %w[inventory_product_id source_medication_statement_id service_request_revision_id care_plan_revision_id source_document_id medication_administration_id]
        end

        def reference_scope(field)
          case field
          when "inventory_product_id" then Clinic::Inventory::PharmacyProduct.where(practice: @practice, category: "medication", active: true)
          when "source_medication_statement_id" then history_scope("medications")
          when "service_request_revision_id" then current_plan_scope(:service_requests)
          when "care_plan_revision_id" then current_plan_scope(:care_plans)
          when "source_document_id"
            Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: "documents.read", any_site: true)
            Clinic::Document.where(practice: @practice, patient: selected_patient!, encounter: selected_encounter!)
          when "medication_administration_id"
            Clinic::Care::MedicationAdministration.where(practice: @practice, patient: selected_patient!, encounter: selected_encounter!, status: "completed")
          else raise ArgumentError, "Unsupported clinical reference."
          end
        end

        def reference_options(field)
          return [] unless plan_reference_fields.include?(field)
          Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: "clinical_records.read", site: @site)
          reference_scope(field).limit(LIMIT).map do |record|
            label = case field
            when "inventory_product_id" then record.name
            when "source_medication_statement_id" then history_label(record)
            when "source_document_id" then "#{record.media_type} — #{record.created_at.strftime('%Y-%m-%d')}"
            when "medication_administration_id" then "#{record.dose_text} — #{record.administered_at&.strftime('%Y-%m-%d %H:%M')}"
            else plan_label(record)
            end
            option(record, label)
          end
        end

        def fulfillment_target_scope(kind)
          definition = Clinic::Care::ClinicalPlanClosureWorkflow::TARGETS.fetch(kind)
          Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: "clinical_records.read", site: @site)
          Clinic::Authorization.authorize!(practice: @practice, actor: @actor, action: "documents.read", any_site: true) if kind == "document"
          klass = definition.fetch(:model)
          scope = klass.where(practice: @practice, patient: selected_patient!)
          scope = scope.where(encounter: selected_encounter!) if klass.column_names.include?("encounter_id")
          scope = scope.where(site: @site) if klass.column_names.include?("site_id")
          scope.order(id: :desc)
        end

        def coordination
          Clinic::Care::PatientCareCoordination.authorize!(practice: @practice, actor: @actor, patient: selected_patient!)
          Clinic::Care::PatientCareCoordination.scope(practice: @practice, patient: selected_patient!).order(revision: :desc).first
        end

        def save_note(key, input)
          note = input["_note"]
          previous = input["_revision"] && Clinic::Care::SoapNotePayload.load!(input.fetch("_revision").encrypted_body)
          template = input["_template"] || { id: previous.fetch(:template_id), version: previous.fetch(:template_version) }
          sections = Clinic::Care::SoapNotePayload::SECTION_KEYS.index_with do |name|
            input.key?(name.to_s) ? input[name.to_s].to_s : previous&.fetch(:sections)&.fetch(name, "").to_s
          end
          body = Clinic::Care::SoapNotePayload.dump(template_id: template.fetch(:id), template_version: template.fetch(:version), sections:,
            patient_instructions: input.key?("patient_instructions") ? input["patient_instructions"] : previous&.fetch(:patient_instructions, nil),
            session_duration_minutes: input.key?("session_duration_minutes") ? input["session_duration_minutes"] : previous&.fetch(:session_duration_minutes, nil))
          if key == "care.note_draft_create"
            note = Clinic::Care::CreateEncounterNote.call(practice: @practice, actor: @actor, encounter: selected_encounter!,
              encrypted_body: body, request_key: request_key(input), payload_version: Clinic::Care::SoapNotePayload::VERSION, note_kind: "soap")
          else
            Clinic::Care::ReviseEncounterNote.call(note:, actor: @actor, encrypted_body: body,
              expected_revision: input.fetch("_revision").revision_no, request_key: request_key(input), payload_version: Clinic::Care::SoapNotePayload::VERSION)
          end
          Clinic::Care::EncounterNoteSerializer.call(note.reload, detail: true)
        end

        def save_intake(input)
          previous = latest_intake
          questionnaire = previous && Clinic::Care::PrevisitIntake.decode(previous.encrypted_questionnaire) || {}
          if input["_answer"]
            questionnaire["answers"] = questionnaire.fetch("answers", {}).merge(input.fetch("question_id") => input.fetch("_answer"))
          end
          attributes = { status: "incomplete", identity_state: previous&.identity_state || "not_confirmed",
            visit_reason_state: previous&.visit_reason_state || "not_recorded", history_state: previous&.history_state || "not_recorded",
            vitals_state: previous&.vitals_state || "not_recorded",
            questionnaire: questionnaire.merge("text" => input.fetch("text", questionnaire.fetch("text", "")), "status" => "draft", "confirmed" => false, "confirmed_chunks" => []) }
          revision = Clinic::Care::NurseWorkflow.revise_intake(practice: @practice, actor: @actor,
            patient: selected_patient!, encounter: selected_encounter!, request_key: request_key(input),
            expected_version: previous&.version_number || 0, attributes:,
            observation_ids: previous&.observation_refs&.map(&:observation_id) || [],
            history_review_ids: previous&.history_refs&.map(&:history_review_id) || [])
          Clinic::Care::NurseWorkflow.serialize_intake(revision)
        end

        def save_registration(key, input)
          attributes = input.except(*input.keys.select { |name| name.start_with?("_") })
          attributes["request_key"] = request_key(input)
          patient = if key == "patients.register"
            Clinic::Care::PatientRegistration.create(practice: @practice, actor: @actor, site: @site, input: attributes)
          else
            selected = selected_patient!
            attributes["reference"] = selected.reference
            attributes["display_name"] = selected.display_name unless attributes.key?("display_name")
            attributes["expected_updated_at"] = selected.updated_at.iso8601(6)
            Clinic::Care::PatientRegistration.update(practice: @practice, actor: @actor, patient: selected, input: attributes)
          end
          Clinic::Care::PatientSerializer.call(patient.reload, detail: true)
        end

        def save_history(key, input)
          kind = history_kind(key)
          fields = definition!(key).fetch(:fields).map { |field| field[:key] } - ["history_record"]
          attributes = input.slice(*fields).symbolize_keys
          attributes.transform_keys!(&:to_sym)
          attributes.each do |name, value|
            attributes[name] = Time.iso8601(value) if name.to_s.end_with?("_at") || %i[effective_from effective_until].include?(name)
          end
          record = if key.end_with?("_create")
            Clinic::Care::ClinicalHistory.create(practice: @practice, actor: @actor, patient: selected_patient!,
              encounter: selected_encounter!, kind:, attributes:, request_key: request_key(input))
          else
            previous = input.fetch("_history_record")
            Clinic::Care::ClinicalHistory.update(practice: @practice, actor: @actor, patient: selected_patient!, encounter: selected_encounter!,
              kind:, record_id: previous.id, attributes:, expected_lock_version: previous.lock_version, request_key: request_key(input))
          end
          Clinic::Care::ClinicalHistorySerializer.record(kind, record)
        end

        def save_vitals(key, input)
          readings = if key == "care.blood_pressure_record"
            [ { code: "vital-systolic-bp", value: input.fetch("systolic"), unit_code: "mm[Hg]" },
              { code: "vital-diastolic-bp", value: input.fetch("diastolic"), unit_code: "mm[Hg]" } ]
          else
            [input.slice("code", "value", "unit_code")]
          end
          observations = Clinic::Care::VitalSigns.record(practice: @practice, actor: @actor, patient: selected_patient!,
            encounter: selected_encounter!, request_key: request_key(input), dictionary_version: Clinic::Care::VitalSigns::DICTIONARY_VERSION,
            observed_at: Time.iso8601(input.fetch("observed_at")), confirmed_patient: input.fetch("confirmed_patient"), readings:)
          { observations: observations.map { |record| Clinic::Care::ObservationSerializer.call(record) } }
        end

        def save_plan(key, input)
          kind = plan_kind(key)
          fields = definition!(key).fetch(:fields)
          attributes = fields.each_with_object({}) do |field, values|
            name = field.fetch(:key)
            next if name == "plan_record" || !input.key?(name)
            value = field[:type] == "record" ? input.fetch("_#{name}").id : input[name]
            value = Time.iso8601(value) if field[:type] == "datetime" && value.present?
            value = Date.iso8601(value) if field[:type] == "date" && value.present?
            if %w[dose_value prescribed_quantity].include?(name) && value.present? && !value.match?(/\A\d+(?:\.\d+)?\z/)
              raise ArgumentError, "#{field[:label]} must be an exact non-negative decimal."
            end
            values[name.to_sym] = value
          end
          record = if key.end_with?("_create")
            Clinic::Care::ClinicalPlanWorkflow.create(kind:, practice: @practice, actor: @actor, patient: selected_patient!,
              encounter: selected_encounter!, attributes:, request_key: request_key(input))
          else
            previous = input.fetch("_plan_record")
            Clinic::Care::ClinicalPlanWorkflow.revise(kind:, series_id: previous.series_id, practice: @practice, actor: @actor,
              patient: selected_patient!, encounter: selected_encounter!, attributes:, expected_version: previous.version_number,
              request_key: request_key(input))
          end
          Clinic::Care::ClinicalPlanWorkflow.serialize(kind, record)
        end

        def save_closure(key, input)
          source = input.fetch("_source_record")
          if key == "care.fulfillment_link"
            Clinic::Care::ClinicalPlanClosureWorkflow.link(practice: @practice, actor: @actor, patient: selected_patient!,
              encounter: selected_encounter!, source_kind: input.fetch("source_kind"), source_revision_id: source.id,
              target_kind: input.fetch("target_kind"), target_id: input.fetch("_target_record").id,
              outcome_summary: input["outcome_summary"], request_key: request_key(input))
          else
            Clinic::Care::ClinicalPlanClosureWorkflow.record_referral_event(practice: @practice, actor: @actor,
              patient: selected_patient!, encounter: selected_encounter!, service_request_revision_id: source.id,
              direction: input.fetch("direction"), stage: input.fetch("stage"), organization_name: input["organization_name"],
              note: input.fetch("note"), document_id: input["_source_document_id"]&.id, request_key: request_key(input))
          end
        end

        def save_task(key, input)
          task = if key == "care.task_create"
            Clinic::Care::NurseWorkflow.create_task(practice: @practice, actor: @actor,
              patient: selected_patient!, encounter: selected_encounter!, request_key: request_key(input),
              attributes: input.slice("task_kind", "pool_code", "due_at").merge("assigned_to_membership_id" => input["_assignee"]&.id))
          else
            current = input.fetch("_task")
            Clinic::Care::NurseWorkflow.transition_task(practice: @practice, actor: @actor, task: current,
              action: input.fetch("action"), expected_version: current.lock_version, request_key: request_key(input),
              resolution_code: input["resolution_code"], assignee_membership_id: input["_assignee"]&.id)
          end
          Clinic::Care::NurseWorkflow.serialize_task(task.reload)
        end

        def save_observation(input)
          attributes = input.slice("code", "code_system", "code_version", "value_kind", "numeric_value", "text_value", "coded_value", "unit_code", "missing_reason").symbolize_keys
          if attributes[:numeric_value].present? &&
              (attributes[:numeric_value].length > 30 || !attributes[:numeric_value].match?(/\A\d+(?:\.\d+)?\z/))
            raise ArgumentError, "Enter a non-negative exact decimal observation value of at most 30 characters."
          end
          attributes[:observed_at] = Time.iso8601(input.fetch("observed_at"))
          attributes[:encounter_id] = selected_encounter!.id
          observation = Clinic::Care::RecordObservation.call(practice: @practice, actor: @actor, patient: selected_patient!,
            attributes:, request_key: request_key(input))
          Clinic::Care::ObservationSerializer.call(observation)
        end

        def save_coordination(input)
          previous = coordination
          payload = previous ? previous.payload : Clinic::Care::PatientCareCoordinationRevision.empty_payload
          group = input.fetch("group")
          entry = input.slice("name", "practice", "phone", "address", "source", "source_detail", "address_confirmed")
          entries = payload.fetch(group).fetch("entries")
          entries << entry
          payload[group] = { "state" => "known", "entries" => entries }
          record = Clinic::Care::PatientCareCoordination.save!(practice: @practice, actor: @actor, patient: selected_patient!,
            payload:, expected_revision: previous&.revision || 0, request_key: request_key(input))
          Clinic::Care::PatientCareCoordinationSerializer.call(record, patient: selected_patient!)
        end

        def request_key(input)
          input.fetch("_request_key")
        end

        def display_fields(value, prefix = nil)
          case value
          when Hash
            value.flat_map do |key, item|
              next [] if %w[id content_digest schema_version can_write lock_version].include?(key.to_s) || key.to_s.end_with?("_id", "_ids")
              display_fields(item, [prefix, key.to_s.humanize].compact.join(" / "))
            end
          when Array
            value.first(LIMIT).each_with_index.flat_map { |item, index| display_fields(item, "#{prefix} / #{index + 1}") } +
              (value.length > LIMIT ? [{ label: "#{prefix} / More available", value: "Open the workspace for the remaining entries." }] : [])
          else
            [{ label: prefix || "Result", value: value.nil? ? "Not recorded" : value.respond_to?(:iso8601) ? value.iso8601 : value }]
          end
        end

        def source_path(key)
          return "/clinic/patients" if %w[patients.search patients.register].include?(key)
          "/clinic/patients/#{@patient.id}"
        end
      end
    end
  end
end
