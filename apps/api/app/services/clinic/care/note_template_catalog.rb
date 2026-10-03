module Clinic
  module Care
    module NoteTemplateCatalog
      SOURCE_URL = "https://www.timeofcare.com/physical-exam-template-adult-12-years-and-older/".freeze
      BEHAVIORAL_HEALTH = {
          id: "behavioral-health-progress", version: 1, label: "Behavioral health progress note", note_kind: "soap",
          source_label: "Meta Clinic behavioral-health documentation prompts",
          source_url: "https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleId=56937&ver=43",
          caution: "Ordinary clinical progress note, not separately maintained psychotherapy notes. Prompts do not establish findings, a completed assessment or a safety protocol.",
          sections: {
            subjective: "Patient priorities and interval changes:\nSymptoms and impact on daily functioning:\nPatient-reported response, barriers and support:\nMedication, allergy and relevant history changes:",
            objective: "Encounter modality and participants:\nActual session start, end and duration (not scheduled duration):\nObserved mental-status findings; identify what was not assessed:\nAssessment instrument, version, response source and results, if administered:",
            assessment: "Clinical assessment and rationale:\nProgress against the identified care plan and goal revision:\nSafety assessment findings, limitations and clinician judgment (unknown is not negative):",
            plan: "Interventions delivered and patient response:\nAgreed next steps and patient instructions:\nSafety actions and escalation under the clinic's selected protocol, when applicable:\nUnfinished work, responsible team and follow-up arrangement:"
          }.freeze
        }.freeze
      TEMPLATES = [
        {
          id: "scribe-reviewed-soap",
          version: 1,
          label: "Reviewed Scribe SOAP note",
          note_kind: "soap",
          source_label: "Meta Clinic Scribe clinician-reviewed draft",
          source_url: "",
          caution: "Review every section before saving or signing this note.",
          sections: {
            subjective: "",
            objective: "",
            assessment: "",
            plan: ""
          }.freeze
        }.freeze,
        {
          id: "adult-physical-exam-detailed",
          version: 1,
          label: "Adult physical exam (12+), detailed",
          note_kind: "soap",
          source_label: "Time of Care adult physical exam template",
          source_url: SOURCE_URL,
          caution: "Starter text only. Confirm every statement before saving; applying this template does not record that an examination occurred.",
          sections: {
            subjective: "",
            objective: <<~TEXT.strip,
              Vitals: Reviewed.
              Weight/BMI: Reviewed.
              General: Well appearing and in no acute distress.
              Psychiatric: Alert and oriented. Judgment, memory, mood, and affect appear appropriate.
              Head: Normocephalic and atraumatic.
              Eyes: Pupils equal, round, and reactive to light; extraocular movements intact. No discharge or redness.
              Ears: External ears and tympanic membranes appear normal.
              Nose: Nares appear normal.
              Mouth/throat: Mucous membranes moist. Gums, mucosa, palate, and dentition appear normal.
              Neck: Supple; no masses noted.
              Cardiovascular: Regular rate and rhythm; no murmur, rub, or gallop noted.
              Lungs: Clear to auscultation bilaterally; no wheeze, rale, or crackle noted.
              Abdomen: Soft, non-tender, and non-distended; bowel sounds present. No mass or organomegaly noted.
              Genitourinary: Not assessed.
              Skin: Warm and well perfused; no rash or abnormal lesion noted.
              Musculoskeletal: No deformity or scoliosis noted; gait appears normal.
              Extremities: No clubbing, cyanosis, or edema noted.
              Neurologic: Ambulates without limitation. Strength and tone appear normal; no focal deficit noted.
            TEXT
            assessment: "",
            plan: ""
          }.freeze
        }.freeze,
        {
          id: "primary-care-follow-up", version: 1, label: "Primary care follow-up", note_kind: "soap",
          source_label: "Meta Clinic documentation prompts", source_url: "",
          caution: "Prompts only. Replace with the visit's documented findings and clinician decisions.",
          sections: {
            subjective: "Current concern and interval history:\nMedication and allergy changes:\nPatient priorities:",
            objective: "Available measurements and examination findings:\nRelevant results:",
            assessment: "Problems addressed and clinical assessment:",
            plan: "Agreed next steps:\nPatient instructions:\nFollow-up:"
          }.freeze
        }.freeze,
        {
          id: "weight-management-follow-up", version: 1, label: "Weight management follow-up", note_kind: "soap",
          source_label: "Meta Clinic prompts informed by NIDDK weight-management guidance",
          source_url: "https://www.niddk.nih.gov/health-information/professionals/clinical-tools-patient-management/weight-management/talking-with-your-patients-about-weight",
          caution: "Prompts only. Document available evidence and clinician decisions; no treatment or dose is implied.",
          sections: {
            subjective: "Patient goals and preferences:\nWeight history and interval progress:\nEating, activity, sleep and barriers:\nCurrent treatment experience, if applicable:",
            objective: "Available weight and other measurements, with dates and units:\nRelevant findings and results:",
            assessment: "Progress toward goals and individualized assessment:",
            plan: "Shared next steps:\nSupport and monitoring:\nFollow-up:"
          }.freeze
        }.freeze
      ].push(BEHAVIORAL_HEALTH).freeze

      def self.all
        TEMPLATES
      end

      def self.available(practice:, site: nil)
        features = Configuration::PracticeFeatures.snapshot(practice:, site:)
        TEMPLATES.select do |template|
          specialty = { "behavioral-health-progress" => "behavioral_health",
            "weight-management-follow-up" => "weight_loss" }[template[:id]]
          !specialty || (Configuration::StarterProfile.ready?(site, features) && features[:clinic_type] == specialty)
        end
      end

      def self.require_available!(practice:, encounter:, template_id:, template_version:)
        return if available(practice:, site: encounter.site).any? do |template|
          template[:id] == template_id && template[:version] == template_version
        end

        raise ArgumentError, "This note template is unavailable for the encounter's location. Review its specialty and setup before starting a new note."
      end

      def self.fetch!(id, version)
        template = TEMPLATES.find { |candidate| candidate[:id] == id && candidate[:version] == version.to_i }
        raise ArgumentError, "Choose an available note template." unless template

        template
      end
    end
  end
end
