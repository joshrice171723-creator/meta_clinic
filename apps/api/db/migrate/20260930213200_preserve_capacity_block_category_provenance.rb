class PreserveCapacityBlockCategoryProvenance < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE FUNCTION clinic_capacity_category_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.operational_policy_version_id IS DISTINCT FROM OLD.operational_policy_version_id OR
           NEW.reason_category_key IS DISTINCT FROM OLD.reason_category_key THEN
          RAISE EXCEPTION 'Recorded block category provenance is immutable';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER clinic_capacity_category_immutable
      BEFORE UPDATE OF operational_policy_version_id, reason_category_key ON clinic_capacity_rules
      FOR EACH ROW EXECUTE FUNCTION clinic_capacity_category_immutable();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve recorded block category provenance; use a reviewed forward migration."
  end
end
