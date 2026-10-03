require "openssl"

module Clinic
  module Care
    class PatientIdentitySearch
      DOMAIN = "meta-clinic/patient-identity-search/v1".freeze

      class << self
        def search(scope:, practice_id:, query: nil, date_of_birth: nil, phone: nil)
          result = PatientNameSearch.search(scope:, practice_id:, query:) if query.present?
          result ||= scope
          tokens = query_tokens(practice_id:, date_of_birth:, phone:)
          return result if tokens.empty?

          return result.where("identity_search_tokens @> ?::text[]", postgres_array(tokens)) if phone.blank?

          # Persisted phone tokens can be stale after a scheduled contact starts
          # or expires without a save. Use the authorized source scope at one
          # business time; do not refresh identity records during a GET.
          date_tokens = query_tokens(practice_id:, date_of_birth:, phone: nil)
          result = result.where("identity_search_tokens @> ?::text[]", postgres_array(date_tokens)) if date_tokens.present?
          phone_token = query_tokens(practice_id:, date_of_birth: nil, phone:).sole
          matching_ids = []
          CurrentPatientContact.for_patients(patient_scope: result, practice_id:, contact_type: "phone",
            at: Current.business_time).select(:id, :patient_id, :contact_value).find_each(batch_size: 100) do |contact|
            candidate = query_tokens(practice_id:, date_of_birth: nil, phone: contact.contact_value).sole
            matching_ids << contact.patient_id if candidate == phone_token
          end
          result.where(id: matching_ids)
        end

        def tokens_for(patient)
          phone = CurrentPatientContact.call(patient: patient, contact_type: "phone")&.contact_value
          date_of_birth = Clinic::Care::PatientDemographics.where(
            practice_id: patient.practice_id, patient_id: patient.id
          ).pick(:date_of_birth)
          query_tokens(
            practice_id: patient.practice_id,
            date_of_birth:,
            phone:
          )
        end

        def refresh!(patient)
          tokens = tokens_for(patient)
          patient.update_column(:identity_search_tokens, tokens) if patient.identity_search_tokens != tokens
          tokens
        end

        def masked_phone(patient)
          value = CurrentPatientContact.call(patient: patient, contact_type: "phone")&.contact_value
          digits = value.to_s.scan(/\d/).join
          digits.present? ? "ending #{digits.last(4)}" : nil
        end

        private

        def query_tokens(practice_id:, date_of_birth:, phone:)
          values = []
          values << "dob:#{date_of_birth.iso8601}" if date_of_birth.respond_to?(:iso8601)
          digits = phone.to_s.scan(/\d/).join
          if phone.present?
            raise ArgumentError, "Enter a complete phone number." unless digits.length.between?(7, 15)
            values << "phone:#{digits}"
          end
          values.map { |value| digest(practice_id:, value:) }
        end

        def postgres_array(tokens)
          "{#{tokens.join(',')}}"
        end

        def digest(practice_id:, value:)
          OpenSSL::HMAC.hexdigest("SHA256", tenant_key(practice_id), value)
        end

        def tenant_key(practice_id)
          root_key = Array(Rails.application.config.active_record.encryption.primary_key).last
          unless root_key.is_a?(String) && root_key.present?
            raise "Active Record encryption primary key is unavailable"
          end

          OpenSSL::HMAC.digest("SHA256", root_key, "#{DOMAIN}/practice/#{Integer(practice_id)}")
        end
      end
    end
  end
end
