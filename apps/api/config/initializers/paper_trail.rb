# Fail a versioned write if its history cannot be saved. The default can log
# update/destroy version failures without raising them.
PaperTrail.config.version_error_behavior = :exception

# Models opt in through Clinic::Auditable or Clinic::AppendOnly.
# clinic_model_versions intentionally stores metadata without value snapshots.
