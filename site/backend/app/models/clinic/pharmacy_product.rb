module Clinic
  class PharmacyProduct < ApplicationRecord
    self.table_name = "clinic_pharmacy_products"
    belongs_to :practice, class_name: "Clinic::Practice"
    has_many :batches, class_name: "Clinic::PharmacyBatch", foreign_key: :product_id, dependent: :restrict_with_error
    validates :name, :sku, presence: true, length: { maximum: 160 }
    validates :sku, uniqueness: { scope: :practice_id }
    validates :ndc, uniqueness: { scope: :practice_id }, allow_nil: true
    validates :generic_name, :dosage_form, :route, :labeler, length: { maximum: 500 }
    validates :ingredients, :package_description, length: { maximum: 4000 }
    validates :ndc, :product_ndc, length: { maximum: 30 }
    validates :source, inclusion: { in: %w[manual openfda synthetic] }
    validates :reorder_point, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1_000_000 }

    def available_quantity
      return 0 unless active?
      batches.select(&:available?).sum(&:quantity)
    end

    def on_hand_quantity
      batches.sum(&:quantity)
    end

    def low_stock?
      active? && available_quantity <= reorder_point
    end
  end
end
