# Original, non-clinical examples. No accounts, patient data, or actual packet forms.
# Tests create their own records, independent of whether db:prepare ran first.
return if Rails.env.test? || !DemoContent.enabled?
samples = [
  {
    slug: "sample-launch-work",
    title: "How to organize your clinic launch",
    summary: "Turn a long list of open tasks into a manageable next step.",
    body: "SAMPLE GUIDE\n\n1. Keep one working list\nCapture business setup tasks in a single place. Give each task a clear outcome, an owner, and any dependency. Avoid copying sensitive documents into a general task list.\n\n2. Separate action from waiting\nA task you can act on today is different from one waiting on a vendor, reviewer, or decision. Record what you are waiting for and who will follow up.\n\n3. Choose the next concrete action\nReplace broad labels such as 'office setup' with a small observable action, such as 'confirm the delivery window for desks.'\n\n4. Review together\nUse a short recurring team check-in to confirm what moved, what is blocked, and what needs a decision. Agree the cadence with the people doing the work.\n\nTry it\nChoose one open business task and write its next action, owner, and dependency. This exercise is not a legal or clinical readiness assessment."
  },
  {
    slug: "sample-daily-routine",
    title: "How to build a daily operations checklist",
    summary: "Create a repeatable opening and closing routine for the business side of your clinic.",
    body: "SAMPLE GUIDE\n\n1. Observe the actual workflow\nStart with what the team does to open and close the workspace. List practical business tasks: checking office equipment, reviewing vendor messages, and preparing shared work areas.\n\n2. Make each line observable\nWrite a clear action instead of 'everything ready.' Identify who checks it and what to do when it cannot be completed.\n\n3. Keep it separate from clinical protocols\nPatient-care, medication, infection-control, and other clinical procedures require their own qualified review. This generic office checklist does not replace them.\n\n4. Test a small version\nWalk through the checklist with the team using synthetic scenarios. Remove unnecessary duplication and record the version you agree to use.\n\nTry it\nDraft five business-opening tasks and discuss who will own each one. Do not include patient identifiers or medical details."
  },
  {
    slug: "sample-supply-list",
    title: "How to organize your office supply list",
    summary: "Give ordinary office supplies a clear home, owner, and reorder process.",
    body: "SAMPLE GUIDE\n\n1. Start with ordinary office supplies\nUse a simple list for items such as paper, folders, and printer supplies. Record the item name, storage location, supplier reference, and person responsible for checking stock.\n\n2. Define a check routine\nChoose a practical review cadence based on actual use. Agree how the team flags items that need attention without sending duplicate requests.\n\n3. Make purchasing authority explicit\nKnow who may request, approve, and place an order. A checklist entry does not authorize spending. Keep order confirmations available to the appropriate team.\n\n4. Keep clinical inventory separate\nMedications, clinical devices, temperature-sensitive products, and other regulated items are outside this example. They need their own reviewed controls.\n\nTry it\nBuild a five-item office supply list using fictional quantities. The separate EHR/inventory product is not part of this portal."
  }
]
samples.each do |attributes|
  Launch::Material.find_or_create_by!(slug: attributes[:slug]) do |material|
    material.assign_attributes(attributes.except(:slug).merge(sample: true, published_at: Time.current))
  end
end
