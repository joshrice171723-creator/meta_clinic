class Ability
  include CanCan::Ability

  # Catalog-only action names for the future clinical workflow. They are not
  # rules, grants, or browser capabilities; until a reviewed subject contract
  # exists, Authorization deliberately denies them.
  FUTURE_CLINICAL_ACTIONS = %w[
    intake.read intake.write
    triage.read triage.write
    handoffs.read handoffs.request handoffs.accept handoffs.reject handoffs.correction_request
    exam.read exam.write
    diagnosis.read diagnosis.write
    discharge.read discharge.write
  ].freeze

  # Permission catalogs are global definitions. They become effective only
  # through an active grant on the user's practice membership.
  PERMISSION_RULES = {
    "patients.read" => { action: :read, subjects: [ Clinic::Care::Patient ], scope: :practice },
    "patients.write" => { action: :create, subjects: [ Clinic::Care::Patient ], actions: %i[create update], scope: :practice },
    "staff.read" => { action: :read, subjects: [ Clinic::Staff::Member ], scope: :practice },
    "staff.write" => { action: :create, subjects: [ Clinic::Staff::Member ], actions: %i[create update], scope: :practice },
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
    "encounters.write" => { action: :create, subjects: [ Clinic::Encounter ], actions: %i[create update], scope: :site_or_practice },
    "notes.read" => { action: :read, subjects: [ Clinic::EncounterNote, Clinic::EncounterNoteRevision ], scope: :site_or_practice },
    "notes.write" => { action: :create, subjects: [ Clinic::EncounterNote, Clinic::EncounterNoteRevision ], actions: %i[create update], scope: :site_or_practice },
    "notes.sign" => { action: :sign, subjects: [ Clinic::EncounterNoteSignature, Clinic::EncounterNote ], scope: :site_or_practice },
    "observations.write" => { action: :create, subjects: [ Clinic::Care::Observation ], actions: %i[create update], scope: :site_or_practice },
    "messages.write" => { action: :create, subjects: [ Clinic::MessageIntent, Clinic::MessageOutbox ], actions: %i[create update], scope: :practice },
    "documents.read" => { action: :read, subjects: [ Clinic::Document ], scope: :practice },
    "billing.write" => { action: :create, subjects: [ Clinic::Invoice, Clinic::PaymentAllocation ], actions: %i[create update], scope: :practice },
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

    scope = @permissions_by_scope&.[](normalized)
    return false unless membership && rule && scope

    if rule[:scope] == :site_or_practice
      site_id = site.respond_to?(:id) ? site.id : site
      site_allowed = scope[:practice] || (any_site ? scope[:site_ids].any? : site_id.present? && scope[:site_ids].include?(site_id))
      return false unless site_allowed
    end

    can?(self.class.action_for(normalized), self.class.subjects_for(normalized).first)
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
    else
      return nil
    end
    conditions
  end

  def practice_id(practice)
    practice.respond_to?(:id) ? practice.id : practice
  end
end
