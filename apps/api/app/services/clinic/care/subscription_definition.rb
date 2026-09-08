require "digest"
require "json"

module Clinic
  module Care
    # Validates authoring input and produces the only patient-facing purchase terms.
    class SubscriptionDefinition
      MODES = %w[included optional choose_one choose_many].freeze

      def self.build(package)
        draft = package.draft
        raise ArgumentError, "Package settings must be an object." unless draft.is_a?(Hash)
        components = draft.fetch("components", [])
        raise ArgumentError, "Add between 1 and 100 services." unless components.is_a?(Array) && components.length.between?(1, 100)
        requested_currency = draft.fetch("currency", "USD").to_s.upcase
        raise ArgumentError, "Only USD packages are supported." unless requested_currency == "USD"
        snapshot = {
          "family_id" => package.family_id, "family_name" => package.family.published_snapshot&.fetch("name") || package.family.name,
          "package_id" => package.id, "package_name" => package.name,
          "description" => text(draft["description"], 4000), "tier" => text(draft["tier"], 160),
          "display_order" => integer(draft.fetch("display_order", 0), 0..1_000_000, "Display order"),
          "amount" => money(draft.fetch("amount")), "currency" => "USD",
          "duration" => integer(draft.fetch("duration"), 1..1200, "Duration"),
          "duration_unit" => choice(draft.fetch("duration_unit"), %w[days months], "Duration unit"),
          "renewal" => choice(draft.fetch("renewal", "none"), %w[none manual automatic], "Renewal"),
          "cancellation" => choice(draft.fetch("cancellation", "immediate"), %w[immediate end_of_term], "Cancellation"),
          "refund_policy" => choice(draft.fetch("refund_policy", "manual_review"), %w[none manual_review], "Refund policy"),
          "terms" => text(draft.fetch("terms"), 8000, required: true),
          "eligibility_review" => boolean(draft.fetch("eligibility_review", false)),
          "max_per_patient" => integer(draft.fetch("max_per_patient", 1), 1..100, "Purchase limit"),
          "available_from" => timestamp(draft["available_from"]),
          "available_until" => timestamp(draft["available_until"])
        }
        raise ArgumentError, "Package price must be positive." unless BigDecimal(snapshot["amount"]).positive?
        if snapshot["renewal"] == "automatic"
          raise ArgumentError, "Automatic memberships renew every month, allow one enrollment, and cancel at the end of the paid period." unless
            snapshot["cancellation"] == "end_of_term" && snapshot["duration_unit"] == "months" &&
            snapshot["duration"] == 1 && snapshot["max_per_patient"] == 1
        end
        if snapshot["available_from"] && snapshot["available_until"] && snapshot["available_from"] >= snapshot["available_until"]
          raise ArgumentError, "Availability must end after it starts."
        end
        snapshot["components"] = components.map do |component|
          raise ArgumentError, "Each service must be an object." unless component.is_a?(Hash)
          option = ServiceOption.where(practice_id: package.practice_id, retired: false).find(component.fetch("service_id"))
          mode = choice(component.fetch("mode"), MODES, "Inclusion mode")
          {
            "service_id" => option.id, "name" => option.name, "description" => option.description,
            "mode" => mode, "group" => text(component["group"], 160, required: mode.start_with?("choose_")),
            "min" => mode == "choose_one" ? 1 : integer(component.fetch("min", 0), 0..100, "Minimum choices"),
            "max" => mode == "choose_one" ? 1 : integer(component.fetch("max", 100), 1..100, "Maximum choices"),
            "quantity" => integer(component.fetch("quantity", 1), 1..10000, "Service quantity"),
            "frequency" => choice(component.fetch("frequency", "term"), %w[term day week month], "Frequency"),
            "price_adjustment" => mode == "included" ? "0.0" : money(component.fetch("price_adjustment", "0")),
            "eligibility_review" => boolean(component.fetch("eligibility_review", false))
          }
        end
        raise ArgumentError, "A service may appear only once in a package." unless snapshot["components"].map { |c| c["service_id"] }.uniq.length == components.length
        snapshot["components"].select { |c| c["mode"].start_with?("choose_") }.group_by { |c| c["group"] }.each_value do |group|
          settings = group.map { |c| c.values_at("mode", "min", "max") }.uniq
          raise ArgumentError, "Choice group rules must agree and be satisfiable." unless settings.one? && group.first["min"] <= [group.first["max"], group.length].min
        end
        snapshot
      rescue KeyError
        raise ArgumentError, "Complete the required package settings."
      end

      def self.select(snapshot, selected_ids)
        raise ArgumentError, "Selections must be an array of service IDs." unless selected_ids.is_a?(Array) && selected_ids.length <= 100
        ids = selected_ids.map { |id| integer(id, 1..9_223_372_036_854_775_807, "Service ID") }
        raise ArgumentError, "Duplicate selections are not allowed." unless ids.uniq == ids
        options = snapshot.fetch("components")
        raise ArgumentError, "A selected service is not available in this package." unless (ids - options.map { |c| c["service_id"] }).empty?
        selected = options.select { |c| c["mode"] == "included" || ids.include?(c["service_id"]) }
        options.select { |c| c["mode"].start_with?("choose_") }.group_by { |c| c["group"] }.each_value do |group|
          count = group.count { |c| ids.include?(c["service_id"]) }
          raise ArgumentError, "Choose the required number of services in #{group.first['group']}." unless count.between?(group.first["min"], group.first["max"])
        end
        total = selected.sum(BigDecimal(snapshot.fetch("amount"))) { |c| BigDecimal(c.fetch("price_adjustment")) }
        snapshot.merge("selected_components" => selected, "total" => money(total),
          "eligibility_review" => snapshot["eligibility_review"] || selected.any? { |c| c["eligibility_review"] })
      end

      def self.fingerprint(value)
        canonical = case value
        when Hash then value.keys.map(&:to_s).sort.to_h { |key| [key, fingerprint_value(value.fetch(key))] }
        else fingerprint_value(value)
        end
        Digest::SHA256.hexdigest(JSON.generate(canonical))
      end

      def self.fingerprint_value(value)
        case value
        when Hash then value.keys.sort.to_h { |key| [key, fingerprint_value(value[key])] }
        when Array then value.map { |item| fingerprint_value(item) }
        else value
        end
      end

      def self.request_key(value)
        raise ArgumentError, "A valid request key is required." unless value.is_a?(String) && value.match?(/\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}\z/)
        value
      end

      def self.money(value)
        raise ArgumentError, "Money must be an exact decimal string." if value.is_a?(Float)
        Clinic::Billing::Money.currency_amount(value).to_s("F")
      end

      def self.integer(value, range, label)
        raise ArgumentError, "#{label} must be a whole number." unless value.to_s.match?(/\A\d+\z/)
        number = Integer(value.to_s, 10)
        raise ArgumentError, "#{label} is outside the allowed range." unless range.cover?(number)
        number
      end

      def self.text(value, max, required: false)
        raise ArgumentError, "Text settings must be text." unless value.nil? || value.is_a?(String)
        result = value.to_s.strip
        raise ArgumentError, "Complete the text field within #{max} characters." if result.length > max || (required && result.empty?)
        result
      end

      def self.choice(value, choices, label)
        raise ArgumentError, "#{label} is not supported." unless choices.include?(value)
        value
      end

      def self.boolean(value)
        raise ArgumentError, "Review requirement must be true or false." unless [true, false].include?(value)
        value
      end

      def self.timestamp(value)
        return nil if value.nil? || value == ""
        Time.iso8601(value).utc.iso8601
      rescue ArgumentError, TypeError
        raise ArgumentError, "Availability must use an ISO date and time."
      end
    end
  end
end
