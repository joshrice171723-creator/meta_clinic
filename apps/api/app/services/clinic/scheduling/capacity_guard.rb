module Clinic
  module Scheduling
    module CapacityGuard
      module_function

      # Call inside the booking transaction. The shared clinician row serializes
      # offers, bookings and changes to capacity for this provider across sites.
      def check!(practice:, clinician:, site:, starts_at:, ends_at:, appointment_id: nil, waitlist_entry_id: nil)
        return unless clinician && site
        clinician.lock!
        raise ArgumentError, "Choose an end after the start." unless starts_at && ends_at && ends_at > starts_at
        rules = CapacityRule.where(practice: practice, clinician: clinician, active: true)
        if rules.where(kind: "block").where("starts_at < ? AND ends_at > ?", ends_at, starts_at).exists?
          raise ArgumentError, "The clinician has blocked time in this interval."
        end
        weekly = rules.where(kind: "weekly", site: site).to_a
        if weekly.any?
          start_local = starts_at.in_time_zone(practice.timezone)
          end_local = ends_at.in_time_zone(practice.timezone)
          start_minute = start_local.hour * 60 + start_local.min
          end_minute = end_local.hour * 60 + end_local.min
          fits = start_local.to_date == end_local.to_date && weekly.any? { |rule|
            rule.weekday == start_local.wday && rule.start_minute <= start_minute && rule.end_minute >= end_minute
          }
          raise ArgumentError, "This time is outside the clinician's capacity template for this site." unless fits
        end
        appointments = practice.appointments.where(booked_clinician_id: clinician.id, status: %w[scheduled confirmed])
        appointments = appointments.where.not(id: appointment_id) if appointment_id
        if appointments.where("starts_at < ? AND ends_at > ?", ends_at, starts_at).exists?
          raise ArgumentError, "This clinician is already booked for that time."
        end
        offers = WaitlistEntry.where(practice: practice, clinician: clinician, state: "offered")
          .where("offer_expires_at > ? AND offer_starts_at < ? AND offer_ends_at > ?", Current.business_time, ends_at, starts_at)
        offers = offers.where.not(id: waitlist_entry_id) if waitlist_entry_id
        raise ArgumentError, "This time is held for a waitlist offer. Choose another time or release that offer." if offers.exists?
      end
    end
  end
end
