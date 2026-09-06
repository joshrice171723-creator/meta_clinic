module Development
  class SubscriptionExamples
    def self.seed!(practice:, actor:)
      return unless Rails.env.development?

      women = family(practice, "Dev seed Women's Wellness")
      men = family(practice, "Dev seed Men's Wellness")
      services = {
        planning: service(practice, "Wellness planning visit", "A structured visit to set personal goals and a follow-up plan."),
        nutrition: service(practice, "Nutrition coaching session", "A practical session for meal planning and everyday habits."),
        sleep: service(practice, "Sleep and stress coaching", "A coaching session focused on sustainable routines and stress management."),
        movement: service(practice, "Movement planning session", "A personalized planning session for safe, sustainable activity."),
        heart: service(practice, "Heart health review", "A general wellness review of habits and questions to discuss with a clinician."),
        mens_health: service(practice, "Men's wellness review", "A general wellness conversation and follow-up planning session."),
        metabolic: service(practice, "Metabolic wellness coaching", "A practical coaching session for nutrition, movement and routine building."),
        resilience: service(practice, "Resilience coaching session", "A structured conversation about routines, recovery and sustainable goals.")
      }

      create_package(practice, actor, women, "Essential Membership", "A simple starting point for building a consistent wellness routine.", "89.00", [
        component(services[:planning], "included", quantity: 1, frequency: "term"),
        component(services[:nutrition], "optional", price_adjustment: "35.00", quantity: 1, frequency: "term")
      ])
      create_package(practice, actor, women, "Complete Membership", "A balanced monthly plan with coaching and a follow-up touchpoint.", "149.00", [
        component(services[:planning], "included", quantity: 1, frequency: "term"),
        component(services[:nutrition], "included", quantity: 1, frequency: "month"),
        component(services[:sleep], "included", quantity: 1, frequency: "term"),
        component(services[:movement], "optional", price_adjustment: "25.00", quantity: 1, frequency: "term")
      ])
      create_package(practice, actor, women, "Plus Membership", "A broader plan for members who want more choice each term.", "219.00", [
        component(services[:planning], "included", quantity: 1, frequency: "term"),
        component(services[:nutrition], "included", quantity: 1, frequency: "month"),
        component(services[:sleep], "included", quantity: 1, frequency: "month"),
        component(services[:movement], "choose_one", group: "Choose one focus session", quantity: 1, frequency: "term"),
        component(services[:heart], "choose_one", group: "Choose one focus session", quantity: 1, frequency: "term")
      ])

      create_package(practice, actor, men, "Essential Membership", "A practical starting point for steady, sustainable wellness habits.", "89.00", [
        component(services[:planning], "included", quantity: 1, frequency: "term"),
        component(services[:mens_health], "optional", price_adjustment: "35.00", quantity: 1, frequency: "term")
      ])
      create_package(practice, actor, men, "Complete Membership", "A balanced plan with monthly coaching and a flexible focus session.", "149.00", [
        component(services[:planning], "included", quantity: 1, frequency: "term"),
        component(services[:metabolic], "included", quantity: 1, frequency: "month"),
        component(services[:resilience], "included", quantity: 1, frequency: "term"),
        component(services[:mens_health], "optional", price_adjustment: "25.00", quantity: 1, frequency: "term")
      ])
      create_package(practice, actor, men, "Plus Membership", "A broader plan with monthly coaching and a choice of focus session.", "219.00", [
        component(services[:planning], "included", quantity: 1, frequency: "term"),
        component(services[:metabolic], "included", quantity: 1, frequency: "month"),
        component(services[:resilience], "included", quantity: 1, frequency: "month"),
        component(services[:mens_health], "choose_one", group: "Choose one focus session", quantity: 1, frequency: "term"),
        component(services[:movement], "choose_one", group: "Choose one focus session", quantity: 1, frequency: "term")
      ])
    end

    def self.family(practice, name)
      Clinic::Care::SubscriptionFamily.find_or_create_by!(practice: practice, name: name) do |record|
        record.description = "Synthetic example catalog for learning the subscription editor."
      end
    end

    def self.service(practice, name, description)
      Clinic::Care::ServiceOption.find_or_create_by!(practice: practice, name: name) { |record| record.description = description }
    end

    def self.component(service, mode, group: "", quantity:, frequency:, price_adjustment: "0")
      { service_id: service.id, mode: mode, group: group, min: mode == "choose_one" ? 1 : 0, max: mode == "choose_one" ? 1 : 100,
        quantity: quantity, frequency: frequency, price_adjustment: price_adjustment, eligibility_review: false }
    end

    def self.create_package(practice, actor, family, name, description, amount, components)
      package = Clinic::Care::SubscriptionPackage.find_or_create_by!(practice: practice, family: family, name: name) do |record|
        record.draft = { description: description, amount: amount, currency: "USD", duration: 1, duration_unit: "months", renewal: "manual",
                         cancellation: "end_of_term", refund_policy: "manual_review", terms: "One month of #{name.downcase}. Services are scheduled through the clinic. Renewal is manual and refunds require clinic review.",
                         max_per_patient: 1, eligibility_review: false, components: components }
      end
      return package if package.published_version_id

      Clinic::Care::SubscriptionCatalog.publish(practice: practice, actor: actor, id: package.id,
        request_key: "development-examples-#{package.id}", lock_version: package.lock_version)
    end

    private_class_method :family, :service, :component, :create_package
  end
end
