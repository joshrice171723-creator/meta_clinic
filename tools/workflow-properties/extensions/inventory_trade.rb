class WorkflowPropertyCase
  def inventory_delivery_fixture(quantity)
    batch, source, _destination, line = inventory_fixture
    grant_permissions!(@membership, 'procurement.approve', 'procurement.submit')
    supplier = Clinic::Inventory::Supplier.create!(practice: @practice, name: 'Property supplier')
    order = @practice.inventory_purchase_orders.create!(actor: @actor, supplier: supplier, number: 'PROP-ORDER', status: 'sent',
      destination: source.name, reason: 'Property order', request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16),
      version: 1, subtotal: (quantity+1)*2, tax: 0, shipping: 0, total: (quantity+1)*2)
    order_line = order.lines.create!(practice: @practice, product: batch.product, product_name: batch.product.name,
      stock_unit: 'mL', input_unit: 'package', ordered_quantity: quantity+1, received_quantity: 0, conversion_factor: 1, unit_price: 2, currency: 'USD')
    shipment = order.shipments.create!(practice: @practice, actor: @actor, reference: 'PROP-SHIP', supplier_reference: 'PROP-SUPPLIER',
      status: 'delivered', package_count: quantity, expected_units: quantity, delivered_at: Time.current, request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16))
    shipment.shipment_lines.create!(practice: @practice, purchase_order_line: order_line, expected_packages: quantity)
    values = {practice: @practice, actor: @actor, purchase_order: order, shipment: shipment,
      lines: [line.merge(amount: quantity.to_s, input_unit: 'package', purchase_order_line_id: order_line.id)], reason: 'Property delivery', request_key: SecureRandom.uuid}
    receipt = Clinic::Inventory::Receiving.call(**values)
    [order, order_line, receipt, values, batch]
  end

  def inventory_delivery_contract(input)
    quantity = input.fetch('quantity')
    order, line, receipt, values, batch = inventory_delivery_fixture(quantity)
    replay = Clinic::Inventory::Receiving.call(**values)
    {same_receipt: replay.id == receipt.id, receipts: order.receipts.count, received: line.reload.received_quantity.to_s('F'),
      remaining: line.remaining_quantity.to_s('F'), status: order.reload.status, stock: batch.reload.quantity.to_s('F')}
  end

  def inventory_return_contract(input)
    quantity = input.fetch('quantity')
    order, _line, receipt, _values, batch = inventory_delivery_fixture(quantity)
    values = {receipt_line_id: receipt.lines.sole.id, quantity: quantity.to_s, reference: 'PROP-RETURN', reason: 'Property return', request_key: SecureRandom.uuid}
    mode = input.fetch('mode')
    values[:quantity] = (quantity+1).to_s if mode == 'overreturn'
    values[:reason] = '' if mode == 'missing_reason'
    error = nil
    same = nil
    begin
      record = Clinic::Inventory::ProcurementReconciliation.record_return(practice: @practice, actor: @actor, order_id: order.id, input: values)
      same = Clinic::Inventory::ProcurementReconciliation.record_return(practice: @practice, actor: @actor, order_id: order.id, input: values).id == record.id if mode == 'retry'
    rescue ArgumentError, ActiveRecord::RecordInvalid => e
      error = e.message
    end
    {error: error, same: same, returns: Clinic::Inventory::VendorReturn.where(practice: @practice).count, stock: batch.reload.quantity.to_s('F')}
  end

  def inventory_supplier_invoice_contract(input)
    quantity = input.fetch('quantity')
    order, line, = inventory_delivery_fixture(quantity)
    values = {reference: 'PROP-INVOICE', reason: 'Property invoice', request_key: SecureRandom.uuid, currency: 'USD', amount: (quantity*2).to_s,
      lines: [{purchase_order_line_id: line.id, quantity_packages: quantity.to_s, unit_price: '2'}]}
    values[:amount] = (quantity*2+1).to_s if input['mode']=='wrong_total'
    values[:reference] = '' if input['mode']=='missing_reference'
    error = nil
    status = nil
    same = nil
    begin
      record = Clinic::Inventory::ProcurementReconciliation.record_invoice(practice: @practice, actor: @actor, order_id: order.id, input: values)
      status = record.status
      same = Clinic::Inventory::ProcurementReconciliation.record_invoice(practice: @practice, actor: @actor, order_id: order.id, input: values).id == record.id
    rescue ArgumentError, ActiveRecord::RecordInvalid => e
      error = e.message
    end
    {error: error, status: status, same: same, invoices: Clinic::Inventory::SupplierInvoice.where(practice: @practice).count}
  end

  def inventory_scan_contract(input)
    batch, = inventory_fixture
    code = input.fetch('code')
    before = Clinic::Inventory::PharmacyMovement.where(practice: @practice).count
    result = Clinic::Inventory::ScanResolver.call(practice: @practice, actor: @actor, context: 'receiving', scan_code: code, product_id: batch.product_id)
    {status: result[:status], stock: batch.reload.quantity.to_s('F'), movements_added: Clinic::Inventory::PharmacyMovement.where(practice: @practice).count-before}
  end

  def inventory_adjust_contract(input)
    quantity = input.fetch('quantity')
    batch, = inventory_fixture(quantity*2)
    mode = input.fetch('mode')
    values = {kind: 'adjustment_out', amount: quantity.to_s, reason: 'Property adjustment', actor: @actor, request_key: SecureRandom.uuid}
    values[:reason] = '' if mode == 'missing_reason'
    values[:amount] = (quantity*3).to_s if mode == 'overdraw'
    error = nil
    same = nil
    begin
      first = batch.move!(**values)
      same = batch.move!(**values).id == first.id if mode == 'retry'
    rescue ArgumentError, ActiveRecord::RecordInvalid => e
      error = e.message
    end
    {error: error, same: same, stock: batch.reload.quantity.to_s('F')}
  end
end
