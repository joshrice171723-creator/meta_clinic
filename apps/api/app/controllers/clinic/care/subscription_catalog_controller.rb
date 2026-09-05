module Clinic
  module Care
    class SubscriptionCatalogController < Clinic::BaseController
      rescue_from ArgumentError do |error|
        render json: { error: error.message }, status: :unprocessable_entity
      end
      rescue_from ActiveRecord::StaleObjectError do
        render json: { error: "This package changed. Reload before saving or publishing." }, status: :conflict
      end

      def index
        require_capability("subscription_catalog.read")
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user, action_code: "subscription_catalog.read", outcome: :released)
        ability = Ability.new(current_user, practice: current_practice)
        render json: {
          families: SubscriptionFamily.where(practice: current_practice).order(:name).map { |r| r.attributes.slice("id", "name", "description", "retired") },
          services: ServiceOption.where(practice: current_practice).order(:name).map { |r| r.attributes.slice("id", "name", "description", "retired") },
          packages: SubscriptionPackage.where(practice: current_practice).order(:name).map { |r| r.attributes.slice("id", "name", "family_id", "draft", "lock_version", "retired", "published_version_id") },
          capabilities: { write: ability.allowed_permission?("subscription_catalog.write"), publish: ability.allowed_permission?("subscription_catalog.publish") }
        }
      end

      def save
        input = params.require(:item).permit(:name, :description, :family_id, :lock_version, draft: {}).to_h
        record = SubscriptionCatalog.save(practice: current_practice, actor: current_user, kind: params[:kind], attributes: input, id: params[:id])
        render json: { id: record.id }, status: :ok
      end

      def preview
        require_capability("subscription_catalog.read")
        package = SubscriptionPackage.where(practice: current_practice).find(params[:id])
        render json: { id: nil, number: nil, terms: SubscriptionDefinition.build(package) }
      end

      def publish
        version = SubscriptionCatalog.publish(practice: current_practice, actor: current_user, id: params[:id], request_key: params[:request_key], lock_version: params[:lock_version])
        render json: { id: version.id, number: version.number, terms: version.snapshot }
      end

      def retire
        record = SubscriptionCatalog.retire(practice: current_practice, actor: current_user, kind: params[:kind], id: params[:id], reason: params[:reason])
        render json: { id: record.id, retired: record.retired }
      end
    end
  end
end
