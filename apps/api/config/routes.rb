Rails.application.routes.draw do
  post "stripe/connect/webhook", to: "stripe_webhooks#create"
  scope path: "api", as: "api" do
  post "stripe/connect/webhook", to: "stripe_webhooks#create"
  namespace :clinic do
    root "dashboard#show"
    get "context", to: "context#show"
    patch "context", to: "context#update"
    get "note_templates", to: "care/note_templates#index"
    get "facilities", to: "facilities#index"
    post "facilities", to: "facilities#create"
    patch "facilities/:id", to: "facilities#update"
    resources :visit_types, only: %i[create update]
    resources :clinicians, controller: "clinicians", only: :index
    resources :role_versions, controller: "role_versions", only: :index
    resources :appointments, controller: "scheduling/appointments", only: %i[index show create update] do
      post :transition, on: :member
    end
    resources :appointment_requests, controller: "operations/appointment_requests", only: :index do
      post :approve, on: :member
      post :decline, on: :member
    end
    get "tracking_board", to: "scheduling/tracking_board#show"
    namespace :operations do
      get "follow_ups", to: "follow_ups#index"
    end
    get "operation_receipts/:request_key", to: "operation_receipts#show", as: :operation_receipt
    resources :encounters, controller: "scheduling/encounters", only: %i[index show] do
      post :close, on: :member
      post :provider_assignment, on: :member, to: "scheduling/provider_assignments#create"
      resources :notes, controller: "care/encounter_notes", only: %i[index create]
      resources :medication_administrations, controller: "care/medication_administrations", only: %i[index create]
    end
    resources :notes, controller: "care/encounter_notes", only: :show do
      post :revisions, on: :member, action: :revise
      post :corrections, on: :member, action: :correct
      post :signatures, on: :member, action: :sign
    end
    resources :documents, controller: "documents", only: :show do
      get :download, on: :member
    end
    resources :document_categories, controller: "document_categories", only: :index
    resources :message_intents, controller: "messaging/message_intents", only: :show do
      post :delivery_events, on: :member, action: :record_delivery
    end
    resources :reminders, controller: "reminders", only: %i[index show create] do
      post :recover, on: :collection
      post :batch_preview, on: :collection
      post :batch_schedule, on: :collection
      post :staff_handoff, on: :member
      post :pause, on: :member
      post :cancel, on: :member
      post :retry, on: :member
      post :dispatch, on: :member, action: :dispatch_reminder
      post :delivery_events, on: :member, action: :record_delivery
    end
      resources :invoices, controller: "billing/invoices", only: :show do
        patch :draft, on: :member, action: :update_draft
        post :post, on: :member
        post :credits, on: :member, action: :credit
        post :void, on: :member, action: :void_invoice
        post :payment_allocations, on: :member, action: :allocate_payment
        post :cash_payments, on: :member, to: "billing/invoices#record_cash_payment"
        post "online_payment/start", on: :member, to: "billing/invoice_online_payments#start"
        post "online_payment/reconcile", on: :member, to: "billing/invoice_online_payments#reconcile"
        post "online_payment/cancel", on: :member, to: "billing/invoice_online_payments#cancel"
      end
    get "billing", to: "billing/dashboard#show"
    resources :billing_services, only: %i[index create update]
    get "stripe_connect", to: "billing/stripe_connect#show"
    post "stripe_connect/onboard", to: "billing/stripe_connect#onboard"
    post "stripe_connect/refresh", to: "billing/stripe_connect#refresh"
    get "subscription_catalog", to: "care/subscription_catalog#index"
    get "subscription_catalog/storefront_preview", to: "care/subscription_catalog#storefront_preview"
    post "subscription_catalog/:kind", to: "care/subscription_catalog#save"
    patch "subscription_catalog/:kind/:id", to: "care/subscription_catalog#save"
    get "subscription_catalog/packages/:id/preview", to: "care/subscription_catalog#preview"
    post "subscription_catalog/packages/:id/publish", to: "care/subscription_catalog#publish"
    post "subscription_catalog/:kind/:id/retire", to: "care/subscription_catalog#retire"
    resources :subscriptions, controller: "billing/subscriptions", only: :index do
      post :reconcile_ledger, on: :member
      post :review, on: :member
      post :reconcile, on: :member
      post :cancel, on: :member
      post :refund, on: :member
    end
      resources :cash_drawers, controller: "billing/cash_drawers", only: %i[index create] do
        post :close, on: :member
        post :reconcile, on: :member
    end
    resources :payment_events, controller: "billing/payment_events", only: [] do
      post :allocations, on: :member, action: :allocate
      post :cash_refunds, on: :member
      get :receipt, on: :member
    end
    resources :role_grants, controller: "authorization/role_grants", only: %i[index create] do
      post :revoke, on: :member
    end
    resources :pharmacy, controller: "inventory/pharmacy", only: %i[index create show update] do
      collection do
        post :lookup
        post :device_lookup
        post :nadac
        post :import
        post :demo
      end
      post :receive, on: :member
    end
    post "pharmacy_batches/:id/movement", to: "inventory/pharmacy#movement", as: :pharmacy_movement
    post "pharmacy_batches/:id/status", to: "inventory/pharmacy#batch_status", as: :pharmacy_batch_status
    post "pharmacy_batches/:id/count", to: "inventory/pharmacy#count", as: :pharmacy_count
    post "inventory_counts/:id/approve", to: "inventory/pharmacy#approve_count", as: :inventory_count_approval
    post "inventory_configuration", to: "inventory/pharmacy#configure", as: :inventory_configuration
    scope "inventory", as: "inventory_management" do
      get "bootstrap", to: "inventory/management#bootstrap"
      post "scan", to: "inventory/management#scan"
      get "supplier-pricing", to: "inventory/management#supplier_pricing"
      post "suppliers", to: "inventory/supplier_pricing#create"
      patch "suppliers/:id", to: "inventory/supplier_pricing#update"
      post "suppliers/preview", to: "inventory/supplier_pricing#preview"
      post "suppliers/import", to: "inventory/supplier_pricing#import"
      patch "products/:id/preferred-supplier", to: "inventory/supplier_pricing#set_preferred_supplier"
      post "demo", to: "inventory/management#demo"
      get "catalog", to: "inventory/management#catalog"
      get "exceptions", to: "inventory/management#exceptions"
      post "exceptions/reviews", to: "inventory/management#review_exception"
      get "locations", to: "inventory/management#locations"
      post "locations", to: "inventory/management#create_location"
      patch "locations/:id", to: "inventory/management#update_location"
      patch "products/:id", to: "inventory/management#update_product"
      get "replenishment", to: "inventory/management#replenishment"
      get "purchase-cart", to: "inventory/management#purchase_cart"
      patch "purchase-cart", to: "inventory/management#update_purchase_cart"
      post "purchase-cart/items", to: "inventory/management#add_purchase_cart_item"
      patch "purchase-cart/items/:id", to: "inventory/management#update_purchase_cart_item"
      delete "purchase-cart/items/:id", to: "inventory/management#remove_purchase_cart_item"
      post "purchase-cart/checkout", to: "inventory/management#checkout_purchase_cart"
      get "purchase-orders", to: "inventory/management#purchase_orders"
      post "purchase-orders", to: "inventory/management#create_purchase_order"
      get "purchase-orders/:id", to: "inventory/management#purchase_order"
      get "purchase-orders/:id/reconciliation", to: "inventory/reconciliations#show"
      post "purchase-orders/:id/receiving-sessions", to: "inventory/reconciliations#receive"
      post "purchase-orders/:id/returns", to: "inventory/reconciliations#return_stock"
      post "purchase-orders/:id/credits", to: "inventory/reconciliations#credit"
      post "purchase-orders/:id/invoices", to: "inventory/reconciliations#invoice"
      post "purchase-orders/:id/transition", to: "inventory/management#transition_purchase_order"
      post "purchase-orders/:id/cancel-remainder", to: "inventory/management#cancel_remainder"
      post "shipments", to: "inventory/management#create_shipment"
      get "receiving", to: "inventory/management#receiving"
      post "receipts", to: "inventory/management#create_receipt"
      get "lots", to: "inventory/management#lots"
      post "lots/:id/transfer", to: "inventory/management#create_transfer"
      post "lots/:id/adjust", to: "inventory/management#create_adjustment"
      post "lots/:id/count", to: "inventory/management#create_count"
      post "counts/:id/approve", to: "inventory/management#approve_count"
      get "activity", to: "inventory/management#activity"
      get "recalls", to: "inventory/management#recalls"
      post "recalls", to: "inventory/management#create_recall"
      post "recalls/:id/disposition", to: "inventory/management#create_disposition"
      post "recalls/:id/contain", to: "inventory/management#contain_recall"
      post "recalls/:id/close", to: "inventory/management#close_recall"
      get "count-sessions", to: "inventory/management#count_sessions"
      post "count-sessions", to: "inventory/management#create_count_session"
      post "count-sessions/:id/reassign", to: "inventory/management#reassign_count_session"
      post "count-sessions/:id/complete", to: "inventory/management#complete_count_session"
      post "count-sessions/:id/cancel", to: "inventory/management#cancel_count_session"
      post "count-session-lines/:id/observe", to: "inventory/management#observe_session_line"
      post "count-session-lines/:id/skip", to: "inventory/management#skip_session_line"
      post "count-session-lines/:id/resume", to: "inventory/management#resume_session_line"
      get "controlled", to: "inventory/management#controlled"
      post "controlled/:id/investigate", to: "inventory/management#investigate_control"
      post "controlled/:id/certify", to: "inventory/management#certify_control"
    end
    get "lab_reports/review_queue", to: "care/lab_reports#review_queue"
    get "lab_reports/follow_up_queue", to: "care/lab_reports#follow_up_queue"
    resources :patients, controller: "care/patients", only: %i[index show create update] do
      get :lookup, on: :collection, to: "care/patients#lookup"
      get :billing_ledger, on: :member, to: "billing/patient_ledgers#show"
      post :note, on: :member
      get "previous_signed_soap", on: :member, to: "care/patient_chart_history#show"
      resource :care_summary, controller: "care/patient_care_summaries", only: :show
      get "clinical_history", to: "care/clinical_history#index", as: :clinical_history
      post "clinical_history/reviews", to: "care/clinical_history#review", as: :clinical_history_reviews
      post "clinical_history/:kind", to: "care/clinical_history#create", as: nil
      patch "clinical_history/:kind/:id", to: "care/clinical_history#update", as: nil
      resources :encounters, controller: "scheduling/encounters", only: %i[index create]
      resources :observations, controller: "care/observations", only: %i[index create]
      resources :lab_reports, controller: "care/lab_reports", only: %i[index show create] do
        post :versions, on: :member, action: :create_version
        post "versions/:version_id/review", on: :member, action: :review, as: :review_version
        post "versions/:version_id/follow_up", on: :member, action: :record_follow_up, as: :record_follow_up
        post "versions/:version_id/follow_up/complete", on: :member, action: :complete_follow_up, as: :complete_follow_up
      end
      resources :address_versions, controller: "care/patient_addresses", only: %i[index create]
      resources :documents, controller: "documents", only: :index
      resources :message_intents, controller: "messaging/message_intents", only: %i[index create]
      resources :invoices, controller: "billing/invoices", only: %i[index create]
    end
    resources :inventory, controller: "inventory/items", only: %i[index create] do
      post :adjust, on: :member
    end
    resources :staff, controller: "staff/members", only: %i[index create update]
    namespace :workforce do
      resources :badges, only: %i[index create] do
        post :revoke, on: :member
      end
      resources :kiosks, only: %i[index create] do
        post :revoke, on: :member
      end
      resources :timecards, only: %i[index show] do
        post :calculate, on: :collection
        post :submit, on: :member
        post :approve, on: :member
      end
      resources :adjustments, only: %i[index create] do
        post :decide, on: :member
      end
      resources :employments, only: %i[index create update]
      get "settings", to: "settings#show"
      put "settings", to: "settings#update"
      post "onboarding", to: "onboarding#create"
      patch "onboarding/:id", to: "onboarding#update"
      get "schedules", to: "schedules#index"
      get "my-schedule", to: "schedules#employee"
      get "schedule-drafts/:id", to: "schedules#show_draft"
      post "schedule-templates", to: "schedules#create_template"
      patch "schedule-templates/:id", to: "schedules#update_template"
      post "schedule-drafts", to: "schedules#create_draft"
      post "schedule-drafts/:id/shifts", to: "schedules#upsert_shift"
      delete "schedule-drafts/:id/shifts/:shift_id", to: "schedules#destroy_shift"
      post "schedule-drafts/:id/validate", to: "schedules#validate_draft"
      post "schedule-drafts/:id/publish", to: "schedules#publish"
      get "requests", to: "workforce_requests#index"
      post "availability", to: "workforce_requests#create_availability"
      post "time-off-requests", to: "workforce_requests#create_time_off"
      post "shift-swap-requests", to: "workforce_requests#create_swap"
      post "requests/:id/decision", to: "workforce_requests#decision"
      get "payroll-exports", to: "payroll_exports#index"
      post "payroll-exports/configuration", to: "payroll_exports#configure"
      post "payroll-exports/preview", to: "payroll_exports#preview"
      post "payroll-exports", to: "payroll_exports#create"
      get "payroll-exports/:id/download", to: "payroll_exports#download"
    end
    scope "staff-messaging", as: "staff_messaging" do
      get "conversations", to: "messaging/staff#index"
      post "conversations", to: "messaging/staff#create_conversation"
      get "conversations/:id", to: "messaging/staff#show"
      post "conversations/:id/messages", to: "messaging/staff#create_message"
      post "conversations/:id/read", to: "messaging/staff#mark_read"
      post "conversations/:id/recover", to: "messaging/staff#recover"
      get "participants", to: "messaging/staff#participants"
      get "notifications", to: "messaging/staff#notifications"
      post "notifications/:id/read", to: "messaging/staff#read_notification"
      get "preferences", to: "messaging/staff#preferences"
      patch "preferences", to: "messaging/staff#preferences"
      post "messages/:id/acknowledge", to: "messaging/staff#acknowledge"
      post "requests/:id/transition", to: "messaging/staff#transition"
      post "requests/:id/escalate", to: "messaging/staff#escalate"
      post "messages/:message_id/attachments", to: "messaging/staff#presign_attachment"
      post "attachments/:id/complete", to: "messaging/staff#complete_attachment"
      get "attachments/:id/download", to: "messaging/staff#download_attachment"
    end
    namespace :patient_portal do
      resources :invitations, only: :create
      post "identities/:id/revoke", to: "identity_lifecycle#revoke"
    end
    namespace :scribe do
      resources :templates, only: :index
      resources :encounters, controller: "encounters", only: %i[index create show destroy] do
        resources :recordings, only: %i[index create]
        patch :context, on: :member
        post :bind_clinical_encounter, on: :member
        post :lab_selections, on: :member
        post :consent, on: :member
        post :sources, on: :member
        post :generate, on: :member
      end
      resources :recordings, only: :show do
        post :chunk, on: :member
        post :finalize, on: :member
        post :transcribe, on: :member
        post :interrupt, on: :member
        delete :cancel, on: :member, path: ""
      end
      resources :drafts, controller: "drafts", only: [] do
        post :sections, on: :member
        post :restore, on: :member
        post :review, on: :member
        post :approve, on: :member
        post :export, on: :member
      end
    end
  end
  end
  namespace :api, module: "identity/api" do
    post "employee_activation", to: "employee_activations#create"
    get "csrf", to: "sessions#csrf"
    resource :session, only: %i[show create update destroy]
    resource :settings, only: %i[show update]
      resource :development_access, controller: :development_access, only: :update
    post "development_session", to: "sessions#development"
    patch "development_date", to: "sessions#development_date"
  end
  scope "api/workforce/kiosk", controller: "workforce/kiosk_clock" do
    get "/", action: :show
    post "enroll", action: :enroll
    post "challenges", action: :challenge
    post "punches", action: :create_punch
    get "punches/status", action: :status
  end
  scope path: "api", as: "api" do
    namespace :patient_portal, module: "clinic/patient_portal" do
      resources :invoices, only: [] do
        post "online_payment/start", on: :member, to: "invoice_online_payments#start"
        post "online_payment/reconcile", on: :member, to: "invoice_online_payments#reconcile"
        post "online_payment/cancel", on: :member, to: "invoice_online_payments#cancel"
      end
      resources :subscriptions, only: :index do
        post :quote, on: :collection
        post :checkout, on: :collection
        post :pay, on: :member
        post :reconcile, on: :member
        post :cancel, on: :member
        get :receipt, on: :member
      end
      get "context", to: "context#show"
      get "reminders", to: "reminders#index"
      post "reminders/:id/actions", to: "reminders#action"
      get "reminder_preferences", to: "reminder_preferences#show"
      post "reminder_preferences", to: "reminder_preferences#update"
      resources :appointment_requests, only: %i[index create]
      resources :requests, controller: "requests", only: %i[index create]
      patch "development_patient", to: "development_patient#update"
      post "invitation/activate", to: "activation#create"
      post "step_up", to: "step_up#create"
      post "recovery", to: "recovery#create"
    end
  end
  namespace :api, module: "launch/api" do
    resources :materials, only: %i[index show]
    post "materials/:material_id/start", to: "learning_progresses#start"
    post "materials/:material_id/complete", to: "learning_progresses#complete"
    resources :paperworks, only: %i[index show] do
      post :start, on: :member
      post :sign, on: :member
      get :receipt, on: :member
    end
    resources :contact_messages, only: :create
    resources :inquiries, only: :index
  end
  get "up" => "rails/health#show", as: :rails_health_check
end
