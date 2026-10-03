module Clinic
  module Care
    class PrescriptionReconciliationWorklist
      LIMIT = 50
      UNRESOLVED_KINDS = %w[unknown acknowledged accepted outcome_unknown rejected unavailable revoked duplicate].freeze

      def self.call(practice:, actor:, site: nil, page: 1)
        Clinic::Authorization.authorize!(actor:, practice:, action: "patients.read")
        Clinic::Authorization.authorize!(actor:, practice:, action: "clinical_records.read", site:, any_site: site.nil?)
        ability = Ability.new(actor, practice:)
        sites = practice.sites.to_a.select { |candidate| ability.allowed_permission?("clinical_records.read", site: candidate) }
        sites.select! { |candidate| candidate.id == site.id } if site
        patients = practice.patients.accessible_by(ability, :read).select(:id)
        attempts = PrescriptionTransmissionAttempt.where(practice:, patient_id: patients)
          .joins(:prescription_event, :medication_request_revision)
          .where(clinic_medication_request_revisions: { practice_id: practice.id, site_id: sites.map(&:id) })
          .where(clinic_prescription_events: { practice_id: practice.id, source: "simulation", kind: UNRESOLVED_KINDS })
          .where(<<~SQL.squish)
            NOT EXISTS (
              SELECT 1 FROM clinic_prescription_events newer_event
              INNER JOIN clinic_medication_request_revisions newer_revision
                ON newer_revision.id = newer_event.medication_request_revision_id
                AND newer_revision.practice_id = newer_event.practice_id
              WHERE newer_event.practice_id = clinic_prescription_events.practice_id
                AND newer_revision.series_id = clinic_medication_request_revisions.series_id
                AND newer_event.kind <> 'review'
                AND newer_event.id > clinic_prescription_events.id
            )
          SQL
        count = attempts.count
        total_pages = [ (count.to_f / LIMIT).ceil, 1 ].max
        page = [ [ Integer(page), 1 ].max, total_pages ].min
        page_attempts = attempts.includes(:patient, :prescription_event, :medication_request_revision)
          .order("clinic_prescription_transmission_attempts.id ASC").limit(LIMIT).offset((page - 1) * LIMIT).to_a
        attempt_ids = page_attempts.map(&:id)
        responses = PrescriptionResponseEvent.where(practice:, transmission_attempt_id: attempt_ids, event_kind: "received")
          .order(:id).each_with_object({}) { |response, by_attempt| by_attempt[response.transmission_attempt_id] = response }
        cancellations = PrescriptionLifecycleRequest.where(practice:, transmission_attempt_id: attempt_ids, action: "cancel")
          .includes(:response_events).order(:id)
          .each_with_object({}) { |request, by_attempt| by_attempt[request.transmission_attempt_id] = request }
        rows = page_attempts.map do |attempt|
          order = attempt.medication_request_revision
          response = responses[attempt.id]
          cancellation = cancellations[attempt.id]
          cancellation_state = cancellation && PrescriptionResponseWorkflow.request_state(cancellation)
          {
            id: attempt.id, event_id: attempt.prescription_event_id,
            patient: { id: attempt.patient_id, display_name: attempt.patient.display_name, reference: attempt.patient.reference },
            site_id: order.site_id, encounter_id: order.encounter_id,
            medication_request_revision_id: order.id, series_id: order.series_id, version_number: order.version_number,
            medication_name: order.medication_name, outcome: attempt.outcome, source: attempt.prescription_event.source,
            adapter: attempt.adapter, submitted_at: attempt.submitted_at.iso8601(6),
            response_outcome: response&.outcome, response_transaction_type: response&.transaction_type, response_received_at: response&.received_at&.iso8601(6),
            cancellation_state:, original_correlation_id: attempt.correlation_id,
            owner: "Prescriber/support queue",
            next_action: cancellation_state.in?(%w[pending outcome_unknown]) ?
              "Resolve the existing local cancellation request using its original correlation; do not submit a replacement." :
              "Review original attempt and received simulation evidence before reconciliation or cancellation.",
            href: "/clinic/patients/#{attempt.patient_id}/encounters/#{order.encounter_id}?focus=clinical-plan-workspace&medication_request_revision_id=#{order.id}&prescription_attempt_id=#{attempt.id}"
          }
        end
        {
          schema_version: "prescription-reconciliation-worklist-v1", practice_id: practice.id, actor_id: actor.id,
          site_id: site&.id, as_of: Time.current.iso8601(6), source: "clinic_prescription_transmission_attempts",
          limit: LIMIT, unresolved_count: count, returned_count: rows.length, truncated: count > LIMIT,
          pagination: { page:, per_page: LIMIT, total: count, total_pages: }, items: rows
        }
      end

    end
  end
end
