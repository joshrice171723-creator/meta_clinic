module Clinic
  class PracticeFeaturesController < ApiController
    before_action -> { require_capability_with_legacy("facilities.read", "appointments.book", any_site: true) }, only: :show
    before_action -> { require_capability_with_legacy("facilities.write", "appointments.write", any_site: true) }, only: :update

    def history
      site = feature_site(params[:site_id], current_fallback: false)
      Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
        action: "facilities.write", site:)
      versions = Clinic::PracticeFeatureVersion.for_practice(current_practice).where(site:)
        .order(revision: :desc).limit(26).to_a
      render json: {
        versions: versions.first(25).map { |version|
          version.optional_features.slice("clinic_type", "service_scope", "assessment_scope", "insurance_workflows")
            .merge(revision: version.revision, effective_from: version.effective_from.iso8601(6))
        },
        capped: versions.length > 25
      }
    end

    def show
      site = feature_site
      Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
        action: "facilities.read", site:) if site
      render json: { features: feature_snapshot(site:) }
    end

    def update
      input = parameter_hash!(
        :features,
        %i[insurance_workflows_enabled clinic_type expected_revision request_key finalize site_id],
        arrays: %i[service_scope assessment_scope]
      )
      raise ArgumentError, "insurance_workflows_enabled is required" unless input.key?(:insurance_workflows_enabled)
      raise ArgumentError, "clinic_type is required" unless input.key?(:clinic_type)
      raise ArgumentError, "service_scope is required" unless input.key?(:service_scope)
      raise ArgumentError, "assessment_scope is required" unless input.key?(:assessment_scope)
      raise ArgumentError, "expected_revision is required" unless input.key?(:expected_revision)
      features = Clinic::Configuration::PracticeFeatures.revise(
        practice: current_practice, site: feature_site(input[:site_id], current_fallback: false), actor: clinic_membership,
        request_key: input[:request_key], expected_revision: input[:expected_revision],
        insurance_workflows_enabled: input[:insurance_workflows_enabled],
        clinic_type: input[:clinic_type], service_scope: input[:service_scope],
        assessment_scope: input[:assessment_scope], finalize: input[:finalize] == true
      )
      render json: { features: features }
    end

    private

    def feature_site(site_id = params[:site_id], current_fallback: true)
      return current_clinic_site if site_id.blank? && current_fallback
      return if site_id.blank?

      current_practice.sites.find(requested_id!(site_id, :site_id))
    end

    def feature_snapshot(site:)
      Clinic::Configuration::PracticeFeatures.snapshot(practice: current_practice, site:)
    end
  end
end
