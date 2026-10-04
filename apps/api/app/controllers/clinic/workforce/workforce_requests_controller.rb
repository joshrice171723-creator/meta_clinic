require "digest"

module Clinic
  module Workforce
    class WorkforceRequestsController < Clinic::Workforce::BaseController
      REQUEST_CLASSES = [ AvailabilityVersion, TimeOffRequest, ShiftSwapRequest ].freeze

      def index
        if params[:review] == "true"
          site = site!
          workforce_access.authorize!("workforce.requests.review", site: site)
          requests = REQUEST_CLASSES.flat_map do |klass|
            scope = klass.where(practice_id: current_practice.id, site_id: site.id).where(status: review_states(klass))
            scope = request_details(scope, klass)
            scope.to_a
          end
          employment = nil
        else
          employment = workforce_access.own_employment
          raise Clinic::Authorization::Denied unless employment
          requests = AvailabilityVersion.where(practice_id: current_practice.id, employment_id: employment.id).includes(:site, employment: :staff_member).to_a +
            TimeOffRequest.where(practice_id: current_practice.id, employment_id: employment.id).includes(:site, employment: :staff_member).to_a +
            request_details(ShiftSwapRequest.where(practice_id: current_practice.id)
              .where("requester_employment_id = :id OR target_employment_id = :id", id: employment.id), ShiftSwapRequest).to_a
        end
        requests.sort_by!(&:created_at).reverse!
        sites = eligible_sites(employment)
        serialized = requests.map do |item|
          owner_id = item.respond_to?(:requester_employment_id) ? item.requester_employment_id : item.employment_id
          RequestSerializer.call(item).merge(can_target_decide: employment.present? && item.is_a?(ShiftSwapRequest) &&
            item.target_employment_id == employment.id && item.status == "submitted",
            can_cancel: employment.present? && owner_id == employment.id && %w[submitted accepted].include?(item.status))
        end
        render json: RequestSerializer.response(requests: serialized, sites: sites,
          swap_options: employment ? swap_options(employment, sites) : [])
      end

      def create_availability
        employment, site, values = own_request_context!("availability_editing_enabled")
        input = parameter_hash!(:availability, %i[site_id effective_from effective_until timezone reason idempotency_key],
          nested_arrays: { weekly_rules: %i[day_of_week start_time end_time available] })
        payload = input.to_h
        effective_from = date_param!(input[:effective_from], field: :effective_from)
        effective_until = input[:effective_until].present? ? date_param!(input[:effective_until], field: :effective_until) : nil
        raise ArgumentError, "Availability end date must be on or after its start date." if effective_until && effective_until < effective_from
        record, created = idempotent_create(AvailabilityVersion, input[:idempotency_key], payload, employment: employment) do |key, digest|
          status = values.fetch("availability_approval_required") == true ? "submitted" : "approved"
          AvailabilityVersion.transaction do
            AvailabilityVersion.where(practice_id: current_practice.id, site_id: site.id, employment_id: employment.id, status: "approved")
              .find_each do |prior|
                raise ArgumentError, "Availability cannot take effect before the current version." if effective_from < prior.effective_from
                prior.update!(status: "superseded",
                  effective_until: effective_from > prior.effective_from ? [ prior.effective_until, effective_from - 1.day ].compact.min : prior.effective_until,
                  revision: prior.revision + 1)
              end if status == "approved"
            AvailabilityVersion.create!(practice: current_practice, site: site, employment: employment,
              created_by_id: current_user.id, status: status, submitted_at: Current.business_time,
              effective_from: effective_from,
              effective_until: effective_until,
              timezone: required_string!(input[:timezone], field: :timezone, maximum: 80), weekly_rules: input[:weekly_rules].map(&:to_h),
              reason: reason!(input[:reason]), revision: 1, idempotency_key: key, request_digest: digest,
              decided_at: status == "approved" ? Current.business_time : nil)
          end
        end
        render json: RequestSerializer.response(request: RequestSerializer.call(record), replayed: !created), status: created ? :created : :ok
      end

      def create_time_off
        employment, site, values = own_request_context!("time_off_enabled")
        input = parameter_hash!(:time_off, %i[site_id local_start local_end start_occurrence end_occurrence timezone reason idempotency_key])
        record, created = idempotent_create(TimeOffRequest, input[:idempotency_key], input.to_h, employment: employment) do |key, digest|
          interval = ResolveLocalInterval.call(timezone: required_string!(input[:timezone], field: :timezone, maximum: 80),
            local_start: input[:local_start], local_end: input[:local_end], start_occurrence: input[:start_occurrence].presence || "only",
            end_occurrence: input[:end_occurrence].presence || "only")
          status = values.fetch("time_off_approval_required") == true ? "submitted" : "approved"
          TimeOffRequest.create!(practice: current_practice, site: site, employment: employment,
            requested_by_id: current_user.id, starts_at: interval[:starts_at], ends_at: interval[:ends_at],
            timezone: required_string!(input[:timezone], field: :timezone, maximum: 80), reason: reason!(input[:reason]),
            status: status, submitted_at: Current.business_time, decided_at: status == "approved" ? Current.business_time : nil,
            revision: 1, idempotency_key: key, request_digest: digest)
        end
        render json: RequestSerializer.response(request: RequestSerializer.call(record), replayed: !created), status: created ? :created : :ok
      end

      def create_swap
        employment, site, values = own_request_context!("shift_swaps_enabled")
        input = parameter_hash!(:shift_swap, %i[site_id schedule_publication_id offered_shift_public_id target_employment_id reason expires_at idempotency_key])
        publication = SchedulePublication.find_by!(practice_id: current_practice.id, site_id: site.id,
          id: requested_id!(input[:schedule_publication_id], :schedule_publication_id))
        latest = SchedulePublication.where(practice_id: current_practice.id, site_id: site.id,
          week_start_on: publication.week_start_on).latest_first.first
        raise ActiveRecord::StaleObjectError.new(publication, "request swap") unless latest.id == publication.id
        offered = publication.shift_snapshot.find { |row| row["id"] == input[:offered_shift_public_id] }
        raise ArgumentError, "The offered published shift is unavailable." unless offered && offered["employment_id"].to_i == employment.id
        target = Employment.find_by!(practice_id: current_practice.id, id: requested_id!(input[:target_employment_id], :target_employment_id))
        starts_at = Time.iso8601(offered.fetch("starts_at"))
        shift_end = Time.iso8601(offered.fetch("ends_at")) - Rational(1, 1_000_000)
        unless target.active_for_work?(at: starts_at) && target.active_for_work?(at: shift_end) &&
            target.eligible_site?(site, at: starts_at) && target.eligible_site?(site, at: shift_end)
          raise ArgumentError, "Target employee is not active or eligible for the full shift."
        end
        record, created = idempotent_create(ShiftSwapRequest, input[:idempotency_key], input.to_h, employment: employment) do |key, digest|
          ShiftSwapRequest.create!(practice: current_practice, site: site, requester_employment: employment,
            target_employment: target, requested_by_id: current_user.id, schedule_publication: publication,
            offered_shift_public_id: required_string!(input[:offered_shift_public_id], field: :offered_shift_public_id, maximum: 80),
            reason: reason!(input[:reason]), expires_at: input[:expires_at].present? ? time_param!(input[:expires_at], field: :expires_at) : nil,
            status: "submitted", submitted_at: Current.business_time, revision: 1, idempotency_key: key, request_digest: digest)
        end
        render json: RequestSerializer.response(request: RequestSerializer.call(record), replayed: !created,
          approval_required: values.fetch("shift_swap_approval_required")), status: created ? :created : :ok
      end

      def decision
        record = find_request!
        input = parameter_hash!(:decision, %i[decision reason expected_revision idempotency_key])
        result = DecideWorkforceRequest.call(request: record,
          decision: required_string!(input[:decision], field: :decision, maximum: 40), actor: current_user,
          access: workforce_access, expected_revision: input[:expected_revision],
          idempotency_key: required_string!(input[:idempotency_key], field: :idempotency_key, maximum: 120),
          reason: optional_string(input[:reason], field: :reason, maximum: 500))
        render json: RequestSerializer.response(request: RequestSerializer.call(result.request.reload), replayed: result.replayed,
          publication: result.publication && ScheduleSerializer.publication(result.publication))
      end

      private

      def own_request_context!(flag)
        employment = workforce_access.own_employment
        raise Clinic::Authorization::Denied unless employment&.active_for_work?(at: Current.business_time)
        site_id = params.dig(:availability, :site_id) || params.dig(:time_off, :site_id) || params.dig(:shift_swap, :site_id)
        site = site!(site_id)
        raise Clinic::Authorization::Denied unless employment.eligible_site?(site, at: Current.business_time)
        values = effective_settings(site)
        raise ArgumentError, "Employee requests are not enabled for this site." unless values.fetch("employee_self_service_enabled") == true
        raise ArgumentError, "This request type is not enabled for this site." unless values.fetch(flag) == true
        [ employment, site, values ]
      end

      def effective_settings(site)
        EffectiveSettings.call(practice: current_practice, site: site, at: Current.business_time).fetch(:values)
      end

      def site!(value = params[:site_id])
        current_practice.sites.find(requested_id!(value, :site_id))
      end

      def eligible_sites(employment)
        return [] unless employment
        employment.employment_sites.load
        sites = current_practice.sites.includes(:operating_hours).to_a
        settings_by_site = EffectiveSettings.for_sites(practice: current_practice, sites: sites, at: Current.business_time)

        sites.select { |site| employment.eligible_site?(site, at: Current.business_time) }.map do |site|
          values = settings_by_site.fetch(site.id).fetch(:values)
          { id: site.id.to_s, name: site.name, timezone: site.timezone_override || current_practice.timezone,
            request_options: %w[availability_editing_enabled time_off_enabled shift_swaps_enabled availability_approval_required time_off_approval_required shift_swap_approval_required].to_h { |key| [ key, values.fetch(key) ] } }
        end
      rescue EffectiveSettings::Unconfigured
        []
      end

      def idempotent_create(klass, key_value, payload, employment:)
        key = required_string!(key_value, field: :idempotency_key, maximum: 120)
        digest = Digest::SHA256.hexdigest(JSON.generate(payload.deep_stringify_keys.sort.to_h))
        existing = klass.find_by(practice_id: current_practice.id, idempotency_key: key)
        if existing
          authorize_create_replay!(existing, employment)
          raise Clinic::Idempotency::Conflict unless existing.request_digest == digest
          return [ existing, false ]
        end
        [ yield(key, digest), true ]
      rescue ActiveRecord::RecordNotUnique
        retry_record = klass.find_by!(practice_id: current_practice.id, idempotency_key: key)
        authorize_create_replay!(retry_record, employment)
        raise Clinic::Idempotency::Conflict unless retry_record.request_digest == digest
        [ retry_record, false ]
      end

      def authorize_create_replay!(record, employment)
        owner_id = record.is_a?(ShiftSwapRequest) ? record.requester_employment_id : record.employment_id
        actor_id = record.is_a?(AvailabilityVersion) ? record.created_by_id : record.requested_by_id
        raise Clinic::Authorization::Denied unless owner_id == employment.id && actor_id == current_user.id
      end

      def find_request!
        matches = REQUEST_CLASSES.filter_map { |klass| klass.find_by(practice_id: current_practice.id, public_id: params[:id]) }
        raise ActiveRecord::RecordNotFound unless matches.one?
        matches.first
      end

      def reason!(value)
        required_string!(value, field: :reason, maximum: 500)
      end

      def review_states(klass)
        klass == ShiftSwapRequest ? %w[accepted] : %w[submitted]
      end

      def request_details(scope, klass)
        if klass == ShiftSwapRequest
          scope.includes(:site, :schedule_publication, requester_employment: :staff_member, target_employment: :staff_member)
        else
          scope.includes(:site, employment: :staff_member)
        end
      end

      def swap_options(employment, sites)
        site_ids = sites.map { |site| site.fetch(:id).to_i }
        records_by_id = current_practice.sites.where(id: site_ids).index_by(&:id)
        latest_by_site = SchedulePublication.where(practice_id: current_practice.id, site_id: site_ids).latest_first.to_a
          .group_by { |publication| [ publication.site_id, publication.week_start_on ] }
          .transform_values(&:first).values.group_by(&:site_id)
        candidates = Employment.where(practice_id: current_practice.id).includes(:staff_member, :employment_sites, membership: :user).to_a

        sites.map do |site_payload|
          site = records_by_id.fetch(site_payload.fetch(:id).to_i)
          latest = latest_by_site.fetch(site.id, [])
          own_shifts = latest.flat_map do |publication|
            publication.shift_snapshot.select { |row| row["employment_id"].to_i == employment.id }.map do |row|
              { publication_id: publication.id.to_s, shift_id: row["id"], starts_at: row["starts_at"], ends_at: row["ends_at"], timezone: row["timezone"] }
            end
          end
          employees = candidates.select do |candidate|
            candidate.id != employment.id && candidate.active_for_work?(at: Current.business_time) && candidate.eligible_site?(site, at: Current.business_time)
          end.map { |candidate| { id: candidate.id.to_s, name: candidate.staff_member.display_name } }
          { site_id: site.id.to_s, shifts: own_shifts, employees: employees }
        end
      end
    end
  end
end
