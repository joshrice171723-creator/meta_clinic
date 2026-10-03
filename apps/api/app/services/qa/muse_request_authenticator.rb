require "base64"
require "digest"

module Qa
  class MuseRequestAuthenticator
    class Unauthorized < StandardError; end
    Request = Data.define(:nonce, :timestamp)

    MAX_CLOCK_SKEW = 300
    NONCE_PATTERN = /\A[A-Za-z0-9_-]{22,64}\z/
    FINGERPRINT_PATTERN = /\ASHA256:[A-Za-z0-9+\/]{43}\z/

    def self.authenticate!(request)
      raise Unauthorized, "A Muse signature is required." unless request.request_method == "POST"
      raise Unauthorized, "Signed Muse writes require JSON." unless request.media_type == "application/json"
      raise Unauthorized, "Query parameters are not signed." if request.query_string.present?
      raise Unauthorized, "Bearer credentials are not accepted on the Muse API." if request.authorization.present?
      raise Unauthorized, "Request body is too large." if request.raw_post.bytesize > 65_536

      fingerprint = request.headers["X-Muse-Key-Fingerprint"].to_s
      timestamp = request.headers["X-Muse-Timestamp"].to_s
      nonce = request.headers["X-Muse-Nonce"].to_s
      signature = request.headers["X-Muse-Signature"].to_s
      raise Unauthorized, "Muse signature headers are invalid." unless fingerprint.match?(FINGERPRINT_PATTERN) &&
        timestamp.match?(/\A[0-9]{10}\z/) && nonce.match?(NONCE_PATTERN) && signature.match?(/\A[A-Za-z0-9_-]{80,100}\z/)

      epoch = Integer(timestamp, 10)
      raise Unauthorized, "Muse request timestamp is outside the allowed window." if (Time.current.to_i - epoch).abs > MAX_CLOCK_SKEW

      credential = MuseCredential.active.includes(:user).find_by(fingerprint:)
      raise Unauthorized, "Muse credential is not approved or has been revoked." unless credential&.usable?

      canonical = [request.request_method, request.path, timestamp, nonce,
        Digest::SHA256.hexdigest(request.raw_post)].join("\n")
      signature_bytes = Base64.urlsafe_decode64(signature)
      raise Unauthorized, "Muse request signature is invalid." unless credential.public_key.verify(nil, signature_bytes, canonical)

      [credential, Request.new(nonce:, timestamp: epoch)]
    rescue OpenSSL::PKey::PKeyError, ArgumentError
      raise Unauthorized, "Muse request signature is invalid."
    end
  end
end
