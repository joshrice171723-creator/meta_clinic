import { useState } from "react";
import { ClickAwayListener, IconButton, Tooltip } from "@mui/material";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

const explanations: Record<string, string> = {
  "1:1 telehealth":
    "Jane includes one-to-one telehealth in its plans at no extra subscription cost; group telehealth is an optional add-on. Meta Clinic's current model estimates Twilio usage for a stated visit volume, but excludes account/BAA requirements and other fees. Compare the actual usage and complete vendor costs.",
  "Pharmacy partner economics":
    "A possible revenue arrangement with a pharmacy partner. The difference between retail price and pharmacy cost is a gross spread; Meta Clinic's share must be established by agreement.",
  "2% platform fee via Stripe":
    "A proposed fee Meta Clinic would charge on eligible payments, collected using Stripe Connect. It is not a 2% payment from Stripe and does not replace Stripe's processing fees.",
  "Jane plan + provider seats":
    "Jane publishes monthly plan base prices. Thrive is $99/month and includes one full-time practitioner; additional practitioner licenses depend on booked hours. The exact three-provider total needs the provider schedule or Jane's account calculator. Meta Clinic's $400 hosting allowance is shared infrastructure, not a measured per-clinic cost, and build/support labor is not included.",
  "Hint Launch · alternative platform":
    "WHY HINT IS HERE: Hint's weight-management Launch platform lists EMR/charting, e-prescribing/refills, lab ordering/results, scheduling, membership management and billing. A clinic may choose it as a weight-management-focused system; it is a full-platform alternative to Jane, not a required Jane add-on. Jane Thrive already includes recurring packages/memberships, so a clinic that is satisfied with Jane would not need Hint just for membership billing. PRICE BASIS: Hint Launch is $290/month for one clinician plus $290/month per additional clinician: $870/month for three clinicians with unlimited members. Launch payment fees are cards 3% + $0.30 (+1% Amex) and ACH 1% + $0.25 (capped at $5). Hint Pro includes AI and employer-management/eligibility features; for 3 clinicians and 100 members the published formula gives $784/month ($320 + 2 × $232), before extra members, with separate transaction rates. Do not add Hint to Jane unless a real clinic invoice shows both. Meta's membership workflow is a launch target; employer features are not claimed as equivalent, and full feature/partner coverage needs validation.",
  "Jane memberships + payment processing":
    "Jane Thrive includes recurring packages/memberships, automated invoices, usage tracking and reports. Its published payment rates are 2.85% plus $0.25 for online card transactions and 2.6% plus $0.10 in person. Hint Launch is a separately priced full-platform alternative at $870/month for three clinicians; don't add it to Jane unless an actual clinic bill shows both. Stripe Connect's cost depends on payment architecture. If clinics pay Stripe directly, Stripe says no platform fee and standard online cards start at 2.9% plus $0.30 per successful charge. If Meta handles pricing, Connect adds $2 per active account/month and 0.25% plus $0.25 per payout, as well as processing. Without transaction volume and a decided architecture, the full Meta cost is unknown.",
  "CRM / HubSpot optional reference":
    "Jane includes patient records, secure messaging and routine patient follow-up, and offers a TrustDrivenCare integration. A separate CRM is optional for lead pipeline or marketing automation. HubSpot currently lists CRM Free at $0 for up to two users and 1,000 contacts; Starter shows promotional $7/seat/month and standard monthly $20/seat. Those tiers have different limits. Meta's product engineering, messaging, hosting allocation and support cost are not separately allocated per clinic.",
  "Medication records and e-prescribing":
    "Jane's medication list/history, chart templates and fax workflow do not mean the app electronically transmits prescriptions to pharmacies. Jane's U.S. Medical Hub describes direct e-prescribing as upcoming, so don't count it as a currently included live feature. Meta's market-launch target uses Photon, which publishes $800/month for up to 2,000 orders and $0.80 per additional order; that is a shared central vendor tier, not a verified per-clinic quote or proof that required controlled-substance and pharmacy-network scope is covered.",
  "Jane AI Scribe · 3 seats":
    "WHY IT IS HERE: this is an optional, directly comparable note-drafting capability. Jane publishes $15/month per opted-in practitioner for unlimited AI Scribe notes, so three paid seats total $45/month; eligible Jane plans include five notes/month at no charge. The $45 applies only if all three clinicians choose the paid tier. Meta Clinic's target is a clinician-reviewed draft-note workflow; the page's model-processing cost is an internal usage assumption, not a vendor quote or a claim that the workflows are clinically equivalent.",
  "Insurance billing engine":
    "Jane publishes a $20/month Insurance Billing add-on plus $5 per added full-time practitioner license or $2.50 per part-time license. The Claim.MD clearinghouse account is separate. It is optional and excluded from this cash-pay example. Meta Clinic budgets $1,500/month centrally for Candid, but that is an internal allowance, not a Candid quote; separate-clinic coverage and additional fees remain unknown.",
  "Quest/Labcorp order/result tracking":
    "Jane's Fullscript connection supports supplements and U.S. lab orders/results, but labs exclude NY, NJ, RI, HI and offshore U.S. territories; test prices vary. Meta Clinic has not selected or contracted a lab partner. Healthie's $10/provider/month plus $5/non-NPI-user listing is a comparator requiring Enterprise and separate setup/testing; it is not a Meta quote. The interface and launch coverage must be confirmed before claiming parity.",
  "503A partner pharmacy orders/status":
    "Jane's integration directory does not establish universal order/status connectivity with every 503A pharmacy. Verify the specific pharmacy, workflow and fee with the clinic. Meta Clinic has not selected a partner; both fixed and per-order costs are unknown. A zero budget line means unpriced, not free.",
  "Additional software subtotal":
    "No generic Jane-plus-add-ons subtotal is shown. Build a competitor baseline from the clinic's Jane plan and actual third-party invoices, excluding features already in its Jane plan and optional tools it does not use.",
  "Total software bill":
    "A modeled comparison only, not a quote or verified current bill. Reconcile the Jane plan and any third-party subscriptions to actual clinic invoices; staff wages, medication purchases and implementation fees are excluded.",
  "Flat monthly platform fee":
    "The proposed recurring subscription for this three-provider practice. Implementation and usage overages are separate.",
  "Monthly software saving":
    "No savings figure is claimed until a real clinic's Jane plan and invoices are compared against the target Meta Clinic offer, after confirming equivalent workflows and including required third-party, transaction and implementation costs.",
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
  "Added clinic vendor cost / month":
    "After the central vendor stack is funded, one added cash-pay clinic is modeled to add $30 in video use and $30 for 125 scribe notes monthly. Entity, lab, pharmacy, payment and overage costs remain unquoted.",
  "Profit after modeled added costs / month":
    "The proposed $1,100 subscription minus $60 in modeled additional vendor usage leaves $1,040 before unquoted added-clinic expenses. This does not subtract the already-funded $2,960 central stack.",
  "Profit margin after modeled added costs":
    "$1,040 divided by the $1,100 subscription is 94.5% after the two modeled added-clinic usage lines, before unquoted fees and other operating expenses.",
  "Illustrative spread / order":
    "An example patient price of $120 minus a $45 pharmacy charge leaves $75 before other transaction costs. These are scenario assumptions.",
  "30 orders × $75 gross spread":
    "An illustrative 30 monthly orders multiplied by the $75 spread. It excludes fulfillment, processing, refunds and tax, and is not included in software revenue.",
  "Fixed upfront capital pool":
    "One-time shared setup spending. It is not charged again for every clinic and is separate from monthly operating costs.",
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
  "HIPAA Telehealth Video API":
    "Twilio lists video at $0.004 per participant-minute. A two-person 30-minute visit uses 60 participant-minutes, or $0.24 before extras. Health-data use requires the appropriate account edition and BAA.",
  "Photon Health · proposed":
    "Photon's published API Launch plan is one $800 monthly central fee for up to 2,000 orders, then $0.80 per additional order. A new clinic does not trigger a second published base fee within that tier; multi-entity terms need confirmation.",
  "Twilio Programmable Video":
    "Twilio publishes $0.004 per participant-minute. The central budget includes $150/month of existing usage; 125 two-person, 30-minute visits at the added clinic would add $30 before extras. HIPAA account edition and BAA terms need confirmation.",
  "Candid Health · proposed":
    "Candid offers claims and revenue-cycle software. $1,500 is a central planning allowance, not a published price. Its API supports organization-scoped records, but one contract covering separately owned clinics has not been confirmed; entity enrollment and claim fees need a quote.",
  "Whisper + GPT-5.6 Luna usage model":
    "Target cost scenario: Whisper-1 transcribes 30 audio minutes per note at $0.006/min; GPT-5.6 Luna processes 6,000 input and 2,000 output tokens at $0.20/M and $1.20/M. For 125 notes this is $22.95 in model usage, about $24.21 with OpenRouter's standard 5.5% credit-purchase fee, budgeted at $30 after a 10% reserve and rounding. This is an explicit workload model, not a vendor subscription quote or validated production usage cost.",
  "AI Clinical Scribe Engine":
    "At 500 notes of 30 audio minutes each, Whisper-1 plus GPT-5.6 Luna costs about $96.85 including an effective 5.5% OpenRouter credit-purchase fee; with a 10% reserve rounded up, the central allowance is $110. One added clinic's 125 notes costs about $24.21, budgeted at $30. This is a workload model, not a vendor quote or guaranteed note capacity.",
  "Security & HIPAA hosting":
    "Infrastructure for storing and processing health information with access controls, isolation and audit logging.",
  "B2B Compounding Labs & Diagnostics":
    "Business-to-business connections to partner pharmacies and diagnostic labs for orders, status updates and results.",
  "Small-clinic deck range / mo":
    "The proposed monthly organization-level price range from the sales deck, rather than a price per individual provider.",
  "Workflow scope":
    "The specialty-specific workflows the proposed offering needs to support.",
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
              tooltip: {
                sx: {
                  fontSize: 12,
                  lineHeight: 1.5,
                  maxWidth: 460,
                  maxHeight: "65vh",
                  overflowY: "auto",
                },
              },
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
