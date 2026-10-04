require "test_helper"
require "digest"

class DemoSandboxResetFidelityTest < ActionDispatch::IntegrationTest
  setup do
    @previous_environment = Rails.env
    @previous_flag = ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env = "development"
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    Rails.cache.clear
  end

  teardown do
    Rails.env = @previous_environment
    ENV["APP_DEVELOPMENT_LOGIN"] = @previous_flag
  end

  test "reset restores practice business table counts and core clinic histories" do
    visitor = Development::DemoVisitor.create!(name: "Reset Fidelity Visitor",
      email: "reset-fidelity-#{SecureRandom.hex(6)}@example.test", company: "Example Clinic")
    as_of = (Time.zone.now + 1.hour).change(usec: 0)

    travel_to(as_of) do
      first_started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      first = Development::SharedDemoLesson.enter!("sandbox", visitor:)
      first_seconds = Process.clock_gettime(Process::CLOCK_MONOTONIC) - first_started
      prepare_demo_sandbox!(first)
      practices = first.practice.organization.practices.order(:id).to_a
      baseline = snapshot(practices)

      patient = first.practice.patients.where("reference LIKE 'SBX-%'").first!
      patient.update!(display_name: "Changed during a demo")
      first.practice.patients.create!(reference: "RESET-EXTRA-PATIENT",
        display_name: "Extra during a demo", primary_site: first.practice.sites.first!)
      refute_equal baseline, snapshot(practices)

      reset_started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      second = Development::SharedDemoLesson.enter!("sandbox", visitor:, previous_run: first, restart: true)
      prepare_demo_sandbox!(second)
      reset_seconds = Process.clock_gettime(Process::CLOCK_MONOTONIC) - reset_started
      assert_equal practices.map(&:id), second.practice.organization.practices.order(:id).pluck(:id)
      restored = snapshot(second.practice.organization.practices.order(:id).to_a)
      puts "Sandbox first entry: #{first_seconds.round(1)}s; reset entry: #{reset_seconds.round(1)}s"
      violations = []
      baseline.zip(restored).each do |before, after|
        audit_delta = (before.fetch(:audit_versions).keys | after.fetch(:audit_versions).keys).filter_map do |type|
          old_count = before.fetch(:audit_versions).fetch(type, 0)
          new_count = after.fetch(:audit_versions).fetch(type, 0)
          [ type, old_count, new_count ] unless old_count == new_count
        end
        puts "#{before.fetch(:practice)} audit version count changes: #{audit_delta.inspect}" if audit_delta.any?
        before.each do |section, value|
          next if section == :audit_versions

          if section == :table_counts
            differences = value.keys.filter_map do |table|
              next if value.fetch(table) == after.fetch(section).fetch(table)

              [ table, value.fetch(table), after.fetch(section).fetch(table) ]
            end
            violations << "#{before.fetch(:practice)} table counts: #{differences.inspect}" if differences.any?
            next
          end
          next if Digest::SHA256.hexdigest(Marshal.dump(value)) ==
            Digest::SHA256.hexdigest(Marshal.dump(after.fetch(section)))

          details = if section == :patients
            old_rows = value.to_h { |reference, name, site| [ reference, [ name, site ] ] }
            new_rows = after.fetch(section).to_h { |reference, name, site| [ reference, [ name, site ] ] }
            (old_rows.keys | new_rows.keys).filter_map do |reference|
              [ reference, old_rows[reference], new_rows[reference] ] unless old_rows[reference] == new_rows[reference]
            end.first(8).inspect
          else
            "first=#{value.first(3).inspect} reset=#{after.fetch(section).first(3).inspect}"
          end
          violations << "#{before.fetch(:practice)} #{section}: #{details}"
        end
      end
      assert_empty violations, violations.join("\n")
      refute second.practice.patients.exists?(reference: "RESET-EXTRA-PATIENT")
    end
  end

  private

  def snapshot(practices)
    practices.map do |practice|
      {
        practice: practice.name,
        table_counts: practice_table_counts(practice.id),
        audit_versions: ApplicationRecord.connection.exec_query(
          "SELECT item_type, event, COUNT(*) FROM clinic_model_versions " \
          "WHERE practice_id = #{Integer(practice.id)} GROUP BY item_type, event ORDER BY item_type, event"
        ).rows.to_h { |type, event, count| [ "#{type}:#{event}", count ] },
        patients: practice.patients.includes(:primary_site).order(:reference).map do |patient|
          [ patient.reference, patient.display_name, patient.primary_site&.code ]
        end,
        appointments: practice.appointments.includes(:patient, :site, :room, :booked_clinician, :visit_type)
          .order(:starts_at, :id).map do |appointment|
          [ appointment.patient.reference, appointment.site&.code, appointment.room&.code,
            appointment.booked_clinician&.reference, appointment.starts_at, appointment.ends_at,
            appointment.visit_type&.code, appointment.status, appointment.visit_modality ]
        end,
        encounters: practice.encounters.includes(:patient, :site).order(:started_at, :id).map do |encounter|
          [ encounter.patient.reference, encounter.site&.code, encounter.started_at,
            encounter.ended_at, encounter.status ]
        end,
        invoices: practice.invoices.includes(:patient, :encounter).order(:id).map do |invoice|
          [ invoice.patient.reference, invoice.encounter&.started_at,
            invoice.currency, invoice.status ]
        end,
        invoice_lines: Clinic::InvoiceLine.where(practice:).order(:id)
          .pluck(:description_snapshot, :quantity, :unit_amount, :posted_amount),
        allocations: Clinic::PaymentAllocation.where(practice:).order(:id).pluck(:amount).map(&:to_s),
        inventory: Clinic::Inventory::PharmacyBatch.where(practice:).includes(:product)
          .order(:id).map do |batch|
          [ batch.product.sku, batch.lot_number, batch.expires_on, batch.status,
            batch.on_hand.to_s ]
        end,
        movements: Clinic::Inventory::PharmacyMovement.where(practice:).includes(batch: :product)
          .order(:id).map do |movement|
          [ movement.batch.product.sku, movement.batch.lot_number, movement.kind,
            movement.quantity, movement.occurred_at ]
        end,
        receipts: Clinic::Inventory::Receipt.where(practice:).order(:invoice_reference)
          .pluck(:invoice_reference, :received_at),
        office_stock: ApplicationRecord.connection.exec_query(
          "SELECT sku, quantity, reorder_level FROM clinic_items " \
          "WHERE practice_id = #{Integer(practice.id)} ORDER BY sku"
        ).rows,
        office_stock_movements: ApplicationRecord.connection.exec_query(
          "SELECT item.sku, movement.delta, movement.reason, movement.created_at " \
          "FROM clinic_stock_movements movement " \
          "JOIN clinic_items item ON item.id = movement.item_id " \
          "WHERE item.practice_id = #{Integer(practice.id)} ORDER BY item.sku, movement.id"
        ).rows
      }
    end
  end

  def practice_table_counts(practice_id)
    connection = ApplicationRecord.connection
    connection.tables.grep(/\Aclinic_/).sort.filter_map do |table|
      next if table == "clinic_model_versions"
      next unless connection.columns(table).any? { |column| column.name == "practice_id" }

      [ table, connection.select_value("SELECT COUNT(*) FROM #{connection.quote_table_name(table)} " \
        "WHERE practice_id = #{Integer(practice_id)}").to_i ]
    end.to_h
  end
end
