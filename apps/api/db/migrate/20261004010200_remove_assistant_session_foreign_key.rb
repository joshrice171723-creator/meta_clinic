class RemoveAssistantSessionForeignKey < ActiveRecord::Migration[8.1]
  def change
    remove_foreign_key :clinic_assistant_contexts, column: :member_session_id
  end
end
