require "openssl"

module Clinic
  module Care
    class LabReport < ApplicationRecord
      self.table_name = "clinic_lab_reports"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :patient, class_name: "Clinic::Care::Patient"
      belongs_to :site, class_name: "Clinic::Site", optional: true
      belongs_to :current_version, class_name: "Clinic::Care::LabReportVersion", optional: true
      belongs_to :service_request, class_name: "Clinic::Care::ServiceRequest", optional: true
      has_many :report_versions, -> { order(version_number: :asc) },
        class_name: "Clinic::Care::LabReportVersion", dependent: :restrict_with_error
      has_many :follow_ups, class_name: "Clinic::Care::LabResultFollowUp", dependent: :restrict_with_error

      encrypts :external_report_id
      attr_readonly :practice_id, :patient_id, :site_id, :service_request_id, :source_name, :external_report_id,
        :external_report_id_digest

      validates :source_name, presence: true, length: { maximum: 160 }
      validates :external_report_id, length: { maximum: 255 }, allow_nil: true
      validates :external_report_id_digest, length: { is: 64 }, format: { with: /\A\h{64}\z/ }, allow_nil: true,
        uniqueness: { scope: %i[practice_id patient_id] }
      validate :current_version_belongs_to_report
      validate :site_belongs_to_practice
      validate :service_request_matches_context
      before_validation :normalize_identity, on: :create

      scope :latest_first, -> { order(updated_at: :desc, id: :desc) }

      private

      def normalize_identity
        self.source_name = source_name.to_s.strip
        self.external_report_id = external_report_id.to_s.strip.presence
        self.external_report_id_digest = if external_report_id.present?
          payload = [ practice_id, patient_id, source_name.downcase, external_report_id ].join("\0")
          key = Rails.application.key_generator.generate_key("clinic/lab-report-identity/v1", 32)
          OpenSSL::HMAC.hexdigest("SHA256", key, payload)
        end
      end

      def current_version_belongs_to_report
        return unless current_version

        unless current_version.practice_id == practice_id && current_version.patient_id == patient_id && current_version.lab_report_id == id
          errors.add(:current_version, "must belong to this patient lab report")
        end
      end

      def site_belongs_to_practice
        errors.add(:site, "must belong to this practice") if site && site.practice_id != practice_id
      end

      def service_request_matches_context
        return unless service_request

        valid = service_request.practice_id == practice_id && service_request.patient_id == patient_id &&
          service_request.service_kind == "lab"
        errors.add(:service_request, "must be a lab request for this patient") unless valid
      end
    end
  end
end
