module Qa
  class MuseNonce < ApplicationRecord
    self.table_name = "qa_muse_nonces"
    belongs_to :credential, class_name: "Qa::MuseCredential"
    validates :nonce, :expires_at, :created_at, presence: true
  end
end
