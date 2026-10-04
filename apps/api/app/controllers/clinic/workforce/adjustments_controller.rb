module Clinic
  module Workforce
    class AdjustmentsController < Clinic::Workforce::BaseController
      def index
        scope, site_id = readable_adjustments
        render json: {
          adjustments: scope.includes(:timecard_version, employment: :staff_member).order(requested_at: :desc)
            .map { |adjustment| TimecardSerializer.adjustment(adjustment) },
          site_id: site_id
        }
      end

      def create
        card = TimecardVersion.where(practice_id: current_practice.id).find(requested_id!(params[:timecard_version_id], :timecard_version_id))
        expected = Integer(params.require(:source_lock_version))
        changes = params.require(:proposed_changes).permit(:source_segment_id, :site_id, :started_at_utc, :ended_at_utc).to_h
        correction_type = params.require(:correction_type).to_s
        reason = params.require(:reason).to_s.strip
        request_key = params.require(:request_key).to_s
        replayed = false
        adjustment = AdjustmentRequest.transaction do
          current_practice.lock!
          card.employment.with_lock do
            card.lock!
            prior = AdjustmentRequest.find_by(practice_id: current_practice.id, request_key: request_key)
            infer_changes!(card, changes, correction_type, prior: prior)
            authorize_request!(card, site_id: changes["site_id"])
            payload_digest = Digest::SHA256.hexdigest(JSON.generate(
              card_id: card.id, correction_type: correction_type, proposed_changes: changes.sort.to_h, reason: reason
            ))
            if prior
              unless prior.payload_digest == payload_digest && prior.source_lock_version == expected &&
                  prior.requested_by_membership_id == clinic_membership.id
                raise Clinic::Idempotency::Conflict
              end
              replayed = true
              next prior
            end
            raise ActiveRecord::StaleObjectError.new(card, "request correction") unless card.lock_version == expected
            AdjustmentRequest.create!(
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
          end
        end
        render json: { adjustment: TimecardSerializer.adjustment(adjustment), replayed: replayed }, status: replayed ? :ok : :created
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

      def infer_changes!(card, changes, correction_type, prior:)
        if correction_type != "remove_segment" && changes["site_id"].blank?
          inferred_site_id = prior&.proposed_changes&.fetch("site_id", nil) ||
            card.time_segments.order(:started_at_utc).pick(:site_id) ||
            Punch.where(practice_id: card.practice_id, employment_id: card.employment_id,
              local_date: card.period_start..card.period_end).order(:occurred_at_utc).pick(:site_id)
          changes["site_id"] = inferred_site_id if inferred_site_id
        end
        return unless correction_type == "add_segment"

        if prior
          resolved_id = prior.proposed_changes["resolves_open_punch_id"]
          changes["resolves_open_punch_id"] = resolved_id if resolved_id
        elsif card.unresolved_exceptions.intersect?(%w[missing_clock_out missing_break_end])
          open_punch = Punch.where(practice_id: card.practice_id, employment_id: card.employment_id,
            local_date: (card.period_start - 1.day)..card.period_end).order(occurred_at_utc: :desc, id: :desc).first
          changes["resolves_open_punch_id"] = open_punch.id if open_punch&.event_type.in?(%w[clock_in break_start break_end])
        end
      end

      def readable_adjustments
        own = workforce_access.own_employment
        if params[:view] == "self"
          raise Clinic::Authorization::Denied unless own
          authorize_self_service!(own)
          return [ AdjustmentRequest.where(practice_id: current_practice.id, employment_id: own.id), nil ]
        end
        practice_reviewer = workforce_access.allow?("workforce.timecards.review")
        base = AdjustmentRequest.where(practice_id: current_practice.id)
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id)) if params[:site_id].present? || !practice_reviewer
        if site
          workforce_access.authorize!("workforce.timecards.review", site: site)
          if practice_reviewer
            segment_ids = base.joins(timecard_version: :time_segments)
              .where(clinic_workforce_time_segments: { site_id: site.id }).select(:id)
            base = base.where(id: segment_ids).or(base.where("proposed_changes ->> 'site_id' = ?", site.id.to_s))
          else
            cards = TimecardSiteScope.call(scope: TimecardVersion.where(practice_id: current_practice.id), site: site)
            other_intervals = TimeSegment.where(practice_id: current_practice.id).where.not(site_id: site.id).select(:timecard_version_id)
            cards = cards.where.not(id: other_intervals)
            base = base.where(timecard_version_id: cards.select(:id))
              .where("proposed_changes ->> 'site_id' IS NULL OR proposed_changes ->> 'site_id' = ?", site.id.to_s)
          end
        end
        base = base.where(employment_id: requested_id!(params[:employment_id], :employment_id)) if params[:employment_id].present?
        [ base, site&.id ]
      end

      def authorize_request!(card, site_id: nil)
        return authorize_review!(card, fallback_site_id: site_id) if workforce_access.allow?("workforce.timecards.review")

        if workforce_access.own_employment&.id == card.employment_id
          authorize_self_service!(card.employment, card: card, fallback_site_id: site_id)
          return
        end
        authorize_review!(card, fallback_site_id: site_id)
      end

      def authorize_review!(card, fallback_site_id: nil)
        return workforce_access.authorize!("workforce.timecards.review") if workforce_access.allow?("workforce.timecards.review")
        site_ids = card.time_segments.distinct.pluck(:site_id)
        site_ids << requested_id!(fallback_site_id, :site_id) if fallback_site_id.present?
        raise Clinic::Authorization::Denied if site_ids.empty?
        raise Clinic::Authorization::Denied if site_ids.uniq.many?
        site_ids.each do |site_id|
          site = current_practice.sites.find(site_id)
          workforce_access.authorize!("workforce.timecards.review", site: site)
          unless TimecardSiteScope.call(scope: TimecardVersion.where(id: card.id), site: site).exists?
            raise Clinic::Authorization::Denied
          end
        end
      end

      def authorize_self_service!(employment, card: nil, fallback_site_id: nil)
        site_ids = card&.time_segments&.distinct&.pluck(:site_id) || []
        if card && site_ids.empty?
          site_ids = Punch.where(practice_id: current_practice.id, employment_id: employment.id,
            id: Array(card.snapshot["source_punch_ids"])).distinct.pluck(:site_id)
        end
        site_ids << requested_id!(fallback_site_id, :site_id) if fallback_site_id.present?
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
