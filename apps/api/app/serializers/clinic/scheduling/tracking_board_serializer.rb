module Clinic
  module Scheduling
    module TrackingBoardSerializer
      def self.build_care_summary_batch(encounters, practice_id:, as_of:)
        CareSummaryBatch.new(encounters, practice_id: practice_id, as_of: as_of)
      end

      def self.call(encounter, care_summary: nil, synthetic_scenario: nil)
        appointment = encounter.appointment
        payload = {
          id: encounter.id,
          patient_id: encounter.patient_id,
          encounter_id: encounter.id,
          patient: {
            id: encounter.patient.id,
            display_name: encounter.patient.display_name,
            reference: encounter.patient.reference
          },
          encounter: {
            id: encounter.id,
            status: encounter.status,
            started_at: encounter.started_at&.iso8601(6),
            ended_at: encounter.ended_at&.iso8601(6),
            site_id: encounter.site_id,
            site_code: encounter.site&.code,
            room_id: encounter.room_id,
            room_code: encounter.room&.code
          },
          appointment: appointment && {
            id: appointment.id,
            status: appointment.status,
            starts_at: appointment.starts_at&.iso8601(6),
            ends_at: appointment.ends_at&.iso8601(6),
            visit_type_code: appointment.visit_type&.code
          },
          care_summary: care_summary
        }
        payload[:synthetic_scenario] = synthetic_scenario if synthetic_scenario
        payload
      end

      class CareSummaryBatch
        def initialize(encounters, practice_id:, as_of:)
          @as_of = as_of
          @patients = encounters.map(&:patient).index_by(&:id)
          @encounter_ids = encounters.map(&:id)
          @patient_ids = @patients.keys
          @practice_id = practice_id
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
            history_reviews: @history_reviews.fetch(patient.id, []),
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
          @history_reviews = grouped(
            Clinic::Care::PatientHistoryReview.where(
              practice_id: @practice_id, patient_id: @patient_ids, encounter_id: @encounter_ids
            )
          )
          @demographics = Clinic::Care::PatientDemographics.where(
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
