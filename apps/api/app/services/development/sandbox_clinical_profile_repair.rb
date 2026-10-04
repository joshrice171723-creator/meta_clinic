require "digest"

module Development
  class SandboxClinicalProfileRepair
    SERVICES = %w[minor_office_procedures vaccinations].freeze
    ASSESSMENTS = %w[tobacco_use].freeze
    OPERATION = "sandbox-clinical-profile-repair-v1".freeze

    def self.call!(run_id:, practice_id:, site_ids:, include_practice_default: false)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled?
      raise ArgumentError, "Choose whether to repair the clinic default." unless
        [ true, false ].include?(include_practice_default)

      requested_site_ids = Array(site_ids).map { |id| Integer(id) }
      unless requested_site_ids.uniq.length == requested_site_ids.length
        raise ArgumentError, "Choose each location once."
      end
      if requested_site_ids.empty? && !include_practice_default
        raise ArgumentError, "Choose at least one exact profile scope."
      end

      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute(
          "SELECT pg_advisory_xact_lock(hashtextextended('apply:demo-sandbox-pool', 0))"
        )
        ApplicationRecord.connection.execute(
          "SELECT pg_advisory_xact_lock(hashtextextended(" \
            "#{ApplicationRecord.connection.quote("apply:demo-lesson:#{DemoLessonCatalog::SANDBOX_KEY}")}, 0))"
        )
        practice = Clinic::Practice.find(Integer(practice_id))
        lesson = DemoLesson.lock.find_by!(lesson_key: DemoLessonCatalog::SANDBOX_KEY, practice_id: practice.id)
        run = DemoRun.active.lock.find(Integer(run_id))
        raise ActiveRecord::RecordNotFound unless run.practice_id == practice.id &&
          run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present? &&
          run.operator_user.active?

        # A shared Sandbox restart retains the lesson but can change its run visitor.
        raise ActiveRecord::RecordNotFound unless lesson.visitor_id.present? &&
          lesson.operator_user_id == run.operator_user_id
        membership = Clinic::Membership.active.lock.find_by!(practice:, user: run.operator_user)
        sites = practice.sites.where(id: requested_site_ids).order(:id).to_a
        raise ActiveRecord::RecordNotFound unless sites.map(&:id).sort == requested_site_ids.sort

        practice.with_lock do
          sites.each(&:lock!)
          raise ActiveRecord::RecordNotFound unless sites.all? { |site| site.status == "active" }

          scopes = []
          scopes << nil if include_practice_default
          scopes.concat(sites)
          effective_at = Current.business_time
          scopes.map { |site| repair_scope!(run:, practice:, site:, membership:, effective_at:) }
        end
      end
    end

    def self.repair_scope!(run:, practice:, site:, membership:, effective_at:)
      current = Clinic::PracticeFeatureVersion.for_practice(practice).where(site:)
        .order(revision: :desc, id: :desc).first!
      if current.effective_from > effective_at
        raise ArgumentError, "The selected Sandbox profile has a future effective revision."
      end
      stored = current.optional_features.deep_dup
      unless stored["finalized_at"].present? &&
          Clinic::Configuration::PracticeFeatures::CLINIC_TYPES.include?(stored["clinic_type"]) &&
          stored.key?("service_scope") && stored.key?("assessment_scope")
        raise ArgumentError, "The selected Sandbox profile must already be configured and finalized."
      end

      key = [ OPERATION, "run", run.id, site ? "site-#{site.id}" : "practice" ].join("-")
      existing = Clinic::PracticeFeatureVersion.for_practice(practice).find_by(request_key: key)
      if existing
        raise Clinic::Idempotency::Conflict unless existing.site_id == site&.id &&
          existing.created_by_membership_id == membership.id && current.id == existing.id &&
          existing.content_digest == digest_for(run:, practice:, site:)
        return existing
      end

      stored["service_scope"] = Array(stored["service_scope"]) | SERVICES
      stored["selected_services"] = Array(stored.fetch("selected_services", stored["service_scope"])) | SERVICES
      stored["assessment_scope"] = Array(stored["assessment_scope"]) | ASSESSMENTS
      service_options = Clinic::Configuration::PracticeFeatures::SERVICE_OPTIONS_BY_SPECIALTY
        .fetch(stored["clinic_type"])
      assessment_options = Clinic::Configuration::PracticeFeatures::ASSESSMENT_OPTIONS_BY_SPECIALTY
        .fetch(stored["clinic_type"])
      unless (stored["service_scope"] - service_options).empty? &&
          (stored["assessment_scope"] - assessment_options).empty?
        raise ArgumentError, "The requested Sandbox capabilities are incompatible with this profile."
      end
      Clinic::PracticeFeatureVersion.create!(practice:, site:, created_by_membership: membership,
        revision: current.revision + 1, optional_features: stored,
        effective_from: effective_at, request_key: key,
        content_digest: digest_for(run:, practice:, site:))
    end

    def self.digest_for(run:, practice:, site:)
      Digest::SHA256.hexdigest({ operation: OPERATION, run_id: run.id,
        practice_id: practice.id, site_id: site&.id, services: SERVICES,
        assessments: ASSESSMENTS }.to_json)
    end
    private_class_method :repair_scope!, :digest_for
  end
end
