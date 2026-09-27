module Clinic
  class ServiceInquiriesController < Clinic::ApiController
    before_action -> { require_capability("subscriptions.review") }

    def index
      inquiries = current_practice.service_inquiries.includes(:service_offering).order(created_at: :desc, id: :desc)
      records = inquiries.limit(100).to_a
      Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
        action_code: "service_inquiries.index", outcome: :released)
      render json: {
        inquiries: records.map { |inquiry|
          payload(inquiry)
        },
        capped: inquiries.count > records.size
      }
    end

    def update
      inquiry = current_practice.service_inquiries.find(requested_id!(params[:id], :id))
      input = parameter_hash!(:inquiry, %i[status lock_version])
      status = enum_param!(input[:status], field: :status, allowed: %w[contacted closed])
      version = bounded_integer!(input[:lock_version], field: :lock_version)
      inquiry.with_lock do
        raise ActiveRecord::StaleObjectError.new(inquiry, "update") unless inquiry.lock_version == version
        allowed = { "new" => "contacted", "contacted" => "closed" }
        raise ArgumentError, "Reload this inquiry before changing its status." unless allowed[inquiry.status] == status

        inquiry.update!(status:)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "service_inquiries.#{status}", outcome: :committed,
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
        created_at: inquiry.created_at.iso8601(6)
      }
    end
  end
end
