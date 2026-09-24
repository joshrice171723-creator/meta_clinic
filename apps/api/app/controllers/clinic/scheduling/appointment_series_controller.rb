module Clinic
  module Scheduling
    class AppointmentSeriesController < Clinic::ApiController
      def preview
        arguments = series_arguments
        rows = BookSeries.preview(**arguments.except(:reason, :request_key))
        render json: { occurrences: rows.map { |row| serialize_row(row) } }
      end

      def create
        arguments = series_arguments
        series = BookSeries.call(**arguments)
        render json: { series: serialize_series(series), request_key: arguments[:request_key] }, status: :created
      end

      def show
        series = AppointmentSeries.where(practice: current_practice).find(requested_id!(params[:id], :id))
        require_capability_with_legacy("appointments.read", "patients.read", site: series.site)
        render json: { series: serialize_series(series) }
      end

      def preview_change
        series = selected_series
        input = parameter_hash!(:change, %i[from_sequence local_time room_id])
        rows = ManageSeries.preview_change(series: series, actor: current_user,
          from_sequence: bounded_integer!(input[:from_sequence], field: :from_sequence, min: 1, max: 12),
          local_time: required_string!(input[:local_time], field: :local_time, maximum: 5),
          room: find_optional(current_practice.rooms, input[:room_id], :room_id))
        render json: { occurrences: rows.map { |row| serialize_change_row(row) } }
      end

      def change_future
        series = selected_series
        input = parameter_hash!(:change, %i[from_sequence local_time room_id reason request_key],
          nested_arrays: { expected_versions: %i[appointment_id updated_at] })
        updated = ManageSeries.change_future(series: series, actor: current_user,
          from_sequence: bounded_integer!(input[:from_sequence], field: :from_sequence, min: 1, max: 12),
          local_time: required_string!(input[:local_time], field: :local_time, maximum: 5),
          room: find_optional(current_practice.rooms, input[:room_id], :room_id),
          reason: required_string!(input[:reason], field: :reason, maximum: 500),
          expected_versions: Array(input[:expected_versions]).map { |row| row.to_h.symbolize_keys },
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 120))
        render json: { series: serialize_series(updated) }
      end

      def cancel_future
        series = selected_series
        input = parameter_hash!(:cancel, %i[from_sequence reason request_key cancellation_message_acknowledged],
          nested_arrays: { expected_versions: %i[appointment_id updated_at] })
        updated = ManageSeries.cancel_future(series: series, actor: current_user,
          from_sequence: bounded_integer!(input[:from_sequence], field: :from_sequence, min: 1, max: 12),
          expected_versions: Array(input[:expected_versions]).map { |row| row.to_h.symbolize_keys },
          reason: required_string!(input[:reason], field: :reason, maximum: 500),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 120),
          cancellation_message_acknowledged: boolean_param(input[:cancellation_message_acknowledged],
            field: :cancellation_message_acknowledged))
        render json: { series: serialize_series(updated) }
      end

      private

      def series_arguments
        input = parameter_hash!(:series,
          %i[patient_id site_id room_id booked_clinician_id visit_type_id service_offering_id starts_at ends_at
            visit_modality interval_weeks occurrence_count expected_policy_revision reason request_key],
          nested_arrays: { resolutions: %i[sequence starts_at ends_at room_id skip_reason change_reason] })
        { practice: current_practice, actor: current_user,
          patient: current_practice.patients.find(requested_id!(input[:patient_id], :patient_id)),
          site: current_practice.sites.find(requested_id!(input[:site_id], :site_id)),
          room: find_optional(current_practice.rooms, input[:room_id], :room_id),
          clinician: current_practice.clinician_profiles.find(requested_id!(input[:booked_clinician_id], :booked_clinician_id)),
          visit_type: current_practice.visit_types.find(requested_id!(input[:visit_type_id], :visit_type_id)),
          service_offering: find_optional(current_practice.service_offerings, input[:service_offering_id], :service_offering_id),
          starts_at: time_param!(input[:starts_at], field: :starts_at),
          ends_at: time_param!(input[:ends_at], field: :ends_at),
          visit_modality: enum_param!(input[:visit_modality].presence || "in_person", field: :visit_modality,
            allowed: %w[in_person video]),
          interval_weeks: bounded_integer!(input[:interval_weeks], field: :interval_weeks, min: 1, max: 4),
          occurrence_count: bounded_integer!(input[:occurrence_count], field: :occurrence_count, min: 2, max: 12),
          expected_policy_revision: bounded_integer!(input[:expected_policy_revision], field: :expected_policy_revision),
          resolutions: Array(input[:resolutions]).map { |row| row.to_h.symbolize_keys },
          reason: optional_string(input[:reason], field: :reason, maximum: 500),
          request_key: input[:request_key].present? ? required_string!(input[:request_key], field: :request_key, maximum: 160) : nil }
      end

      def find_optional(scope, value, field)
        value.present? ? scope.find(requested_id!(value, field)) : nil
      end

      def selected_series
        AppointmentSeries.where(practice: current_practice).find(requested_id!(params[:id], :id))
      end

      def serialize_row(row)
        { sequence: row[:sequence], original_date: row[:original_date].iso8601,
          state: row[:state], skip_reason: row[:skip_reason], room_id: row[:room]&.id,
          starts_at: row[:starts_at]&.iso8601(6), ends_at: row[:ends_at]&.iso8601(6),
          appointment_id: row[:appointment_id], expected_updated_at: row[:expected_updated_at]&.iso8601(6),
          conflict: row[:conflict] }
      end

      def serialize_change_row(row)
        { sequence: row[:sequence], appointment_id: row[:appointment_id],
          starts_at: row[:starts_at]&.iso8601(6), ends_at: row[:ends_at]&.iso8601(6),
          room_id: row[:room_id], expected_updated_at: row[:expected_updated_at]&.iso8601(6),
          conflict: row[:conflict] }
      end

      def serialize_series(series)
        { id: series.id, site_id: series.site_id, patient_id: series.patient_id,
          interval_weeks: series.interval_weeks, occurrence_count: series.occurrence_count,
          timezone: series.timezone, starts_on: series.starts_on.iso8601,
          policy_revision: series.policy_revision,
          changes: series.series_changes.order(:id).map do |change|
            { action: change.action, from_sequence: change.from_sequence, reason: change.reason,
              written_by_membership_id: change.written_by_membership_id,
              created_at: change.created_at.iso8601(6), before_visits: change.before_visits,
              after_visits: change.after_visits }
          end,
          occurrences: series.occurrences.order(:sequence).map do |row|
            { sequence: row.sequence, original_date: row.original_date.iso8601, state: row.state,
              skip_reason: row.skip_reason, change_reason: row.change_reason,
              appointment_id: row.appointment_id,
              starts_at: row.appointment&.starts_at&.iso8601(6),
              ends_at: row.appointment&.ends_at&.iso8601(6),
              room_id: row.appointment&.room_id,
              updated_at: row.appointment&.updated_at&.iso8601(6),
              appointment_status: row.appointment&.status }
          end }
      end
    end
  end
end
