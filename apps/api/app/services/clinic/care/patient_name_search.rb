require "openssl"

module Clinic
  module Care
    class PatientNameSearch
      DOMAIN = "apply/clinic/patient-name-search/v1".freeze
      MIN_PREFIX_LENGTH = 2
      MAX_PREFIX_LENGTH = 32
      MAX_NAME_TOKENS = 12

      class << self
        def tokens_for(practice_id:, name:)
          key = tenant_key(practice_id)
          words(name).flat_map do |word|
            MIN_PREFIX_LENGTH.upto([ word.length, MAX_PREFIX_LENGTH ].min).map do |length|
              digest(key:, value: word.first(length))
            end
          end.uniq
        end

        def query_tokens(practice_id:, query:)
          key = tenant_key(practice_id)
          words(query).filter_map do |word|
            next if word.length < MIN_PREFIX_LENGTH

            digest(key:, value: word.first(MAX_PREFIX_LENGTH))
          end.uniq
        end

        def search(scope:, practice_id:, query:)
          text = query.to_s.strip.first(100)
          return scope if text.blank?

          escaped = Clinic::Care::Patient.sanitize_sql_like(text)
          hashes = query_tokens(practice_id:, query: text)
          return scope.where("reference ILIKE :query", query: "%#{escaped}%") if hashes.empty?

          # Hex digests contain no PostgreSQL array delimiters; bind the entire
          # array value so the query structure never depends on search input.
          hash_array = "{#{hashes.join(',')}}"
          scope.where(
            [ "reference ILIKE ? OR name_search_tokens @> ?::text[]", "%#{escaped}%", hash_array ]
          )
        end

        private

        def words(value)
          value.to_s.unicode_normalize(:nfkd).gsub(/\p{Mn}/, "").downcase
            .scan(/[\p{Alnum}]+/).first(MAX_NAME_TOKENS)
        end

        def digest(key:, value:)
          OpenSSL::HMAC.hexdigest("SHA256", key, value)
        end

        def tenant_key(practice_id)
          root_key = Array(Rails.application.config.active_record.encryption.primary_key).last
          unless root_key.is_a?(String) && root_key.present?
            raise "Active Record encryption primary key is unavailable"
          end

          OpenSSL::HMAC.digest("SHA256", root_key, "#{DOMAIN}/practice/#{Integer(practice_id)}")
        end
      end

      # Prefix hashes reveal equality and shared-prefix patterns within one tenant.
      # They never replace encrypted names. Rotating the Rails encryption root key
      # requires rebuilding this index before name lookup can use the new key.
    end
  end
end
