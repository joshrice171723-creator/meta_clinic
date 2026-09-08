require "test_helper"

class PatientNameSearchS1Test < ActiveSupport::TestCase
  test "normalizes diacritics and creates tenant-specific prefix hashes without plaintext" do
    first = Clinic::Care::PatientNameSearch.tokens_for(practice_id: 41, name: "José Rivera")
    normalized = Clinic::Care::PatientNameSearch.tokens_for(practice_id: 41, name: "Jose Rivera")
    other_tenant = Clinic::Care::PatientNameSearch.tokens_for(practice_id: 42, name: "Jose Rivera")

    assert_equal normalized, first
    assert_not_equal normalized, other_tenant
    assert normalized.all? { |token| token.match?(/\A[0-9a-f]{64}\z/) }
    assert_not_includes normalized.join, "jose"
    assert_includes normalized,
      Clinic::Care::PatientNameSearch.query_tokens(practice_id: 41, query: "Jos").sole
  end

  test "bounds token count and ignores one-character name queries" do
    words = (1..20).map { |number| "patientword#{number}" }.join(" ")
    tokens = Clinic::Care::PatientNameSearch.tokens_for(practice_id: 7, name: words)

    assert_operator tokens.length, :<=, Clinic::Care::PatientNameSearch::MAX_NAME_TOKENS * 31
    assert_empty Clinic::Care::PatientNameSearch.query_tokens(practice_id: 7, query: "x")
  end

  test "incomplete patients reach normal model validation without deriving a tenant key" do
    patient = Clinic::Care::Patient.new(display_name: nil, reference: nil)

    assert_nothing_raised { patient.valid? }
    assert_includes patient.errors.attribute_names, :practice
    assert_includes patient.errors.attribute_names, :display_name
  end
end
