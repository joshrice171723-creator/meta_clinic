module Clinic
  module Operations
    class ConfigurationManifestController < Clinic::ApiController
      def show
        render json: { manifest: ConfigurationManifest.call(practice: current_practice, actor: current_user) }
      end
    end
  end
end
