class Ability
  include CanCan::Ability

  SUPPLIER_PRICING_ROLE_CODES = %w[
    admin administrator omni_admin omni_administrator inventory
    dev-seed-administrator development-omni-administrator dev-seed-inventory
  ].freeze

  # Catalog-only action names for the future clinical workflow. They are not
  # rules, grants, or browser capabilities; until a reviewed subject contract
  # exists, Authorization deliberately denies them.
  FUTURE_CLINICAL_ACTIONS = %w[
    triage.read triage.write
    handoffs.read handoffs.request handoffs.accept handoffs.reject handoffs.correction_request
    exam.read exam.write
    discharge.read discharge.write
  ].freeze

  # Permission catalogs are global definitions. They become effective only
  # through an active grant on the user's practice membership.
  PERMISSION_RULES = {
    "workforce.admin" => { action: :workforce_admin, subjects: [ Clinic::Site ], scope: :practice },
    "workforce.settings" => { action: :workforce_settings, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "workforce.badges" => { action: :workforce_badges, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "workforce.timecards.read" => { action: :workforce_timecards_read, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "workforce.timecards.review" => { action: :workforce_timecards_review, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "workforce.timecards.approve" => { action: :workforce_timecards_approve, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "workforce.schedule.read" => { action: :workforce_schedule_read, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "workforce.schedule.manage" => { action: :workforce_schedule_manage, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "workforce.schedule.publish" => { action: :workforce_schedule_publish, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "workforce.requests.review" => { action: :workforce_requests_review, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "workforce.payroll.configure" => { action: :workforce_payroll_configure, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "workforce.payroll.export" => { action: :workforce_payroll_export, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "subscription_catalog.read" => { action: :read, subjects: [ Clinic::Care::SubscriptionPackage ], scope: :practice },
    "subscription_catalog.write" => { action: :create, subjects: [ Clinic::Care::SubscriptionPackage ], actions: %i[create update], scope: :practice },
    "subscription_catalog.publish" => { action: :publish, subjects: [ Clinic::Care::SubscriptionPackage ], scope: :practice },
    "subscriptions.review" => { action: :review, subjects: [ Clinic::Care::SubscriptionAgreement ], scope: :practice },
    "patients.read" => { action: :read, subjects: [ Clinic::Care::Patient ], scope: :practice },
    "patients.identity.read" => { action: :read_identity, subjects: [ Clinic::Care::Patient ], scope: :practice },
    "patients.write" => { action: :create, subjects: [ Clinic::Care::Patient ], actions: %i[create update], scope: :practice },
    "staff.read" => { action: :read, subjects: [ Clinic::Staff::Member ], scope: :practice },
    "staff.write" => { action: :create, subjects: [ Clinic::Staff::Member ], actions: %i[create update], scope: :practice },
    "facilities.read" => { action: :read, subjects: [ Clinic::Site ], scope: :site_or_practice },
    "facilities.write" => { action: :create, subjects: [ Clinic::Site ], actions: %i[create update], scope: :practice },
    "inventory.read" => { action: :read, subjects: [ Clinic::Inventory::Item, Clinic::Inventory::PharmacyProduct, Clinic::Inventory::PharmacyBatch ], scope: :practice },
    "inventory.catalog" => { action: :create, subjects: [ Clinic::Inventory::Item, Clinic::Inventory::PharmacyProduct ], actions: %i[create update], scope: :practice },
    "inventory.receive" => { action: :receive, subjects: [ Clinic::Inventory::PharmacyBatch ], scope: :practice },
    "inventory.adjust" => { action: :adjust, subjects: [ Clinic::Inventory::Item, Clinic::Inventory::PharmacyBatch ], scope: :practice },
    "inventory.hold" => { action: :hold, subjects: [ Clinic::Inventory::PharmacyBatch ], scope: :practice },
    "inventory.release" => { action: :release, subjects: [ Clinic::Inventory::PharmacyBatch ], scope: :practice },
    "inventory.count" => { action: :count, subjects: [ Clinic::Inventory::Count, Clinic::Inventory::PharmacyBatch ], scope: :practice },
    "inventory.configure" => { action: :configure, subjects: [ Clinic::Inventory::Profile ], scope: :practice },
    "inventory.transfer" => { action: :transfer, subjects: [ Clinic::Inventory::Transfer, Clinic::Inventory::PharmacyBatch ], scope: :practice },
    "inventory.put_away" => { action: :receive, subjects: [ Clinic::Inventory::PharmacyBatch ], scope: :practice },
    "procurement.read" => { action: :read, subjects: [ Clinic::Inventory::PurchaseOrder, Clinic::Inventory::PurchaseOrderLine ], scope: :practice },
    "procurement.create" => { action: :create, subjects: [ Clinic::Inventory::PurchaseOrder, Clinic::Inventory::PurchaseOrderLine ], scope: :practice },
    "procurement.submit" => { action: :submit, subjects: [ Clinic::Inventory::PurchaseOrder ], scope: :practice },
    "procurement.approve" => { action: :approve, subjects: [ Clinic::Inventory::PurchaseOrder ], scope: :practice },
    "recall.read" => { action: :read, subjects: [ Clinic::Inventory::Recall, Clinic::Inventory::Hold ], scope: :practice },
    "recall.lock" => { action: :hold, subjects: [ Clinic::Inventory::PharmacyBatch, Clinic::Inventory::Hold ], scope: :practice },
    "recall.dispose" => { action: :adjust, subjects: [ Clinic::Inventory::RecallDisposition, Clinic::Inventory::PharmacyBatch ], scope: :practice },
    "controlled.read" => { action: :read, subjects: [ Clinic::Inventory::Count, Clinic::Inventory::ControlReview ], scope: :practice },
    "controlled.count" => { action: :count, subjects: [ Clinic::Inventory::Count ], scope: :practice },
    "controlled.certify" => { action: :approve, subjects: [ Clinic::Inventory::Count, Clinic::Inventory::ControlReview ], scope: :practice },
    "appointments.write" => { action: :create, subjects: [ Clinic::Appointment ], actions: %i[create update], scope: :site_or_practice },
    "appointments.read" => { action: :read, subjects: [ Clinic::Appointment ], scope: :site_or_practice },
    "appointments.book" => { action: :create, subjects: [ Clinic::Appointment ], scope: :site_or_practice },
    "appointments.status_transition" => { action: :transition, subjects: [ Clinic::Appointment ], scope: :site_or_practice },
    "encounters.write" => { action: :create, subjects: [ Clinic::Encounter ], actions: %i[create update], scope: :site_or_practice },
    "encounters.assign_provider" => { action: :assign_provider, subjects: [ Clinic::Encounter ], scope: :site_or_practice },
    "intake.write" => { action: :update, subjects: [ Clinic::Encounter ], scope: :site_or_practice },
    "notes.read" => { action: :read, subjects: [ Clinic::EncounterNote, Clinic::EncounterNoteRevision ], scope: :site_or_practice },
    "notes.write" => { action: :create, subjects: [ Clinic::EncounterNote, Clinic::EncounterNoteRevision ], actions: %i[create update], scope: :site_or_practice },
    "notes.sign" => { action: :sign, subjects: [ Clinic::EncounterNoteSignature, Clinic::EncounterNote ], scope: :site_or_practice },
    "observations.write" => { action: :create, subjects: [ Clinic::Care::Observation ], actions: %i[create update], scope: :site_or_practice },
    "clinical_records.read" => { action: :read, subjects: [
      Clinic::Care::MedicationRequestRevision, Clinic::Care::ServiceRequestRevision,
      Clinic::Care::EncounterDiagnosisRevision, Clinic::Care::ProcedureRevision,
      Clinic::Care::CarePlanRevision, Clinic::Care::CareGoalRevision, Clinic::Care::ImmunizationRevision,
      Clinic::Care::ClinicalPlanLink, Clinic::Care::ReferralExchangeEvent,
      Clinic::Care::MedicationAdministration
    ], scope: :site_or_practice },
    "medication_requests.write" => { action: :create, subjects: [ Clinic::Care::MedicationRequestRevision ], scope: :site_or_practice },
    "medication_administrations.write" => { action: :create, subjects: [ Clinic::Care::MedicationAdministration ], scope: :site_or_practice },
    "service_requests.write" => { action: :create, subjects: [ Clinic::Care::ServiceRequestRevision ], scope: :site_or_practice },
    "diagnoses.write" => { action: :create, subjects: [ Clinic::Care::EncounterDiagnosisRevision ], scope: :site_or_practice },
    "procedures.write" => { action: :create, subjects: [ Clinic::Care::ProcedureRevision ], scope: :site_or_practice },
    "care_plans.write" => { action: :create, subjects: [ Clinic::Care::CarePlanRevision, Clinic::Care::CareGoalRevision ], scope: :site_or_practice },
    "immunizations.write" => { action: :create, subjects: [ Clinic::Care::ImmunizationRevision ], scope: :site_or_practice },
    "messages.write" => { action: :create, subjects: [ Clinic::MessageIntent, Clinic::MessageOutbox ], actions: %i[create update], scope: :practice },
    "staff_messaging.read" => { action: :read, subjects: [ Clinic::StaffConversation ], scope: :site_or_practice },
    "staff_messaging.send" => { action: :create, subjects: [ Clinic::StaffConversation ], scope: :site_or_practice },
    "staff_messaging.create_conversation" => { action: :create, subjects: [ Clinic::StaffConversation ], scope: :site_or_practice },
    "staff_messaging.acknowledge" => { action: :update, subjects: [ Clinic::StaffConversation ], scope: :site_or_practice },
    "staff_messaging.transition" => { action: :update, subjects: [ Clinic::StaffConversation ], scope: :site_or_practice },
    "staff_messaging.escalate" => { action: :update, subjects: [ Clinic::StaffConversation ], scope: :site_or_practice },
    "staff_messaging.attach" => { action: :create, subjects: [ Clinic::StaffConversation ], scope: :site_or_practice },
    "scribe.read" => { action: :read, subjects: [ Clinic::Scribe::Encounter, Clinic::Scribe::Source, Clinic::Scribe::Draft, Clinic::Scribe::Export ], scope: :practice },
    "scribe.write" => { action: :create, subjects: [ Clinic::Scribe::Encounter, Clinic::Scribe::Source, Clinic::Scribe::Draft, Clinic::Scribe::DraftSection ], actions: %i[create update], scope: :practice },
    "scribe.approve" => { action: :approve, subjects: [ Clinic::Scribe::Draft ], scope: :practice },
    "scribe.export" => { action: :export, subjects: [ Clinic::Scribe::Draft, Clinic::Scribe::Export ], scope: :practice },
    "scribe.delete" => { action: :destroy, subjects: [ Clinic::Scribe::Encounter ], scope: :practice },
    "telehealth.read" => { action: :read, subjects: [ Clinic::Telehealth::Visit ], scope: :site_or_practice },
    "telehealth.prepare.read" => { action: :read_preparation, subjects: [ Clinic::Telehealth::Visit ], scope: :site_or_practice },
    "telehealth.prepare.verify" => { action: :verify_preparation, subjects: [ Clinic::Telehealth::Visit ], scope: :site_or_practice },
    "telehealth.host" => { action: :host, subjects: [ Clinic::Telehealth::Visit ], scope: :site_or_practice },
    "telehealth.participate" => { action: :participate, subjects: [ Clinic::Telehealth::Visit ], scope: :site_or_practice },
    "telehealth.configure" => { action: :configure, subjects: [ Clinic::Telehealth::Setting, Clinic::Telehealth::PolicyVersion, Clinic::Telehealth::VisitTypeRule ], scope: :practice },
    "telehealth.reconcile" => { action: :reconcile, subjects: [ Clinic::Telehealth::Visit ], scope: :practice },
    "reminders.read" => { action: :read, subjects: [ Clinic::PatientReminder, Clinic::CommunicationEndpoint, Clinic::CommunicationPreference ], scope: :practice },
    "reminders.write" => { action: :create, subjects: [ Clinic::PatientReminder, Clinic::PatientReminderOutbox, Clinic::CommunicationEndpoint, Clinic::CommunicationPreference ], actions: %i[create update], scope: :practice },
    "documents.read" => { action: :read, subjects: [ Clinic::Document ], scope: :practice },
    "billing.read" => { action: :read, subjects: [ Clinic::Invoice ], scope: :practice },
    "billing.write" => { action: :create, subjects: [ Clinic::Invoice, Clinic::PaymentAllocation ], actions: %i[create update], scope: :practice },
    "billing.invoice_draft" => { action: :create, subjects: [ Clinic::Invoice ], scope: :practice },
    "billing.catalog.manage" => { action: :manage, subjects: [ Clinic::BillingService ], scope: :practice },
    "billing.invoice_post" => { action: :post, subjects: [ Clinic::Invoice ], scope: :practice },
    "billing.payment_record" => { action: :create, subjects: [ Clinic::PaymentAllocation ], scope: :practice },
    "billing.cash_reconcile" => { action: :reconcile, subjects: [ Clinic::CashDrawerSession ], scope: :practice },
    "roles.manage" => { action: :manage, subjects: [ Clinic::RoleGrant ], scope: :practice }
  }.transform_values { |rule| rule.freeze }.freeze

  ACTION_ALIASES = {
    "patients_access?" => "patients.read",
    "staff_access?" => "staff.read",
    "inventory_access?" => "inventory.read",
    "catalog" => "inventory.catalog",
    "receive" => "inventory.receive",
    "adjust" => "inventory.adjust",
    "hold" => "inventory.hold",
    "release" => "inventory.release",
    "count" => "inventory.count",
    "configure" => "inventory.configure"
  }.freeze

  attr_reader :practice, :membership

  def self.normalize_permission(permission)
    ACTION_ALIASES.fetch(permission.to_s, permission.to_s).sub(/\?\z/, "")
  end

  def self.rule_for(permission)
    PERMISSION_RULES[normalize_permission(permission)]
  end

  def self.future_clinical_action?(permission)
    FUTURE_CLINICAL_ACTIONS.include?(normalize_permission(permission))
  end

  def self.action_for(permission)
    rule_for(permission)&.fetch(:action)
  end

  def self.subjects_for(permission)
    rule_for(permission)&.fetch(:subjects, []) || []
  end

  def initialize(user, practice: nil, at: Time.current)
    @practice = practice
    @at = at
    @membership = active_membership_for(user, practice)
    @omni_override = false
    return unless @membership

    # Omni is a deliberately unrestricted synthetic operator for the explicitly
    # enabled local development database. Its selected profile still toggles
    # the admin flag for UI/workflow rehearsal, but never limits clinic actions.
    if Development::TestAccounts.omni?(user)
      @omni_override = true
      @permissions_by_scope = PERMISSION_RULES.transform_values { { practice: true, site_ids: [] } }
      can :manage, :all
      return
    end

    permissions_by_scope = effective_permissions_by_scope(@membership, at)
    @permissions_by_scope = permissions_by_scope
    PERMISSION_RULES.each do |permission, rule|
      next unless permissions_by_scope.key?(permission)

      Array(rule[:actions] || rule[:action]).each do |action|
        rule[:subjects].each do |subject|
          conditions = conditions_for(rule, permissions_by_scope[permission], subject)
          can action, subject, conditions if conditions
        end
      end
    end

    # Role and permission definitions are global catalogs; the grant that
    # allows their administration is still practice-scoped through RoleGrant.
    if permissions_by_scope.key?("roles.manage") && permissions_by_scope["roles.manage"][:practice]
      can :read, RoleVersion
      can :read, Permission
    end
  end

  def allowed_permission?(permission, site: nil, any_site: false)
    normalized = self.class.normalize_permission(permission)
    rule = self.class.rule_for(normalized)
    return true if omni_override? && membership && rule

    # Hash.new's empty scope is useful while accumulating grants, but must not
    # turn an absent atomic permission into an allowed CanCan subject action.
    return false unless membership && rule && @permissions_by_scope&.key?(normalized)

    scope = @permissions_by_scope[normalized]

    if rule[:scope] == :site_or_practice
      site_id = site.respond_to?(:id) ? site.id : site
      site_allowed = scope[:practice] || (any_site ? scope[:site_ids].any? : site_id.present? && scope[:site_ids].include?(site_id))
      return false unless site_allowed
    end

    can?(self.class.action_for(normalized), self.class.subjects_for(normalized).first)
  end

  def practice_scope_for?(permission)
    scope = @permissions_by_scope&.[](self.class.normalize_permission(permission))
    scope&.fetch(:practice, false) == true
  end

  def role_code_allowed?(role_codes)
    return false unless membership

    membership.role_grants.active(@at).joins(:role_version)
      .where(role_versions: { role_code: Array(role_codes) }).exists?
  end

  def accessible_site_ids
    @permissions_by_scope&.values&.flat_map { |scope| scope[:site_ids] }&.uniq || []
  end

  private

  def omni_override?
    @omni_override
  end

  def active_membership_for(user, practice)
    return unless user.is_a?(User) && user.active? && practice.present?

    Clinic::Membership.active.find_by(practice_id: practice_id(practice), user_id: user.id)
  end

  def effective_permissions_by_scope(membership, at)
    permissions = Hash.new { |hash, key| hash[key] = { practice: false, site_ids: [] } }
    membership.role_grants.active(at).includes(role_version: :permissions).each do |grant|
      grant.role_version.permissions.each do |permission|
        entry = permissions[permission.action_code]
        if grant.practice?
          entry[:practice] = true
        elsif grant.site?
          entry[:site_ids] << grant.site_id unless entry[:site_ids].include?(grant.site_id)
        end
      end
    end
    permissions
  end

  def conditions_for(rule, scope, subject)
    case rule[:scope]
    when :practice
      return { practice_id: practice_id(@practice) } if scope[:practice]
      nil
    when :site_or_practice
      return { practice_id: practice_id(@practice) } if scope[:practice]
      return site_scoped_conditions(subject, scope[:site_ids]) if scope[:site_ids].any?

      nil
    end
  end

  def site_scoped_conditions(subject, site_ids)
    conditions = { practice_id: practice_id(@practice) }
    if subject.column_names.include?("site_id")
      conditions[:site_id] = site_ids
    elsif subject == Clinic::EncounterNote
      conditions[:encounter] = { site_id: site_ids }
    elsif subject == Clinic::EncounterNoteRevision
      conditions[:note] = { encounter: { site_id: site_ids } }
    elsif subject == Clinic::EncounterNoteSignature
      conditions[:note] = { encounter: { site_id: site_ids } }
    elsif subject == Clinic::Care::Observation
      conditions[:encounter] = { site_id: site_ids }
    elsif subject == Clinic::Telehealth::Visit
      conditions[:appointment] = { site_id: site_ids }
    else
      return nil
    end
    conditions
  end

  def practice_id(practice)
    practice.respond_to?(:id) ? practice.id : practice
  end
end
