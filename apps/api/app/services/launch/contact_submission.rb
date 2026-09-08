module Launch
  class ContactSubmission
    class Rejected < StandardError
      def initialize
        super("We couldn't accept this inquiry.")
      end
    end

    def self.call(details:)
      attributes = details.to_h.symbolize_keys
      raise Rejected unless attributes.delete(:website).blank?
      message = ContactMessage.new(attributes.slice(:name, :email, :message))
      message.save
      message
    end
  end
end
