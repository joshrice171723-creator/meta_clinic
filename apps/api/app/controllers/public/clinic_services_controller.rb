module Public
  class ClinicServicesController < ApplicationController
    before_action -> { response.headers["Cache-Control"] = "no-store" }

    def show
      slug = params[:slug].to_s
      raise ActiveRecord::RecordNotFound unless Clinic::MembershipGrowth::StorefrontConfiguration::SLUG_PATTERN.match?(slug)

      practice = Clinic::Practice.find_by!(public_membership_slug: slug)
      raise ActiveRecord::RecordNotFound unless Clinic::DeploymentAccess.practice_enabled?(practice.id)

      offerings = practice.service_offerings.where(status: "published", public_visible: true).order(:name, :id)
      raise ActiveRecord::RecordNotFound unless offerings.exists?

      render json: {
        practice: { name: practice.name, slug: slug },
        membership_path: practice.membership_storefront_enabled? ? "/memberships/#{slug}" : nil,
        services: offerings.map { |offering|
          { name: offering.name, description: offering.description, duration_minutes: offering.duration_minutes, modality: offering.modality }
        }
      }
    end
  end
end
