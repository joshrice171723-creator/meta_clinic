require "digest"
require "json"
require "openssl"

module Clinic
  module Idempotency
    class Conflict < StandardError; end
    class InvalidRequest < StandardError; end
    class OutcomeUnconfirmed < StandardError; end

    Outcome = Data.define(:receipt, :value, :replayed)

    KEY_PATTERN = /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}\z/
    OPERATION_PATTERN = /\A[a-z][a-z0-9_.-]{0,119}\z/
    LEGACY_DIGEST_ALGORITHM = "sha256-v0"
    DIGEST_ALGORITHM = "hmac-sha256-v1"
    DIGEST_KEY_PURPOSE = "apply/clinic-operation-receipts/payload-digest/#{DIGEST_ALGORITHM}"
    DIGEST_KEY_ITERATIONS = 1_000
    DIGEST_KEY_HASH = OpenSSL::Digest::SHA1
    DEFAULT_DIGEST_KEY_ID = "secret_key_base"
    DIGEST_KEYRING_ENV = "APP_CLINIC_IDEMPOTENCY_HMAC_KEYS"
    DIGEST_ACTIVE_KEY_ID_ENV = "APP_CLINIC_IDEMPOTENCY_HMAC_ACTIVE_KEY_ID"

    def self.execute(practice:, actor:, operation_code:, request_key:, payload:, resource: nil, authorization: nil,
      authorization_action: nil, result_resource: nil, resource_resolver: nil)
      membership = active_membership!(practice, actor)
      operation = validate_operation!(operation_code)
      key = validate_key!(request_key)
      validate_resource!(resource, practice)
      canonical_payload = canonical_payload(payload)
      digest_key_id = active_digest_key_id
      digest = digest_for_canonical(canonical_payload, DIGEST_ALGORITHM, key_id: digest_key_id)

      begin
        ApplicationRecord.transaction do
          lock_request!(practice.id, membership.id, key)
          membership = active_locked_membership!(practice, actor, membership.id)
          authorization.call if authorization
          receipt = Clinic::OperationReceipt.find_by(
            practice_id: practice.id,
            actor_membership_id: membership.id,
            request_key: key
          )

          if receipt
            verify_replay!(receipt, operation, canonical_payload)
            replayed_resource = resolve_receipt_resource!(practice, receipt, resource_resolver)
            next Outcome.new(receipt: receipt, value: replayed_resource, replayed: true)
          end

          value = yield
          receipt_resource = result_resource ? result_resource.call(value) : resource
          validate_resource!(receipt_resource, practice)
          receipt = Clinic::OperationReceipt.create!(
            practice: practice,
            actor_membership: membership,
            operation_code: operation,
            request_key: key,
            payload_digest: digest,
            digest_algorithm: DIGEST_ALGORITHM,
            digest_key_id: digest_key_id,
            outcome: :committed,
            resource_type: receipt_resource&.class&.name,
            resource_id: receipt_resource&.id,
            resource_version: resource_version(receipt_resource)
          )
          Outcome.new(receipt: receipt, value: value, replayed: false)
        end
      rescue OutcomeUnconfirmed
        record_outcome_unconfirmed(
          practice: practice, membership: membership, operation: operation, request_key: key,
          canonical_payload: canonical_payload, resource: resource
        )
      rescue Clinic::Authorization::Denied
        Clinic::AuditRecorder.record!(practice: practice, actor: actor, action_code: authorization_action,
          outcome: :denied) if authorization_action
        raise
      end
    end

    def self.payload_digest(payload, algorithm: DIGEST_ALGORITHM)
      digest_for_canonical(canonical_payload(payload), algorithm)
    end

    # Receipt-only reconciliation shares the same actor/key lock and canonical
    # payload verification as execute. Absence is not proof an old HTTP request
    # was never sent; any explicit repeat still goes through execute.
    def self.reconcile(practice:, actor:, operation_code:, request_key:, payload:, authorization:)
      membership = active_membership!(practice, actor)
      operation = validate_operation!(operation_code)
      key = validate_key!(request_key)
      ApplicationRecord.transaction do
        lock_request!(practice.id, membership.id, key)
        active_locked_membership!(practice, actor, membership.id)
        authorization.call
        receipt = Clinic::OperationReceipt.find_by(practice_id: practice.id,
          actor_membership_id: membership.id, request_key: key)
        verify_replay!(receipt, operation, canonical_payload(payload)) if receipt
        receipt
      end
    end

    def self.canonical_payload(payload)
      JSON.generate(canonicalize(payload))
    rescue TypeError, JSON::GeneratorError
      raise InvalidRequest, "The operation payload is not supported."
    end
    private_class_method :canonical_payload

    def self.digest_for_canonical(payload, algorithm, key_id: nil)
      case algorithm
      when LEGACY_DIGEST_ALGORITHM
        Digest::SHA256.hexdigest(payload)
      when DIGEST_ALGORITHM
        OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new("SHA256"), digest_key(key_id), payload)
      else
        raise InvalidRequest, "The receipt digest version is unsupported."
      end
    end
    private_class_method :digest_for_canonical

    def self.digest_key(key_id = nil)
      selected_key_id = key_id || active_digest_key_id
      secret = digest_keyring.fetch(selected_key_id) do
        raise InvalidRequest, "The receipt verification key is unavailable."
      end
      ActiveSupport::KeyGenerator.new(
        secret,
        iterations: DIGEST_KEY_ITERATIONS,
        hash_digest_class: DIGEST_KEY_HASH
      ).generate_key(DIGEST_KEY_PURPOSE, 32)
    end
    private_class_method :digest_key

    def self.active_digest_key_id
      configured = ENV[DIGEST_ACTIVE_KEY_ID_ENV].presence
      return configured if configured

      credentials = Rails.application.credentials.dig(:clinic, :idempotency, :active_key_id)
      credentials.presence || DEFAULT_DIGEST_KEY_ID
    end
    private_class_method :active_digest_key_id

    def self.digest_keyring
      configured = Rails.application.credentials.dig(:clinic, :idempotency, :hmac_keys)
      configured = configured.to_h if configured.respond_to?(:to_h)
      configured = configured.transform_keys(&:to_s).transform_values(&:to_s) if configured.is_a?(Hash)
      configured = {} unless configured.is_a?(Hash)

      if ENV[DIGEST_KEYRING_ENV].present?
        begin
          environment_keys = JSON.parse(ENV.fetch(DIGEST_KEYRING_ENV))
          raise TypeError unless environment_keys.is_a?(Hash)

          configured.merge!(environment_keys.transform_keys(&:to_s).transform_values(&:to_s))
        rescue JSON::ParserError, TypeError
          raise InvalidRequest, "The receipt verification keyring is invalid."
        end
      end

      configured[DEFAULT_DIGEST_KEY_ID] ||= Rails.application.secret_key_base
      configured.reject { |key, value| key.blank? || value.blank? }
    end
    private_class_method :digest_keyring

    def self.active_membership!(practice, actor)
      raise InvalidRequest, "An authenticated clinic actor is required." unless practice.respond_to?(:id) && actor.respond_to?(:id)

      membership = Clinic::Membership.active.find_by(practice_id: practice.id, user_id: actor.id)
      raise InvalidRequest, "An active clinic membership is required." unless membership

      membership
    end
    private_class_method :active_membership!

    def self.active_locked_membership!(practice, actor, membership_id)
      membership = Clinic::Membership.lock.find_by(
        id: membership_id, practice_id: practice.id, user_id: actor.id, active: true
      )
      return membership if membership

      raise InvalidRequest, "An active clinic membership is required."
    end
    private_class_method :active_locked_membership!

    def self.validate_operation!(operation_code)
      operation = operation_code.to_s
      return operation if operation.match?(OPERATION_PATTERN)

      raise InvalidRequest, "The operation code is invalid."
    end
    private_class_method :validate_operation!

    def self.validate_key!(request_key)
      key = request_key.to_s
      return key if key.match?(KEY_PATTERN)

      raise InvalidRequest, "The request key is invalid."
    end
    private_class_method :validate_key!

    def self.verify_replay!(receipt, operation, canonical_payload)
      key_id = receipt.digest_key_id if receipt.respond_to?(:digest_key_id)
      digest = digest_for_canonical(canonical_payload, receipt.digest_algorithm, key_id: key_id)
      same_digest = ActiveSupport::SecurityUtils.secure_compare(receipt.payload_digest.to_s, digest)
      return if receipt.operation_code == operation && same_digest

      raise Conflict, "That request key was already used for a different operation."
    end
    private_class_method :verify_replay!

    def self.lock_request!(practice_id, membership_id, request_key)
      connection = ApplicationRecord.connection
      lock_key = "clinic-operation:#{practice_id}:#{membership_id}:#{request_key}"
      connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(#{connection.quote(lock_key)}, 0))")
    end
    private_class_method :lock_request!

    def self.resource_version(resource)
      return unless resource

      if resource.respond_to?(:lock_version)
        resource.lock_version.to_s
      elsif resource.respond_to?(:revision)
        resource.revision.to_s
      elsif resource.respond_to?(:updated_at) && resource.updated_at
        resource.updated_at.utc.iso8601(6)
      end
    end
    private_class_method :resource_version

    def self.record_outcome_unconfirmed(practice:, membership:, operation:, request_key:, canonical_payload:, resource:)
      ApplicationRecord.transaction do
        lock_request!(practice.id, membership.id, request_key)
        receipt = Clinic::OperationReceipt.find_by(
          practice_id: practice.id, actor_membership_id: membership.id, request_key: request_key
        )
        if receipt
          verify_replay!(receipt, operation, canonical_payload)
          next Outcome.new(receipt: receipt, value: nil, replayed: true)
        end

        digest_key_id = active_digest_key_id
        receipt = Clinic::OperationReceipt.create!(
          practice: practice,
          actor_membership: membership,
          operation_code: operation,
          request_key: request_key,
          payload_digest: digest_for_canonical(canonical_payload, DIGEST_ALGORITHM, key_id: digest_key_id),
          digest_algorithm: DIGEST_ALGORITHM,
          digest_key_id: digest_key_id,
          outcome: :outcome_unconfirmed,
          resource_type: resource&.class&.name,
          resource_id: resource&.id,
          resource_version: resource_version(resource)
        )
        Outcome.new(receipt: receipt, value: nil, replayed: false)
      end
    end
    private_class_method :record_outcome_unconfirmed

    def self.validate_resource!(resource, practice)
      return unless resource && resource.respond_to?(:practice_id)
      return if resource.practice_id == practice.id

      raise InvalidRequest, "The operation resource is outside the clinic practice."
    end
    private_class_method :validate_resource!

    def self.resolve_receipt_resource!(practice, receipt, resolver)
      return nil unless receipt.resource_id
      # Callers that only need the durable receipt retain the legacy nil replay
      # value. Result-bearing callers must supply a practice-scoped resolver.
      return nil unless resolver

      resource = resolver.call(practice: practice, receipt: receipt)
      valid = resource && resource.class.name == receipt.resource_type && resource.id == receipt.resource_id
      valid &&= resource.practice_id == practice.id if resource.respond_to?(:practice_id)
      return resource if valid

      raise InvalidRequest, "The committed operation resource is unavailable."
    end
    private_class_method :resolve_receipt_resource!

    def self.canonicalize(value)
      case value
      when Hash
        value.keys.map(&:to_s).sort.each_with_object({}) do |key, result|
          original_key = value.key?(key) ? key : value.keys.find { |candidate| candidate.to_s == key }
          result[key] = canonicalize(value.fetch(original_key))
        end
      when Array
        value.map { |item| canonicalize(item) }
      when Time, DateTime, ActiveSupport::TimeWithZone
        value.utc.iso8601(6)
      when Date
        value.iso8601
      when String, Numeric, TrueClass, FalseClass, NilClass
        value
      else
        raise TypeError
      end
    end
    private_class_method :canonicalize
  end
end
