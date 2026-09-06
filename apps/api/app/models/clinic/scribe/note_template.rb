module Clinic
  module Scribe
    class NoteTemplate < ApplicationRecord
      self.table_name = "clinic_scribe_note_templates"

      validates :template_id, :label, presence: true
      validates :version, numericality: { only_integer: true, greater_than: 0 }
      validates :note_kind, inclusion: { in: %w[soap] }
      validates :status, inclusion: { in: %w[active disabled legacy] }

      scope :published, -> { where(status: %w[active disabled]) }

      def enabled?
        status == "active"
      end
    end
  end
end
