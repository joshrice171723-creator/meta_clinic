# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_08_30_000300) do
  create_table "clinic_items", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.integer "practice_id", null: false
    t.integer "quantity", default: 0, null: false
    t.integer "reorder_level", default: 0, null: false
    t.string "sku", null: false
    t.datetime "updated_at", null: false
    t.index ["practice_id", "sku"], name: "index_clinic_items_on_practice_id_and_sku", unique: true
    t.index ["practice_id"], name: "index_clinic_items_on_practice_id"
    t.check_constraint "quantity >= 0 AND reorder_level >= 0", name: "clinic_stock_nonnegative"
  end

  create_table "clinic_memberships", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.boolean "inventory_access", default: false, null: false
    t.boolean "patients_access", default: false, null: false
    t.integer "practice_id", null: false
    t.boolean "staff_access", default: false, null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["practice_id"], name: "index_clinic_memberships_on_practice_id"
    t.index ["user_id"], name: "index_clinic_memberships_on_user_id", unique: true
  end

  create_table "clinic_notes", force: :cascade do |t|
    t.integer "author_id", null: false
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.bigint "patient_id", null: false
    t.integer "practice_id", null: false
    t.datetime "updated_at", null: false
    t.index ["author_id"], name: "index_clinic_notes_on_author_id"
    t.index ["practice_id", "patient_id"], name: "index_clinic_notes_on_practice_id_and_patient_id"
    t.index ["practice_id"], name: "index_clinic_notes_on_practice_id"
  end

  create_table "clinic_patients", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "display_name", null: false
    t.integer "practice_id", null: false
    t.string "reference", null: false
    t.datetime "updated_at", null: false
    t.index ["practice_id", "id"], name: "index_clinic_patients_on_practice_id_and_id", unique: true
    t.index ["practice_id", "reference"], name: "index_clinic_patients_on_practice_id_and_reference", unique: true
    t.index ["practice_id"], name: "index_clinic_patients_on_practice_id"
  end

  create_table "clinic_practices", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "clinic_staff_members", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.text "display_name", null: false
    t.string "job_title", null: false
    t.integer "practice_id", null: false
    t.datetime "updated_at", null: false
    t.index ["practice_id"], name: "index_clinic_staff_members_on_practice_id"
  end

  create_table "clinic_stock_movements", force: :cascade do |t|
    t.integer "actor_id", null: false
    t.datetime "created_at", null: false
    t.integer "delta", null: false
    t.integer "item_id", null: false
    t.string "reason", null: false
    t.string "request_key", null: false
    t.datetime "updated_at", null: false
    t.index ["actor_id"], name: "index_clinic_stock_movements_on_actor_id"
    t.index ["item_id", "request_key"], name: "index_clinic_stock_movements_on_item_id_and_request_key", unique: true
    t.index ["item_id"], name: "index_clinic_stock_movements_on_item_id"
  end

  create_table "contact_messages", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.text "email", null: false
    t.text "message", null: false
    t.text "name", null: false
    t.datetime "updated_at", null: false
  end

  create_table "learning_progresses", force: :cascade do |t|
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.integer "material_id", null: false
    t.datetime "started_at", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["material_id"], name: "index_learning_progresses_on_material_id"
    t.index ["user_id", "material_id"], name: "index_learning_progresses_on_user_id_and_material_id", unique: true
    t.index ["user_id"], name: "index_learning_progresses_on_user_id"
  end

  create_table "materials", force: :cascade do |t|
    t.text "body", null: false
    t.datetime "created_at", null: false
    t.datetime "published_at"
    t.boolean "sample", default: false, null: false
    t.string "slug"
    t.text "summary"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["published_at"], name: "index_materials_on_published_at"
    t.index ["slug"], name: "index_materials_on_slug", unique: true
  end

  create_table "member_sessions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["expires_at"], name: "index_member_sessions_on_expires_at"
    t.index ["user_id"], name: "index_member_sessions_on_user_id"
  end

  create_table "paperworks", force: :cascade do |t|
    t.text "body", null: false
    t.string "consent_version"
    t.string "content_digest", null: false
    t.datetime "created_at", null: false
    t.boolean "demo", default: true, null: false
    t.string "document_version", null: false
    t.string "signature_digest"
    t.text "signature_name"
    t.datetime "signed_at"
    t.datetime "started_at"
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["user_id"], name: "index_paperworks_on_user_id"
    t.check_constraint "signed_at IS NULL OR (started_at IS NOT NULL AND signature_name IS NOT NULL AND signature_digest IS NOT NULL)", name: "signed_paperwork_has_evidence"
  end

  create_table "users", force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.boolean "admin", default: false, null: false
    t.datetime "created_at", null: false
    t.string "email_address", null: false
    t.string "password_digest", null: false
    t.datetime "updated_at", null: false
    t.index ["email_address"], name: "index_users_on_email_address", unique: true
  end

  add_foreign_key "clinic_items", "clinic_practices", column: "practice_id"
  add_foreign_key "clinic_memberships", "clinic_practices", column: "practice_id"
  add_foreign_key "clinic_memberships", "users"
  add_foreign_key "clinic_notes", "clinic_patients", column: ["practice_id", "patient_id"], primary_key: ["practice_id", "id"]
  add_foreign_key "clinic_notes", "clinic_practices", column: "practice_id"
  add_foreign_key "clinic_notes", "users", column: "author_id"
  add_foreign_key "clinic_patients", "clinic_practices", column: "practice_id"
  add_foreign_key "clinic_staff_members", "clinic_practices", column: "practice_id"
  add_foreign_key "clinic_stock_movements", "clinic_items", column: "item_id"
  add_foreign_key "clinic_stock_movements", "users", column: "actor_id"
  add_foreign_key "learning_progresses", "materials"
  add_foreign_key "learning_progresses", "users"
  add_foreign_key "member_sessions", "users"
  add_foreign_key "paperworks", "users"
end
