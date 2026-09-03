module Identity
  class Preference < ApplicationRecord
    self.table_name = "identity_preferences"
    class Conflict < StandardError; end

    belongs_to :user
    validates :palette, inclusion: { in: %w[juniper cobalt plum saffron] }
    validates :mode, inclusion: { in: %w[system light dark] }
    validates :revision, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

    def self.for_user(user)
      find_by(user: user) || new(user: user)
    end

    def self.save_for!(user, palette:, mode:, version:)
      # The parent row also serializes simultaneous first-time preference saves.
      user.with_lock do
        raise Conflict, "Your account changed. Sign in again before saving." unless user.active?
        record = for_user(user)
        raise Conflict, "Settings changed in another tab or device. Reload saved settings before trying again." unless record.revision == version
        record.update!(palette: palette, mode: mode, revision: record.revision + 1)
        record
      end
    end

    def appearance
      { palette: palette, mode: mode, version: revision }
    end
  end
end
