module Clinic
  class WorkingDraftsController < ApiController
    before_action :authorize_context

    def show
      draft = find_draft
      audit!(draft, "released")
      render json: representation(draft)
    end

    def update
      expected = bounded_integer!(params[:expected_version], field: :expected_version, min: 0, max: 2_147_483_646)
      raw = params[:payload]
      raise ArgumentError, "A working draft must be an object or empty." unless raw.nil? || raw.is_a?(ActionController::Parameters) || raw.is_a?(Hash)
      payload = raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : raw
      encoded = payload.nil? ? nil : JSON.generate(payload)
      raise ArgumentError, "This working draft is too large." if encoded && encoded.bytesize > 200_000

      draft = WorkingDraft.transaction do
        connection = WorkingDraft.connection
        identity = "working-draft:#{current_practice.id}:#{clinic_membership.id}:#{@legacy_context_key}"
        connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(#{connection.quote(identity)}, 0))")
        record = find_draft || draft_scope.new(kind: @kind, patient: @patient, encounter: @encounter)
        # A lost response may be retried verbatim. Only the immediately preceding
        # version can replay; old saves cannot resurrect a cleared working copy.
        replay = record.persisted? && record[:version] == expected + 1 && record.encrypted_payload == encoded
        unless replay
          if record[:version] != expected
            render json: { error: "This working draft changed in another window. Reload and review before saving.", code: "draft_conflict" }, status: :conflict
            next nil
          end
          record[:version] = expected + 1
          record.context_key = @context_key
          record.encrypted_payload = encoded
          record.save!
          audit!(record, "committed")
        end
        record
      end
      render json: representation(draft) if draft
    end

    private

    def authorize_context
      @kind = params[:kind].to_s
      capability = {
        "registration" => "patients.write", "patient_update" => "patients.write",
        "appointment" => "appointments.book", "vitals" => "observations.write",
        "soap" => "notes.write", "checkout" => "billing.invoice_draft", "follow_up" => "encounters.write"
      }[@kind]
      raise ArgumentError, "This working draft type is unavailable." unless capability
      if @kind == "checkout"
        capability = %w[billing.invoice_draft billing.invoice_post billing.payment_record]
          .find { |action| current_ability.allowed_permission?(action) } || capability
      end
      patient_id = optional_id(params[:patient_id], :patient_id)
      encounter_id = optional_id(params[:encounter_id], :encounter_id)
      @record_id = optional_id(params[:record_id], :record_id)
      @scope = params[:scope].presence || "main"
      allowed_scopes = case @kind
      when "checkout" then %w[main online_payment cash_payment invoice_edit invoice_post]
      when "follow_up" then %w[main operations]
      else %w[main]
      end
      raise ArgumentError, "This working draft scope is unavailable." unless allowed_scopes.include?(@scope)
      if patient_id
        action = @kind == "appointment" ? :read_identity : :read
        @patient = current_practice.patients.accessible_by(current_ability, action).find(patient_id)
      end
      @encounter = current_practice.encounters.where(patient: @patient).find(encounter_id) if encounter_id && @patient
      raise ArgumentError, "Select the patient for this working draft." if encounter_id && !@patient
      raise ArgumentError, "Select the patient for this working draft." if %w[patient_update vitals soap checkout follow_up].include?(@kind) && !@patient
      raise ArgumentError, "Select the encounter for this working draft." if %w[vitals soap follow_up].include?(@kind) && !@encounter
      if @kind == "checkout" && @record_id
        invoice = current_practice.invoices.where(patient: @patient).find(@record_id)
        raise ArgumentError, "This invoice belongs to another visit." if @encounter && invoice.encounter_id != @encounter.id
      elsif @record_id
        raise ArgumentError, "This working draft does not accept a record selection."
      end
      if @kind == "appointment"
        site_id = optional_id(params[:site_id], :site_id) || current_clinic_site&.id
        raise ArgumentError, "Select a location for this working draft." unless site_id
        @site = accessible_clinic_sites.find(site_id)
      end
      Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
        action: capability, site: @encounter&.site || @site)
      Clinic::Authorization.authorize!(actor: current_user, practice: current_practice,
        action: "notes.read", site: @encounter.site) if @kind == "soap"
      @context_key = [ @kind, patient_id || 0, encounter_id || 0, @record_id || 0, @scope ].join(":")
      @legacy_context_key = @context_key
      @context_key = "#{@context_key}:site:#{@site.id}" if @site
    end

    def find_draft
      draft = draft_scope.first
      return draft if draft || !@site

      legacy = WorkingDraft.find_by(practice: current_practice, actor_membership: clinic_membership,
        context_key: @legacy_context_key)
      payload = legacy&.encrypted_payload && JSON.parse(legacy.encrypted_payload)
      legacy if payload&.dig("draft", "siteId").to_s == @site.id.to_s
    end

    def draft_scope
      WorkingDraft.where(practice: current_practice, actor_membership: clinic_membership, context_key: @context_key)
    end

    def representation(draft)
      { kind: @kind, patient_id: @patient&.id, encounter_id: @encounter&.id, record_id: @record_id, scope: @scope, site_id: @site&.id,
        version: draft ? draft[:version] : 0, payload: draft&.encrypted_payload && JSON.parse(draft.encrypted_payload),
        updated_at: draft&.updated_at&.iso8601(6) }
    end

    def audit!(draft, outcome)
      Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
        action_code: "working_draft.#{action_name}", outcome: outcome,
        resource_version_ref: draft && "Clinic::WorkingDraft/#{draft.id}/#{draft[:version]}")
    end
  end
end
