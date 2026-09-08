class WorkflowPropertyCase
  def inventory_fixture(quantity = 10)
    grant_permissions!(@membership, 'inventory.transfer', 'inventory.configure', 'inventory.count', 'recall.lock', 'recall.dispose')
    product = @practice.pharmacy_products.create!(name: 'Property medicine', sku: 'INV-PROP', stock_unit: 'mL', quantity_scale: 2, package_size: 1)
    source = @practice.inventory_locations.create!(name: 'Property source', kind: 'storage')
    destination = @practice.inventory_locations.create!(name: 'Property destination', kind: 'storage')
    line = {product_id: product.id, lot_number: 'INV-LOT', location_id: source.id, location: source.name,
      expires_on: (Date.current + 90).iso8601, amount: quantity.to_s, input_unit: 'mL'}
    receipt = Clinic::Inventory::Receiving.call(practice: @practice, actor: @actor, lines: [line], reason: 'Property receipt', request_key: SecureRandom.uuid)
    [receipt.lines.sole.batch, source, destination, line]
  end

  def inventory_receipt_contract(input)
    batch, _source, _destination, line = inventory_fixture
    before = Clinic::Inventory::Receipt.where(practice: @practice).count
    values = {practice: @practice, actor: @actor, lines: [line.merge(lot_number: 'OTHER-LOT')], reason: 'Property receipt', request_key: SecureRandom.uuid}
    field = input.fetch('field')
    if field == 'reason'
      values[:reason] = input['value']
    elsif field == 'lines'
      values[:lines] = []
    else
      values[:lines][0][field.to_sym] = input['value']
      values[:lines][0][:location] = '' if field == 'location_id'
    end
    error = nil
    begin
      Clinic::Inventory::Receiving.call(**values)
    rescue ArgumentError, ActiveRecord::RecordInvalid => e
      error = e.message
    end
    {error: error, receipts_added: Clinic::Inventory::Receipt.where(practice: @practice).count-before, original_quantity: batch.reload.quantity.to_s('F')}
  end

  def inventory_transfer_contract(input)
    quantity = input.fetch('quantity')
    batch, source, destination, = inventory_fixture(quantity * 2)
    values = {practice: @practice, actor: @actor, source_batch_id: batch.id, destination_location_id: destination.id,
      amount: quantity.to_s, reason: 'Property transfer', request_key: SecureRandom.uuid}
    mode = input.fetch('mode')
    values[:destination_location_id] = source.id if mode == 'same_location'
    values[:amount] = (quantity*3).to_s if mode == 'overdraw'
    values[:reason] = input.fetch('reason', '') if mode == 'missing_reason'
    error = nil
    replay_same = nil
    begin
      record = Clinic::Inventory::TransferStock.call(**values)
      replay_same = Clinic::Inventory::TransferStock.call(**values).id == record.id if mode == 'retry'
    rescue ArgumentError, ActiveRecord::RecordInvalid => e
      error = e.message
    rescue ActiveRecord::StatementInvalid => e
      raise unless mode == 'missing_reason' && e.message.include?('inventory_transfer_values')
      error = e.message
    end
    {error: error, replay_same: replay_same, transfers: Clinic::Inventory::Transfer.where(practice: @practice).count,
      source: batch.reload.quantity.to_s('F'), total: batch.product.batches.sum(:on_hand).to_s('F')}
  end

  def inventory_count_contract(input)
    batch, source, = inventory_fixture
    values = {practice: @practice, actor: @actor, location_id: source.id, assignee_id: @actor.id,
      due_on: Date.current.iso8601, blind: true, reason: 'Property count', request_key: SecureRandom.uuid}
    field = input['field']
    error = nil
    if field
      begin
        Clinic::Inventory::CountProgram.create!(**values.merge(field.to_sym => input['value']))
      rescue ArgumentError, ActiveRecord::RecordInvalid => e
        error = e.message
      end
      added = Clinic::Inventory::CountSession.where(practice: @practice).count
      # Verify the complete service baseline after the rejected attempt.
      baseline = Clinic::Inventory::CountProgram.create!(**values)
      return {error: error, invalid_created: added, baseline: baseline.persisted?}
    end
    session = Clinic::Inventory::CountProgram.create!(**values)
    if input['mode'] == 'premature_complete'
      begin
        Clinic::Inventory::CountProgram.complete!(session: session, actor: @actor, reason: 'Property completion', request_key: SecureRandom.uuid)
      rescue ArgumentError => e
        error = e.message
      end
    else
      line = session.lines.sole
      key = SecureRandom.uuid
      first = Clinic::Inventory::CountProgram.skip!(line: line, actor: @actor, reason: 'Property skip', request_key: key)
      replay = Clinic::Inventory::CountProgram.skip!(line: line, actor: @actor, reason: 'Property skip', request_key: key)
      Clinic::Inventory::CountProgram.resume!(line: line, actor: @actor, reason: 'Property resume', request_key: SecureRandom.uuid)
      return {same_event: first.id == replay.id, events: session.events.count, latest: session.events.order(:id).last.kind, quantity: batch.reload.quantity.to_s('F')}
    end
    {error: error, status: session.reload.status, quantity: batch.reload.quantity.to_s('F')}
  end

  def inventory_recall_contract(input)
    batch, = inventory_fixture
    values = {practice: @practice, actor: @actor, lot_ids: [batch.lot_id], reference: 'PROP-RECALL', reason: 'Property recall', required_disposition: 'return', request_key: SecureRandom.uuid}
    if input['field']
      error = nil
      begin
        Clinic::Inventory::RecallCase.create!(**values.merge(input['field'].to_sym => input['value']))
      rescue ArgumentError, ActiveRecord::RecordInvalid => e
        error = e.message
      end
      added = Clinic::Inventory::Recall.where(practice: @practice).count
      baseline = Clinic::Inventory::RecallCase.create!(**values)
      return {error: error, invalid_created: added, baseline: baseline.persisted?}
    end
    recall = Clinic::Inventory::RecallCase.create!(**values)
    replay = Clinic::Inventory::RecallCase.create!(**values)
    error = nil
    begin
      Clinic::Inventory::RecallCase.close!(recall: recall, actor: @actor, reason: 'Property closure', evidence_reference: 'Property evidence', request_key: SecureRandom.uuid)
    rescue ArgumentError => e
      error = e.message
    end
    {same_recall: recall.id == replay.id, error: error, status: recall.reload.status,
      quantity: batch.reload.quantity.to_s('F'), holds: batch.active_holds.where(kind: 'recalled', recall_id: recall.id).count, closures: recall.closure ? 1 : 0}
  end
end
