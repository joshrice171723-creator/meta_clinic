module Clinic
  module DocumentSerializer
    def self.call(document)
      {
        id: document.id,
        patient_id: document.patient_id,
        encounter_id: document.encounter_id,
        category_id: document.category_id,
        object_version: document.object_version,
        checksum: document.checksum,
        byte_size: document.byte_size,
        media_type: document.media_type,
        scan_state: document.scan_state,
        created_at: document.created_at
      }
    end

    def self.category(category)
      { id: category.id, code: category.code, name: category.name }
    end
  end
end
