module Clinic
  class OfferingTextBatchesController < ApiController
    def catalog
      render json: owner.catalog.merge(context: context)
    end

    def index
      rows = owner.scope.order(id: :desc).limit(26).to_a
      render json: { context: context, capped: rows.length > 25, batches: rows.first(25).map { |batch|
        value = owner.projection(batch)
        value.slice(:request_key, :created_at, :source, :complete).merge(counts: value[:items].group_by { |item| item["status"] }.transform_values(&:length))
      } }
    end

    def show
      render json: owner.projection(owner.scope.find_by!(request_key: params[:id]))
    end

    def create
      raise ArgumentError, "Choose a reviewed batch smaller than 1 MB." if request.raw_post.bytesize > 1_000_000
      input = params.require(:batch).to_unsafe_h
      require_context!(input["context"])
      render json: owner.projection(owner.create(input))
    end

    def change
      require_context!(params.require(:context).to_unsafe_h)
      index = bounded_integer!(params[:item], field: :item, min: 0, max: 499)
      render json: owner.projection(owner.change(params[:id], index, params[:operation].to_s))
    end

    private

    def context
      { "actor_id" => current_user.id, "actor_membership_id" => clinic_membership.id,
        "practice_id" => current_practice.id, "site_id" => selected_site_id,
        "authorization_generation" => clinic_membership.authorization_generation }
    end

    def selected_site_id
      return nil if session[:clinic_site_id].blank?
      site = current_clinic_site
      raise Clinic::Authorization::Denied unless site
      site.id
    end

    def require_context!(expected)
      raise Clinic::Authorization::Denied unless expected == context
    end

    def owner
      @owner ||= Clinic::Configuration::OfferingTextBatches.new(practice: current_practice,
        actor: current_user, membership: clinic_membership, site_id: selected_site_id)
    end
  end
end
