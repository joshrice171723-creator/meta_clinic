module Clinic
  module Care
    # Unscored patient-reported context, not a diagnostic or safety instrument.
    # Clinical observations, diagnoses and interventions belong in the chart.
    module BehavioralHealthQuestionnaire
      CHUNKS = [
        { id: "today_visit", label: "Today’s concerns and functioning", description: "Record the patient’s concerns, daily functioning and goals." },
        { id: "safety_history", label: "Relevant history", description: "Record medicines, allergies and relevant prior care without inferring absent findings." },
        { id: "patient_coordination", label: "Support and care needs", description: "Record communication needs, sleep, support and barriers." },
        { id: "follow_up_change", label: "Changes and follow-up", description: "Record current changes and response; prior answers are not newly confirmed." }
      ].freeze

      module_function

      def fields(shared, follow_up: false)
        reused = %w[visit_reason goals medications allergies care_needs]
        reused += %w[treatment_response support_status follow_up_questions] if follow_up
        selected = shared.select { |field| reused.include?(field[:id]) }.map(&:dup)
        selected + [
          field("bh_symptom_course", "Current concerns and how they have changed", "today_visit"),
          field("bh_functioning", "Effect on daily activities, work and relationships", "today_visit"),
          field("bh_history", follow_up ? "Relevant health or treatment changes" : "Relevant medical and behavioral-health history", "safety_history"),
          field("bh_prior_care", follow_up ? "Care received since the last visit" : "Previous care and what helped or did not help", "safety_history"),
          field("bh_sleep", "Sleep concerns", "patient_coordination"),
          field("bh_support", "Support available and barriers to care", "patient_coordination"),
          field("bh_substance_context", "Alcohol or other substance use to discuss with the care team", "patient_coordination", sensitive: true),
          field("bh_questions", "Questions and priorities for the next step", "follow_up_change")
        ]
      end

      def field(id, label, chunk_id, sensitive: false)
        { id:, label:, chunk_id:, input_type: "text", reusable: false,
          question_version: 1, requiredness: "extended", sensitive:,
          purpose: "Patient-reported context for discussion with the care team." }
      end
    end
  end
end
