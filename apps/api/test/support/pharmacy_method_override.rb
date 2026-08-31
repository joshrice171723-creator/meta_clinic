module PharmacyMethodOverride
  # The installed Minitest version has no mock library. Keep substitutions local
  # to each test and always restore the original method, including on failure.
  def with_method(object, name, result)
    original = object.method(name)
    object.define_singleton_method(name) { |*args| result.respond_to?(:call) ? result.call(*args) : result }
    yield
  ensure
    object.define_singleton_method(name, original)
  end
end
