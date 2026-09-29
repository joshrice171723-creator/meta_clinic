class CreateClinicDayEndReviews < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_day_end_reviews do |t|
      t.bigint :practice_id, :reviewed_by_id, null: false
      t.date :review_date, null: false
      t.string :timezone, null: false
      t.string :request_key, null: false
      t.text :review_note, null: false
      t.jsonb :snapshot, null: false
      t.timestamps
    end

    add_index :clinic_day_end_reviews, [ :practice_id, :request_key ], unique: true,
      name: "clinic_day_end_reviews_request_key"
    add_index :clinic_day_end_reviews, [ :practice_id, :review_date, :created_at, :id ],
      name: "clinic_day_end_reviews_by_date"
    add_foreign_key :clinic_day_end_reviews, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_day_end_reviews, :users, column: :reviewed_by_id
    add_check_constraint :clinic_day_end_reviews,
      "length(trim(timezone)) > 0 AND length(trim(request_key)) BETWEEN 1 AND 160 AND length(trim(review_note)) BETWEEN 1 AND 500 AND jsonb_typeof(snapshot) = 'object'",
      name: "clinic_day_end_reviews_values"
  end
end
