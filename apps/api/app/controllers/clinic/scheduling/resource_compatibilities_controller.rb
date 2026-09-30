module Clinic
  module Scheduling
    class ResourceCompatibilitiesController < Clinic::ApiController
      def index
        site = selected_site
        require_capability_with_legacy("facilities.read", "appointments.read", site: site)
        policies = ResourceCompatibility.where(practice: current_practice, site: site).order(revision: :desc).to_a
          .uniq(&:service_offering_id)
        render json: { can_write: current_ability.allowed_permission?("facilities.write", site: site),
          resources: Resource.where(practice: current_practice, site: site).order(:name, :id).map(&:snapshot),
          rooms: site.rooms.where(kind: "physical").order(:code).map { |room| { id: room.id, code: room.code } },
          service_offerings: current_practice.service_offerings.joins(:sites).where(clinic_sites: { id: site.id }).distinct
            .order(:name).map { |offering| { id: offering.id, name: offering.name } }, policies: policies.map(&:snapshot) }
      end

      def availability
        site = selected_site
        require_capability_with_legacy("appointments.book", "appointments.write", site: site)
        offering = selected_offering(site)
        starts_at = Time.iso8601(params.require(:starts_at).to_s)
        ends_at = Time.iso8601(params.require(:ends_at).to_s)
        raise ArgumentError, "Choose a valid interval within 24 hours." unless ends_at > starts_at && ends_at - starts_at <= 24.hours
        room = params[:room_id].present? ? site.rooms.find(requested_id!(params[:room_id], :room_id)) : nil
        appointment = params[:appointment_id].present? ? current_practice.appointments.find(requested_id!(params[:appointment_id], :appointment_id)) : nil
        require_capability_with_legacy("appointments.book", "appointments.write", site: appointment.site) if appointment
        render json: ResourceAllocation.plan(practice: current_practice, site: site, offering: offering, room: room,
          starts_at: starts_at, ends_at: ends_at, appointment_id: appointment&.id)
      end

      def create_resource
        mutate_resource
      end
      def update_resource
        mutate_resource
      end

      def update_policy
        site = selected_site
        offering = selected_offering(site, validate_site: false)
        input = parameter_hash!(:compatibility, %i[expected_revision mode request_key], arrays: %i[chair_ids equipment_ids])
        revision = Integer(input[:expected_revision].to_s, 10)
        raise ArgumentError, "Choose a valid current revision." if revision.negative?
        mode = input[:mode].to_s
        raise ArgumentError, "Explicitly choose required or not required." unless %w[required not_required].include?(mode)
        chairs = resource_ids(input[:chair_ids])
        equipment = resource_ids(input[:equipment_ids])
        if mode == "not_required" && (chairs.any? || equipment.any?) || mode == "required" && (chairs + equipment).empty?
          raise ArgumentError, "Required mode needs resources; not-required mode must have none."
        end
        authorize = -> { Authorization.authorize!(actor: current_user, practice: current_practice, action: "facilities.write", site: site) }
        outcome = Clinic::Idempotency.execute(practice: current_practice, actor: current_user,
          operation_code: "scheduling.resource_compatibility", request_key: input[:request_key], authorization: authorize,
          authorization_action: "facilities.write", result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) { ResourceCompatibility.find_by(practice: practice, id: receipt.resource_id) },
          payload: { site_id: site.id, service_offering_id: offering.id, expected_revision: revision, mode: mode, chair_ids: chairs, equipment_ids: equipment }) do
          current_practice.lock!
          site.lock!
          offering.lock!
          membership = authorize.call
          raise ArgumentError, "Choose a service offering at this site." unless offering.sites.exists?(id: site.id)
          previous = ResourceCompatibility.current(practice: current_practice, site: site, offering: offering)
          raise ActiveRecord::StaleObjectError.new(site, "resource compatibility") unless (previous&.revision || 0) == revision
          [[chairs, "chair"], [equipment, "equipment"]].each do |ids, kind|
            unless Resource.where(practice: current_practice, site: site, id: ids, kind: kind, active: true).count == ids.length
              raise ArgumentError, "Choose active resources of the matching kind at this site."
            end
          end
          ResourceCompatibility.create!(practice: current_practice, site: site, service_offering: offering,
            written_by_membership: membership, revision: revision + 1, mode: mode, chair_ids: chairs, equipment_ids: equipment)
        end
        render json: { policy: (outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)).snapshot }
      end

      private

      def selected_site
        current_practice.sites.find(requested_id!(params[:site_id], :site_id))
      end
      def selected_offering(site, validate_site: true)
        offering = current_practice.service_offerings.find(requested_id!(params[:offering_id], :offering_id))
        raise ArgumentError, "Choose a service offering at this site." if validate_site && !offering.sites.exists?(id: site.id)
        offering
      end
      def resource_ids(value)
        ids = Array(value).map { |id| Integer(id.to_s, 10) }
        raise ArgumentError, "Choose distinct valid resources." if ids.any? { |id| id <= 0 } || ids.uniq.length != ids.length
        ids.sort
      end
      def mutate_resource
        site = selected_site
        input = parameter_hash!(:resource, %i[name kind room_id active expected_version request_key])
        resource = params[:resource_id].present? ? Resource.find_by!(practice: current_practice, site: site, id: requested_id!(params[:resource_id], :resource_id)) : nil
        room = input[:room_id].present? ? site.rooms.find(requested_id!(input[:room_id], :room_id)) : nil
        attributes = { name: input[:name].to_s.strip, kind: input[:kind].to_s, room: room }
        attributes[:active] = boolean_param(input[:active], field: :active) if resource
        version = resource ? Integer(input[:expected_version].to_s, 10) : nil
        authorize = -> { Authorization.authorize!(actor: current_user, practice: current_practice, action: "facilities.write", site: site) }
        outcome = Clinic::Idempotency.execute(practice: current_practice, actor: current_user,
          operation_code: resource ? "scheduling.resources.update" : "scheduling.resources.create", request_key: input[:request_key],
          resource: resource, authorization: authorize, authorization_action: "facilities.write", result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) { Resource.find_by(practice: practice, id: receipt.resource_id) },
          payload: { site_id: site.id, resource_id: resource&.id, expected_version: version, name: attributes[:name], kind: attributes[:kind], room_id: room&.id, active: attributes[:active] }) do
          current_practice.lock!
          site.lock!
          authorize.call
          if resource
            resource.lock!
            raise ActiveRecord::StaleObjectError.new(resource, "resource") unless resource.lock_version == version
            if (resource.kind != attributes[:kind] || resource.room_id != room&.id) && ResourceReservation.where(resource: resource).exists?
              raise ArgumentError, "A previously reserved resource keeps its kind and room. Retire it and create a new resource."
            end
            resource.update!(attributes)
            resource
          else
            Resource.create!(attributes.merge(practice: current_practice, site: site))
          end
        end
        render json: { resource: (outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)).snapshot }
      end
    end
  end
end
