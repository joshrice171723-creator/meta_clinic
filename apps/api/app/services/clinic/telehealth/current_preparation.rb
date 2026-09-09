module Clinic
  module Telehealth
    module CurrentPreparation
      module_function

      def call(visit:, at: Time.current, include_verification: true, rule: nil, checkin: nil, consent: nil, preloaded: false)
        participant = if visit.participants.loaded?
          visit.participants.find(&:patient?)
        else
          visit.participants.find_by(role: "patient")
        end
        checkin = latest_checkin(visit) unless preloaded
        consent = latest_consent(visit, participant) unless preloaded
        verification = include_verification && checkin && Clinic::AuditResourceManifest.joins(:audit_event).where(
          clinic_audit_events: { practice_id: visit.practice_id, action_code: "telehealth.preparation.verify", outcome: "committed" },
          protected_resource_version_ref: "telehealth-checkin:#{checkin.id}"
        ).order(id: :desc).first
        reasons = []
        policy = visit.policy_version
        reasons << "checkin_required" unless checkin
        reasons << "checkin_expired" if checkin && checkin.submitted_at < at - policy.checkin_max_age_minutes.minutes
        reasons << "location_required" if checkin && policy.require_location? && checkin.location_payload.blank?
        reasons << "location_attestation_required" if checkin && policy.require_location? && !checkin.location_attested?
        reasons << "callback_required" if checkin && policy.require_callback? && checkin.callback_phone.blank?
        if checkin
          devices = checkin.device_results.to_h.stringify_keys
          audio_only = ActiveModel::Type::Boolean.new.cast(devices["audio_only_requested"])
          reasons << "browser_unsupported" unless devices["browser"] == "supported"
          reasons << "microphone_unavailable" unless devices["microphone"] == "passed"
          reasons << "speaker_unavailable" unless devices["speaker"] == "passed"
          reasons << "camera_unavailable" unless audio_only && policy.allow_audio_only? || devices["camera"] == "passed"
          rule ||= matching_rule(visit)
          region_code = checkin.location&.fetch("region_code", nil).to_s.upcase
          if region_code.present? && (!rule&.enabled? || !Array(rule.allowed_region_codes).map(&:upcase).include?(region_code))
            reasons << "region_ineligible"
          end
        end
        reasons << "telehealth_consent_required" unless consent&.accepted? && consent.policy_version_id == policy.id &&
          consent.policy_content_digest == policy.content_digest
        {
          participant: participant, checkin: checkin, consent: consent, verification: verification,
          complete: reasons.empty?, verified: verification.present?, reasons: reasons
        }
      end

      def queue_for(visits, at: Time.current)
        values = visits.to_a
        rules = queue_rules(values)
        checkins = queue_checkins(values)
        consents = queue_consents(values)
        values.to_h do |visit|
          key = [ visit.practice_id, visit.appointment.visit_type_id, visit.appointment.site_id ]
          [ visit.id, call(visit: visit, at: at, include_verification: false, rule: rules[key],
            checkin: checkins[visit.id], consent: consents[visit.participants.find(&:patient?)&.id], preloaded: true) ]
        end
      end

      def queue_checkins(visits)
        return {} if visits.empty?

        table = Checkin.quoted_table_name
        visit_table = Visit.quoted_table_name
        Checkin.joins("INNER JOIN #{visit_table} queue_visits ON queue_visits.id = #{table}.visit_id")
          .where(visit_id: visits.map(&:id))
          .where("#{table}.access_generation = queue_visits.access_generation")
          .select("DISTINCT ON (#{table}.visit_id) #{table}.*")
          .order(Arel.sql("#{table}.visit_id, #{table}.sequence DESC, #{table}.id DESC"))
          .index_by(&:visit_id)
      end

      def queue_consents(visits)
        participant_ids = visits.filter_map { |visit| visit.participants.find(&:patient?)&.id }
        return {} if participant_ids.empty?

        table = Consent.quoted_table_name
        Consent.where(participant_id: participant_ids, purpose: "telehealth")
          .select("DISTINCT ON (#{table}.participant_id) #{table}.*")
          .order(Arel.sql("#{table}.participant_id, #{table}.sequence DESC, #{table}.id DESC"))
          .index_by(&:participant_id)
      end

      def latest_checkin(visit)
        return visit.checkins.select { |value| value.access_generation == visit.access_generation }
          .max_by { |value| [ value.sequence, value.id ] } if visit.checkins.loaded?

        visit.checkins.where(access_generation: visit.access_generation).order(sequence: :desc).first
      end

      def latest_consent(visit, participant)
        return unless participant

        if visit.consents.loaded?
          return visit.consents.select { |value| value.participant_id == participant.id && value.telehealth? }
            .max_by { |value| [ value.sequence, value.id ] }
        end

        visit.consents.where(participant_id: participant.id, purpose: "telehealth").order(sequence: :desc).first
      end

      def matching_rule(visit)
        VisitTypeRule.where(practice_id: visit.practice_id, visit_type_id: visit.appointment.visit_type_id)
          .find_by(site_id: visit.appointment.site_id) ||
          VisitTypeRule.where(practice_id: visit.practice_id, visit_type_id: visit.appointment.visit_type_id)
            .find_by(site_id: nil)
      end

      def queue_rules(visits)
        return {} if visits.empty?

        practice_ids = visits.map(&:practice_id).uniq
        visit_type_ids = visits.map { |visit| visit.appointment.visit_type_id }.uniq
        site_ids = visits.map { |visit| visit.appointment.site_id }.uniq
        rules = VisitTypeRule.where(practice_id: practice_ids, visit_type_id: visit_type_ids, site_id: site_ids + [ nil ]).to_a
        rules.each_with_object({}) do |rule, values|
          values[[ rule.practice_id, rule.visit_type_id, rule.site_id ]] = rule
        end.then do |by_key|
          visits.each_with_object({}) do |visit, values|
            base = [ visit.practice_id, visit.appointment.visit_type_id ]
            values[base + [ visit.appointment.site_id ]] = by_key[base + [ visit.appointment.site_id ]] || by_key[base + [ nil ]]
          end
        end
      end
    end
  end
end
