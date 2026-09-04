class CreateStaffMessaging < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_staff_conversations do |t|
      t.bigint :practice_id, null: false
      t.bigint :site_id
      t.string :kind, null: false
      t.string :title
      t.string :status, null: false, default: "active"
      t.bigint :created_by_membership_id, null: false
      t.string :retention_class, null: false, default: "routine"
      t.datetime :last_message_at
      t.timestamps
    end
    add_foreign_key :clinic_staff_conversations, :clinic_practices, column: :practice_id, name: "fk_staff_conversations_practice"
    add_foreign_key :clinic_staff_conversations, :clinic_sites, column: [ :practice_id, :site_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_conversations_site"
    add_foreign_key :clinic_staff_conversations, :clinic_memberships, column: [ :practice_id, :created_by_membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_conversations_creator"
    add_index :clinic_staff_conversations, [ :practice_id, :id ], unique: true, name: "clinic_staff_conversations_practice_id"
    add_index :clinic_staff_conversations, [ :practice_id, :site_id, :last_message_at ], name: "clinic_staff_conversations_recent"
    add_check_constraint :clinic_staff_conversations, "kind IN ('direct','team','role') AND status IN ('active','archived','locked') AND retention_class IN ('routine','time_sensitive','urgent','safety_critical')", name: "staff_conversations_values"

    create_table :clinic_staff_conversation_members do |t|
      t.bigint :practice_id, null: false
      t.bigint :conversation_id, null: false
      t.bigint :membership_id, null: false
      t.string :membership_state, null: false, default: "active"
      t.string :notification_policy, null: false, default: "all"
      t.bigint :last_read_message_id
      t.datetime :last_read_at
      t.datetime :joined_at, null: false
      t.datetime :removed_at
      t.bigint :removed_by_membership_id
      t.timestamps
    end
    add_foreign_key :clinic_staff_conversation_members, :clinic_practices, column: :practice_id, name: "fk_staff_conversation_members_practice"
    add_foreign_key :clinic_staff_conversation_members, :clinic_staff_conversations, column: [ :practice_id, :conversation_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_conversation_members_conversation"
    add_foreign_key :clinic_staff_conversation_members, :clinic_memberships, column: [ :practice_id, :membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_conversation_members_membership"
    add_foreign_key :clinic_staff_conversation_members, :clinic_memberships, column: [ :practice_id, :removed_by_membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_conversation_members_remover"
    add_index :clinic_staff_conversation_members, [ :practice_id, :conversation_id, :membership_id ], unique: true, name: "clinic_staff_conversation_members_identity"
    add_index :clinic_staff_conversation_members, [ :practice_id, :membership_id, :membership_state ], name: "clinic_staff_conversation_members_visible"
    add_check_constraint :clinic_staff_conversation_members, "membership_state IN ('active','removed') AND notification_policy IN ('all','muted')", name: "staff_conversation_members_values"

    create_table :clinic_staff_messages do |t|
      t.bigint :practice_id, null: false
      t.bigint :conversation_id, null: false
      t.bigint :sender_membership_id, null: false
      t.bigint :reply_to_message_id
      t.text :body, null: false
      t.string :message_class, null: false, default: "routine"
      t.string :status, null: false, default: "active"
      t.string :request_key, null: false
      t.string :linked_object_type
      t.bigint :linked_object_id
      t.string :requested_action
      t.datetime :response_due_at
      t.boolean :acknowledgement_required, null: false, default: false
      t.datetime :acknowledged_at
      t.bigint :acknowledged_by_membership_id
      t.timestamps
    end
    add_foreign_key :clinic_staff_messages, :clinic_practices, column: :practice_id, name: "fk_staff_messages_practice"
    add_foreign_key :clinic_staff_messages, :clinic_staff_conversations, column: [ :practice_id, :conversation_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_messages_conversation"
    add_foreign_key :clinic_staff_messages, :clinic_memberships, column: [ :practice_id, :sender_membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_messages_sender"
    add_foreign_key :clinic_staff_messages, :clinic_staff_messages, column: [ :practice_id, :reply_to_message_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_messages_reply"
    add_foreign_key :clinic_staff_messages, :clinic_memberships, column: [ :practice_id, :acknowledged_by_membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_messages_acknowledger"
    add_index :clinic_staff_messages, [ :practice_id, :conversation_id, :created_at, :id ], name: "clinic_staff_messages_history"
    add_index :clinic_staff_messages, [ :practice_id, :sender_membership_id, :request_key ], unique: true, name: "clinic_staff_messages_idempotency"
    add_check_constraint :clinic_staff_messages, "message_class IN ('routine','time_sensitive','urgent','safety_critical') AND status IN ('active','retracted','expired') AND length(trim(request_key)) > 0", name: "staff_messages_values"

    create_table :clinic_staff_message_receipts do |t|
      t.bigint :practice_id, null: false
      t.bigint :message_id, null: false
      t.bigint :recipient_membership_id, null: false
      t.datetime :delivered_at
      t.datetime :presented_at
      t.datetime :read_at
      t.datetime :acknowledged_at
      t.text :acknowledgement_note
      t.timestamps
    end
    add_foreign_key :clinic_staff_message_receipts, :clinic_practices, column: :practice_id, name: "fk_staff_message_receipts_practice"
    add_foreign_key :clinic_staff_message_receipts, :clinic_staff_messages, column: [ :practice_id, :message_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_message_receipts_message"
    add_foreign_key :clinic_staff_message_receipts, :clinic_memberships, column: [ :practice_id, :recipient_membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_message_receipts_recipient"
    add_index :clinic_staff_message_receipts, [ :practice_id, :message_id, :recipient_membership_id ], unique: true, name: "clinic_staff_message_receipts_identity"

    create_table :clinic_staff_message_requests do |t|
      t.bigint :practice_id, null: false
      t.bigint :message_id, null: false
      t.bigint :assignee_membership_id
      t.string :state, null: false, default: "open"
      t.datetime :due_at, null: false
      t.datetime :resolved_at
      t.string :resolution_code
      t.text :resolution_note
      t.timestamps
    end
    add_foreign_key :clinic_staff_message_requests, :clinic_practices, column: :practice_id, name: "fk_staff_message_requests_practice"
    add_foreign_key :clinic_staff_message_requests, :clinic_staff_messages, column: [ :practice_id, :message_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_message_requests_message"
    add_foreign_key :clinic_staff_message_requests, :clinic_memberships, column: [ :practice_id, :assignee_membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_message_requests_assignee"
    add_index :clinic_staff_message_requests, [ :practice_id, :message_id ], unique: true, name: "clinic_staff_message_requests_message"
    add_check_constraint :clinic_staff_message_requests, "state IN ('open','acknowledged','in_progress','resolved','declined','expired')", name: "staff_message_requests_state"

    create_table :clinic_staff_message_escalations do |t|
      t.bigint :practice_id, null: false
      t.bigint :message_id, null: false
      t.bigint :request_id, null: false
      t.integer :level, null: false
      t.string :trigger, null: false
      t.datetime :triggered_at, null: false
      t.bigint :target_membership_id, null: false
      t.string :delivery_state, null: false, default: "pending"
      t.string :dedupe_key, null: false
      t.datetime :resolved_at
      t.timestamps
    end
    add_foreign_key :clinic_staff_message_escalations, :clinic_practices, column: :practice_id, name: "fk_staff_message_escalations_practice"
    add_foreign_key :clinic_staff_message_escalations, :clinic_staff_messages, column: [ :practice_id, :message_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_message_escalations_message"
    add_foreign_key :clinic_staff_message_escalations, :clinic_staff_message_requests, column: [ :practice_id, :request_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_message_escalations_request"
    add_foreign_key :clinic_staff_message_escalations, :clinic_memberships, column: [ :practice_id, :target_membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_message_escalations_target"
    add_index :clinic_staff_message_escalations, [ :practice_id, :dedupe_key ], unique: true, name: "clinic_staff_message_escalations_dedupe"
    add_check_constraint :clinic_staff_message_escalations, "level > 0 AND delivery_state IN ('pending','delivered','failed')", name: "staff_message_escalations_values"

    create_table :clinic_staff_message_attachments do |t|
      t.bigint :practice_id, null: false
      t.bigint :message_id, null: false
      t.string :storage_key, null: false
      t.string :content_type, null: false
      t.bigint :byte_size, null: false
      t.string :checksum, null: false
      t.string :scan_state, null: false, default: "quarantined"
      t.bigint :created_by_membership_id, null: false
      t.datetime :expires_at
      t.datetime :deleted_at
      t.timestamps
    end
    add_foreign_key :clinic_staff_message_attachments, :clinic_practices, column: :practice_id, name: "fk_staff_message_attachments_practice"
    add_foreign_key :clinic_staff_message_attachments, :clinic_staff_messages, column: [ :practice_id, :message_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_message_attachments_message"
    add_foreign_key :clinic_staff_message_attachments, :clinic_memberships, column: [ :practice_id, :created_by_membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_message_attachments_creator"
    add_index :clinic_staff_message_attachments, [ :practice_id, :message_id, :id ], name: "clinic_staff_message_attachments_history"
    add_check_constraint :clinic_staff_message_attachments, "byte_size >= 0 AND scan_state IN ('quarantined','clean','rejected','expired')", name: "staff_message_attachments_values"

    create_table :clinic_staff_notifications do |t|
      t.bigint :practice_id, null: false
      t.bigint :recipient_membership_id, null: false
      t.bigint :conversation_id, null: false
      t.bigint :message_id
      t.string :category, null: false
      t.string :title, null: false
      t.datetime :read_at
      t.timestamps
    end
    add_foreign_key :clinic_staff_notifications, :clinic_practices, column: :practice_id, name: "fk_staff_notifications_practice"
    add_foreign_key :clinic_staff_notifications, :clinic_staff_conversations, column: [ :practice_id, :conversation_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_notifications_conversation"
    add_foreign_key :clinic_staff_notifications, :clinic_staff_messages, column: [ :practice_id, :message_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_notifications_message"
    add_foreign_key :clinic_staff_notifications, :clinic_memberships, column: [ :practice_id, :recipient_membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_notifications_recipient"
    add_index :clinic_staff_notifications, [ :practice_id, :recipient_membership_id, :read_at, :created_at ], name: "clinic_staff_notifications_inbox"

    create_table :clinic_staff_notification_preferences do |t|
      t.bigint :practice_id, null: false
      t.bigint :membership_id, null: false
      t.boolean :routine_enabled, null: false, default: true
      t.boolean :urgent_enabled, null: false, default: true
      t.timestamps
    end
    add_foreign_key :clinic_staff_notification_preferences, :clinic_practices, column: :practice_id, name: "fk_staff_notification_preferences_practice"
    add_foreign_key :clinic_staff_notification_preferences, :clinic_memberships, column: [ :practice_id, :membership_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_notification_preferences_membership"
    add_index :clinic_staff_notification_preferences, [ :practice_id, :membership_id ], unique: true, name: "clinic_staff_notification_preferences_identity"

    create_table :clinic_staff_message_outbox do |t|
      t.bigint :practice_id, null: false
      t.bigint :message_id, null: false
      t.string :event_type, null: false
      t.string :delivery_state, null: false, default: "pending"
      t.integer :attempts, null: false, default: 0
      t.datetime :available_at, null: false
      t.datetime :delivered_at
      t.string :last_error
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_foreign_key :clinic_staff_message_outbox, :clinic_practices, column: :practice_id, name: "fk_staff_message_outbox_practice"
    add_foreign_key :clinic_staff_message_outbox, :clinic_staff_messages, column: [ :practice_id, :message_id ], primary_key: [ :practice_id, :id ], name: "fk_staff_message_outbox_message"
    add_index :clinic_staff_message_outbox, [ :practice_id, :message_id, :event_type ], unique: true, name: "clinic_staff_message_outbox_identity"
    add_check_constraint :clinic_staff_message_outbox, "delivery_state IN ('pending','in_flight','delivered','failed') AND attempts >= 0", name: "staff_message_outbox_values"
  end
end
