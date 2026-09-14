require "test_helper"

class BirthDateTest < ActiveSupport::TestCase
  test "age uses exact business date and leap anniversary without restricting newborn staff registration" do
    parser = Clinic::Care::BirthDate
    on = Date.new(2026, 9, 14)
    assert_equal on, parser.parse!(on, on:)
    assert_equal Date.new(2008, 9, 14), parser.parse!("2008-09-14", on:, minimum_age: 18)
    assert_equal 18, parser.age(Date.new(2008, 2, 29), on: Date.new(2026, 2, 28))
    assert_equal 17, parser.age(Date.new(2008, 2, 29), on: Date.new(2026, 2, 27))
    assert_equal Date.new(1876, 9, 15), parser.parse!("1876-09-15", on:)
    %w[2008-09-15 1876-09-14 2026-09-15 2008-02-30 09/14/2000].each do |date|
      assert_raises(ArgumentError) { parser.parse!(date, on:, minimum_age: 18) }
    end
  end

  test "invalid raw dates cannot disappear into an unknown demographic date" do
    organization = Organization.create!(name: "Birth date fixture")
    practice = Clinic::Practice.create!(name: "Birth date clinic", organization:)
    patient = practice.patients.create!(display_name: "Birth date patient", reference: "DOB")
    record = Clinic::Care::PatientDemographics.create!(practice:, patient:, sex: "not_recorded",
      primary_language: "Not recorded", interpreter_required: nil)
    record.date_of_birth = "invalid"
    refute record.valid?
    record.date_of_birth = Current.business_date
    assert record.valid?, record.errors.full_messages.join(", ")
    record.save!
    assert_nil record.reload.interpreter_required
  end
end
