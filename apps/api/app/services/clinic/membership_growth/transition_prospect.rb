module Clinic
  module MembershipGrowth
    class TransitionProspect
      class InvalidTransition < StandardError; end
      Result = Struct.new(:prospect, keyword_init: true)
      SIMPLE_TRANSITIONS = {
        "contacted" => { from: %w[new paid_onboarding], to: "contacted" },
        "qualify" => { from: %w[new contacted], to: "qualified" },
        "decline" => { from: %w[new contacted qualified], to: "declined" }
      }.freeze

      def self.call(practice:, actor:, prospect_id:, action:, lock_version:)
        new(practice:, actor:, prospect_id:, action:, lock_version:).call
      end

      def self.convert_for_identity!(identity:, actor:, now: Current.business_time)
        MembershipProspect.where(
          practice_id: identity.practice_id,
          portal_identity_id: identity.id,
          patient_id: identity.patient_id,
          status: %w[paid_onboarding contacted]
        ).lock.each do |prospect|
          prospect.update!(status: "converted", converted_at: now)
          Clinic::AuditRecorder.record!(
            practice: identity.practice,
            actor: actor,
            action_code: "membership_prospects.converted",
            outcome: :committed,
            resource_version_ref: "membership_prospect:#{prospect.id}"
          )
        end
      end

      def initialize(practice:, actor:, prospect_id:, action:, lock_version:)
        @practice = practice
        @actor = actor
        @prospect_id = positive_integer(prospect_id, "Prospect")
        @action = action.to_s
        @expected_lock_version = non_negative_integer(lock_version, "Lock version")
      end

      def call
        reviewer = Clinic::Authorization.authorize!(practice: practice, actor: actor, action: "subscriptions.review")
        ApplicationRecord.transaction do
          prospect = MembershipProspect.where(practice_id: practice.id).lock.find(prospect_id)
          raise ActiveRecord::StaleObjectError.new(prospect, "update") unless prospect.lock_version == expected_lock_version

          transition(prospect, reviewer)
        end
      end

      private

      attr_reader :practice, :actor, :prospect_id, :action, :expected_lock_version

      def transition(prospect, reviewer)
        if prospect.intent_type == "purchase" && action != "contacted"
          raise InvalidTransition, "Paid onboarding can only be marked contacted from this pipeline."
        end
        if prospect.intent_type == "outreach" && prospect.status_paid_onboarding?
          raise InvalidTransition, "This outreach request is not a paid onboarding record."
        end
        definition = SIMPLE_TRANSITIONS[action]
        raise ArgumentError, "Unknown membership prospect action." unless definition
        unless definition.fetch(:from).include?(prospect.status)
          raise InvalidTransition, "That prospect cannot move from #{prospect.status} using this action."
        end

        now = Current.business_time
        prospect.update!(
          status: definition.fetch(:to),
          reviewed_by_membership: reviewer,
          reviewed_at: now
        )
        complete_onboarding_task!(prospect, reviewer) if prospect.intent_type == "purchase" && action == "contacted"
        record_outcome!(prospect, action)
        Result.new(prospect: prospect)
      end

      def complete_onboarding_task!(prospect, reviewer)
        task = prospect.onboarding_task
        return unless task && task.state != "completed"

        task.update!(state: "completed", resolution_code: "completed", completed_by_membership: reviewer,
          completed_at: Current.business_time)
      end

      def record_outcome!(prospect, outcome)
        Clinic::AuditRecorder.record!(
          practice: practice,
          actor: actor,
          action_code: "membership_prospects.#{outcome}",
          outcome: :committed,
          resource_version_ref: "membership_prospect:#{prospect.id}"
        )
      end

      def positive_integer(value, label)
        text = value.to_s
        raise ArgumentError, "#{label} must be a positive integer." unless text.match?(/\A[1-9]\d*\z/)

        text.to_i
      end

      def non_negative_integer(value, label)
        text = value.to_s
        raise ArgumentError, "#{label} must be a non-negative integer." unless text.match?(/\A\d+\z/)

        text.to_i
      end
    end
  end
end
