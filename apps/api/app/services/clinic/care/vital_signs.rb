module Clinic
  module Care
    class VitalSigns
      class DictionaryMismatch < StandardError; end

      CODE_SYSTEM = "urn:apply:vital-signs"
      DICTIONARY_VERSION = "1"
      ROOT_CODE = "vital-signs"
      BLOOD_PRESSURE_CODE = "vital-blood-pressure"
      OPERATION_CODE = "vital_signs.create"

      FIELDS = [
        { code: "vital-systolic-bp", label: "Systolic blood pressure", group: "blood_pressure",
          units: [ { code: "mm[Hg]", label: "mmHg" } ] },
        { code: "vital-diastolic-bp", label: "Diastolic blood pressure", group: "blood_pressure",
          units: [ { code: "mm[Hg]", label: "mmHg" } ] },
        { code: "vital-heart-rate", label: "Heart rate", group: nil,
          units: [ { code: "/min", label: "beats/min" } ] },
        { code: "vital-respiratory-rate", label: "Respiratory rate", group: nil,
          units: [ { code: "/min", label: "breaths/min" } ] },
        { code: "vital-oxygen-saturation", label: "Oxygen saturation", group: nil,
          units: [ { code: "%", label: "%" } ] },
        { code: "vital-temperature", label: "Temperature", group: nil,
          units: [ { code: "Cel", label: "°C" }, { code: "[degF]", label: "°F" } ] },
        { code: "vital-weight", label: "Weight", group: nil,
          units: [ { code: "kg", label: "kg" }, { code: "[lb_av]", label: "lb" } ] }
      ].freeze

      FIELD_BY_CODE = FIELDS.index_by { |field| field.fetch(:code) }.freeze
      BLOOD_PRESSURE_COMPONENTS = %w[vital-systolic-bp vital-diastolic-bp].freeze

      def self.fields
        FIELDS
      end

      def self.presentation(observation)
        return {} unless observation.code_system == CODE_SYSTEM && observation.code_version == DICTIONARY_VERSION

        field = FIELD_BY_CODE[observation.code]
        return {} unless field

        unit = field.fetch(:units).find { |candidate| candidate.fetch(:code) == observation.unit_code }
        { display_label: field.fetch(:label) }.tap do |payload|
          payload[:unit_label] = unit.fetch(:label) if unit
        end
      end

      def self.record(practice:, actor:, patient:, encounter:, request_key:, dictionary_version:, observed_at:,
        confirmed_patient:, readings:)
        patient = practice.patients.find(patient.id)
        encounter = practice.encounters.where(patient: patient).find(encounter.id)
        normalized = normalize_readings!(readings)
        validate_request!(dictionary_version:, confirmed_patient:, readings: normalized)
        payload = {
          patient_id: patient.id,
          encounter_id: encounter.id,
          dictionary_version: DICTIONARY_VERSION,
          observed_at: observed_at,
          confirmed_patient: true,
          readings: normalized
        }

        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: OPERATION_CODE, request_key:, payload:,
          authorization: -> { authorize_write!(practice:, actor:, patient:, encounter:) },
          authorization_action: "observations.write",
          result_resource: ->(root) { root },
          resource_resolver: ->(practice:, receipt:) {
            practice.observations.where(
              patient_id: patient.id, encounter_id: encounter.id, value_kind: :group,
              code: ROOT_CODE, code_system: CODE_SYSTEM, code_version: DICTIONARY_VERSION
            ).find_by(id: receipt.resource_id)
          }
        ) do
          locked_encounter = practice.encounters.where(patient: patient).lock.find(encounter.id)
          unless locked_encounter.status == "open" && locked_encounter.ended_at.nil?
            raise ArgumentError, "Vital signs can be recorded only during an open encounter."
          end

          membership = authorize_write!(practice:, actor:, patient:, encounter: locked_encounter)
          recorded_at = Current.business_time
          root = create_group!(
            practice:, patient:, encounter: locked_encounter, membership:, code: ROOT_CODE,
            parent: nil, observed_at:, recorded_at:
          )
          blood_pressure = if normalized.any? { |reading| BLOOD_PRESSURE_COMPONENTS.include?(reading.fetch(:code)) }
            create_group!(
              practice:, patient:, encounter: locked_encounter, membership:, code: BLOOD_PRESSURE_CODE,
              parent: root, observed_at:, recorded_at:
            )
          end

          normalized.each do |reading|
            definition = FIELD_BY_CODE.fetch(reading.fetch(:code))
            patient.observations.create!(
              practice:, encounter: locked_encounter, author_membership: membership,
              parent_observation: definition.fetch(:group) == "blood_pressure" ? blood_pressure : root,
              code: reading.fetch(:code), code_system: CODE_SYSTEM, code_version: DICTIONARY_VERSION,
              value_kind: :numeric, numeric_value: reading.fetch(:value), unit_code: reading.fetch(:unit_code),
              observed_at:, recorded_at:
            )
          end
          Clinic::AuditRecorder.record!(
            practice:, actor:, action_code: OPERATION_CODE, outcome: :committed,
            resource_version_ref: "Clinic::Care::Observation/#{root.id}:patient/#{patient.id}:encounter/#{locked_encounter.id}"
          )
          root
        end

        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        root = outcome.value
        unless root
          raise Clinic::Idempotency::InvalidRequest, "The committed vital-sign collection is unavailable."
        end

        collection(root)
      end

      def self.authorize_write!(practice:, actor:, patient:, encounter:)
        patient = practice.patients.find(patient.id)
        encounter = practice.encounters.where(patient: patient).find(encounter.id)
        Clinic::Authorization.authorize!(actor:, practice:, action: "patients.read", subject: patient)
        Clinic::Authorization.authorize!(actor:, practice:, action: "observations.write", site: encounter.site)
      end
      private_class_method :authorize_write!

      def self.create_group!(practice:, patient:, encounter:, membership:, code:, parent:, observed_at:, recorded_at:)
        patient.observations.create!(
          practice:, encounter:, author_membership: membership, parent_observation: parent,
          code:, code_system: CODE_SYSTEM, code_version: DICTIONARY_VERSION, value_kind: :group,
          observed_at:, recorded_at:
        )
      end
      private_class_method :create_group!

      def self.normalize_readings!(readings)
        readings = Array(readings)
        raise ArgumentError, "Record at least one vital-sign reading." if readings.empty?
        raise ArgumentError, "A vital-sign collection can contain at most seven readings." if readings.length > FIELDS.length

        normalized = readings.map do |reading|
          values = reading.to_h.symbolize_keys
          code = values.fetch(:code).to_s
          definition = FIELD_BY_CODE[code]
          raise ArgumentError, "Choose a supported vital-sign code." unless definition

          unit_code = values.fetch(:unit_code).to_s
          accepted_units = definition.fetch(:units).map { |unit| unit.fetch(:code) }
          raise ArgumentError, "Choose a supported unit for #{code}." unless accepted_units.include?(unit_code)

          { code:, value: normalize_value!(values.fetch(:value)), unit_code: }
        end
        raise ArgumentError, "Each vital-sign code can appear only once." unless normalized.map { |item| item.fetch(:code) }.uniq.length == normalized.length

        FIELDS.filter_map do |definition|
          normalized.find { |reading| reading.fetch(:code) == definition.fetch(:code) }
        end
      rescue KeyError
        raise ArgumentError, "Each vital-sign reading requires code, value, and unit_code."
      end
      private_class_method :normalize_readings!

      def self.normalize_value!(value)
        text = value.to_s
        unless text.length.between?(1, 30) && text.match?(/\A[+-]?\d+(?:\.\d+)?\z/) && BigDecimal(text).finite?
          raise ArgumentError, "Each vital-sign value must be a finite exact decimal string."
        end

        text
      rescue ArgumentError
        raise ArgumentError, "Each vital-sign value must be a finite exact decimal string."
      end
      private_class_method :normalize_value!

      def self.validate_request!(dictionary_version:, confirmed_patient:, readings:)
        unless dictionary_version.to_s == DICTIONARY_VERSION
          raise DictionaryMismatch, "Reload the vital-sign dictionary before recording."
        end
        raise ArgumentError, "Confirm the selected patient before recording vital signs." unless confirmed_patient == true

        pressure_codes = readings.filter_map do |reading|
          reading.fetch(:code) if BLOOD_PRESSURE_COMPONENTS.include?(reading.fetch(:code))
        end
        return if pressure_codes.empty? || pressure_codes.sort == BLOOD_PRESSURE_COMPONENTS.sort

        raise ArgumentError, "Record both systolic and diastolic blood pressure together."
      end
      private_class_method :validate_request!

      def self.collection(root)
        direct_children = root.child_observations.where(
          code_system: CODE_SYSTEM, code_version: DICTIONARY_VERSION, recorded_at: root.recorded_at
        ).to_a
        blood_pressure = direct_children.find { |observation| observation.code == BLOOD_PRESSURE_CODE && observation.value_kind_group? }
        components = if blood_pressure
          blood_pressure.child_observations.where(
            code_system: CODE_SYSTEM, code_version: DICTIONARY_VERSION, recorded_at: root.recorded_at
          ).to_a
        else
          []
        end
        values = (direct_children + components).select(&:value_kind_numeric?).index_by(&:code)
        ordered_values = FIELDS.filter_map { |field| values[field.fetch(:code)] }
        [ root, blood_pressure, *ordered_values ].compact
      end
      private_class_method :collection
    end
  end
end
