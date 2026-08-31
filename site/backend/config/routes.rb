Rails.application.routes.draw do
  namespace :clinic do
    root "dashboard#show"
    post "demo", to: "dashboard#demo"
    resources :patients, only: %i[index show create] do
      post :note, on: :member
    end
    resources :inventory, only: %i[index create] do
      post :adjust, on: :member
    end
    resources :staff, only: %i[index create update]
  end
  scope module: :web do
    root "pages#home"
    get "contact", to: "pages#contact"
    post "contact", to: "pages#submit_contact"
    get "login", to: "sessions#new"
    post "login", to: "sessions#create"
    post "login/development", to: "sessions#development", as: :development_login
    post "logout", to: "sessions#destroy"
    get "portal", to: "pages#portal"
    resources :paperwork, controller: :paperworks, only: %i[index show] do
      post :start, on: :member
      post :sign, on: :member
      get :receipt, on: :member
    end
    resources :training, only: %i[index show] do
      post :start, on: :member
      post :complete, on: :member
    end
    get "inquiries", to: "inquiries#index"
    get "materials", to: redirect("/training")
    get "materials/:id", to: redirect("/training/%{id}")
  end
  namespace :api do
    get "csrf", to: "sessions#csrf"
    resource :session, only: %i[show create destroy]
    post "development_session", to: "sessions#development"
    resources :materials, only: %i[index show]
    post "materials/:material_id/start", to: "learning_progresses#start"
    post "materials/:material_id/complete", to: "learning_progresses#complete"
    resources :paperworks, only: %i[index show] do
      post :start, on: :member
      post :sign, on: :member
    end
    resources :contact_messages, only: :create
    resources :inquiries, only: :index
  end
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  # root "posts#index"
end
