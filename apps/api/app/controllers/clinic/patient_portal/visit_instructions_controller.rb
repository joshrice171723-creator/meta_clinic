module Clinic
  module PatientPortal
    class VisitInstructionsController < BaseController
      DEFAULT_PER_PAGE = 10
      MAX_PER_PAGE = 25

      def index
        page = positive_param(:page, default: 1)
        per_page = positive_param(:per_page, default: DEFAULT_PER_PAGE, maximum: MAX_PER_PAGE)
        items = instruction_items
        total = items.length
        visible = items.slice((page - 1) * per_page, per_page) || []

        record_portal_read("patient_portal.visit_instructions.read")
        render json: { items: visible, pagination: { page:, per_page:, total: } }
      end

      private

      def instruction_items
        notes = Clinic::EncounterNote.where(
          practice: portal_practice, patient: portal_patient, note_kind: "soap"
        ).joins(:encounter).where(
          clinic_encounters: { status: "completed" }
        ).where.not(
          clinic_encounters: { ended_at: nil }
        ).includes(:encounter, revisions: :signatures)

        notes.filter_map do |note|
          revision = note.revisions.select { |candidate| candidate.signatures.any? }.max_by(&:revision_no)
          next unless revision

          instructions = Clinic::Care::SoapNotePayload.load!(revision.encrypted_body)[:patient_instructions]
          next if instructions.blank?

          signature = revision.signatures.max_by { |candidate| [ candidate.signed_at, candidate.id ] }
          {
            encounter_id: note.encounter_id,
            visit_at: note.encounter.started_at&.iso8601(6),
            signed_at: signature.signed_at.iso8601(6),
            instructions:
          }
        end.sort_by do |item|
          [ item.fetch(:visit_at), item.fetch(:encounter_id) ]
        end.reverse
      end

      def positive_param(name, default:, maximum: 1_000_000)
        return default unless params[name].present?

        bounded_integer!(params[name], field: name, min: 1, max: maximum)
      end
    end
  end
end
