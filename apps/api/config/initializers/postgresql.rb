if Rails.env.production?
  required = %w[PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD]
  missing = required.reject { |key| ENV[key].present? }
  raise "Explicit PostgreSQL configuration required: #{missing.join(', ')}" if missing.any?
  raise "DATABASE_PATH is obsolete; PostgreSQL is required" if ENV["DATABASE_PATH"].present?
end
