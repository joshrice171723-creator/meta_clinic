module Clinic
  module Care
    class PatientCareCoordinationRevision < ApplicationRecord
      self.table_name = "clinic_patient_care_coordination_revisions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      GROUP_LIMITS = { "primary_care" => 1, "specialists" => 20, "pharmacy" => 1 }.freeze
      STATES = %w[not_recorded known none unknown declined].freeze
      SOURCES = %w[patient caregiver clinic_staff external_record unknown].freeze
      TEXT_LIMITS = { "name" => 200, "practice" => 200, "phone" => 80,
        "address" => 1_000, "identifier" => 200, "identifier_system" => 200,
        "source_detail" => 500, "reference_id" => 100 }.freeze
      ENTRY_KEYS = (TEXT_LIMITS.keys + %w[source address_confirmed]).freeze

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :recorded_by_membership, class_name: "Clinic::Membership"
      encrypts :content

      validates :revision, numericality: { only_integer: true, greater_than: 0 },
        uniqueness: { scope: %i[practice_id patient_id] }
      validates :recorded_at, :content, presence: true
      validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN },
        uniqueness: { scope: %i[practice_id recorded_by_membership_id] }
      validate :valid_content
      validate :same_practice

      def payload
        JSON.parse(content)
      end

      def self.empty_payload
        GROUP_LIMITS.to_h { |group, _limit| [ group, { "state" => "not_recorded", "entries" => [] } ] }
      end

      def self.normalize_payload(value)
        object!(value, GROUP_LIMITS.keys, "Coordination", required: GROUP_LIMITS.keys)
        GROUP_LIMITS.to_h do |group, limit|
          section = value.fetch(group)
          object!(section, %w[state entries], group, required: %w[state entries])
          state = section["state"]
          raise ArgumentError, "Choose a supported #{group.humanize.downcase} state." unless STATES.include?(state)

          entries = section["entries"]
          unless entries.is_a?(Array) && entries.length <= limit
            raise ArgumentError, "#{group.humanize} accepts at most #{limit} entries."
          end
          if (state == "known" && entries.empty?) || (state != "known" && entries.any?)
            raise ArgumentError, "#{group.humanize} entries must match the recorded state."
          end
          [ group, { "state" => state, "entries" => entries.map { |entry| normalize_entry(entry) } } ]
        end
      end

      def self.normalize_entry(entry)
        object!(entry, ENTRY_KEYS, "Coordination entry", required: %w[name source address_confirmed])
        result = TEXT_LIMITS.to_h do |key, limit|
          text = entry[key]
          unless text.nil? || (text.is_a?(String) && text.length <= limit)
            raise ArgumentError, "#{key.humanize} must be text of at most #{limit} characters."
          end
          [ key, text&.strip&.presence ]
        end
        raise ArgumentError, "Enter a provider or pharmacy name." if result["name"].blank?
        unless SOURCES.include?(entry["source"])
          raise ArgumentError, "Choose a supported information source."
        end
        unless [ true, false ].include?(entry["address_confirmed"])
          raise ArgumentError, "Address confirmation must be true or false."
        end
        if entry["address_confirmed"] && result["address"].blank?
          raise ArgumentError, "Enter an address before confirming it."
        end
        if result["identifier"].present? != result["identifier_system"].present?
          raise ArgumentError, "Record both the identifier and its system, or leave both blank."
        end
        result.merge("source" => entry["source"], "address_confirmed" => entry["address_confirmed"])
      end

      def self.object!(value, keys, label, required: [])
        unless value.is_a?(Hash) && (value.keys - keys).empty? && (required - value.keys).empty?
          raise ArgumentError, "#{label} must contain only the supported fields, including required fields."
        end
      end

      private

      def valid_content
        self.class.normalize_payload(payload)
      rescue JSON::ParserError, TypeError, ArgumentError
        errors.add(:content, "must contain a valid coordination record")
      end

      def same_practice
        if patient && patient.practice_id != practice_id
          errors.add(:patient, "must belong to this clinic")
        end
        if recorded_by_membership && recorded_by_membership.practice_id != practice_id
          errors.add(:recorded_by_membership, "must belong to this clinic")
        end
      end
    end
  end
end
