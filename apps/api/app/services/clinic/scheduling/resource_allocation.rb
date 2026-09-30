module Clinic
  module Scheduling
    class ResourceAllocation
      def self.plan(practice:, site:, offering:, room:, starts_at:, ends_at:, appointment_id: nil, expected_revision: nil)
        policy = ResourceCompatibility.current(practice: practice, site: site, offering: offering)
        result = { site_id: site.id, service_offering_id: offering.id, revision: policy&.revision || 0,
          mode: policy&.mode || "unconfigured", compatible: false, reason: nil, chairs: [], equipment: [], selected_resource_ids: [] }
        return result.merge(reason: "Configure chair and equipment requirements for this service at this site.") unless policy
        if expected_revision && expected_revision != policy.revision
          return result.merge(reason: "Resource compatibility changed. Review the current configuration before saving.")
        end
        return result.merge(compatible: true) if policy.mode == "not_required"
        ids = policy.chair_ids + policy.equipment_ids
        resources = Resource.where(practice: practice, site: site, id: ids).index_by(&:id)
        busy = ResourceReservation.where(practice: practice, resource_id: ids, state: "active")
          .where("starts_at < ? AND ends_at > ?", ends_at, starts_at)
        busy = busy.where.not(appointment_id: appointment_id) if appointment_id
        busy_ids = busy.distinct.pluck(:resource_id)
        rows = ->(list, kind) { list.map { |id|
          resource = resources[id]
          context = resource && resource.active && resource.kind == kind && (resource.room_id.nil? || resource.room_id == room&.id)
          { id: id, name: resource&.name || "Unavailable resource", room_id: resource&.room_id,
            available: !!context && !busy_ids.include?(id) }
        } }
        result[:chairs] = rows.call(policy.chair_ids, "chair")
        result[:equipment] = rows.call(policy.equipment_ids, "equipment")
        chair = result[:chairs].find { |row| row[:available] }
        compatible = (policy.chair_ids.empty? || chair) && result[:equipment].all? { |row| row[:available] }
        result[:compatible] = !!compatible
        result[:reason] = "Configured chairs or equipment are unavailable for this room and interval." unless compatible
        result[:selected_resource_ids] = [chair&.dig(:id), *policy.equipment_ids].compact if compatible
        result
      end

      def self.snapshot!(**arguments)
        result = plan(**arguments)
        raise ArgumentError, result[:reason] unless result[:compatible]
        resources = Resource.where(practice: arguments[:practice], id: result[:selected_resource_ids]).order(:id)
        { "revision" => result[:revision], "mode" => result[:mode], "site_id" => result[:site_id],
          "service_offering_id" => result[:service_offering_id], "resources" => resources.map(&:snapshot) }
      end

      def self.reserve!(appointment:, snapshot:)
        return unless snapshot
        compatibility = ResourceCompatibility.find_by!(practice_id: appointment.practice_id, site_id: appointment.site_id,
          service_offering_id: appointment.service_offering_id, revision: snapshot.fetch("revision"))
        snapshot.fetch("resources").each do |resource|
          ResourceReservation.create!(practice: appointment.practice, appointment: appointment, resource_id: resource[:id] || resource["id"],
            resource_compatibility: compatibility, starts_at: appointment.starts_at, ends_at: appointment.ends_at)
        end
      end
      def self.release!(appointment:)
        ResourceReservation.where(practice: appointment.practice, appointment: appointment, state: "active")
          .update_all(state: "released", updated_at: Current.business_time)
      end
    end
  end
end
