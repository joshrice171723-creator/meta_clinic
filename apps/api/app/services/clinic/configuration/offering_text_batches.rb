require "json"
require "digest"
require "time"

module Clinic
  module Configuration
    class OfferingTextBatches
      def initialize(practice:, actor:, membership:, site_id:)
        @practice, @actor, @membership, @site_id = practice, actor, membership, site_id
      end

      def catalog
        authorize!
        import_fields.catalog
      end

      def scope
        authorize!
        Clinic::OfferingTextBatch.where(practice: @practice, actor: @actor,
          actor_membership: @membership, site_id: @site_id,
          authorization_generation: @membership.authorization_generation)
      end

      def create(input)
        authorize!
        key = input.fetch("request_key")
        raise ArgumentError, "Invalid batch identity." unless key.is_a?(String) && key.match?(Clinic::Idempotency::KEY_PATTERN)
        source = input.fetch("source").slice("practiceId", "digest", "generatedAt")
        raise ArgumentError, "Invalid source provenance." unless positive_id?(source["practiceId"]) && source["practiceId"] != @practice.id && source["digest"].is_a?(String) && source["digest"].match?(/\A[a-f0-9]{64}\z/) && source["generatedAt"].is_a?(String) && Time.iso8601(source["generatedAt"])
        raw_items = input.fetch("items")
        raise ArgumentError, "Select 1 to 500 draft offerings." unless raw_items.is_a?(Array) && raw_items.length.between?(1, 500)
        # Compare the original supplied review before destination validation:
        # a lost save response must remain reloadable after later application.
        digest = Digest::SHA256.hexdigest(JSON.generate([source, raw_items.map { |item| item.slice("plan", "attempt") }]))
        existing = scope.find_by(request_key: key)
        if existing
          raise Clinic::Idempotency::Conflict unless existing.plan_digest == digest
          return existing
        end
        items = raw_items.map { |item| validate_item!(item, source) }
        %w[targetId sourceOfferingId].each do |field|
          raise ArgumentError, "Select each source and destination once." unless items.map { |item| item["plan"][field] }.uniq.length == items.length
        end
        keys = items.map { |item| item.dig("attempt", "body", "service_offering", "request_key") }
        raise ArgumentError, "Each item needs a distinct request identity." unless keys.uniq.length == keys.length
        codes = items.filter_map { |item| item["plan"]["attributes"]["code"] }
        raise ArgumentError, "Reviewed codes collide." unless codes.uniq.length == codes.length
        batch = Clinic::OfferingTextBatch.create!(practice: @practice, actor: @actor,
          actor_membership: @membership, site_id: @site_id, authorization_generation: @membership.authorization_generation,
          request_key: key, plan_digest: digest,
          document: JSON.generate({ "source" => source, "items" => items, "events" => [], "retentionPolicy" => "unselected" }))
        audit!(batch)
        batch
      rescue KeyError, TypeError, NoMethodError
        raise ArgumentError, "A complete reviewed draft-offering import plan is required."
      end

      def change(key, index, action)
        batch = scope.find_by!(request_key: key)
        batch.with_lock do
          authorize!
          raise Clinic::Authorization::Denied unless batch.authorization_generation == @membership.reload.authorization_generation
          data = JSON.parse(batch.document)
          item = data.fetch("items").fetch(index)
          authorize_item!(item)
          if action == "prepare"
            # Durable intent precedes any destination request. Interrupted work
            # is therefore unknown after reload, never silently ready again.
            raise ArgumentError, "Reconcile this item before another attempt." unless item["status"] == "ready"
            item.merge!("status" => "unknown", "message" => "Prepared; destination outcome not confirmed.", "retryPermitted" => true)
          elsif action == "reconcile"
            reconcile!(item)
          elsif action == "apply"
            raise ArgumentError, "Reconcile before explicitly repeating an unknown request." unless item["status"] == "unknown" && item["retryPermitted"] == true
            reconcile!(item)
            unless item["status"] == "applied"
              raise Clinic::Idempotency::OutcomeUnconfirmed unless item["retryPermitted"]
              perform!(item)
            end
          else
            raise ArgumentError, "Unsupported batch action."
          end
          data["events"] << { "item" => index, "action" => action, "status" => item["status"], "at" => Time.current.iso8601(6) }
          batch.update!(document: JSON.generate(data))
          audit!(batch)
        end
        batch
      rescue IndexError
        raise ArgumentError, "Select an existing reviewed item."
      end

      def projection(batch)
        authorize!
        raise Clinic::Authorization::Denied unless scope.exists?(id: batch.id)
        data = JSON.parse(batch.document)
        data.fetch("items").each { |item| authorize_item!(item) }
        audit!(batch, action_code: "facilities.read")
        { request_key: batch.request_key, created_at: batch.created_at.iso8601(6),
          context: { actor_id: batch.actor_id, actor_membership_id: batch.actor_membership_id,
            practice_id: batch.practice_id, site_id: batch.site_id, authorization_generation: batch.authorization_generation },
          source: data["source"], items: data["items"], retention_policy: data["retentionPolicy"],
          complete: data["items"].all? { |item| item["status"] == "applied" } }
      end

      private

      def authorize!
        @actor.reload
        @membership.reload
        raise Clinic::Authorization::Denied unless @membership.active? && @membership.user_id == @actor.id && @membership.practice_id == @practice.id && @actor.active?
        if @site_id
          raise Clinic::Authorization::Denied unless @practice.sites.exists?(id: @site_id)
        end
        Clinic::Authorization.authorize_with_legacy!(practice: @practice, actor: @actor, action: "facilities.write", legacy_action: "appointments.write")
      end

      def validate_item!(input, source)
        plan, attempt = input.fetch("plan"), input.fetch("attempt")
        raise ArgumentError, "Invalid source identity." unless positive_id?(plan["sourceOfferingId"]) && plan["sourcePracticeId"] == source["practiceId"] && plan["sourceDigest"] == source["digest"]
        raise ArgumentError, "Invalid destination identity." unless positive_id?(plan["targetId"]) && plan["expectedVersion"].is_a?(Integer) && plan["expectedVersion"].between?(0, 2_147_483_647)
        offering = @practice.service_offerings.find(plan.fetch("targetId"))
        raise ArgumentError, "Select a current existing draft revision." unless offering.status == "draft" && plan["expectedVersion"] == offering.lock_version
        changes = plan.fetch("changes")
        raise ArgumentError, "Select supported fields once." unless changes.is_a?(Array) && changes.length.between?(1, OfferingImportFields::FIELDS.length) && changes.map { |change| change["field"] }.uniq.length == changes.length
        attributes = changes.to_h do |change|
          field, after = change.values_at("field", "after")
          raise ArgumentError, "Select only supported offering fields." unless OfferingImportFields::FIELDS.include?(field)
          import_fields.validate_value!(field, after)
          raise ArgumentError, "Preview the current destination value." unless change["before"] == import_fields.current(offering, field) && after != change["before"]
          [field, after]
        end
        import_fields.validate_references!(changes, plan.fetch("referenceMappings", []))
        raise ArgumentError, "Preview attributes do not match." unless attributes == plan["attributes"]
        if attributes["code"] && @practice.service_offerings.where(code: attributes["code"]).where.not(id: offering.id).exists?
          raise ArgumentError, "Destination code is already used."
        end
        body = attempt.dig("body", "service_offering")
        expected = attributes.merge("lock_version" => offering.lock_version, "request_key" => body&.[]("request_key"))
        raise ArgumentError, "Retain the exact supported PATCH request." unless attempt["method"] == "PATCH" && attempt["path"] == "/api/clinic/service_offerings/#{offering.id}" && attempt["body"].keys == ["service_offering"] && body == expected && body["request_key"].is_a?(String) && body["request_key"].match?(Clinic::Idempotency::KEY_PATTERN)
        { "plan" => plan.slice("sourcePracticeId", "sourceOfferingId", "sourceDigest", "targetId", "expectedVersion", "changes", "attributes", "referenceMappings"),
          "attempt" => { "method" => "PATCH", "path" => attempt["path"], "body" => { "service_offering" => expected }, "success" => "Selected draft offering fields confirmed saved." },
          "status" => "ready", "message" => "Saved review; not attempted.", "retryPermitted" => false }
      end

      def import_fields
        @import_fields ||= OfferingImportFields.new(practice: @practice, actor: @actor)
      end

      def canonical_attributes(body)
        # Receipt comparison must match the owning operation, including sorted
        # association IDs. Never hash a parallel browser normalization.
        ManageServiceOffering.send(:normalize, body.except("request_key", "lock_version").symbolize_keys, creating: false)
      end

      def authorize_item!(item)
        import_fields.authorize_billing! if item["plan"]["attributes"].key?("billing_service_id")
      end

      def reconcile!(item)
        authorize_item!(item)
        body = item.dig("attempt", "body", "service_offering")
        receipt = Clinic::Idempotency.reconcile(practice: @practice, actor: @actor,
          operation_code: ManageServiceOffering::UPDATE_OPERATION, request_key: body.fetch("request_key"),
          payload: { service_offering_id: item["plan"]["targetId"], lock_version: body.fetch("lock_version"), attributes: canonical_attributes(body) },
          authorization: -> { authorize!; authorize_item!(item) })
        item["receiptCheckedAt"] = Time.current.iso8601(6)
        item["retryPermitted"] = false
        if receipt&.outcome_committed?
          raise Clinic::Idempotency::Conflict unless receipt.resource_type == "Clinic::ServiceOffering" && receipt.resource_id == item["plan"]["targetId"]
          item.merge!("status" => "applied", "message" => "Confirmed by the original committed receipt.", "receiptId" => receipt.id)
        elsif receipt
          item.merge!("status" => "unknown", "message" => "Receipt requires reconciliation; repeat is blocked.")
        elsif item["status"] == "unknown"
          item.merge!("retryPermitted" => true, "message" => "No receipt found under the exact request lock. Outcome remains unknown; an explicit exact repeat is available.")
        end
      end

      def perform!(item)
        body = item.dig("attempt", "body", "service_offering")
        begin
          # A savepoint preserves durable unknown intent when the owning update
          # rejects the attempt. The receipt and successful item outcome commit
          # in the same surrounding batch transaction.
          ApplicationRecord.transaction(requires_new: true) do
            authorize!
            offering = @practice.service_offerings.find(item["plan"]["targetId"])
            raise ArgumentError, "The destination is no longer a draft." unless offering.status == "draft"
            import_fields.validate_destination_references!(item["plan"]["attributes"])
            ManageServiceOffering.update(practice: @practice, actor: @actor, offering: offering,
              request_key: body.fetch("request_key"), lock_version: body.fetch("lock_version"),
              attributes: body.except("request_key", "lock_version").symbolize_keys)
          end
          # Persist the committed receipt identity as well as the item state;
          # a success projection never rests solely on the browser response.
          reconcile!(item)
          raise Clinic::Idempotency::OutcomeUnconfirmed unless item["status"] == "applied"
        rescue Clinic::Idempotency::OutcomeUnconfirmed
          item.merge!("status" => "unknown", "message" => "The owning update remains unconfirmed.", "retryPermitted" => false)
        rescue ActiveRecord::StaleObjectError, ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique, ArgumentError
          # Unknown intent is retained even after a definitive rejection: an
          # earlier delivery may have committed. Never replace its request.
          item.merge!("status" => "unknown", "message" => "Exact update rejected; recheck its receipt. No new revision or request was substituted.", "retryPermitted" => false)
        end
      end

      def positive_id?(value)
        value.is_a?(Integer) && value.positive?
      end

      def audit!(batch, action_code: "facilities.write")
        Clinic::AuditRecorder.record!(practice: @practice, actor: @actor, action_code: action_code,
          resource_version_ref: "offering_text_batch:#{batch.id}:#{batch.updated_at.iso8601(6)}", outcome: :released)
      end
    end
  end
end
