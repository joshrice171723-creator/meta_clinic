require "test_helper"

class Launch::WorkflowsTest < ActiveSupport::TestCase
  setup do
    @password = SecureRandom.hex(20)
    @user = User.create!(email_address: "workflow@example.invalid", password: @password)
    @other = User.create!(email_address: "workflow-other@example.invalid", password: @password)
    @document = Launch::Paperwork.assign_demo!(@user)
    @material = Launch::Material.create!(title: "Synthetic lesson", body: "Fictional training", published_at: Time.current, sample: true)
  end

  test "one signing operation enforces ownership consent password and immutable completion" do
    arguments = { user: @user, document_id: @document.id, consent: true, password: @password, name: "Fictional signer", reviewed_digest: @document.content_digest }
    assert_raises(ActiveRecord::RecordNotFound) { Launch::SignPaperwork.call(**arguments.merge(user: @other)) }
    assert_raises(Launch::SignPaperwork::ConsentRequired) { Launch::SignPaperwork.call(**arguments.merge(consent: "1")) }
    assert_raises(Launch::SignPaperwork::PasswordRequired) { Launch::SignPaperwork.call(**arguments.merge(password: "wrong")) }
    assert_raises(Launch::Paperwork::SigningConflict) { Launch::SignPaperwork.call(**arguments) }
    @document.begin_review!
    signed = Launch::SignPaperwork.call(**arguments)
    assert_equal "completed", signed.status
    digest = signed.signature_digest
    assert_raises(Launch::Paperwork::SigningConflict) { Launch::SignPaperwork.call(**arguments) }
    assert_equal digest, signed.reload.signature_digest
  end

  test "training operation preserves first timestamps and never completes another user's progress" do
    arguments = { user: @user, material_id: @material.id, sample_only: true }
    assert_raises(ActiveRecord::RecordNotFound) { Launch::TrainingProgress.complete!(**arguments) }
    first = Launch::TrainingProgress.start!(**arguments)
    started_at = first.started_at
    travel 1.minute do
      assert_equal first, Launch::TrainingProgress.start!(**arguments)
      assert_equal started_at, first.reload.started_at
      completed = Launch::TrainingProgress.complete!(**arguments)
      stamp = completed.completed_at
      travel 1.minute
      assert_equal stamp, Launch::TrainingProgress.complete!(**arguments).completed_at
      assert_raises(ActiveRecord::RecordNotFound) { Launch::TrainingProgress.complete!(**arguments.merge(user: @other)) }
    end
    @material.update!(sample: false)
    assert_raises(ActiveRecord::RecordNotFound) { Launch::TrainingProgress.start!(**arguments) }
    @material.update!(published_at: nil)
    assert_raises(ActiveRecord::RecordNotFound) { Launch::TrainingProgress.start!(**arguments.merge(sample_only: false)) }
  end

  test "contact submission rejects honeypots and only acknowledges persisted valid messages" do
    attributes = { name: "Example", email: "example@example.invalid", message: "Wholly synthetic contact" }
    assert_no_difference "Launch::ContactMessage.count" do
      assert_raises(Launch::ContactSubmission::Rejected) { Launch::ContactSubmission.call(details: attributes.merge(website: "bot")) }
      invalid = Launch::ContactSubmission.call(details: attributes.merge(message: ""))
      assert_not invalid.persisted?
      assert invalid.errors.any?
    end
    result = Launch::ContactSubmission.call(details: attributes.merge(id: 9_999_999))
    assert result.persisted?
    assert_not_equal 9_999_999, result.id
  end

  test "inquiry query exposes a bounded stable cursor without duplicating records" do
    51.times { |n| Launch::ContactMessage.create!(name: "Example #{n}", email: "example@example.invalid", message: "Synthetic inquiry page") }
    first = Launch::InquiriesQuery.call
    second = Launch::InquiriesQuery.call(before: first.next_cursor)
    assert_equal 50, first.inquiries.size
    assert_equal first.inquiries.last.id, first.next_cursor
    assert_equal 1, second.inquiries.size
    assert_nil second.next_cursor
    assert_empty first.inquiries.map(&:id) & second.inquiries.map(&:id)
  end
end
