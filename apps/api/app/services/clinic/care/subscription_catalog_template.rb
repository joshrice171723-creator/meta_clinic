module Clinic
  module Care
    class SubscriptionCatalogTemplate
      TEMPLATES = {
        "weight_loss" => {
          family: {
            name: "Weight management",
            description: "A clinic-defined program for ongoing weight-management visits and support. Set the services, cadence, pricing, and terms that fit your clinic."
          },
          services: [
            { name: "Weight-management initial visit", description: "Initial visit service for a clinic-defined weight-management program." },
            { name: "Weight-management follow-up", description: "Follow-up visit service for a clinic-defined weight-management program." }
          ],
          package: {
            name: "Weight management membership",
            description: "A monthly demo membership with an initial visit and ongoing follow-up support.",
            tier: "Demo",
            amount: "149.00",
            currency: "USD",
            duration: 1,
            duration_unit: "months",
            renewal: "manual",
            cancellation: "end_of_term",
            refund_policy: "manual_review",
            terms: "One month of weight-management membership services. Renewal is manual. Services are scheduled through the clinic. Refund requests require clinic review.",
            eligibility_review: false,
            max_per_patient: 1,
            display_order: 0
          }
        }
      }.freeze

      def self.apply(practice:, actor:)
        Clinic::Authorization.authorize!(practice: practice, actor: actor, action: "subscription_catalog.write")
        ApplicationRecord.transaction do
          practice.with_lock do
            clinic_type = Clinic::Configuration::PracticeFeatures.snapshot(practice: practice).fetch(:clinic_type)
            template = TEMPLATES[clinic_type]
            raise ArgumentError, "No membership starter is available for the selected clinic type." unless template

            created = []
            family = SubscriptionFamily.where(practice: practice, name: template.fetch(:family).fetch(:name)).first
            raise ArgumentError, "The matching membership program is retired." if family&.retired?
            unless family
              family = SubscriptionCatalog.save(practice: practice, actor: actor, kind: "family", attributes: template.fetch(:family).stringify_keys)
              created << "program"
            end

            services = template.fetch(:services).map do |attributes|
              service = ServiceOption.where(practice: practice, name: attributes.fetch(:name)).first
              raise ArgumentError, "A matching membership service is retired." if service&.retired?
              unless service
                service = SubscriptionCatalog.save(practice: practice, actor: actor, kind: "service", attributes: attributes.stringify_keys)
                created << "service"
              end
              service
            end

            package_attributes = template.fetch(:package)
            package = SubscriptionPackage.where(practice: practice, family: family,
              name: package_attributes.fetch(:name)).first
            raise ArgumentError, "The matching membership tier is retired." if package&.retired?
            unless package
              draft = package_attributes.except(:name).stringify_keys.merge("components" => [
                component(services.fetch(0), quantity: 1, frequency: "term"),
                component(services.fetch(1), quantity: 1, frequency: "month")
              ])
              package = SubscriptionCatalog.save(practice: practice, actor: actor, kind: "package",
                attributes: { "name" => package_attributes.fetch(:name), "family_id" => family.id, "draft" => draft })
              created << "tier"
            end

            Clinic::AuditRecorder.record!(practice: practice, actor: actor, action_code: "subscription_catalog.template.apply",
              outcome: :committed, resource_version_ref: "package:#{package.id}")
            { clinic_type: clinic_type, program_id: family.id, service_ids: services.map(&:id), package_id: package.id,
              created_count: created.length }
          end
        end
      end

      def self.component(service, quantity:, frequency:)
        { "service_id" => service.id, "mode" => "included", "group" => "", "min" => 0, "max" => 100,
          "quantity" => quantity, "frequency" => frequency, "price_adjustment" => "0", "eligibility_review" => false }
      end
      private_class_method :component
    end
  end
end
