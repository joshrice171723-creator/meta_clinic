module Clinic
  module Inventory
    class NdcCatalog
      def initialize(practice:, actor:)
        @practice = practice
        @actor = actor
      end

      def search(query)
        Access.with(@practice.id, @actor, "catalog") { }
        # Finish the authorization transaction before making a bounded network request.
        Integrations::Fda::NdcDirectory.search(query).map do |record|
          [ record, verifier.generate({ "practice_id" => @practice.id, "user_id" => @actor.id, "attributes" => record.stringify_keys }, expires_in: 20.minutes, purpose: "ndc_import") ]
        end
      end

      def import(token)
        Access.with(@practice.id, @actor, "catalog") do
          reference = verifier.verified(token.to_s, purpose: "ndc_import")
          unless reference && reference["practice_id"] == @practice.id && reference["user_id"] == @actor.id
            raise ArgumentError, "This FDA result expired or changed. Search again."
          end
          attributes = reference.fetch("attributes")
          products = PharmacyProduct.where(practice_id: @practice.id)
          products.find_or_create_by!(ndc: attributes.fetch("ndc")) do |product|
            product.assign_attributes(attributes.merge(sku: "NDC-#{attributes.fetch('ndc')}", source: "openfda", imported_at: Time.current))
          end
        end
      end

      private

      def verifier
        Rails.application.message_verifier("pharmacy_ndc_reference")
      end
    end
  end
end
