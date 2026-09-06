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
    resources :clinicians, controller: "clinicians", only: :index
    resources :role_versions, controller: "role_versions", only: :index
    resources :appointments, controller: "scheduling/appointments", only: %i[index show create] do
      post :transition, on: :member
    end
    get "tracking_board", to: "scheduling/tracking_board#show"
    get "operation_receipts/:request_key", to: "operation_receipts#show", as: :operation_receipt
    resources :encounters, controller: "scheduling/encounters", only: %i[index show] do
      post :close, on: :member
      post :provider_assignment, on: :member, to: "scheduling/provider_assignments#create"
      resources :notes, controller: "care/encounter_notes", only: %i[index create]
    end
    resources :notes, controller: "care/encounter_notes", only: :show do
      post :revisions, on: :member, action: :revise
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
      post :pause, on: :member
      post :cancel, on: :member
      post :retry, on: :member
      post :dispatch, on: :member, action: :dispatch_reminder
      post :delivery_events, on: :member, action: :record_delivery
    end
      resources :invoices, controller: "billing/invoices", only: :show do
        patch :draft, on: :member, action: :update_draft
      post :post, on: :member
      post :payment_allocations, on: :member, action: :allocate_payment
      post :cash_payments, on: :member, to: "billing/invoices#record_cash_payment"
    end
    get "billing", to: "billing/dashboard#show"
    get "stripe_connect", to: "billing/stripe_connect#show"
    post "stripe_connect/onboard", to: "billing/stripe_connect#onboard"
    post "stripe_connect/refresh", to: "billing/stripe_connect#refresh"
    get "subscription_catalog", to: "care/subscription_catalog#index"
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
      post "suppliers", to: "inventory/supplier_pricing#create"
      patch "suppliers/:id", to: "inventory/supplier_pricing#update"
      post "suppliers/preview", to: "inventory/supplier_pricing#preview"
      post "suppliers/import", to: "inventory/supplier_pricing#import"
      patch "products/:id/preferred-supplier", to: "inventory/supplier_pricing#set_preferred_supplier"
      post "demo", to: "inventory/management#demo"
      get "catalog", to: "inventory/management#catalog"
      post "locations", to: "inventory/management#create_location"
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
      get "controlled", to: "inventory/management#controlled"
      post "controlled/:id/investigate", to: "inventory/management#investigate_control"
      post "controlled/:id/certify", to: "inventory/management#certify_control"
    end
    resources :patients, controller: "care/patients", only: %i[index show create update] do
      get :lookup, on: :collection, to: "care/patients#lookup"
      get :billing_ledger, on: :member, to: "billing/patient_ledgers#show"
      post :note, on: :member
      get "previous_signed_soap", on: :member, to: "care/patient_chart_history#show"
      resource :care_summary, controller: "care/patient_care_summaries", only: :show
      resources :encounters, controller: "scheduling/encounters", only: %i[index create]
      resources :observations, controller: "care/observations", only: %i[index create]
      resources :address_versions, controller: "care/patient_addresses", only: %i[index create]
      resources :documents, controller: "documents", only: :index
      resources :message_intents, controller: "messaging/message_intents", only: %i[index create]
      resources :invoices, controller: "billing/invoices", only: %i[index create]
    end
    resources :inventory, controller: "inventory/items", only: %i[index create] do
      post :adjust, on: :member
    end
    resources :staff, controller: "staff/members", only: %i[index create update]
    scope "staff-messaging", as: "staff_messaging" do
      get "conversations", to: "messaging/staff#index"
      post "conversations", to: "messaging/staff#create_conversation"
      get "conversations/:id", to: "messaging/staff#show"
      post "conversations/:id/messages", to: "messaging/staff#create_message"
      post "conversations/:id/read", to: "messaging/staff#mark_read"
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
      resources :encounters, controller: "encounters", only: %i[create show destroy] do
        post :consent, on: :member
        post :sources, on: :member
        post :generate, on: :member
      end
      resources :drafts, controller: "drafts", only: [] do
        post :review, on: :member
        post :approve, on: :member
        post :export, on: :member
      end
    end
  end
  end
  namespace :api, module: "identity/api" do
    get "csrf", to: "sessions#csrf"
    resource :session, only: %i[show create destroy]
    resource :settings, only: %i[show update]
      resource :development_access, controller: :development_access, only: :update
    post "development_session", to: "sessions#development"
  end
  scope path: "api", as: "api" do
    namespace :patient_portal, module: "clinic/patient_portal" do
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
