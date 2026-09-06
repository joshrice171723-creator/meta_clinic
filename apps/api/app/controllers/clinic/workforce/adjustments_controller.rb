module Clinic
  module Workforce
    class AdjustmentsController < Clinic::Workforce::BaseController
      def index
        scope, site_id = readable_adjustments
        render json: {
          adjustments: scope.includes(:timecard_version).order(requested_at: :desc)
            .map { |adjustment| TimecardSerializer.adjustment(adjustment) },
          site_id: site_id
        }
      end

      def create
        card = TimecardVersion.where(practice_id: current_practice.id).find(requested_id!(params[:timecard_version_id], :timecard_version_id))
        expected = Integer(params.require(:source_lock_version))
        raise ActiveRecord::StaleObjectError.new(card, "request correction") unless card.lock_version == expected
        changes = params.require(:proposed_changes).permit(:source_segment_id, :site_id, :started_at_utc, :ended_at_utc).to_h
        correction_type = params.require(:correction_type).to_s
        if correction_type != "remove_segment" && changes["site_id"].blank?
          inferred_site_id = card.time_segments.order(:started_at_utc).pick(:site_id) ||
            Punch.where(practice_id: card.practice_id, employment_id: card.employment_id,
              local_date: card.period_start..card.period_end).order(:occurred_at_utc).pick(:site_id)
          changes["site_id"] = inferred_site_id if inferred_site_id
        end
        if correction_type == "add_segment" &&
            (card.unresolved_exceptions.include?("missing_clock_out") || card.unresolved_exceptions.include?("missing_break_end"))
          open_punch = Punch.where(practice_id: card.practice_id, employment_id: card.employment_id,
            local_date: (card.period_start - 1.day)..card.period_end).order(occurred_at_utc: :desc, id: :desc).first
          changes["resolves_open_punch_id"] = open_punch.id if open_punch&.event_type.in?(%w[clock_in break_start break_end])
        end
        authorize_request!(card, site_id: changes["site_id"])
        reason = params.require(:reason).to_s.strip
        request_key = params.require(:request_key).to_s
        payload_digest = Digest::SHA256.hexdigest(JSON.generate(
          card_id: card.id, correction_type: correction_type, proposed_changes: changes.sort.to_h, reason: reason
        ))
        prior = AdjustmentRequest.find_by(practice_id: current_practice.id, request_key: request_key)
        if prior
          raise Clinic::Idempotency::Conflict unless prior.payload_digest == payload_digest
          return render json: { adjustment: TimecardSerializer.adjustment(prior), replayed: true }
        end
        adjustment = AdjustmentRequest.create!(
          practice: current_practice,
          employment: card.employment,
          timecard_version: card,
          correction_type: correction_type,
          proposed_changes: changes,
          reason: reason,
          requested_by_membership: clinic_membership,
          requested_at: Current.business_time,
          request_key: request_key,
          payload_digest: payload_digest,
          source_lock_version: card.lock_version
        )
        render json: { adjustment: TimecardSerializer.adjustment(adjustment), replayed: false }, status: :created
      end

      def decide
        adjustment = AdjustmentRequest.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        authorize_review!(adjustment.timecard_version, fallback_site_id: adjustment.proposed_changes["site_id"])
        result = DecideAdjustment.call(
          adjustment: adjustment,
          reviewer: clinic_membership,
          decision: params.require(:decision).to_s,
          decision_reason: params.require(:decision_reason),
          expected_lock_version: params.require(:lock_version)
        )
        render json: { adjustment: TimecardSerializer.adjustment(result) }
      end

      private

      def readable_adjustments
        own = workforce_access.own_employment
        if params[:view] == "self"
          raise Clinic::Authorization::Denied unless own
          authorize_self_service!(own)
          return [ AdjustmentRequest.where(practice_id: current_practice.id, employment_id: own.id), nil ]
        end
        return [ AdjustmentRequest.where(practice_id: current_practice.id), nil ] if workforce_access.allow?("workforce.timecards.review")

        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        workforce_access.authorize!("workforce.timecards.review", site: site)
        base = AdjustmentRequest.where(practice_id: current_practice.id)
        segment_ids = base.joins(timecard_version: :time_segments)
          .where(clinic_workforce_time_segments: { site_id: site.id }).select(:id)
        scope = base.where(id: segment_ids).or(base.where("proposed_changes ->> 'site_id' = ?", site.id.to_s))
        [ scope, site.id ]
      end

      def authorize_request!(card, site_id: nil)
        if workforce_access.own_employment&.id == card.employment_id
          authorize_self_service!(card.employment, card: card, fallback_site_id: site_id)
          return
        end
        authorize_review!(card, fallback_site_id: site_id)
      end

      def authorize_review!(card, fallback_site_id: nil)
        return workforce_access.authorize!("workforce.timecards.review") if workforce_access.allow?("workforce.timecards.review")
        site_ids = card.time_segments.distinct.pluck(:site_id)
        site_ids << requested_id!(fallback_site_id, :site_id) if site_ids.empty? && fallback_site_id.present?
        raise Clinic::Authorization::Denied if site_ids.empty?
        raise Clinic::Authorization::Denied if site_ids.uniq.many?
        site_ids.each do |site_id|
          workforce_access.authorize!("workforce.timecards.review", site: current_practice.sites.find(site_id))
        end
      end

      def authorize_self_service!(employment, card: nil, fallback_site_id: nil)
        site_ids = card&.time_segments&.distinct&.pluck(:site_id) || []
        site_ids << requested_id!(fallback_site_id, :site_id) if site_ids.empty? && fallback_site_id.present?
        if site_ids.empty?
          site_ids = employment.employment_sites.active.effective_at(Current.business_time).pluck(:site_id)
        end
        raise Clinic::Authorization::Denied if site_ids.empty?
        enabled = current_practice.sites.where(id: site_ids).all? do |site|
          EffectiveSettings.call(practice: current_practice, site: site).fetch(:values)
            .fetch("employee_self_service_enabled", false)
        end
        raise Clinic::Authorization::Denied unless enabled
      end
    end
  end
end
