module Clinic
  module MembershipGrowth
    class StorefrontConfiguration
      SLUG_PATTERN = /\A[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])\z/

      def self.call(practice:, actor:, slug_provided:, slug:, enabled_provided:, enabled:)
        Clinic::Authorization.authorize!(practice: practice, actor: actor, action: "subscription_catalog.publish")

        ApplicationRecord.transaction do
          practice.lock!
          attributes = {}
          requested_enabled = enabled_provided ? boolean(enabled) : practice.membership_storefront_enabled
          if slug_provided && !(slug.to_s.strip.empty? && !requested_enabled)
            attributes[:public_membership_slug] = normalize_slug(slug)
          end
          attributes[:membership_storefront_enabled] = requested_enabled if enabled_provided
          raise ArgumentError, "Provide a storefront setting to update." if attributes.empty?

          practice.update!(attributes)
          Clinic::AuditRecorder.record!(
            practice: practice,
            actor: actor,
            action_code: "membership_storefront.update",
            outcome: :committed,
            resource_version_ref: "practice:#{practice.id}"
          )
          practice
        end
      end

      def self.normalize_slug(value)
        slug = value.to_s.strip.downcase.gsub(/[^a-z0-9]+/, "-").gsub(/\A-+|-+\z/, "")
        unless SLUG_PATTERN.match?(slug)
          raise ArgumentError, "Storefront slug must be 3 to 80 lowercase letters, numbers, or single hyphens."
        end

        slug
      end

      def self.boolean(value)
        case value
        when true, "true" then true
        when false, "false" then false
        else raise ArgumentError, "Storefront enabled must be true or false."
        end
      end
      private_class_method :normalize_slug, :boolean
    end
  end
end
