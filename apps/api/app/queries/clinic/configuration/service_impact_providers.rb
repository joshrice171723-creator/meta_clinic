require "digest"

module Clinic
  module Configuration
    # Inventories only recorded, typed associations. Scope intent is not a
    # runtime gate; generic names, drug routes and urgency are not classifiers.
    class ServiceImpactProviders
      CLINICAL = {
        "external_lab_coordination" => [ Care::ServiceRequestRevision, { request_kind: "lab" }, %w[draft active on_hold], "service_request" ],
        "prescription_preparation" => [ Care::MedicationRequestRevision, {}, %w[draft authorized on_hold], "medication_request" ],
        "take_home_fulfillment" => [ Care::MedicationRequestRevision, { fulfillment_route: "take_home" }, %w[draft authorized on_hold], "medication_request" ],
        "in_office_medications" => [ Care::MedicationRequestRevision, { fulfillment_route: "administration" }, %w[draft authorized on_hold], "medication_request" ],
        "minor_office_procedures" => [ Care::ProcedureRevision, {}, %w[planned in_progress], nil ],
        "vaccinations" => [ Care::ImmunizationRevision, {}, %w[planned], nil ]
      }.freeze
      VISIT_KEYS = {
        "psychiatric_evaluation" => %w[psychiatric_evaluation], "adhd_evaluation" => %w[adhd_evaluation],
        "medication_management" => %w[medication_follow_up refill_review],
        "therapy_referral_coordination" => %w[therapy_referral_coordination],
        "individual_therapy" => %w[individual_therapy], "urgent_clinical_follow_up" => %w[urgent_clinical_follow_up]
      }.freeze
      UNCLASSIFIED = %w[point_of_care_testing infusions patient_supplied_medications].freeze

      def initialize(practice:, actor:, site:, site_ids:, current:)
        @practice, @actor, @site, @site_ids, @current = practice, actor, site, site_ids, current
        @ability = Ability.new(actor, practice:)
        @patients = practice.patients.accessible_by(@ability, :read).select(:id)
      end

      def service(code)
        row = base(service: code)
        if CLINICAL.key?(code)
          clinical(row, *CLINICAL.fetch(code))
        elsif code == "telehealth"
          telehealth(row)
        elsif code == "controlled_medications"
          controlled(row)
        elsif VISIT_KEYS.key?(code)
          starter_visits(row, code)
        elsif UNCLASSIFIED.include?(code)
          row[:change_kind] = "unmapped"
          row[:effect] = "Only scope intent is recorded for this code. No exact implemented classifier or service gate establishes its workflow consequences."
          unknown(row, "classification", "Domain-specific existing work", "Generic laboratory work is not point-of-care testing; IV route is not an infusion identity; generic medication stock is not patient-supplied ownership.")
        else
          raise ArgumentError, "No impact provider is registered for this service."
        end
        finish(row)
      end

      def assessment(code)
        row = base(assessment: code)
        row[:effect] = "The configured category will be unavailable for new assessment records and category-dependent revisions. Existing responses, scores and reviewer references remain recorded; no follow-up is completed."
        clinical(row, Care::AssessmentRevision, { category: code }, %w[in_progress], nil)
        row[:limits] << "Follow-up text is not a typed task link. No clinical escalation, scoring rule or recipient is inferred."
        finish(row)
      end

      private

      def base(**identity)
        identity.merge(status: "available", change_kind: "gated", metrics: [], limits: [],
          open_records: nil, open_tasks: nil, unassigned_tasks: nil,
          effect: "New use in the existing service-gated operation will be unavailable. Existing history and owned work are unchanged.",
          resolution: "Review recorded work and its current owner in the existing authorized workspace before changing scope.",
          resolution_path: "/clinic", source_digests: [])
      end

      def allowed?(permission)
        @ability.allowed_permission?("patients.read") &&
          (@site ? @ability.allowed_permission?(permission, site: @site) : @ability.practice_scope_for?(permission))
      end

      def scoped(model)
        model.where(practice: @practice, site_id: @site_ids, patient_id: @patients)
      end

      def metric(row, key, label, permission:, required: true, note: "", across_sites: false, &query)
        item = { key:, label:, status: "restricted", count: nil, note:, required: }
        unless allowed?(permission) && (!across_sites || @ability.practice_scope_for?(permission))
          item[:note] = "Requires existing #{permission}#{across_sites ? " across the practice for cross-site dependencies" : ""} and patient access; configuration permission does not grant it."
          row[:metrics] << item
          return
        end
        relation = query.call
        item[:count] = relation.count
        item[:status] = "available"
        digest = Digest::SHA256.new
        # Batch fingerprints without returning identifiers or loading clinical text.
        relation.reorder(:id).in_batches(of: 1000) do |batch|
          columns = relation.klass.column_names.include?("updated_at") ? %i[id updated_at] : %i[id]
          digest.update(batch.order(:id).pluck(*columns).to_json)
        end
        row[:source_digests] << [ key, digest.hexdigest ]
        row[:metrics] << item
      rescue ActiveRecord::StatementInvalid
        item[:status], item[:count], item[:note] = "unavailable", nil, "This source could not be evaluated. Refresh or ask its owning team; no zero or completed review is claimed."
        row[:metrics] << item unless row[:metrics].include?(item)
      end

      def unknown(row, key, label, note, required: true)
        row[:metrics] << { key:, label:, status: "unknown", count: nil, note:, required: }
      end

      def latest(all)
        all.where.not(id: all.where.not(prior_revision_id: nil).select(:prior_revision_id))
      end

      def clinical(row, model, filter, open_states, source_kind)
        all = scoped(model)
        current = latest(all).where(filter)
        recorded = all.where(filter)
        # Preserve references even after a later revision changes the route/kind.
        series = all.where(series_id: recorded.select(:series_id))
        metric(row, "open_records", "Current unfinished records", permission: "clinical_records.read") { current.where(status: open_states) }
        metric(row, "current_records", "Current records including completed/cancelled states", permission: "clinical_records.read") { current }
        metric(row, "history", "Recorded revisions matching this category or route", permission: "clinical_records.read") { recorded }
        row[:limits] << "Generic bookings and offerings have no service-domain reference. Their names cannot classify future work for this service."
        if row[:service] == "vaccinations"
          row[:effect] = "New immunization records are gated. The clinic-administered immunization eligibility flag also becomes false, so new or revised administered-here completion requires restored configuration. Existing immunization evidence remains; generic medication administration is not disabled."
        end
        if row[:service] == "in_office_medications"
          row[:change_kind] = "intent_only"
          row[:effect] = "This removes configured scope intent only. Administration-route orders and recorded administrations can be reviewed; this code does not gate administration or inventory operations."
        end
        if source_kind
          follow_up_ids = if source_kind == "service_request"
            reports = scoped(Care::LabReport).where(service_request_revision_id: series.select(:id))
            Care::LabResultFollowUp.where(practice: @practice, patient_id: @patients, lab_report_id: reports.select(:id)).select(:id)
          end
          tasks(row, source_kind:, source_ids: series.select(:id), follow_up_ids:)
        end
        if source_kind == "medication_request"
          medication_children(row, series.select(:id))
        elsif source_kind == "service_request"
          laboratory_children(row, series.select(:id))
        elsif model == Care::ProcedureRevision
          metric(row, "plan_links", "Historical procedure provenance links", permission: "clinical_records.read") do
            scoped(Care::ClinicalPlanLink).where(procedure_revision_id: series.select(:id))
          end
          metric(row, "source_orders", "Recorded source service-request references", permission: "clinical_records.read") { recorded.where.not(service_request_revision_id: nil) }
        elsif model == Care::ImmunizationRevision
          metric(row, "administration_links", "Recorded administration references", permission: "clinical_records.read") { recorded.where.not(medication_administration_id: nil) }
          metric(row, "source_documents", "Recorded source-document references", permission: "clinical_records.read") { recorded.where.not(source_document_id: nil) }
          administrations = Care::MedicationAdministration.where(practice: @practice, id: recorded.select(:medication_administration_id))
          administration_movements(row, administrations)
        end
      end

      def medication_children(row, ids)
        preparations = Care::PrescriptionPreparation.where(practice: @practice, patient_id: @patients, medication_request_revision_id: ids)
        attempts = Care::PrescriptionTransmissionAttempt.where(practice: @practice, patient_id: @patients, medication_request_revision_id: ids)
        metric(row, "unused_preparations", "Preparations without a recorded submission (not a readiness claim)", permission: "clinical_records.read") { preparations.where.not(id: attempts.where.not(preparation_id: nil).select(:preparation_id)) }
        metric(row, "prescription_events", "Retained prescription review/outcome/reconciliation events", permission: "clinical_records.read") { Care::PrescriptionEvent.where(practice: @practice, patient_id: @patients, medication_request_revision_id: ids) }
        prescription_lifecycle(row, ids)
        metric(row, "preparations", "Recorded prescription preparations", permission: "clinical_records.read") { Care::PrescriptionPreparation.where(practice: @practice, patient_id: @patients, medication_request_revision_id: ids) }
        metric(row, "attempts", "Recorded simulated transmission attempts", permission: "clinical_records.read") { Care::PrescriptionTransmissionAttempt.where(practice: @practice, patient_id: @patients, medication_request_revision_id: ids) }
        metric(row, "responses", "Recorded prescription response evidence", permission: "clinical_records.read") { Care::PrescriptionResponseEvent.where(practice: @practice, patient_id: @patients, medication_request_revision_id: ids) }
        metric(row, "dispenses", "Recorded handovers/reversals/not-done evidence", permission: "clinical_records.read") { Care::MedicationDispense.where(practice: @practice, medication_request_revision_id: ids) }
        administrations = scoped(Care::MedicationAdministration).where(medication_request_revision_id: ids)
        metric(row, "administrations", "Recorded administration evidence", permission: "clinical_records.read") { administrations }
        administration_movements(row, administrations)
        metric(row, "plan_links", "Historical medication provenance links", permission: "clinical_records.read") { scoped(Care::ClinicalPlanLink).where(medication_request_revision_id: ids) }
        row[:limits] << "Recorded simulator responses are not live pharmacy transmission or delivery. Existing fulfillment remains governed by current action-specific rules."
      end

      def prescription_lifecycle(row, ids, attempt_ids: nil)
        requests = Care::PrescriptionLifecycleRequest.where(practice: @practice, patient_id: @patients, medication_request_revision_id: ids)
        requests = requests.where(transmission_attempt_id: attempt_ids) if attempt_ids
        responses = Care::PrescriptionResponseEvent.where(practice: @practice, patient_id: @patients, lifecycle_request_id: requests.select(:id))
        latest_responses = responses.where(id: responses.group(:lifecycle_request_id).select("MAX(id)"))
        unresolved = requests.where.not(id: responses.select(:lifecycle_request_id)).or(requests.where(id: latest_responses.where(outcome: %w[unknown unavailable]).select(:lifecycle_request_id)))
        metric(row, "lifecycle_history", "Recorded simulation cancellation/fill-notice requests", permission: "clinical_records.read") { requests }
        metric(row, "unresolved_lifecycle", "Simulation requests without a response or with latest unknown/unavailable outcome", permission: "clinical_records.read") { unresolved }
      end

      def administration_movements(row, administrations)
        metric(row, "inventory_links", "Recorded administration inventory-movement links", permission: "clinical_records.read") do
          Care::MedicationAdministrationMovement.where(practice: @practice, medication_administration_id: administrations.select(:id))
        end
      end

      def laboratory_children(row, ids)
        reports = scoped(Care::LabReport).where(service_request_revision_id: ids)
        metric(row, "specimens", "Recorded source-linked specimens", permission: "notes.read") { scoped(Care::LabSpecimen).where(service_request_revision_id: ids) }
        metric(row, "reports", "Recorded source-linked laboratory reports", permission: "notes.read") { reports }
        metric(row, "report_versions", "Retained laboratory report versions", permission: "notes.read") { Care::LabReportVersion.where(practice: @practice, lab_report_id: reports.select(:id)) }
        follow_ups = Care::LabResultFollowUp.where(practice: @practice, patient_id: @patients, lab_report_id: reports.select(:id))
        metric(row, "result_follow_up", "Open source-linked result follow-up", permission: "notes.read") { follow_ups.where(state: "open") }
        metric(row, "plan_links", "Historical laboratory provenance links", permission: "clinical_records.read") { scoped(Care::ClinicalPlanLink).where(service_request_revision_id: ids) }
      end

      def tasks(row, source_kind: nil, source_ids: nil, encounter_ids: nil, follow_up_ids: nil)
        work = Clinic::ClinicalTask.where(practice: @practice, patient_id: @patients).where(state: Clinic::ClinicalTask::ACTIVE_STATES)
        work = if source_kind
          orders = work.where(source_type: "order", source_kind:, source_id: source_ids)
          follow_up_ids ? orders.or(work.where(source_type: "lab_follow_up", source_id: follow_up_ids)) : orders
        else
          work.where(encounter_id: encounter_ids)
        end
        metric(row, "open_tasks", "Active source-linked tasks", permission: "encounters.write", across_sites: true) { work }
        metric(row, "unassigned_tasks", "Active source-linked tasks without an assignee", permission: "encounters.write", across_sites: true) { work.where(assigned_to_membership_id: nil) }
        active = Clinic::ClinicalTask.where(practice: @practice, patient_id: @patients).where(state: Clinic::ClinicalTask::ACTIVE_STATES)
        unfinished = Clinic::ClinicalTask.where(practice: @practice, patient_id: @patients).where("state <> ? OR resolution_code IS NULL OR resolution_code <> ?", "completed", "completed")
        edges = Clinic::ClinicalTaskDependency.where(practice: @practice, task_id: active.select(:id), prerequisite_id: unfinished.select(:id))
        linked = edges.where(task_id: work.select(:id)).or(edges.where(prerequisite_id: work.select(:id)))
        metric(row, "dependencies", "Unresolved dependency edges touching linked tasks", permission: "encounters.write", across_sites: true) { linked }
        metric(row, "prerequisites", "Unresolved prerequisites for linked task dependencies", permission: "encounters.write", across_sites: true) { unfinished.where(id: linked.select(:prerequisite_id)) }
        # Fingerprint owner/team changes too; no member identities leave this query.
        metric(row, "task_history", "Retained tasks linked to these source records", permission: "encounters.write", across_sites: true) do
          scope = Clinic::ClinicalTask.where(practice: @practice, patient_id: @patients)
          if source_kind
            orders = scope.where(source_type: "order", source_kind:, source_id: source_ids)
            follow_up_ids ? orders.or(scope.where(source_type: "lab_follow_up", source_id: follow_up_ids)) : orders
          else
            scope.where(encounter_id: encounter_ids)
          end
        end
      end

      def telehealth(row)
        row[:resolution_path] = "/clinic/schedule"
        row[:effect] = "New video bookings, video series and moves into video are gated. Existing bookings and sessions are not cancelled; their current join/end/consent rules still apply."
        appointments = scoped(Clinic::Appointment).where(visit_modality: "video")
        metric(row, "open_records", "Current/future video bookings", permission: "appointments.read") { appointments.where(status: %w[scheduled confirmed]).where("ends_at > ?", Current.business_time) }
        metric(row, "history", "All recorded video appointments", permission: "appointments.read") { appointments }
        metric(row, "series", "Recorded video recurring-series references", permission: "appointments.read") { scoped(Scheduling::AppointmentSeries).where(visit_modality: "video") }
        encounters = scoped(Clinic::Encounter).where(appointment_id: appointments.select(:id))
        metric(row, "active_encounters", "Open encounters linked to video appointments", permission: "encounters.read") { encounters.where(status: "open") }
        metric(row, "encounter_history", "Recorded encounters linked to video appointments", permission: "encounters.read") { encounters }
        visits = Telehealth::Visit.where(practice: @practice, patient_id: @patients, appointment_id: appointments.select(:id))
        metric(row, "active_sessions", "Recorded active/ending telehealth sessions", permission: "telehealth.read") { visits.where(status: %w[in_progress ending]) }
        metric(row, "session_history", "Retained telehealth session references", permission: "telehealth.read") { visits }
        telehealth_children(row, visits)
        booking_children(row, appointments, video: true)
        tasks(row, encounter_ids: encounters.select(:id))
        recurring_children(row, scoped(Scheduling::AppointmentSeries).where(visit_modality: "video"))
        metric(row, "offerings", "Published video-capable offerings at affected sites", permission: "appointments.read") do
          Clinic::ServiceOffering.where(practice: @practice, status: "published", modality: %w[video either], id: Clinic::ServiceOfferingSite.where(practice: @practice, site_id: @site_ids).select(:service_offering_id))
        end
        row[:limits] << "Video-capable offerings are not all blocked: either-modality offerings may still support in-person use."
        row[:limits] << "Schedule holds and generic waitlist entries have no video modality reference; their telehealth attribution is unknown, not zero."
      end

      def telehealth_children(row, visits)
        rooms = Telehealth::RoomAttempt.where(practice: @practice, visit_id: visits.select(:id))
        metric(row, "live_room_references", "Pending/active/unknown room attempts (including scheduled visits)", permission: "telehealth.read") { rooms.where(status: %w[pending provisioning ready active ending unknown]) }
        metric(row, "room_history", "Retained room-attempt references", permission: "telehealth.read") { rooms }
        commands = Telehealth::Command.where(practice: @practice, visit_id: visits.select(:id))
        metric(row, "pending_commands", "Pending/leased/unknown telehealth commands", permission: "telehealth.read") { commands.where(status: %w[pending leased unknown]) }
        metric(row, "command_history", "Retained telehealth command references", permission: "telehealth.read") { commands }
        { participants: Telehealth::Participant, checkins: Telehealth::Checkin, consents: Telehealth::Consent,
          join_grants: Telehealth::JoinGrant }.each do |key, model|
          metric(row, key.to_s, "Retained #{key.to_s.tr('_', ' ')} references", permission: "telehealth.read") { model.where(practice: @practice, visit_id: visits.select(:id)) }
        end
        metric(row, "provider_events", "Retained provider-event references (no provider call)", permission: "telehealth.read") { Telehealth::ProviderEvent.where(practice: @practice, room_attempt_id: rooms.select(:id)) }
        wrap_ups = Telehealth::WrapUp.where(practice: @practice, visit_id: visits.select(:id))
        metric(row, "wrap_up_history", "Retained wrap-up references", permission: "telehealth.read") { wrap_ups }
        metric(row, "unfinished_wrap_ups", "Draft wrap-ups", permission: "telehealth.read") { wrap_ups.where(status: "draft") }
        metric(row, "arranged_follow_up", "Recorded arranged follow-up appointment references", permission: "telehealth.read") { wrap_ups.where.not(follow_up_appointment_id: nil) }
        metric(row, "patient_receipts", "Retained patient-operation outcome receipts", permission: "telehealth.read") { Telehealth::PatientReceipt.where(practice: @practice, visit_id: visits.select(:id)) }
        scribe_encounters = Scribe::Encounter.where(practice: @practice, patient_id: @patients).accessible_by(@ability, :read)
        metric(row, "scribe_encounters", "Recorded authorized scribe-encounter bindings", permission: "scribe.read") { visits.where(scribe_encounter_id: scribe_encounters.select(:id)) }
        recordings = Scribe::Recording.where(practice: @practice, telehealth_visit_id: visits.select(:id), encounter_id: scribe_encounters.select(:id))
        metric(row, "scribe_capture", "Unfinished authorized telehealth-linked recording references", permission: "scribe.read") { recordings.where(status: %w[recording interrupted]) }
        metric(row, "scribe_recording_history", "Retained authorized telehealth-linked recording references", permission: "scribe.read") { recordings }
        metric(row, "scribe_source_history", "Retained authorized telehealth-linked transcript references", permission: "scribe.read") { Scribe::Source.where(practice: @practice, telehealth_visit_id: visits.select(:id), encounter_id: scribe_encounters.select(:id)) }
        row[:limits] << "Scribe counts use existing readable encounters. No audio, transcript, capture context or new participant access is returned; telehealth participation rules remain independent."
        row[:limits] << "Session evidence is counted by exact visit links. No room URL, token, consent decision, participant identity, wrap-up text or scribe content is returned."
      end

      def booking_children(row, appointments, video: false, visit_ids: nil)
        { reservation_history: Scheduling::ResourceReservation, overbook_history: Scheduling::OverbookException,
          walk_in_history: Scheduling::WalkInException }.each do |key, model|
          metric(row, key.to_s, "Recorded #{key.to_s.tr('_', ' ')} references", permission: "appointments.read") { model.where(practice: @practice, appointment_id: appointments.select(:id)) }
        end
        metric(row, "active_reservations", "Active resource reservations for linked appointments", permission: "appointments.read") { Scheduling::ResourceReservation.where(practice: @practice, appointment_id: appointments.select(:id), state: "active") }
        # Use the same effective-site expression as the operations request reader.
        requests = PatientPortal::AppointmentRequest.where(practice: @practice, patient_id: @patients).left_joins(:appointment)
          .where("COALESCE(clinic_appointments.site_id, clinic_patient_portal_appointment_requests.source_site_id, clinic_patient_portal_appointment_requests.site_id) IN (?)", @site_ids)
        linked = requests.where(source_appointment_id: appointments.select(:id)).or(requests.where(appointment_id: appointments.select(:id)))
        linked = video ? linked.or(requests.where(requested_modality: "video")) : linked.or(requests.where(visit_type_id: visit_ids))
        metric(row, "pending_requests", "Recorded pending portal booking/change requests (not approval or expiry handling)", permission: "appointments.read") { linked.where(status: "pending") }
        metric(row, "request_history", "Retained linked portal appointment requests", permission: "appointments.read") { linked }
        metric(row, "previsit_history", "Retained linked previsit responses", permission: "notes.read") { Care::PrevisitNote.where(practice: @practice, patient_id: @patients, appointment_id: appointments.select(:id)) }
        row[:limits] << "Portal requests are counted in their recorded pending state; preview does not expire, approve or move them. Resource reservations are not released."
      end

      def recurring_children(row, series)
        metric(row, "series_occurrences", "Retained recurring occurrence decisions", permission: "appointments.read") { Scheduling::AppointmentSeriesOccurrence.where(practice: @practice, series_id: series.select(:id)) }
        metric(row, "series_changes", "Retained recurring-series changes", permission: "appointments.read") { Scheduling::AppointmentSeriesChange.where(practice: @practice, series_id: series.select(:id)) }
      end

      def controlled(row)
        row[:effect] = "Controlled-test prescription simulation will no longer be configured. This does not disable all controlled-medication care or inventory, and no live prescribing authority is added."
        orders = scoped(Care::MedicationRequestRevision)
        preparations = Care::PrescriptionPreparation.where(practice: @practice, patient_id: @patients, medication_request_revision_id: orders.select(:id), mode: "controlled_test")
        attempts = Care::PrescriptionTransmissionAttempt.where(practice: @practice, patient_id: @patients, medication_request_revision_id: orders.select(:id), mode: "controlled_test")
        metric(row, "preparations", "Controlled-test preparations", permission: "clinical_records.read") { preparations }
        metric(row, "attempts", "Controlled-test simulation attempts", permission: "clinical_records.read") { attempts }
        linked_orders = orders.where(id: preparations.select(:medication_request_revision_id)).or(orders.where(id: attempts.select(:medication_request_revision_id)))
        ids = linked_orders.select(:id)
        prescription_lifecycle(row, ids, attempt_ids: attempts.select(:id))
        metric(row, "responses", "Recorded controlled-test response evidence", permission: "clinical_records.read") { Care::PrescriptionResponseEvent.where(practice: @practice, patient_id: @patients, transmission_attempt_id: attempts.select(:id)) }
        metric(row, "open_records", "Unfinished current orders with controlled-test references", permission: "clinical_records.read") { latest(orders).where(series_id: orders.where(id: ids).select(:series_id), status: %w[draft authorized on_hold]) }
        tasks(row, source_kind: "medication_request", source_ids: orders.where(series_id: orders.where(id: ids).select(:series_id)).select(:id))
        row[:limits] << "No general controlled-drug classifier is inferred from this simulator-mode toggle. Inventory and ordinary medication care are independent."
      end

      def starter_visits(row, code)
        row[:change_kind] = code == "individual_therapy" ? "gated" : "intent_only"
        row[:effect] = code == "individual_therapy" ?
          "Starting a new protected psychotherapy note is gated. Existing originator-owned note revisions remain allowed. Booking itself is not disabled by this scope code." :
          "This changes service-scope intent only. The retained preset-linked visit types, bookings, forms and recorded encounters remain; this code has no new-work gate."
        ids = VISIT_KEYS.fetch(code).filter_map { |key| @current.dig(:starter_profile, "visits", key, "visit_type_id") }.uniq
        if ids.empty?
          unknown(row, "visit_identity", "Exact linked visit identity", "This profile has no saved visit ID for the service. Names and generic clinical records cannot classify it.")
          return
        end
        appointments = scoped(Clinic::Appointment).where(visit_type_id: ids)
        encounters = scoped(Clinic::Encounter).where(appointment_id: appointments.select(:id))
        metric(row, "open_records", "Future bookings for retained preset visit IDs", permission: "appointments.read") { appointments.where(status: %w[scheduled confirmed]).where("ends_at > ?", Current.business_time) }
        metric(row, "history", "Recorded bookings for retained preset visit IDs", permission: "appointments.read") { appointments }
        metric(row, "active_encounters", "Open encounters linked to retained visit IDs", permission: "encounters.read") { encounters.where(status: "open") }
        metric(row, "encounter_history", "Recorded encounters linked to retained visit IDs", permission: "encounters.read") { encounters }
        metric(row, "waitlist", "Active waitlist entries for retained visit IDs", permission: "appointments.read") { scoped(Scheduling::WaitlistEntry).where(visit_type_id: ids).where("(state = ? AND latest_at > ?) OR (state = ? AND (offer_expires_at IS NULL OR offer_expires_at > ?))", "waiting", Current.business_time, "offered", Current.business_time) }
        metric(row, "series", "Recorded recurring series for retained visit IDs", permission: "appointments.read") { scoped(Scheduling::AppointmentSeries).where(visit_type_id: ids) }
        booking_children(row, appointments, visit_ids: ids)
        recurring_children(row, scoped(Scheduling::AppointmentSeries).where(visit_type_id: ids))
        tasks(row, encounter_ids: encounters.select(:id))
        if code == "individual_therapy"
          membership = @practice.memberships.active.find_by(user_id: @actor.id)
          if membership && @ability.role_code_allowed?("clinician") && allowed?("notes.sign")
            metric(row, "own_notes", "Your own retained protected-note revisions", permission: "notes.sign") { Care::PsychotherapyNote.where(practice: @practice, patient_id: @patients, encounter_id: encounters.select(:id), originator_membership_id: membership.id) }
          else
            unknown(row, "own_notes", "Originator-owned protected-note references", "Only an authorized originating clinician may review their own note references; no protected-note metadata is released here.")
          end
          row[:limits] << "Other originators' protected notes are outside this reader's access. No clinic-wide protected-note total or content review is claimed."
        end
        row[:limits] << "These counts use persisted preset visit IDs, not a generic specialty classifier. Unlinked visits and free-text clinical intent are not attributed."
      end

      def finish(row)
        metrics = row.fetch(:metrics)
        bad = metrics.select { |item| item[:required] && item[:status] != "available" && item[:status] != "not_applicable" }
        row[:status] = if bad.empty?
          row[:limits].any? ? "partial" : "available"
        elsif bad.any? { |item| item[:status] == "unavailable" }
          "unavailable"
        elsif bad.any? { |item| item[:status] == "restricted" }
          "restricted"
        else
          "not_mapped"
        end
        %w[open_records open_tasks unassigned_tasks].each { |key| row[key.to_sym] = metrics.find { |item| item[:key] == key }&.fetch(:count) }
        row[:review_complete] = bad.empty?
        row[:source_digest] = Digest::SHA256.hexdigest(row.delete(:source_digests).to_json)
        row[:resolution_path] = nil unless metrics.any? { |item| item[:status] == "available" }
        row
      end
    end
  end
end
