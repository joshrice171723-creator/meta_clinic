class CreatePlatformReviewPackets < ActiveRecord::Migration[8.1]
  def change
    create_table :platform_review_packets do |t|
      t.bigint :created_by_id, null: false
      t.string :title, null: false
      t.text :summary, null: false
      t.text :scope, null: false
      t.string :revision, null: false
      t.string :environment, null: false
      t.string :entry_path, null: false
      t.string :status, null: false, default: "awaiting_review"
      t.jsonb :criteria, null: false
      t.timestamps
    end

    create_table :platform_review_decisions do |t|
      t.bigint :review_packet_id, null: false
      t.bigint :reviewer_id, null: false
      t.string :outcome, null: false
      t.text :note, null: false
      t.jsonb :results, null: false
      t.timestamps
    end

    add_index :platform_review_packets, [ :status, :created_at, :id ],
      name: "platform_review_packets_queue"
    add_index :platform_review_decisions, :review_packet_id, unique: true
    add_foreign_key :platform_review_packets, :users, column: :created_by_id
    add_foreign_key :platform_review_decisions, :platform_review_packets, column: :review_packet_id
    add_foreign_key :platform_review_decisions, :users, column: :reviewer_id
    add_check_constraint :platform_review_packets,
      "status IN ('awaiting_review','approved','changes_requested') AND " \
      "length(trim(title)) BETWEEN 1 AND 140 AND length(trim(summary)) BETWEEN 1 AND 1000 AND " \
      "length(trim(scope)) BETWEEN 1 AND 1000 AND length(trim(revision)) BETWEEN 1 AND 120 AND " \
      "length(trim(environment)) BETWEEN 1 AND 80 AND length(trim(entry_path)) BETWEEN 1 AND 500 AND " \
      "left(entry_path, 1) = '/' AND left(entry_path, 2) <> '//' AND " \
      "jsonb_typeof(criteria) = 'array' AND jsonb_array_length(criteria) BETWEEN 1 AND 12",
      name: "platform_review_packets_values"
    add_check_constraint :platform_review_decisions,
      "outcome IN ('approved','changes_requested') AND length(trim(note)) BETWEEN 1 AND 1000 AND " \
      "jsonb_typeof(results) = 'array' AND jsonb_array_length(results) BETWEEN 1 AND 12",
      name: "platform_review_decisions_values"
  end
end
