module Launch
  class Material < ApplicationRecord
    self.table_name = "materials"
    has_many :learning_progresses, dependent: :destroy
    validates :title, :body, presence: true
    validates :title, length: { maximum: 200 }
    validates :summary, length: { maximum: 500 }
    scope :published, -> {
      records = where("published_at <= ?", Current.business_time)
      DemoContent.enabled? ? records : records.where(sample: false)
    }
  end
end
