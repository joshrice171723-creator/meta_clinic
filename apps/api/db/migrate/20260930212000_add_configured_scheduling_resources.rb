class AddConfiguredSchedulingResources < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_scheduling_resources do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :site, null: false, foreign_key: { to_table: :clinic_sites }
      t.references :room, foreign_key: { to_table: :clinic_rooms }
      t.string :name, null: false
      t.string :kind, null: false
      t.boolean :active, null: false, default: true
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_check_constraint :clinic_scheduling_resources, "kind IN ('chair','equipment') AND (kind <> 'chair' OR room_id IS NOT NULL)", name: 'scheduling_resource_kind'
    create_table :clinic_resource_compatibilities do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :site, null: false, foreign_key: { to_table: :clinic_sites }
      t.references :service_offering, null: false, foreign_key: { to_table: :clinic_service_offerings }
      t.references :written_by_membership, null: false, foreign_key: { to_table: :clinic_memberships }
      t.integer :revision, null: false
      t.string :mode, null: false
      t.jsonb :chair_ids, null: false, default: []
      t.jsonb :equipment_ids, null: false, default: []
      t.datetime :created_at, null: false
    end
    add_index :clinic_resource_compatibilities, [:practice_id, :site_id, :service_offering_id, :revision], unique: true, name: 'resource_compatibility_revision'
    add_check_constraint :clinic_resource_compatibilities, "revision > 0 AND mode IN ('required','not_required') AND jsonb_typeof(chair_ids) = 'array' AND jsonb_typeof(equipment_ids) = 'array' AND ((mode = 'not_required' AND chair_ids = '[]'::jsonb AND equipment_ids = '[]'::jsonb) OR (mode = 'required' AND jsonb_array_length(chair_ids) + jsonb_array_length(equipment_ids) > 0))", name: 'resource_compatibility_mode'
    create_table :clinic_resource_reservations do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :appointment, null: false, foreign_key: { to_table: :clinic_appointments }
      t.references :resource, null: false, foreign_key: { to_table: :clinic_scheduling_resources }
      t.references :resource_compatibility, null: false, foreign_key: { to_table: :clinic_resource_compatibilities }
      t.datetime :starts_at, null: false
      t.datetime :ends_at, null: false
      t.string :state, null: false, default: 'active'
      t.timestamps
    end
    add_index :clinic_scheduling_resources, [:practice_id, :id], unique: true, name: 'resource_tenant_identity'
    add_index :clinic_resource_compatibilities, [:practice_id, :id], unique: true, name: 'compatibility_tenant_identity'
    add_foreign_key :clinic_scheduling_resources, :clinic_sites, column: [:practice_id, :site_id], primary_key: [:practice_id, :id], name: 'resource_site_tenant'
    add_foreign_key :clinic_scheduling_resources, :clinic_rooms, column: [:practice_id, :site_id, :room_id], primary_key: [:practice_id, :site_id, :id], name: 'resource_room_tenant'
    add_foreign_key :clinic_resource_compatibilities, :clinic_sites, column: [:practice_id, :site_id], primary_key: [:practice_id, :id], name: 'compatibility_site_tenant'
    add_foreign_key :clinic_resource_compatibilities, :clinic_service_offerings, column: [:practice_id, :service_offering_id], primary_key: [:practice_id, :id], name: 'compatibility_service_tenant'
    add_foreign_key :clinic_resource_compatibilities, :clinic_memberships, column: [:practice_id, :written_by_membership_id], primary_key: [:practice_id, :id], name: 'compatibility_actor_tenant'
    add_foreign_key :clinic_resource_reservations, :clinic_appointments, column: [:practice_id, :appointment_id], primary_key: [:practice_id, :id], name: 'reservation_appointment_tenant'
    add_foreign_key :clinic_resource_reservations, :clinic_scheduling_resources, column: [:practice_id, :resource_id], primary_key: [:practice_id, :id], name: 'reservation_resource_tenant'
    add_foreign_key :clinic_resource_reservations, :clinic_resource_compatibilities, column: [:practice_id, :resource_compatibility_id], primary_key: [:practice_id, :id], name: 'reservation_policy_tenant'
    execute <<~SQL
      ALTER TABLE clinic_resource_reservations ADD CONSTRAINT resource_reservation_interval CHECK (ends_at > starts_at AND state IN ('active','released'));
      ALTER TABLE clinic_resource_reservations ADD CONSTRAINT resource_reservation_overlap EXCLUDE USING gist
        (resource_id WITH =, tsrange(starts_at, ends_at, '[)') WITH &&) WHERE (state = 'active');
      CREATE FUNCTION clinic_resource_compatibility_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Resource compatibility revisions are immutable'; END; $$;
      CREATE TRIGGER resource_compatibility_immutable BEFORE UPDATE OR DELETE ON clinic_resource_compatibilities
        FOR EACH ROW EXECUTE FUNCTION clinic_resource_compatibility_immutable();
      CREATE FUNCTION clinic_resource_reservation_context() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM clinic_appointments a JOIN clinic_scheduling_resources r ON r.id = NEW.resource_id
          JOIN clinic_resource_compatibilities c ON c.id = NEW.resource_compatibility_id
          WHERE a.id = NEW.appointment_id AND a.practice_id = NEW.practice_id AND r.practice_id = NEW.practice_id
            AND c.practice_id = NEW.practice_id AND a.site_id = r.site_id AND c.site_id = a.site_id
            AND c.service_offering_id = a.service_offering_id AND r.active AND c.mode = 'required'
            AND a.status IN ('scheduled','confirmed')
            AND NEW.starts_at = a.starts_at AT TIME ZONE 'UTC' AND NEW.ends_at = a.ends_at AT TIME ZONE 'UTC'
            AND (r.room_id IS NULL OR r.room_id = a.room_id)
            AND ((r.kind = 'chair' AND c.chair_ids @> jsonb_build_array(r.id)) OR
                 (r.kind = 'equipment' AND c.equipment_ids @> jsonb_build_array(r.id)))) THEN
          RAISE EXCEPTION 'Resource reservation context mismatch';
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER resource_reservation_context BEFORE INSERT ON clinic_resource_reservations
        FOR EACH ROW EXECUTE FUNCTION clinic_resource_reservation_context();
      CREATE FUNCTION clinic_resource_reservation_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Resource reservation history cannot be deleted'; END IF;
        IF NEW.practice_id IS DISTINCT FROM OLD.practice_id OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
          OR NEW.resource_id IS DISTINCT FROM OLD.resource_id OR NEW.resource_compatibility_id IS DISTINCT FROM OLD.resource_compatibility_id
          OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
          OR OLD.state <> 'active' OR NEW.state <> 'released' THEN
          RAISE EXCEPTION 'Resource reservations can only be released; replacement allocations are appended';
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER resource_reservation_history BEFORE UPDATE OR DELETE ON clinic_resource_reservations
        FOR EACH ROW EXECUTE FUNCTION clinic_resource_reservation_history();
      CREATE FUNCTION clinic_release_resource_reservations() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status NOT IN ('scheduled','confirmed') THEN
          UPDATE clinic_resource_reservations SET state = 'released', updated_at = CURRENT_TIMESTAMP WHERE appointment_id = NEW.id AND state = 'active';
        ELSIF NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.site_id IS DISTINCT FROM OLD.site_id OR NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.service_offering_id IS DISTINCT FROM OLD.service_offering_id THEN
          IF EXISTS (SELECT 1 FROM clinic_resource_reservations WHERE appointment_id = NEW.id AND state = 'active') THEN
            RAISE EXCEPTION 'Release and reallocate resources before changing appointment context';
          END IF;
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER release_resource_reservations AFTER UPDATE ON clinic_appointments
        FOR EACH ROW EXECUTE FUNCTION clinic_release_resource_reservations();
    SQL
  end
  def down
    raise ActiveRecord::IrreversibleMigration, 'Configured resource and booking history must be preserved.'
  end
end
