module Clinic
  module Care
    # A versioned, non-FHIR intake form stored inside the existing encrypted,
    # append-only previsit note. Rendered text remains available to chart readers.
    module PrevisitIntake
      FORM_ID = "meta-clinic-previsit-v3".freeze
      LEGACY_FORM_IDS = %w[meta-clinic-previsit-v1 meta-clinic-previsit-v2].freeze
      ATTESTATION_ID = "patient-confirmed-current-and-care-team-sharing".freeze
      ATTESTATION_VERSION = "2026-09-11".freeze
      QUESTIONNAIRE_VERSION = 3
      FIELDS = [
        { id: "visit_reason", label: "What brings you in?", reusable: false },
        { id: "symptoms", label: "Current symptoms and when they started", reusable: false, history_kind: "symptom" },
        { id: "medications", label: "Current medicines and supplements", reusable: true, history_kind: "medication" },
        { id: "allergies", label: "Allergies and reactions", reusable: true, history_kind: "allergy" },
        { id: "history", label: "Health conditions and recent changes", reusable: true, history_kind: "condition" },
        { id: "family_history", label: "Family history and uncertainty", reusable: true, history_kind: "family" },
        { id: "care_needs", label: "Communication, accessibility or other care needs", reusable: true },
        { id: "goals", label: "What would you like help with?", reusable: false },
        { id: "telehealth_location", label: "Where are you physically located for this video visit? (City and state)", reusable: false },
        { id: "prior_approaches", label: "Previous treatments and medicines", reusable: true, history_kind: "treatment" },
        { id: "procedures", label: "Previous procedures, surgeries, or hospitalizations", reusable: true, history_kind: "procedure" },
        { id: "barriers", label: "Anything making your plan difficult to follow?", reusable: false },
        { id: "height", label: "Current height", reusable: false, units: %w[cm [in_i]] },
        { id: "weight", label: "Current weight", reusable: false, units: %w[kg [lb_av]] },
        { id: "treatment_product_class", label: "Treatment product or class being discussed", reusable: false,
          choices: %w[glp1 other_prescription non_prescription none_selected unknown not_discussed] },
        { id: "pregnancy_status", label: "Current pregnancy status", reusable: false,
          choices: %w[pregnant not_pregnant unsure declined not_applicable unknown] },
        { id: "pregnancy_plans", label: "Pregnancy plans or possibility", reusable: false,
          choices: %w[yes no unsure declined not_applicable unknown] },
        { id: "breastfeeding_status", label: "Breastfeeding or chestfeeding status", reusable: false,
          choices: %w[yes no unsure declined not_applicable unknown] },
        { id: "contraception_context", label: "Contraception context", reusable: false,
          choices: %w[using not_using not_applicable declined unknown] },
        { id: "product_safety_review", label: "Product-specific safety questions", reusable: false,
          depends_on: "treatment_product_class", depends_values: %w[glp1 other_prescription unknown],
          choices: %w[reviewed needs_clarification not_applicable declined unknown] },
        { id: "nutrition_pattern", label: "Meal pattern", reusable: false,
          choices: %w[regular_meals variable_meals grazing skipped_meals unknown not_discussed] },
        { id: "beverage_pattern", label: "Beverage pattern", reusable: false,
          choices: %w[water_mostly sugar_sweetened alcohol_present mixed unknown not_discussed] },
        { id: "eating_concern", label: "Eating concern to discuss", reusable: false,
          choices: %w[none_reported loss_of_control binge_concern restrictive_pattern emotional_eating unknown declined] },
        { id: "nutrition_support", label: "Nutrition support preference", reusable: false,
          choices: %w[none_requested interested active_support clinician_review unknown declined] },
        { id: "mental_health_support", label: "Mental-health support context", reusable: false,
          choices: %w[none_reported current_support wants_support clinician_review unknown declined] },
        { id: "substance_use_context", label: "Substance-use context", reusable: false,
          choices: %w[none_reported alcohol tobacco other_substance multiple unknown declined] },
        { id: "instrument_status", label: "Structured instrument status", reusable: false,
          choices: %w[not_selected offered completed declined unable_to_complete unknown] },
        { id: "activity_capacity", label: "Activity and movement capacity", reusable: false,
          choices: %w[independent limited needs_assistance unable_to_assess unknown] },
        { id: "activity_pattern", label: "Usual activity pattern", reusable: false,
          choices: %w[none_reported occasional regular variable unknown not_discussed] },
        { id: "sleep_quality", label: "Sleep quality or concern", reusable: false,
          choices: %w[restful variable poor concern_for_review unknown not_discussed] },
        { id: "transportation_access", label: "Transportation access", reusable: false,
          choices: %w[reliable sometimes_limited unavailable unknown not_discussed] },
        { id: "food_access", label: "Food access", reusable: false,
          choices: %w[adequate sometimes_limited unavailable unknown not_discussed] },
        { id: "caregiving_support", label: "Caregiving support", reusable: false,
          choices: %w[adequate limited none unknown not_discussed] },
        { id: "social_support", label: "Social support", reusable: false,
          choices: %w[available limited none unknown not_discussed] },
        { id: "barrier_support_route", label: "Support route for barriers", reusable: false,
          choices: %w[none_reported care_coordination nutrition activity sleep financial other unknown] },
        { id: "outside_records_state", label: "Outside records", reusable: false,
          choices: %w[not_requested requested received unavailable not_applicable unknown] },
        { id: "lab_context_state", label: "Laboratory evidence context", reusable: false,
          choices: %w[not_reviewed reviewed pending unavailable not_applicable unknown] },
        { id: "treatment_consent_state", label: "Treatment consent context", reusable: false,
          choices: %w[confirmed declined not_asked not_applicable unknown] },
        { id: "telehealth_consent_state", label: "Telehealth consent context", reusable: false,
          choices: %w[confirmed declined not_asked not_applicable unknown] },
        { id: "privacy_location_state", label: "Privacy of visit location", reusable: false,
          choices: %w[private shared_space uncertain not_applicable unknown] },
        { id: "coverage_context", label: "Coverage context", reusable: false,
          choices: %w[insurance self_pay not_discussed not_applicable unknown] },
        { id: "prior_authorization_state", label: "Prior-authorization context", reusable: false,
          choices: %w[not_started not_needed pending approved denied not_applicable unknown] },
        { id: "disclosure_state", label: "Required disclosures", reusable: false,
          choices: %w[reviewed not_reviewed declined not_applicable unknown] },
        { id: "patient_confirmation_state", label: "Patient confirmation of recorded answers", reusable: false,
          choices: %w[confirmed needs_correction unable_to_confirm declined not_asked unknown] },
        { id: "unresolved_item_state", label: "Unresolved intake items", reusable: false,
          choices: %w[none_present present unknown not_applicable] },
        { id: "review_owner", label: "Review owner or team", reusable: false,
          choices: %w[nurse clinician pharmacist care_coordinator patient unknown not_assigned] },
        { id: "follow_up_context", label: "Follow-up context", reusable: false,
          choices: %w[initial_visit follow_up maintenance transition unknown] },
        { id: "change_since_last_visit", label: "Change since the last visit", reusable: false,
          choices: %w[none_reported weight_change medication_change tolerance_change access_change support_change other unknown] },
        { id: "treatment_response", label: "Treatment response", reusable: false,
          choices: %w[improved unchanged worse mixed not_applicable unknown] },
        { id: "treatment_tolerability", label: "Treatment tolerability", reusable: false,
          choices: %w[tolerated side_effects_reported stopped_due_to_effects not_applicable unknown] },
        { id: "access_status", label: "Treatment access status", reusable: false,
          choices: %w[available delayed unavailable cost_concern not_applicable unknown] },
        { id: "support_status", label: "Support status", reusable: false,
          choices: %w[adequate needs_support changed not_applicable unknown] },
        { id: "follow_up_plan_state", label: "Follow-up review state", reusable: false,
          choices: %w[no_change clinician_review_needed patient_contact_needed unknown] },
        { id: "next_contact_window", label: "Next contact window", reusable: false,
          choices: %w[no_plan_recorded within_1_week within_1_month later unknown] },
        { id: "follow_up_questions", label: "Patient questions for follow-up", reusable: false }
      ].map(&:freeze).freeze
      # Presentation boundaries for the generic patient form, in its existing field order.
      # Specialty forms retain their own sections; staff forms and stored answers are unchanged.
      PATIENT_SECTION_STARTS = {
        "visit_reason" => "general_health_visit",
        "prior_approaches" => "past_care_measurements",
        "treatment_product_class" => "reproductive_product_safety",
        "nutrition_pattern" => "nutrition_support",
        "activity_capacity" => "activity_sleep_barriers",
        "outside_records_state" => "records_consent_admin",
        "patient_confirmation_state" => "confirmation_clinician_review",
        "follow_up_context" => "follow_up_change"
      }.freeze
      PREFIX = "MC_INTAKE_V1\n".freeze
      MAX_ANSWER_LENGTH = 600
      MAX_NARRATIVE_LENGTH = 5_000
      MAX_ENCODED_LENGTH = 512_000
      MAX_HISTORY_ENTRIES = 20
      ANSWER_STATES = %w[answered unanswered not_asked unknown declined not_applicable negative].freeze
      HISTORY_DATE_PRECISIONS = %w[exact approximate unknown].freeze
      TREATMENT_KINDS = %w[diet_program medication other].freeze
      TREATMENT_DURATIONS = %w[less_than_month one_to_three_months three_to_six_months six_to_twelve_months more_than_year unknown].freeze
      TREATMENT_OUTCOMES = %w[no_benefit some_benefit meaningful_benefit_not_maintained unknown].freeze
      TREATMENT_MAINTENANCE = %w[yes no unknown not_applicable].freeze
      TREATMENT_STOP_REASONS = %w[completed no_benefit adverse_effect cost_or_access preference clinician_advice ongoing unknown].freeze
      PROCEDURE_KINDS = %w[procedure surgery hospitalization other].freeze
      PROCEDURE_OUTCOMES = %w[helpful not_helpful mixed unknown].freeze
      PROCEDURE_COMPLICATIONS = %w[none_reported known unknown not_applicable].freeze
      CONDITION_KINDS = %w[metabolic cardiovascular endocrine gastrointestinal kidney respiratory neurological pain other].freeze
      CONDITION_STATUSES = %w[current past unknown].freeze
      SYMPTOM_KINDS = %w[abdominal_pain vomiting bowel_changes dizziness_fainting palpitations breathing_difficulty vision_changes other].freeze
      REVIEW_ROUTES = %w[routine_review clinical_review urgent_review unknown].freeze
      FAMILY_RELATIVES = %w[parent sibling child grandparent other unknown].freeze
      FAMILY_CERTAINTIES = %w[reported uncertain unknown].freeze
      MEDICATION_SOURCES = %w[prescribed over_the_counter supplement other].freeze
      ACTUAL_USE_STATES = %w[taking not_taking as_needed unknown].freeze
      DOSE_CERTAINTIES = %w[known unknown].freeze
      DOSE_UNITS = %w[mg mcg g mL tablet capsule patch other unknown].freeze
      MEDICATION_FREQUENCIES = %w[once_daily twice_daily three_times_daily weekly monthly as_needed other unknown].freeze
      ALLERGY_TYPES = %w[allergy intolerance adverse_effect other].freeze
      REACTION_SEVERITIES = %w[mild moderate severe unknown].freeze
      SPECIALTY_FORMS = {
        "behavioral-health-initial-v1" => BehavioralHealthQuestionnaire.fields(FIELDS),
        "behavioral-health-follow-up-v1" => BehavioralHealthQuestionnaire.fields(FIELDS, follow_up: true),
        "weight-management-initial-v1" => WeightManagementQuestionnaire.fields(FIELDS),
        "weight-management-follow-up-v1" => WeightManagementQuestionnaire.fields(FIELDS, follow_up: true)
      }.freeze

      module_function

      def fields(form_id = FORM_ID)
        SPECIALTY_FORMS.fetch(form_id, FIELDS)
      end

      def form_for(practice:, appointment: nil, payload: nil, recorder: "patient")
        id = payload&.fetch("form_id", nil) || Configuration::StarterProfile.form_id(practice:, appointment:)
        { id: id, version: QUESTIONNAIRE_VERSION, fields: fields_for_recorder(id, recorder:), answer_states: ANSWER_STATES,
          screening: { enabled: false, reason: "No clinic-approved scored instrument is configured." },
          provenance: %w[patient_reported staff_recorded inherited imported calculated] }
      end

      def require_new_form!(practice:, appointment: nil, encounter: nil, existing_payload: nil)
        return if existing_payload

        if appointment
          valid_booking = appointment.persisted? && appointment.practice_id == practice.id &&
            appointment.patient.practice_id == practice.id && appointment.site&.practice_id == practice.id &&
            appointment.visit_type&.practice_id == practice.id && %w[scheduled confirmed].include?(appointment.status)
          valid_booking &&= encounter.practice_id == practice.id && encounter.appointment_id == appointment.id &&
            encounter.patient_id == appointment.patient_id && encounter.site_id == appointment.site_id if encounter
          return if valid_booking

          raise ArgumentError, "Intake must belong to a saved active booking at the same patient and location."
        end

        site = encounter&.site
        features = Configuration::PracticeFeatures.snapshot(practice:, site:)
        unless Configuration::StarterProfile.ready?(site, features)
          raise ArgumentError, "Complete this location's specialty setup before starting intake. Saved intake remains available."
        end
      end

      def fields_for_recorder(form_id = FORM_ID, recorder: "patient")
        raise ArgumentError, "Choose a supported intake recorder." unless %w[patient staff].include?(recorder)
        # Keep legacy answers readable, but do not offer a completion checkbox
        # for an instrument whose items, scorer and review pathway do not exist.
        available = fields(form_id).reject { |field| field[:id] == "instrument_status" }
        return available if recorder == "staff"
        generic_form = !SPECIALTY_FORMS.key?(form_id)
        section_id = nil
        available.map do |field|
          copy = field.deep_dup
          if generic_form
            section_id = PATIENT_SECTION_STARTS.fetch(field[:id], section_id)
            copy[:chunk_id] = section_id
          end
          if copy[:units]
            copy[:source_choices] = (copy[:source_choices] || %w[patient_reported clinic_measured]) - %w[clinic_measured imported]
            copy[:verification_choices] = copy[:verification_choices] - %w[staff_verified] if copy[:verification_choices]
          end
          copy[:record_fields]&.each do |child|
            child[:choices] = child[:choices] - %w[clinic_measured imported] if child[:id] == "source" && child[:choices]
            child[:choices] = child[:choices] - %w[staff_verified] if child[:id] == "verification" && child[:choices]
          end
          copy
        end
      end

      # Public canonical visibility for group confirmation and UI consumers.
      # Unknown is an explicit branch only when depends_values includes it;
      # negative maps to no, never to unknown. Hidden ancestors stay hidden.
      def visible?(field, answers, form_id: FORM_ID, definitions: nil, visited: [])
        dependency_id = field[:depends_on] || field["depends_on"]
        return true unless dependency_id
        return false if visited.include?(dependency_id)
        definitions ||= fields(form_id)
        dependency = definitions.find { |item| (item[:id] || item["id"]) == dependency_id }
        return false unless dependency && visible?(dependency, answers, form_id:, definitions:, visited: visited + [dependency_id])
        answer = answers[dependency_id] || answers[dependency_id.to_sym]
        values = if answer.is_a?(Hash)
          answer = answer.stringify_keys
          case answer["state"]
          when "answered" then answer["values"].is_a?(Array) ? answer["values"] : [answer["value"]]
          when "negative" then ["no", "negative"]
          when "unknown", "declined", "not_applicable", "not_asked" then [answer["state"]]
          else []
          end
        elsif answer.is_a?(String)
          [answer]
        elsif answer.is_a?(Array)
          answer # One-level record dependencies use direct string/string[] values.
        else
          []
        end
        ((field[:depends_values] || field["depends_values"] || []) & values).any?
      end

      def question_metadata_snapshot(form_id = FORM_ID, question_ids: nil)
        definitions = fields(form_id)
        if question_ids
          unless question_ids.is_a?(Array) && (question_ids - definitions.map { |field| field[:id] }).empty?
            raise ArgumentError, "Choose supported questions for the metadata snapshot."
          end
          definitions = definitions.select { |field| question_ids.include?(field[:id]) }
        end
        { form_id: form_id, questionnaire_version: QUESTIONNAIRE_VERSION,
          fields: definitions.map(&:deep_dup) }
      end

      def medication_options(practice)
        Clinic::Inventory::PharmacyProduct.where(practice: practice, category: "medication", active: true)
          .order(:name, :id).limit(500).pluck(:name)
      end

      # Separate from the existing string list. Identifiers are catalog references,
      # not evidence that a patient takes the product or that treatment is approved.
      def medication_reference_options(practice)
        Clinic::Inventory::PharmacyProduct.where(practice: practice, category: "medication", active: true)
          .order(:name, :id).limit(500).map do |product|
            { id: product.id.to_s, name: product.name,
              metadata: product.attributes.slice("generic_name", "ingredients", "dosage_form", "route", "ndc", "product_ndc", "labeler", "source") }
          end
      end

      def validate_medication_references!(encoded, practice:)
        payload = decode(encoded)
        return unless payload

        entries = payload.fetch("answers", {}).values.flat_map { |answer| Array(answer["entries"]) }
        referenced = entries.select { |entry| entry["product_id"].present? }
        ids = referenced.map { |entry| entry["product_id"].to_s }.uniq
        products = Clinic::Inventory::PharmacyProduct.where(practice:, category: "medication", active: true, id: ids)
          .index_by { |product| product.id.to_s }
        referenced.each do |entry|
          product = products[entry["product_id"].to_s]
          unless product && (entry["name"].blank? || entry["name"] == product.name)
            raise ArgumentError, "Choose a current medicine from this clinic's catalog, or use Other."
          end
        end
      end

      def encode(text:, answers:, attested:, status: "submitted", inherited_from: nil, recorder: "patient", form_id: FORM_ID,
        confirmed_chunks: [])
        raise ArgumentError, "Choose a supported form revision." unless ([FORM_ID] + SPECIALTY_FORMS.keys).include?(form_id)
        raise ArgumentError, "Choose draft or submitted intake." unless %w[draft submitted].include?(status)
        raise ArgumentError, "Intake answers must be an object." unless answers.is_a?(Hash)
        raise ArgumentError, "Intake note must be text." unless text.is_a?(String)
        raise ArgumentError, "Intake note must be #{MAX_NARRATIVE_LENGTH} characters or fewer." if text.length > MAX_NARRATIVE_LENGTH
        raise ArgumentError, "Choose a supported intake recorder." unless %w[patient staff].include?(recorder)
        if answers.keys.map(&:to_s).uniq.size != answers.keys.size
          raise ArgumentError, "Do not repeat intake question keys."
        end
        confirmed_chunks = normalize_confirmed_chunks(confirmed_chunks)
        unknown = answers.keys.map(&:to_s) - fields(form_id).map { |field| field[:id] }
        raise ArgumentError, "Choose supported intake questions." if unknown.any?
        normalized = fields(form_id).to_h do |field|
          value = if answers.key?(field[:id])
            answers[field[:id]]
          elsif answers.key?(field[:id].to_sym)
            answers[field[:id].to_sym]
          else
            ""
          end
          [field[:id], normalize_answer(value, field, status: status)]
        end
        staff_verification = normalized.values.any? do |answer|
          ([answer] + Array(answer["entries"])).any? do |item|
            item["verification"] == "staff_verified" || %w[clinic_measured imported].include?(item["source"])
          end
        end
        if recorder != "staff" && staff_verification
          raise ArgumentError, "Staff verification, clinic measurements and imported sources must be recorded through the staff evidence workflow."
        end
        additional_text = text.to_s.strip
        return additional_text if normalized.values.all? { |answer| answer["state"] == "unanswered" } &&
          additional_text.blank? && status == "submitted" && confirmed_chunks.empty?
        if status == "submitted" && attested != true
          raise ArgumentError, recorder == "staff" ? "Confirm that you recorded these answers from the patient." : "Confirm the intake is current and may be shared with your care team."
        end

        encoded = PREFIX + JSON.generate(
          form_id: form_id,
          questionnaire_version: QUESTIONNAIRE_VERSION,
          status: status,
          text: additional_text,
          answers: normalized,
          confirmed_chunks: confirmed_chunks,
          inherited_from: inherited_from,
          recorder: recorder,
          staff_confirmation: status == "submitted" && recorder == "staff",
          attestation: status == "submitted" && recorder == "patient" ? {
            id: ATTESTATION_ID,
            version: ATTESTATION_VERSION,
            accepted: true
          } : nil
        )
        raise ArgumentError, "Shorten your intake answers and visit note before saving." if encoded.length > MAX_ENCODED_LENGTH
        encoded
      end

      def normalize_confirmed_chunks(value)
        chunks = Array(value).map { |item| Integer(item.to_s, 10) }
        raise ArgumentError, "Confirmed intake groups must be non-negative integers." if chunks.any?(&:negative?)

        chunks.uniq.sort
      rescue ArgumentError
        raise ArgumentError, "Confirmed intake groups must be non-negative integers."
      end
      private_class_method :normalize_confirmed_chunks

      def normalize_answer(value, field, status: "submitted")
        return normalize_history_answer(value, field, status:) if field[:history_kind]
        if field[:question_version]
          return WeightManagementQuestionnaireAnswers.normalize(value, field, status:)
        end

        value = { "state" => value.blank? ? "unanswered" : "answered", "value" => value } if value.is_a?(String)
        raise ArgumentError, "Intake answers must be text or structured answers." unless value.is_a?(Hash)
        value = WeightManagementQuestionnaireAnswers.object(value, "Intake answer")
        raise ArgumentError, "Choose supported answer details." if (value.keys - %w[state value unit measured_at source]).any?
        state = value.fetch("state", "unanswered")
        raise ArgumentError, "Choose a supported answer state." unless ANSWER_STATES.include?(state)
        text = value.fetch("value", "")
        raise ArgumentError, "Intake answer values must be text." unless text.is_a?(String)
        text = text.strip
        state = "unanswered" if state == "answered" && text.blank?
        raise ArgumentError, "Each intake answer must be #{MAX_ANSWER_LENGTH} characters or fewer." if text.length > MAX_ANSWER_LENGTH
        raise ArgumentError, "Only an answered question can contain a value." if state != "answered" && text.present?
        result = { "state" => state, "value" => text }
        if field[:choices] && state == "answered" && !field[:choices].include?(text)
          raise ArgumentError, "Choose a listed answer for #{field[:label]}"
        end
        if field[:units] && state == "answered"
          raise ArgumentError, "Enter a positive measurement." unless text.match?(/\A\d+(?:\.\d+)?\z/) && BigDecimal(text).positive?
          raise ArgumentError, "Choose a supported measurement unit." unless (status == "draft" && value["unit"].blank?) || field[:units].include?(value["unit"])
          source = value["source"]
          raise ArgumentError, "Choose how the measurement was obtained." unless (status == "draft" && source.blank?) || %w[patient_reported clinic_measured].include?(source)
          measured_at = value["measured_at"]
          begin
            if status == "draft" && measured_at.blank?
              measured_at = nil
            else
              raise ArgumentError unless measured_at.is_a?(String) && measured_at.match?(/\A\d{4}-\d{2}-\d{2}\z/)
              date = Date.iso8601(measured_at)
              raise ArgumentError if date > Current.business_time.to_date
            end
          rescue ArgumentError
            raise ArgumentError, "Enter the actual measurement date, not a future date."
          end
          result.merge!("unit" => value["unit"], "source" => source, "measured_at" => measured_at)
        elsif (value.keys - %w[state value]).any?
          raise ArgumentError, "Measurement details belong only to an answered height or weight."
        end
        result
      end

      def normalize_history_answer(value, field, status: "submitted")
        value = { "state" => value.blank? ? "unanswered" : "answered", "value" => value } if value.is_a?(String)
        raise ArgumentError, "Intake answers must be text or structured answers." unless value.is_a?(Hash)

        value = WeightManagementQuestionnaireAnswers.object(value, "History answer")
        raise ArgumentError, "Choose supported history answer details." if (value.keys - %w[state value entries]).any?
        state = value.fetch("state", "unanswered")
        raise ArgumentError, "Choose a supported answer state." unless ANSWER_STATES.include?(state)
        text = value.fetch("value", "")
        raise ArgumentError, "Intake answer values must be text." unless text.is_a?(String)
        text = text.strip
        entries = value.fetch("entries", nil)
        raise ArgumentError, "Each intake answer must be #{MAX_ANSWER_LENGTH} characters or fewer." if text.length > MAX_ANSWER_LENGTH
        if entries.nil?
          raise ArgumentError, "Each intake answer must be #{MAX_ANSWER_LENGTH} characters or fewer." if text.length > MAX_ANSWER_LENGTH
          state = "unanswered" if state == "answered" && text.blank?
          raise ArgumentError, "Only an answered question can contain a value." if state != "answered" && text.present?
          return { "state" => state, "value" => text }
        end

        raise ArgumentError, "History entries must be an array." unless entries.is_a?(Array)
        raise ArgumentError, "Add fewer history entries." if entries.length > MAX_HISTORY_ENTRIES
        raise ArgumentError, "Keep narrative and typed history answers separate." if text.present?
        if entries.empty? && (state != "answered" || status == "draft")
          return { "state" => state == "answered" ? "unanswered" : state, "value" => "", "entries" => [] }
        end
        raise ArgumentError, "Only an answered question can contain history entries." unless state == "answered"
        raise ArgumentError, "Answer at least one history entry." if entries.empty?

        normalized_entries = entries.map { |entry| normalize_history_entry(entry, field[:history_kind], record_fields: field[:record_fields] || [], status:) }
        maximum = field[:record_fields] ? WeightManagementQuestionnaireAnswers::MAX_RECORD_ANSWER_LENGTH : 5_000
        raise ArgumentError, "Shorten the history details before saving." if JSON.generate(normalized_entries).length > maximum
        { "state" => state, "value" => "", "entries" => normalized_entries }
      end

      def normalize_history_entry(entry, kind, record_fields: [], status: "submitted")
        raise ArgumentError, "History entries must be objects." unless entry.is_a?(Hash)

        entry = WeightManagementQuestionnaireAnswers.object(entry, "History entry")
        extra_ids = record_fields.map { |definition| definition[:id] }
        extra_values = WeightManagementQuestionnaireAnswers.normalize_entry(entry.slice(*extra_ids), record_fields, status:, allow_empty: true)
        entry = entry.except(*extra_ids)
        allowed = %w[kind name date_precision date_value duration outcome maintenance stop_reason adverse_effects adverse_effect_details complication_state complication_details current_status review_route managing_clinician details certainty actual_use dose_value dose_unit dose_certainty frequency source severity]
        raise ArgumentError, "Choose supported history entry details." if (entry.keys - allowed).any?
        entry.each do |key, value|
          WeightManagementQuestionnaireAnswers.text_value(value, { label: key.tr("_", " ") })
        end
        name = entry.fetch("name", "").to_s.strip
        raise ArgumentError, "Name each previous treatment or procedure." if name.blank?
        raise ArgumentError, "History names must be 240 characters or fewer." if name.length > 240
        date_precision = entry.fetch("date_precision", "unknown").to_s
        raise ArgumentError, "Choose a supported date certainty." unless HISTORY_DATE_PRECISIONS.include?(date_precision)
        date_value = entry.fetch("date_value", "").to_s.strip
        if date_precision == "exact"
          raise ArgumentError, "Enter a complete historical date." unless date_value.match?(/\A\d{4}-\d{2}-\d{2}\z/) && date_value[0, 4].to_i.positive?
          raise ArgumentError, "Historical dates cannot be in the future." if Date.iso8601(date_value) > Current.business_time.to_date
        elsif date_precision == "approximate"
          raise ArgumentError, "Enter an approximate year or month (YYYY or YYYY-MM)." unless date_value.match?(/\A\d{4}(?:-(?:0[1-9]|1[0-2]))?\z/) && date_value[0, 4].to_i.positive?
          raise ArgumentError, "Historical dates cannot be in the future." if date_value > Current.business_time.strftime(date_value.length == 4 ? "%Y" : "%Y-%m")
        else
          raise ArgumentError, "An unknown historical date cannot contain a date value." if date_value.present?
        end
        normalized = { "kind" => entry.fetch("kind", "other").to_s, "name" => name,
          "date_precision" => date_precision, "date_value" => date_value }
        if kind == "treatment"
          normalized["kind"] = enum_history_value(normalized["kind"], TREATMENT_KINDS, "treatment type")
          normalized["duration"] = enum_history_value(entry.fetch("duration", "unknown"), TREATMENT_DURATIONS, "treatment duration")
          normalized["outcome"] = enum_history_value(entry.fetch("outcome", "unknown"), TREATMENT_OUTCOMES, "treatment outcome")
          normalized["maintenance"] = enum_history_value(entry.fetch("maintenance", "unknown"), TREATMENT_MAINTENANCE, "maintenance status")
          normalized["stop_reason"] = enum_history_value(entry.fetch("stop_reason", "unknown"), TREATMENT_STOP_REASONS, "reason ended")
          normalized["adverse_effects"] = enum_history_value(entry.fetch("adverse_effects", "unknown"), %w[none_reported reported unknown], "adverse-effect status")
          normalized["adverse_effect_details"] = bounded_history_text(entry["adverse_effect_details"])
        elsif kind == "procedure"
          normalized["kind"] = enum_history_value(normalized["kind"], PROCEDURE_KINDS, "procedure type")
          normalized["outcome"] = enum_history_value(entry.fetch("outcome", "unknown"), PROCEDURE_OUTCOMES, "procedure outcome")
          normalized["complication_state"] = enum_history_value(entry.fetch("complication_state", "unknown"), PROCEDURE_COMPLICATIONS, "complication status")
          normalized["complication_details"] = bounded_history_text(entry["complication_details"])
        elsif kind == "condition"
          normalized["kind"] = enum_history_value(normalized["kind"], CONDITION_KINDS, "condition domain")
          normalized["current_status"] = enum_history_value(entry.fetch("current_status", "unknown"), CONDITION_STATUSES, "condition status")
          normalized["review_route"] = enum_history_value(entry.fetch("review_route", "unknown"), REVIEW_ROUTES, "review route")
          normalized["managing_clinician"] = bounded_history_text(entry["managing_clinician"])
          normalized["details"] = bounded_history_text(entry["details"])
        elsif kind == "symptom"
          normalized["kind"] = enum_history_value(normalized["kind"], SYMPTOM_KINDS, "symptom type")
          normalized["review_route"] = enum_history_value(entry.fetch("review_route", "unknown"), REVIEW_ROUTES, "review route")
          normalized["details"] = bounded_history_text(entry["details"])
        elsif kind == "family"
          normalized["kind"] = enum_history_value(normalized["kind"], FAMILY_RELATIVES, "affected relative")
          normalized["certainty"] = enum_history_value(entry.fetch("certainty", "unknown"), FAMILY_CERTAINTIES, "family-history certainty")
          normalized["details"] = bounded_history_text(entry["details"])
        elsif kind == "medication"
          normalized["kind"] = enum_history_value(normalized["kind"], MEDICATION_SOURCES, "medication source")
          normalized["actual_use"] = enum_history_value(entry.fetch("actual_use", "unknown"), ACTUAL_USE_STATES, "actual-use state")
          normalized["dose_certainty"] = enum_history_value(entry.fetch("dose_certainty", "unknown"), DOSE_CERTAINTIES, "dose certainty")
          dose_value = entry.fetch("dose_value", "").to_s.strip
          if normalized["dose_certainty"] == "known"
            raise ArgumentError, "Enter a numeric dose when dose certainty is known." unless dose_value.match?(/\A\d{1,9}(?:\.\d{1,6})?\z/) && BigDecimal(dose_value).positive?
          else
            raise ArgumentError, "An unknown dose cannot contain a numeric dose." if dose_value.present?
          end
          normalized["dose_value"] = dose_value
          units = record_fields.any? ? WeightManagementQuestionnaire::DOSE_UNITS : DOSE_UNITS
          normalized["dose_unit"] = enum_history_value(entry.fetch("dose_unit", "unknown"), units, "dose unit")
          normalized["frequency"] = enum_history_value(entry.fetch("frequency", "unknown"), MEDICATION_FREQUENCIES, "medication frequency")
          normalized["source"] = enum_history_value(entry.fetch("source", "unknown"), %w[patient_reported medication_list prescription_record supplement_label unknown], "medication record source")
          normalized["details"] = bounded_history_text(entry["details"])
        elsif kind == "allergy"
          normalized["kind"] = enum_history_value(normalized["kind"], ALLERGY_TYPES, "reaction type")
          normalized["certainty"] = enum_history_value(entry.fetch("certainty", "unknown"), FAMILY_CERTAINTIES, "reaction certainty")
          normalized["severity"] = enum_history_value(entry.fetch("severity", "unknown"), REACTION_SEVERITIES, "reaction severity")
          normalized["details"] = bounded_history_text(entry["details"])
        else
          raise ArgumentError, "Choose a supported history type."
        end
        normalized.merge!(extra_values)
        WeightManagementQuestionnaireAnswers.validate_record_relationships!(normalized, status:)
        normalized
      rescue ArgumentError
        raise
      rescue Date::Error
        raise ArgumentError, "Enter a valid historical date."
      end

      def enum_history_value(value, allowed, label)
        normalized = value.to_s
        raise ArgumentError, "Choose a supported #{label}." unless allowed.include?(normalized)

        normalized
      end

      def bounded_history_text(value)
        text = value.to_s.strip
        raise ArgumentError, "History details must be 600 characters or fewer." if text.length > MAX_ANSWER_LENGTH

        text
      end

      def decode(value)
        return unless value.to_s.start_with?(PREFIX)
        return if value.length > MAX_ENCODED_LENGTH
        payload = JSON.parse(value.delete_prefix(PREFIX))
        modern = payload.is_a?(Hash) && ([FORM_ID] + SPECIALTY_FORMS.keys).include?(payload["form_id"])
        return unless payload.is_a?(Hash) && ([ FORM_ID ] + LEGACY_FORM_IDS + SPECIALTY_FORMS.keys).include?(payload["form_id"]) &&
          payload["text"].is_a?(String) && payload["answers"].is_a?(Hash) &&
          (payload["answers"].keys - fields(payload["form_id"]).map { |field| field[:id] }).empty? &&
          payload["answers"].values.all? { |answer| answer.is_a?(String) || (modern && answer.is_a?(Hash)) }
        # Additive questionnaire releases must continue to render and hydrate
        # previously recorded answers. Missing version is supported for legacy
        # records; explicit versions must identify a supported schema.
        return if modern && payload.key?("questionnaire_version") &&
          (!payload["questionnaire_version"].is_a?(Integer) ||
            !(1..QUESTIONNAIRE_VERSION).cover?(payload["questionnaire_version"]))
        return if modern && payload["confirmed_chunks"].present? &&
          (!payload["confirmed_chunks"].is_a?(Array) || payload["confirmed_chunks"].any? { |item| !item.is_a?(Integer) || item.negative? })
        return unless !modern || %w[draft submitted].include?(payload["status"])
        if payload["form_id"] == "meta-clinic-previsit-v2" || (modern && payload["status"] == "submitted" && payload["recorder"] != "staff")
          attestation = payload["attestation"]
          return unless attestation.is_a?(Hash) && attestation == {
            "id" => ATTESTATION_ID,
            "version" => ATTESTATION_VERSION,
            "accepted" => true
          }
        end
        payload
      rescue JSON::ParserError
        nil
      end

      def render(value)
        payload = decode(value)
        return value unless payload
        sections = fields(payload["form_id"]).filter_map do |field|
          answer = answer_text(payload["answers"][field[:id]], field:)
          if answer.present?
            context = visible?(field, payload["answers"], form_id: payload["form_id"]) ? "" : " (retained answer; outside the current branch)"
            "#{field[:label]}#{context}\n#{answer}"
          end
        end
        sections << "Additional note\n#{payload['text']}" if payload["text"].present?
        sections.concat(IntakeQuestionFollowUp.render(payload))
        if payload["attestation"]
          sections << "Patient confirmation\nConfirmed current and authorized for care-team review"
        end
        sections << "Staff confirmation\nRecorded by staff; this is not a patient attestation or clinical review." if payload["staff_confirmation"]
        if payload["inherited_from"].is_a?(Hash)
          source = payload["inherited_from"]
          sections << "Previous-answer source\nNote #{source['note_id']}, version #{source['version']}, recorded #{source['recorded_at']}; questions: #{Array(source['question_ids']).join(', ')}"
        end
        heading = payload["status"] == "draft" ? "Patient-reported intake — draft, not confirmed" : "Patient-reported intake"
        "#{heading}\n\n#{sections.join("\n\n") }"
      end

      def answer_text(answer, field: nil)
        return answer unless answer.is_a?(Hash)
        return nil if answer["state"] == "unanswered"
        return nil unless ANSWER_STATES.include?(answer["state"])
        return answer["state"].tr("_", " ").capitalize unless answer["state"] == "answered"
        if answer["entries"].is_a?(Array)
          return answer["entries"].filter_map do |entry|
            next unless entry.is_a?(Hash)

            entry.filter_map do |key, value|
              next if value.blank?
              definition = field&.fetch(:record_fields, nil)&.find { |item| item[:id] == key }
              label = definition ? definition[:label] : key.tr("_", " ")
              rendered = value.is_a?(Array) ? value.join(", ") : value
              "#{label}: #{rendered}"
            end.join(" · ")
          end.join("\n")
        end
        if answer["values"].is_a?(Array)
          return [answer["values"].join(", "), answer["other_detail"].presence].compact.join(" — ")
        end
        [ answer["value"], answer["unit"], answer["measured_at"], answer["source"]&.tr("_", " "),
          answer["verification"]&.tr("_", " "), answer["source_details"], answer["other_detail"] ].compact.join(" ")
      end
    end
  end
end
