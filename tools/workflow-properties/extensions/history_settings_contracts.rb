class WorkflowPropertyCase
  def history_settings_contract(input)
    if input.fetch("operation") == "document"
      patient = @practice.patients.create!(display_name: "Document property patient", reference: "DOC-PROP")
      category = Clinic::DocumentCategory.create!(practice: @practice, code: "PROP-DOC", name: "Property documents")
      document = Clinic::Document.create!(practice: @practice, patient: patient, category: category, object_key: "property/document",
        object_version: "1", checksum: "property-checksum", media_type: "text/plain", byte_size: 10, scan_state: input.fetch("state"))
      rejected = false
      error = nil
      begin
        downloaded = Clinic::Documents::Access.downloadable!(document: document, actor: @actor)
      rescue ArgumentError => failure
        rejected = true
        error = failure.message
      end
      return { rejected: rejected, error: error, returned_id: downloaded&.id, id: document.id, state: document.reload.scan_state }
    end
    klass = Clinic::Workforce::SettingsVersion
    values = klass::BOOLEAN_KEYS.to_h { |key| [key, false] }
    values.merge!(klass::NULLABLE_INTEGER_KEYS.to_h { |key| [key, nil] })
    values.merge!(klass::ENUMS.to_h { |key, _| [key, "unconfigured"] })
    values.merge!("timezone" => "America/Chicago", "workweek_start_day" => 1, "workweek_start_time" => "00:00",
      "break_paid" => nil, "provider_mapping" => {}, "kiosk_enabled" => input.fetch("enabled"))
    now = Current.business_time
    base = klass.create!(practice: @practice, created_by_membership: @membership, scope_kind: "practice", revision: 1,
      effective_from: now - 1.day, values: values)
    site = @practice.sites.create!(code: "SETTINGS", name: "Settings property site")
    if input.fetch("operation") == "inheritance"
      override = klass.create!(practice: @practice, created_by_membership: @membership, scope_kind: "site", site: site,
        revision: 1, effective_from: now - 1.hour, values: { "kiosk_enabled" => nil, "scanner_enabled" => true })
    else
      klass.create!(practice: @practice, created_by_membership: @membership, scope_kind: "practice", revision: 2,
        effective_from: now + input.fetch("minutes").minutes, values: values.merge("kiosk_enabled" => !input.fetch("enabled")))
    end
    effective = Clinic::Workforce::EffectiveSettings.call(practice: @practice, site: site, at: now)
    { enabled: effective[:values]["kiosk_enabled"], scanner: effective[:values]["scanner_enabled"],
      practice_version: effective[:versions][:practice][:id], base_id: base.id,
      timezone: effective[:values]["timezone"], unchanged: base.reload.values == values }
  end
end
