require "securerandom"

module Development
  class GuidedClinicDemo
    TEMPLATE_KEYS = %w[primary_care weight_management].freeze
    OPERATOR_PERMISSIONS = (%w[scribe.read scribe.write] + TestClinic::DEFAULT_PERMISSIONS + TestClinic::SUBSCRIPTION_PERMISSIONS +
      Clinic::Authorization::PilotRoleCatalog::DEFINITIONS.fetch("clinician").fetch(:permissions) +
      Clinic::Authorization::PilotRoleCatalog::DEFINITIONS.fetch("clinic-administrator").fetch(:permissions)).uniq.freeze
    OPTIONS = [
      { key: "primary_care", title: "Cash-based primary care", description: "Create memberships and guide a patient through their first visit." },
      { key: "weight_management", title: "Cash-based weight management", description: "Create a weight-management membership and follow the patient journey." }
    ].freeze
    ClinicResult = Struct.new(:practice, :operator, keyword_init: true)

    def self.create_clinic!(clinic_name:, operator_email: nil)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled?
      clinic_name = clinic_name.to_s.strip
      raise ArgumentError, "Enter a clinic name." if clinic_name.blank?
      raise ArgumentError, "Clinic name must be 160 characters or fewer." if clinic_name.length > 160

      suffix = SecureRandom.hex(8)
      operator = User.create!(email_address: operator_email || "guided-clinic-operator-#{suffix}@example.test",
        password: SecureRandom.urlsafe_base64(32), active: true)
      membership = TestClinic.create!(operator, permissions: OPERATOR_PERMISSIONS, seed_fixtures: false)
      practice = membership.practice
      practice.update!(name: clinic_name, public_membership_slug: "guided-clinic-#{suffix}",
        membership_storefront_enabled: true)
      ClinicResult.new(practice:, operator:)
    end

    def self.prepare_clinic!(practice:, operator:, template_key:, suffix:)
      membership = TestClinic.create!(operator, permissions: OPERATOR_PERMISSIONS, practice: practice)
      grant_supplier_pricing_role!(membership)
      provision_schedule_baseline!(practice:, membership:, suffix:)
      configure_template_profile!(practice:, membership:, template_key:, suffix:)
      if practice.visit_types.empty?
        practice.visit_types.create!(code: "Initial visit")
        practice.visit_types.create!(code: "Follow-up visit")
      end
      DemoInventory.prepare!(practice:, actor: operator)
      practice
    end

    def self.grant_supplier_pricing_role!(membership)
      role = RoleVersion.find_or_create_by!(role_code: "dev-seed-inventory", version: 1)
      %w[inventory.read inventory.catalog].each do |action_code|
        permission = Permission.find_or_create_by!(action_code:)
        RoleVersionPermission.find_or_create_by!(role_version: role, permission:)
      end
      membership.role_grants.find_or_create_by!(role_version: role, scope_kind: "practice") do |grant|
        grant.practice = membership.practice
        grant.effective_from = membership.class.connection.select_value("SELECT CURRENT_TIMESTAMP")
        grant.revision = 1
      end
    end
    private_class_method :grant_supplier_pricing_role!

    def self.start!(template_key:, clinic_name:, lesson_key:, visitor: nil)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled?
      raise ArgumentError, "Choose an available guided clinic template." unless TEMPLATE_KEYS.include?(template_key)
      DemoLessonCatalog.definition!(lesson_key) if lesson_key
      clinic_name = clinic_name.to_s.strip
      raise ArgumentError, "Enter a clinic name." if clinic_name.blank?
      raise ArgumentError, "Clinic name must be 160 characters or fewer." if clinic_name.length > 160

      User.transaction do
        suffix = SecureRandom.hex(8)
        clinic = create_clinic!(clinic_name:)
        operator = clinic.operator
        practice = clinic.practice
        prepare_clinic!(practice:, operator:, template_key:, suffix:)
        run = DemoRun.create!(template_key:, lesson_key:, practice:, operator_user: operator, visitor:)
        lesson_key ? DemoLessonCatalog.prepare!(run) : run
      end
    end

    def self.enroll!(run:, version_id:, selections:)
      run.with_lock do
        version = Clinic::Care::SubscriptionVersion.where(practice_id: run.practice_id).find(version_id)
        expected_terms = Clinic::Care::SubscriptionDefinition.select(version.snapshot, selections)
        if run.membership_prospect_id.present? && run.patient_user_id.present?
          unless run.membership_prospect.subscription_version_id == version.id &&
              run.membership_prospect.selected_terms == expected_terms
            raise ArgumentError, "This demo enrollment already uses a different membership selection."
          end
          return EnrollmentResult.new(user: run.patient_user)
        end
        raise ArgumentError, "Choose a published membership from this clinic." unless
          Clinic::Care::SubscriptionProjection.catalog(practice: run.practice).any? { |offer| offer.fetch(:id) == version_id }

      suffix = SecureRandom.hex(8)
      setup = Clinic::MembershipGrowth::PrepareAccount.call(
        practice: run.practice,
        version_id:,
        selections:,
        display_name: "Alex Morgan",
        email_address: "guided-clinic-patient-#{suffix}@example.test",
        phone_number: nil,
        source: "guided_clinic_demo",
        outreach_consent: true,
        request_key: "guided-demo-#{run.id}-#{suffix}",
        date_of_birth: "1990-01-01",
        deliver: false
      )
      password = SecureRandom.urlsafe_base64(32)
      activated = Clinic::MembershipGrowth::ActivateAccount.call(
        token: setup.token,
        password:,
        password_confirmation: password,
        accepted_terms: true,
        terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION
      )
      gateway = MembershipPaymentSimulator.gateway_for!(practice: run.practice, prospect: activated.prospect)
      Clinic::MembershipGrowth::PublicCheckout.start_for_account(
        practice: run.practice, prospect: activated.prospect, user: activated.user, gateway:
      )
        run.update!(membership_prospect: activated.prospect.reload, patient_user: activated.user)
        EnrollmentResult.new(user: activated.user)
      end
    end

    EnrollmentResult = Struct.new(:user, keyword_init: true)

    def self.provision_schedule_baseline!(practice:, membership:, suffix:)
      site = practice.sites.create!(code: "DEMO-#{suffix.first(6).upcase}", name: "Guided Clinic", status: "active",
        address_line1: "100 Example Way", city: "Austin", state: "TX", postal_code: "78701", country: "US")
      practice.rooms.create!(site:, code: "EXAM-1")
      department = practice.departments.create!(code: "PRIMARY-CARE")
      clinician = practice.clinician_profiles.create!(membership:, display_name: "Jordan Example", reference: "DEMO-#{suffix.first(12).upcase}")
      clinician.assignments.create!(practice:, site:, department:, effective_from: Current.business_time)
      (0..6).each do |day|
        site.operating_hours.create!(practice:, day_of_week: day, open_time: "09:00", close_time: "17:00", closed: false)
        Clinic::Scheduling::CapacityRule.create!(practice:, site:, clinician:, kind: "weekly", weekday: day,
          start_minute: 540, end_minute: 1020)
      end
    end
    private_class_method :provision_schedule_baseline!

    def self.configure_template_profile!(practice:, membership:, template_key:, suffix:)
      clinic_type = template_key == "primary_care" ? "primary_care" : "weight_loss"
      services = [ "in_office_medications" ]
      services += %w[prescription_preparation external_lab_coordination] if
        suffix == "lesson-sandbox" || suffix == "sandbox-companion"
      Clinic::Configuration::PracticeFeatures.revise(
        practice:, actor: membership, request_key: "guided-profile-#{suffix}", expected_revision: 0,
        insurance_workflows_enabled: false, clinic_type:, service_scope: services,
        assessment_scope: [], finalize: false
      )
    end
    private_class_method :configure_template_profile!
  end
end
