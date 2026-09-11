module Clinic
  module Authorization
    class PilotRoleCatalog
      VERSION = 8

      DEFINITIONS = {
        "workforce-employee" => {
          label: "Employee",
          permissions: []
        },
        "implementation-specialist" => {
          label: "Implementation Specialist (FDE)",
          permissions: %w[facilities.read facilities.write]
        },
        "clinic-administrator" => {
          label: "Clinic Administrator",
          permissions: (%w[
            patients.read patients.identity.read patients.write staff.read staff.write facilities.read facilities.write
            inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold inventory.release inventory.count
            inventory.configure inventory.transfer inventory.put_away procurement.read procurement.create procurement.submit
            procurement.approve recall.read recall.lock recall.dispose controlled.read controlled.count controlled.certify
            appointments.read appointments.write appointments.book appointments.status_transition encounters.write
            encounters.assign_provider intake.write notes.read notes.write notes.sign observations.write messages.write
            clinical_records.read medication_requests.write medication_administrations.write service_requests.write diagnoses.write
            procedures.write care_plans.write immunizations.write
            staff_messaging.read staff_messaging.send staff_messaging.create_conversation staff_messaging.acknowledge
            staff_messaging.transition staff_messaging.escalate staff_messaging.attach reminders.read reminders.write
            documents.read billing.read billing.write billing.invoice_draft billing.invoice_post billing.payment_record
            billing.catalog.manage roles.manage
            telehealth.read telehealth.prepare.read telehealth.prepare.verify telehealth.configure telehealth.reconcile
            workforce.admin workforce.settings workforce.badges workforce.timecards.read
            workforce.timecards.review workforce.timecards.approve workforce.schedule.read workforce.schedule.manage
            workforce.schedule.publish workforce.requests.review workforce.payroll.configure workforce.payroll.export
            subscription_catalog.read subscription_catalog.write subscription_catalog.publish
          ]).uniq
        },
        "billing-accounting" => {
          label: "Billing & Accounting",
          permissions: %w[patients.read patients.identity.read billing.read billing.write billing.invoice_draft
            billing.invoice_post billing.payment_record billing.cash_reconcile billing.catalog.manage documents.read]
        },
        "front-desk-coordinator" => {
          label: "Front Desk Coordinator",
          permissions: %w[patients.read patients.identity.read patients.write appointments.read appointments.write
            appointments.book appointments.status_transition encounters.write staff.read]
        },
        "clinician" => {
          label: "Clinician",
          permissions: %w[patients.read patients.write appointments.read appointments.write appointments.book
            appointments.status_transition encounters.write encounters.assign_provider intake.write notes.read
            notes.write notes.sign observations.write documents.read clinical_records.read
            medication_requests.write medication_administrations.write service_requests.write diagnoses.write procedures.write care_plans.write
            immunizations.write]
        },
        "clinical-staff" => {
          label: "Clinical Staff",
          permissions: %w[patients.read patients.identity.read patients.write appointments.read appointments.write
            appointments.book appointments.status_transition encounters.write encounters.assign_provider intake.write
            notes.read observations.write inventory.read staff.read messages.write clinical_records.read
            medication_requests.write medication_administrations.write service_requests.write procedures.write care_plans.write immunizations.write
            staff_messaging.read
            staff_messaging.send staff_messaging.create_conversation staff_messaging.acknowledge
            staff_messaging.transition staff_messaging.escalate staff_messaging.attach]
        },
        "inventory-coordinator" => {
          label: "Inventory Coordinator",
          permissions: %w[inventory.read inventory.catalog inventory.receive inventory.adjust inventory.hold
            inventory.release inventory.count inventory.configure inventory.transfer inventory.put_away
            procurement.read procurement.create procurement.submit procurement.approve recall.read
            recall.lock recall.dispose controlled.read controlled.count controlled.certify]
        },
        "records-viewer" => {
          label: "Records Viewer",
          permissions: %w[patients.read patients.identity.read appointments.read notes.read documents.read
            inventory.read staff.read billing.read clinical_records.read]
        },
        "payroll-operator" => {
          label: "Payroll Operator",
          permissions: %w[workforce.timecards.read workforce.timecards.review
            workforce.payroll.configure workforce.payroll.export]
        }
      }.transform_values { |definition| definition.merge(permissions: definition.fetch(:permissions).freeze).freeze }.freeze

      def self.role_codes = DEFINITIONS.keys
      def self.definition(role_code) = DEFINITIONS[role_code.to_s]
      def self.assignable?(role_version)
        role_version.is_a?(RoleVersion) && role_codes.include?(role_version.role_code) && role_version.version == VERSION
      end

      def self.current_versions
        RoleVersion.includes(:permissions).where(role_code: role_codes)
          .order(:role_code, version: :desc, id: :desc).to_a.uniq(&:role_code)
      end

      def self.install!
        ApplicationRecord.transaction do
          ApplicationRecord.connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended('clinic:pilot-role-catalog:v8', 0))"
          )
          DEFINITIONS.each do |role_code, definition|
            role = RoleVersion.find_or_create_by!(role_code:, version: VERSION)
            expected = definition.fetch(:permissions).sort
            if role.permissions.exists?
              actual = role.permissions.pluck(:action_code).sort
              raise ActiveRecord::RecordInvalid, role unless actual == expected
              next
            end

            expected.each do |action_code|
              permission = Permission.find_or_create_by!(action_code:)
              RoleVersionPermission.create!(role_version: role, permission:)
            end
          end
        end
      end
    end
  end
end
