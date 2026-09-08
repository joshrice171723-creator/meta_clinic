module Clinic
  module Inventory
    class GudidCatalog
      def initialize(practice:, actor:)
        @practice = practice
        @actor = actor
      end

      def lookup(identifier)
        Access.with(@practice.id, @actor, "catalog") { }
        record = Integrations::Fda::Gudid.lookup(identifier)
        return unless record

        [ record, verifier.generate({ "practice_id" => @practice.id, "user_id" => @actor.id, "attributes" => record.stringify_keys }, expires_in: 20.minutes, purpose: "gudid_import") ]
      end

      def import(token, operational_attributes: {})
        Access.with(@practice.id, @actor, "catalog") do
          reference = verifier.verified(token.to_s, purpose: "gudid_import")
          unless reference && reference["practice_id"] == @practice.id && reference["user_id"] == @actor.id
            raise ArgumentError, "This FDA device result expired or changed. Search again."
          end

          attributes = reference.fetch("attributes")
          product = PharmacyProduct.where(practice_id: @practice.id).find_or_initialize_by(device_identifier: attributes.fetch("device_identifier"))
          if product.new_record?
            product.assign_attributes(
              {
                "source" => "gudid",
                "imported_at" => Time.current,
                "labeler" => attributes["company_name"],
                "device_identifier" => attributes.fetch("device_identifier"),
                "package_description" => attributes["device_description"]
              }.merge(operational_attributes.stringify_keys)
            )
            product.save!
          end
          product
        end
      end

      private

      def verifier
        Rails.application.message_verifier("pharmacy_gudid_reference")
      end
    end
  end
end
