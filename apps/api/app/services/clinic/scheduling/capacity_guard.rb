module Clinic
  module Scheduling
    module CapacityGuard
      module_function

      # Call inside the booking transaction. The shared clinician row serializes
      # offers, bookings and changes to capacity for this provider across sites.
      def check!(practice:, clinician:, site:, starts_at:, ends_at:, patient: nil, appointment_id: nil, waitlist_entry_id: nil)
        return unless clinician && site
        clinician.lock!
        site.lock!
        raise ArgumentError, "Choose an end after the start." unless starts_at && ends_at && ends_at > starts_at
        check_site_hours!(practice: practice, site: site, starts_at: starts_at, ends_at: ends_at)
        rules = CapacityRule.where(practice: practice, clinician: clinician, active: true)
        if rules.where(kind: "block").where("starts_at < ? AND ends_at > ?", ends_at, starts_at).exists?
          raise ArgumentError, "The clinician has blocked time in this interval."
        end
        weekly = rules.where(kind: "weekly").to_a
        weekly_for_site = weekly.select { |rule| rule.site_id == site.id }
        raise ArgumentError, "The clinician has no capacity configured for this site." if weekly_for_site.empty?

        timezone = site_timezone(practice, site)
        start_local = starts_at.in_time_zone(timezone)
        end_local = ends_at.in_time_zone(timezone)
        start_minute = start_local.hour * 60 + start_local.min
        end_minute = end_local.hour * 60 + end_local.min
        fits = start_local.to_date == end_local.to_date && weekly_for_site.any? { |rule|
          rule.site_id == site.id && rule.weekday == start_local.wday && rule.start_minute <= start_minute && rule.end_minute >= end_minute
        }
        raise ArgumentError, "This time is outside the clinician's capacity template for this site." unless fits
        appointments = practice.appointments.where(booked_clinician_id: clinician.id, status: %w[scheduled confirmed])
        appointments = appointments.where.not(id: appointment_id) if appointment_id
        if appointments.where("starts_at < ? AND ends_at > ?", ends_at, starts_at).exists?
          raise ArgumentError, "This clinician is already booked for that time."
        end
        if patient
          patient.lock!
          patient_appointments = practice.appointments.where(patient_id: patient.id, status: %w[scheduled confirmed])
          patient_appointments = patient_appointments.where.not(id: appointment_id) if appointment_id
          if patient_appointments.where("starts_at < ? AND ends_at > ?", ends_at, starts_at).exists?
            raise ArgumentError, "This patient already has an appointment during that time."
          end
        end
        offers = WaitlistEntry.where(practice: practice, clinician: clinician, state: "offered")
          .where("offer_expires_at > ? AND offer_starts_at < ? AND offer_ends_at > ?", Current.business_time, ends_at, starts_at)
        offers = offers.where.not(id: waitlist_entry_id) if waitlist_entry_id
        raise ArgumentError, "This time is held for a waitlist offer. Choose another time or release that offer." if offers.exists?
      end

      def check_site_hours!(practice:, site:, starts_at:, ends_at:)
        timezone = site_timezone(practice, site)
        start_local = starts_at.in_time_zone(timezone)
        end_local = ends_at.in_time_zone(timezone)
        configured = site.operating_hours.exists?
        exception = site.hour_exceptions.find_by(date: start_local.to_date)
        return if !configured && exception.nil?

        hours = exception || site.operating_hours.find_by(day_of_week: start_local.wday)
        fits = hours && !hours.closed? && start_local.to_date == end_local.to_date &&
          minute_of_day(hours.open_time) <= minute_of_day(start_local) &&
          minute_of_day(hours.close_time) >= minute_of_day(end_local)
        raise ArgumentError, "This time is outside the site's operating hours." unless fits
      end
      private_class_method :check_site_hours!

      def site_timezone(practice, site)
        ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone] ||
          raise(ArgumentError, "The clinic timezone is unavailable.")
      end
      private_class_method :site_timezone

      def minute_of_day(value)
        value.hour * 60 + value.min
      end
      private_class_method :minute_of_day
    end
  end
end
