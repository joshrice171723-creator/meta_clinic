Rails.application.routes.draw do
  post "stripe/connect/webhook", to: "stripe_webhooks#create"
  post "api/integrations/telehealth/daily/events", to: "integrations/telehealth/daily_events#create"
  post "api/integrations/telehealth/twilio/events", to: "integrations/telehealth/twilio_events#create"
  scope path: "api", as: "api" do
  get "qa", to: "qa/workspace#show"
  get "qa/status.json", to: "qa/workspace#status"
  get "qa/issues.json", to: "qa/workspace#issues"
  get "qa/atlas.json", to: "qa/workspace#atlas"
  get "qa/retest.json", to: "qa/workspace#retest"
  get "qa/batches.json", to: "qa/workspace#batches"
  get "qa/tasks", to: "qa/workspace#tasks"
  get "qa/room", to: "qa/workspace#room"
  post "qa/room/messages", to: "qa/workspace#create_room_message"
  post "qa/tasks", to: "qa/workspace#create_task"
  post "qa/tasks/:id/transition", to: "qa/workspace#transition"
  post "qa/events", to: "qa/workspace#create_event"
  post "qa/state", to: "qa/workspace#update_state"
  post "qa/coverage", to: "qa/workspace#import_coverage"
  post "qa/issues/:id/priority", to: "qa/workspace#priority"
  get "qa/evidence/:id", to: "qa/workspace#evidence"
  post "qa/evidence", to: "qa/workspace#create_evidence"
  post "qa/baseline", to: "qa/workspace#baseline"
  post "qa/pin", to: "qa/workspace#pin"
  post "qa/tasks/:id/approval", to: "qa/workspace#approval"
  get "qa/notifications", to: "qa/workspace#notifications"
  post "qa/notifications/:id/receipt", to: "qa/workspace#notification_receipt"
  post "stripe/connect/webhook", to: "stripe_webhooks#create"
  get "owner/command_center", to: "platform/api/command_center#show"
  post "owner/review_packets", to: "platform/api/command_center#create_review_packet"
  post "owner/review_packets/:id/decision", to: "platform/api/command_center#record_review_decision"
  post "public/page_visits", to: "platform/api/page_visits#create"
  post "owner/clinics", to: "platform/api/command_center#create"
  post "owner/clinics/:id/owner_invitation", to: "platform/api/command_center#invite_owner"
  get "public/membership_storefronts", to: "public/membership_storefronts#index"
  get "public/clinic_services/:slug", to: "public/clinic_services#show"
  get "public/clinic_services/:slug/logo", to: "public/clinic_services#logo"
  post "public/clinic_services/:slug/inquiries", to: "public/clinic_services#create"
  get "demo/run", to: "development/demo_runs#show"
  post "demo/lesson", to: "development/demo_runs#lesson"
  post "demo/lesson/complete", to: "development/demo_runs#complete"
  post "demo/run/view", to: "development/demo_runs#view"
  post "demo/run/resume", to: "development/demo_runs#resume"
  post "demo/run/enrollment", to: "development/demo_runs#enrollment"
  post "demo/run/reset", to: "development/demo_runs#reset"
  post "demo/visitor", to: "development/demo_runs#register_visitor"
  post "demo/feedback", to: "development/demo_runs#create_feedback"
  get "public/membership_storefronts/:slug", to: "public/membership_storefronts#show"
  post "public/membership_storefronts/:slug/prospects", to: "public/membership_storefronts#create"
  post "public/membership_storefronts/:slug/accounts", to: "public/membership_storefronts#create_account"
  post "public/membership_storefronts/:slug/checkouts", to: "public/membership_storefronts#checkout"
  post "public/membership_storefronts/:slug/checkouts/handoff", to: "public/membership_storefronts#handoff"
  post "public/membership_accounts/activate", to: "public/membership_storefronts#activate_account"
  get "public/membership_accounts/current", to: "public/membership_storefronts#current_account"
  post "public/membership_accounts/checkout", to: "public/membership_storefronts#resume_checkout"
  post "public/membership_accounts/local_payment", to: "public/local_membership_payments#create"
  namespace :clinic do
    root "dashboard#show"
    get "realtime/events", to: "realtime/events#show"
    get "context", to: "context#show"
    patch "context", to: "context#update"
    get "working_drafts/:kind", to: "working_drafts#show"
    put "working_drafts/:kind", to: "working_drafts#update"
    namespace :telehealth do
      get "booking_options", to: "booking_options#show"
      get "visits", to: "visits#index"
      get "visits/:visit_id", to: "visits#show"
      post "visits/:visit_id/start_encounter", to: "visits#start_encounter"
      post "visits/:visit_id/verify_preparation", to: "visits#verify_preparation"
      post "visits/:visit_id/prepare_room", to: "visits#prepare_room"
      post "visits/:visit_id/participants", to: "participants#create"
      post "visits/:visit_id/participants/:id/admit", to: "participants#admit"
      post "visits/:visit_id/participants/:id/remove", to: "participants#remove"
      post "visits/:visit_id/join_grant", to: "visits#join_grant"
      post "visits/:visit_id/leave", to: "visits#leave"
      post "visits/:visit_id/end", to: "visits#end_visit"
      post "visits/:visit_id/extend", to: "visits#extend_visit"
      post "visits/:visit_id/resume", to: "visits#resume"
      post "visits/:visit_id/reconcile", to: "visits#reconcile"
      post "visits/:visit_id/save_wrap_up", to: "visits#save_wrap_up"
      post "visits/:visit_id/finalize_wrap_up", to: "visits#finalize_wrap_up"
      get "settings", to: "settings#show"
      put "settings/draft", to: "settings#draft"
      post "settings/publish", to: "settings#publish"
      post "settings/check_connection", to: "settings#check_connection"
      post "settings/disable", to: "settings#disable"
      get "visits/:visit_id/scribe_context", to: "scribe#context"
      post "visits/:visit_id/request_scribe", to: "scribe#request_scribe"
      post "visits/:visit_id/scribe_consent", to: "scribe#consent"
      post "visits/:visit_id/start_scribe_capture", to: "scribe#start_capture"
      post "visits/:visit_id/renew_scribe_capture", to: "scribe#renew_capture"
      post "visits/:visit_id/release_scribe_capture", to: "scribe#release_capture"
      post "visits/:visit_id/take_over_scribe_capture", to: "scribe#take_over_capture"
    end
    get "note_templates", to: "care/note_templates#index"
    get "work_exceptions", to: "work_exceptions#show"
    resources :recalls, controller: "operations/recalls", only: %i[index show] do
      post :events, on: :member, action: :create_event
    end
    resources :waitlist, controller: "scheduling/waitlist", only: %i[index create] do
      post :transition, on: :member
    end
    resources :capacity, controller: "scheduling/capacity", only: %i[index create] do
      post :deactivate, on: :member
    end
    resources :refill_requests, controller: "care/refill_requests", only: %i[index create] do
      post :transition, on: :member
      post :retry_delivery, on: :member
    end
    get "facilities", to: "facilities#index"
    post "facilities", to: "facilities#create"
    post "facilities/departments", to: "facilities#create_department"
    post "facilities/:id/rooms", to: "facilities#create_room"
    patch "facilities/:id/rooms/:room_id", to: "facilities#update_room"
    patch "facilities/:id", to: "facilities#update"
    get "facilities/:site_id/scheduling_policy", to: "scheduling/site_policies#show"
    patch "facilities/:site_id/scheduling_policy", to: "scheduling/site_policies#update"
    get "practice_features/history", to: "practice_features#history"
    resource :practice_features, only: %i[show update]
    resources :visit_types, only: %i[create update]
    resources :clinicians, controller: "clinicians", only: %i[index create] do
      post :assign_site, on: :member
    end
    resources :role_versions, controller: "role_versions", only: :index
    resources :appointments, controller: "scheduling/appointments", only: %i[index show create update] do
      post :transition, on: :member
    end
    post "appointment_series/preview", to: "scheduling/appointment_series#preview"
    resources :appointment_series, controller: "scheduling/appointment_series", only: %i[create show]
    post "appointment_series/:id/preview_change", to: "scheduling/appointment_series#preview_change"
    post "appointment_series/:id/change_future", to: "scheduling/appointment_series#change_future"
    post "appointment_series/:id/cancel_future", to: "scheduling/appointment_series#cancel_future"
    resources :appointment_requests, controller: "operations/appointment_requests", only: :index do
      post :approve, on: :member
      post :decline, on: :member
    end
    get "tracking_board", to: "scheduling/tracking_board#show"
    get "schedule_calendar", to: "scheduling/calendar#show"
    get "reports/daily_visits_by_state", to: "reports/daily_visits_by_state#show"
    get "reports/daily_invoices", to: "reports/daily_invoices#show"
    get "reports/daily_stock_movements", to: "reports/daily_stock_movements#show"
    get "reports/daily_payment_activity", to: "reports/daily_payment_activity#show"
    get "reports/open_clinical_work", to: "reports/open_clinical_work#show"
    get "reports/payment_collection_activity", to: "reports/payment_collection_activity#show"
    get "reports/reminder_delivery_activity", to: "reports/reminder_delivery_activity#show"
    get "reports/prescription_simulator_activity", to: "reports/prescription_simulator_activity#show"
    get "reports/current_stock", to: "reports/current_stock#show"
    get "reports/daily_cash_drawers", to: "reports/daily_cash_drawers#show"
    resources :day_end_reviews, controller: "reports/day_end_reviews", only: %i[index create]
    get "reports/scribe_activity", to: "reports/scribe_activity#show"
    namespace :operations do
      get "follow_ups", to: "follow_ups#index"
      get "configuration_manifest", to: "configuration_manifest#show"
      patch "encounter_follow_ups/:id", to: "encounter_follow_ups#update"
    end
    get "encounters/:encounter_id/follow_up", to: "operations/encounter_follow_ups#show"
    put "encounters/:encounter_id/follow_up", to: "operations/encounter_follow_ups#upsert"
    get "operation_receipts/:request_key", to: "operation_receipts#show", as: :operation_receipt
    resources :encounters, controller: "scheduling/encounters", only: %i[index show] do
      get :completion, on: :member
      post :close, on: :member
      post :provider_assignment, on: :member, to: "scheduling/provider_assignments#create"
      post "intake_ownership/claim", to: "scheduling/intake_ownership#claim"
      post "intake_ownership/release", to: "scheduling/intake_ownership#release"
      resources :notes, controller: "care/encounter_notes", only: %i[index create]
      resource :psychotherapy_note, controller: "care/psychotherapy_notes", only: %i[show update]
      resources :medication_administrations, controller: "care/medication_administrations", only: %i[index create]
    end
      get "patients/:patient_id/encounters/:encounter_id/nurse_workspace", to: "care/nurse_workflow#show"
      patch "patients/:patient_id/encounters/:encounter_id/room", to: "scheduling/encounters#assign_room"
      resources :patients, only: [] do
        resources :encounters, only: [] do
          resources :education_events, controller: "care/patient_education_events", only: %i[index create]
        end
      end
    post "patients/:patient_id/encounters/:encounter_id/intake_revisions", to: "care/nurse_workflow#revise_intake"
    post "patients/:patient_id/encounters/:encounter_id/handoffs", to: "care/nurse_workflow#request_handoff"
    post "patients/:patient_id/encounters/:encounter_id/clinical_tasks", to: "care/nurse_workflow#create_task"
    patch "handoffs/:id", to: "care/nurse_workflow#transition_handoff"
    patch "clinical_tasks/:id", to: "care/nurse_workflow#transition_task"
    resources :pharmacy_destinations, controller: "care/pharmacy_destinations", only: %i[index create]
    get "patients/:patient_id/medication_request_series", to: "care/prescription_order_series#index"
    get "patients/:patient_id/medication_requests/:medication_request_id/events", to: "care/prescription_events#index"
    post "patients/:patient_id/medication_requests/:medication_request_id/events", to: "care/prescription_events#create"
    post "patients/:patient_id/medication_requests/:medication_request_id/submit", to: "care/prescription_events#submit"
    post "patients/:patient_id/medication_requests/:medication_request_id/dispenses", to: "care/prescription_events#dispense"
    get "patients/:patient_id/encounters/:encounter_id/clinical_plan_workspace",
      to: "care/clinical_plan_workspace#show"
    post "patients/:patient_id/encounters/:encounter_id/medication_requests",
      to: "care/clinical_plan_workspace#create_medication_request"
    patch "patients/:patient_id/encounters/:encounter_id/medication_requests/:series_id",
      to: "care/clinical_plan_workspace#revise_medication_request"
    post "patients/:patient_id/encounters/:encounter_id/service_requests",
      to: "care/clinical_plan_workspace#create_service_request"
    patch "patients/:patient_id/encounters/:encounter_id/service_requests/:series_id",
      to: "care/clinical_plan_workspace#revise_service_request"
    post "patients/:patient_id/encounters/:encounter_id/diagnoses",
      to: "care/clinical_plan_workspace#create_diagnosis"
    patch "patients/:patient_id/encounters/:encounter_id/diagnoses/:series_id",
      to: "care/clinical_plan_workspace#revise_diagnosis"
    post "patients/:patient_id/encounters/:encounter_id/procedures",
      to: "care/clinical_plan_workspace#create_procedure"
    patch "patients/:patient_id/encounters/:encounter_id/procedures/:series_id",
      to: "care/clinical_plan_workspace#revise_procedure"
    post "patients/:patient_id/encounters/:encounter_id/care_plans",
      to: "care/clinical_plan_workspace#create_care_plan"
    patch "patients/:patient_id/encounters/:encounter_id/care_plans/:series_id",
      to: "care/clinical_plan_workspace#revise_care_plan"
    post "patients/:patient_id/encounters/:encounter_id/care_goals",
      to: "care/clinical_plan_workspace#create_care_goal"
    patch "patients/:patient_id/encounters/:encounter_id/care_goals/:series_id",
      to: "care/clinical_plan_workspace#revise_care_goal"
    post "patients/:patient_id/encounters/:encounter_id/immunizations",
      to: "care/clinical_plan_workspace#create_immunization"
    patch "patients/:patient_id/encounters/:encounter_id/immunizations/:series_id",
      to: "care/clinical_plan_workspace#revise_immunization"
    post "patients/:patient_id/encounters/:encounter_id/assessments",
      to: "care/clinical_plan_workspace#create_assessment"
    patch "patients/:patient_id/encounters/:encounter_id/assessments/:series_id",
      to: "care/clinical_plan_workspace#revise_assessment"
    post "patients/:patient_id/encounters/:encounter_id/clinical_plan_workspace/fulfillment_links",
      to: "care/clinical_plan_workspace#create_fulfillment_link"
    post "patients/:patient_id/encounters/:encounter_id/clinical_plan_workspace/referral_events",
      to: "care/clinical_plan_workspace#create_referral_event"
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
        post :write_offs, on: :member, action: :write_off
        post :void, on: :member, action: :void_invoice
        post :payment_allocations, on: :member, action: :allocate_payment
        post :cash_payments, on: :member, to: "billing/invoices#record_cash_payment"
        post "online_payment/start", on: :member, to: "billing/invoice_online_payments#start"
        post "online_payment/reconcile", on: :member, to: "billing/invoice_online_payments#reconcile"
        post "online_payment/cancel", on: :member, to: "billing/invoice_online_payments#cancel"
      end
    get "billing", to: "billing/dashboard#show"
    get "billing/income_outlook", to: "billing/dashboard#income_outlook"
    get "billing/support_requests", to: "billing/support_requests#index"
    post "billing/support_requests/:id/transition", to: "billing/support_requests#transition"
    resources :billing_services, only: %i[index create update]
    resources :service_offerings, only: %i[index create update] do
      post :publish, on: :member
      post :retire, on: :member
    end
    resources :cash_pay_estimates, controller: "billing/cash_pay_estimates", only: %i[index show create] do
      get :invoice_comparison, on: :member
      post :issue, on: :member
      post :correct, on: :member
      post :deliver, on: :member
    end
    resources :schedule_holds, controller: "scheduling/schedule_holds", only: :create do
      post :release, on: :member
    end
    get "stripe_connect", to: "billing/stripe_connect#show"
    post "stripe_connect/onboard", to: "billing/stripe_connect#onboard"
    post "stripe_connect/refresh", to: "billing/stripe_connect#refresh"
    get "subscription_catalog", to: "care/subscription_catalog#index"
    resource :membership_storefront, only: %i[show update], controller: "membership_storefront"
    resource :membership_enrollment, only: %i[show create]
    post "membership_enrollment/:id/payment", to: "membership_enrollments#payment"
    post "membership_enrollment/:id/one_time_payment", to: "membership_enrollments#one_time_payment"
    resources :membership_prospects, only: %i[index show update] do
      post :phone_payment, on: :member
      post :refresh_phone_payment, on: :member
    end
    resources :service_inquiries, only: %i[index update]
    resources :callback_requests, controller: "operations/callback_requests", only: :index do
      post :transition, on: :member
    end
    get "subscription_catalog/storefront_preview", to: "care/subscription_catalog#storefront_preview"
    post "subscription_catalog/template", to: "care/subscription_catalog#apply_template"
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
      post "supplier-quote-requests", to: "inventory/supplier_pricing#create_quote_request"
      patch "supplier-products/:id/manual-quote", to: "inventory/supplier_pricing#record_quote"
      get "supplier-catalog-products", to: "inventory/supplier_pricing#catalog_products"
      post "supplier-products/manual-quote", to: "inventory/supplier_pricing#create_manual_quote"
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
      post "shipments/:id/events", to: "inventory/management#create_shipment_event"
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
      post :merge, on: :member
      get :billing_ledger, on: :member, to: "billing/patient_ledgers#show"
      post :note, on: :member
      get "previous_signed_soap", on: :member, to: "care/patient_chart_history#show"
      resource :care_summary, controller: "care/patient_care_summaries", only: :show
        get "intake_consents", to: "care/intake_consents#show"
        post "intake_consents", to: "care/intake_consents#create"
      resource :care_coordination, controller: "care/patient_care_coordinations", only: %i[show create] do
        get :references
      end
      get "clinical_history", to: "care/clinical_history#index", as: :clinical_history
      post "clinical_history/reviews", to: "care/clinical_history#review", as: :clinical_history_reviews
      post "clinical_history/:kind", to: "care/clinical_history#create", as: nil
      patch "clinical_history/:kind/:id", to: "care/clinical_history#update", as: nil
      resources :encounters, controller: "scheduling/encounters", only: %i[index create] do
        resource :vital_signs, controller: "care/vital_signs", only: %i[show create]
      end
      get "encounters/:encounter_id/previsit_note", to: "care/previsit_notes#show", as: :encounter_previsit_note
      get "encounters/:encounter_id/visit_instructions", to: "care/visit_instructions#show", as: :encounter_visit_instructions
      resources :observations, controller: "care/observations", only: %i[index create]
      resources :lab_reports, controller: "care/lab_reports", only: %i[index show create] do
        post :versions, on: :member, action: :create_version
        get "versions/:version_id/results/:result_index/history", on: :member,
          action: :result_history, as: :result_history
        post "versions/:version_id/review", on: :member, action: :review, as: :review_version
        post "versions/:version_id/actions", on: :member, action: :record_action, as: :record_action
        post "versions/:version_id/follow_up", on: :member, action: :record_follow_up, as: :record_follow_up
        post "versions/:version_id/follow_up/contact_attempts", on: :member,
          action: :record_follow_up_contact_attempt, as: :record_follow_up_contact_attempt
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
      patch "requests/:id/manage", to: "messaging/staff#manage_request"
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
        collection do
          post :create_synthetic
        end
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
    post "owner_activation", to: "owner_activations#create"
    post "owner_password_reset_requests", to: "owner_password_reset_requests#create"
    post "owner_password_reset", to: "owner_password_resets#create"
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
      get "education_materials", to: "patient_education_materials#index"
      post "education_materials/:education_event_id/acknowledgment", to: "patient_education_materials#create"
      namespace :telehealth do
        get "visits/:visit_id", to: "visits#show"
        post "visits/:visit_id/checkins", to: "visits#checkins"
        post "visits/:visit_id/consents", to: "visits#consents"
        post "visits/:visit_id/enter_waiting_room", to: "visits#enter_waiting_room"
        post "visits/:visit_id/join_grant", to: "visits#join_grant"
        post "visits/:visit_id/leave", to: "visits#leave"
        post "visits/:visit_id/scribe_consent", to: "scribe#consent"
      end
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
      resources :waitlist, controller: "waitlist", only: %i[index update]
      get "billing_history", to: "billing_history#index"
      patch "account/password", to: "account_password#update"
      get "visit_instructions", to: "visit_instructions#index"
      get "visit_instructions/:encounter_id", to: "visit_instructions#show"
      get "reminders", to: "reminders#index"
      post "reminders/:id/actions", to: "reminders#action"
      get "reminder_preferences", to: "reminder_preferences#show"
      post "reminder_preferences", to: "reminder_preferences#update"
      resources :appointment_requests, only: %i[index create]
      resources :appointments, only: [] do
        resource :previsit_note, only: %i[show create]
      end
      put "appointments/:appointment_id/confirmation", to: "appointment_confirmations#update",
        as: :appointment_confirmation
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
