# Standalone, database-free checks of the production update/precondition code.
# Ruby mutexes model held transaction locks; this is not a PostgreSQL race test.
require "minitest/autorun"
require "monitor"
require "ostruct"
require "time"

module ActiveRecord
  class RecordNotUnique < StandardError; end
  class StaleObjectError < StandardError
    def initialize(_record, operation) = super(operation)
  end
end

class ApplicationRecord
  def self.transaction
    Thread.current[:synthetic_locks] = []
    yield
  ensure
    Thread.current[:synthetic_locks].reverse_each(&:exit)
    Thread.current[:synthetic_locks] = nil
  end
end

module Current
  def self.business_time = Time.utc(2026, 10, 2)
end

class SyntheticRelation
  def initialize(rows) = @rows = rows
  def active(_time = nil) = SyntheticRelation.new(@rows.select { |row| row.fetch(:active, true) })
  def effective_at(time)
    SyntheticRelation.new(@rows.select { |row| row.fetch(:eligible, true) && row[:effective_from] <= time && (row[:effective_until].nil? || row[:effective_until] > time) })
  end
  def where(**values) = SyntheticRelation.new(@rows.select { |row| values.all? { |key, value| row[key] == value } })
  def order(field) = SyntheticRelation.new(@rows.sort_by { |row| row.fetch(field) })
  def pluck(*fields) = @rows.map { |row| fields.one? ? row[fields.first] : fields.map { |field| row[field] } }
end

class SyntheticLockedRecord < OpenStruct
  def acquire
    self.attempts << true if attempts
    mutex.enter
    Thread.current[:synthetic_locks] << mutex
    self
  end
end

class SyntheticStore
  class << self
    attr_accessor :record
    def lock = self
    def active = self
    def find(_id) = record.acquire
    def find_by!(**_input) = record.acquire
  end
end

class User < SyntheticStore; end
module Clinic
  class Membership < SyntheticStore; end
  module Staff
    class Member < SyntheticStore; end
  end
  module Workforce
    class Employment < SyntheticStore; end
    class Access
      class << self
        attr_accessor :denied
      end
      def initialize(**_input); end
      def authorize!(_permission)
        raise "Synthetic authority denied" if self.class.denied
      end
    end
  end
end

require_relative "../../app/services/clinic/workforce/employment_access_revision"
require_relative "../../app/services/clinic/workforce/link_employment"
require_relative "../../app/services/clinic/workforce/role_assignment"

class WorkforceAccessPreconditionUnit < Minitest::Test
  Revision = Clinic::Workforce::EmploymentAccessRevision
  Operation = Clinic::Workforce::LinkEmployment

  def setup
    @time = Current.business_time
    @grants = [{ id: 1, revision: 1, role_version_id: 11, scope_kind: "site", site_id: 7, source_employment_id: 1 }]
    @sites = [{ id: 1, site_id: 7, active: true, effective_from: @time, effective_until: nil }]
    @user = SyntheticLockedRecord.new(id: 301, active: true, updated_at: @time, mutex: Monitor.new)
    @staff = SyntheticLockedRecord.new(id: 101, active: true, updated_at: @time, mutex: Monitor.new)
    @membership = SyntheticLockedRecord.new(id: 201, user_id: 301, user: @user, active: true,
      authorization_generation: 1, role_grants: SyntheticRelation.new(@grants), mutex: Monitor.new)
    @employment = SyntheticLockedRecord.new(id: 1, practice_id: 9, staff_member_id: 101, membership_id: 201,
      status: "active", effective_from: @time, effective_until: nil, membership: @membership,
      staff_member: @staff, employment_sites: SyntheticRelation.new(@sites), practice: Object.new, mutex: Monitor.new)
    @employment.define_singleton_method(:active_for_work?) { true }
    @employment.define_singleton_method(:reload) { self.membership = Clinic::Membership.record; self }
    @employment.define_singleton_method(:update!) { |_attributes| raise "Unexpected employment write" }
    Clinic::Workforce::Employment.record = @employment
    Clinic::Membership.record = @membership
    Clinic::Staff::Member.record = @staff
    User.record = @user
    Clinic::Workforce::Access.denied = false
    @actor = OpenStruct.new(id: 400)
  end

  def update(revision, now: @time, **changes)
    Operation.update!(employment: @employment, actor: @actor, role_version: OpenStruct.new(role_code: "workforce-location-manager"),
      expected_access_revision: revision, now: now, **changes)
  end

  def with_replacement(name, implementation)
    original = Operation.method(name)
    Operation.define_singleton_method(name) { |*arguments| implementation.call(*arguments) }
    yield
  ensure
    Operation.define_singleton_method(name, original)
    Operation.singleton_class.send(:private, name)
  end

  def test_concurrent_role_change_rejects_before_any_replacement
    reviewed = Revision.call(@employment)
    @membership.authorization_generation += 1
    @grants[0][:role_version_id] = 99
    with_replacement(:replace_access!, ->(*) { flunk "Stale role must not be replaced" }) do
      assert_raises(ActiveRecord::StaleObjectError) { update(reviewed) }
    end
    assert_equal 99, @grants[0][:role_version_id]
  end

  def test_changed_scope_rejects_even_if_generation_was_not_bumped
    reviewed = Revision.call(@employment)
    @grants[0][:site_id] = 8
    assert_raises(ActiveRecord::StaleObjectError) { update(reviewed) }
    assert_equal 8, @grants[0][:site_id]
  end

  def test_site_change_rejects_before_employee_or_site_mutation
    reviewed = Revision.call(@employment)
    @sites[0][:site_id] = 8
    with_replacement(:replace_sites!, ->(*) { flunk "Stale sites must not be replaced" }) do
      assert_raises(ActiveRecord::StaleObjectError) { update(reviewed, site_ids: [7], status: "inactive") }
    end
  end

  def test_expired_role_or_newly_effective_site_changes_revision
    reviewed = Revision.call(@employment)
    @grants[0][:active] = false
    refute_equal reviewed, Revision.call(@employment)
    @grants[0][:active] = true
    @sites[0][:eligible] = false
    refute_equal reviewed, Revision.call(@employment)
  end

  def test_identity_and_effective_window_are_bound_to_review
    reviewed = Revision.call(@employment)
    @user.updated_at += Rational(1, 1_000_000)
    refute_equal reviewed, Revision.call(@employment)
    @user.updated_at = @time
    @employment.effective_until = @time + 3600
    assert_raises(ActiveRecord::StaleObjectError) { update(reviewed) }
  end

  def test_role_only_replacement_cannot_expand_into_a_newly_eligible_work_site
    @sites << { id: 2, site_id: 8, active: true, effective_from: @time + 86400, effective_until: nil }
    reviewed = Revision.call(@employment)
    with_replacement(:replace_access!, ->(*) { flunk "Unreviewed scope must not be granted" }) do
      assert_raises(ActiveRecord::StaleObjectError) { update(reviewed, now: @time + 86401) }
    end
    assert_equal [7], @grants.map { |grant| grant[:site_id] }
  end

  def test_server_authority_is_still_checked_before_precondition
    Clinic::Workforce::Access.denied = true
    error = assert_raises(RuntimeError) { update("invalid") }
    assert_equal "Synthetic authority denied", error.message
  end

  def test_returned_revision_uses_generation_advanced_by_another_loaded_membership
    reviewed = Revision.call(@employment)
    with_replacement(:replace_access!, lambda do |*_arguments|
      Clinic::Membership.record = SyntheticLockedRecord.new(@membership.to_h.merge(authorization_generation: 2))
      @grants[0][:role_version_id] = 12
    end) do
      saved = update(reviewed)
      assert_equal 2, saved.membership.authorization_generation
      refute_equal reviewed, Revision.call(saved)
    end
  end

  def test_two_reviewers_cannot_both_commit_same_revision
    reviewed = Revision.call(@employment)
    entered = Queue.new
    release = Queue.new
    attempts = Queue.new
    outcomes = Queue.new
    @employment.attempts = attempts
    replacement = lambda do |employment, _actor, _role, _now|
      assert employment.mutex.mon_owned?, "Employment lock must cover replacement"
      assert @membership.mutex.mon_owned?, "Membership lock must cover comparison and replacement"
      entered << true
      raise "Synthetic release barrier timed out" unless release.pop(timeout: 3)
      @membership.authorization_generation += 1
      @grants[0][:role_version_id] = 12
    end
    with_replacement(:replace_access!, replacement) do
      first = Thread.new { update(reviewed); outcomes << :committed }
      assert entered.pop(timeout: 3), "First reviewer did not reach replacement"
      assert attempts.pop(timeout: 3), "First reviewer did not reach employment lock"
      second = Thread.new do
        update(reviewed)
        outcomes << :committed
      rescue ActiveRecord::StaleObjectError
        outcomes << :stale
      end
      assert attempts.pop(timeout: 3), "Second reviewer did not reach the held employment lock"
      release << true
      [first, second].each { |thread| assert thread.join(3), "Synthetic reviewer did not finish" }
    end
    assert_equal [:committed, :stale], 2.times.map { outcomes.pop(timeout: 3) }.sort
    assert_equal 12, @grants[0][:role_version_id]
  end
end
