module Launch
  module MaterialAccess
    private

    def available_materials
      MaterialsQuery.call(sample_only: development_demo?)
    end
  end
end
