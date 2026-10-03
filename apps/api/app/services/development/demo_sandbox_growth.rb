module Development
  class DemoSandboxGrowth
    PEOPLE = [
      [ "Maya Ellis", "community referral", "new", "phone" ],
      [ "Noah Rivera", "website", "contacted", "email" ],
      [ "Leila Brooks", "event", "qualified", "phone" ],
      [ "Owen Patel", "website", "new", "email" ],
      [ "Amara Chen", "community referral", "qualified", "email" ],
      [ "Eli Moreno", "phone inquiry", "contacted", "phone" ],
      [ "Nina Grant", "event", "declined", "email" ],
      [ "Theo Walker", "website", "new", "phone" ],
      [ "Iris Santos", "community referral", "qualified", "email" ]
    ].freeze

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      practices = run.practice.organization.practices.order(:id).to_a
      raise ArgumentError, "Sandbox growth needs two clinics" unless
        practices.length == 2 && practices.include?(run.practice)

      practices.each do |practice|
        versions = published_versions!(practice:, actor: run.operator_user)
        PEOPLE.each_with_index do |(name, source, status, contact_method), index|
          email = "sandbox-growth-#{practice.id}-#{index + 1}@example.test"
          prospect = Clinic::MembershipGrowth::CaptureProspect.call(
            practice:, version_id: versions.fetch(index % versions.length).id,
            selections: [], display_name: name, email_address: email,
            phone_number: contact_method == "phone" ? "512-555-#{2000 + index}" : nil,
            source:, outreach_consent: true,
            preferred_contact_method: contact_method,
            preferred_contact_time: contact_method == "phone" ? "Weekday afternoon" : nil,
            request_key: "sandbox-growth-#{practice.id}-#{index + 1}",
            require_storefront: false
          ).prospect
          actions = { "contacted" => [ "contacted" ], "qualified" => [ "qualify" ],
            "declined" => [ "decline" ] }.fetch(status, [])
          actions.each do |action|
            prospect = Clinic::MembershipGrowth::TransitionProspect.call(
              practice:, actor: run.operator_user, prospect_id: prospect.id,
              action:, lock_version: prospect.lock_version
            ).prospect
          end
        end

        3.times do |index|
          name = [ "Sofia Lane", "Caleb Nguyen", "Zara Bennett" ].fetch(index)
          key = "sandbox-signup-#{practice.id}-#{index + 1}"
          preserved = run.baseline.to_h.dig("sandbox_preserved_accounts", "signups")
          user = User.find(preserved.fetch(practice.id.to_s).fetch(key)) if preserved
          raise "Existing pending sandbox signup required" if user && (user.active? || user.admin? ||
            !user.email_address.start_with?("sandbox-signup-#{practice.id}-"))
          input = {
            practice:, version_id: versions.fetch(index % versions.length).id,
            selections: [], display_name: name,
            email_address: user ? user.email_address : "sandbox-signup-#{practice.id}-#{run.id}-#{index + 1}@example.test",
            phone_number: "512-555-#{3000 + index}", source: "membership signup",
            outreach_consent: true,
            request_key: key
          }
          birth_date = Date.new(1984 + index * 7, 4, 12).iso8601
          prospect = if user
            captured = Clinic::MembershipGrowth::CaptureProspect.call(**input, intent_type: "purchase").prospect
            captured.update!(account_user: user, date_of_birth: birth_date, follow_up_state: "open")
            captured
          else
            Clinic::MembershipGrowth::PrepareAccount.call(**input, date_of_birth: birth_date, deliver: false).prospect
          end
          prospect.update!(follow_up_due_at: Current.business_time - index.hours)
        end
      end
    end

    def self.published_versions!(practice:, actor:)
      if practice.name == "Sandbox Weight Management"
        site = practice.sites.order(:id).find do |candidate|
          features = Clinic::Configuration::PracticeFeatures.snapshot(practice:, site: candidate)
          features[:clinic_type] == "weight_loss" && Clinic::Configuration::StarterProfile.ready?(candidate, features)
        end
        raise ArgumentError, "Sandbox growth needs a finalized weight-management location." unless site

        Clinic::Care::SubscriptionCatalogTemplate.apply(practice:, actor:, site:)
        family = Clinic::Care::SubscriptionFamily.where(practice:, name: "Weight management").first!
        family = Clinic::Care::SubscriptionCatalog.save(practice:, actor:, kind: "family", id: family.id,
          attributes: { "publish" => true, "lock_version" => family.lock_version })
        packages = Clinic::Care::SubscriptionPackage.where(practice:, family:).order(:id).limit(3)
      else
        service = Clinic::Care::SubscriptionCatalog.save(practice:, actor:, kind: "service",
          attributes: { "name" => "Primary care visit", "description" => "Clinic visit and follow-up planning" })
        family = Clinic::Care::SubscriptionCatalog.save(practice:, actor:, kind: "family",
          attributes: { "name" => "Primary care", "description" => "Ongoing primary care", "display_order" => 10,
            "publish" => true })
        packages = [ [ "Everyday care", "79.00" ], [ "Wellness care", "119.00" ],
          [ "Family care", "159.00" ] ].map.with_index do |(name, amount), index|
          Clinic::Care::SubscriptionCatalog.save(practice:, actor:, kind: "package",
            attributes: { "name" => name, "family_id" => family.id,
              "draft" => { "currency" => "USD", "amount" => amount,
                "duration" => 1, "duration_unit" => "months", "renewal" => "manual",
                "terms" => "One month of clinic services. Renewal is manual.",
                "display_order" => (index + 1) * 10,
                "components" => [ { "service_id" => service.id, "mode" => "included",
                  "quantity" => index + 1, "frequency" => "month" } ] } })
        end
      end
      packages.map do |package|
        Clinic::Care::SubscriptionCatalog.publish(practice:, actor:, id: package.id,
          request_key: "sandbox-growth-package-#{package.id}", lock_version: package.lock_version)
      end
    end
    private_class_method :published_versions!
  end
end
