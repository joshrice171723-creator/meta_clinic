#!/usr/bin/env ruby
# Private keys are created/read only on the caller's host, never sent to Rails.
require "openssl"
require "base64"
require "digest"
require "json"
require "securerandom"
require "fileutils"
require "net/http"

actions = %w[workflow/claim verdict defect test-data/prepare retest-request]
case ARGV.shift
when "keygen"
  directory = File.expand_path(ARGV.shift || File.join(Dir.home, ".config", "meta-clinic", "muse-qa"))
  FileUtils.mkdir_p(directory, mode: 0o700)
  key = OpenSSL::PKey.generate_key("ED25519")
  private_path = File.join(directory, "private.pem")
  public_path = File.join(directory, "public.pem")
  abort "Key files already exist; use a new directory for rotation." if File.exist?(private_path) || File.exist?(public_path)
  File.write(private_path, key.private_to_pem, mode: "wx", perm: 0o600)
  File.write(public_path, key.public_to_pem, mode: "wx", perm: 0o600)
  fingerprint = "SHA256:#{Base64.urlsafe_encode64(Digest::SHA256.digest(key.public_to_der), padding: false)}"
  puts JSON.pretty_generate(fingerprint:, public_key: key.public_to_pem, private_key_path: private_path)
when "post"
  origin, action, key_path, body_path = ARGV
  abort "Usage: muse_client.rb post HTTPS_ORIGIN ACTION PRIVATE_KEY_PATH BODY_JSON_PATH" unless origin && actions.include?(action) && key_path && body_path
  base = URI.parse(origin)
  abort "An HTTPS origin without credentials, query or fragment is required." unless base.is_a?(URI::HTTPS) && base.userinfo.nil? &&
    base.query.nil? && base.fragment.nil? && ["", "/"].include?(base.path)
  key = OpenSSL::PKey.read(File.binread(key_path))
  abort "An Ed25519 key is required." unless key.oid == "ED25519"
  raw = File.binread(body_path)
  abort "A JSON request object is required." unless JSON.parse(raw, allow_duplicate_key: false).is_a?(Hash)
  path = "/qa/api/#{action}"
  timestamp = Time.now.to_i.to_s
  nonce = SecureRandom.urlsafe_base64(24)
  canonical = ["POST", path, timestamp, nonce, Digest::SHA256.hexdigest(raw)].join("\n")
  request = Net::HTTP::Post.new(path, "Content-Type" => "application/json",
    "X-Muse-Key-Fingerprint" => "SHA256:#{Base64.urlsafe_encode64(Digest::SHA256.digest(key.public_to_der), padding: false)}",
    "X-Muse-Timestamp" => timestamp, "X-Muse-Nonce" => nonce,
    "X-Muse-Signature" => Base64.urlsafe_encode64(key.sign(nil, canonical), padding: false))
  request.body = raw
  response = Net::HTTP.start(base.host, base.port, use_ssl: true, open_timeout: 10, read_timeout: 120) { |http| http.request(request) }
  puts response.body
  exit(response.is_a?(Net::HTTPSuccess) ? 0 : 1)
else
  abort "Usage: muse_client.rb keygen [DIRECTORY] | post HTTPS_ORIGIN ACTION PRIVATE_KEY_PATH BODY_JSON_PATH"
end
