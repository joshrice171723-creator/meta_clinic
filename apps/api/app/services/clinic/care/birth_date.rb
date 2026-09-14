module Clinic
  module Care
    # Product age rules use the server business date. A leap-day birthday falls
    # on February's last day in a non-leap year, matching the tracking board.
    module BirthDate
      module_function

      def parse!(value, on: Current.business_date, minimum_age: 0)
        text = value.is_a?(Date) ? value.iso8601 : value.to_s
        raise ArgumentError, "Enter a valid birth date as YYYY-MM-DD." unless text.match?(/\A\d{4}-\d{2}-\d{2}\z/)
        date = Date.iso8601(text)
        raise ArgumentError, "Birth date cannot be in the future." if date > on
        years = age(date, on:)
        raise ArgumentError, "Birth date must indicate an age younger than 150." if years >= 150
        raise ArgumentError, "You must be 18 or older to create a membership account." if years < minimum_age
        date
      rescue Date::Error
        raise ArgumentError, "Enter a valid birth date as YYYY-MM-DD."
      end

      def age(date, on: Current.business_date)
        birthday = date.advance(years: on.year - date.year)
        on.year - date.year - (on < birthday ? 1 : 0)
      end
    end
  end
end
