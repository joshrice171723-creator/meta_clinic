module Clinic
  module Workforce
    class TimecardsController < Clinic::Workforce::BaseController
      def index
        cards, site_id = readable_cards
        cards = cards.includes({ employment: :staff_member }, { time_segments: :site }, :adjustment_requests)
        next_timecard_before_id = nil
        if params[:view] == "self"
          cards, next_timecard_before_id = paginated_self_cards(cards)
        elsif params[:before_timecard_id].present?
          raise ArgumentError, "before_timecard_id is only available for your timecard history"
        else
          cards = cards.order(period_start: :desc, version_number: :desc, id: :desc).to_a
        end
        prepare_workflow_context(cards, site_id: site_id)
        employees = calculable_employments
        correction_sites = if params[:view] == "self"
          workforce_access.own_employment.sites.merge(EmploymentSite.active.effective_at(Current.business_time))
            .where(status: "active").distinct.order(:id).map do |site|
              { id: site.id, name: site.name, timezone: site.timezone_override.presence || current_practice.timezone }
            end
        else
          []
        end
        render json: {
          timecards: cards.map { |card| serialize_card(card, site_id: site_id) },
          employees: employees.map { |employment| { id: employment.id, name: employment.staff_member.display_name } },
          correction_sites: correction_sites,
          next_timecard_before_id: next_timecard_before_id,
          default_period_start: CalculateTimecard.current_period_start(practice: current_practice).iso8601
        }
      end

      def show
        card, site_id = readable_card
        render json: { timecard: serialize_card(card, site_id: site_id) }
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
        render json: { timecard: serialize_card(card, site_id: site_id) }, status: :created
      end

      def submit
        card, site_id = readable_card
        mode = approval_mode_for(card)
        authorize_submission!(card, mode)
        expected = Integer(params.require(:lock_version))
        card.employment.with_lock do
          card.lock!
          if card.status == "submitted"
            unless card.submitted_by_membership_id == clinic_membership.id && card.lock_version == expected + 1
              raise ActiveRecord::StaleObjectError.new(card, "submit")
            end
            next
          end
          raise ActiveRecord::StaleObjectError.new(card, "submit") unless card.lock_version == expected
          raise ArgumentError, "Only a draft timecard can be submitted" unless card.status == "draft"
          raise ArgumentError, "Resolve every timecard exception before submission" if card.unresolved?
          ensure_source_is_current!(card)
          card.update!(status: "submitted", submitted_at: Current.business_time, submitted_by_membership: clinic_membership)
        end
        render json: { timecard: serialize_card(card.reload, site_id: site_id) }
      end

      def approve
        card = TimecardVersion.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        authorize_approval!(card)
        expected = Integer(params.require(:lock_version))
        card.employment.with_lock do
          card.lock!
          if card.status == "approved"
            unless card.approved_by_membership_id == clinic_membership.id && card.lock_version == expected + 1
              raise ActiveRecord::StaleObjectError.new(card, "approve")
            end
            next
          end
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
        render json: { timecard: serialize_card(card.reload) }
      end

      private

      def serialize_card(card, site_id: nil)
        prepare_workflow_context([ card ], site_id: site_id) unless @workflow_settings
        TimecardSerializer.call(card, site_id: site_id,
          include_global_exceptions: @full_site_card_ids.key?(card.id)).merge(workflow: workflow_for(card))
      end

      def prepare_workflow_context(cards, site_id: nil)
        @workflow_settings_error = nil
        @full_site_card_ids = {}
        if site_id
          site = current_practice.sites.find(site_id)
          @full_site_card_ids = TimecardSiteScope.fully_at_site(scope: TimecardVersion.where(id: cards.map(&:id)), site: site)
            .pluck(:id).index_with(true)
        end
        sites = cards.flat_map { |card| card.time_segments.map(&:site) }.uniq
        @workflow_settings = EffectiveSettings.for_site_times(practice: current_practice,
          points: cards.flat_map { |card| card.time_segments.map { |segment| [ segment.site, segment.started_at_utc ] } })
        @latest_versions = TimecardVersion.where(practice_id: current_practice.id, employment_id: cards.map(&:employment_id))
          .group(:employment_id, :period_start).maximum(:version_number)
        @workflow_own_employment_id = workforce_access.own_employment&.id
        @workflow_practice_reviewer = workforce_access.allow?("workforce.timecards.review")
        @workflow_practice_approver = workforce_access.allow?("workforce.timecards.approve")
        @workflow_review_sites = sites.to_h { |site| [ site.id, @workflow_practice_reviewer || workforce_access.allow?("workforce.timecards.review", site: site) ] }
        @workflow_approve_sites = sites.to_h { |site| [ site.id, @workflow_practice_approver || workforce_access.allow?("workforce.timecards.approve", site: site) ] }
        @workflow_self_service_sites = EffectiveSettings.for_sites(practice: current_practice, sites: sites)
          .transform_values { |settings| settings.dig(:values, "employee_self_service_enabled") == true }
      rescue EffectiveSettings::Unconfigured => error
        @workflow_settings_error = error.message
      end

      def workflow_for(card)
        if card.time_segments.empty?
          return { approval_mode: nil, can_submit: false, can_approve: false,
            note: "No completed intervals are available. Add or correct missing time before submission." }
        end
        if @workflow_settings_error
          return { approval_mode: nil, can_submit: false, can_approve: false, note: @workflow_settings_error }
        end
        mode = approval_mode_for(card, settings_by_segment: @workflow_settings)
        sites = card.time_segments.map(&:site).uniq
        latest = @latest_versions[[ card.employment_id, card.period_start ]] == card.version_number
        reviewer = @workflow_practice_reviewer || (sites.any? && sites.all? { |site| @workflow_review_sites[site.id] })
        approver = @workflow_practice_approver || (sites.one? && @workflow_approve_sites[sites.first.id])
        own = @workflow_own_employment_id == card.employment_id
        employee_submission = mode == "employee_submit_manager_approve"
        pending_corrections = card.adjustment_requests.any? { |adjustment| adjustment.status == "submitted" }
        can_submit = latest && card.status == "draft" && !card.unresolved? && (employee_submission ? own : reviewer)
        if can_submit && employee_submission
          can_submit = sites.any? && sites.all? { |site| @workflow_self_service_sites[site.id] }
        end
        submission_valid = !employee_submission ||
          (card.submitted_by_membership_id == card.employment.membership_id && card.submitted_by_membership_id != clinic_membership.id)
        note = if !latest
          "A newer timecard version is available. Refresh and review that version."
        elsif card.unresolved?
          "Resolve the recorded exceptions before submitting or approving."
        elsif pending_corrections
          "Review pending correction requests before approval."
        elsif card.status == "draft" && employee_submission && !own
          "The employee must submit this timecard before manager approval."
        elsif card.status == "draft" && employee_submission && !can_submit
          "Employee self-service must be enabled at every timecard location before submission."
        elsif card.status == "draft" && !can_submit
          "An authorized timecard reviewer must submit this timecard."
        elsif card.status == "submitted" && employee_submission && !submission_valid
          "Employee submission and approval by a different manager are required."
        end
        { approval_mode: mode, can_submit: can_submit,
          can_approve: latest && card.status == "submitted" && !card.unresolved? && !pending_corrections && approver && submission_valid,
          note: note }
      rescue ArgumentError, EffectiveSettings::Unconfigured => error
        { approval_mode: nil, can_submit: false, can_approve: false, note: error.message }
      end

      def readable_cards
        own = workforce_access.own_employment
        if params[:view] == "self"
          own = workforce_access.authorize!("workforce.self")
          authorize_self_service!(own)
          return [ TimecardVersion.where(practice_id: current_practice.id, employment_id: own.id), nil ]
        end
        practice_reader = workforce_access.allow?("workforce.timecards.read")
        cards = TimecardVersion.where(practice_id: current_practice.id)
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id)) if params[:site_id].present? || !practice_reader
        if site
          workforce_access.authorize!("workforce.timecards.read", site: site)
          cards = TimecardSiteScope.call(scope: cards, site: site)
        end
        cards = cards.where(employment_id: requested_id!(params[:employment_id], :employment_id)) if params[:employment_id].present?
        [ cards, practice_reader ? nil : site.id ]
      end

      def paginated_self_cards(cards)
        cards = cards.order(period_start: :desc, version_number: :desc, id: :desc)
        if params[:before_timecard_id].present?
          cursor = cards.where(id: requested_id!(params[:before_timecard_id], :before_timecard_id))
            .pick(:period_start, :version_number, :id)
          raise ActiveRecord::RecordNotFound unless cursor

          period_start, version_number, id = cursor
          cards = cards.where(<<~SQL.squish, period_start:, version_number:, id:)
            clinic_workforce_timecard_versions.period_start < :period_start OR
            (clinic_workforce_timecard_versions.period_start = :period_start AND
              (clinic_workforce_timecard_versions.version_number < :version_number OR
                (clinic_workforce_timecard_versions.version_number = :version_number AND
                  clinic_workforce_timecard_versions.id < :id)))
          SQL
        end
        cards = cards.limit(51).to_a
        more = cards.length > 50
        cards = cards.first(50)
        [ cards, more ? cards.last.id.to_s : nil ]
      end

      def readable_card
        card = TimecardVersion.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        read_scope_for(card)
      end

      def read_scope_for(card)
        return [ card, nil ] if workforce_access.allow?("workforce.timecards.read")

        if params[:site_id].blank? && workforce_access.own_employment&.id == card.employment_id
          authorize_self_service!(card.employment, card: card)
          return [ card, nil ]
        end
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        workforce_access.authorize!("workforce.timecards.read", site: site)
        scoped = TimecardSiteScope.call(scope: TimecardVersion.where(id: card.id), site: site)
        raise Clinic::Authorization::Denied unless scoped.exists?
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

      def authorize_submission!(card, mode)
        if mode == "employee_submit_manager_approve"
          employment = workforce_access.authorize!("workforce.self")
          raise Clinic::Authorization::Denied unless employment.id == card.employment_id

          authorize_self_service!(employment, card: card)
          return
        end

        raise ArgumentError, "Unsupported timecard approval policy" unless mode == "manager_required"
        return workforce_access.authorize!("workforce.timecards.review") if workforce_access.allow?("workforce.timecards.review")

        site_ids = card.time_segments.distinct.pluck(:site_id)
        raise Clinic::Authorization::Denied if site_ids.empty?

        sites = current_practice.sites.where(id: site_ids).index_by(&:id)
        raise Clinic::Authorization::Denied unless sites.length == site_ids.length

        site_ids.each do |site_id|
          workforce_access.authorize!("workforce.timecards.review", site: sites.fetch(site_id))
        end
      end

      def ensure_source_is_current!(card)
        current = CalculateTimecard.current_source_digest(employment: card.employment, period_start: card.period_start)
        raise ActiveRecord::StaleObjectError.new(card, "approve") unless current == card.source_digest
      end

      def authorize_self_service!(employment, card: nil)
        sites = if card
          site_ids = card.time_segments.distinct.pluck(:site_id)
          if site_ids.empty?
            site_ids = Punch.where(practice_id: current_practice.id, employment_id: employment.id,
              id: Array(card.snapshot["source_punch_ids"])).distinct.pluck(:site_id)
          end
          if site_ids.empty?
            site_ids = employment.employment_sites.active.effective_at(Current.business_time).pluck(:site_id)
          end
          current_practice.sites.where(id: site_ids).to_a
        else
          employment.sites.merge(EmploymentSite.active.effective_at(Current.business_time)).where(status: "active").to_a
        end
        raise Clinic::Authorization::Denied if sites.empty?
        settings_by_site = EffectiveSettings.for_sites(practice: current_practice, sites: sites, at: Current.business_time)
        enabled = sites.all? { |site| settings_by_site.fetch(site.id).dig(:values, "employee_self_service_enabled") == true }
        raise Clinic::Authorization::Denied unless enabled
      end

      def approval_mode_for(card, settings_by_segment: nil)
        segments = card.time_segments.to_a
        settings_by_segment ||= EffectiveSettings.for_site_times(practice: current_practice,
          points: segments.map { |segment| [ segment.site, segment.started_at_utc ] })
        modes = segments.map do |segment|
          settings_by_segment.fetch([ segment.site_id, segment.started_at_utc.utc ])&.dig(:values, "approval_mode") || "unconfigured"
        end.uniq
        raise ArgumentError, "Timecard approval policy is unconfigured" if modes.empty? || modes.include?("unconfigured")
        raise ArgumentError, "Timecard locations have incompatible approval policies" unless modes.one?
        modes.first
      end
    end
  end
end
