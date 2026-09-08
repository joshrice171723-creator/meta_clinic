require "paper_trail/frameworks/active_record/models/paper_trail/version"

# The application uses only the tenant-bound version table. Keeping the gem's
# default model abstract prevents Active Record from probing the unused
# `versions` table while instantiating the concrete model below.
PaperTrail::Version.abstract_class = true

module Clinic
  class ModelVersion < PaperTrail::Version
    self.table_name = "clinic_model_versions"

    belongs_to :practice, class_name: "Clinic::Practice"

    scope :for_practice, ->(practice) {
      practice_id = practice.respond_to?(:id) ? practice.id : practice
      where(practice_id: practice_id)
    }
    scope :for_subject, ->(subject) { where(item_type: subject.class.base_class.name, item_id: subject.id) }
  end
end
