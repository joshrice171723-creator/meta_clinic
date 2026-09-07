module Clinic
  class BillingServicesController < Clinic::ApiController
    before_action :require_catalog_read, only: :index
    before_action -> { require_capability("billing.catalog.manage") }, only: %i[create update]

    def index
      relation = current_practice.billing_services
      relation = relation.where(active: boolean_param(params[:active], field: :active)) if params.key?(:active)
      query = query_param
      if query.present?
        pattern = "%#{ActiveRecord::Base.sanitize_sql_like(query)}%"
        relation = relation.where("name ILIKE :pattern OR code ILIKE :pattern OR description ILIKE :pattern", pattern: pattern)
      end
      page = page_param
      per_page = per_page_param
      total = relation.count
      services = relation.order(:name, :id).offset((page - 1) * per_page).limit(per_page)
      Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
        action_code: "billing.catalog.read", outcome: :released)
      render json: {
        services: services.map { |service| BillingServiceSerializer.call(service) },
        pagination: { page: page, per_page: per_page, total: total },
        can_manage: current_ability.allowed_permission?("billing.catalog.manage", any_site: true)
      }
    end

    def create
      input = parameter_hash!(:service, %i[request_key name code description unit_amount currency active])
      attributes = {
        name: required_string!(input[:name], field: :name, maximum: 160),
        code: optional_string(input[:code], field: :code, maximum: 50),
        description: optional_string(input[:description], field: :description, maximum: 500),
        unit_amount: decimal_string!(input[:unit_amount], field: :unit_amount),
        currency: required_string!(input[:currency], field: :currency, maximum: 3)
      }
      attributes[:active] = boolean_param(input[:active], field: :active) if input.key?(:active)
      result = Billing::ManageBillingService.create(
        practice: current_practice,
        actor: current_user,
        request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
        attributes: attributes
      )
      render json: { service: BillingServiceSerializer.call(result.service), replayed: result.replayed },
        status: result.replayed ? :ok : :created
    end

    def update
      input = parameter_hash!(:service, %i[request_key lock_version name code description unit_amount currency active])
      attributes = {}
      attributes[:name] = required_string!(input[:name], field: :name, maximum: 160) if input.key?(:name)
      attributes[:code] = optional_string(input[:code], field: :code, maximum: 50) if input.key?(:code)
      attributes[:description] = optional_string(input[:description], field: :description, maximum: 500) if input.key?(:description)
      attributes[:unit_amount] = decimal_string!(input[:unit_amount], field: :unit_amount) if input.key?(:unit_amount)
      attributes[:currency] = required_string!(input[:currency], field: :currency, maximum: 3) if input.key?(:currency)
      attributes[:active] = boolean_param(input[:active], field: :active) if input.key?(:active)
      service = current_practice.billing_services.find(requested_id!(params[:id], :id))
      result = Billing::ManageBillingService.update(
        practice: current_practice,
        actor: current_user,
        service: service,
        request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
        lock_version: bounded_integer!(input[:lock_version], field: :lock_version, min: 0, max: 2_147_483_647),
        attributes: attributes
      )
      render json: { service: BillingServiceSerializer.call(result.service), replayed: result.replayed }
    end

    private

    def require_catalog_read
      return require_capability("billing.catalog.manage") if current_ability.allowed_permission?("billing.catalog.manage", any_site: true)
      return require_capability("billing.read") if current_ability.allowed_permission?("billing.read", any_site: true)

      require_capability_with_legacy("billing.invoice_draft", "billing.write")
    end
  end
end
