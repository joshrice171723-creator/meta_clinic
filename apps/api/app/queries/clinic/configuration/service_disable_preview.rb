require "digest"

module Clinic
  module Configuration
    # Read-only consequences for the existing clinic-managed service-scope operation.
    # Never grants chart access, moves work, or changes domain records.
    class ServiceDisablePreview
      class Stale < StandardError; end
      SOURCES = {
        "telehealth" => { permission: "appointments.read", model: Clinic::Appointment,
          filter: { visit_modality: "video", status: %w[scheduled confirmed] },
          effect: "New video bookings will be unavailable. Existing appointments are not cancelled.",
          destination: "Review existing video visits in Schedule.", path: "/clinic/schedule" },
        "external_lab_coordination" => { permission: "clinical_records.read", model: Clinic::Care::ServiceRequestRevision,
          filter: { request_kind: "lab" }, open: %w[draft active on_hold], source_kind: "service_request",
          effect: "New laboratory requests will be unavailable. Existing orders and follow-up keep their recorded state and owners.",
          destination: "Review existing laboratory work in Patient Flow.", path: "/clinic" },
        "prescription_preparation" => { permission: "clinical_records.read", model: Clinic::Care::MedicationRequestRevision,
          filter: {}, open: %w[draft authorized on_hold], source_kind: "medication_request",
          effect: "New medication requests will be unavailable. Existing prescription and fulfillment work stays owned.",
          destination: "Review existing medication work in Patient Flow.", path: "/clinic" },
        "take_home_fulfillment" => { permission: "clinical_records.read", model: Clinic::Care::MedicationRequestRevision,
          filter: { fulfillment_route: "take_home" }, open: %w[draft authorized on_hold], source_kind: "medication_request",
          effect: "New take-home medication requests will be unavailable. Existing handovers and remaining quantities are not changed.",
          destination: "Review existing take-home work in Patient Flow.", path: "/clinic" },
        "minor_office_procedures" => { permission: "clinical_records.read", model: Clinic::Care::ProcedureRevision,
          filter: {}, open: %w[planned in_progress],
          effect: "New procedure records will be unavailable. Existing procedure history is retained.",
          destination: "Review existing procedure work in Patient Flow.", path: "/clinic" },
        "vaccinations" => { permission: "clinical_records.read", model: Clinic::Care::ImmunizationRevision,
          filter: {}, open: %w[planned],
          effect: "New immunization records will be unavailable. Existing immunization history is retained.",
          destination: "Review existing immunization work in Patient Flow.", path: "/clinic" }
      }.freeze

      def self.call(practice:, actor:, site:, service_scope:, expected_revision:)
        Clinic::Authorization.authorize!(practice:, actor:, action: "facilities.write", site:)
        current = PracticeFeatures.snapshot(practice:, site:)
        unless current.fetch(:revision) == expected_revision.to_i
          raise ActiveRecord::StaleObjectError.new(practice, "preview practice features")
        end
        requested = Array(service_scope).map { |code| code.to_s.strip }.uniq
        raise ArgumentError, "service_scope includes unsupported services" if (requested - PracticeFeatures::SERVICE_SCOPE).any?
        if current[:finalized] && (requested - current[:selected_services]).any?
          raise ArgumentError, "Protected profile change: request Meta Clinic review."
        end
        disabled = current[:finalized] ? current[:service_scope] - requested : []
        ability = Ability.new(actor, practice:)
        site_ids = if site
          [ site.id ]
        else
          overrides = Clinic::PracticeFeatureVersion.where(practice:).where.not(site_id: nil)
            .where(effective_from: ..Current.business_time).select(:site_id)
          practice.sites.where.not(id: overrides).pluck(:id)
        end
        rows = disabled.map do |service|
          source = SOURCES[service]
          row = { service:, status: "not_mapped", open_records: nil, open_tasks: nil, unassigned_tasks: nil,
            effect: "This removes the service from the intended scope. Its workflow consequences are not mapped; ask the owning team to review existing work.",
            resolution: "Review with the existing service owner before changing scope.", resolution_path: nil }
          next row unless source

          row.merge!(effect: source.fetch(:effect), resolution: source.fetch(:destination))
          allowed = ability.allowed_permission?("patients.read") &&
            (site ? ability.allowed_permission?(source.fetch(:permission), site:) : ability.practice_scope_for?(source.fetch(:permission)))
          unless allowed
            row[:status] = "restricted"
            row[:resolution] = "An authorized domain reader must review existing work; configuration permission does not grant patient access."
            next row
          end

          patients = practice.patients.accessible_by(ability, :read).select(:id)
          all = source.fetch(:model).where(practice:, site_id: site_ids, patient_id: patients)
          if source[:open]
            # Select current revisions BEFORE filtering route/kind/status, so a
            # completed or rerouted newer version cannot resurrect an older draft.
            latest_ids = all.where.not(id: all.where.not(prior_revision_id: nil).select(:prior_revision_id)).select(:id)
            records = all.where(id: latest_ids).where(source.fetch(:filter))
            work = records.where(status: source.fetch(:open))
          else
            records = all.where(source.fetch(:filter)).where("ends_at > ?", Current.business_time)
            work = records
          end
          row.merge!(status: "available", open_records: work.count, resolution_path: source.fetch(:path))
          # Only a fingerprint leaves this query; identifiers/patient values never do.
          fingerprints = records.order(:id).pluck(:id, :updated_at)
          tasks_allowed = site ? ability.allowed_permission?("encounters.write", site:) : ability.practice_scope_for?("encounters.write")
          if source[:source_kind] && tasks_allowed
            series = records.select(:series_id)
            source_ids = all.where(series_id: series).select(:id)
            tasks = Clinic::ClinicalTask.where(practice:, site_id: site_ids, patient_id: patients,
              state: Clinic::ClinicalTask::ACTIVE_STATES, source_type: "order",
              source_kind: source.fetch(:source_kind), source_id: source_ids)
            row[:open_tasks] = tasks.count
            row[:unassigned_tasks] = tasks.where(assigned_to_membership_id: nil).count
            fingerprints += tasks.order(:id).pluck(:id, :updated_at)
          end
          row[:source_digest] = Digest::SHA256.hexdigest(fingerprints.to_json)
          row
        end
        identity = { site_id: site&.id, revision: current.fetch(:revision),
          requested_services: PracticeFeatures::SERVICE_SCOPE & requested, effective_site_ids: site_ids.sort, services: rows }
        { site_id: site&.id, revision: current.fetch(:revision), generated_at: Current.business_time.iso8601(6),
          services: rows.map { |row| row.except(:source_digest) },
          impact_digest: Digest::SHA256.hexdigest(identity.to_json),
          preservation: "This change does not cancel appointments, complete tasks, erase history or reassign work. Existing permissions and action-specific rules still apply; unrelated services remain available." }
      end
    end
  end
end
