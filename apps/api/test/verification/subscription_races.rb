raise "Subscription scratch database required" unless Rails.env.test? && ApplicationRecord.connection_db_config.database.start_with?("apply_subscription_verify_")

if ENV["APPLY_SUBSCRIPTION_RESTORE_CHECK"] == "1"
  agreement = Clinic::Care::SubscriptionAgreement.sole
  raise "Restored purchase is inconsistent" unless agreement.current_state == "refunded" && agreement.invoice.payment_allocations.count == 1 && Clinic::BillingReceipt.where(invoice: agreement.invoice).count == 2
  begin
    agreement.update_columns(amount: 1)
    raise "Restored immutable history can be edited"
  rescue ActiveRecord::StatementInvalid
    puts "PASS: payment, refund, receipts and immutable history survive backup/restore"
  end
  exit
end

def race
  ready, start = Queue.new, Queue.new
  threads = 2.times.map do
    Thread.new do
      ApplicationRecord.connection_pool.with_connection do
        ready << true
        start.pop
        yield
      end
    end
  end
  2.times { ready.pop }
  2.times { start << true }
  threads.map(&:value)
end

practice = Clinic::Practice.create!(name: "Dev seed subscription race clinic")
actor = User.create!(email_address: "subscription-race-staff@example.invalid", password: SecureRandom.hex(20))
membership = practice.memberships.create!(user: actor)
%w[subscription_catalog.publish billing.payment_record].each do |action|
  permission = Permission.find_or_create_by!(action_code: action)
  role = RoleVersion.create!(role_code: "subscription-race-#{action}", version: 1)
  RoleVersionPermission.create!(role_version: role, permission: permission)
  membership.role_grants.create!(practice: practice, role_version: role, scope_kind: "practice", effective_from: 1.minute.ago, revision: 1)
end
patient = practice.patients.create!(display_name: "Dev seed race patient", reference: "SUB-RACE")
user = User.create!(email_address: "subscription-race-patient@example.invalid", password: SecureRandom.hex(20))
identity = Clinic::PatientPortal::Identity.create!(practice: practice, patient: patient, user: user, status: "active", invited_at: Time.current, activated_at: Time.current)
family = Clinic::Care::SubscriptionFamily.create!(practice: practice, name: "Any family")
service = Clinic::Care::ServiceOption.create!(practice: practice, name: "Any service")
package = Clinic::Care::SubscriptionPackage.create!(practice: practice, family: family, name: "Any package",
  draft: { amount: "10.25", currency: "USD", duration: 1, duration_unit: "months", terms: "One term, no automatic renewal.", components: [ { service_id: service.id, mode: "included" } ] })
version = Clinic::Care::SubscriptionCatalog.publish(practice: practice, actor: actor, id: package.id, request_key: "publish", lock_version: 0)
ids = race do
  Clinic::Care::SubscriptionPurchase.checkout(identity: identity, actor: User.find(user.id), version_id: version.id, selections: [], request_key: "same-checkout").id
end
raise "Concurrent checkout duplicated" unless ids.uniq.one? && patient.invoices.count == 1
agreement = Clinic::Care::SubscriptionAgreement.find(ids.first)
intents = race do
  Clinic::Billing::SubscriptionPayments.start(agreement: Clinic::Care::SubscriptionAgreement.find(agreement.id), actor: User.find(user.id), request_key: "same-payment").id
end
raise "Concurrent collection duplicated" unless intents.uniq.one?
race do
  Clinic::Billing::SubscriptionPayments.deliver_fixture(agreement: Clinic::Care::SubscriptionAgreement.find(agreement.id), actor: User.find(actor.id), outcome: "succeeded", request_key: "same-event")
end
raise "Concurrent payment duplicated" unless agreement.reload.current_state == "active" && agreement.invoice.payment_allocations.count == 1
race do
  Clinic::Billing::SubscriptionPayments.refund(agreement: Clinic::Care::SubscriptionAgreement.find(agreement.id), actor: User.find(actor.id), amount: "10.25", request_key: "same-refund")
end
agreement.reload
raise "Concurrent refund inconsistent: #{agreement.current_state}, refunds=#{Clinic::RefundEvent.where(practice: practice).count}" unless agreement.current_state == "refunded" && Clinic::RefundEvent.where(practice: practice).count == 1
puts "PASS: independent connections produce one purchase, collection intent, payment and refund"
