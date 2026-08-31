class Material < ApplicationRecord
  has_many :learning_progresses, dependent: :destroy
  validates :title, :body, presence: true
  validates :title, length: { maximum: 200 }
  validates :summary, length: { maximum: 500 }
  scope :published, -> { where("published_at <= ?", Time.current) }
end
