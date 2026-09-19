module Development
  class DemoSpecialtyLessons
    TYPES = {
      "primary_care" => "Primary care",
      "weight_management" => "Weight management"
    }.freeze
    WORKFLOWS = {
      "appointment_schedule" => ["Schedule a follow-up", "Schedule", "front_desk"],
      "visit_save" => ["Document a follow-up", "Patients", "clinical_team"],
      "visit_complete" => ["Complete a follow-up visit", "Patients", "clinical_team"],
      "membership_publish" => ["Publish a care membership", "Subscriptions", "administrator"]
    }.freeze

    def self.definitions
      TYPES.flat_map do |type, label|
        WORKFLOWS.map do |workflow, (title, section, role)|
          { id: "#{type}__#{workflow}", title: "#{label}: #{title.downcase}",
            description: description(type, workflow), section:, role:, template_key: type,
            clinic_type: type, prepared: ["Cash-based #{label.downcase} clinic", *(workflow == "membership_publish" ? ["Membership storefront", "Service catalog"] : ["Sample patient", "Specialty visit scenario"])] }
        end
      end
    end

    def self.base_key(key) = key.to_s.split("__").last
    def self.specialty?(key) = key.to_s.include?("__") && TYPES.key?(key.to_s.split("__").first)
    def self.description(type, workflow)
      return "Create and publish a cash-based #{TYPES.fetch(type).downcase} membership." if workflow == "membership_publish"
      return "Book the prepared patient for a #{TYPES.fetch(type).downcase} follow-up." if workflow == "appointment_schedule"
      context = type == "weight_management" ? "weight history, patient goals, progress and follow-up" : "current concerns, interval history, assessment and follow-up"
      "Use the prepared #{TYPES.fetch(type).downcase} scenario to practice #{context}."
    end

    def self.template_id(run)
      run.template_key == "weight_management" ? "weight-management-follow-up" : "primary-care-follow-up"
    end

    def self.scenario(run)
      if run.template_key == "weight_management"
        { subjective: "Alex returns to discuss progress toward a self-selected activity goal. Ask about weight history, eating and activity patterns, barriers, and preferences.",
          objective: "Record only measurements available in this sample visit. No examination findings have been supplied.",
          assessment: "Summarize progress and unresolved questions for clinician review.",
          plan: "Document the patient's chosen next step and follow-up arrangement. No medication or dose is proposed in this scenario." }
      else
        { subjective: "Alex returns for a routine primary care follow-up and wants to discuss changes in daily energy and sleep. Clarify the concern and interval history.",
          objective: "Record only findings available in this sample visit. No examination findings have been supplied.",
          assessment: "Summarize the concern and the questions that remain for clinician review.",
          plan: "Document the agreed next steps, patient instructions, and follow-up arrangement." }
      end
    end
  end
end
