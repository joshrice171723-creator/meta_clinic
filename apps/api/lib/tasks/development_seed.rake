require "fileutils"
require "logger"

namespace :dev do
  desc "Refresh local dev seed data once per calendar day"
  task refresh_seed: :environment do
    abort "dev:refresh_seed is available only in Rails development." unless Rails.env.development?
    abort "Refusing destructive seed refresh without APP_DEV_SEED_REFRESH=1." unless ENV["APP_DEV_SEED_REFRESH"] == "1"

    connection = ApplicationRecord.connection
    configured_database = ENV.fetch("APPLY_DEVELOPMENT_DATABASE", "apply_development")
    current_database = connection.select_value("SELECT current_database()")
    safe_database = current_database == configured_database &&
      current_database.end_with?("_development") &&
      !current_database.match?(/production|staging|test/i)
    abort "Refusing destructive seed refresh for database #{current_database.inspect}. Expected an explicitly configured *_development database." unless safe_database

    marker_path = Rails.root.join("tmp", "dev", "bulk-seed-refresh.marker")
    marker = "bulk_v1|#{current_database}|#{Time.zone.today.iso8601}"
    if File.file?(marker_path) && File.read(marker_path).strip == marker && Development::BulkDevSeed.ready?
      puts "Dev seed data already refreshed for #{Time.zone.today}."
      next
    end

    preserved_tables = %w[ar_internal_metadata schema_migrations]
    tables = connection.tables.map(&:to_s).reject { |table| preserved_tables.include?(table) }
    abort "No application tables were found; refusing to run a destructive refresh." if tables.empty?

    puts "Refreshing dev seed data in #{current_database}..."
    quoted_tables = tables.map { |table| connection.quote_table_name(table) }
    previous_rails_logger = Rails.logger
    previous_active_record_logger = ActiveRecord::Base.logger
    quiet_logger = Logger.new(File::NULL)
    begin
      Rails.logger = quiet_logger
      ActiveRecord::Base.logger = quiet_logger
      connection.execute("TRUNCATE TABLE #{quoted_tables.join(', ')} RESTART IDENTITY CASCADE")

      previous_seed_flag = ENV["APP_SYNTHETIC_SEEDS"]
      previous_profile = ENV["APP_DEV_SEED_PROFILE"]
      begin
        ENV["APP_SYNTHETIC_SEEDS"] = "1"
        ENV["APP_DEV_SEED_PROFILE"] = "bulk"
        Rake::Task["db:seed"].reenable
        Rake::Task["db:seed"].invoke
      ensure
        ENV["APP_SYNTHETIC_SEEDS"] = previous_seed_flag
        ENV["APP_DEV_SEED_PROFILE"] = previous_profile
      end
    ensure
      ActiveRecord::Base.logger = previous_active_record_logger
      Rails.logger = previous_rails_logger
    end

    FileUtils.mkdir_p(marker_path.dirname)
    File.write(marker_path, marker)
    puts "Dev seed data refreshed: 100 patients, 220 visits, 1,100 invoice lines, 100 office items, and 100 pharmacy products."
  end
end
