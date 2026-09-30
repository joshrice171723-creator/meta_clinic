require "base64"
require "digest"

module Qa
  class WorkspaceController < ApplicationController
    skip_before_action :verify_authenticity_token, if: :service_authenticated?
    before_action :require_qa_access
    rescue_from ActiveRecord::RecordInvalid, ArgumentError do |error|
      render json: { error: error.message }, status: :unprocessable_entity
    end

    def show
      render json: { build: Workspace.build, atlas: Atlas.read, state: Workspace.state, github: Workspace.github(refresh: params[:refresh] == "1"),
        tasks: task_scope.order(created_at: :desc).limit(100).map { |task| task_json(task) },
        events: Event.order(created_at: :desc).limit(100), evidence: Evidence.order(created_at: :desc).limit(100).map { |item| evidence_json(item) },
        guardrails: Workspace::GUARDRAILS, baseline: Snapshot.find_by(key: "baseline")&.data,
        pin: Snapshot.find_by(key: "pin")&.data,
        capabilities: { agent: @service_token.present?, github_questions: ENV["QA_GITHUB_TOKEN"].present? } }
    end

    def status
      state = Workspace.state
      issues = Workspace.github
      build = Workspace.build
      render json: { build:, atlas: Atlas.read, last_qa_revision: state["last_qa_revision"], last_qa_run_at: state["last_run_at"],
        confirmed_pin: Snapshot.find_by(key: "pin")&.data,
        counts: { open: issues.fetch("issues", []).count { |issue| issue["state"] == "open" },
          closed: issues.fetch("issues", []).count { |issue| issue["state"] == "closed" },
          historical_passed: state.fetch("retest", []).count { |issue| issue["status"] == "passed" },
          current_build_completed_tasks: build["revision"] ? Task.where(status: "completed", revision: build["revision"]).count : nil,
          queued: task_scope.where(status: "queued").count }, github_status: issues["status"], guardrails: Workspace::GUARDRAILS }
    end

    def issues = render(json: Workspace.github)
    def atlas = render(json: Atlas.read)
    def retest = render(json: { retest: Workspace.state.fetch("retest", []), coverage: Workspace.state.fetch("coverage", []) })
    def batches = render(json: { batches: Workspace.state.fetch("batches", []), releases: Workspace.state.fetch("releases", []) })
    def tasks = render(json: { tasks: task_scope.order(created_at: :desc).limit(100).map { |task| task_json(task) } })

    def create_task
      input = object!(:task)
      kind = string!(input, "kind", 30)
      revision = revision!(input["revision"])
      raise ArgumentError, "Live revision changed; refresh before queuing." unless verified_build!["revision"] == revision
      raise ArgumentError, "Confirm the live build pin before queuing work." unless Snapshot.find_by(key: "pin")&.data&.fetch("revision", nil) == revision
      payload = input.fetch("payload", {})
      unless @service_token || current_user&.platform_owner? || %w[retest qa_run].include?(kind)
        return render json: { error: "Only a platform owner can queue this task kind." }, status: :forbidden
      end
      raise ArgumentError, "Task payload must be an object." unless payload.is_a?(Hash) && payload.to_json.bytesize < 30_000
      task = Task.create_or_find_by!(request_key: string!(input, "request_key", 100)) do |record|
        record.assign_attributes(user: actor, kind:, title: string!(input, "title", 200),
          recipient: input.fetch("recipient", "muse"), revision:, payload:)
      end
      raise ArgumentError, "Request key already belongs to another actor." unless task.user_id == actor.id
      Workspace.event(user: actor, kind: "task_queued", summary: task.title, revision:, payload: { task_id: task.id }, event_key: "queued:#{task.id}")
      Workspace.event(user: actor, kind: "defect_found", summary: "Pending triage: #{task.title}", revision:, payload: { task_id: task.id }, event_key: "reported:#{task.id}") if task.kind == "issue_report"
      if task.kind == "question" && task.result["github_delivery"].nil?
        task.with_lock do
          task.update!(result: { github_delivery: Workspace.deliver_question(task) }) if task.result["github_delivery"].nil?
        end
      end
      render json: task_json(task), status: :created
    end

    def transition
      run_id = string!(params.to_unsafe_h, "run_id", 120)
      revision = revision!(params[:revision])
      outcome = params[:status].to_s
      task = task_scope.find(params[:id])
      conflict = nil
      actor.with_lock do
        task.lock!
        build = Workspace.build
        live = build["revision"]
        if build["dirty"] || live != revision || task.revision != revision || Snapshot.find_by(key: "pin")&.data&.fetch("revision", nil) != revision
          if task.status == "claimed" && task.claim_run_id == run_id && task.claimed_by_id == actor.id
            task.update!(status: "queued", claimed_by: nil, claim_run_id: nil, claimed_at: nil)
            Workspace.event(user: actor, kind: "run_aborted", summary: "Build changed during #{run_id}; task returned to queue.", revision: live, payload: { task_id: task.id, run_id:, pinned_revision: task.revision })
          end
          conflict = "Build identity changed, unavailable, or has uncommitted changes; use a committed pinned build."
        elsif outcome == "claimed"
          if task.status != "queued" || Event.exists?(event_key: "claim:#{run_id}")
            conflict = "Task already claimed, or this run has already claimed its one task."
          else
            task.update!(status: "claimed", claimed_by: actor, claim_run_id: run_id, claimed_at: Time.current,
              payload: task.payload.merge("qa_baseline" => Snapshot.find_by(key: "baseline")&.data))
            Workspace.event(user: actor, kind: "run_started", summary: "#{run_id} claimed #{task.title}", revision:, payload: { task_id: task.id, run_id: }, event_key: "claim:#{run_id}")
          end
        elsif %w[completed failed aborted].include?(outcome)
          if task.status != "claimed" || task.claimed_by_id != actor.id || task.claim_run_id != run_id
            conflict = "Only the claiming run can submit this result."
          else
            result = params[:result].respond_to?(:to_unsafe_h) ? params[:result].to_unsafe_h : params[:result]
            validate_result!(result) unless outcome == "aborted"
            if outcome == "completed" && result.fetch("defects").any? { |defect| defect["verdict"] != "passed" }
              raise ArgumentError, "A completed run requires every defect to pass. Submit failed for a mixed or blocked verdict."
            end
            task.update!(status: outcome == "aborted" ? "queued" : outcome, result: result || {},
              **(outcome == "aborted" ? { claimed_by: nil, claim_run_id: nil, claimed_at: nil } : {}))
            Workspace.event(user: actor, kind: outcome == "aborted" ? "run_aborted" : "retest_#{outcome == 'completed' ? 'passed' : 'failed'}",
              summary: "#{run_id}: #{task.title} — #{outcome}", revision:, payload: { task_id: task.id, run_id:, result: result || {} })
          end
        else
          raise ArgumentError, "Choose claimed, completed, failed, or aborted."
        end
      end
      return render json: { error: conflict }, status: :conflict if conflict
      render json: task_json(task)
    end

    def create_event
      input = object!(:event)
      render json: Workspace.event(user: actor, kind: string!(input, "kind", 60), summary: string!(input, "summary", 500),
        revision: revision!(input["revision"]), payload: input.fetch("payload", {}), event_key: input.fetch("event_key", SecureRandom.uuid)), status: :created
    end

    def update_state
      state = object!(:state)
      raise ArgumentError, "State exceeds 5 MB." if state.to_json.bytesize > 5.megabytes
      Snapshot.put("state", state)
      Workspace.event(user: actor, kind: "state_synced", summary: "QA state imported from agent records.", revision: state["last_qa_revision"])
      render json: { saved: true, updated_at: Time.current.iso8601 }
    end

    def priority
      raise ArgumentError, "Choose true or false." unless [ true, false ].include?(params[:priority])
      number = Integer(params[:id])
      raise ArgumentError, "Choose a GitHub issue." unless number.positive?
      Snapshot.put("priority:#{number}", { priority: params[:priority] })
      Workspace.event(user: actor, kind: "priority_changed", summary: "GitHub ##{number} #{params[:priority] ? 'marked fix next' : 'removed from fix next'}.", payload: { issue: number })
      render json: { issue: number, priority: params[:priority] }
    end

    def create_evidence
      input = object!(:evidence)
      data = Base64.strict_decode64(string!(input, "data_base64", 5_600_000))
      type = input["content_type"]
      valid = type == "image/png" ? data.start_with?("\x89PNG\r\n\x1a\n".b) : type == "image/jpeg" && data.start_with?("\xff\xd8\xff".b)
      raise ArgumentError, "Upload a PNG or JPEG of 4 MB or less." unless valid && data.bytesize.between?(1, 4.megabytes)
      item = Evidence.create!(user: actor, issue_number: Integer(input["issue"]), revision: revision!(input["revision"]),
        caption: string!(input, "caption", 500), content_type: type, image: data, digest: Digest::SHA256.hexdigest(data),
        phase: input.fetch("phase", "observation"), context: evidence_context!(input.fetch("context", {})))
      Workspace.event(user: actor, kind: "evidence_saved", summary: item.caption, revision: item.revision, payload: { evidence_id: item.id, issue: item.issue_number })
      render json: evidence_json(item), status: :created
    end

    def evidence
      item = Evidence.find(params[:id])
      return render json: evidence_json(item) if request.format.json?
      send_data item.image, type: item.content_type, disposition: "inline", filename: "qa-#{item.id}.#{item.content_type == 'image/png' ? 'png' : 'jpg'}"
    end

    def baseline
      revision = revision!(params[:revision])
      raise ArgumentError, "Live build changed." unless verified_build!["revision"] == revision
      raise ArgumentError, "Finish the active run before preparing fixtures." if Task.where(status: "claimed").exists?
      actor.with_lock do
        Current.workspace_tools_owner_session = true
        suffix = SecureRandom.hex(6)
        operator = User.create!(email_address: "qa-baseline-#{suffix}@example.test", password: SecureRandom.urlsafe_base64(32), active: true)
        membership = Development::TestClinic.create!(operator, permissions: Development::GuidedClinicDemo::OPERATOR_PERMISSIONS, seed_fixtures: true)
        membership.practice.update!(name: "QA baseline #{suffix}")
        Development::GuidedClinicDemo.prepare_clinic!(practice: membership.practice, operator:, template_key: "primary_care", suffix: "qa-#{suffix}")
        Clinic::Membership.create!(practice: membership.practice, user: actor)
        Development::TestClinic.create!(actor, permissions: Development::GuidedClinicDemo::OPERATOR_PERMISSIONS, practice: membership.practice, seed_fixtures: false)
        session[:clinic_practice_id] = membership.practice_id unless @service_token
        data = { practice_id: membership.practice_id, operator_id: operator.id, prepared_at: Time.current.iso8601, revision:,
          route: "/clinic", note: "Dedicated QA clinic prepared. Existing demo clinics remain available." }
        Snapshot.put("baseline", data)
        Workspace.event(user: actor, kind: "baseline_prepared", summary: "Dedicated QA baseline clinic #{membership.practice_id} prepared.", revision:, payload: data)
      end
      render json: Snapshot.find_by!(key: "baseline").data
    end

    def pin
      revision = revision!(params[:revision])
      build = verified_build!
      raise ArgumentError, "Live build differs from the requested pin." unless build["revision"] == revision
      reason = string!(params.to_unsafe_h, "reason", 500)
      data = { revision:, version: build["version"], confirmed_at: Time.current.iso8601, confirmed_by: actor.email_address, reason: }
      Snapshot.put("pin", data)
      Workspace.event(user: actor, kind: "build_pinned", summary: reason, revision:, payload: data)
      render json: data
    end

    def approval
      return render json: { error: "Human approval requires the owner's browser session." }, status: :forbidden if @service_token
      task = Task.find(params[:id])
      note = string!(params.to_unsafe_h, "note", 1000)
      outcome = params[:outcome].to_s
      raise ArgumentError, "Choose approved or changes_requested." unless %w[approved changes_requested].include?(outcome)
      task.with_lock do
        raise ArgumentError, "An agent verdict is required before human review." unless %w[completed failed].include?(task.status)
        raise ArgumentError, "This result was already reviewed." if task.human_decision.present?
        params[:revision] = task.revision
        validate_result!(task.result)
        if outcome == "approved"
          raise ArgumentError, "Every defect must pass with stored evidence before approval." unless task.status == "completed" && task.result.fetch("defects").all? { |defect| defect["verdict"] == "passed" }
          raise ArgumentError, "Review the current pinned live revision." unless verified_build!["revision"] == task.revision && Snapshot.find_by(key: "pin")&.data&.fetch("revision", nil) == task.revision
        end
        decision = { outcome:, note:, reviewer: actor.email_address, reviewed_at: Time.current.iso8601, revision: task.revision }
        task.update!(human_decision: decision)
        Workspace.event(user: actor, kind: "human_reviewed", summary: "#{task.title}: #{outcome}", revision: task.revision, payload: { task_id: task.id, decision: })
      end
      render json: task_json(task)
    end

    def notifications
      urgent = %w[retest_failed deploy_finished defect_found task_blocked run_aborted]
      receipts = Snapshot.where("key LIKE 'notification:%'").pluck(:key, :data).to_h
      delivered_ids = receipts.keys.map { |key| key.delete_prefix("notification:").to_i }
      render json: { notifications: Event.where(kind: urgent).where.not(id: delivered_ids).order(:id).limit(100).map do |event|
        { id: event.id, kind: event.kind, summary: event.summary, revision: event.revision, created_at: event.created_at.iso8601, delivery_status: "pending_carrier" }
      end }
    end

    def notification_receipt
      return render json: { error: "Notification receipts require a QA carrier token." }, status: :forbidden unless @service_token
      event = Event.find(params[:id])
      channel = params[:channel].to_s
      raise ArgumentError, "Choose ntfy or telegram." unless %w[ntfy telegram].include?(channel)
      Snapshot.put("notification:#{event.id}", { channel:, delivered_at: Time.current.iso8601, carrier: @service_token.name })
      render json: { recorded: true }
    end

    private

    def service_authenticated?
      return @service_token.present? if defined?(@service_token)
      raw = request.authorization.to_s.delete_prefix("Bearer ")
      @service_token = ServiceToken.authenticate(raw) if request.authorization.to_s.start_with?("Bearer ")
      @service_token.present?
    end

    def require_qa_access
      return if service_authenticated?
      return if request.get? || %w[pin create_task].include?(action_name)
      require_member
      return if performed?
      render json: { error: "QA workspace requires a platform owner account." }, status: :forbidden unless current_user.platform_owner?
    end

    def actor
      return @actor if @actor
      return @actor = @service_token&.user || current_user if @service_token || current_user

      visitor = User.find_by(email_address: "qa-public-desk@example.test") || User.create_or_find_by!(email_address: "qa-public-desk@example.test") do |user|
        user.password = SecureRandom.urlsafe_base64(48)
        user.active = false
      end
      raise ArgumentError, "Public QA attribution is unavailable." if visitor.active? || visitor.admin? || visitor.platform_owner?
      @actor = visitor
    end
    def verified_build!
      build = Workspace.build
      raise ArgumentError, "Commit source changes before pinning or running exact-build QA." if build["dirty"]
      raise ArgumentError, "Live build identity is unavailable." unless build["revision"]
      build
    end
    def task_scope = @service_token ? Task.where(recipient: @service_token.recipient) : Task.all
    def object!(key)
      value = params.require(key)
      raise ArgumentError, "#{key} must be an object." unless value.is_a?(ActionController::Parameters)
      value.to_unsafe_h
    end
    def string!(input, key, maximum)
      value = input[key]
      raise ArgumentError, "#{key} is required (maximum #{maximum} characters)." unless value.is_a?(String) && value.strip.present? && value.length <= maximum
      value.strip
    end
    def revision!(value)
      raise ArgumentError, "A full 40-character revision is required." unless value.to_s.match?(/\A[0-9a-f]{40}\z/)
      value
    end
    def validate_result!(result)
      raise ArgumentError, "Provide a verdict, summary, and evidence references." unless result.is_a?(Hash) && result["summary"].to_s.present? && result["defects"].is_a?(Array) && result["defects"].any?
      result["defects"].each do |defect|
        raise ArgumentError, "Each defect requires an id, pass/fail verdict, positive observed evidence, and stored evidence references." unless
          defect.is_a?(Hash) && defect["id"].present? && %w[passed failed blocked expected-config].include?(defect["verdict"]) &&
          defect["observed"].to_s.present? && defect["evidence_refs"].is_a?(Array) && defect["evidence_refs"].any? &&
          defect["evidence_refs"].all? { |id| Evidence.exists?(id:) } &&
          Evidence.where(id: defect["evidence_refs"], revision: params[:revision]).exists?
        if defect["verdict"] == "passed"
          evidence = Evidence.where(id: defect["evidence_refs"])
          raise ArgumentError, "A passed fix requires a before screenshot and an after screenshot on this revision." unless
            evidence.where(phase: "before").exists? && evidence.where(phase: "after", revision: params[:revision]).exists?
        end
      end
    end
    def evidence_context!(context)
      raise ArgumentError, "Evidence context must be an object." unless context.is_a?(Hash)
      %w[steps expected actual viewport timezone observed_at].each { |key| string!(context, key, 5_000) }
      raise ArgumentError, "Evidence timestamp must include its timezone." unless context["observed_at"].match?(/(?:Z|[+-]\d{2}:\d{2})\z/)
      Time.iso8601(context["observed_at"])
      context.merge("tester" => actor.email_address)
    end
    def task_json(task)
      task.as_json.merge("claimed_by" => task.claim_run_id, "requester" => task.user.email_address)
    end
    def evidence_json(item)
      item.attributes.except("image").merge("url" => "/api/qa/evidence/#{item.id}", "tester" => item.user.email_address)
    end
  end
end
