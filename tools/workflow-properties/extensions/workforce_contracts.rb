# Real model contracts only; no delivery, payroll provider or browser execution.
class WorkflowPropertyCase
  def workforce_contract(input)
    site = @practice.sites.create!(code: "WF-PROP", name: "Property site")
    staff = @practice.staff_members.create!(display_name: "Property Employee", job_title: "Coordinator")
    employment = Clinic::Workforce::Employment.create!(practice: @practice, membership: @membership, staff_member: staff, effective_from: 1.day.ago, status: "active")
    common = { practice: @practice, site: site, employment: employment, requested_by: @membership,
      starts_at: 1.day.from_now, ends_at: 2.days.from_now, timezone: "America/Chicago", submitted_at: Time.current,
      status: "submitted", reason: "Property request", revision: 1, idempotency_key: SecureRandom.uuid, request_digest: "a" * 64 }
    kind = input.fetch("kind")
    record = case kind
    when "time_off"
      Clinic::Workforce::TimeOffRequest.new(**common)
    when "availability"
      Clinic::Workforce::AvailabilityVersion.new(**common.except(:requested_by, :starts_at, :ends_at), created_by: @membership,
        effective_from: Date.current, weekly_rules: [{ "day_of_week" => 1, "start_time" => "09:00", "end_time" => "17:00" }])
    when "template"
      Clinic::Workforce::ScheduleTemplate.new(practice: @practice, site: site, created_by: @membership,
        name: "Property template", timezone: "America/Chicago", revision: 1, shift_definitions: [], active: true)
    when "payroll_configuration"
      Clinic::Workforce::PayrollConfigurationVersion.new(practice: @practice, site: site, created_by_membership: @membership,
        name: "Property export", provider: "custom_file", effective_from: Time.current, revision: 1)
    when "badge"
      Clinic::Workforce::BadgeCredential.new(practice: @practice, employment: employment, issued_by_membership: @membership,
        secret_digest: "b" * 64, format: "code128", status: "issued")
    when "timecard"
      Clinic::Workforce::TimecardVersion.new(practice: @practice, employment: employment, period_start: Date.current,
        period_end: Date.current + 14, source_digest: "c" * 64, version_number: 1, status: "draft")
    when "reminder"
      patient = @practice.patients.create!(display_name: "Property Patient", reference: "WF-PAT")
      endpoint = Clinic::CommunicationEndpoint.create!(practice: @practice, patient: patient, endpoint_type: "phone",
        value: "+15555550100", value_digest: "d" * 64, label: "Property phone")
      Clinic::PatientReminder.new(practice: @practice, patient: patient, communication_endpoint: endpoint, source_type: "appointment",
        source_id: patient.id, category: "appointment", channel: "sms", content: "Property reminder", safe_preview: "Appointment reminder",
        scheduled_at: 1.day.from_now, timezone: "America/Chicago", local_schedule_label: "Tomorrow", status: "draft", dedupe_key: SecureRandom.uuid, lock_version: 0)
    when "message", "staff_request"
      conversation = Clinic::StaffConversation.create!(practice: @practice, created_by_membership: @membership,
        kind: "team", status: "active", retention_class: "routine")
      message = Clinic::StaffMessage.new(practice: @practice, conversation: conversation, sender_membership: @membership,
        body: "Property message", message_class: "routine", status: "active", request_key: SecureRandom.uuid)
      if kind == "staff_request"
        message.save!
        Clinic::StaffMessageRequest.new(practice: @practice, message: message, state: "open", due_at: 1.day.from_now)
      else
        message
      end
    end
    raise "Invalid #{kind} baseline: #{record.errors.full_messages.join(', ')}" unless record.valid?
    if input["operation"] == "terminal_transition"
      field = kind == "reminder" ? :status : :state
      record.public_send("#{field}=", input.fetch("terminal"))
      record.save!
      rejected = false
      begin
        record.transition_to!(input.fetch("target"))
      rescue ArgumentError
        rejected = true
      end
      return { rejected: rejected, state: record.reload.public_send(field) }
    elsif input["operation"] == "final_timecard"
      record.assign_attributes(status: "approved", submitted_at: Time.current, submitted_by_membership: @membership,
        approved_at: Time.current, approved_by_membership: @membership)
      record.save!
      old_digest = record.source_digest
      updated = record.update(source_digest: input.fetch("digest"))
      destroyed = record.reload.destroy
      return { updated: updated, destroyed: !!destroyed, exists: record.class.exists?(record.id), digest: record.reload.source_digest, old_digest: old_digest }
    end
    attributes = input.fetch("attributes", {})
    attributes = { "ends_at" => record.starts_at - input.fetch("minutes").minutes } if input["operation"] == "reverse_interval"
    attributes.each { |field, value| record.public_send("#{field}=", value) }
    { valid: record.valid?, errors: record.errors.attribute_names.map(&:to_s) }
  end
end
