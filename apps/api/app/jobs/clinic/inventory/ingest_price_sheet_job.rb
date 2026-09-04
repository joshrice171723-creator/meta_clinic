class Clinic::Inventory::IngestPriceSheetJob < ApplicationJob
  queue_as :default

  def perform(practice_id:, supplier_id:, actor_id:, path:)
    practice = Clinic::Practice.find(practice_id)
    supplier = Clinic::Inventory::Supplier.where(practice_id: practice.id).find(supplier_id)
    actor = User.find(actor_id)
    result = Clinic::Inventory::IngestPriceSheet.call(practice:, supplier:, actor:, path:)
    Rails.logger.info("inventory_supplier_price_sheet_job_complete practice_id=#{practice.id} supplier_id=#{supplier.id} imported=#{result.fetch(:imported)}")
    result
  rescue StandardError => error
    Rails.logger.error("inventory_supplier_price_sheet_job_failed practice_id=#{practice_id} supplier_id=#{supplier_id} error=#{error.class}:#{error.message}")
    raise
  end
end
