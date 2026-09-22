require "test_helper"

class Clinic::Realtime::PublisherTest < ActiveSupport::TestCase
  test "maps only mutation-backed workflows to invalidation topics" do
    assert_equal %w[tracking_board work_inbox],
      Clinic::Realtime::Publisher.topics_for("clinic/scheduling/appointments", "update")
    assert_equal %w[staff_messaging],
      Clinic::Realtime::Publisher.topics_for("clinic/messaging/staff", "create_message")
    assert_empty Clinic::Realtime::Publisher.topics_for("clinic/messaging/staff", "mark_read")
    assert_empty Clinic::Realtime::Publisher.topics_for("clinic/billing/dashboard", "income_outlook")
  end

  test "uses a separate PostgreSQL notification channel per practice" do
    assert_equal "apply_clinic_realtime_42", Clinic::Realtime::Publisher.channel_for(42)
    assert_not_equal Clinic::Realtime::Publisher.channel_for(42), Clinic::Realtime::Publisher.channel_for(43)
    assert_raises(ArgumentError) { Clinic::Realtime::Publisher.channel_for("42; LISTEN other") }
  end
end
