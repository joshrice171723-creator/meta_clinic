class WorkflowPropertyCase
  def ui_context_contract(input)
    operation = input.fetch("operation")
    if operation.start_with?("provider")
      patient = @practice.patients.create!(display_name: "Provider property patient", reference: "PROVIDER-PROP")
      site = @practice.sites.create!(name: "Provider site", code: "PROVIDER")
      encounter = @practice.encounters.create!(patient: patient, site: site, started_at: 1.hour.ago, status: "open")
      profile = Clinic::ClinicianProfile.create!(practice: @practice, membership: @membership, display_name: "Property provider")
      assigned_site = operation == "provider_wrong_site" ? @practice.sites.create!(name: "Other site", code: "OTHER-PROVIDER") : site
      department = Clinic::Department.create!(practice: @practice, code: "Provider property department")
      profile.assignments.create!(practice: @practice, department: department, site: assigned_site, effective_from: Current.business_time - 1.day)
      if operation == "provider_completed"
        encounter.update!(status: "completed", ended_at: Time.current)
      end
      rejected = false
      error_class = error_message = nil
      begin
        Clinic::Scheduling::AssignProvider.call(encounter: encounter, actor: @actor, clinician_profile: profile,
          request_key: SecureRandom.uuid, expected_token: operation == "provider_stale" ? input.fetch("token") : nil)
      rescue ArgumentError, ActiveRecord::StaleObjectError => error
        rejected = true
        error_class = error.class.name
        error_message = error.message
      end
      return { rejected: rejected, error_class: error_class, error_message: error_message, participants: encounter.participants.count }
    end
    conversation = Clinic::StaffConversation.create!(practice: @practice, created_by_membership: @membership,
      kind: "team", status: "active", retention_class: "routine")
    conversation.members.create!(practice: @practice, membership: @membership, membership_state: "active", notification_policy: "all")
    message = Clinic::StaffMessage.create!(practice: @practice, conversation: conversation, sender_membership: @membership,
      body: "Property attachment message", message_class: "routine", status: "active", request_key: SecureRandom.uuid,
      acknowledgement_required: false)
    receipt = message.receipts.create!(practice: @practice, recipient_membership: @membership)
    if operation == "ack_unrequired"
      rejected = false
      begin
        Clinic::Messaging::AcknowledgeStaffMessage.call(practice: @practice, actor: @actor, message: message, note: input.fetch("note"))
      rescue ArgumentError
        rejected = true
      end
      return { rejected: rejected, acknowledged: receipt.reload.acknowledged_at.present?, message_acknowledged: message.reload.acknowledged_at.present? }
    elsif operation == "read_not_ack"
      sender = User.create!(email_address: "sender-#{SecureRandom.hex(8)}@example.invalid", password: SecureRandom.hex(18))
      sender_membership = Clinic::Membership.create!(practice: @practice, user: sender)
      message.update!(sender_membership: sender_membership, acknowledgement_required: true)
      Clinic::Messaging::MarkStaffMessageRead.call(practice: @practice, actor: @actor, conversation: conversation)
      return { read: receipt.reload.read_at.present?, acknowledged: receipt.acknowledged_at.present?, message_acknowledged: message.reload.acknowledged_at.present? }
    end
    params = { practice: @practice, actor: @actor, message: message, request_key: SecureRandom.uuid,
      filename: "property.txt", content_type: "text/plain", byte_size: 10, checksum: "cHJvcGVydHk=" }
    input.fetch("attributes", {}).each { |field, value| params[field.to_sym] = value }
    before = message.attachments.count
    rejected = false
    begin
      attachment = Clinic::Messaging::PresignStaffAttachment.call(**params)
    rescue ArgumentError
      rejected = true
    end
    { rejected: rejected, created: message.attachments.count - before, state: attachment&.scan_state }
  end
end
