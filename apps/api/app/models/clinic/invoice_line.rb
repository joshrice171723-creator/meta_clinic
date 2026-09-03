module Clinic
  class InvoiceLine < ApplicationRecord
    self.table_name = "clinic_invoice_lines"
    include TenantScoped
    has_paper_trail(
      on: [ :create, :update, :destroy ],
      versions: { class_name: "Clinic::ModelVersion" },
      meta: {
        practice_id: :practice_id,
        actor_reference: ->(_record) { PaperTrail.request.whodunnit },
        request_id: ->(_record) { PaperTrail.request.controller_info&.[](:request_id) },
        occurred_at: ->(_record) { Time.current },
        changed_fields: ->(record) { record.saved_changes.keys }
      }
    )
    before_update :editable_draft_only
    before_destroy :editable_draft_only

    belongs_to :patient, class_name: "Clinic::Care::Patient"
    belongs_to :invoice, class_name: "Clinic::Invoice"

    validates :quantity, :unit_amount, :posted_amount, numericality: { greater_than_or_equal_to: 0 }
    validates :quantity, numericality: { greater_than: 0 }
    validates :description_snapshot, presence: true
    validate :invoice_belongs_to_patient

    private

    def invoice_belongs_to_patient
      return unless invoice

      errors.add(:invoice, "must belong to this practice") if invoice.practice_id != practice_id
      errors.add(:invoice, "must belong to this patient") if invoice.patient_id != patient_id
    end

    def editable_draft_only
      return true if invoice&.status == "draft"

      errors.add(:invoice, "posted invoice lines are immutable")
      throw :abort
    end
  end
end
