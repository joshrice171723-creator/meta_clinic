module Platform
  module Api
    class CommandCenterController < ApplicationController
      include Clinic::Api::RequestParameters

      before_action :require_admin

      rescue_from Clinic::Api::RequestParameters::Invalid do |error|
        render_parameter_error(error)
      end
      rescue_from Platform::CreateClinic::Unavailable do |error|
        render json: { error: error.message }, status: :unprocessable_entity
      end
      rescue_from Platform::InviteClinicOwner::Unavailable do |error|
        render json: { error: error.message }, status: :unprocessable_entity
      end

      def show
        render json: command_center_payload
      end

      def create
        input = parameter_hash!(:clinic, %i[
          organization_id organization_name clinic_name timezone owner_name owner_email
          delivery_method owner_phone
        ])
        organization_id = input[:organization_id].present? ?
          integer_id!(input[:organization_id], field: :organization_id) : nil
        timezone = required_string!(input[:timezone], field: :timezone, maximum: 80)
        unless (ActiveSupport::TimeZone::MAPPING.values + [ "UTC" ]).include?(timezone)
          raise Clinic::Api::RequestParameters::Invalid.new("Choose a valid timezone.", field: :timezone)
        end

        delivery = invitation_delivery_input!(input)
        result = Platform::CreateClinic.call(
          actor: current_user,
          organization_id:,
          organization_name: optional_string(input[:organization_name], field: :organization_name, maximum: 120),
          clinic_name: required_string!(input[:clinic_name], field: :clinic_name, maximum: 120),
          timezone:,
          owner_name: required_string!(input[:owner_name], field: :owner_name, maximum: 120),
          owner_email: required_string!(input[:owner_email], field: :owner_email, maximum: 254),
          **delivery
        )
        invitation = result.fetch(:invitation)
        render json: {
          clinic: clinic_payload(result.fetch(:practice)),
          invitation: {
            email_address: invitation.email_address,
            expires_at: invitation.expires_at.iso8601,
            activation_path: result.fetch(:delivery_status) == "sent" ? nil : result.fetch(:activation_path),
            delivery_status: result.fetch(:delivery_status)
          }
        }, status: :created
      end

      def invite_owner
        input = parameter_hash!(:owner, %i[name email delivery_method phone])
        practice = Clinic::Practice.find(integer_id!(params[:id], field: :id))
        delivery = invitation_delivery_input!(input)
        result = Platform::InviteClinicOwner.call(actor: current_user, practice:,
          owner_name: required_string!(input[:name], field: :name, maximum: 120),
          owner_email: required_string!(input[:email], field: :email, maximum: 254), **delivery)
        invitation = result.fetch(:invitation)
        render json: {
          clinic: clinic_payload(practice.reload),
          invitation: invitation_payload(invitation, result)
        }, status: :created
      end

      private

      def invitation_delivery_input!(input)
        delivery_method = optional_string(input[:delivery_method], field: :delivery_method, maximum: 10)&.downcase || "email"
        unless Platform::ClinicOwnerInvitationDelivery::METHODS.include?(delivery_method)
          raise Clinic::Api::RequestParameters::Invalid.new("Choose email or text message.", field: :delivery_method)
        end
        owner_phone = optional_string(input[:owner_phone] || input[:phone], field: :owner_phone, maximum: 32)
        if delivery_method == "sms" && Platform::ClinicOwnerInvitationSms.normalize_phone(owner_phone).blank?
          raise Clinic::Api::RequestParameters::Invalid.new("Enter a valid mobile number for text delivery.", field: :owner_phone)
        end
        { delivery_method:, owner_phone: }
      end

      def invitation_payload(invitation, result)
        {
          email_address: invitation.email_address,
          expires_at: invitation.expires_at.iso8601,
          activation_path: result.fetch(:delivery_status) == "sent" ? nil : result.fetch(:activation_path),
          delivery_status: result.fetch(:delivery_status)
        }
      end

      def command_center_payload
        organizations = Organization.includes(practices: [
          { memberships: [ :user, { role_grants: :role_version } ] },
          { workforce_employee_invitations: :role_version }
        ])
          .order(:name, :id)
        assigned_ids = organizations.flat_map { |organization| organization.practices.map(&:id) }
        unassigned = Clinic::Practice.where(organization_id: nil)
          .includes(
            { memberships: [ :user, { role_grants: :role_version } ] },
            { workforce_employee_invitations: :role_version }
          ).order(:name, :id)
        {
          schema_version: "owner-command-center-v1",
          delivery_methods: { email: true, sms: Platform::ClinicOwnerInvitationSms.configured? },
          demo_usage: demo_usage_payload,
          organizations: organizations.map { |organization| organization_payload(organization) },
          unassigned_clinics: unassigned.reject { |practice| assigned_ids.include?(practice.id) }.map { |practice| clinic_payload(practice) }
        }
      end

      def demo_usage_payload
        now = Time.current
        Development::DemoVisitor.includes(:demo_runs).order(created_at: :desc, id: :desc).map do |visitor|
          runs = visitor.demo_runs
          {
            id: visitor.id,
            name: visitor.name,
            email: visitor.email,
            company: visitor.company,
            lessons_started: runs.filter_map(&:lesson_key).uniq.length,
            elapsed_seconds: runs.sum { |run| demo_run_elapsed_seconds(run, now) },
            lesson_usage: runs.filter_map { |run| demo_lesson_usage(run, now) }
          }
        end
      end

      def demo_lesson_usage(run, now)
        return if run.lesson_key.blank?

        {
          lesson_key: run.lesson_key,
          title: Development::DemoLessonCatalog.definition!(run.lesson_key).fetch(:title),
          elapsed_seconds: demo_run_elapsed_seconds(run, now),
          completed: run.completed_at.present?
        }
      end

      def demo_run_elapsed_seconds(run, now)
        return run.elapsed_seconds_at(now) if run.active?
        return run.elapsed_seconds if run.elapsed_seconds.positive?

        [ run.updated_at - run.created_at, 0 ].max.to_i
      end

      def organization_payload(organization)
        { id: organization.id, name: organization.name,
          clinics: organization.practices.sort_by { |practice| [ practice.name.downcase, practice.id ] }.map { |practice| clinic_payload(practice) } }
      end

      def clinic_payload(practice)
        now = Time.current
        active_memberships = practice.memberships.select { |membership| membership.active? && membership.user.active? }
        owner_memberships = active_memberships.select do |membership|
          membership.role_grants.any? do |grant|
            grant.role_version.role_code == "clinic-administrator" &&
              grant.role_version.version == Clinic::Authorization::PilotRoleCatalog::VERSION &&
              grant.revoked_at.nil? && grant.effective_from <= now &&
              (grant.effective_until.nil? || grant.effective_until > now)
          end
        end
        owner_invitations = practice.workforce_employee_invitations.select do |invitation|
          invitation.pending? && invitation.expires_at > now &&
            invitation.role_version.role_code == "clinic-administrator" &&
            invitation.role_version.version == Clinic::Authorization::PilotRoleCatalog::VERSION
        end
        {
          id: practice.id,
          name: practice.name,
          timezone: practice.timezone,
          created_at: practice.created_at.iso8601,
          member_count: active_memberships.length,
          owner_accounts: owner_memberships.map { |membership| membership.user.email_address }.sort,
          owner_invitations: owner_invitations.map(&:email_address).sort,
          state: owner_memberships.any? ? "ready" : owner_invitations.any? ? "invited" : "needs_owner"
        }
      end
    end
  end
end
