module Identity
  module Api
    class SettingsController < ApplicationController
      before_action :require_member

      def show
        render_settings(Preference.for_user(current_user))
      end

      def update
        # This ID is a stale-account guard, never the target of a lookup or write.
        unless params[:expected_user_id].to_s == current_user.id.to_s
          return render json: { error: "Your signed-in account changed. Reload settings before saving." }, status: :conflict
        end
        input = params.expect(appearance: [ :palette, :mode, :version ])
        unless input[:version].to_s.match?(/\A\d{1,10}\z/)
          return render json: { error: "Reload saved settings before trying again." }, status: :unprocessable_entity
        end
        record = Preference.save_for!(current_user, palette: input[:palette], mode: input[:mode], version: input[:version].to_i)
        render_settings(record)
      rescue Preference::Conflict => error
        render json: { error: error.message }, status: :conflict
      rescue ActiveRecord::RecordInvalid
        render json: { error: "Choose a listed color theme and brightness." }, status: :unprocessable_entity
      end

      private

      def render_settings(record)
        render json: { user_id: current_user.id, appearance: record.appearance }
      end
    end
  end
end
