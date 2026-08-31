Rails.application.routes.draw do
  scope path: "api", as: "api" do
  namespace :clinic do
    root "dashboard#show"
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
    resources :patients, controller: "care/patients", only: %i[index show create] do
      post :note, on: :member
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
