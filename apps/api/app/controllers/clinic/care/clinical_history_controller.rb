module Clinic
  module Care
    class ClinicalHistoryController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }

      RECORD_FIELDS = {
        "allergies" => %i[allergen_name reaction category clinical_status verification_status criticality severity onset_at],
        "medications" => %i[medication_name dose_text route_text frequency_text purpose status information_source effective_from effective_until asserted_at],
        "conditions" => %i[condition_name care_instruction clinical_status verification_status affects_current_care onset_at resolved_at]
      }.freeze

      def index
        patient = readable_patient!
        encounter = find_encounter(patient, params[:encounter_id])
        can_write = encounter.present? && open_encounter?(encounter) &&
          current_ability.allowed_permission?("notes.write", site: encounter.site)
        Clinic::AuditRecorder.record!(
          practice: current_practice, actor: current_user,
          action_code: "clinical_history.read", outcome: :released,
          resource_version_ref: "Clinic::Care::Patient/#{patient.id}:encounter/#{encounter&.id || 'none'}"
        )
        render json: ClinicalHistorySerializer.call(patient, encounter:, can_write:,
          reported_intake_conditions: reported_intake_conditions(patient, encounter))
      end

      def create
        patient = readable_patient!
        kind = history_kind!
        input = parameter_hash!(:clinical_history, [ :encounter_id, :request_key, *RECORD_FIELDS.fetch(kind) ])
        encounter = find_encounter(patient, input[:encounter_id], required: true)
        record = ClinicalHistory.create(
          practice: current_practice, actor: current_user, patient:, encounter:, kind:,
          attributes: record_attributes(kind, input),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
        )
        render_record(record, patient:, encounter:, kind:, status: :created)
      end

      def update
        patient = readable_patient!
        kind = history_kind!
        input = parameter_hash!(
          :clinical_history,
          [ :encounter_id, :request_key, :lock_version, *RECORD_FIELDS.fetch(kind) ]
        )
        encounter = find_encounter(patient, input[:encounter_id], required: true)
        record = ClinicalHistory.update(
          practice: current_practice, actor: current_user, patient:, encounter:, kind:,
          record_id: requested_id!(params[:id], :id), attributes: record_attributes(kind, input),
          expected_lock_version: bounded_integer!(input[:lock_version], field: :lock_version),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
        )
        render_record(record, patient:, encounter:, kind:)
      end

      def review
        patient = readable_patient!
        input = parameter_hash!(:review, %i[encounter_id request_key topic outcome information_source notes])
        encounter = find_encounter(patient, input[:encounter_id], required: true)
        review = ClinicalHistory.review(
          practice: current_practice, actor: current_user, patient:, encounter:,
          topic: enum_param!(input[:topic], field: :topic, allowed: ClinicalHistory::REVIEW_TOPICS),
          outcome: enum_param!(input[:outcome], field: :outcome, allowed: PatientHistoryReview.outcomes.keys),
          information_source: enum_param!(
            input[:information_source], field: :information_source,
            allowed: PatientHistoryReview.information_sources.keys
          ),
          notes: optional_string(input[:notes], field: :notes, maximum: 2_000),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 120)
        )
        render json: {
          review: ClinicalHistorySerializer.review(review),
          patient_id: patient.id, encounter_id: encounter.id
        }, status: :created
      end

      private

      def reported_intake_conditions(patient, encounter)
        revisions = Clinic::EncounterIntakeRevision.where(practice: current_practice, patient: patient)
          .includes(:encounter).order(recorded_at: :desc, id: :desc)
        revision = encounter && revisions.where(encounter: encounter).first
        revision ||= revisions.first
        return { state: "not_recorded", source: nil, questions: [] } unless revision
        unless current_ability.allowed_permission?("encounters.read", site: revision.encounter.site)
          return { state: "restricted", source: nil, questions: [] }
        end
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "clinical_history.intake_conditions.read", outcome: :released,
          resource_version_ref: "Clinic::EncounterIntakeRevision/#{revision.id}:version/#{revision.version_number}:patient/#{patient.id}")
        ClinicalHistorySerializer.intake_conditions(revision)
      end

      def readable_patient!
        current_practice.patients.accessible_by(current_ability, :read)
          .find(requested_id!(params[:patient_id], :patient_id))
      end

      def history_kind!
        kind = params[:kind].to_s
        return kind if RECORD_FIELDS.key?(kind)

        raise Clinic::Api::RequestParameters::Invalid.new(
          "kind must be one of: #{RECORD_FIELDS.keys.join(', ')}.", field: :kind
        )
      end

      def find_encounter(patient, value, required: false)
        if value.blank?
          raise Clinic::Api::RequestParameters::Invalid.new("encounter_id is required.", field: :encounter_id) if required
          return
        end

        current_practice.encounters.where(patient: patient)
          .find(requested_id!(value, :encounter_id))
      end

      def open_encounter?(encounter)
        encounter.status == "open" && encounter.ended_at.nil?
      end

      def record_attributes(kind, input)
        case kind
        when "allergies" then allergy_attributes(input)
        when "medications" then medication_attributes(input)
        when "conditions" then condition_attributes(input)
        end
      end

      def allergy_attributes(input)
        {
          allergen_name: required_string!(input[:allergen_name], field: :allergen_name, maximum: 400),
          reaction: optional_string(input[:reaction], field: :reaction, maximum: 2_000),
          category: enum_param!(input[:category], field: :category, allowed: Allergy.categories.keys),
          clinical_status: enum_param!(input[:clinical_status], field: :clinical_status, allowed: Allergy.clinical_statuses.keys),
          verification_status: enum_param!(input[:verification_status], field: :verification_status, allowed: Allergy.verification_statuses.keys),
          criticality: enum_param!(input[:criticality], field: :criticality, allowed: Allergy.criticalities.keys),
          severity: enum_param!(input[:severity], field: :severity, allowed: Allergy.severities.keys),
          onset_at: optional_time(input[:onset_at], :onset_at)
        }
      end

      def medication_attributes(input)
        {
          medication_name: required_string!(input[:medication_name], field: :medication_name, maximum: 400),
          dose_text: optional_string(input[:dose_text], field: :dose_text, maximum: 400),
          route_text: optional_string(input[:route_text], field: :route_text, maximum: 400),
          frequency_text: optional_string(input[:frequency_text], field: :frequency_text, maximum: 400),
          purpose: optional_string(input[:purpose], field: :purpose, maximum: 2_000),
          status: enum_param!(input[:status], field: :status, allowed: MedicationStatement.statuses.keys),
          information_source: enum_param!(input[:information_source], field: :information_source, allowed: MedicationStatement.information_sources.keys),
          effective_from: optional_time(input[:effective_from], :effective_from),
          effective_until: optional_time(input[:effective_until], :effective_until),
          asserted_at: optional_time(input[:asserted_at], :asserted_at)
        }
      end

      def condition_attributes(input)
        {
          condition_name: required_string!(input[:condition_name], field: :condition_name, maximum: 400),
          care_instruction: optional_string(input[:care_instruction], field: :care_instruction, maximum: 2_000),
          clinical_status: enum_param!(input[:clinical_status], field: :clinical_status, allowed: Condition.clinical_statuses.keys),
          verification_status: enum_param!(input[:verification_status], field: :verification_status, allowed: Condition.verification_statuses.keys),
          affects_current_care: boolean_param(input[:affects_current_care], field: :affects_current_care),
          onset_at: optional_time(input[:onset_at], :onset_at),
          resolved_at: optional_time(input[:resolved_at], :resolved_at)
        }
      end

      def optional_time(value, field)
        value.present? ? time_param!(value, field:) : nil
      end

      def render_record(record, patient:, encounter:, kind:, status: :ok)
        render json: {
          record: ClinicalHistorySerializer.record(kind, record),
          patient_id: patient.id, encounter_id: encounter.id
        }, status:
      end
    end
  end
end
