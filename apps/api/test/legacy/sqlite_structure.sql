CREATE TABLE IF NOT EXISTS "schema_migrations" ("version" varchar NOT NULL PRIMARY KEY);
CREATE TABLE IF NOT EXISTS "ar_internal_metadata" ("key" varchar NOT NULL PRIMARY KEY, "value" varchar, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL);
CREATE TABLE IF NOT EXISTS "users" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email_address" varchar NOT NULL, "password_digest" varchar NOT NULL, "admin" boolean DEFAULT FALSE NOT NULL, "active" boolean DEFAULT TRUE NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL);
CREATE UNIQUE INDEX "index_users_on_email_address" ON "users" ("email_address") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "member_sessions" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "expires_at" datetime(6) NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_9aa185dc67"
FOREIGN KEY ("user_id")
  REFERENCES "users" ("id")
);
CREATE INDEX "index_member_sessions_on_user_id" ON "member_sessions" ("user_id") /*application='Backend'*/;
CREATE INDEX "index_member_sessions_on_expires_at" ON "member_sessions" ("expires_at") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "materials" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "title" varchar NOT NULL, "summary" text, "body" text NOT NULL, "published_at" datetime(6), "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, "slug" varchar /*application='Backend'*/, "sample" boolean DEFAULT FALSE NOT NULL /*application='Backend'*/);
CREATE INDEX "index_materials_on_published_at" ON "materials" ("published_at") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "contact_messages" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" text NOT NULL, "email" text NOT NULL, "message" text NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL);
CREATE UNIQUE INDEX "index_materials_on_slug" ON "materials" ("slug") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "learning_progresses" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "material_id" integer NOT NULL, "started_at" datetime(6) NOT NULL, "completed_at" datetime(6), "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_6ade58a529"
FOREIGN KEY ("user_id")
  REFERENCES "users" ("id")
, CONSTRAINT "fk_rails_b9fd1490bb"
FOREIGN KEY ("material_id")
  REFERENCES "materials" ("id")
);
CREATE INDEX "index_learning_progresses_on_user_id" ON "learning_progresses" ("user_id") /*application='Backend'*/;
CREATE INDEX "index_learning_progresses_on_material_id" ON "learning_progresses" ("material_id") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_learning_progresses_on_user_id_and_material_id" ON "learning_progresses" ("user_id", "material_id") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "paperworks" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "user_id" integer NOT NULL, "title" varchar NOT NULL, "document_version" varchar NOT NULL, "body" text NOT NULL, "content_digest" varchar NOT NULL, "demo" boolean DEFAULT TRUE NOT NULL, "started_at" datetime(6), "signed_at" datetime(6), "signature_name" text, "signature_digest" varchar, "consent_version" varchar, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_2c6930f769"
FOREIGN KEY ("user_id")
  REFERENCES "users" ("id")
, CONSTRAINT signed_paperwork_has_evidence CHECK (signed_at IS NULL OR (started_at IS NOT NULL AND signature_name IS NOT NULL AND signature_digest IS NOT NULL)));
CREATE INDEX "index_paperworks_on_user_id" ON "paperworks" ("user_id") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "clinic_practices" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "name" varchar NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL);
CREATE TABLE IF NOT EXISTS "clinic_memberships" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "practice_id" integer NOT NULL, "user_id" integer NOT NULL, "active" boolean DEFAULT TRUE NOT NULL, "patients_access" boolean DEFAULT FALSE NOT NULL, "inventory_access" boolean DEFAULT FALSE NOT NULL, "staff_access" boolean DEFAULT FALSE NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_6824078e73"
FOREIGN KEY ("practice_id")
  REFERENCES "clinic_practices" ("id")
, CONSTRAINT "fk_rails_dad9512d92"
FOREIGN KEY ("user_id")
  REFERENCES "users" ("id")
);
CREATE INDEX "index_clinic_memberships_on_practice_id" ON "clinic_memberships" ("practice_id") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_clinic_memberships_on_user_id" ON "clinic_memberships" ("user_id") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "clinic_patients" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "practice_id" integer NOT NULL, "display_name" text NOT NULL, "reference" varchar NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_97dd7e2d22"
FOREIGN KEY ("practice_id")
  REFERENCES "clinic_practices" ("id")
);
CREATE INDEX "index_clinic_patients_on_practice_id" ON "clinic_patients" ("practice_id") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_clinic_patients_on_practice_id_and_id" ON "clinic_patients" ("practice_id", "id") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_clinic_patients_on_practice_id_and_reference" ON "clinic_patients" ("practice_id", "reference") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "clinic_notes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "practice_id" integer NOT NULL, "patient_id" bigint NOT NULL, "author_id" integer NOT NULL, "body" text NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_6cca2d829b"
FOREIGN KEY ("author_id")
  REFERENCES "users" ("id")
, CONSTRAINT "fk_rails_f59202edf5"
FOREIGN KEY ("practice_id")
  REFERENCES "clinic_practices" ("id")
, CONSTRAINT "fk_rails_e6def732a1"
FOREIGN KEY ("practice_id", "patient_id")
  REFERENCES "clinic_patients" ("practice_id", "id")
);
CREATE INDEX "index_clinic_notes_on_practice_id" ON "clinic_notes" ("practice_id") /*application='Backend'*/;
CREATE INDEX "index_clinic_notes_on_author_id" ON "clinic_notes" ("author_id") /*application='Backend'*/;
CREATE INDEX "index_clinic_notes_on_practice_id_and_patient_id" ON "clinic_notes" ("practice_id", "patient_id") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "clinic_items" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "practice_id" integer NOT NULL, "name" varchar NOT NULL, "sku" varchar NOT NULL, "quantity" integer DEFAULT 0 NOT NULL, "reorder_level" integer DEFAULT 0 NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_0eb41eb72a"
FOREIGN KEY ("practice_id")
  REFERENCES "clinic_practices" ("id")
, CONSTRAINT clinic_stock_nonnegative CHECK (quantity >= 0 AND reorder_level >= 0));
CREATE INDEX "index_clinic_items_on_practice_id" ON "clinic_items" ("practice_id") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_clinic_items_on_practice_id_and_sku" ON "clinic_items" ("practice_id", "sku") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "clinic_stock_movements" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "item_id" integer NOT NULL, "actor_id" integer NOT NULL, "delta" integer NOT NULL, "reason" varchar NOT NULL, "request_key" varchar NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_a204b55367"
FOREIGN KEY ("item_id")
  REFERENCES "clinic_items" ("id")
, CONSTRAINT "fk_rails_bcd06826f5"
FOREIGN KEY ("actor_id")
  REFERENCES "users" ("id")
);
CREATE INDEX "index_clinic_stock_movements_on_item_id" ON "clinic_stock_movements" ("item_id") /*application='Backend'*/;
CREATE INDEX "index_clinic_stock_movements_on_actor_id" ON "clinic_stock_movements" ("actor_id") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_clinic_stock_movements_on_item_id_and_request_key" ON "clinic_stock_movements" ("item_id", "request_key") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "clinic_staff_members" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "practice_id" integer NOT NULL, "display_name" text NOT NULL, "job_title" varchar NOT NULL, "active" boolean DEFAULT TRUE NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_a6a2cb8cfb"
FOREIGN KEY ("practice_id")
  REFERENCES "clinic_practices" ("id")
);
CREATE INDEX "index_clinic_staff_members_on_practice_id" ON "clinic_staff_members" ("practice_id") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_clinic_memberships_on_practice_id_and_user_id" ON "clinic_memberships" ("practice_id", "user_id") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "clinic_pharmacy_products" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "practice_id" integer NOT NULL, "name" varchar NOT NULL, "generic_name" varchar, "ndc" varchar, "product_ndc" varchar, "dosage_form" varchar, "route" varchar, "labeler" varchar, "ingredients" text, "package_description" text, "sku" varchar NOT NULL, "reorder_point" integer DEFAULT 0 NOT NULL, "active" boolean DEFAULT TRUE NOT NULL, "source" varchar DEFAULT 'manual' NOT NULL, "imported_at" datetime(6), "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_db1a875745"
FOREIGN KEY ("practice_id")
  REFERENCES "clinic_practices" ("id")
, CONSTRAINT pharmacy_reorder_range CHECK (reorder_point BETWEEN 0 AND 1000000), CONSTRAINT pharmacy_product_source CHECK (source IN ('manual', 'openfda', 'synthetic')));
CREATE INDEX "index_clinic_pharmacy_products_on_practice_id" ON "clinic_pharmacy_products" ("practice_id") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_clinic_pharmacy_products_on_practice_id_and_id" ON "clinic_pharmacy_products" ("practice_id", "id") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_clinic_pharmacy_products_on_practice_id_and_sku" ON "clinic_pharmacy_products" ("practice_id", "sku") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_clinic_pharmacy_products_on_practice_id_and_ndc" ON "clinic_pharmacy_products" ("practice_id", "ndc") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "clinic_pharmacy_batches" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "practice_id" integer NOT NULL, "product_id" bigint NOT NULL, "lot_number" varchar NOT NULL, "location" varchar NOT NULL, "supplier" varchar, "expires_on" date NOT NULL, "status" varchar DEFAULT 'active' NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_19fd59cee4"
FOREIGN KEY ("practice_id", "product_id")
  REFERENCES "clinic_pharmacy_products" ("practice_id", "id")
, CONSTRAINT "fk_rails_d749b21c59"
FOREIGN KEY ("practice_id")
  REFERENCES "clinic_practices" ("id")
, CONSTRAINT pharmacy_batch_status CHECK (status IN ('active', 'quarantined', 'recalled')));
CREATE INDEX "index_clinic_pharmacy_batches_on_practice_id" ON "clinic_pharmacy_batches" ("practice_id") /*application='Backend'*/;
CREATE UNIQUE INDEX "index_clinic_pharmacy_batches_on_practice_id_and_id" ON "clinic_pharmacy_batches" ("practice_id", "id") /*application='Backend'*/;
CREATE UNIQUE INDEX "pharmacy_batch_identity" ON "clinic_pharmacy_batches" ("product_id", "lot_number", "location") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "clinic_pharmacy_movements" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "practice_id" bigint NOT NULL, "batch_id" bigint NOT NULL, "actor_id" bigint NOT NULL, "quantity" integer NOT NULL, "kind" varchar NOT NULL, "reason" varchar NOT NULL, "request_key" varchar NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_3ba75f9cd3"
FOREIGN KEY ("practice_id", "batch_id")
  REFERENCES "clinic_pharmacy_batches" ("practice_id", "id")
, CONSTRAINT "fk_rails_2f2f92d2de"
FOREIGN KEY ("practice_id", "actor_id")
  REFERENCES "clinic_memberships" ("practice_id", "user_id")
, CONSTRAINT pharmacy_movement_range CHECK (quantity <> 0 AND quantity BETWEEN -1000000 AND 1000000), CONSTRAINT pharmacy_movement_direction CHECK ((kind IN ('receipt', 'adjustment_in') AND quantity > 0) OR (kind IN ('adjustment_out', 'damaged', 'expired', 'return_to_supplier') AND quantity < 0)));
CREATE UNIQUE INDEX "index_clinic_pharmacy_movements_on_practice_id_and_request_key" ON "clinic_pharmacy_movements" ("practice_id", "request_key") /*application='Backend'*/;
CREATE INDEX "index_clinic_pharmacy_movements_on_practice_id_and_batch_id" ON "clinic_pharmacy_movements" ("practice_id", "batch_id") /*application='Backend'*/;
CREATE TABLE IF NOT EXISTS "clinic_pharmacy_batch_events" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "practice_id" bigint NOT NULL, "batch_id" bigint NOT NULL, "actor_id" bigint NOT NULL, "from_status" varchar NOT NULL, "to_status" varchar NOT NULL, "reason" varchar NOT NULL, "request_key" varchar NOT NULL, "created_at" datetime(6) NOT NULL, "updated_at" datetime(6) NOT NULL, CONSTRAINT "fk_rails_22ef15e821"
FOREIGN KEY ("practice_id", "batch_id")
  REFERENCES "clinic_pharmacy_batches" ("practice_id", "id")
, CONSTRAINT "fk_rails_77b24f8a5a"
FOREIGN KEY ("practice_id", "actor_id")
  REFERENCES "clinic_memberships" ("practice_id", "user_id")
);
CREATE UNIQUE INDEX "idx_on_practice_id_request_key_a63afaee18" ON "clinic_pharmacy_batch_events" ("practice_id", "request_key") /*application='Backend'*/;
CREATE INDEX "index_clinic_pharmacy_batch_events_on_practice_id_and_batch_id" ON "clinic_pharmacy_batch_events" ("practice_id", "batch_id") /*application='Backend'*/;
CREATE TRIGGER pharmacy_nonnegative_stock BEFORE INSERT ON clinic_pharmacy_movements
WHEN (SELECT COALESCE(SUM(quantity), 0) FROM clinic_pharmacy_movements WHERE batch_id = NEW.batch_id) + NEW.quantity NOT BETWEEN 0 AND 1000000
BEGIN SELECT RAISE(ABORT, 'Pharmacy stock must remain between zero and one million packages'); END;
CREATE TRIGGER clinic_pharmacy_movements_no_update BEFORE UPDATE ON clinic_pharmacy_movements BEGIN SELECT RAISE(ABORT, 'Pharmacy history is append-only'); END;
CREATE TRIGGER clinic_pharmacy_movements_no_delete BEFORE DELETE ON clinic_pharmacy_movements BEGIN SELECT RAISE(ABORT, 'Pharmacy history is append-only'); END;
CREATE TRIGGER clinic_pharmacy_batch_events_no_update BEFORE UPDATE ON clinic_pharmacy_batch_events BEGIN SELECT RAISE(ABORT, 'Pharmacy history is append-only'); END;
CREATE TRIGGER clinic_pharmacy_batch_events_no_delete BEFORE DELETE ON clinic_pharmacy_batch_events BEGIN SELECT RAISE(ABORT, 'Pharmacy history is append-only'); END;
INSERT INTO "schema_migrations" (version) VALUES
('20260830000400'),
('20260830000300'),
('20260830000200'),
('20260830000100');

