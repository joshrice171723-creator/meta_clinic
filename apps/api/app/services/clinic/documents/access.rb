module Clinic
  module Documents
    class Access
      def self.downloadable!(document:, actor:)
        Authorization.authorize!(actor: actor, practice: document.practice, action: "documents.read", site: document.encounter&.site)
        raise ArgumentError, "This document is not available for download." unless document.scan_state == "clean"

        document
      end
    end
  end
end
