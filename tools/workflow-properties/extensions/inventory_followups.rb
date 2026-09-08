class WorkflowPropertyCase
  def office_supply_contract(input)
    quantity = input.fetch('quantity')
    item = @practice.items.create!(name: 'Property paper', sku: 'PROP-PAPER', quantity: 0, reorder_level: 0)
    item.adjust!(delta: quantity*2, reason: 'Property opening stock', actor: @actor, request_key: SecureRandom.uuid)
    mode = input.fetch('mode')
    values = {delta: -quantity, reason: 'Property supply use', actor: @actor, request_key: SecureRandom.uuid}
    values[:delta] = -(quantity*3) if mode == 'overdraw'
    values[:reason] = '' if mode == 'missing_reason'
    error = nil
    same = nil
    begin
      first = item.adjust!(**values)
      same = item.adjust!(**values).id == first.id if mode == 'retry'
    rescue ArgumentError, ActiveRecord::RecordInvalid => e
      error = e.message
    end
    {error: error, same: same, quantity: item.reload.quantity, movements: item.stock_movements.count}
  end

  def reorder_point_contract(input)
    grant_permissions!(@membership, 'inventory.catalog')
    batch, = inventory_fixture
    product = batch.product
    prior = product.reorder_point
    error = nil
    begin
      product.update_catalog!({reorder_point: input.fetch('value')}, actor: @actor)
    rescue ActiveRecord::RecordInvalid => e
      error = e.message
    end
    {error: error, prior: prior, current: product.reload.reorder_point, quantity: batch.reload.quantity.to_s('F'), orders: @practice.inventory_purchase_orders.count}
  end

  def exception_review_contract(input)
    grant_permissions!(@membership, 'inventory.catalog')
    batch, = inventory_fixture
    batch.product.update_catalog!({active: false}, actor: @actor)
    values = {practice: @practice, actor: @actor, source_kind: 'batch', source_id: batch.id, category: 'inactive_product', assignee_id: nil,
      state: 'reviewed', reason: 'Property exception review', evidence_reference: 'Property evidence', request_key: SecureRandom.uuid}
    error = nil
    if input['mode'] == 'missing_reason'
      begin
        Clinic::Inventory::ExceptionReview.record!(**values.merge(reason: input.fetch('reason')))
      rescue ArgumentError, ActiveRecord::RecordInvalid => e
        error = e.message
      end
      added = Clinic::Inventory::ExceptionReview.where(practice: @practice).count
      baseline = Clinic::Inventory::ExceptionReview.record!(**values)
      return {error: error, invalid_created: added, baseline: baseline.persisted?}
    end
    record = Clinic::Inventory::ExceptionReview.record!(**values)
    replay = Clinic::Inventory::ExceptionReview.record!(**values)
    {same: record.id == replay.id, records: Clinic::Inventory::ExceptionReview.where(practice: @practice).count, quantity: batch.reload.quantity.to_s('F'), active: batch.product.reload.active?}
  end
end
