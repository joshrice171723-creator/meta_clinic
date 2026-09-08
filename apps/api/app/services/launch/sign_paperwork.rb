module Launch
  class SignPaperwork
    class ConsentRequired < StandardError
      def initialize
        super("Confirm your intent to record this demonstration signature.")
      end
    end

    class PasswordRequired < StandardError
      def initialize
        super("Please confirm your account password.")
      end
    end

    def self.call(user:, document_id:, consent:, password:, name:, reviewed_digest:, development_demo: false)
      document = user.paperworks.available_in_portal.find(document_id)
      raise ConsentRequired unless consent == true
      password = password.to_s
      unless (development_demo && document.demo?) || (password.bytesize <= 72 && user.authenticate(password))
        raise PasswordRequired
      end
      document.sign!(name: name, reviewed_digest: reviewed_digest)
      document
    end
  end
end
