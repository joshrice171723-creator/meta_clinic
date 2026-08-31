require "test_helper"

class ErdContractTest < ActiveSupport::TestCase
  test "every diagram entity exists and every edge has database and Rails relationships" do
    Rails.application.eager_load!
    contract = JSON.parse(File.read(Rails.root.join("test/architecture/erd_contract.json")))
    connection = ApplicationRecord.connection
    models = ApplicationRecord.descendants.reject(&:abstract_class?).group_by(&:table_name)
    contract.fetch("entities").each do |table|
      assert connection.table_exists?(table), table
      assert models[table].present?, table
    end
    contract.fetch("relationships").each do |edge|
      parent, child = edge.values_at("parent", "child")
      assert connection.foreign_keys(child).any? { |fk| fk.to_table == parent }, "#{parent} -> #{child}"
      assert models.fetch(parent).any? { |model| model.reflect_on_all_associations.any? { |a| !a.polymorphic? && a.klass.table_name == child } }, "#{parent} inverse -> #{child}"
      assert models.fetch(child).any? { |model| model.reflect_on_all_associations.any? { |a| !a.polymorphic? && a.klass.table_name == parent } }, "#{child} -> #{parent}"
    end
  end

  test "all application association foreign keys exist on the referencing tables" do
    Rails.application.eager_load!
    ApplicationRecord.descendants.reject(&:abstract_class?).each do |model|
      model.reflect_on_all_associations.each do |association|
        next if association.polymorphic? || association.options[:through]
        referenced = association.macro == :belongs_to ? model : association.klass
        Array(association.foreign_key).each do |column|
          assert_includes referenced.column_names, column.to_s, "#{model.name}.#{association.name}"
        end
      end
    end
  end
end
