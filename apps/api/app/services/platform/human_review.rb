module Platform
  class HumanReview
    class Unavailable < StandardError; end

    def self.create_packet(actor:, title:, summary:, scope:, revision:, environment:, entry_path:, criteria:)
      authorize!(actor)
      normalized_criteria = normalize_criteria(criteria)
      ApplicationRecord.transaction do
        packet = ReviewPacket.create!(created_by: actor, title:, summary:, scope:, revision:, environment:,
          entry_path:, criteria: normalized_criteria)
        audit(actor, "owner_command_center.review_packet.create", "committed")
        packet
      end
    rescue ActiveRecord::RecordInvalid => error
      raise Unavailable, error.record.errors.full_messages.to_sentence
    end

    def self.record_decision(actor:, packet:, outcome:, note:, results:)
      authorize!(actor)
      ApplicationRecord.transaction do
        packet.lock!
        raise Unavailable, "This review packet already has a decision." unless packet.awaiting_review? && !packet.decision

        normalized_results = normalize_results(packet, results)
        if outcome == "approved" && normalized_results.any? { |result| result.fetch("outcome") != "passed" }
          raise Unavailable, "Approval requires every criterion to pass."
        end
        if outcome == "changes_requested" && normalized_results.none? { |result| result.fetch("outcome") == "failed" }
          raise Unavailable, "Requesting changes requires at least one failed criterion."
        end

        decision = packet.create_decision!(reviewer: actor, outcome:, note:, results: normalized_results)
        packet.update!(status: outcome)
        audit(actor, "owner_command_center.review_packet.#{outcome}", "committed")
        decision
      end
    rescue ActiveRecord::RecordInvalid => error
      raise Unavailable, error.record.errors.full_messages.to_sentence
    end

    def self.normalize_criteria(criteria)
      unless criteria.is_a?(Array) && criteria.length.between?(1, 12)
        raise Unavailable, "Add between 1 and 12 acceptance criteria."
      end
      criteria.map do |criterion|
        label = criterion[:label].to_s.strip
        expected = criterion[:expected].to_s.strip
        raise Unavailable, "Every criterion needs a label and expected evidence." if label.blank? || expected.blank?
        raise Unavailable, "Criterion labels must be at most 160 characters." if label.length > 160
        raise Unavailable, "Expected evidence must be at most 500 characters." if expected.length > 500
        { "id" => SecureRandom.uuid, "label" => label, "expected" => expected }
      end
    end
    private_class_method :normalize_criteria

    def self.normalize_results(packet, results)
      unless results.is_a?(Array) && results.length == packet.criteria.length
        raise Unavailable, "Record one result for every criterion."
      end
      expected_ids = packet.criteria.map { |criterion| criterion.fetch("id") }
      normalized = results.map do |result|
        criterion_id = result[:criterion_id].to_s
        outcome = result[:outcome].to_s
        evidence = result[:evidence].to_s.strip
        raise Unavailable, "Choose pass or fail for every criterion." unless %w[passed failed].include?(outcome)
        raise Unavailable, "Add evidence for every criterion." if evidence.blank? || evidence.length > 1_000
        { "criterion_id" => criterion_id, "outcome" => outcome, "evidence" => evidence }
      end
      ids = normalized.map { |result| result.fetch("criterion_id") }
      raise Unavailable, "Criterion results do not match this review packet." unless ids.sort == expected_ids.sort && ids.uniq.length == ids.length

      normalized
    end
    private_class_method :normalize_results

    def self.authorize!(actor)
      raise Unavailable, "Owner access is required." unless actor&.active? && actor.platform_owner_access?
    end
    private_class_method :authorize!

    def self.audit(actor, action_code, outcome)
      PlatformAuditEvent.create!(actor_session_reference: "user:#{actor.id}", action_code:, outcome:, occurred_at: Time.current)
    end
    private_class_method :audit
  end
end
