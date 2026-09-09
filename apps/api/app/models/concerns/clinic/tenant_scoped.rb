module Clinic
  module TenantScoped
    extend ActiveSupport::Concern

    included do
      belongs_to :practice, class_name: "Clinic::Practice"

      scope :for_practice, ->(practice) {
        practice_id = practice.respond_to?(:id) ? practice.id : practice
        where(practice_id: practice_id)
      }
    end
  end
end
