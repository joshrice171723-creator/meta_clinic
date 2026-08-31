'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const questions = [
  ['Who is APPly for?', 'Our initial focus is nurse practitioners and physician assistants planning cash-pay primary care or concierge-adjacent clinics in Sherman and North Texas. Your provider role, services, and location shape the appropriate launch plan.'],
  ['How much of the setup do you handle?', 'The model is hands-on execution: we organize the launch work, coordinate the moving parts, and help implement the systems. You provide key information, make owner and clinical decisions, and complete approvals or signatures that require you. The exact responsibilities are agreed before an engagement starts.'],
  ['What does the starter patient-record system look like?', 'The starting point is a SharePoint-based workflow informed by a real clinic’s setup. Configuration, access controls, agreements, and workflow review are part of the clinic-specific implementation discussion. No platform is automatically compliant just because it is used for healthcare.'],
  ['Do you provide legal advice or guarantee approval?', 'APPly coordinates clinic-launch work; it is not a law firm. Legal advice comes from qualified counsel. Entity structure, professional arrangements, and local requirements need clinic-specific review. We do not guarantee approvals or opening dates.'],
  ['Is support available after opening?', 'Ongoing support is part of the intended service model, with physician mentorship also being developed. Availability, responsibilities, and fees will be set out in your engagement. The launch package is the starting point—not an automatic enrollment in future software services.'],
];

export function Faq() {
  return <Accordion className="faq-list">{questions.map(([question, answer], i) => (
    <AccordionItem value={`question-${i}`} key={question}>
      <AccordionTrigger>{question}</AccordionTrigger>
      <AccordionContent><p>{answer}</p></AccordionContent>
    </AccordionItem>
  ))}</Accordion>;
}
