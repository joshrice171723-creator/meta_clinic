module Clinic
  module Workforce
    class IssueBadge
      Result = Data.define(:badge, :token, :barcode_svg)

      def self.call(employment:, actor_membership:, pin: nil, now: Current.business_time)
        raise ArgumentError, "Employment is not active" unless employment.active_for_work?(at: now)
        raise ArgumentError, "Actor and employee must belong to the same practice" unless actor_membership.practice_id == employment.practice_id
        validate_pin!(pin)

        employment.with_lock do
          old_badges = BadgeCredential.active.where(employment: employment).to_a
          old_badges.each do |old_badge|
            old_badge.update!(status: "replaced", revoked_at: now, revoked_by_membership: actor_membership)
          end
          token = SecureRandom.urlsafe_base64(32, false)
          badge = BadgeCredential.create!(
            practice: employment.practice,
            employment: employment,
            secret_digest: digest(token),
            pin_digest: pin.present? ? BCrypt::Password.create(pin.to_s, cost: BCrypt::Engine.cost).to_s : nil,
            issued_by_membership: actor_membership,
            issued_at: now
          )
          old_badges.each { |old_badge| old_badge.update!(replaced_by: badge) }
          Result.new(badge: badge, token: token, barcode_svg: Code128Svg.call(token))
        end
      end

      def self.digest(value)
        Digest::SHA256.hexdigest(value.to_s)
      end

      def self.validate_pin!(pin)
        return if pin.blank?
        raise ArgumentError, "PIN must contain 4 to 12 digits" unless pin.to_s.match?(/\A\d{4,12}\z/)
      end
      private_class_method :validate_pin!
    end
  end
end
