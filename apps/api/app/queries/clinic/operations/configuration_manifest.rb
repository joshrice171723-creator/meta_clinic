module Clinic
  module Operations
    class ConfigurationManifest
      FORMAT = 1

      def self.call(practice:, actor:)
        ability = Ability.new(actor, practice:)
        raise Clinic::Authorization::Denied unless ability.practice_scope_for?("facilities.write")

        configuration = {
          practice: {
            id: practice.id, name: practice.name, timezone: practice.timezone,
            public_page_headline: practice.public_page_headline,
            public_page_intro: practice.public_page_intro,
              public_page_accent: practice.public_page_accent,
              public_page_logo_present: practice.public_page_logo_data.present?,
            features: feature_summary(Clinic::Configuration::PracticeFeatures.snapshot(practice:))
          },
          sites: practice.sites.order(:id).map do |site|
            {
              id: site.id, code: site.code, name: site.name, timezone_override: site.timezone_override,
              features: feature_summary(Clinic::Configuration::PracticeFeatures.snapshot(practice:, site:))
            }
          end,
          service_offerings: practice.service_offerings.includes(:sites).order(:id).map do |offering|
            {
              id: offering.id, code: offering.code, name: offering.name, status: offering.status,
              public_visible: offering.public_visible, visit_type_id: offering.visit_type_id,
              duration_minutes: offering.duration_minutes, modality: offering.modality,
              booking_required: offering.booking_required, requires_room: offering.requires_room,
              site_ids: offering.sites.map(&:id).sort
            }
          end
        }

        {
          format: FORMAT, purpose: "Human review of current clinic configuration; not an import file",
          generated_at: Current.business_time.iso8601(6),
          source_digest: Digest::SHA256.hexdigest(JSON.generate(configuration)),
          configuration:
        }
      end

      def self.feature_summary(snapshot)
        snapshot.slice(:revision, :site_revision, :effective_from, :configured, :finalized,
          :clinic_type, :service_scope, :assessment_scope, :insurance_workflows_enabled)
      end
      private_class_method :feature_summary
    end
  end
end
