module Clinic
  class ServiceInquiriesController < Clinic::ApiController
    before_action -> { require_capability("subscriptions.review") }

    def index
      inquiries = current_practice.service_inquiries.includes(:service_offering)
      today = Current.business_time.in_time_zone(current_practice.timezone).to_date
      if params[:follow_up] == "due"
        inquiries = inquiries.where.not(status: "closed").where(follow_up_on: ..today)
          .order(:follow_up_on, :id)
      else
        inquiries = inquiries.order(created_at: :desc, id: :desc)
      end
      records = inquiries.limit(100).to_a
      Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
        action_code: "service_inquiries.index", outcome: :released)
      render json: {
        inquiries: records.map { |inquiry|
          payload(inquiry)
        },
        capped: inquiries.count > records.size,
        clinic_date: today.iso8601
      }
    end

    def update
      inquiry = current_practice.service_inquiries.find(requested_id!(params[:id], :id))
      input = parameter_hash!(:inquiry, %i[status lock_version follow_up_on follow_up_note])
      status = input.key?(:status) ? enum_param!(input[:status], field: :status, allowed: %w[new contacted closed]) : inquiry.status
      changes = { status: }
      if input.key?(:follow_up_on)
        changes[:follow_up_on] = input[:follow_up_on].present? ? date_param!(input[:follow_up_on], field: :follow_up_on) : nil
      end
      if input.key?(:follow_up_note)
        changes[:follow_up_note] = optional_string(input[:follow_up_note], field: :follow_up_note, maximum: 2000)
      end
      changes[:follow_up_on] = nil if status == "closed"
      version = bounded_integer!(input[:lock_version], field: :lock_version)
      inquiry.with_lock do
        require_capability("subscriptions.review")
        raise ActiveRecord::StaleObjectError.new(inquiry, "update") unless inquiry.lock_version == version
        allowed = { "new" => "contacted", "contacted" => "closed" }
        raise ArgumentError, "Reload this inquiry before changing its status." unless inquiry.status == status || allowed[inquiry.status] == status

        inquiry.update!(changes)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "service_inquiries.update", outcome: :committed,
          resource_version_ref: "Clinic::ServiceInquiry:#{inquiry.id}")
      end
      render json: { inquiry: payload(inquiry) }
    end

    private

    def payload(inquiry)
      {
        id: inquiry.id, service_name: inquiry.service_offering.name, status: inquiry.status,
        lock_version: inquiry.lock_version, display_name: inquiry.display_name,
        email_address: inquiry.email_address, phone_number: inquiry.phone_number,
        follow_up_on: inquiry.follow_up_on&.iso8601, follow_up_note: inquiry.follow_up_note,
        created_at: inquiry.created_at.iso8601(6)
      }
    end
  end
end
