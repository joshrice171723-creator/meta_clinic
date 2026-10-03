module Clinic
  module Care
    module AsqAdultAssessment
      module_function

      NAME = "Ask Suicide-Screening Questions (ASQ) — Adult Outpatient".freeze
      VERSION = "NIMH-ASQ-2025-09-29-adult-outpatient".freeze
      PROTOCOL_VERSION = "NIMH-adult-outpatient-BSSA-2025-12-08".freeze
      SCREEN_SOURCE = "https://www.nimh.nih.gov/sites/default/files/documents/research/research-conducted-at-nimh/asq-toolkit-materials/asq-tool/screening-tool-asq-nimh-toolkit.pdf".freeze
      PROTOCOL_SOURCE = "https://www.nimh.nih.gov/sites/default/files/documents/research/research-conducted-at-nimh/asq-toolkit-materials/adult-outpatient/bssa-outpatient-adult-asq-nimh-toolkit.pdf".freeze
      QUESTIONS = [
        ["q1", "In the past few weeks, have you wished you were dead?"],
        ["q2", "In the past few weeks, have you felt that you or your family would be better off if you were dead?"],
        ["q3", "In the past week, have you been having thoughts about killing yourself?"],
        ["q4", "Have you ever tried to kill yourself?"],
        ["q5", "Are you having thoughts of killing yourself right now?"]
      ].freeze
      OPTIONS = %w[yes no].freeze
      DISPOSITIONS = {
        "emergency_evaluation" => "Emergency psychiatric evaluation",
        "further_evaluation" => "Further evaluation of risk is necessary",
        "nonurgent_follow_up" => "Non-urgent mental health follow-up",
        "no_further_intervention" => "No further intervention at this time"
      }.freeze
      PROTOCOL_FIELDS = %w[version findings disposition disposition_reason safety_plan means_discussion resources
        urgent_actions bssa_state bssa_exception follow_up_action follow_up_task_id coverage_exception
        task_owner_membership_id task_state task_source_type task_source_id].freeze
      TASK_SNAPSHOT_FIELDS = %w[task_owner_membership_id task_state task_source_type task_source_id].freeze

      def named?(values)
        values[:instrument_name] == NAME || values[:instrument_version] == VERSION
      end

      def catalog
        { name: NAME, version: VERSION, category: "psychiatry_assessment", source: SCREEN_SOURCE,
          protocol_version: PROTOCOL_VERSION, protocol_source: PROTOCOL_SOURCE,
          questions: QUESTIONS.map { |id, label| { id:, label:, options: OPTIONS } },
          dispositions: DISPOSITIONS.map { |code, label| { code:, label: } } }
      end

      def protocol(record)
        return unless named?(instrument_name: record.instrument_name, instrument_version: record.instrument_version)
        JSON.parse(record.follow_up_plan.presence || "{}")
      rescue JSON::ParserError
        {}
      end

      def normalize!(values, submitted:, practice:, patient:, encounter:, actor:, previous: nil)
        return unless named?(values) || (previous && named?(instrument_name: previous.instrument_name, instrument_version: previous.instrument_version))
        unless values[:instrument_name] == NAME && values[:instrument_version] == VERSION && values[:category] == "psychiatry_assessment"
          raise ArgumentError, "Choose the supported adult outpatient ASQ name, version and psychiatry category."
        end
        if previous && !named?(instrument_name: previous.instrument_name, instrument_version: previous.instrument_version)
          raise ArgumentError, "Create a separate ASQ assessment rather than changing a historical instrument."
        end
        if %i[score_value score_source score_recorded_at interpretation reviewer_membership_id reviewed_at].any? { |key| submitted[key].present? }
          raise ArgumentError, "ASQ result and reviewer provenance are derived by the clinic; do not submit them."
        end
        items = normalize_items!(values[:item_responses])
        validate_adult!(items, patient, values[:assessed_at])
        result = derive(items)
        evidence = normalize_protocol!(values[:follow_up_plan])
        if previous && values[:status] == "entered_in_error"
          evidence.merge!(protocol(previous).slice(*TASK_SNAPSHOT_FIELDS))
        end
        if values[:status] == "completed"
          raise ArgumentError, "An incomplete or unknown ASQ requires further screening before completion." if %w[incomplete unknown positive_acuity_unknown].include?(result)
          raise ArgumentError, "Record the response source and assessed time." if values[:response_source].blank? || values[:response_source] == "unknown" || values[:assessed_at].blank?
          raise ArgumentError, "Record when the most recent attempt occurred." if answer(items, "q4") == "yes" && answer(items, "attempt_timing").blank?
          reviewer = Clinic::Authorization.authorize!(actor:, practice:, action: "notes.sign", site: encounter.site)
          validate_review!(evidence, result, items, practice, patient, encounter)
          values[:reviewer_membership_id] = reviewer.id
          values[:reviewed_at] = Current.business_time
          values[:assessment_state] = "assessed"
        elsif previous&.status == "completed" && values[:status] == "entered_in_error"
          values[:reviewer_membership_id] = previous.reviewer_membership_id
          values[:reviewed_at] = previous.reviewed_at
        else
          values[:reviewer_membership_id] = nil
          values[:reviewed_at] = nil
          values[:assessment_state] = "unknown"
        end
        observations = values[:response_summary].to_s
        raise ArgumentError, "Keep ASQ observations within 2,500 characters." if observations.length > 2_500
        # Preserve typed responses inside the existing encrypted narrative column.
        # The generic JSONB response column remains unchanged for other instruments.
        protected_responses = JSON.generate(asq_response_version: VERSION, items:, observations:)
        raise ArgumentError, "ASQ response evidence exceeds the supported storage length." if protected_responses.length > 4_000
        values[:response_summary] = protected_responses
        values[:item_responses] = []
        values[:score_value] = result
        values[:interpretation] = result.tr("_", " ")
        values[:score_source] = "calculated"
        values[:score_recorded_at] = values[:assessed_at] || previous&.score_recorded_at || encounter.started_at
        protocol_json = JSON.generate(evidence)
        raise ArgumentError, "Adult outpatient response documentation exceeds the supported storage length." if protocol_json.length > 4_000
        values[:follow_up_plan] = protocol_json
      end

      def normalize_items!(input)
        raise ArgumentError, "ASQ responses must be an array." unless input.is_a?(Array)
        ids = QUESTIONS.map(&:first) + %w[attempt_timing adult_eligibility]
        normalized = input.map do |raw|
          raise ArgumentError, "Unsupported ASQ response." unless raw.is_a?(Hash)
          item = raw.stringify_keys
          unless (item.keys - %w[item_id state value]).empty? && ids.include?(item["item_id"]) && AssessmentRevision::ITEM_STATES.include?(item["state"])
            raise ArgumentError, "Unsupported ASQ item or response state."
          end
          allowed = case item["item_id"]
          when "attempt_timing" then %w[within_last_12_months over_1_year_ago]
          when "adult_eligibility" then %w[documented_age recorder_attestation]
          else OPTIONS
          end
          if item["state"] == "answered"
            raise ArgumentError, "Choose a supported ASQ response option." unless allowed.include?(item["value"])
          elsif item["value"].present?
            raise ArgumentError, "Only answered ASQ items can contain an answer."
          end
          item.slice("item_id", "state", "value")
        end
        raise ArgumentError, "ASQ item IDs must be unique." unless normalized.map { |item| item["item_id"] }.uniq.length == normalized.length
        ids.map { |id| normalized.find { |item| item["item_id"] == id } || { "item_id" => id, "state" => "not_asked" } }
      end

      def answer(items, id)
        item = items.find { |row| row["item_id"] == id }
        item["value"] if item && item["state"] == "answered"
      end

      def derive(items)
        positive = %w[q1 q2 q3 q4].any? { |id| answer(items, id) == "yes" }
        return "acute_positive" if answer(items, "q5") == "yes"
        return "nonacute_positive" if positive && answer(items, "q5") == "no"
        return "positive_acuity_unknown" if positive
        return "negative" if %w[q1 q2 q3 q4].all? { |id| answer(items, id) == "no" }
        return "declined" if items.any? { |row| %w[q1 q2 q3 q4].include?(row["item_id"]) && row["state"] == "declined" }
        return "unknown" if items.any? { |row| %w[q1 q2 q3 q4].include?(row["item_id"]) && row["state"] == "unknown" }
        "incomplete"
      end

      def validate_adult!(items, patient, assessed_at)
        raise ArgumentError, "Assessment time cannot be in the future." if assessed_at && assessed_at > Current.business_time
        eligibility = answer(items, "adult_eligibility")
        dob = patient.demographics&.date_of_birth
        assessed_date = assessed_at&.to_date || Current.business_date
        adult = dob && dob <= assessed_date.advance(years: -18)
        raise ArgumentError, "This named protocol is available for adults aged 18 or older." if dob && !adult
        unless eligibility == "recorder_attestation" || (eligibility == "documented_age" && adult)
          raise ArgumentError, "Confirm documented adult age or explicitly attest that the patient is 18 or older."
        end
      end

      def normalize_protocol!(input)
        parsed = JSON.parse(input.presence || "{}")
        unless parsed.is_a?(Hash) && (parsed.keys - PROTOCOL_FIELDS).empty? && parsed.values.all? { |value| value.is_a?(String) }
          raise ArgumentError, "Use the supported adult outpatient response documentation fields."
        end
        raise ArgumentError, "Unsupported adult outpatient protocol version." if parsed["version"].present? && parsed["version"] != PROTOCOL_VERSION
        raise ArgumentError, "Unsupported disposition." if parsed["disposition"].present? && !DISPOSITIONS.key?(parsed["disposition"])
        raise ArgumentError, "Unsupported brief safety assessment state." if parsed["bssa_state"].present? && !%w[completed declined lifetime_attempt_exception].include?(parsed["bssa_state"])
        if parsed["follow_up_task_id"].present? && !parsed["follow_up_task_id"].match?(/\A[1-9][0-9]*\z/)
          raise ArgumentError, "Choose a valid follow-up task reference."
        end
        parsed.except(*TASK_SNAPSHOT_FIELDS).transform_values(&:strip).merge("version" => PROTOCOL_VERSION)
      rescue JSON::ParserError
        raise ArgumentError, "Adult outpatient response documentation must use its structured form."
      end

      def validate_review!(evidence, result, items, practice, patient, encounter)
        required = %w[findings disposition disposition_reason resources]
        if result.in?(%w[acute_positive nonacute_positive])
          required += %w[safety_plan means_discussion follow_up_action]
          required << "urgent_actions" if result == "acute_positive"
          if result == "nonacute_positive"
            required << "bssa_state"
            if evidence["bssa_state"] == "lifetime_attempt_exception"
              permitted = %w[q1 q2 q3].all? { |id| answer(items, id) == "no" } && answer(items, "q4") == "yes" && answer(items, "attempt_timing") == "over_1_year_ago"
              raise ArgumentError, "The adult lifetime-attempt exception requires only Q4 positive and the latest attempt over one year ago." unless permitted
              required << "bssa_exception"
            elsif evidence["bssa_state"] == "declined"
              required << "bssa_exception"
            end
          end
          if evidence["follow_up_task_id"].present?
            task = Clinic::ClinicalTask.where(practice:, patient:, site_id: encounter.site_id,
              task_kind: %w[safety_follow_up patient_call], state: Clinic::ClinicalTask::ACTIVE_STATES)
              .lock.find(evidence["follow_up_task_id"])
            unless TaskContinuity.eligible?(task.assigned_to_membership, task) && task.pending_assignee_membership_id.nil?
              raise ArgumentError, "Choose an open follow-up task with an accepted active owner."
            end
            evidence.merge!("task_owner_membership_id" => task.assigned_to_membership_id.to_s,
              "task_state" => task.state, "task_source_type" => task.source_type, "task_source_id" => task.source_id.to_s)
          else
            required << "coverage_exception"
          end
        end
        missing = required.find { |field| evidence[field].blank? }
        raise ArgumentError, "Document #{missing.tr('_', ' ')} before clinician review." if missing
      end

      def history(practice:, actor:, patient:)
        seen = Set.new
        AssessmentRevision.where(practice:, patient:).includes(:site).order(recorded_at: :desc, id: :desc).limit(500).filter_map do |record|
          next unless record.instrument_name == NAME && record.instrument_version == VERSION
          next unless Ability.new(actor, practice:).allowed_permission?("clinical_records.read", site: record.site)
          current = seen.add?(record.series_id)
          { id: record.id, series_id: record.series_id, revision: record.version_number, encounter_id: record.encounter_id,
            site_id: record.site_id, assessed_at: record.assessed_at&.iso8601, recorded_at: record.recorded_at.iso8601,
            source: record.response_source, status: record.status, result: record.score_value,
            reviewer_membership_id: record.reviewer_membership_id, reviewed_at: record.reviewed_at&.iso8601,
            comparable: !!current && record.status == "completed" && record.score_value.in?(%w[negative acute_positive nonacute_positive]) }
        end
      end

      def response_evidence(record)
        value = JSON.parse(record.response_summary.to_s)
        return { items: value.fetch("items"), observations: value.fetch("observations") } if value.is_a?(Hash) && value["asq_response_version"] == VERSION
        { items: record.item_responses, observations: record.response_summary }
      rescue JSON::ParserError, KeyError
        { items: record.item_responses, observations: record.response_summary }
      end
    end
  end
end
