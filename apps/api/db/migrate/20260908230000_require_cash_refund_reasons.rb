class RequireCashRefundReasons < ActiveRecord::Migration[8.1]
  HISTORICAL_REASON = "Reason was not recorded before refund reasons were required."

  def up
    add_column :clinic_refund_events, :reason, :string, null: false, default: HISTORICAL_REASON
    add_check_constraint :clinic_refund_events,
      "char_length(reason) BETWEEN 1 AND 200",
      name: "clinic_refund_events_reason_length"
    change_column_default :clinic_refund_events, :reason, from: HISTORICAL_REASON, to: nil
  end

  def down
    remove_check_constraint :clinic_refund_events, name: "clinic_refund_events_reason_length"
    remove_column :clinic_refund_events, :reason
  end
end
