module Workforce
  class KioskClockController < ApplicationController
    # Physical terminal credential and punch times do not follow a tutorial date.
    KIOSK_COOKIE = :workforce_kiosk

    before_action :require_kiosk_availability

    rate_limit to: 8, within: 1.minute, only: :challenge, name: "workforce_badge",
      by: -> { Digest::SHA256.hexdigest(params[:badge].to_s) },
      with: -> { render json: { error: "Too many scans. Wait one minute and try again." }, status: :too_many_requests }
    rate_limit to: 30, within: 1.minute, only: %i[enroll challenge create_punch status], name: "workforce_kiosk_ip",
      with: -> { render json: { error: "Too many clock requests. Wait one minute and try again." }, status: :too_many_requests }

    rescue_from Clinic::Workforce::EnrollKiosk::Rejected, Clinic::Workforce::ResolveBadgeChallenge::Rejected do |error|
      render json: { error: error.message }, status: :unauthorized
    end
    rescue_from Clinic::Workforce::RecordPunch::Conflict do |error|
      render json: { error: error.message, code: "clock_conflict", allowed_transitions: error.allowed_transitions }, status: :conflict
    end
    rescue_from Clinic::Workforce::EffectiveSettings::Unconfigured do
      render json: { error: "Workforce settings are not configured for this site." }, status: :service_unavailable
    end
    rescue_from ActiveRecord::RecordInvalid, ArgumentError do |error|
      render json: { error: error.message }, status: :unprocessable_entity
    end

    def enroll
      result = Clinic::Workforce::EnrollKiosk.call(enrollment_token: params.require(:enrollment_token), now: Time.current)
      cookies.encrypted[KIOSK_COOKIE] = {
        value: result.token,
        httponly: true,
        same_site: :strict,
        secure: Rails.env.production?,
        expires: result.kiosk_session.expires_at
      }
      render json: { enrolled: true, site_id: result.kiosk_session.site_id, site_name: result.kiosk_session.site.name }, status: :created
    end

    def show
      kiosk = current_kiosk_session!
      settings = Clinic::Workforce::EffectiveSettings.call(practice: kiosk.practice, site: kiosk.site, at: Time.current)
      render json: {
        enrolled: true,
        site_id: kiosk.site_id,
        site_name: kiosk.site.name,
        scanner_enabled: settings.fetch(:values).fetch("scanner_enabled", true),
        camera_enabled: settings.fetch(:values).fetch("camera_enabled", false),
        manual_badge_entry_enabled: settings.fetch(:values).fetch("manual_badge_entry_enabled", false),
        pin_required: settings.fetch(:values).fetch("pin_required", false),
        camera_formats: %w[code_128]
      }
    end

    def challenge
      kiosk = current_kiosk_session!
      result = Clinic::Workforce::ResolveBadgeChallenge.call(
        kiosk_session: kiosk,
        badge_token: params.require(:badge),
        pin: params[:pin],
        input_method: params[:input_method].presence || "scanner",
        now: Time.current
      )
      render json: {
        challenge: result.token,
        expires_at: result.challenge.expires_at.utc.iso8601(6),
        employee_label: result.employee_label,
        allowed_transitions: result.permitted_transitions,
        break_target_minutes: result.break_target_minutes,
        break_reminder_due: result.break_reminder_due
      }, status: :created
    ensure
      params[:badge] = "[FILTERED]" if params.key?(:badge)
      params[:pin] = "[FILTERED]" if params.key?(:pin)
    end

    def create_punch
      kiosk = current_kiosk_session!
      request_key = params.require(:request_key).to_s
      cookies.encrypted[:workforce_clock_request] = {
        value: request_key, httponly: true, same_site: :strict,
        secure: Rails.env.production?, expires: 10.minutes.from_now
      }
      result = Clinic::Workforce::RecordPunch.call(
        kiosk_session: kiosk,
        challenge_token: params.require(:challenge),
        event_type: params.require(:event_type),
        request_key: request_key,
        now: Time.current
      )
      render json: Clinic::Workforce::ClockSerializer.punch(result.punch, replayed: result.replayed), status: result.replayed ? :ok : :created
    ensure
      params[:challenge] = "[FILTERED]" if params.key?(:challenge)
    end

    def status
      kiosk = current_kiosk_session!
      request_key = params[:request_key].presence || cookies.encrypted[:workforce_clock_request]
      raise ActionController::ParameterMissing, :request_key if request_key.blank?
      punch = Clinic::Workforce::Punch.find_by(kiosk_session_id: kiosk.id, request_key: request_key)
      if punch
        cookies.delete(:workforce_clock_request, same_site: :strict, secure: Rails.env.production?)
        render json: Clinic::Workforce::ClockSerializer.punch(punch, replayed: true)
      else
        render json: { saved: false, status: "not_found" }, status: :not_found
      end
    end

    private

    def require_kiosk_availability
      return unless Rails.env.production?

