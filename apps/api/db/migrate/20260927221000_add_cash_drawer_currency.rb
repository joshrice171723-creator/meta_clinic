class AddCashDrawerCurrency < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_cash_drawer_sessions, :currency, :string, limit: 3
    add_check_constraint :clinic_cash_drawer_sessions,
      "currency IS NULL OR currency ~ '^[A-Z]{3}$'", name: "cash_drawer_currency_format"
  end
end
