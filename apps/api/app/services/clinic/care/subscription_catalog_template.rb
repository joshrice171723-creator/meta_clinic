module Clinic
  module Care
    class SubscriptionCatalogTemplate
      TEMPLATES = {
        "weight_loss" => {
          services: {
            initial: { name: "Weight-management initial visit", description: "Initial visit service for a clinic-defined weight-management program." },
            follow_up: { name: "Weight-management follow-up", description: "Follow-up visit service for a clinic-defined weight-management program." },
            nutrition: { name: "Nutrition coaching session", description: "A coaching session for clinic-defined nutrition goals and follow-through." },
            progress: { name: "Metabolic progress review", description: "A review of recorded progress, questions, and the next clinic-defined step." }
          },
          programs: [
            {
              name: "Weight management",
              description: "An editable demo program for ongoing weight-management visits and support.",
              display_order: 10,
              packages: [
                {
                  name: "Essential membership", tier: "Essential", amount: "99.00", display_order: 10,
                  description: "A simple starting point with an initial visit and one follow-up each month.",
                  components: [ [ :initial, 1, "term" ], [ :follow_up, 1, "month" ] ]
                },
                {
                  name: "Weight management membership", tier: "Complete", amount: "149.00", display_order: 20,
                  description: "A monthly demo membership with an initial visit and ongoing follow-up support.",
                  components: [ [ :initial, 1, "term" ], [ :follow_up, 1, "month" ], [ :nutrition, 1, "term" ] ]
                },
                {
                  name: "Comprehensive membership", tier: "Comprehensive", amount: "219.00", display_order: 30,
                  description: "A broader monthly option with additional follow-up and nutrition coaching.",
                  components: [ [ :initial, 1, "term" ], [ :follow_up, 2, "month" ], [ :nutrition, 1, "month" ] ]
                }
              ]
            },
            {
              name: "Metabolic health",
              description: "An editable demo program for progress reviews, coaching, and coordinated follow-through.",
              display_order: 20,
              packages: [
                {
                  name: "Metabolic essentials", tier: "Essential", amount: "129.00", display_order: 10,
                  description: "A monthly progress review with a weight-management follow-up.",
                  components: [ [ :progress, 1, "month" ], [ :follow_up, 1, "month" ] ]
                },
                {
                  name: "Metabolic support", tier: "Complete", amount: "189.00", display_order: 20,
                  description: "Monthly progress review, follow-up, and nutrition coaching.",
                  components: [ [ :progress, 1, "month" ], [ :follow_up, 1, "month" ], [ :nutrition, 1, "month" ] ]
                },
                {
                  name: "Metabolic comprehensive", tier: "Comprehensive", amount: "259.00", display_order: 30,
                  description: "A fuller demo option with two follow-ups plus monthly coaching and progress review.",
                  components: [ [ :initial, 1, "term" ], [ :progress, 1, "month" ], [ :follow_up, 2, "month" ], [ :nutrition, 1, "month" ] ]
                }
              ]
            }
          ]
        }
      }.freeze

      def self.apply(practice:, actor:, site: nil)
        Clinic::Authorization.authorize!(practice: practice, actor: actor, action: "subscription_catalog.write")
        Clinic::Authorization.authorize!(practice: practice, actor: actor, action: "subscription_catalog.write", site: site) if site
        ApplicationRecord.transaction do
          practice.with_lock do
            features = Clinic::Configuration::PracticeFeatures.snapshot(practice: practice, site:)
            unless Configuration::StarterProfile.ready?(site, features)
              raise ArgumentError, "Select a location with finalized specialty setup before applying a plan template."
            end
            clinic_type = features.fetch(:clinic_type)
            template = TEMPLATES[clinic_type]
            raise ArgumentError, "No demo plans are available for the selected clinic type." unless template

            created = []
            services = create_services(practice:, actor:, definitions: template.fetch(:services), created:)
            programs = template.fetch(:programs).map do |definition|
              create_program(practice:, actor:, definition:, services:, created:)
            end

            package_ids = programs.flat_map { |program| program.fetch(:packages).map(&:id) }
            Clinic::AuditRecorder.record!(practice: practice, actor: actor, action_code: "subscription_catalog.template.apply",
              outcome: :committed, resource_version_ref: "package:#{package_ids.last}")
            { clinic_type:, program_ids: programs.map { |program| program.fetch(:family).id }, service_ids: services.values.map(&:id),
              package_ids:, created_count: created.length }
          end
        end
      end

      def self.create_services(practice:, actor:, definitions:, created:)
        definitions.to_h do |key, attributes|
          service = ServiceOption.where(practice:, name: attributes.fetch(:name)).first
          raise ArgumentError, "A matching demo service is retired." if service&.retired?
          unless service
            service = SubscriptionCatalog.save(practice:, actor:, kind: "service", attributes: attributes.stringify_keys)
            created << "service"
          end
          [ key, service ]
        end
      end
      private_class_method :create_services

      def self.create_program(practice:, actor:, definition:, services:, created:)
        family = SubscriptionFamily.where(practice:, name: definition.fetch(:name)).first
        raise ArgumentError, "A matching demo program is retired." if family&.retired?
        unless family
          family = SubscriptionCatalog.save(practice:, actor:, kind: "family",
            attributes: definition.except(:packages).stringify_keys)
          created << "program"
        end

        packages = definition.fetch(:packages).map do |package_definition|
          create_package(practice:, actor:, family:, definition: package_definition, services:, created:)
        end
        { family:, packages: }
      end
      private_class_method :create_program

      def self.create_package(practice:, actor:, family:, definition:, services:, created:)
        package = SubscriptionPackage.where(practice:, family:, name: definition.fetch(:name)).first
        raise ArgumentError, "A matching demo tier is retired." if package&.retired?
        return package if package

        components = definition.fetch(:components).map do |service_key, quantity, frequency|
          component(services.fetch(service_key), quantity:, frequency:)
        end
        draft = definition.except(:name, :components).stringify_keys.merge(
          "currency" => "USD", "duration" => 1, "duration_unit" => "months", "renewal" => "manual",
          "cancellation" => "end_of_term", "refund_policy" => "manual_review",
          "terms" => "One month of the selected demo membership. Renewal is manual. Services are scheduled through the clinic. Refund requests require clinic review.",
          "eligibility_review" => false, "max_per_patient" => 1, "components" => components
        )
        package = SubscriptionCatalog.save(practice:, actor:, kind: "package",
          attributes: { "name" => definition.fetch(:name), "family_id" => family.id, "draft" => draft })
        created << "tier"
        package
      end
      private_class_method :create_package

      def self.component(service, quantity:, frequency:)
        { "service_id" => service.id, "mode" => "included", "group" => "", "min" => 0, "max" => 100,
          "quantity" => quantity, "frequency" => frequency, "price_adjustment" => "0", "eligibility_review" => false }
      end
      private_class_method :component
    end
  end
end
