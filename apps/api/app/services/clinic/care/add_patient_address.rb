module Clinic
  module Care
    class AddPatientAddress
      def self.call(practice:, actor:, patient:, encrypted_address:, make_primary: false)
        Authorization.authorize!(actor: actor, practice: practice, action: "patients.write")
        patient = practice.patients.find(patient.id)

        ApplicationRecord.transaction do
          patient.lock!
          latest_version = patient.address_versions.maximum(:version).to_i
          address = patient.address_versions.create!(
            practice: practice,
            version: latest_version + 1,
            encrypted_address: encrypted_address
          )
          patient.update!(primary_address_version: address) if make_primary
          address
        end
      end
    end
  end
end
