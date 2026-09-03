module Clinic
  class CashDrawerSession < ApplicationRecord
    self.table_name = "clinic_cash_drawer_sessions"
    include TenantScoped
    include Auditable

    belongs_to :site, class_name: "Clinic::Site"
    belongs_to :opened_by, class_name: "User"
    belongs_to :closed_by, class_name: "User", optional: true
    has_many :cash_tenders, class_name: "Clinic::CashTender", dependent: :restrict_with_error

    validates :status, inclusion: { in: %w[open closed] }
    validates :opening_float, numericality: { greater_than_or_equal_to: 0 }
  end
end
