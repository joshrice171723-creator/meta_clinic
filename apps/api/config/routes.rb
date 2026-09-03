Rails.application.routes.draw do
  scope path: "api", as: "api" do
  namespace :clinic do
    root "dashboard#show"
    get "context", to: "context#show"
    get "note_templates", to: "care/note_templates#index"
    get "facilities", to: "facilities#index"
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
    resources :invoices, controller: "billing/invoices", only: :show do
      post :post, on: :member
      post :payment_allocations, on: :member, action: :allocate_payment
    end
    get "billing", to: "billing/dashboard#show"
    resources :role_grants, controller: "authorization/role_grants", only: %i[index create] do
      post :revoke, on: :member
    end
    resources :pharmacy, controller: "inventory/pharmacy", only: %i[index create show update] do
      collection do
        post :lookup
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
      post "demo", to: "inventory/management#demo"
      get "catalog", to: "inventory/management#catalog"
      patch "products/:id", to: "inventory/management#update_product"
      get "replenishment", to: "inventory/management#replenishment"
      get "purchase-orders", to: "inventory/management#purchase_orders"
      post "purchase-orders", to: "inventory/management#create_purchase_order"
      get "purchase-orders/:id", to: "inventory/management#purchase_order"
      post "purchase-orders/:id/transition", to: "inventory/management#transition_purchase_order"
      post "purchase-orders/:id/cancel-remainder", to: "inventory/management#cancel_remainder"
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
  end
  end
  namespace :api, module: "identity/api" do
    get "csrf", to: "sessions#csrf"
    resource :session, only: %i[show create destroy]
    resource :settings, only: %i[show update]
      resource :development_access, controller: :development_access, only: :update
    post "development_session", to: "sessions#development"
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
