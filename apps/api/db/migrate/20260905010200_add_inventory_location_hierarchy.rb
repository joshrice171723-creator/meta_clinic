class AddInventoryLocationHierarchy < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_inventory_locations, :site_id, :bigint
    add_column :clinic_inventory_locations, :parent_location_id, :bigint
    add_column :clinic_inventory_locations, :status, :string, null: false, default: "active"

    add_foreign_key :clinic_inventory_locations, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "fk_inventory_locations_site"
    add_foreign_key :clinic_inventory_locations, :clinic_inventory_locations,
      column: %i[practice_id parent_location_id], primary_key: %i[practice_id id], name: "fk_inventory_locations_parent"
    add_check_constraint :clinic_inventory_locations,
      "status IN ('active','retired')", name: "inventory_location_status"
    add_check_constraint :clinic_inventory_locations,
      "parent_location_id IS NULL OR parent_location_id <> id", name: "inventory_location_not_self_parent"

    remove_index :clinic_inventory_locations, name: "index_clinic_inventory_locations_on_practice_id_and_name"
    add_index :clinic_inventory_locations, %i[practice_id site_id parent_location_id name], unique: true,
      nulls_not_distinct: true, name: "inventory_location_sibling_name"
    add_index :clinic_inventory_locations, %i[practice_id site_id status id],
      name: "inventory_location_site_worklist"
    add_index :clinic_inventory_locations, %i[practice_id parent_location_id status id],
      name: "inventory_location_children"

    remove_index :clinic_pharmacy_batches, name: "pharmacy_batch_identity"

    execute <<~SQL
      CREATE OR REPLACE FUNCTION inventory_location_hierarchy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        parent clinic_inventory_locations%ROWTYPE;
        site_status text;
        cycle_found boolean;
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location:' || NEW.practice_id::text, 0));

        IF NEW.site_id IS NOT NULL THEN
          SELECT status INTO site_status
            FROM clinic_sites
           WHERE practice_id = NEW.practice_id AND id = NEW.site_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Inventory location facility must belong to the clinic';
          END IF;
          IF NEW.status = 'active' AND site_status <> 'active' THEN
            RAISE EXCEPTION 'An active inventory location requires an active facility';
          END IF;
        END IF;

        IF NEW.parent_location_id IS NOT NULL THEN
          SELECT * INTO parent
            FROM clinic_inventory_locations
           WHERE practice_id = NEW.practice_id AND id = NEW.parent_location_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Inventory parent location must belong to the clinic';
          END IF;
          IF parent.status <> 'active' THEN
            RAISE EXCEPTION 'Inventory parent location must be active';
          END IF;
          IF NEW.site_id IS DISTINCT FROM parent.site_id THEN
            RAISE EXCEPTION 'Inventory child and parent locations must use the same facility';
          END IF;
          IF parent.kind IN ('quarantine','returns','controlled') AND NEW.kind IS DISTINCT FROM parent.kind THEN
            RAISE EXCEPTION 'Inventory child location must preserve its restricted parent kind';
          END IF;
          IF EXISTS (SELECT 1 FROM clinic_pharmacy_batches WHERE practice_id = NEW.practice_id AND location_id = parent.id) THEN
            RAISE EXCEPTION 'A location with inventory history cannot become a parent location';
          END IF;

          WITH RECURSIVE ancestors(id, parent_location_id) AS (
            SELECT id, parent_location_id
              FROM clinic_inventory_locations
             WHERE practice_id = NEW.practice_id AND id = NEW.parent_location_id
            UNION
            SELECT location.id, location.parent_location_id
              FROM clinic_inventory_locations location
              JOIN ancestors ON location.id = ancestors.parent_location_id
             WHERE location.practice_id = NEW.practice_id
          )
          SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = NEW.id) INTO cycle_found;
          IF cycle_found THEN
            RAISE EXCEPTION 'Inventory location hierarchy cannot contain a cycle';
          END IF;
        END IF;

        IF TG_OP = 'UPDATE' THEN
          IF (
            NEW.name IS DISTINCT FROM OLD.name OR
            NEW.kind IS DISTINCT FROM OLD.kind OR
            NEW.site_id IS DISTINCT FROM OLD.site_id OR
            NEW.parent_location_id IS DISTINCT FROM OLD.parent_location_id
          ) AND EXISTS (SELECT 1 FROM clinic_pharmacy_batches WHERE practice_id = NEW.practice_id AND location_id = NEW.id) THEN
            RAISE EXCEPTION 'A location with inventory history cannot change hierarchy identity';
          END IF;

          IF (
            NEW.name IS DISTINCT FROM OLD.name OR
            NEW.kind IS DISTINCT FROM OLD.kind OR
            NEW.site_id IS DISTINCT FROM OLD.site_id OR
            NEW.parent_location_id IS DISTINCT FROM OLD.parent_location_id
          ) AND EXISTS (SELECT 1 FROM clinic_inventory_locations WHERE practice_id = NEW.practice_id AND parent_location_id = NEW.id) THEN
            RAISE EXCEPTION 'A parent location cannot change hierarchy identity';
          END IF;

          IF NEW.status = 'retired' AND OLD.status IS DISTINCT FROM NEW.status THEN
            IF EXISTS (SELECT 1 FROM clinic_pharmacy_batches WHERE practice_id = NEW.practice_id AND location_id = NEW.id AND on_hand > 0) THEN
              RAISE EXCEPTION 'A location with on-hand inventory cannot be retired';
            END IF;
            IF EXISTS (SELECT 1 FROM clinic_inventory_locations WHERE practice_id = NEW.practice_id AND parent_location_id = NEW.id AND status = 'active') THEN
              RAISE EXCEPTION 'A location with active children cannot be retired';
            END IF;
          END IF;
        END IF;

        RETURN NEW;
      END; $$;

      CREATE TRIGGER inventory_location_hierarchy_guard
      BEFORE INSERT OR UPDATE ON clinic_inventory_locations
      FOR EACH ROW EXECUTE FUNCTION inventory_location_hierarchy_guard();

      CREATE OR REPLACE FUNCTION inventory_location_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Inventory locations must be retired, not deleted';
      END; $$;

      CREATE TRIGGER inventory_location_delete_guard
      BEFORE DELETE ON clinic_inventory_locations
      FOR EACH ROW EXECUTE FUNCTION inventory_location_delete_guard();
    SQL

    execute <<~SQL
      CREATE OR REPLACE FUNCTION inventory_location_stock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        validate_destination boolean;
      BEGIN
        PERFORM pg_advisory_xact_lock_shared(hashtextextended('inventory-location:' || NEW.practice_id::text, 0));

        IF TG_OP = 'INSERT' THEN
          validate_destination := NEW.on_hand > 0;
        ELSE
          validate_destination := NEW.on_hand > 0 AND (
            NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.on_hand > OLD.on_hand
          );
        END IF;

        IF validate_destination AND NOT EXISTS (
          SELECT 1
            FROM clinic_inventory_locations location
           WHERE location.practice_id = NEW.practice_id
             AND location.id = NEW.location_id
             AND location.status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM clinic_inventory_locations child
                WHERE child.practice_id = location.practice_id
                  AND child.parent_location_id = location.id
             )
             AND (
               location.site_id IS NULL OR EXISTS (
                 SELECT 1 FROM clinic_sites site
                  WHERE site.practice_id = location.practice_id
                    AND site.id = location.site_id
                    AND site.status = 'active'
               )
             )
        ) THEN
          RAISE EXCEPTION 'On-hand inventory requires an active leaf location at an active facility';
        END IF;
        RETURN NEW;
      END; $$;

      CREATE TRIGGER inventory_location_stock_guard
      BEFORE INSERT OR UPDATE OF on_hand, location_id ON clinic_pharmacy_batches
      FOR EACH ROW EXECUTE FUNCTION inventory_location_stock_guard();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Preserve inventory location hierarchy and custody evidence; restore a reviewed backup instead."
  end
end
