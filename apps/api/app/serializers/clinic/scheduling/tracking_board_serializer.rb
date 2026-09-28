module Clinic
  module Scheduling
    module TrackingBoardSerializer
      def self.build_care_summary_batch(encounters, practice_id:, as_of:, demographics: nil)
        CareSummaryBatch.new(encounters, practice_id: practice_id, as_of: as_of, demographics: demographics)
      end

      def self.build_vitals_batch(encounters, practice_id:)
        VitalsBatch.new(encounters, practice_id: practice_id)
      end

      def self.build_chart_status_batch(encounters, practice_id:, accessible_encounter_ids:)
        ChartStatusBatch.new(
          encounters,
          practice_id: practice_id,
          accessible_encounter_ids: accessible_encounter_ids
        )
      end

      def self.build_provider_batch(encounters, practice:, as_of:, eligible_site_ids: nil)
        ProviderBatch.new(encounters, practice: practice, as_of: as_of, eligible_site_ids: eligible_site_ids)
      end

      def self.call(encounter, care_summary: nil, synthetic_scenario: nil, operational_state: "unrecorded", demographics: nil, vitals: nil, chart_status: "unavailable", membership: "not_verified", provider: nil, provider_assignment_available: false, intake_ownership: nil, intake_claim_available: false, nurse_workflow: nil, exceptions: [])
        appointment = encounter.appointment
        payload = {
          id: encounter.id,
          row_type: "encounter",
          operational_state: operational_state,
          patient_id: encounter.patient_id,
          encounter_id: encounter.id,
          chart_status: chart_status,
          provider_assignment_available: provider_assignment_available,
          patient: {
            id: encounter.patient.id,
            display_name: encounter.patient.display_name,
            reference: encounter.patient.reference,
            demographics: demographics_payload(demographics),
            membership: membership
          },
          vitals: vitals,
          provider: provider,
          encounter: {
            id: encounter.id,
            status: encounter.status,
            started_at: encounter.started_at&.iso8601(6),
            ended_at: encounter.ended_at&.iso8601(6),
            site_id: encounter.site_id&.to_s,
            site_code: encounter.site&.code,
            room_id: encounter.room_id,
            room_code: encounter.room&.code
          },
          appointment: appointment && {
            id: appointment.id,
            status: appointment.status,
            starts_at: appointment.starts_at&.iso8601(6),
            ends_at: appointment.ends_at&.iso8601(6),
            visit_type_code: appointment.visit_type&.code,
            reason: appointment.reason,
            site_id: appointment.site_id&.to_s,
            site_code: appointment.site&.code,
            room_id: appointment.room_id,
            room_code: appointment.room&.code
          },
          care_summary: care_summary,
          intake_ownership: intake_ownership,
          intake_claim_available: intake_claim_available,
          nurse_workflow: nurse_workflow,
          exceptions: exceptions
        }
        payload[:synthetic_scenario] = synthetic_scenario if synthetic_scenario
        payload
      end

      def self.call_scheduled(appointment, operational_state:, demographics: nil, membership: "not_verified", chart_status: "unopened")
        {
          id: appointment.id,
          row_type: "appointment",
          operational_state: operational_state,
          patient_id: appointment.patient_id,
          encounter_id: nil,
          chart_status: chart_status,
          provider_assignment_available: false,
          patient: {
            id: appointment.patient.id,
            display_name: appointment.patient.display_name,
            reference: appointment.patient.reference,
            demographics: demographics_payload(demographics),
            membership: membership
          },
          encounter: nil,
          appointment: {
            id: appointment.id,
            status: appointment.status,
            starts_at: appointment.starts_at&.iso8601(6),
            ends_at: appointment.ends_at&.iso8601(6),
            visit_type_code: appointment.visit_type&.code,
            reason: appointment.reason,
            site_id: appointment.site_id&.to_s,
            site_code: appointment.site&.code,
            room_id: appointment.room_id,
            room_code: appointment.room&.code
          },
          care_summary: nil,
          vitals: nil,
          intake_ownership: nil,
          intake_claim_available: false,
          nurse_workflow: nil,
          exceptions: []
        }
      end

      def self.demographics_payload(demographics)
        return { age: nil, sex: "not_recorded" } unless demographics

        { age: demographics[:age], sex: demographics[:sex].presence || "not_recorded" }
      end
      private_class_method :demographics_payload

      class VitalsBatch
        VITAL_CODES = %w[vital-systolic-bp vital-diastolic-bp vital-heart-rate vital-weight].freeze
        BLOOD_PRESSURE_CODES = %w[vital-systolic-bp vital-diastolic-bp].freeze

        def initialize(encounters, practice_id:)
          @by_encounter = Hash.new { |hash, key| hash[key] = {} }
          observations = Clinic::Care::Observation.where(
            practice_id: practice_id, encounter_id: encounters.map(&:id), code: VITAL_CODES,
            value_kind: :numeric
          ).includes(:parent_observation).order(observed_at: :desc, id: :desc).to_a
          observations.group_by(&:encounter_id).each do |encounter_id, encounter_observations|
            %w[vital-heart-rate vital-weight].each do |code|
              observation = encounter_observations.find { |candidate| candidate.code == code }
              @by_encounter[encounter_id][code] = reading(observation) if observation
            end
            pressure = blood_pressure_pair(encounter_observations)
            pressure&.each do |observation|
              @by_encounter[encounter_id][observation.code] = reading(observation)
            end
          end
        end

        def reading(observation)
          presentation = Clinic::Care::VitalSigns.presentation(observation)
          {
            value: observation.numeric_value&.to_d&.to_s("F"),
            unit: presentation.fetch(:unit_label, observation.unit_code)
          }
        end

        def blood_pressure_pair(observations)
          grouped = observations.select do |observation|
            observation.parent_observation&.value_kind_group? &&
              observation.parent_observation.code == Clinic::Care::VitalSigns::BLOOD_PRESSURE_CODE
          end.group_by(&:parent_observation_id).values.filter_map { |members| complete_pressure_pair(members) }
          legacy = observations.select { |observation| observation.parent_observation_id.nil? }
            .group_by do |observation|
              [ observation.observed_at, observation.unit_code, observation.code_system, observation.code_version ]
            end
            .values.filter_map { |members| complete_pressure_pair(members) }
          (grouped + legacy).max_by do |pair|
            [ pair.map(&:observed_at).max, pair.map(&:id).max ]
          end
        end

        def complete_pressure_pair(observations)
          pair = BLOOD_PRESSURE_CODES.map do |code|
            observations.find { |observation| observation.code == code }
          end
          return if pair.any?(&:nil?)
          return unless pair.map(&:unit_code).uniq.one? && pair.map(&:observed_at).uniq.one? &&
            pair.map(&:code_system).uniq.one? && pair.map(&:code_version).uniq.one?

          pair
        end

        private :reading, :blood_pressure_pair, :complete_pressure_pair

        def call(encounter)
          values = @by_encounter.fetch(encounter.id, {})
          {
            blood_pressure: {
              systolic: values.dig("vital-systolic-bp", :value),
              diastolic: values.dig("vital-diastolic-bp", :value),
              unit: values.dig("vital-systolic-bp", :unit) || values.dig("vital-diastolic-bp", :unit)
            },
            heart_rate: values["vital-heart-rate"],
            weight: values["vital-weight"]
          }.compact
        end
      end

      class ChartStatusBatch
        def initialize(encounters, practice_id:, accessible_encounter_ids:)
          @accessible_encounter_ids = accessible_encounter_ids.to_h { |id| [ id, true ] }
          @by_encounter = {}
          return if @accessible_encounter_ids.empty?

          Clinic::EncounterNote.where(
            practice_id: practice_id,
            encounter_id: @accessible_encounter_ids.keys,
            note_kind: "soap"
          ).includes(:signatures).each do |note|
            @by_encounter[note.encounter_id] = note.signatures.any? ? "signed" : "draft"
          end
        end

        def call(encounter)
          return "unavailable" unless @accessible_encounter_ids[encounter.id]

          @by_encounter.fetch(encounter.id, "unopened")
        end
      end

      class ProviderBatch
        def initialize(encounters, practice:, as_of:, eligible_site_ids: nil)
          @participants = Clinic::EncounterParticipant.where(
            practice_id: practice.id, encounter_id: encounters.map(&:id), participation_role: "queue_provider"
          ).current(as_of).includes(membership: :clinician_profile).index_by(&:encounter_id)
          @eligible_site_ids = eligible_site_ids || encounters.map(&:site_id).compact.uniq
          @eligible = if @eligible_site_ids.empty?
            []
          else
            practice.clinician_profiles.includes(membership: :user).to_a.select do |profile|
              profile.membership.active? && profile.membership.practice_id == practice.id &&
                profile.membership.user.active? &&
                @eligible_site_ids.any? do |site_id|
                  ::Ability.new(profile.membership.user, practice: practice)
                    .allowed_permission?("notes.sign", site: practice.sites.find(site_id))
                end
            end
          end
        end

        def call(encounter)
          participant = @participants[encounter.id]
          profile = participant&.membership&.clinician_profile
          return unless profile && participant.membership.active? &&
            participant.membership.practice_id == participant.practice_id && profile.practice_id == participant.practice_id

          profile_payload(profile, participant)
        end

        def eligible
          @eligible.map do |profile|
            {
              clinician_profile_id: profile.id.to_s,
              display_name: display_name(profile),
              site_ids: @eligible_site_ids.select do |site_id|
                ::Ability.new(profile.membership.user, practice: profile.practice)
                  .allowed_permission?("notes.sign", site: profile.practice.sites.find(site_id))
              end.map(&:to_s)
            }
          end
        end

        private

        def profile_payload(profile, participant = nil)
          { clinician_profile_id: profile.id.to_s, display_name: display_name(profile), token: participant&.id&.to_s }
        end

        def display_name(profile)
          profile.display_name.presence || profile.reference.presence || "Provider profile #{profile.id}"
        end

      end

      class CareSummaryBatch
        def initialize(encounters, practice_id:, as_of:, demographics: nil)
          @as_of = as_of
          @patients = encounters.map(&:patient).index_by(&:id)
          @encounter_ids = encounters.map(&:id)
          @patient_ids = @patients.keys
          @practice_id = practice_id
          @provided_demographics = demographics
          preload
        end

        def call(encounter)
          patient = @patients.fetch(encounter.patient_id)
          patient_proxy = PatientProxy.new(
            patient,
            allergies: @allergies.fetch(patient.id, []),
            medications: @medications.fetch(patient.id, []),
            care_needs: @care_needs.fetch(patient.id, []),
            conditions: @conditions.fetch(patient.id, []),
            # The care-summary serializer scopes reviews to this encounter. Supplying
            # only this encounter's records preserves that contract while avoiding a
            # repeated in-memory scan of every board review for the same patient.
            history_reviews: @history_reviews_by_encounter.fetch(encounter.id, []),
            demographics: @demographics[patient.id]
          )
          encounter_proxy = EncounterProxy.new(
            encounter,
            precautions: @precautions.fetch(encounter.id, [])
          )
          Clinic::Care::PatientCareSummarySerializer.call(
            patient_proxy,
            encounter: encounter_proxy,
            as_of: @as_of
          )
        end

        private

        def preload
          @allergies = grouped(
            Clinic::Care::Allergy.active_for_summary.where(practice_id: @practice_id, patient_id: @patient_ids)
          )
          @medications = grouped(
            Clinic::Care::MedicationStatement.active_for_summary.where(
              practice_id: @practice_id, patient_id: @patient_ids
            )
          )
          @care_needs = grouped(
            Clinic::Care::PatientCareNeed.active_at(@as_of).where(
              practice_id: @practice_id, patient_id: @patient_ids
            )
          )
          @conditions = grouped(
            Clinic::Care::Condition.active_care_alerts.where(
              practice_id: @practice_id, patient_id: @patient_ids
            )
          )
          @history_reviews_by_encounter = grouped(
            Clinic::Care::PatientHistoryReview.where(
              practice_id: @practice_id, patient_id: @patient_ids, encounter_id: @encounter_ids
            ),
            key: :encounter_id
          )
          @demographics = @provided_demographics || Clinic::Care::PatientDemographics.where(
            practice_id: @practice_id, patient_id: @patient_ids
          ).index_by(&:patient_id)
          @precautions = grouped(
            Clinic::Care::EncounterPrecaution.where(
              practice_id: @practice_id, encounter_id: @encounter_ids
            ),
            key: :encounter_id
          )
        end

        def grouped(relation, key: :patient_id)
          relation.to_a.group_by { |record| record.public_send(key) }
        end
      end

      class ScopedCollection
        include Enumerable

        def initialize(records, active_records: nil, exists: nil)
          @records = records
          @active_records = active_records
          @exists = exists.nil? ? records.any? : exists
        end

        def each(&block)
          @records.each(&block)
        end

        def active_for_summary
          return self unless @active_records

          self.class.new(@active_records, exists: @exists)
        end

        def active_at(_as_of)
          self
        end

        def reviewed_at_or_before(as_of)
          self.class.new(@records.select { |record| record.reviewed_at <= as_of }, exists: @exists)
        end

        def recorded_at_or_before(as_of)
          self.class.new(@records.select { |record| record.recorded_at <= as_of }, exists: @exists)
        end

        def active_care_alerts
          self
        end

        def latest_first
          self.class.new(@records.sort_by { |record| [ record.reviewed_at, record.id ] }.reverse, exists: @exists)
        end

        def order(*columns)
          self.class.new(@records.sort_by { |record| columns.map { |column| record.public_send(column) } }, exists: @exists)
        end

        def where(encounter:)
          self.class.new(@records.select { |record| record.encounter_id == encounter.id }, exists: @exists)
        end

        def exists?
          @exists
        end

        def to_a
          @records.dup
        end
      end

      class PatientProxy
        attr_reader :id, :demographics

        def initialize(patient, allergies:, medications:, care_needs:, conditions:, history_reviews:, demographics:)
          @id = patient.id
          @demographics = demographics
          @allergies = ScopedCollection.new(allergies)
          @medication_statements = ScopedCollection.new(medications)
          @care_needs = ScopedCollection.new(care_needs)
          @conditions = ScopedCollection.new(conditions)
          @history_reviews = ScopedCollection.new(history_reviews)
        end

        attr_reader :allergies, :medication_statements, :care_needs, :conditions, :history_reviews
      end

      class EncounterProxy
        attr_reader :id, :precautions

        def initialize(encounter, precautions:)
          @id = encounter.id
          active = precautions.select { |precaution| precaution.status == "active" }
          @precautions = ScopedCollection.new(precautions, active_records: active)
        end
      end
    end
  end
end
