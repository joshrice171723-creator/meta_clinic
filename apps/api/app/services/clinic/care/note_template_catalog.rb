module Clinic
  module Care
    module NoteTemplateCatalog
      SOURCE_URL = "https://www.timeofcare.com/physical-exam-template-adult-12-years-and-older/".freeze
      TEMPLATES = [
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
        }.freeze
      ].freeze

      def self.all
        TEMPLATES
      end

      def self.fetch!(id, version)
        template = TEMPLATES.find { |candidate| candidate[:id] == id && candidate[:version] == version.to_i }
        raise ArgumentError, "Choose an available note template." unless template

        template
      end
    end
  end
end
