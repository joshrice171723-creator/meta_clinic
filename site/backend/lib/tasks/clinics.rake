namespace :clinics do
  desc "Assign Test Clinic to existing generated local demo accounts without changing existing memberships"
  task prepare_test: :environment do
    abort "Development only." unless Rails.env.development?
    count = 0
    User.where(admin: false, active: true).where("email_address LIKE ?", "demo-%@example.invalid").find_each do |user|
      next unless user.email_address.match?(/\Ademo-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}@example\.invalid\z/)
      next if user.clinic_membership
      next unless user.paperworks.where(demo: true).exists? && !user.paperworks.where(demo: false).exists?

      Clinic::DemoSetup.create!(user)
      count += 1
    end
    puts "Assigned Test Clinic to #{count} existing synthetic demo account(s). Existing memberships were left unchanged."
  end
end
