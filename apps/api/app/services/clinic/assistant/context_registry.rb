module Clinic
  module Assistant
    class ContextRegistry
      CONTEXT_TTL = 30.minutes
      DEMO_SESSION_KEYS = %i[
        guided_clinic_demo_run_id guided_clinic_demo_view development_demo_user_id sandbox_account
        sandbox_preparing_visitor_id
      ].freeze

      class StaleContext < StandardError; end

      def self.create!(practice:, actor:, membership:, member_session:, site:, patient:, encounter:, session:)
        ApplicationRecord.transaction do
          Context.where(member_session:, invalidated_at: nil).find_each do |previous|
            previous.update!(invalidated_at: Time.current)
            invalidate_proposals!(previous, actor:)
          end
          selection_options = build_selection_options(practice:, site:)
          context = Context.create!(practice:, actor_user: actor, membership:, member_session:, site:, patient:, encounter:,
            public_id: SecureRandom.uuid,
            authorization_generation: membership.authorization_generation,
            session_context: context_snapshot(session:, patient:, encounter:), selection_options:, expires_at: CONTEXT_TTL.from_now)
          session[:clinic_assistant_context_public_id] = context.public_id
          context
        end
      end

      def self.find!(public_id:, practice:, actor:, member_session:)
        Context.where(practice:, actor_user: actor, member_session:).find_by!(public_id:)
      end

      def self.validate!(context, practice:, actor:, membership:, member_session:, site:, session:)
        context.reload
        fresh_actor = User.find_by(id: actor&.id)
        fresh_membership = Membership.active.find_by(id: membership&.id, user_id: actor&.id, practice_id: practice.id)
        fresh_session = MemberSession.find_by(id: member_session&.id, user_id: actor&.id)
        fresh_site = practice.sites.find_by(id: session[:clinic_site_id])
        patient = context.patient.reload
        encounter = context.encounter&.reload
        valid = context.active? && context.public_id == session[:clinic_assistant_context_public_id] &&
          fresh_actor&.active? && fresh_membership && fresh_session&.unexpired? &&
          context.practice_id == practice.id && context.actor_user_id == fresh_actor.id &&
          context.membership_id == fresh_membership.id && context.member_session_id == fresh_session.id &&
          context.authorization_generation == fresh_membership.authorization_generation &&
          context.site_id == site&.id && context.site_id == fresh_site&.id &&
          context.session_context == context_snapshot(session:, patient:, encounter:) &&
          patient.practice_id == practice.id && patient.merged_into_patient_id.nil? &&
          (encounter.nil? || (encounter.practice_id == practice.id &&
            encounter.patient_id == patient.id && encounter.site_id == context.site_id))
        raise StaleContext unless valid

        context
      end

      def self.selection!(context, kind, token)
        raise ArgumentError, "Choose a visit type and clinician before checking openings." if token.blank?

        selections = Array(context.selection_options[kind.to_s])
        selections.find { |item| ActiveSupport::SecurityUtils.secure_compare(item.fetch("selection_id"), token.to_s) } ||
          raise(ActiveRecord::RecordNotFound)
      end

      def self.response(context)
        {
          context_id: context.public_id,
          expires_at: context.expires_at.iso8601(6),
          practice: { name: context.practice.name },
          site: { name: FacilitySerializer.site(context.site)[:name] || context.site.code },
          patient: { name: context.patient.display_name },
          encounter: (context.encounter_id ? { selected: true } : nil),
          authorization_generation: context.authorization_generation,
          visit_types: Array(context.selection_options["visit_types"]).map { |item| item.slice("selection_id", "name") },
          clinicians: Array(context.selection_options["clinicians"]).map { |item| item.slice("selection_id", "name") }
        }
      end

      def self.invalidate!(context, actor:)
        context.with_lock do
          context.update_columns(invalidated_at: Time.current, updated_at: Time.current) unless context.invalidated_at
          invalidate_proposals!(context, actor:)
        end
      end

      def self.session_snapshot(session)
        DEMO_SESSION_KEYS.index_with { |key| session[key] }.transform_keys(&:to_s)
      end

      def self.context_snapshot(session:, patient:, encounter:)
        session_snapshot(session).merge(
          "patient_record_version" => record_version(patient),
          "encounter_record_version" => (record_version(encounter) if encounter)
        )
      end

      def self.record_version(record)
        return record.lock_version if record.has_attribute?(:lock_version)
        return "paper_trail:#{record.versions.maximum(:id).to_i}" if record.respond_to?(:versions)

        "updated_at:#{record.updated_at&.utc&.iso8601(6)}"
      end

      def self.build_selection_options(practice:, site:)
        features = Clinic::Configuration::PracticeFeatures.snapshot(practice:, site:)
        visit_type_ids = Clinic::Configuration::StarterProfile.available_visit_type_ids(
          practice:, site:, features:, require_ready: true
        )
        visit_types = practice.visit_types.active.where(id: visit_type_ids).order(:code, :id).map do |visit_type|
          { "selection_id" => SecureRandom.urlsafe_base64(18), "record_id" => visit_type.id, "name" => visit_type.code }
        end
        clinicians = practice.clinician_profiles.order(:id).map do |clinician|
          { "selection_id" => SecureRandom.urlsafe_base64(18), "record_id" => clinician.id,
            "name" => clinician.display_name.presence || "Clinician" }
        end
        { "visit_types" => visit_types, "clinicians" => clinicians }
      end

      def self.invalidate_proposals!(context, actor:)
        proposals = context.proposals.where(status: "pending").to_a
        proposals.each do |proposal|
          Clinic::AuditRecorder.record!(practice: context.practice, actor:, action_code: "assistant.proposal.invalidated",
            outcome: :failed, resource_version_ref: "assistant_proposal/#{proposal.public_id}")
        end
        context.proposals.where(id: proposals.map(&:id)).update_all(status: "invalidated", updated_at: Time.current) if proposals.any?
      end

      private_class_method :session_snapshot, :context_snapshot, :build_selection_options, :invalidate_proposals!
    end
  end
end
