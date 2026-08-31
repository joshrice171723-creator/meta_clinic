module Launch
  class MaterialsQuery
    def self.call(sample_only: false)
      sample_only ? Material.published.where(sample: true) : Material.published
    end
  end
end
