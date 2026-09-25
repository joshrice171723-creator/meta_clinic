import { useState } from "react";
import { ClickAwayListener, IconButton, Tooltip } from "@mui/material";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

const explanations: Record<string, string> = {
  "Pharmacy partner economics":
    "A possible revenue arrangement with a pharmacy partner. The difference between retail price and pharmacy cost is a gross spread; Meta Clinic's share must be established by agreement.",
  "2% platform fee via Stripe":
    "A proposed fee Meta Clinic would charge on eligible payments, collected using Stripe Connect. It is not a 2% payment from Stripe and does not replace Stripe's processing fees.",
  "Jane Practice + 2 seats":
    "Scheduling and patient-chart software for three bookable providers. A seat means one provider account in this comparison.",
  "Hint membership billing":
    "Software for managing clinic memberships: enroll patients, collect recurring fees, and track membership status. The budget models it as a separate subscription.",
  "HubSpot CRM":
    "Customer relationship management software: tracks prospective patients, outreach, and follow-up before they become active patients.",
  "DoseSpot eRx seats":
    "Electronic prescribing accounts that let clinicians send prescriptions to pharmacies. The estimate covers three prescribers.",
  "Jane AI Scribe · 3 seats":
    "An optional note-drafting assistant inside Jane. This estimate includes one subscription for each of three clinicians.",
  "Additional software subtotal":
    "Membership billing, CRM, prescribing and scribe subscriptions added together. This subtotal excludes Jane's base subscription.",
  "Total software bill":
    "The modeled monthly total of Jane plus the listed additional tools. It excludes staff wages, medication purchases and implementation fees.",
  "Flat monthly platform fee":
    "The proposed recurring subscription for this three-provider practice. Implementation and usage overages are separate.",
  "Monthly software saving":
    "The current modeled software bill minus Meta Clinic's proposed monthly subscription.",
  "Software cost reduction":
    "Monthly software savings divided by the current software bill, expressed as a percentage.",
  "Annual recurring saving":
    "Twelve months of subscription savings; excludes one-time migration and implementation expenses.",
  "eRx prescriber seats":
    "Vendor accounts for electronically sending prescriptions. A clinic can use eRx without owning a pharmacy.",
  "Twilio Video usage":
    "The video-call infrastructure budget. Usage is counted per participant-minute: two people on a 30-minute call use 60 participant-minutes.",
  "AI scribe processing":
    "The cost of processing consultation audio and generating draft clinical notes. Clinicians review the drafts.",
  "Clearinghouse / entity mapping":
    "A clearinghouse routes insurance claims between a clinic and payers. Entity mapping connects submissions to the correct independently owned clinic.",
  "Incremental vendor estimate":
    "The additional monthly vendor expense for one more clinic, separate from the shared platform base.",
  "Software contribution":
    "Subscription revenue minus this clinic's incremental vendor expense. Shared platform costs and other operating expenses are deducted separately.",
  "Contribution / subscription":
    "The percentage of subscription revenue remaining after incremental vendor expense: $600 divided by $1,100.",
  "Illustrative spread / order":
    "An example patient price of $120 minus a $45 pharmacy charge leaves $75 before other transaction costs. These are scenario assumptions.",
  "30 orders × $75 gross spread":
    "An illustrative 30 monthly orders multiplied by the $75 spread. It excludes fulfillment, processing, refunds and tax, and is not included in software revenue.",
  "Fixed upfront capital pool":
    "One-time shared setup spending. It is not charged again for every clinic and is separate from monthly operating costs.",
  "Central platform + first clinic":
    "The shared monthly vendor budget already includes the first clinic. Only the other nine clinics receive additional per-clinic costs.",
  "Nine additional independent sites":
    "Nine separate clinic businesses added to the first clinic, each modeled with a $500 monthly vendor bundle.",
  "Total network software costs":
    "The $3,200 shared base plus nine additional $500 clinic bundles: $7,700 per month.",
  "Total network software revenue":
    "Ten clinic owners each paying the proposed $1,100 monthly subscription: $11,000 total.",
  "Network software contribution":
    "Combined subscriptions minus the modeled network vendor costs. This is before other operating expenses and excludes pharmacy transaction revenue.",
  "Allocated expense / account":
    "Total modeled network software costs divided equally across ten clinics. This is an average, not the cost of adding the next clinic.",
  "Allocated contribution / account":
    "Network software contribution divided by ten clinic accounts after allocating the shared platform expense.",
  "AI Infrastructure & Workstation Hardware":
    "Shared developer hardware and AI computing budget used to build and operate the platform.",
  "Healthcare legal & contracts":
    "Budget for platform service agreements and business associate agreements defining responsibilities for handling health information.",
  "DEA EPCS Compliance Audit":
    "EPCS means electronic prescribing of controlled substances. This allowance covers the relevant application audit or certification work, depending on vendor scope.",
  "LegitScript certification":
    "A healthcare merchant review program used by some payment and advertising partners. This is a certification budget, not a payment approval guarantee.",
  "Prescription Network API (eRx)":
    "An API is a software connection. This connection would route prescription information between Meta Clinic and the prescribing network.",
  "Insurance billing engine":
    "Software that prepares insurance claims and manages submission and response workflows.",
  "HIPAA Telehealth Video API":
    "Video-call infrastructure for clinical consultations. Health-data use requires the appropriate vendor agreement and security configuration.",
  "AI Clinical Scribe Engine":
    "Audio and AI processing that creates draft clinical documentation for a clinician to review.",
  "Security & HIPAA hosting":
    "Infrastructure for storing and processing health information with access controls, isolation and audit logging.",
  "B2B Compounding Labs & Diagnostics":
    "Business-to-business connections to partner pharmacies and diagnostic labs for orders, status updates and results.",
  "Small-clinic deck range / mo":
    "The proposed monthly organization-level price range from the sales deck, rather than a price per individual provider.",
  "Workflow scope":
    "The specialty-specific workflows the proposed offering needs to support.",
  "503A partner webhooks":
    "Connections that send order or status updates between the platform and a partner compounding pharmacy. Compounding prepares medication for an individual patient's prescription.",
  "Quest/Labcorp order/result tracking":
    "Connections for sending diagnostic lab orders and receiving their status and results back into the clinic workspace.",
  "Cash-pay / membership":
    "Patients pay the clinic directly, either for individual services or through recurring memberships.",
  "Insurance-enabled":
    "The clinic bills health insurers for covered services and manages claims and payer responses.",
};
export function I2eHelp({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const explanation = explanations[label];
  if (!explanation) return <>{label}</>;
  return (
    <span>
      {label}
      <ClickAwayListener onClickAway={() => setOpen(false)}>
        <span className="i2e-help">
          <Tooltip
            title={explanation}
            describeChild
            arrow
            open={open}
            onOpen={() => setOpen(true)}
            onClose={() => setOpen(false)}
            disableTouchListener
            slotProps={{
              tooltip: { sx: { fontSize: 12, lineHeight: 1.5, maxWidth: 320 } },
            }}
          >
            <IconButton
              size="small"
              aria-label={`Explain ${label}`}
              onClick={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
            >
              <InfoOutlined sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </span>
      </ClickAwayListener>
    </span>
  );
}
