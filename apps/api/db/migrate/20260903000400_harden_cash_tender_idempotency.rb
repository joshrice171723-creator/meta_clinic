class HardenCashTenderIdempotency < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_cash_tenders, :request_key, :string
    execute <<~SQL
      UPDATE clinic_cash_tenders
      SET request_key = 'legacy-cash-tender-' || id
      WHERE request_key IS NULL
    SQL
    change_column_null :clinic_cash_tenders, :request_key, false
    add_index :clinic_cash_tenders, %i[practice_id request_key], unique: true, name: "clinic_cash_tenders_request_key"
    add_check_constraint :clinic_cash_tenders, "length(trim(request_key)) BETWEEN 1 AND 100", name: "cash_tender_request_key_present"
  end
end
