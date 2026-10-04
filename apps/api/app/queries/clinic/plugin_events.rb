module Clinic
  # This feed contains persisted change metadata only. It is not a clinical
  # snapshot, a new audit sink, or a guarantee that callback-bypassing writes exist.
  class PluginEvents
    LIMIT = 25
    MAX_ACKNOWLEDGED = 256
    MAX_AGE = 24.hours
    DEFINITIONS = {
      "clinic.appointment.changed" => { model: Clinic::Appointment, permission: "appointments.read" },
      "clinic.appointment.reminder_due" => { model: Clinic::Appointment, permission: "appointments.read" },
      "clinic.result.changed" => { model: Clinic::Care::LabReport, permission: "notes.read" },
      "clinic.task.changed" => { model: Clinic::ClinicalTask, permission: "encounters.write" }
    }.freeze

    class Unavailable < StandardError
      attr_reader :code
      def initialize(code)
        @code = code
        super("This event feed must be subscribed again.")
      end
    end

    def self.available_names(ability)
      return [] unless ability.allowed_permission?("patients.read")

      DEFINITIONS.filter_map do |name, definition|
        name if ability.allowed_permission?(definition[:permission], any_site: true) &&
          (name != "clinic.appointment.reminder_due" || ability.allowed_permission?("reminders.read"))
      end
    end

    def initialize(practice:, actor:, name:, resource_id:)
      @practice = practice
      @actor = actor
      @name = name
      definition = DEFINITIONS.fetch(name) { raise ArgumentError, "Choose an available event." }
      @resource = definition[:model].where(practice_id: practice.id).find(resource_id)
      Clinic::Authorization.authorize!(actor:, practice:, action: "patients.read", subject: @resource.patient)
      Clinic::Authorization.authorize!(actor:, practice:, action: definition[:permission], site: @resource.site)
      if @resource.is_a?(Clinic::Appointment)
        Clinic::Authorization.authorize!(actor:, practice:, action: "appointments.read", subject: @resource)
      end
      Clinic::Authorization.authorize!(actor:, practice:, action: "reminders.read") if reminder_due?
    end

    def call(cursor: nil, pending_event_id: nil)
      if pending_event_id.present? && (!reminder_due? || !pending_event_id.is_a?(String) ||
          !pending_event_id.match?(/\Aclinic-reminder-\d+-\d+-\d+\z/))
        raise ArgumentError, "Pending event is invalid."
      end
      state = cursor.present? ? decode(cursor) : {
        "identity" => identity, "started_at" => Time.current.iso8601(6), "acknowledged" => []
      }
      state["due_started_at"] = Current.business_time.iso8601(6) if reminder_due? && cursor.blank?
      # Bootstrap deliberately starts with future changes to an existing record.
      return { events: [], cursor: encode(state), has_more: false } if cursor.blank?

      raise Unavailable, "feed_limit" if state["acknowledged"].length >= MAX_ACKNOWLEDGED
      return due_reminders(state, pending_event_id:) if reminder_due?

      rows = versions.where("occurred_at >= ?", Time.iso8601(state.fetch("started_at")))
        .where.not(id: state.fetch("acknowledged"))
        .order(:id).limit([ LIMIT + 1, MAX_ACKNOWLEDGED - state["acknowledged"].length ].min)
        .pluck(:id, :event, :occurred_at)
      events = rows.first(LIMIT).map do |id, change, occurred_at|
        state["acknowledged"] << id
        {
          eventId: "clinic-version-#{@practice.id}-#{id}", name: @name,
          timestamp: occurred_at.iso8601(6), cursor: nil,
          data: { resource_id: @resource.id.to_s, change: change },
          feed_cursor: encode(state)
        }
      end
      { events: events, cursor: encode(state), has_more: rows.length > LIMIT }
    end

    private

    def reminder_due? = @name == "clinic.appointment.reminder_due"

    def due_reminders(state, pending_event_id:)
      at = Current.business_time
      return { events: [], cursor: encode(state), has_more: false, pending_event_eligible: false } unless
        %w[scheduled confirmed].include?(@resource.status) && @resource.starts_at > at

      # The existing reminder schedule and policy are authoritative. Reading a
      # due occurrence never claims an outbox or dispatches a patient message.
      candidates = Clinic::PatientReminder.where(practice_id: @practice.id,
        patient_id: @resource.patient_id, source_type: "Clinic::Appointment", source_id: @resource.id,
        category: "appointment", status: %w[scheduled queued])
        .where(cancelled_at: nil).where(scheduled_at: Time.iso8601(state.fetch("due_started_at"))..at)
        .where("expires_at IS NULL OR expires_at > ?", at)
        .joins(:outbox).where(clinic_patient_reminder_outbox: { practice_id: @practice.id, dispatch_state: "pending" })
        .where("clinic_patient_reminder_outbox.available_at <= ?", at)
        .includes(:communication_endpoint, patient: :communication_preference)
        .order(:scheduled_at, :id).limit(MAX_ACKNOWLEDGED + 1)
      # Fail closed if the bounded window cannot enumerate every candidate.
      records = candidates.to_a
      raise Unavailable, "feed_limit" if records.length > MAX_ACKNOWLEDGED

      eligible = records.filter_map do |reminder|
        event_id = "clinic-reminder-#{@practice.id}-#{reminder.id}-#{(reminder.scheduled_at.to_r * 1_000_000).to_i}"
        next if state["acknowledged"].include?(event_id)
        next unless Clinic::Reminders::Policy.evaluate(reminder:, at:)[:allowed]

        [ reminder, event_id ]
      end
      capacity = MAX_ACKNOWLEDGED - state["acknowledged"].length
      pending_event_eligible = pending_event_id.present? && eligible.any? { |_, event_id| event_id == pending_event_id }
      events = eligible.first([ LIMIT, capacity ].min).map do |reminder, event_id|
        state["acknowledged"] << event_id
        { eventId: event_id, name: @name, timestamp: reminder.scheduled_at.iso8601(6), cursor: nil,
          data: { resource_id: @resource.id.to_s, change: "due" }, feed_cursor: encode(state) }
      end
      { events:, cursor: encode(state), has_more: eligible.length > events.length, pending_event_eligible: }
    end

    def versions
      scope = Clinic::ModelVersion.for_practice(@practice)
      own = scope.where(item_type: @resource.class.base_class.name, item_id: @resource.id)
      return own unless @resource.is_a?(Clinic::Care::LabReport)

      children = Clinic::Care::LabReportVersion.where(practice_id: @practice.id, lab_report_id: @resource.id)
      own.or(scope.where(item_type: "Clinic::Care::LabReportVersion", item_id: children.select(:id)))
    end

    def identity = [ @actor.id, @practice.id, @name, @resource.id ]

    def verifier = Rails.application.message_verifier("clinic-plugin-events-v1")

    def encode(state)
      verifier.generate(state, purpose: "clinic-plugin-events", expires_at: Time.iso8601(state.fetch("started_at")) + MAX_AGE)
    end

    def decode(cursor)
      raise ArgumentError, "Event cursor is invalid." unless cursor.is_a?(String) && cursor.bytesize <= 100_000

      state = verifier.verified(cursor, purpose: "clinic-plugin-events")
      raise Unavailable, "feed_expired" unless state
      unless state.is_a?(Hash) && state["identity"] == identity && state["started_at"].is_a?(String) &&
          (!reminder_due? || state["due_started_at"].is_a?(String)) &&
          state["acknowledged"].is_a?(Array) && state["acknowledged"].length <= MAX_ACKNOWLEDGED &&
          state["acknowledged"].all? { |id| reminder_due? ? id.is_a?(String) && id.match?(/\Aclinic-reminder-\d+-\d+-\d+\z/) : id.is_a?(Integer) && id.positive? }
        raise ArgumentError, "Event cursor does not match this account and resource."
      end
      state
    end
  end
end
