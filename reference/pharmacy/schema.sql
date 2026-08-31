-- ARCHIVED DESIGN REFERENCE: do not execute against APPly.
-- Canonical runtime schema: site/backend/db/structure.sql (Rails migrations).
-- Pharmacy Inventory Management System
-- PostgreSQL 15+ baseline schema.
-- Inventory-only scope; no patient-identifying information.

CREATE TABLE pharmacies (
    id TEXT PRIMARY KEY,
    legal_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    display_name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'INVENTORY_STAFF', 'PHARMACIST', 'READ_ONLY')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (pharmacy_id, email)
);

CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    account_reference TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (pharmacy_id, name)
);

CREATE TABLE product_categories (
    id TEXT PRIMARY KEY,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    name TEXT NOT NULL,
    UNIQUE (pharmacy_id, name)
);

CREATE TABLE products (
    id TEXT PRIMARY KEY,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    category_id TEXT REFERENCES product_categories(id),
    preferred_supplier_id TEXT REFERENCES suppliers(id),
    brand_name TEXT NOT NULL,
    generic_name TEXT,
    active_ingredient TEXT,
    strength TEXT,
    dosage_form TEXT,
    package_description TEXT,
    unit_of_measure TEXT NOT NULL DEFAULT 'unit',
    sku TEXT,
    barcode TEXT,
    ndc TEXT,
    prescription_required BOOLEAN NOT NULL DEFAULT FALSE,
    controlled_substance BOOLEAN NOT NULL DEFAULT FALSE,
    reorder_point NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
    target_stock_level NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (target_stock_level >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (pharmacy_id, sku),
    UNIQUE (pharmacy_id, barcode)
);

CREATE TABLE inventory_locations (
    id TEXT PRIMARY KEY,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    name TEXT NOT NULL,
    location_type TEXT NOT NULL CHECK (location_type IN ('STORE', 'DISPENSARY', 'COLD_STORAGE', 'QUARANTINE', 'OTHER')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (pharmacy_id, name)
);

CREATE TABLE product_batches (
    id TEXT PRIMARY KEY,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_number TEXT NOT NULL,
    expiration_date DATE NOT NULL,
    supplier_id TEXT REFERENCES suppliers(id),
    received_at TIMESTAMPTZ,
    unit_cost NUMERIC(14,4) CHECK (unit_cost >= 0),
    selling_price NUMERIC(14,4) CHECK (selling_price >= 0),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPLETED', 'EXPIRED', 'RECALLED', 'QUARANTINED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (pharmacy_id, product_id, batch_number)
);

CREATE TABLE purchase_orders (
    id TEXT PRIMARY KEY,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    order_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
    ordered_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (pharmacy_id, order_number)
);

CREATE TABLE purchase_order_items (
    id TEXT PRIMARY KEY,
    purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    ordered_quantity NUMERIC(14,3) NOT NULL CHECK (ordered_quantity > 0),
    received_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    unit_cost NUMERIC(14,4) CHECK (unit_cost >= 0)
);

CREATE TABLE inventory_movements (
    id TEXT PRIMARY KEY,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_id TEXT NOT NULL REFERENCES product_batches(id),
    location_id TEXT NOT NULL REFERENCES inventory_locations(id),
    movement_type TEXT NOT NULL CHECK (movement_type IN (
        'RECEIPT', 'DISPENSE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
        'RETURN_TO_SUPPLIER', 'CUSTOMER_RETURN', 'DAMAGED', 'EXPIRED',
        'RECALLED', 'TRANSFER_IN', 'TRANSFER_OUT'
    )),
    quantity NUMERIC(14,3) NOT NULL CHECK (quantity <> 0),
    reason TEXT,
    reference_type TEXT,
    reference_id TEXT,
    transfer_group_id TEXT,
    performed_by TEXT NOT NULL REFERENCES users(id),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_alerts (
    id TEXT PRIMARY KEY,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    product_id TEXT REFERENCES products(id),
    batch_id TEXT REFERENCES product_batches(id),
    location_id TEXT REFERENCES inventory_locations(id),
    alert_type TEXT NOT NULL CHECK (alert_type IN ('LOW_STOCK', 'EXPIRING', 'EXPIRED', 'RECALLED', 'QUARANTINED')),
    severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
    message TEXT NOT NULL,
    due_at TIMESTAMPTZ,
    acknowledged_by TEXT REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_by TEXT REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DEACTIVATE', 'STATUS_CHANGE', 'APPROVE')),
    changed_by TEXT NOT NULL REFERENCES users(id),
    change_summary TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_name ON products (pharmacy_id, brand_name, generic_name);
CREATE INDEX idx_products_barcode ON products (pharmacy_id, barcode);
CREATE INDEX idx_batches_expiration ON product_batches (pharmacy_id, expiration_date, status);
CREATE INDEX idx_batches_product ON product_batches (pharmacy_id, product_id, status);
CREATE INDEX idx_movements_balance ON inventory_movements (pharmacy_id, product_id, batch_id, location_id, occurred_at);
CREATE INDEX idx_movements_reference ON inventory_movements (pharmacy_id, reference_type, reference_id);
CREATE INDEX idx_alerts_open ON stock_alerts (pharmacy_id, status, severity, due_at);
CREATE INDEX idx_audit_entity ON audit_log (pharmacy_id, entity_type, entity_id, changed_at);

-- PostgreSQL treats multiple NULLs as distinct in UNIQUE constraints, which allows
-- products without a barcode or SKU while still preventing duplicate populated values.