class CreateDevelopmentDemoFeedback < ActiveRecord::Migration[8.1]
  def change
    create_table :development_demo_feedback do |t|
      t.references :visitor, null: false, foreign_key: { to_table: :development_demo_visitors }
      t.text :message, null: false
      t.timestamps
    end

    add_index :development_demo_feedback, [ :created_at, :id ]
    add_check_constraint :development_demo_feedback,
      "length(btrim(message)) BETWEEN 1 AND 2000", name: "development_demo_feedback_message_length"
  end
end
