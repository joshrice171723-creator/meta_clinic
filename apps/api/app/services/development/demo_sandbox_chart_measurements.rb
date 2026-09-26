module Development
  class DemoSandboxChartMeasurements
    COHORT_PER_SITE = 8
    MIN_HISTORY_DAYS = 35

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      run.practice.organization.practices.order(:id).each do |practice|
        practice.sites.order(:id).each_with_index do |site, site_index|
          prepare_site!(practice:, site:, site_index: site_index + 1)
        end
      end
    end

    def self.prepare_site!(practice:, site:, site_index:)
      patients = practice.patients.where(primary_site: site)
        .where("reference LIKE 'SBX-%'").order(:id).to_a
      encounters_by_patient = practice.encounters.includes(:patient)
        .where(site:, status: "completed", patient_id: patients.map(&:id))
        .order(:started_at, :id).to_a.group_by(&:patient_id)
      zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
        raise(ArgumentError, "Sandbox location timezone is unavailable")
      cohort = patients.filter_map do |patient|
        visits = encounters_by_patient.fetch(patient.id, [])
        next if visits.length < 2 ||
          (visits.last.started_at.in_time_zone(zone).to_date - visits.first.started_at.in_time_zone(zone).to_date) < MIN_HISTORY_DAYS

        [ patient, [ visits.first, visits.last ] ]
      end.first(COHORT_PER_SITE)
      raise ArgumentError, "Sandbox site needs #{COHORT_PER_SITE} patients with two months of completed visits" unless
        cohort.length == COHORT_PER_SITE

      clinician = practice.clinician_profiles.find_by!(reference: "SBX-CLIN-#{site_index}-1")
      actor = clinician.membership.user
      cohort.each_with_index do |(patient, visits), index|
        visits.each_with_index do |encounter, visit_index|
          record_measurements!(practice:, actor:, patient:, encounter:,
            readings: readings_for(index:, visit_index:))
        end
      end
    end
    private_class_method :prepare_site!

    def self.record_measurements!(practice:, actor:, patient:, encounter:, readings:)
      vital_signs = Clinic::Care::VitalSigns
      observed_at = encounter.started_at + 10.minutes
      root = Clinic::Care::RecordObservation.call(
        practice:, actor:, patient:, request_key: "sandbox-chart-measurements-root-#{encounter.id}",
        attributes: { encounter:, code: vital_signs::ROOT_CODE, code_system: vital_signs::CODE_SYSTEM,
          code_version: vital_signs::DICTIONARY_VERSION, value_kind: "group", observed_at: }
      )
      pressure = Clinic::Care::RecordObservation.call(
        practice:, actor:, patient:, request_key: "sandbox-chart-measurements-pressure-#{encounter.id}",
        attributes: { encounter:, parent_observation: root, code: vital_signs::BLOOD_PRESSURE_CODE,
          code_system: vital_signs::CODE_SYSTEM, code_version: vital_signs::DICTIONARY_VERSION,
          value_kind: "group", observed_at: }
      )
      readings.each do |reading|
        parent = reading.fetch(:code).in?(vital_signs::BLOOD_PRESSURE_COMPONENTS) ? pressure : root
        Clinic::Care::RecordObservation.call(
          practice:, actor:, patient:,
          request_key: "sandbox-chart-measurements-#{encounter.id}-#{reading.fetch(:code)}",
          attributes: { encounter:, parent_observation: parent, **reading,
            code_system: vital_signs::CODE_SYSTEM, code_version: vital_signs::DICTIONARY_VERSION,
            value_kind: "numeric", observed_at: }
        )
      end
    end
    private_class_method :record_measurements!

    def self.readings_for(index:, visit_index:)
      weight = 62 + (index * 4) + visit_index * ((index % 3) - 1)
      systolic = 112 + (index % 9) * 2 + visit_index * (index % 2)
      diastolic = 68 + (index % 7) * 2 + visit_index * (index % 2)
      [
        { code: "vital-weight", numeric_value: weight.to_s, unit_code: "kg" },
        { code: "vital-systolic-bp", numeric_value: systolic.to_s, unit_code: "mm[Hg]" },
        { code: "vital-diastolic-bp", numeric_value: diastolic.to_s, unit_code: "mm[Hg]" }
      ]
    end
    private_class_method :readings_for
  end
end
