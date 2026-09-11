module Clinic
  class WorkExceptions
    NOTE_LIMIT = Clinic::Scribe::DocumentationWorklist::CANDIDATE_LIMIT_PER_SOURCE
    PAYMENT_LIMIT = 50
    PAYMENT_STATES = %w[failed needs_reconciliation].freeze

    def self.call(practice:, ability:, site:, unsigned_notes_available:,
      payment_exceptions_available:)
      new(
        practice: practice,
        ability: ability,
        site: site,
        unsigned_notes_available: unsigned_notes_available,
        payment_exceptions_available: payment_exceptions_available
      ).call
    end

    def initialize(practice:, ability:, site:, unsigned_notes_available:,
      payment_exceptions_available:)
      @practice = practice
      @ability = ability
      @site = site
      @unsigned_notes_available = unsigned_notes_available
      @payment_exceptions_available = payment_exceptions_available
    end

    def call
      unsigned = load_source(:unsigned_notes, unsigned_notes_available) { unsigned_notes }
      payments = load_source(:payment_exceptions, payment_exceptions_available) { payment_exceptions }
      {
        schema_version: "work-exceptions-v2",
        sources: {
          unsigned_notes: source_status(unsigned_notes_available, unsigned, NOTE_LIMIT),
          payment_exceptions: source_status(payment_exceptions_available, payments, PAYMENT_LIMIT)
        },
        unsigned_items: unsigned.fetch(:items),
        payment_exceptions: payments.fetch(:items)
      }
    end

    private

    attr_reader :practice, :ability, :site, :unsigned_notes_available,
      :payment_exceptions_available

    def unsigned_notes
      return empty_source unless unsigned_notes_available

      scope = practice.encounter_notes.accessible_by(ability, :read)
        .joins(:encounter)
        .where(clinic_encounters: { site_id: site_ids, status: %w[open completed] })
      candidates = current_unsigned_revisions(scope)
      {
        items: candidates.first(NOTE_LIMIT).map { |revision| unsigned_note_item(revision) },
        truncated: candidates.length > NOTE_LIMIT
      }
    end

    def current_unsigned_revisions(note_scope)
      eligible_note_ids = note_scope.where(note_kind: "soap").select(:id)
      Clinic::EncounterNoteRevision.where(note_id: eligible_note_ids)
        .where(<<~SQL.squish)
          NOT EXISTS (
            SELECT 1 FROM clinic_encounter_note_revisions newer
            WHERE newer.note_id = clinic_encounter_note_revisions.note_id
              AND newer.revision_no > clinic_encounter_note_revisions.revision_no
          )
        SQL
        .where(<<~SQL.squish)
          NOT EXISTS (
            SELECT 1 FROM clinic_encounter_note_signatures signatures
            WHERE signatures.revision_id = clinic_encounter_note_revisions.id
          )
        SQL
        .includes(note: %i[patient encounter])
        .order(created_at: :asc, id: :asc)
        .limit(NOTE_LIMIT + 1)
        .to_a
    end

    def unsigned_note_item(revision)
      note = revision.note
      {
        key: "soap-revision-#{revision.id}",
        kind: "soap_note",
        state: "unsigned_note",
        patient: {
          id: note.patient.id,
          display_name: note.patient.display_name,
          reference: note.patient.reference
        },
        site_id: note.encounter.site_id,
        clinical_encounter_id: note.encounter_id,
        scribe_encounter_id: nil,
        document_id: nil,
        draft_id: nil,
        note_id: note.id,
        note_revision_id: revision.id,
        unresolved_section_count: nil,
        updated_at: revision.created_at.iso8601(6),
        status: "unsigned",
        priority: "routine",
        next_action: "Review and sign the current SOAP note revision",
        owner: nil,
        due_at: nil,
        version: revision.revision_no,
        source: {
          type: "encounter_note_revision",
          id: revision.id,
          href: "/clinic/patients/#{note.patient_id}/encounters/#{note.encounter_id}"
        },
        actions: {
          claim: false,
          assign: false,
          transfer: false,
          resolve: false,
          managed_in_source: true,
          reason: "Signing is completed in the encounter workspace."
        }
      }
    end

    def payment_exceptions
      return empty_source unless payment_exceptions_available

      scope = Clinic::PaymentCollectionIntent.where(practice: practice, state: PAYMENT_STATES)
        .joins(invoice: :encounter)
        .where(clinic_encounters: { site_id: site_ids })
        .includes(:patient, invoice: :encounter)
        .order(updated_at: :asc, id: :asc)
      candidates = scope.limit(PAYMENT_LIMIT + 1).to_a
      {
        truncated: candidates.length > PAYMENT_LIMIT,
        items: candidates.first(PAYMENT_LIMIT).map { |intent| payment_item(intent) }
      }
    end

    def payment_item(intent)
      encounter = intent.invoice.encounter
      patient = patient_identity_available ? {
        id: intent.patient.id,
        display_name: intent.patient.display_name,
        reference: intent.patient.reference
      } : nil
      {
        id: intent.id,
        invoice_id: intent.invoice_id,
        patient: patient,
        site_id: encounter.site_id,
        encounter_id: encounter.id,
        status: intent.state,
        priority: intent.state == "failed" ? "urgent" : "routine",
        next_action: intent.state == "failed" ? "Retry or reconcile the failed payment" : "Reconcile the payment outcome",
        amount: intent.amount.to_d.to_s("F"),
        currency: intent.currency,
        processor: intent.processor,
        updated_at: intent.updated_at.iso8601(6),
        owner: nil,
        due_at: nil,
        version: intent.updated_at.iso8601(6),
        source: {
          type: "payment_collection_intent",
          id: intent.id,
          href: patient ? "/clinic/billing/patients?patient_id=#{patient.fetch(:id)}&invoice_id=#{intent.invoice_id}" : "/clinic/billing"
        },
        actions: {
          claim: false,
          assign: false,
          transfer: false,
          resolve: false,
          managed_in_source: true,
          reason: "Payment recovery is completed in the billing workspace."
        }
      }
    end

    def patient_identity_available
      @patient_identity_available ||= ability.allowed_permission?("patients.read") ||
        ability.allowed_permission?("patients.identity.read")
    end

    def site_ids
      @site_ids ||= site ? [ site.id ] : practice.sites.select(:id)
    end

    def source_status(available, source, limit)
      {
        available: available,
        limit: limit,
        returned_count: source.fetch(:items).length,
        truncated: source.fetch(:truncated),
        error: source[:error]
      }
    end

    def empty_source
      { items: [], truncated: false }
    end

    def load_source(name, available)
      return empty_source unless available

      yield
    rescue ActiveRecord::StatementInvalid, ActiveRecord::ConnectionNotEstablished
      {
        items: [],
        truncated: false,
        error: {
          code: "source_unavailable",
          message: "#{name.to_s.humanize} could not be loaded. Retry before treating the inbox as clear."
        }
      }
    end
  end
end
