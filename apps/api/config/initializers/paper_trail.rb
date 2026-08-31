# Fail a versioned write if its history cannot be saved. The default can log
# update/destroy version failures without raising them.
PaperTrail.config.version_error_behavior = :exception

# Models remain opt-in. Define tenant-scoped version storage and a reviewed
# attribute policy before adding has_paper_trail to any application model.
