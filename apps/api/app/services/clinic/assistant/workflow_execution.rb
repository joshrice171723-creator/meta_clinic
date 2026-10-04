module Clinic
  module Assistant
    class WorkflowExecution
      PROPOSAL_TTL = 5.minutes

      class Conflict < StandardError
        attr_reader :code

        def initialize(message, code: "workflow_conflict")
          @code = code
          super(message)
        end
      end
      class Unavailable < StandardError; end

      def initialize(context:, actor:, session:)
        @context, @actor, @session = context, actor, session
      end

      def read!(operation:, inputs:)
        definition = WorkflowRegistry.fetch!(operation)
        raise WorkflowRegistry::Unavailable, "That workflow is not a read." unless definition.fetch("kind") == "read"
        WorkflowRegistry.require_available!(definition, context: @context)
        normalized = WorkflowSchema.normalize!(definition:, raw: inputs, context: @context)
        handler = WorkflowRegistry.handler_for(definition, context: @context)
        resolved = handler.resolve(key: operation, inputs: normalized)
        handler.authorize!(key: operation, inputs: resolved)
        payload = WorkflowPresenter.present!(handler.execute(key: operation, resolved: resolved))
        event = audit!("assistant.workflow.read", :released, operation)
        payload[:receipt_id] ||= event.id.to_s if event.respond_to?(:id)
        payload
      end

      def propose!(operation:, inputs:)
        definition = WorkflowRegistry.fetch!(operation)
        raise WorkflowRegistry::Unavailable, "That workflow does not change records." unless definition.fetch("kind") == "change"
        WorkflowRegistry.require_available!(definition, context: @context)
        normalized = WorkflowSchema.normalize!(definition:, raw: inputs, context: @context)
        handler = WorkflowRegistry.handler_for(definition, context: @context)
        resolved = handler.resolve(key: operation, inputs: normalized)
        handler.authorize!(key: operation, inputs: resolved)
        versions = handler.versions(key: operation, resolved: resolved)
        preview = WorkflowPresenter.preview(definition:, inputs: normalized, context: @context)
        if handler.respond_to?(:preview)
          additions = handler.preview(key: operation, resolved: resolved)
          preview.concat(WorkflowPresenter.preview_entries(additions))
        end
        proposal = WorkflowProposal.create!(
          practice: @context.practice, workflow_context: @context, actor_user: @actor,
          membership: @context.membership, site: @context.site, patient: @context.patient,
          encounter: @context.encounter, member_session_reference: @context.member_session_reference,
          operation_key: operation, status: "pending", arguments_data: normalized,
          record_versions: versions, preview_data: preview, expires_at: PROPOSAL_TTL.from_now
        )
        audit!("assistant.workflow.proposal.created", :prepared, operation, proposal.public_id)
        proposal_response(proposal)
      end

      def confirm!(public_id:)
        proposal = scoped_proposal!(public_id)
        response = nil
        ApplicationRecord.transaction(requires_new: true) do
          # Context first is the shared lock order used by invalidation; this closes
          # the race where a patient or role changes while a confirmation is waiting.
          @context.with_lock do
            proposal.with_lock do
              proposal.reload
              @context.reload
              validate_binding!(proposal)
              validate_context!
              if proposal.status == "confirmed"
                raise Conflict.new("This proposal was already submitted. Open its receipt to review the saved result.",
                  code: "duplicate_submission")
              end
              raise Conflict, "This proposal is no longer available." unless proposal.status == "pending"
              if proposal.expires_at.past?
                audit!("assistant.workflow.proposal.expired", :failed, proposal.operation_key, proposal.public_id)
                raise Conflict.new("This proposal has expired. Prepare it again.", code: "proposal_expired")
              end
              definition = WorkflowRegistry.fetch!(proposal.operation_key)
              raise Conflict, "This proposal cannot be confirmed." unless definition.fetch("kind") == "change"
              WorkflowRegistry.require_available!(definition, context: @context)
              handler = WorkflowRegistry.handler_for(definition, context: @context)
              inputs = proposal.arguments_data || raise(Conflict, "This proposal is unavailable.")
              resolved = handler.resolve(key: proposal.operation_key, inputs: inputs)
              resolved["_request_key"] = "assistant-#{proposal.public_id}"
              handler.authorize!(key: proposal.operation_key, inputs: resolved)
              member_session = MemberSession.find_by(id: @context.member_session_reference, user_id: @actor.id)
              lock_resolved_records!(resolved, [@context.site, @context.patient, @context.encounter,
                @context.membership, @actor, member_session].compact)
              resolved = handler.resolve(key: proposal.operation_key, inputs: inputs)
              resolved["_request_key"] = "assistant-#{proposal.public_id}"
              validate_context!
              handler.authorize!(key: proposal.operation_key, inputs: resolved)
              current_versions = handler.versions(key: proposal.operation_key, resolved: resolved)
              unless current_versions == proposal.record_versions
                audit!("assistant.workflow.proposal.conflicted", :failed, proposal.operation_key, proposal.public_id)
                raise Conflict.new("A selected record changed. Prepare this action again.", code: "stale_proposal")
              end

              result = WorkflowPresenter.present!(handler.execute(key: proposal.operation_key, resolved: resolved))
              workflow_context_service.refresh_after_confirmation!(context: @context, confirmed_proposal: proposal)
              proposal.update!(status: "confirmed", confirmed_at: Time.current,
                result_data: result, result_reference: result.slice(:receipt_id, :source_path).compact.stringify_keys)
              audit!("assistant.workflow.proposal.confirmed", :committed, proposal.operation_key, proposal.public_id)
              response = receipt_response(proposal)
            end
          end
        end
        response
      rescue ActiveRecord::RecordNotUnique
        audit!("assistant.workflow.proposal.conflict", :failed, nil, public_id)
        raise Conflict, "This action conflicts with a saved clinic record. Review the current workspace."
      rescue Conflict => error
        WorkflowContext.invalidate!(@context, actor: @actor) if error.code == "stale_context"
        raise
      end

      def show!(public_id:)
        proposal = scoped_proposal!(public_id)
        validate_binding!(proposal)
        validate_context!
        if proposal.status == "confirmed"
          reauthorize!(proposal)
          audit!("assistant.workflow.receipt.read", :released, proposal.operation_key, proposal.public_id)
          receipt_response(proposal)
        elsif proposal.status == "pending" && proposal.expires_at.future?
          reauthorize!(proposal)
          audit!("assistant.workflow.proposal.read", :released, proposal.operation_key, proposal.public_id)
          proposal_response(proposal)
        elsif proposal.status == "pending"
          audit!("assistant.workflow.proposal.expired", :failed, proposal.operation_key, proposal.public_id)
          raise Conflict.new("This proposal has expired. Prepare it again.", code: "proposal_expired")
        else
          raise ActiveRecord::RecordNotFound
        end
      end

      private

      def scoped_proposal!(public_id)
        value = public_id.to_s
        raise ActiveRecord::RecordNotFound unless value.match?(/\A[0-9a-f-]{36}\z/i)
        @context.proposals.find_by!(public_id: value, actor_user: @actor,
          membership: @context.membership, site: @context.site,
          member_session_reference: @context.member_session_reference)
      end

      def validate_binding!(proposal)
        unless proposal.workflow_context_id == @context.id && proposal.practice_id == @context.practice_id &&
            proposal.actor_user_id == @context.actor_user_id && proposal.membership_id == @context.membership_id &&
            proposal.member_session_reference == @context.member_session_reference &&
            proposal.site_id == @context.site_id && proposal.patient_id == @context.patient_id &&
            proposal.encounter_id == @context.encounter_id
          raise ActiveRecord::RecordNotFound
        end
      end

      def validate_context!
        member_session = MemberSession.find_by(id: @context.member_session_reference, user_id: @actor.id)
        service = WorkflowContext.new(practice: @context.practice, actor: @actor,
          membership: @context.membership, member_session:, site: @context.site, session: @session)
        service.validate!(@context)
      rescue WorkflowContext::Stale
        raise Conflict.new("Your clinic context changed. Reopen the assistant before continuing.", code: "stale_context")
      end

      def reauthorize!(proposal)
        definition = WorkflowRegistry.fetch!(proposal.operation_key)
        WorkflowRegistry.require_available!(definition, context: @context)
        handler = WorkflowRegistry.handler_for(definition, context: @context)
        handler.authorize!(key: proposal.operation_key, inputs: {})
      end

      def workflow_context_service
        member_session = MemberSession.find_by(id: @context.member_session_reference, user_id: @actor.id)
        WorkflowContext.new(practice: @context.practice, actor: @actor, membership: @context.membership,
          member_session:, site: @context.site, session: @session)
      end

      def lock_resolved_records!(resolved, additional = [])
        records = collect_records([resolved, additional]).uniq { |record| [record.class.base_class.name, record.id] }
        records.sort_by { |record| [record.class.base_class.table_name, record.id.to_s] }.each do |record|
          locked = record.class.base_class.where(id: record.id).lock.first
          raise Conflict, "A selected record is no longer available." unless locked
        end
      end

      def collect_records(value, output = [])
        case value
        when ApplicationRecord then output << value
        when Hash then value.each_value { |entry| collect_records(entry, output) }
        when Array then value.each { |entry| collect_records(entry, output) }
        end
        output
      end

      def proposal_response(proposal)
        { status: "proposal", proposal_id: proposal.public_id, operation: proposal.operation_key,
          title: WorkflowRegistry.find(proposal.operation_key)&.fetch("title", nil),
          expires_at: proposal.expires_at.iso8601(6), preview: proposal.preview_data,
          confirmation_required: true }
      end

      def receipt_response(proposal)
        result = proposal.result_data
        raise ActiveRecord::RecordNotFound unless result.is_a?(Hash)
        result.deep_symbolize_keys.merge(status: "receipt", proposal_id: proposal.public_id,
          confirmed_at: proposal.confirmed_at.iso8601(6))
      end

      def audit!(action, outcome, operation = nil, public_id = nil)
        resource = if public_id.present?
          "assistant_workflow_proposal/#{public_id}"
        elsif operation.present?
          "assistant_workflow/#{operation}"
        else
          "assistant_workflow_context/#{@context.public_id}"
        end
        Clinic::AuditRecorder.record!(practice: @context.practice, actor: @actor,
          action_code: action, outcome:, resource_version_ref: resource)
      end
    end
  end
end
