module Clinic
  class PharmacyController < BaseController
    layout "pharmacy"
    before_action -> { require_capability(:inventory_access?) }
    rate_limit to: 12, within: 1.minute, by: -> { current_user.id }, only: :lookup,
      with: -> { render_error("Too many FDA searches. Wait a minute before trying again.", :too_many_requests) }
    rescue_from ArgumentError, ActiveRecord::RecordInvalid do |error|
      message = error.is_a?(ActiveRecord::RecordInvalid) ? error.record.errors.full_messages.to_sentence : error.message
      redirect_to clinic_pharmacy_index_path, status: :see_other, alert: message
    end

    def index
      @view = %w[dashboard inventory movements alerts suppliers].include?(params[:view]) ? params[:view] : "dashboard"
      @view = "inventory" if params[:q].present? || params[:filter].present?
      @products = products.includes(batches: :movements).order(:name).to_a
      @batches = batches.includes(:product, :movements).order(:expires_on).to_a
      @low_stock = @products.select(&:low_stock?)
      @attention = @batches.select { |batch| batch.quantity.positive? && (!batch.available? || batch.expiring?) }
      @available = @products.sum(&:available_quantity)
      @held = @batches.reject(&:available?).sum(&:quantity)
      @expiring = @batches.select(&:expiring?)
      @alert_count = @low_stock.length + @attention.length
      @movements = PharmacyMovement.where(practice_id: current_practice.id).includes(batch: :product).order(id: :desc).limit(30)
      @query = params[:q].to_s.strip.first(100)
      @filter = %w[low_stock expiring held].include?(params[:filter]) ? params[:filter] : "all"
      @filtered = @products.select do |product|
        matches = [ product.name, product.generic_name, product.sku, product.ndc, product.labeler ].join(" ").downcase.include?(@query.downcase)
        matches && case @filter
                   when "low_stock" then product.low_stock?
                   when "expiring" then product.batches.any?(&:expiring?)
                   when "held" then product.batches.any? { |batch| batch.quantity.positive? && !batch.available? }
                   else true
                   end
      end
    end

    def new
      @product = products.new
    end

    def lookup
      @product = products.new
      @ndc_query = params[:ndc_query].to_s.strip
      @results = ::Pharmacy::NdcDirectory.search(@ndc_query).map do |record|
        [ record, verifier.generate({ "practice_id" => current_practice.id, "user_id" => current_user.id, "attributes" => record.stringify_keys }, expires_in: 20.minutes, purpose: "ndc_import") ]
      end
      render :new
    rescue ArgumentError, ::Pharmacy::NdcDirectory::Unavailable => error
      flash.now[:alert] = error.message.presence || "The FDA directory is unavailable. Try again later."
      render :new, status: :unprocessable_entity
    end

    def import
      reference = verifier.verified(params[:reference_token].to_s, purpose: "ndc_import")
      raise ArgumentError, "This FDA result expired or changed. Search again." unless reference && reference["practice_id"] == current_practice.id && reference["user_id"] == current_user.id
      attributes = reference.fetch("attributes")
      product = products.find_by(ndc: attributes.fetch("ndc"))
      product ||= products.create!(attributes.merge(sku: "NDC-#{attributes.fetch('ndc')}", source: "openfda", imported_at: Time.current))
      redirect_to clinic_pharmacy_path(product), status: :see_other, notice: "Package added to your reference catalog. No stock was received. Verify the physical package before use."
    end

    def create
      @product = products.new(params.require(:clinic_pharmacy_product).permit(:name, :generic_name, :ingredients, :dosage_form, :package_description, :sku, :reorder_point))
      if @product.save
        redirect_to clinic_pharmacy_path(@product), status: :see_other, notice: "Manual catalog product created. Receive a fictional batch to add stock."
      else
        flash.now[:alert] = @product.errors.full_messages.to_sentence
        render :new, status: :unprocessable_entity
      end
    end

    def show
      @product = products.includes(batches: [ :movements, :events ]).find(params[:id])
    end

    def update
      product = products.find(params[:id])
      product.update!(params.require(:clinic_pharmacy_product).permit(:reorder_point, :active))
      redirect_to clinic_pharmacy_path(product), status: :see_other, notice: "Catalog settings saved. Stock history is preserved."
    end

    def receive
      product = products.find(params[:id])
      attributes = params.require(:batch).permit(:lot_number, :expires_on, :location, :supplier).to_h
      existing = PharmacyMovement.find_by(practice_id: current_practice.id, request_key: params[:request_key])
      PharmacyBatch.transaction do
        batch = if existing
          existing.batch.tap do |record|
            same = record.product_id == product.id && attributes.all? { |key, value| record.public_send(key).to_s == value }
            raise ArgumentError, "This receipt form was already used. Reload and try again." unless same
          end
        else
          product.batches.create!(attributes.merge(practice_id: current_practice.id))
        end
        batch.move!(kind: "receipt", amount: params[:amount], reason: params[:reason], actor: current_user, request_key: params[:request_key])
      end
      redirect_to clinic_pharmacy_path(product), status: :see_other, notice: "Fictional batch and receipt saved together."
    end

    def movement
      batch = batches.find(params[:id])
      batch.move!(kind: params[:kind], amount: params[:amount], reason: params[:reason], actor: current_user, request_key: params[:request_key])
      redirect_to clinic_pharmacy_path(batch.product), status: :see_other, notice: "Movement recorded. Earlier history was preserved."
    end

    def batch_status
      batch = batches.find(params[:id])
      batch.change_status!(status: params[:status], reason: params[:reason], actor: current_user, request_key: params[:request_key])
      redirect_to clinic_pharmacy_path(batch.product), status: :see_other, notice: "Batch status and review history saved. Package count is unchanged."
    end

    def demo
      return render_error("Fictional examples are only available in the local demo.", :forbidden) unless development_demo?
      current_practice.with_lock do
        if products.none?
          [ [ "Example tablets", 6, 10, 14 ], [ "Example capsules", 24, 8, 180 ], [ "Example solution", 4, 2, -2 ] ].each_with_index do |(name, count, reorder, days), index|
            product = products.create!(name: name, sku: "SYNTHETIC-#{index + 1}", source: "synthetic", reorder_point: reorder, package_description: "Fictional sealed package — not a medication")
            batch = product.batches.create!(practice_id: current_practice.id, lot_number: "DEMO-LOT-#{index + 1}", location: "Test stockroom", supplier: "Fictional supplier", expires_on: Date.current + days)
            batch.move!(kind: "receipt", amount: count, reason: "Synthetic walkthrough opening stock", actor: current_user, request_key: SecureRandom.uuid)
          end
        end
      end
      redirect_to clinic_pharmacy_index_path, status: :see_other, notice: "Fictional examples are ready. No real inventory was imported."
    end

    private

    def products
      PharmacyProduct.where(practice_id: current_practice.id)
    end

    def batches
      PharmacyBatch.where(practice_id: current_practice.id)
    end

    def verifier
      Rails.application.message_verifier("pharmacy_ndc_reference")
    end
  end
end
