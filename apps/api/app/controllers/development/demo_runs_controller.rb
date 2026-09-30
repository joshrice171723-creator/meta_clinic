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
      run = bound_run
      return render json: inactive_payload unless run
      if run.lesson_key.blank?
        SharedDemoLesson.leave!(run) if run.active? && valid_run_user?(run)
        clear_demo_session!
        return render json: inactive_payload(notice: "The demo now has independent lessons. Choose a lesson to start fresh.")
      end
      unless run.active? && valid_run_user?(run)
        clear_demo_session!
        return render json: inactive_payload(notice: "This lesson restarted in another demo session. Choose it again to start fresh.")
      end

      render json: active_payload(run)
    end

    def lesson
      visitor = current_visitor
      input = demo_input!(%i[lesson_key restart])
      restart = boolean_input!(input, :restart, default: false)
      lesson_key = input[:lesson_key].presence
      return leave_lesson(visitor) unless lesson_key
      raise ActiveRecord::RecordNotFound if visitor.nil? && lesson_key != "navigation_tour"

      DemoLessonCatalog.definition!(lesson_key)
      previous_run = current_run
      run = ApplicationRecord.transaction do
        selected = SharedDemoLesson.enter!(lesson_key, visitor:, previous_run:, restart:)
        establish_demo_session(session_user_for(selected), selected, view: DemoLessonCatalog.view_for(lesson_key))
        selected
      end
      render json: active_payload(run), status: :created
    end

    def register_visitor
      input = demo_input!(%i[name email company])
      visitor = DemoVisitor.new(
        name: required_string!(input[:name], field: :name, maximum: 160),
        email: required_string!(input[:email], field: :email, maximum: 254),
        company: required_string!(input[:company], field: :company, maximum: 200)
      )
      unless visitor.save
        return render json: { error: visitor.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
      run = current_run
      if run && valid_run_user?(run)
        DemoLessonCatalog.sandbox?(run.lesson_key) ? current_member_session&.destroy! : SharedDemoLesson.leave!(run)
      end
      clear_demo_session!
      cookies.encrypted[:guided_clinic_demo_visitor] = cookie_value(visitor.id)
      render json: inactive_payload(visitor:)
    end

    def create_feedback
      visitor = current_visitor
      return render json: { error: "Register for the demo before sending feedback." }, status: :unauthorized unless visitor
      run = current_run
      raise ActiveRecord::RecordNotFound unless run&.visitor_id == visitor.id && DemoLessonCatalog.sandbox?(run.lesson_key)

      input = demo_input!(%i[message])
      feedback = visitor.demo_feedback.create!(message: required_string!(input[:message], field: :message, maximum: 2000))
      render json: { id: feedback.id, created_at: feedback.created_at.iso8601 }, status: :created
    end

    def view
      run = current_run!
      require_run_user!(run)
      requested_view = required_string!(demo_input!(%i[view])[:view], field: :view, maximum: 20)
      case requested_view
      when "patient"
        raise ArgumentError, "This lesson does not have a patient view yet." unless run.patient_user
        establish_demo_session(run.patient_user, run, view: requested_view)
      when "clinic"
        establish_demo_session(run.operator_user, run, view: requested_view)
      else
        raise ArgumentError, "Choose the clinic or patient view."
      end
      render json: active_payload(run)
    end

    def resume
      run = current_run!
      establish_demo_session(session_user_for(run), run, view: DemoLessonCatalog.view_for(run.lesson_key))
      render json: active_payload(run)
    end

    def reset
      input = demo_input!(%i[all])
      clear_visitor = boolean_input!(input, :all, default: false)
      visitor = current_visitor
      run = current_run
      if run && valid_run_user?(run)
        DemoLessonCatalog.sandbox?(run.lesson_key) ? current_member_session&.destroy! : SharedDemoLesson.leave!(run)
      end
      clear_demo_session!
      cookies.delete(:guided_clinic_demo_visitor) if clear_visitor
      render json: inactive_payload(visitor: clear_visitor ? nil : visitor)
    end

    def complete
      run = current_run!
      require_run_user!(run)
      review_lesson = DemoNavigationLessons::DEFINITIONS.any? { |definition| definition.fetch(:id) == run.lesson_key } &&
        DemoNavigationLessons.review?(run.lesson_key)
      raise ArgumentError, "This lesson is completed by its guided action." unless review_lesson
      run.with_lock do
        raise ActiveRecord::RecordNotFound unless run.reload.active?
        run.update!(baseline: run.baseline.to_h.merge("review_acknowledged" => true))
      end
      render json: active_payload(run)
    end

    def prepare_sandbox
      run = current_run!
      require_run_user!(run)
      raise ActiveRecord::RecordNotFound unless run.visitor_id == current_visitor&.id

      render json: { complete: SharedDemoLesson.prepare_sandbox_step!(run) }
    end

    def enrollment
      run = current_run!
      require_run_user!(run)
      raise ArgumentError, "Open the patient enrollment lesson first." unless run.lesson_key == "patient_enroll"
      input = demo_input!(%i[version_id], arrays: %i[selections])
      version_id = integer_id!(input[:version_id], field: :version_id)
      selections = Array(input[:selections]).map { |value| integer_id!(value, field: :selections) }
      result = GuidedClinicDemo.enroll!(run:, version_id:, selections:)
      establish_demo_session(result.user, run, view: "patient")
      render json: { destination: "/memberships/account?payment=local" }, status: :created
    end

    private

    def leave_lesson(visitor)
      run = current_run
      require_run_user!(run) if run
      SharedDemoLesson.leave!(run) if run && !DemoLessonCatalog.sandbox?(run.lesson_key)
      current_member_session&.destroy! if run && DemoLessonCatalog.sandbox?(run.lesson_key)
      clear_demo_session!
      render json: inactive_payload(visitor:)
    end

    def current_visitor
      binding = cookies.encrypted[:guided_clinic_demo_visitor]
      DemoVisitor.find_by(id: Integer(binding, 10)) if binding.present?
    rescue ActiveSupport::MessageEncryptor::InvalidMessage, ArgumentError
      nil
    end

    def inactive_payload(visitor: current_visitor, notice: nil)
      registered = visitor.present?
      { active: false, visitor_registered: registered,
        lessons: registered ? DemoLessonCatalog.catalog : [] }.tap do |payload|
        payload[:notice] = notice if notice
      end
    end

    def require_development_access
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.allowed?(request)
    end

    def bound_run
      binding = cookies.encrypted[:guided_clinic_demo_run]
      DemoRun.find_by(id: Integer(binding, 10)) if binding.present?
    rescue ActiveSupport::MessageEncryptor::InvalidMessage, ArgumentError
      cookies.delete(:guided_clinic_demo_run)
      nil
    end

    def current_run
      run = bound_run
      run if run&.active?
    end

    def current_run!
      current_run || raise(ActiveRecord::RecordNotFound)
    end

    def valid_run_user?(run)
      current_user&.id.in?([ run.operator_user_id, run.patient_user_id ].compact)
    end

    def require_run_user!(run)
      raise ActiveRecord::RecordNotFound unless run && valid_run_user?(run)
    end

    def clear_demo_session!
      reset_session
      @current_member_session = nil
      cookies.delete(:guided_clinic_demo_run)
    end

    def establish_demo_session(user, run, view:)
      establish_session(user)
      session[:guided_clinic_demo_run_id] = run.id
      session[:development_demo_user_id] = user.id
      if user.id == run.operator_user_id
        session[:clinic_membership_id] = user.clinic_memberships.find_by!(practice_id: run.practice_id).id
        session[:clinic_site_id] = run.practice.sites.first!.id
      end
      session[:guided_clinic_demo_view] = view
      cookies.encrypted[:guided_clinic_demo_run] = cookie_value(run.id)
    end

    def session_user_for(run)
      DemoLessonCatalog.view_for(run.lesson_key) == "patient" && run.patient_user ? run.patient_user : run.operator_user
    end

    def cookie_value(id)
      { value: id.to_s, expires: 30.days.from_now, httponly: true, same_site: :lax, secure: Rails.env.production? }
    end

    def boolean_input!(input, field, default:)
      return default unless input.key?(field)
      value = input[field]
      return value if value == true || value == false
      raise Clinic::Api::RequestParameters::Invalid.new("#{field} must be true or false.", field:)
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
      input.permit(*permitted, arrays.to_h { |field| [ field, [] ] })
    end

    def active_payload(run)
      SharedDemoLesson.record_completion!(run)
      run.reload
      patient = run.patient
      view = session[:guided_clinic_demo_view] || DemoLessonCatalog.view_for(run.lesson_key)
      { active: true, run: {
        id: run.id, template_key: run.template_key, lesson_key: run.lesson_key,
        sandbox: DemoLessonCatalog.sandbox?(run.lesson_key),
        mode: view, view:,
        clinic: { id: run.practice_id, name: run.practice.name, slug: run.practice.public_membership_slug },
        patient: patient && { id: patient.id, name: patient.display_name },
        lessons: run.visitor_id ? DemoLessonCatalog.catalog : DemoLessonCatalog.catalog.select { |lesson| lesson[:id] == "navigation_tour" },
        steps: DemoLessonCatalog.steps_for(run)
      } }
    end
  end
end
