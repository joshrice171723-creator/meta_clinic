module Clinic
  module Workforce
    class TimecardsController < Clinic::Workforce::BaseController
      def index
        cards, site_id = readable_cards
        employees = calculable_employments
        render json: {
          timecards: cards.includes(employment: :staff_member).order(period_start: :desc, version_number: :desc)
            .map { |card| TimecardSerializer.call(card, site_id: site_id) },
          employees: employees.map { |employment| { id: employment.id, name: employment.staff_member.display_name } },
          default_period_start: CalculateTimecard.current_period_start(practice: current_practice).iso8601
        }
      end

      def show
        card, site_id = readable_card
        render json: { timecard: TimecardSerializer.call(card, site_id: site_id) }
      end

      def calculate
        employment = selected_employment_for_read
        period_start = params[:period_start].presence || CalculateTimecard.current_period_start(practice: current_practice)
        card = CalculateTimecard.call(
          employment: employment,
          period_start: period_start,
          actor_membership: clinic_membership,
          expected_source_digest: params[:expected_source_digest]
        )
        _, site_id = read_scope_for(card)
        render json: { timecard: TimecardSerializer.call(card, site_id: site_id) }, status: :created
      end

      def submit
        card, site_id = readable_card
        mode = approval_mode_for(card)
        if mode == "employee_submit_manager_approve" && workforce_access.own_employment&.id != card.employment_id
          raise Clinic::Authorization::Denied
        end
        expected = Integer(params.require(:lock_version))
        card.employment.with_lock do
          card.lock!
          raise ActiveRecord::StaleObjectError.new(card, "submit") unless card.lock_version == expected
          raise ArgumentError, "Only a draft timecard can be submitted" unless card.status == "draft"
          raise ArgumentError, "Resolve every timecard exception before submission" if card.unresolved?
          ensure_source_is_current!(card)
          card.update!(status: "submitted", submitted_at: Current.business_time, submitted_by_membership: clinic_membership)
        end
        render json: { timecard: TimecardSerializer.call(card.reload, site_id: site_id) }
      end

      def approve
        card = TimecardVersion.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        authorize_approval!(card)
        expected = Integer(params.require(:lock_version))
        card.employment.with_lock do
          card.lock!
          raise ActiveRecord::StaleObjectError.new(card, "approve") unless card.lock_version == expected
          raise ArgumentError, "Only a submitted timecard can be approved" unless card.status == "submitted"
          raise ArgumentError, "Resolve every timecard exception before approval" if card.unresolved?
          raise ArgumentError, "Review pending correction requests before approval" if card.adjustment_requests.where(status: "submitted").exists?
          mode = approval_mode_for(card)
          if mode == "employee_submit_manager_approve"
            raise ArgumentError, "This policy requires employee submission" unless card.submitted_by_membership_id == card.employment.membership_id
            raise ArgumentError, "The submitter cannot approve the same timecard" if card.submitted_by_membership_id == clinic_membership.id
          end
          ensure_source_is_current!(card)
          newer = TimecardVersion.where(practice_id: card.practice_id, employment_id: card.employment_id,
            period_start: card.period_start).where("version_number > ?", card.version_number).exists?
          raise ActiveRecord::StaleObjectError.new(card, "approve") if newer
          card.update!(status: "approved", approved_at: Current.business_time, approved_by_membership: clinic_membership)
        end
        render json: { timecard: TimecardSerializer.call(card.reload) }
      end

      private

      def readable_cards
        own = workforce_access.own_employment
        if params[:view] == "self"
          own = workforce_access.authorize!("workforce.self")
          authorize_self_service!(own)
          return [ TimecardVersion.where(practice_id: current_practice.id, employment_id: own.id), nil ]
        end
        return [ TimecardVersion.where(practice_id: current_practice.id), nil ] if workforce_access.allow?("workforce.timecards.read")

        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        workforce_access.authorize!("workforce.timecards.read", site: site)
        cards = TimecardVersion.where(practice_id: current_practice.id)
          .joins(:time_segments).where(clinic_workforce_time_segments: { site_id: site.id }).distinct
        cards = cards.where(employment_id: requested_id!(params[:employment_id], :employment_id)) if params[:employment_id].present?
        [ cards, site.id ]
      end

      def readable_card
        card = TimecardVersion.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        read_scope_for(card)
      end

      def read_scope_for(card)
        if workforce_access.own_employment&.id == card.employment_id
          authorize_self_service!(card.employment, card: card)
          return [ card, nil ]
        end
        return [ card, nil ] if workforce_access.allow?("workforce.timecards.read")

        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        workforce_access.authorize!("workforce.timecards.read", site: site)
        raise Clinic::Authorization::Denied unless card.time_segments.exists?(site_id: site.id)
        [ card, site.id ]
      end

      def selected_employment_for_read
        own = workforce_access.own_employment
        if own && params[:employment_id].blank?
          authorize_self_service!(own)
          return own
        end

        employment = Employment.where(practice_id: current_practice.id).find(requested_id!(params[:employment_id], :employment_id))
        return employment if workforce_access.allow?("workforce.timecards.review")
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        workforce_access.authorize!("workforce.timecards.review", site: site)
        raise Clinic::Authorization::Denied unless employment.eligible_site?(site)
        employment
      end

      def calculable_employments
        return [] if params[:site_id].blank?

        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        can_review = workforce_access.allow?("workforce.timecards.review") ||
          workforce_access.allow?("workforce.timecards.review", site: site)
        return [] unless can_review

        Employment.where(practice_id: current_practice.id).includes(:staff_member, :employment_sites, membership: :user).order(:id).select do |employment|
          employment.active_for_work? && employment.eligible_site?(site)
        end
      end

      def authorize_approval!(card)
        site_ids = card.time_segments.distinct.pluck(:site_id)
        return workforce_access.authorize!("workforce.timecards.approve") if workforce_access.allow?("workforce.timecards.approve")
        raise Clinic::Authorization::Denied unless site_ids.one?

        site = current_practice.sites.find(site_ids.first)
        workforce_access.authorize!("workforce.timecards.approve", site: site)
      end

      def ensure_source_is_current!(card)
        current = CalculateTimecard.current_source_digest(employment: card.employment, period_start: card.period_start)
        raise ActiveRecord::StaleObjectError.new(card, "approve") unless current == card.source_digest
      end

      def authorize_self_service!(employment, card: nil)
        sites = if card
          current_practice.sites.where(id: card.time_segments.distinct.select(:site_id)).to_a
        else
          employment.sites.merge(EmploymentSite.active.effective_at(Current.business_time)).where(status: "active").to_a
        end
        raise Clinic::Authorization::Denied if sites.empty?
        enabled = sites.all? do |site|
          EffectiveSettings.call(practice: current_practice, site: site).fetch(:values).fetch("employee_self_service_enabled", false)
        end
        raise Clinic::Authorization::Denied unless enabled
      end

      def approval_mode_for(card)
        modes = card.time_segments.includes(:site).map do |segment|
          EffectiveSettings.call(practice: current_practice, site: segment.site, at: segment.started_at_utc)
            .fetch(:values).fetch("approval_mode", "unconfigured")
        end.uniq
        raise ArgumentError, "Timecard approval policy is unconfigured" if modes.empty? || modes.include?("unconfigured")
        raise ArgumentError, "Timecard locations have incompatible approval policies" unless modes.one?
        modes.first
      end
    end
  end
end
