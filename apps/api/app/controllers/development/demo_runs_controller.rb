module Development
  class DemoRunsController < ApplicationController
    include MemberAuthentication
    include Clinic::Api::RequestParameters
    wrap_parameters false

    before_action :require_development_access

    rescue_from Clinic::Api::RequestParameters::Invalid do |error|
      render_parameter_error(error)
    end
    rescue_from ArgumentError do |error|
      render json: { error: error.message, code: "invalid_request" }, status: :unprocessable_entity
    end

    def show
      run = current_run
      return render json: inactive_payload unless run

      require_run_user!(run)
      render json: active_payload(run)
    end

    def create
      visitor = current_visitor
      raise ArgumentError, "Enter your name, email and company before choosing a clinic." unless visitor
      input = demo_input!(%i[template_key])
      key = required_string!(input[:template_key], field: :template_key, maximum: 80)
      if (existing = current_run)
        require_run_user!(existing)
        raise ArgumentError, "Continue the clinic journey already in progress." unless existing.template_key == key
        return render json: active_payload(existing)
      end
      run = GuidedClinicDemo.start!(template_key: key, visitor:)
      establish_demo_session(run.operator_user, run)
      render json: active_payload(run), status: :created
    end

    def register_visitor
      input = demo_input!(%i[name email company])
      attributes = {
        name: required_string!(input[:name], field: :name, maximum: 160),
        email: required_string!(input[:email], field: :email, maximum: 254),
        company: required_string!(input[:company], field: :company, maximum: 200)
      }
      visitor = current_visitor || DemoVisitor.new
      visitor.assign_attributes(attributes)
      unless visitor.save
        return render json: { error: visitor.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
      cookies.encrypted[:guided_clinic_demo_visitor] = {
        value: visitor.id.to_s, httponly: true, same_site: :lax, secure: Rails.env.production?
      }
      render json: { active: false, visitor_registered: true, options: GuidedClinicDemo::OPTIONS }
    end

    def view
      run = current_run!
      require_run_user!(run)
      input = demo_input!(%i[view])
      requested_view = required_string!(input[:view], field: :view, maximum: 20)
      case requested_view
      when "patient"
        raise ArgumentError, "Finalize clinic setup and publish a membership before opening the patient storefront." unless practice_finalized?(run.practice) && published?(run)
        establish_demo_session(run.patient_user || run.operator_user, run)
      when "clinic"
        raise ArgumentError, "Complete the local payment before returning to the clinic." unless run.paid_patient?
        establish_demo_session(run.operator_user, run)
      else
        raise ArgumentError, "Choose the clinic or patient view."
      end
      session[:guided_clinic_demo_view] = requested_view
      render json: active_payload(run)
    end

    def reset
      if (run = current_run)
        require_run_user!(run)
        run.with_lock do
          [run.operator_user, run.patient_user].compact.each do |user|
            user.member_sessions.destroy_all
            user.update!(active: false)
          end
          run.update!(active: false)
        end
        reset_session
        @current_member_session = nil
      end
      cookies.delete(:guided_clinic_demo_run)
      render json: inactive_payload
    end

    def enrollment
      run = current_run!
      require_run_user!(run)
      raise ArgumentError, "Finish clinic setup and publish a membership first." unless practice_finalized?(run.practice) && published?(run)
      input = demo_input!(%i[version_id], arrays: %i[selections])
      version_id = integer_id!(input[:version_id], field: :version_id)
      selections = Array(input[:selections]).map { |value| integer_id!(value, field: :selections) }
      result = GuidedClinicDemo.enroll!(run:, version_id:, selections:)
      establish_demo_session(result.user, run)
      session[:guided_clinic_demo_view] = "patient"
      render json: { destination: "/memberships/account?payment=local" }, status: :created
    rescue ArgumentError => error
      render json: { error: error.message, code: "invalid_request" }, status: :unprocessable_entity
    end

    private

    def current_visitor
      binding = cookies.encrypted[:guided_clinic_demo_visitor]
      DemoVisitor.find_by(id: Integer(binding, 10)) if binding.present?
    rescue ActiveSupport::MessageEncryptor::InvalidMessage, ArgumentError
      nil
    end

    def inactive_payload
      registered = current_visitor.present?
      { active: false, visitor_registered: registered, options: registered ? GuidedClinicDemo::OPTIONS : [] }
    end

    def require_development_access
      raise ActiveRecord::RecordNotFound unless DevelopmentAccess.allowed?(request)
    end

    def current_run
      binding = cookies.encrypted[:guided_clinic_demo_run]
      return if binding.blank?

      DemoRun.active.find_by(id: Integer(binding, 10))
    rescue ActiveSupport::MessageEncryptor::InvalidMessage, ArgumentError
      cookies.delete(:guided_clinic_demo_run)
      nil
    end

    def current_run!
      current_run || raise(ActiveRecord::RecordNotFound)
    end

    def require_run_user!(run)
      return if current_user&.id.in?([ run.operator_user_id, run.patient_user_id ].compact)

      raise ActiveRecord::RecordNotFound
    end

    def require_operator!(run)
      raise ActiveRecord::RecordNotFound unless current_user&.id == run.operator_user_id
    end

    def establish_demo_session(user, run)
      establish_session(user)
      session[:development_demo_user_id] = user.id
      if user.id == run.operator_user_id
        session[:clinic_membership_id] = user.clinic_memberships.find_by!(practice_id: run.practice_id).id
        session[:clinic_site_id] = run.practice.sites.first!.id
      end
      cookies.encrypted[:guided_clinic_demo_run] = {
        value: run.id.to_s, httponly: true, same_site: :lax, secure: Rails.env.production?
      }
    end

    def published?(run)
      Clinic::Care::SubscriptionProjection.catalog(practice: run.practice).any?
    end

    def demo_input!(permitted, arrays: [])
      input = params[:demo] || params[:enrollment] || params.except(:controller, :action, :format)
      raise Clinic::Api::RequestParameters::Invalid.new("demo must be an object.", field: :demo) unless
        input.is_a?(ActionController::Parameters)

      unknown = input.keys.map(&:to_sym) - permitted - arrays
      if unknown.any?
        raise Clinic::Api::RequestParameters::Invalid.new("#{unknown.first} is not a supported field.", field: unknown.first)
      end
      arrays.each do |field|
        next unless input.key?(field) || input.key?(field.to_s)
        raise Clinic::Api::RequestParameters::Invalid.new("#{field} must be an array.", field:) unless input[field].is_a?(Array)
      end
      input.permit(*permitted, arrays.to_h { |field| [field, []] })
    end

    def active_payload(run)
      prospect = run.membership_prospect
      patient = run.patient
      appointment = patient && Clinic::Appointment.where(practice_id: run.practice_id, patient_id: patient.id).order(id: :desc).first
      encounter = patient && Clinic::Encounter.where(practice_id: run.practice_id, patient_id: patient.id).order(id: :desc).first
      setup_complete = practice_finalized?(run.practice)
      capacity_ready = Clinic::Scheduling::CapacityRule.where(practice_id: run.practice_id, kind: "weekly").exists?
      published = published?(run)
      paid = run.paid_patient?
      booked = appointment.present? && !%w[cancelled no_show].include?(appointment.status)
      checked_in = encounter.present?
      completed = encounter&.ended_at.present?
      inventory_received = Clinic::Inventory::Receipt.where(practice_id: run.practice_id).exists?
      inventory_counted = Clinic::Inventory::CountSession.where(practice_id: run.practice_id, status: "completed").exists?
      inventory_used = Clinic::Inventory::PharmacyMovement.where(practice_id: run.practice_id, kind: "adjustment_out")
        .where("created_at >= ?", run.created_at).exists?
      schedule_href = patient ? "/clinic/schedule?patient_id=#{patient.id}" : "/clinic/schedule"
      visit_href = encounter ? "/clinic/patients/#{patient.id}/encounters/#{encounter.id}" : "/clinic/patients"

      view = session[:guided_clinic_demo_view] || "clinic"
      { active: true, run: {
        id: run.id, template_key: run.template_key, mode: view, view:,
        clinic: { id: run.practice_id, name: run.practice.name, slug: run.practice.public_membership_slug },
        patient: patient && { id: patient.id, name: patient.display_name },
        steps: [
          step("setup", "Configure the clinic", "Review the clinic type and services, save any changes, then choose Finalize clinic setup.", setup_complete, "/clinic/setup", []),
          step("publish", "Create memberships", "Create a membership, set its price and terms, add its included services, then publish it. You can create multiple options before switching to the patient storefront.", published, "/clinic/subscriptions", [ "setup" ]),
          step("enroll", "Open the patient storefront", "Choose the published offer as the fictional patient.", prospect.present?, "/memberships/#{run.practice.public_membership_slug}", [ "publish" ]),
          step("payment", "Accept simulated payment", "Select Accept simulated payment. Once the payment is verified, the walkthrough returns you to the clinic with this patient.", paid, "/memberships/account?payment=local", [ "enroll" ]),
          step("schedule", "Book the first appointment", "Schedule the paid patient.", booked, schedule_href, capacity_ready ? [ "payment" ] : [ "payment", "capacity" ]),
          step("check_in", "Check in the patient", "Start the encounter from the scheduled appointment.", checked_in, "/clinic/front-desk", [ "schedule" ]),
          step("visit", "Save and complete the visit", "Save the encounter and complete it.", completed, visit_href, [ "check_in" ]),
          step("inventory_receive", "Receive inventory", "Open the prepared glove shipment. Record two packages, a lot number and future expiry, select Supply cabinet, and save the receipt. The shipment is fictional; nothing is ordered externally.", inventory_received, "/clinic/inventory/receiving", [ "setup" ]),
          step("inventory_count", "Count inventory", "Create a count for Supply cabinet, assign it to your account, record the observed quantity, reconcile its lines, then complete the count.", inventory_counted, "/clinic/inventory/counts", [ "inventory_receive" ]),
          step("inventory_use", "Record stock usage", "Open the received glove lot and record a negative stock adjustment with a reason. Check the resulting balance and movement history.", inventory_used, "/clinic/inventory/lots", [ "inventory_count" ])
        ]
      } }
    end

    def practice_finalized?(practice)
      Clinic::Configuration::PracticeFeatures.snapshot(practice:).fetch(:finalized)
    end

    def step(id, title, description, complete, href, requires)
      available = requires.all? { |dependency| @completed_steps&.include?(dependency) }
      @completed_steps ||= []
      @completed_steps << id if complete && available
      { id:, title:, description:, status: available ? (complete ? "complete" : "available") : "locked", href:, requires: }
    end
  end
end
