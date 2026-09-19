module Clinic
  module Care
    # Local, unscored information gathering. Requiredness describes presentation,
    # not clinical eligibility. Label sources support questions, never decisions.
    module WeightManagementQuestionnaire
      SCHEMA_VERSION = 3
      YES_NO = %w[yes no unsure].freeze
      FREQUENCY = %w[never rarely sometimes often daily unsure unknown].freeze
      WEIGHT_UNITS = %w[kg [lb_av]].freeze
      DOSE_UNITS = %w[mg mcg g mL tablet capsule patch syringe_units other unknown].freeze
      SOURCES = %w[patient_reported home_measured recalled clinic_measured imported unknown].freeze
      VERIFICATION = %w[unverified patient_confirmed staff_verified].freeze
      PRODUCTS = %w[wegovy_injection wegovy_tablet zepbound saxenda qsymia contrave xenical other unknown none_selected].freeze
      INCRETIN_PRODUCTS = %w[wegovy_injection wegovy_tablet zepbound saxenda].freeze
      CONDITIONS = %w[prediabetes diabetes_type_1 diabetes_type_2 diabetes_other dyslipidemia hypertension
        coronary_disease myocardial_infarction stroke heart_failure arrhythmia blood_clot hypothyroidism
        hyperthyroidism pcos menopause reflux constipation diarrhea inflammatory_bowel_disease gallbladder_disease
        pancreatitis fatty_liver liver_disease kidney_disease dialysis kidney_stones sleep_apnea asthma copd seizure
        migraine glaucoma diabetic_retinopathy cancer chronic_pain mobility_limitation osteoporosis other unknown].freeze
      # Published US labeling, accessed 2026-09-19. These are question provenance
      # snapshots for the coordinator, not a claim that a clinical checklist is approved.
      LABEL_SOURCES = {
        "wegovy" => { url: "https://www.novo-pi.com/wegovy.pdf", revision: "06/2026", sections: %w[1 4 5 7 8] },
        "zepbound" => { url: "https://pi.lilly.com/us/zepbound-uspi.pdf", revision: "08/2026", sections: %w[1 4 5 7 8] },
        "saxenda" => { url: "https://www.novo-pi.com/saxenda.pdf", revision: "02/2026", sections: %w[1 4 5 7 8] },
        "qsymia" => { url: "https://qsymia.com/patient/include/media/pdf/prescribing-information.pdf", revision: "03/2026", sections: %w[4 5 7 8] },
        "contrave" => { url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=485ff360-32c8-11df-928b-0002a5d5c51b&type=display", revision: "11/2025", sections: %w[4 5 7 8] },
        "xenical" => { url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=6240792b-9224-2d10-e053-2a91aa0a2c3e", revision: "07/2024", sections: %w[4 5 7 8] }
      }.transform_values { |source| source.merge(jurisdiction: "US", accessed_on: "2026-09-19").freeze }.freeze
      CHUNKS = {
        "today_visit" => %w[visit_reason symptoms goals changes],
        "patient_coordination" => %w[care_needs telehealth_location],
        "safety_history" => %w[medications allergies history family_history history_changes change_details],
        "prior_approaches" => %w[prior_approaches procedures barriers],
        "measurements" => %w[height weight],
        "reproductive_product_safety" => %w[treatment_product_class pregnancy_status pregnancy_plans breastfeeding_status contraception_context product_safety_review],
        "nutrition_support" => %w[nutrition_pattern beverage_pattern eating_concern nutrition_support mental_health_support substance_use_context instrument_status habits],
        "activity_sleep_barriers" => %w[activity_capacity activity_pattern sleep_quality transportation_access food_access caregiving_support social_support barrier_support_route],
        "records_consent_admin" => %w[outside_records_state lab_context_state treatment_consent_state telehealth_consent_state privacy_location_state coverage_context prior_authorization_state disclosure_state],
        "confirmation_clinician_review" => %w[patient_confirmation_state unresolved_item_state review_owner],
        "follow_up_change" => %w[follow_up_context change_since_last_visit treatment_response treatment_tolerability access_status support_status follow_up_plan_state next_contact_window follow_up_questions]
      }.freeze

      module_function

      def field(id, label, chunk, **options)
        category = case chunk
        when "reproductive_product_safety", "safety_history" then "safety"
        when "records_consent_admin", "measurements", "confirmation_clinician_review" then "evidence"
        when "nutrition_support", "activity_sleep_barriers", "prior_approaches" then "support"
        end
        category = "symptom" if %w[symptoms new_symptoms tolerability_details].include?(id)
        category = "medication" if %w[medications treatment_product current_treatment_use current_weight_treatment].include?(id)
        { id: id, label: label, chunk_id: chunk, input_type: "text", reusable: false,
          requiredness: "extended", purpose: "Record #{label.downcase} for discussion with the care team.",
          sensitive: false, question_version: SCHEMA_VERSION,
          review_category: category, review_values: %w[unknown] }.compact.merge(options)
      end

      def choice(id, label, chunk, choices = YES_NO, **options)
        review = choices & %w[yes unsure unknown needs_clarification clinical_review urgent_review clinician_review
          needs_support sometimes_limited unavailable limited cost_concern side_effects_reported stopped_due_to_effects worse]
        field(id, label, chunk, choices: choices, review_values: (review + ["unknown"]).uniq, **options)
      end

      def multi(id, label, chunk, choices, **options)
        choice(id, label, chunk, choices, input_type: "multiselect", **options)
      end

      # Numeric bounds are storage/physical-domain constraints, not treatment thresholds.
      def number(id, label, chunk, min: 0, max: 1_000_000, **options)
        field(id, label, chunk, input_type: "number", min: min, max: max, **options)
      end

      def date(id, label, chunk, future: false, **options)
        field(id, label, chunk, input_type: "date", allow_future: future, **options)
      end

      def records(id, label, chunk, children, **options)
        children = children.map { |child| child.merge(sensitive: true) } if options[:sensitive]
        field(id, label, chunk, record_fields: children, review_values: %w[answered unknown], **options)
      end

      def duration_fields(prefix, label, chunk)
        [number("#{prefix}_value", label, chunk, unit_field: "#{prefix}_unit"),
          choice("#{prefix}_unit", "#{label} unit", chunk, %w[days weeks months years])]
      end

      def quantity_fields(prefix, label, chunk, units = WEIGHT_UNITS)
        [number("#{prefix}_value", label, chunk, unit_field: "#{prefix}_unit"),
          choice("#{prefix}_unit", "#{label} unit", chunk, units)]
      end

      def measurement_fields(chunk, units = WEIGHT_UNITS)
        quantity_fields("measurement", "Measurement", chunk, units) + [
          date("measured_at", "Measurement date", chunk),
          choice("measurement_date_state", "Certainty of measurement date", chunk, %w[known approximate unknown]),
          choice("source", "Measurement source", chunk, SOURCES),
          choice("verification", "Verification of measurement", chunk, VERIFICATION),
          field("source_details", "Source or measurement method", chunk)
        ]
      end

      def history_extensions(kind, chunk)
        case kind
        when "treatment"
          [field("product_name", "Exact medicine or program", chunk), field("ingredient", "Ingredient", chunk),
            field("dose_text", "Dose as remembered or recorded", chunk), date("started_on", "Start date", chunk),
            date("ended_on", "End date", chunk), field("started_month", "Approximate start month", chunk, input_type: "month", allow_future: false),
            field("ended_month", "Approximate end month", chunk, input_type: "month", allow_future: false),
            multi("stop_reasons", "Reasons for stopping", chunk, %w[completed insufficient_benefit side_effects cost supply pregnancy_plans clinician_advice preference ongoing other unknown]),
            field("stop_reasons_other_detail", "Other reason for stopping", chunk, depends_on: "stop_reasons", depends_values: %w[other])] +
            quantity_fields("weight_lost", "Weight lost", chunk) + duration_fields("maintenance_duration", "Time weight loss was maintained", chunk)
        when "procedure"
          [field("facility", "Facility", chunk), field("surgeon", "Surgeon or treating clinician", chunk),
            field("procedure_type", "Procedure or reason for hospitalization", chunk)] +
            quantity_fields("weight_before", "Weight before procedure", chunk) + quantity_fields("lowest_weight_after", "Lowest weight afterward", chunk)
        when "condition"
          [choice("condition_code", "Specific reported diagnosis", chunk, CONDITIONS, code_system: "meta-clinic-reported-condition-v1"),
            field("treatment", "Current or previous treatment", chunk), field("complications", "Relevant complications", chunk)]
        when "symptom"
          [date("onset_date", "Onset date", chunk), field("onset_description", "Approximate onset", chunk),
            field("onset_at", "Onset date and time if known", chunk, input_type: "datetime-local", allow_future: false),
            choice("frequency", "Symptom frequency", chunk, FREQUENCY),
            choice("severity", "Patient-described severity", chunk, %w[mild moderate severe unsure unknown]),
            choice("happening_now", "Happening now", chunk),
            multi("impact", "Effect on eating, drinking or function", chunk, %w[eating drinking walking daily_activities sleep none unsure]),
            field("impact_details", "Effect on usual activities", chunk)]
        when "family"
          [choice("condition_code", "Relative's reported condition", chunk, CONDITIONS, code_system: "meta-clinic-reported-condition-v1"),
            field("relative_details", "Specific relative", chunk), number("age_at_diagnosis", "Age at diagnosis if known", chunk, max: 150),
            choice("thyroid_cancer_subtype", "Thyroid cancer type if relevant", chunk, %w[medullary papillary follicular anaplastic other unknown not_applicable])]
        when "medication"
          [field("product_id", "Clinic catalog product identifier", chunk, reference_kind: "clinic_medication_catalog", max_length: 100),
            field("ingredient", "Active ingredient", chunk), field("strength", "Strength as labeled", chunk),
            field("concentration", "Concentration as labeled, including units", chunk), field("formulation", "Formulation", chunk),
            choice("route", "Route", chunk, %w[oral subcutaneous intramuscular intravenous topical transdermal inhaled other unknown]),
            choice("device", "Presentation or device", chunk, %w[tablet capsule single_dose_pen multidose_pen prefilled_syringe single_dose_vial multidose_vial other unknown]),
            field("prescribed_dose_text", "Prescribed instructions exactly as labeled", chunk),
            field("actual_dose_text", "How the medicine is actually taken", chunk),
            number("prescribed_dose_value", "Prescribed dose amount", chunk, unit_field: "prescribed_dose_unit"),
            choice("prescribed_dose_unit", "Prescribed dose unit", chunk, DOSE_UNITS),
            choice("prescribed_frequency", "Prescribed frequency", chunk, %w[once_daily twice_daily three_times_daily weekly monthly as_needed other unknown]),
            field("reason", "Reason for taking", chunk), field("prescriber", "Prescriber", chunk),
            field("pharmacy", "Dispensing pharmacy and location", chunk),
            choice("medication_status", "Medication status", chunk, %w[current as_needed recently_stopped uncertain]),
            date("last_dose_date", "Last dose date", chunk), field("last_dose_time", "Last dose time if known", chunk, input_type: "time"),
            date("current_dose_started_on", "Date current dose began", chunk), number("missed_doses", "Missed doses since last visit", chunk, integer: true),
            date("gap_started_on", "Treatment gap started", chunk), date("gap_ended_on", "Treatment gap ended", chunk),
            field("gap_reason", "Reason for missed doses or gap", chunk),
            field("label_document_id", "Linked label document identifier", chunk, reference_kind: "document", max_length: 100)] +
            duration_fields("time_on_dose", "Time on current dose", chunk) + duration_fields("gap_duration", "Length of treatment gap", chunk)
        when "allergy"
          [field("reaction", "Specific reaction", chunk), field("reaction_product", "Exact substance or product", chunk),
            date("reaction_date", "Reaction date if known", chunk), field("treatment", "Treatment received for reaction", chunk)]
        else
          []
        end
      end

      def goal_fields
        chunk = "today_visit"
        measurements = "measurements"
        [multi("care_reasons", "Reasons for seeking care", chunk, %w[health mobility energy appearance clinician_recommendation other], requiredness: "core"),
          field("care_reasons_other_detail", "Other reason for seeking care", chunk, depends_on: "care_reasons", depends_values: %w[other]),
          multi("treatment_preferences", "Support or treatments you want to discuss", chunk, %w[nutrition activity medication surgical_referral unsure other]),
          choice("weight_goal_preference", "Do you have a specific weight goal?", chunk, %w[specific_goal no_specific_goal unsure]),
          records("desired_weight", "Desired weight (a personal expectation)", chunk,
            quantity_fields("weight", "Desired weight", chunk), depends_on: "weight_goal_preference", depends_values: %w[specific_goal], max_entries: 1),
          records("goal_timeline", "Desired timeline (not a promised outcome)", chunk, duration_fields("timeline", "Desired timeline", chunk), max_entries: 1),
          number("weight_concern_onset_age", "Approximate age when weight concerns began", measurements, max: 150),
          choice("weight_change_pattern", "Pattern of weight change", measurements, %w[gradual rapid loss_and_regain stable uncertain]),
          field("weight_change_context", "Weight-change context", measurements),
          records("historical_weights", "Historical weights", measurements,
            [choice("context", "Weight context", measurements, %w[highest_adult lowest_adult one_year_ago other]),
              number("age", "Approximate age", measurements, max: 150),
              field("approximate_month", "Approximate month", measurements, input_type: "month", allow_future: false),
              number("approximate_year", "Approximate year", measurements, min: 1, max: 9999, historical_year: true, integer: true),
              choice("pregnancy_context", "Pregnancy context at that time", measurements, %w[pregnant postpartum neither unknown not_applicable]),
              field("details", "Context or uncertainty", measurements)] + measurement_fields(measurements)),
          records("weight_gain_associations", "Events you associate with weight gain", measurements,
            [multi("events", "Reported associations", measurements, %w[medication_change pregnancy menopause shift_work illness injury stress smoking_cessation other unsure]),
              date("event_date", "Event date if known", measurements), field("approximate_month", "Approximate month", measurements, input_type: "month", allow_future: false),
              field("details", "Patient-described association", measurements)]),
          records("waist_measurements", "Waist circumference", measurements, measurement_fields(measurements, %w[cm [in_i]])),
          records("body_composition", "Body-composition measurement, if available", measurements,
            [choice("kind", "Measurement type", measurements, %w[body_fat_percent lean_mass fat_mass other]),
              field("method", "Method or device", measurements), field("details", "Other measurement description", measurements)] +
              measurement_fields(measurements, %w[% kg [lb_av]]))]
      end

      def encounter_location_fields
        chunk = "patient_coordination"
        [records("telehealth_physical_location", "Current physical location for this video visit", chunk,
          [field("street", "Street address", chunk), field("street_line_2", "Apartment, unit or other location detail", chunk),
            field("city", "City", chunk),
            choice("state", "State or U.S. territory", chunk, %w[AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI]),
            field("postal_code", "ZIP code", chunk, format: "us_postal", max_length: 10),
            choice("confirmation", "Does this describe where you are physically located for this visit?", chunk, %w[confirmed needs_correction unsure])],
          max_entries: 1, requiredness: "conditional", sensitive: true,
          purpose: "Record the patient's location for this encounter separately from the home address.")]
      end

      def reproductive_fields
        chunk = "reproductive_product_safety"
        [choice("treatment_product", "Exact product being taken or discussed", chunk, PRODUCTS, requiredness: "core"),
          field("treatment_product_other_detail", "Other product and formulation", chunk, depends_on: "treatment_product", depends_values: %w[other unknown]),
          records("pregnancy_plan_timing", "Pregnancy planning timeframe", chunk,
            [field("planned_month", "Planned month if known", chunk, input_type: "month"), field("details", "Timing or uncertainty", chunk)] +
              duration_fields("timeframe", "Approximate time from now", chunk), sensitive: true,
            depends_on: "pregnancy_plans", depends_values: %w[yes unsure unknown], max_entries: 1),
          multi("contraception_methods", "Contraception methods", chunk,
            %w[oral_hormonal patch ring injection implant hormonal_iud copper_iud barrier sterilization fertility_awareness none other unsure], sensitive: true),
          field("contraception_details", "Contraception details or questions", chunk, sensitive: true),
          choice("menstrual_context", "Menstrual or reproductive context", chunk,
            %w[regular_cycles irregular_cycles no_periods menopause hysterectomy other unsure not_applicable], sensitive: true),
          date("last_menstrual_period", "First day of last menstrual period if known", chunk, sensitive: true,
            depends_on: "menstrual_context", depends_values: %w[regular_cycles irregular_cycles no_periods other unsure]),
          field("reproductive_details", "Reproductive details for discussion", chunk, sensitive: true)]
      end

      def safety_question(id, label, products, source_ids, children = [])
        chunk = "reproductive_product_safety"
        source_metadata = source_ids.map { |key| LABEL_SOURCES.fetch(key).merge(id: key) }
        question = choice(id, label, chunk, YES_NO, requiredness: "conditional", sensitive: true,
          depends_on: "treatment_product", depends_values: products, sources: source_metadata,
          review_values: %w[yes unsure unknown],
          purpose: "Collect a product-specific fact for clinician review; this answer does not approve or exclude treatment.")
        details = records("#{id}_details", "Details: #{label}", chunk,
          children + [field("details", "Details or uncertainty", chunk, sensitive: true)], sensitive: true,
          requiredness: "conditional", depends_on: id, depends_values: %w[yes unsure unknown], sources: source_metadata)
        [question, details]
      end

      def safety_fields
        chunk = "reproductive_product_safety"
        incretin_sources = %w[wegovy zepbound saxenda]
        result = []
        %w[personal family].each do |subject|
          result.concat(safety_question("#{subject}_mtc", "#{subject.capitalize} history of medullary thyroid carcinoma?", INCRETIN_PRODUCTS, incretin_sources,
            [field("relative", "Affected person or relative", chunk), choice("certainty", "How certain is the reported subtype?", chunk, %w[confirmed_report uncertain unknown])]))
          result.concat(safety_question("#{subject}_thyroid_cancer", "#{subject.capitalize} history of thyroid cancer?", INCRETIN_PRODUCTS, incretin_sources,
            [choice("subtype", "Known thyroid cancer type", chunk, %w[medullary papillary follicular anaplastic other unknown]), field("relative", "Affected person or relative", chunk)]))
          result.concat(safety_question("#{subject}_men2", "#{subject.capitalize} history of multiple endocrine neoplasia type 2?", INCRETIN_PRODUCTS, incretin_sources,
            [field("relative", "Affected person or relative", chunk), choice("certainty", "Diagnosis certainty", chunk, %w[confirmed_report uncertain unknown])]))
        end
        result.concat(safety_question("product_serious_reaction", "Serious reaction to this product or an ingredient?", PRODUCTS - %w[unknown none_selected other], LABEL_SOURCES.keys,
          [field("product", "Exact product or ingredient", chunk), field("reaction", "Reaction", chunk), date("reaction_date", "Reaction date", chunk)]))
        {
          "gastroparesis" => "Diagnosed delayed stomach emptying or gastroparesis?",
          "severe_gastrointestinal" => "Severe stomach or bowel problems?",
          "pancreatitis_history" => "History of pancreatitis?",
          "gallbladder_history" => "History of gallstones or gallbladder disease?",
          "kidney_history" => "History of kidney problems?",
          "dehydration_concern" => "Current difficulty keeping fluids down or concern about dehydration?",
          "hypoglycemia_history" => "Episodes of low blood sugar?"
        }.each do |id, label|
          result.concat(safety_question(id, label, INCRETIN_PRODUCTS, incretin_sources,
            [choice("status", "Current or past", chunk, %w[current past both unknown]), date("onset_date", "Onset or diagnosis date", chunk),
              choice("severity", "Reported severity", chunk, %w[mild moderate severe unknown]), field("treatment", "Treatment received", chunk),
              field("current_symptoms", "Current symptoms", chunk)]))
        end
        result.concat(safety_question("heart_rate_symptoms", "Racing or pounding heartbeat while at rest?", %w[wegovy_injection wegovy_tablet saxenda], %w[wegovy saxenda],
          [date("onset_date", "Onset date", chunk), choice("happening_now", "Happening now", chunk)]))
        result.concat(safety_question("glucose_lowering_medicines", "Using insulin or other glucose-lowering medicines?", INCRETIN_PRODUCTS, incretin_sources,
          [field("product", "Medicine name", chunk), choice("medicine_type", "Medicine type if known", chunk, %w[insulin sulfonylurea other unknown])]))
        result.concat(safety_question("retinopathy_history", "History of diabetic eye disease or new vision changes?", %w[wegovy_injection wegovy_tablet zepbound], %w[wegovy zepbound],
          [field("diagnosis", "Diagnosis if known", chunk), field("symptoms", "Vision changes", chunk), field("eye_clinician", "Eye clinician", chunk)]))
        result.concat(safety_question("overlapping_products", "Taking another incretin or a product with the same active ingredient?", INCRETIN_PRODUCTS, incretin_sources,
          [field("product", "Exact product", chunk), field("ingredient", "Ingredient", chunk), date("last_dose_date", "Last dose date", chunk)]))
        result.concat(safety_question("planned_anesthesia", "Upcoming procedure involving anesthesia or deep sedation?", INCRETIN_PRODUCTS, incretin_sources,
          [field("procedure", "Procedure", chunk), date("procedure_date", "Planned procedure date", chunk, future: true), field("treating_team", "Treating team and contact", chunk)]))
        result.concat(safety_question("zepbound_oral_contraception", "Using an oral hormonal contraceptive?", %w[zepbound], %w[zepbound],
          [field("product", "Contraceptive product", chunk), date("treatment_started_on", "Zepbound start date", chunk), date("last_dose_change", "Most recent dose-change date", chunk)]))
        result.concat(safety_question("oral_medicine_absorption", "Taking oral medicines that require close monitoring?", INCRETIN_PRODUCTS, incretin_sources,
          [field("product", "Medicine name", chunk), field("monitoring", "Monitoring or timing instructions already given", chunk)]))
        {
          "qsymia_glaucoma" => "History of glaucoma?", "qsymia_hyperthyroidism" => "History of overactive thyroid?",
          "qsymia_maoi" => "Taking a monoamine oxidase inhibitor, or recently stopped one?"
        }.each do |id, label|
          result.concat(safety_question(id, label, %w[qsymia], %w[qsymia],
            [field("product_or_diagnosis", "Medicine or diagnosis", chunk), date("last_taken_on", "Last taken date if applicable", chunk)]))
        end
        {
          "qsymia_mood_changes" => "Mood, sleep, or memory changes to discuss?",
          "qsymia_eye_changes" => "Eye pain or new vision changes?",
          "qsymia_kidney_history" => "Kidney disease or kidney stones?",
          "qsymia_acidosis" => "History of metabolic acidosis?",
          "qsymia_seizures" => "History of seizures?"
        }.each do |id, label|
          result.concat(safety_question(id, label, %w[qsymia], %w[qsymia],
            [date("onset_date", "Onset or diagnosis date", chunk), field("treatment", "Treatment or current symptoms", chunk)]))
        end
        {
          "contrave_blood_pressure" => "Told your blood pressure is not controlled?",
          "contrave_seizures" => "History of seizures?", "contrave_anorexia" => "Current or past anorexia nervosa?",
          "contrave_bulimia" => "Current or past bulimia?", "contrave_opioids" => "Taking opioids, methadone, or buprenorphine?",
          "contrave_opioid_withdrawal" => "Current or recent opioid withdrawal?", "contrave_bupropion" => "Taking another bupropion-containing product?",
          "contrave_maoi" => "Taking a monoamine oxidase inhibitor, linezolid, or intravenous methylene blue, or recently stopped one?",
          "contrave_withdrawal" => "Recently stopped or sharply reduced alcohol, sedatives, or seizure medicines?"
        }.each do |id, label|
          result.concat(safety_question(id, label, %w[contrave], %w[contrave],
            [field("product_or_condition", "Product or condition", chunk), date("last_used_on", "Last use or change date", chunk), field("current_symptoms", "Current symptoms", chunk)]))
        end
        result.concat(safety_question("contrave_mood_history", "History of mania, bipolar disorder, or new mood changes?", %w[contrave], %w[contrave],
          [field("diagnosis", "Reported diagnosis", chunk), field("treatment", "Treatment or current changes", chunk)]))
        { "xenical_malabsorption" => "History of chronic difficulty absorbing food (malabsorption)?",
          "xenical_cholestasis" => "History of blocked or reduced bile flow (cholestasis)?" }.each do |id, label|
          result.concat(safety_question(id, label, %w[xenical], %w[xenical]))
        end
        {
          "xenical_cyclosporine" => "Taking cyclosporine?", "xenical_levothyroxine" => "Taking levothyroxine?",
          "xenical_warfarin" => "Taking warfarin or another anticoagulant?", "xenical_amiodarone" => "Taking amiodarone?",
          "xenical_seizure_medicines" => "Taking seizure medicines?", "xenical_hiv_medicines" => "Taking HIV medicines?",
          "xenical_liver_history" => "History of liver problems?", "xenical_kidney_stones" => "History of kidney problems or calcium oxalate stones?"
        }.each do |id, label|
          result.concat(safety_question(id, label, %w[xenical], %w[xenical],
            [field("product_or_condition", "Medicine or condition", chunk), field("treatment", "Treatment or monitoring", chunk)]))
        end
        result
      end

      def nutrition_fields
        chunk = "nutrition_support"
        meals = [choice("meal_type", "Meal or snack", chunk, %w[breakfast lunch dinner snack other]),
          field("time", "Time", chunk, input_type: "time"), field("food", "Food or drink", chunk),
          field("portion_description", "Approximate portion", chunk), number("amount", "Amount if known", chunk, unit_field: "unit"),
          choice("unit", "Amount unit", chunk, %w[g mL cup tablespoon teaspoon piece serving other]), field("unit_other_detail", "Other unit", chunk, depends_on: "unit", depends_values: %w[other])]
        [records("meal_records", "Typical meals and snacks", chunk, meals),
          records("food_recall", "Food and drink in the previous 24 hours", chunk, [date("date", "Date", chunk)] + meals, requiredness: "extended"),
          choice("recall_typical", "Was that a typical day?", chunk),
          number("meals_per_day", "Usual meals per day", chunk, max: 100, integer: true),
          number("snacks_per_day", "Usual snacks per day", chunk, max: 100, integer: true),
          choice("skipped_meal_frequency", "How often are meals skipped?", chunk, FREQUENCY),
          records("beverage_records", "Usual beverages", chunk,
            [choice("type", "Beverage type", chunk, %w[water sweetened_drink coffee tea milk juice alcohol other]), field("description", "Beverage description", chunk),
              number("amount", "Amount per serving", chunk, unit_field: "unit"), choice("unit", "Serving unit", chunk, %w[mL L [foz_us] cup]),
              number("servings", "Servings", chunk), choice("period", "Frequency period", chunk, %w[day week month])]),
          multi("dietary_patterns", "Dietary patterns or preferences", chunk, %w[vegetarian vegan low_carbohydrate mediterranean cultural_or_religious other none unsure]),
          field("dietary_pattern_details", "Preferences, culture or other dietary pattern", chunk),
          field("food_allergies", "Food allergies reported", chunk), field("food_intolerances", "Food intolerances reported", chunk),
          field("food_preferences", "Foods avoided by preference", chunk),
          records("dining_out", "Dining out or takeout", chunk, [number("count", "Number of times", chunk, integer: true),
            choice("period", "Frequency period", chunk, %w[day week month]), field("usual_choices", "Usual choices", chunk)], max_entries: 1),
          choice("early_hunger", "Hunger soon after meals", chunk, FREQUENCY),
          choice("fullness_awareness", "Difficulty recognizing fullness", chunk, FREQUENCY),
          multi("cravings", "Cravings", chunk, %w[sweet salty starchy fatty other none unsure]),
          field("craving_context", "Craving timing and triggers", chunk),
          choice("nutrient_tracking", "Do you already track calories or nutrients?", chunk, %w[tracked not_tracked unknown]),
          records("tracked_nutrients", "Nutrients already tracked (no estimates required)", chunk,
            [number("calories", "Calories per day", chunk, max: 100_000), number("protein_g", "Protein grams per day", chunk),
              number("carbohydrate_g", "Carbohydrate grams per day", chunk), number("fat_g", "Fat grams per day", chunk),
              number("fiber_g", "Fiber grams per day", chunk), field("tracking_source", "Tracking source", chunk)],
            depends_on: "nutrient_tracking", depends_values: %w[tracked], max_entries: 1),
          multi("food_preparation", "Who shops and cooks?", chunk, %w[self household caregiver prepared_food_service other]),
          number("preparation_minutes", "Time available to prepare a meal, in minutes", chunk, max: 1440),
          field("food_preparation_details", "Shopping and cooking arrangements", chunk)]
      end

      def behavior_fields
        chunk = "nutrition_support"
        result = [choice("emotional_eating", "Eating in response to emotions or stress", chunk, FREQUENCY, sensitive: true),
          field("emotional_eating_context", "Triggers and impact", chunk, sensitive: true),
          choice("loss_of_control_eating", "Episodes of feeling unable to control eating?", chunk, YES_NO, sensitive: true),
          records("loss_of_control_details", "Loss-of-control eating details", chunk,
            [choice("frequency", "Frequency", chunk, FREQUENCY), date("last_episode", "Most recent episode if known", chunk),
              choice("distress", "How upsetting is this?", chunk, %w[not_upsetting somewhat very unsure]), field("pattern", "Pattern and impact", chunk)] +
              duration_fields("duration", "How long this has happened", chunk), sensitive: true, depends_on: "loss_of_control_eating", depends_values: %w[yes unsure unknown]),
          choice("night_eating", "Waking from sleep to eat?", chunk, YES_NO, sensitive: true),
          records("night_eating_details", "Night-eating details", chunk,
            [choice("frequency", "Frequency", chunk, FREQUENCY), field("time", "Usual time", chunk, input_type: "time"),
              choice("awareness", "Awareness or recall of eating", chunk, %w[aware partly_aware no_recall unsure]), field("impact", "Impact", chunk)],
            sensitive: true, depends_on: "night_eating", depends_values: %w[yes unsure unknown]),
          multi("compensatory_behaviors", "Behaviors used to compensate for eating", chunk,
            %w[vomiting laxative_misuse diuretic_misuse fasting excessive_exercise none unsure], sensitive: true),
          records("compensatory_details", "Frequency and recency of compensatory behaviors", chunk,
            [choice("behavior", "Behavior", chunk, %w[vomiting laxative_misuse diuretic_misuse fasting excessive_exercise]),
              choice("frequency", "Frequency", chunk, FREQUENCY), date("most_recent", "Most recent occurrence", chunk), field("details", "Details or impact", chunk)],
            sensitive: true, depends_on: "compensatory_behaviors", depends_values: %w[vomiting laxative_misuse diuretic_misuse fasting excessive_exercise]),
          choice("eating_disorder_history", "Eating-disorder history", chunk, %w[current past unsure none], sensitive: true),
          records("eating_disorder_details", "Eating-disorder care history", chunk,
            [field("diagnosis", "Reported diagnosis", chunk), field("treatment", "Current or previous treatment", chunk), field("clinician", "Treating clinician", chunk)],
            sensitive: true, depends_on: "eating_disorder_history", depends_values: %w[current past unsure unknown]),
          records("mental_health_history", "Mental-health history", chunk,
            [choice("condition", "Reported condition", chunk, %w[depression anxiety bipolar_disorder ptsd other unknown]),
              choice("status", "Current or past", chunk, %w[current past both unknown]), field("treatment", "Treatment and medicines", chunk),
              field("clinician", "Treating clinician", chunk), field("hospitalizations", "Relevant hospitalizations", chunk)], sensitive: true),
          choice("nicotine_status", "Tobacco or nicotine use", chunk, %w[never former current unsure], sensitive: true),
          date("nicotine_quit_date", "Quit date if known", chunk, sensitive: true, depends_on: "nicotine_status", depends_values: %w[former]),
          records("substance_records", "Alcohol, nicotine and other substance use", chunk,
            [choice("type", "Substance category", chunk, %w[alcohol tobacco nicotine cannabis other]), field("product", "Product", chunk),
              choice("status", "Use", chunk, %w[current former never unsure]), number("amount", "Amount per occasion", chunk, unit_field: "unit"),
              choice("unit", "Amount unit", chunk, %w[standard_drink cigarette cigar pouch mL mg g other]), field("unit_other_detail", "Other unit", chunk, depends_on: "unit", depends_values: %w[other]),
              number("occasions", "Number of occasions", chunk), choice("period", "Frequency period", chunk, %w[day week month year]),
              date("last_used", "Last use date", chunk), field("details", "Details or support requested", chunk)], sensitive: true),
          choice("stress_level", "Current stress", chunk, %w[none mild moderate high overwhelming unsure], sensitive: true),
          field("stressors", "Stressors and available support", chunk, sensitive: true)]
        result
      end

      def activity_fields
        chunk = "activity_sleep_barriers"
        [records("activity_records", "Physical activity", chunk,
          [choice("type", "Activity type", chunk, %w[walking aerobic strength balance flexibility sport other]), field("description", "Activity", chunk),
            number("days_per_week", "Days per week", chunk, max: 7, integer: true), number("minutes_per_session", "Minutes per session", chunk, max: 1440)]),
          number("strength_days_per_week", "Strength training days per week", chunk, max: 7, integer: true),
          field("strength_description", "Strength training or functional concerns", chunk),
          choice("workday_activity", "Usual workday activity", chunk, %w[mostly_seated mixed physically_active other not_applicable]),
          multi("functional_limitations", "Limits on movement or daily activities", chunk, %w[pain fatigue mobility breathlessness balance other none unsure]),
          field("function_details", "Activities affected and assistance needed", chunk),
          number("sleep_hours_workday", "Hours of sleep on workdays", chunk, max: 24),
          number("sleep_hours_nonworkday", "Hours of sleep on nonworkdays", chunk, max: 24),
          field("bedtime", "Usual bedtime", chunk, input_type: "time"), field("wake_time", "Usual waking time", chunk, input_type: "time"),
          choice("shift_work", "Work schedule", chunk, %w[day evening night rotating other not_applicable]),
          choice("trouble_sleeping", "Difficulty sleeping", chunk, FREQUENCY),
          choice("unrefreshing_sleep", "Unrefreshing sleep", chunk, FREQUENCY),
          choice("daytime_sleepiness", "Daytime sleepiness", chunk, FREQUENCY),
          choice("snoring", "Snoring?", chunk), choice("observed_breathing_pauses", "Observed pauses in breathing during sleep?", chunk),
          choice("sleep_apnea_diagnosis", "Diagnosed sleep apnea?", chunk),
          records("sleep_apnea_details", "Sleep-apnea evaluation and treatment", chunk,
            [date("study_date", "Sleep-study date if known", chunk), field("study_source", "Sleep-study facility or source", chunk),
              choice("treatment", "Treatment", chunk, %w[pap oral_appliance surgery other none unsure]), field("treatment_details", "Treatment details", chunk),
              number("pap_nights_per_week", "Actual positive-airway-pressure use: nights per week", chunk, max: 7, integer: true,
                depends_on: "treatment", depends_values: %w[pap]),
              number("pap_hours_per_night", "Actual use: hours per night", chunk, max: 24, depends_on: "treatment", depends_values: %w[pap]),
              multi("pap_barriers", "Barriers to positive-airway-pressure use", chunk, %w[mask discomfort equipment cost supply other none unsure],
                depends_on: "treatment", depends_values: %w[pap])],
            depends_on: "sleep_apnea_diagnosis", depends_values: %w[yes unsure unknown]),
          choice("food_access_frequency", "Difficulty obtaining or affording suitable food", chunk, FREQUENCY, sensitive: true),
          multi("cooking_barriers", "Cooking or food storage constraints", chunk, %w[time stove refrigeration storage equipment assistance other none]),
          multi("participation_barriers", "Barriers to visits or participation", chunk, %w[work_schedule caregiving transportation housing language disability other none], sensitive: true),
          choice("visit_cost_barrier", "Concern about ongoing visit costs?", chunk, YES_NO, sensitive: true),
          choice("treatment_cost_barrier", "Concern about ongoing treatment costs?", chunk, YES_NO, sensitive: true),
          multi("portal_assistance", "Portal or telehealth assistance needed", chunk, %w[device internet navigation accessibility privacy interpreter other none]),
          multi("administration_concerns", "Concerns about using the selected product", chunk, %w[injection device vision dexterity swallowing storage instructions other none unsure],
            depends_on: "treatment_product", depends_values: PRODUCTS - %w[none_selected unknown]),
          field("administration_details", "Product or device assistance details", chunk,
            depends_on: "administration_concerns", depends_values: %w[injection device vision dexterity swallowing storage instructions other unsure]),
          multi("preferred_support", "Preferred support", chunk, %w[dietitian counseling group_support activity medication_education care_coordination financial other none unsure]),
          field("support_details", "Household support and practical needs", chunk, sensitive: true)]
      end

      def follow_up_fields
        chunk = "follow_up_change"
        [multi("follow_up_domains", "What needs updating since the last visit?", chunk,
          %w[goals symptoms diagnoses medications allergies family_history reproductive procedures nutrition behavior activity sleep barriers records none unsure], requiredness: "core"),
          field("goal_progress", "Progress toward your own goals", chunk, requiredness: "core"),
          choice("current_weight_treatment", "Currently taking a weight-management medicine?", chunk, YES_NO, requiredness: "core"),
          records("current_treatment_use", "Actual weight-management treatment use", chunk,
            [field("name", "Exact product", chunk)] + history_extensions("medication", chunk) +
              [number("dose_value", "Actual dose amount", chunk, positive: true, unit_field: "dose_unit"), choice("dose_unit", "Actual dose unit", chunk, DOSE_UNITS),
                choice("dose_certainty", "Actual dose certainty", chunk, %w[known unknown]),
                choice("source", "Medication information source", chunk, %w[patient_reported medication_list prescription_record supplement_label unknown]),
                choice("frequency", "Actual frequency", chunk, %w[once_daily twice_daily three_times_daily weekly monthly as_needed other unknown])],
            depends_on: "current_weight_treatment", depends_values: %w[yes unsure unknown], requiredness: "conditional"),
          choice("new_symptoms", "New symptoms or treatment effects?", chunk, YES_NO, requiredness: "core"),
          records("tolerability_details", "Symptoms and their effect on daily life", chunk,
            [field("symptom", "Symptom or treatment effect", chunk)] + history_extensions("symptom", chunk),
            depends_on: "new_symptoms", depends_values: %w[yes unsure unknown], requiredness: "conditional"),
          multi("intake_difficulties", "Difficulty eating or drinking", chunk, %w[poor_appetite nausea vomiting swallowing food_access fluid_access other none unsure]),
          records("hydration", "Usual fluid intake if known", chunk,
            [number("amount", "Fluid amount per day", chunk, unit_field: "unit"), choice("unit", "Fluid unit", chunk, %w[mL L [foz_us] cup]),
              field("details", "Hydration difficulties", chunk)], max_entries: 1),
          choice("strength_function_change", "Change in strength or daily function", chunk, %w[improved unchanged worse unsure]),
          field("strength_function_details", "Strength or function changes", chunk, depends_on: "strength_function_change", depends_values: %w[improved worse unsure unknown]),
          multi("treatment_access_problems", "Treatment access problems", chunk, %w[cost supply pharmacy device administration appointments other none unsure]),
          field("follow_up_support_needs", "Support needed before the next visit", chunk)]
      end

      def fields(base, follow_up: false)
        result = base.map do |original|
          chunk = CHUNKS.find { |_id, ids| ids.include?(original[:id]) }&.first || "today_visit"
          item = field(original[:id], original[:label], chunk, **original.except(:id, :label))
          item[:requiredness] = "core" if %w[visit_reason symptoms medications allergies history goals height weight].include?(item[:id])
          item[:sensitive] = true if %w[pregnancy_status pregnancy_plans breastfeeding_status contraception_context eating_concern mental_health_support substance_use_context].include?(item[:id])
          item[:record_fields] = history_extensions(item[:history_kind], chunk) if item[:history_kind]
          item[:review_values] = %w[answered unknown] if item[:history_kind]
          if item[:units]
            item.merge!(input_type: "number", min: 0, max: 1_000_000, positive: true,
              source_choices: SOURCES, verification_choices: VERIFICATION)
          end
          # Retain old context fields for stored-answer compatibility, never as proof.
          if item[:id] == "product_safety_review"
            item.merge!(depends_on: "treatment_product", depends_values: PRODUCTS - %w[none_selected], requiredness: "clinician")
          end
          item
        end
        result.concat(encounter_location_fields + goal_fields + reproductive_fields + safety_fields + nutrition_fields + behavior_fields + activity_fields + follow_up_fields)
        unless result.any? { |item| item[:id] == "habits" }
          result << field("habits", "Eating, activity or sleep questions for the care team", "nutrition_support")
        end
        if follow_up
          result.concat([
            field("changes", "What has changed since your last visit?", "today_visit"),
            choice("history_changes", "Have medicines, allergies or health history changed?", "safety_history", %w[yes no unknown declined]),
            field("change_details", "Details of health changes", "safety_history", depends_on: "history_changes", depends_values: %w[yes unknown])])
          domains = {
            "today_visit" => "goals", "patient_coordination" => "barriers", "prior_approaches" => "procedures",
            "measurements" => "goals", "nutrition_support" => "nutrition", "activity_sleep_barriers" => "activity",
            "records_consent_admin" => "records"
          }
          result = result.map do |item|
            next item if item[:depends_on] || %w[weight goals changes treatment_product care_needs barriers follow_up_questions telehealth_physical_location].include?(item[:id])
            domain = { "symptoms" => "symptoms", "medications" => "medications", "allergies" => "allergies",
              "history" => "diagnoses", "family_history" => "family_history", "procedures" => "procedures",
              "pregnancy_status" => "reproductive", "pregnancy_plans" => "reproductive", "breastfeeding_status" => "reproductive",
              "contraception_context" => "reproductive", "contraception_methods" => "reproductive", "contraception_details" => "reproductive",
              "menstrual_context" => "reproductive", "reproductive_details" => "reproductive" }[item[:id]] || domains[item[:chunk_id]]
            next item unless domain
            # A domain update opens its related detail; recursive visibility also
            # keeps children of a disabled question disabled.
            extra = case item[:chunk_id]
            when "nutrition_support" then %w[nutrition behavior]
            when "activity_sleep_barriers" then %w[activity sleep barriers]
            else []
            end
            item.merge(depends_on: "follow_up_domains", depends_values: ([domain, "unsure"] + extra).uniq, requiredness: "conditional")
          end
        else
          followup_ids = follow_up_fields.map { |item| item[:id] }
          result = result.map do |item|
            if (item[:chunk_id] == "follow_up_change" || followup_ids.include?(item[:id])) && item[:id] != "follow_up_context" && !item[:depends_on]
              item.merge(depends_on: "follow_up_context", depends_values: %w[follow_up maintenance transition], requiredness: "conditional")
            else
              item
            end
          end
        end
        result.map do |item|
          item = item.merge(record_fields: record_companion_fields(item[:record_fields])) if item[:record_fields]
          deep_freeze(item)
        end.freeze
      end

      # The generic record editor writes flat <field_id>_unit and
      # <field_id>_other_detail keys; expose each in the same one-level schema.
      def record_companion_fields(definitions)
        ids = definitions.map { |item| item[:id] }
        definitions.flat_map do |item|
          companions = []
          if item[:choices]&.include?("other") && !ids.include?("#{item[:id]}_other_detail")
            companions << field("#{item[:id]}_other_detail", "#{item[:label]}: other detail", item[:chunk_id],
              sensitive: item[:sensitive], depends_on: item[:id], depends_values: %w[other])
          end
          if item[:units]&.any? && !ids.include?("#{item[:id]}_unit")
            companions << choice("#{item[:id]}_unit", "#{item[:label]} unit", item[:chunk_id], item[:units])
            item = item.merge(unit_field: "#{item[:id]}_unit")
          end
          [item] + companions
        end
      end

      def deep_freeze(value)
        value.each { |key, item| deep_freeze(key); deep_freeze(item) } if value.is_a?(Hash)
        value.each { |item| deep_freeze(item) } if value.is_a?(Array)
        value.freeze
      end
    end
  end
end
