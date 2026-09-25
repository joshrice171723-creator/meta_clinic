import { useState } from "react";
import { ClickAwayListener, IconButton, Tooltip } from "@mui/material";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

const explanations: Record<string, string> = {
  "1:1 telehealth":
    "A video visit between one clinician and one patient. Jane includes this in its base plan; Meta Clinic includes video in this proposed bundle.",
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
  "Vendor cost / clinic":
    "Estimated monthly vendor expense for this three-provider clinic, including eRx, video, scribe processing and insurance mapping. Shared platform costs are separate.",
  "Gross software profit / clinic":
    "The proposed $1,100 monthly subscription minus $500 in clinic-specific vendor costs. Shared platform and other operating costs are still deducted separately.",
  "Gross software profit margin":
    "The $600 gross software profit divided by the $1,100 subscription: 54.5%. This is before shared platform and other operating costs.",
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
    "A healthcare merchant review program used by some payment and advertising partners. LegitScript publishes a $975 application fee and $2,150 annual fee after approval. The page's $1,500 setup allowance is not its published price.",
  "Prescription Network API (eRx)":
    "Photon's published Launch plan costs $800 per month for 2,000 orders, with $0.80 per additional order. An API connects prescribing workflows to the vendor; production terms and supported data remain to be confirmed.",
  "Insurance billing engine":
    "Software that prepares insurance claims and manages submission and response workflows. The $1,500 monthly budget is an estimate, not a verified Candid price.",
  "HIPAA Telehealth Video API":
    "Twilio lists video at $0.004 per participant-minute. A two-person 30-minute visit uses 60 participant-minutes, or $0.24 before extras. Health-data use requires the appropriate account edition and BAA.",
  "Photon Health · proposed":
    "Photon's published Launch plan is $800 per month for 2,000 orders. The $195 per-clinic figure is a separate allocation estimate, not a Photon quote. Integration and terms are proposed.",
  "Twilio Programmable Video":
    "Twilio publishes $0.004 per participant-minute. The $125 per-clinic figure is a usage allocation estimate; HIPAA account edition and BAA terms add requirements.",
  "Candid Health · proposed":
    "Candid offers claims and revenue-cycle software. The $60 per-clinic and $1,500 central figures are planning allowances; a vendor quote is needed.",
  "OpenRouter · OpenAI GPT planned":
    "The development scribe already uses OpenRouter to route audio and SOAP draft requests. Its current default is not an OpenAI model; OpenAI GPT is planned for a future configuration. The $120 per-clinic cost is a usage estimate, not a vendor quote.",
  "AI Clinical Scribe Engine":
    "The development scribe uses OpenRouter for audio and draft notes that a clinician reviews. An OpenAI GPT audio model is planned; the $350 central budget is an estimate pending model selection and usage measurement.",
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
    "Planned connections for placing Quest or Labcorp orders and receiving results in the clinic workspace. The middleware account, interface setup and per-order test costs are not contracted or included in the shown $500 clinic estimate.",
  "Lab middleware · proposed":
    "Healthie publishes $10 per ordering provider monthly for Enterprise customers connecting existing Quest/Labcorp accounts, plus $5 per non-NPI ordering user. A three-provider example is $30 monthly before Enterprise subscription, interface setup and test costs. This is a market comparator, not Meta Clinic pricing.",
  "Diagnostic lab connectivity (Quest / Labcorp)":
    "Healthie's Enterprise E-Labs option supports orders and results for existing Quest/Labcorp accounts. Its published per-provider fee is only part of the cost; onboarding and enterprise terms require a quote, and Healthie says these interfaces typically take five months or longer.",
  "Wholesale clinical lab orders":
    "A prospective cash-pay lab catalog charges for each ordered test. Rupa publishes wholesale catalog prices plus a 7% processing fee passed to patients, with no practitioner subscription. Meta Clinic has not contracted a catalog or a markup.",
  "503A pharmacy partner workflows":
    "Planned electronic order and status exchange with licensed compounding pharmacies. Partner terms and transaction costs have not been contracted.",
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
