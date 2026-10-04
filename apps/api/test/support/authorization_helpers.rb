module AuthorizationHelpers
  def configure_site!(site, membership:, services: [], effective_from: Time.utc(2026, 1, 1))
    features = {
      "clinic_type" => "primary_care", "insurance_workflows" => false,
      "service_scope" => services, "selected_services" => services, "assessment_scope" => [],
      "finalized_at" => effective_from.iso8601(6), "finalized_by_membership_id" => membership.id
    }
    Clinic::PracticeFeatureVersion.create!(practice: site.practice, site: site,
      created_by_membership: membership, revision: 1, effective_from: effective_from,
      optional_features: features, request_key: "synthetic-test-site-profile-#{site.id}",
      content_digest: Digest::SHA256.hexdigest(features.to_json))
  end

  def grant_permissions!(membership, *action_codes, scope_kind: "practice", site: nil, effective_from: 1.minute.ago, effective_until: nil)
    role = RoleVersion.create!(role_code: "test-#{SecureRandom.hex(8)}", version: 1)
    action_codes.each do |action_code|
      permission = Permission.find_or_create_by!(action_code: action_code)
      RoleVersionPermission.create!(role_version: role, permission: permission)
    end
    membership.role_grants.create!(practice: membership.practice, role_version: role, scope_kind: scope_kind, site: site,
      effective_from: effective_from, effective_until: effective_until, revision: 1)
  end

  def permission_grant!(membership, action_code)
    membership.role_grants.includes(role_version: :permissions).find do |grant|
      grant.role_version.permissions.any? { |permission| permission.action_code == action_code }
    end || raise("Missing test permission grant: #{action_code}")
  end

  def set_permission!(membership, action_code, enabled)
    grant = permission_grant!(membership, action_code)
    grant.update!(revoked_at: enabled ? nil : Time.current, revision: grant.revision + 1)
  end

  def revoke_all_permissions!(membership)
    membership.role_grants.active.to_a.each do |grant|
      grant.update!(revoked_at: Time.current, revision: grant.revision + 1)
    end
  end
end
