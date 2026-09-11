class WorkflowPropertyCase
  def portal_contract(input)
    patient = @practice.patients.create!(display_name: "Portal Property Patient", reference: "PORTAL-PROP")
    site = @practice.sites.create!(code: "PORTAL", name: "Portal property site")
    identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: patient, user: @actor,
      status: "active", invited_at: 2.days.ago, activated_at: 1.day.ago)
    appointment = @practice.appointments.create!(patient: patient, site: site, starts_at: 2.days.from_now,
      ends_at: 2.days.from_now + 30.minutes, status: "scheduled")
    operation = input.fetch("operation")
    if operation == "request_model"
      record = if input["kind"] == "message"
        Clinic::PatientPortal::Request.new(practice: @practice, patient: patient, identity: identity, request_type: "message",
          status: "pending", origin: "patient", request_key: SecureRandom.uuid, content: "Property request",
          content_digest: "e" * 64, requested_at: Time.current)
      else
        Clinic::PatientPortal::AppointmentRequest.new(practice: @practice, patient: patient, identity: identity,
          request_kind: "new_booking", status: "pending", request_key: SecureRandom.uuid, requested_at: Time.current,
          starts_at: 3.days.from_now, ends_at: 3.days.from_now + 30.minutes)
      end
      raise "Invalid portal baseline: #{record.errors.full_messages.join(', ')}" unless record.valid?
      input.fetch("attributes").each { |field, value| record.public_send("#{field}=", value) }
      return { valid: record.valid?, errors: record.errors.attribute_names.map(&:to_s) }
    end
    if operation == "previsit_retry"
      params = { practice: @practice, patient: patient, appointment: appointment, actor: @actor, identity: identity,
        omni_preview: false, text: input.fetch("text"), expected_version: 0, request_key: SecureRandom.uuid }
      first = Clinic::PatientPortal::PrevisitNotes.submit(**params)
      replay = Clinic::PatientPortal::PrevisitNotes.submit(**params)
      conflict = false
      begin
        Clinic::PatientPortal::PrevisitNotes.submit(**params.merge(text: input.fetch("text") + " changed"))
      rescue Clinic::PatientPortal::PrevisitNotes::Conflict
        conflict = true
      end
      return { same: first.note.id == replay.note.id, replayed: replay.replayed, conflict: conflict, count: appointment.previsit_notes.count }
    end
    if operation == "confirm_stale"
      version = Clinic::PatientPortal::AppointmentConfirmation.material_version(appointment)
      appointment.update!(starts_at: appointment.starts_at + input.fetch("minutes").minutes, ends_at: appointment.ends_at + input.fetch("minutes").minutes)
      rejected = false
      begin
        Clinic::PatientPortal::AppointmentConfirmation.confirm(practice: @practice, patient: patient, appointment: appointment,
          actor: @actor, identity: identity, omni_preview: false, version: version)
      rescue Clinic::PatientPortal::AppointmentConfirmation::ReloadRequired
        rejected = true
      end
      return { rejected: rejected, status: appointment.reload.status }
    end
    if operation == "reschedule_invalid"
      before = appointment.starts_at
      rejected = false
      begin
        Clinic::Scheduling::RescheduleAppointment.call(appointment: appointment, actor: @actor, starts_at: before,
          ends_at: before - input.fetch("minutes").minutes, expected_updated_at: appointment.updated_at, request_key: SecureRandom.uuid)
      rescue ArgumentError
        rejected = true
      end
      return { rejected: rejected, unchanged: appointment.reload.starts_at == before }
    end
    if operation == "terminal_appointment"
      appointment.update!(status: input.fetch("terminal"))
      rejected = false
      begin
        Clinic::Scheduling::TransitionAppointment.call(appointment: appointment, actor: @actor, to: "confirmed")
      rescue ArgumentError
        rejected = true
      end
      return { rejected: rejected, status: appointment.reload.status }
    end
    review = Clinic::PatientPortal::AppointmentRequest.create!(practice: @practice, patient: patient, identity: identity,
      request_kind: "new_booking", status: "pending", request_key: SecureRandom.uuid, requested_at: Time.current,
      starts_at: 3.days.from_now, ends_at: 3.days.from_now + 30.minutes)
    if operation == "approve_missing"
      params = { practice: @practice, actor: @actor, request: review, request_key: SecureRandom.uuid,
        starts_at: review.starts_at, ends_at: review.ends_at, site: site }
      params[input.fetch("field").to_sym] = nil
      count = @practice.appointments.count
      rejected = false
      begin
        Clinic::PatientPortal::ReviewAppointmentRequest.approve(**params)
      rescue ArgumentError
        rejected = true
      end
      return { rejected: rejected, status: review.reload.status, created: @practice.appointments.count - count }
    end
    if operation == "decline_retry"
      params = { practice: @practice, actor: @actor, request: review, request_key: SecureRandom.uuid, reason: input.fetch("reason") }
      first = Clinic::PatientPortal::ReviewAppointmentRequest.decline(**params)
      replay = Clinic::PatientPortal::ReviewAppointmentRequest.decline(**params)
      return { same: first.request.id == replay.request.id, replayed: replay.replayed, status: review.reload.status, appointment: review.appointment_id }
    end
    raise "Unknown portal property operation #{operation}"
  end
end
