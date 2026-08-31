module Launch
  class InquiriesQuery
    Result = Data.define(:inquiries, :next_cursor)

    def self.call(before: nil)
      records = ContactMessage.order(id: :desc)
      records = records.where("id < ?", before.to_i) if before.present?
      page = records.limit(51).to_a
      Result.new(inquiries: page.first(50), next_cursor: page.length > 50 ? page[49].id : nil)
    end
  end
end
