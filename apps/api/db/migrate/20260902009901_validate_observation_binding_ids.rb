class ValidateObservationBindingIds < ActiveRecord::Migration[8.1]
  def change
    add_check_constraint :clinic_observations,
      "value_binding_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'",
      name: "clinic_observations_value_binding_format"
  end
end
