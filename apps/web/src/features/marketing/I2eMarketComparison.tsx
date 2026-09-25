import { useState } from "react";
import {
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { clinicMarkets, janeProfiles } from "./i2eMarketData";
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
const sizes = [
  "Solo / micro",
  "Small clinic",
  "Established group",
  "Midsize group",
  "Large regional",
] as const;
const range = (value: string) => "$" + value.replace("–", "–$");
export function switchingEconomics(
  current: number,
  discount: number,
  clinics: number,
  extra: number,
) {
  const offer = current * (1 - discount / 100);
  const cost = (3200 + (clinics - 1) * 500) / clinics + extra;
  return {
    offer,
    cost,
    saving: current - offer,
    annualSaving: (current - offer) * 12,
    contribution: offer - cost,
    minimumCurrent: cost / (1 - discount / 100),
  };
}
export function I2eClinicMarkets() {
  const [size, setSize] = useState(1);
  const [market, setMarket] = useState(0);
  const [profile, setProfile] = useState(0);
  const [current, setCurrent] = useState("1354");
  const [discount, setDiscount] = useState("20");
  const [clinics, setClinics] = useState("10");
  const [extra, setExtra] = useState("0");
  const validNumber = (s: string, min: number, max: number) =>
    s.trim() !== "" &&
    Number.isFinite(Number(s)) &&
    Number(s) >= min &&
    Number(s) <= max;
  const validCurrent = validNumber(current, 0, 100000),
    validDiscount = validNumber(discount, 0, 90),
    validClinics =
      validNumber(clinics, 1, 1000) && Number.isInteger(Number(clinics)),
    validExtra = validNumber(extra, 0, 100000);
  const valid = validCurrent && validDiscount && validClinics && validExtra;
  const e = valid
    ? switchingEconomics(
        Number(current),
        Number(discount),
        Number(clinics),
        Number(extra),
      )
    : null;
  const selected = clinicMarkets[market];
  const selectedProfile = janeProfiles[profile];
  return (
    <>
      <section id="clinic-markets">
        <div className="i2e-heading">
          <h2>🏥 Ten clinic types / specific reasons to switch</h2>
          <TextField
            select
            label="Sales-deck organization size"
            size="small"
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          >
            {sizes.map((name, index) => (
              <MenuItem key={name} value={index}>
                {name}
              </MenuItem>
            ))}
          </TextField>
        </div>
        <p>
          <strong>
            Sell a lower total software bill and a more connected clinic
            workflow.
          </strong>{" "}
          Start with the clinic's current invoices and required capabilities.
          Replace only tools whose workflows we can demonstrate end to end; do
          not count labor, medication markups or hypothetical staffing savings.
        </p>
        <TableContainer
          className="i2e-grid"
          tabIndex={0}
          role="region"
          aria-label="Ten clinic market scenarios"
        >
          <Table size="small" aria-label="Ten clinic market scenarios">
            <TableHead>
              <TableRow>
                {[
                  "Clinic type",
                  "Payment model",
                  "Published monthly range",
                  "Published implementation",
                  "Why switch to Meta Clinic?",
                  "Proof required before promising replacement",
                ].map((x) => (
                  <TableCell key={x}>{x}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {clinicMarkets.map((row) => (
                <TableRow key={row.name}>
                  <TableCell component="th" scope="row">
                    {row.name}
                  </TableCell>
                  <TableCell>{row.payment}</TableCell>
                  <TableCell>{range(row.prices[size])}</TableCell>
                  <TableCell>{range(row.implementation[size])}</TableCell>
                  <TableCell>{row.switchReason}</TableCell>
                  <TableCell>
                    {row.proof}
                    {row.complex && (
                      <small>
                        Specialty usage and integration costs need their own
                        quote.
                      </small>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <p className="i2e-note">
          All ten markets and all five size ranges come from the{" "}
          <a
            href="https://meta-clinic-market-deck.trt53.chatgpt.site/"
            target="_blank"
            rel="noopener noreferrer"
          >
            published sales deck
          </a>
          , verified September 25, 2026. Those are proposed customer prices, not
          validated costs or launch-ready offerings. The $500 incremental
          estimate is a three-provider reference, not a cost quote for every
          specialty or organization size.
        </p>
      </section>
      <section id="switching">
        <div className="i2e-heading">
          <h2>↔️ Can we charge less and provide more?</h2>
          <span>Software-only offer test / no pharmacy revenue subsidy</span>
        </div>
        <p>
          <strong>
            Yes, if the clinic's replaceable software spend is above our
            sustainable price floor.
          </strong>{" "}
          Jane already includes scheduling, charting and 1:1 telehealth, and
          offers memberships, billing and lab integrations. The opportunity is
          deeper connected workflows and a lower combined bill—not a claim that
          those features are absent from Jane.{" "}
          <a href="https://jane.app/pricing">
            Jane feature and pricing reference
          </a>
          .
        </p>
        <TableContainer
          className="i2e-grid"
          tabIndex={0}
          role="region"
          aria-label="Two Jane clinic profiles"
        >
          <Table size="small" aria-label="Two Jane clinic profiles">
            <TableHead>
              <TableRow>
                {[
                  "Jane clinic profile",
                  "Current software bill to compare",
                  "Meta Clinic switching offer",
                  "Required replacement proof",
                ].map((heading) => (
                  <TableCell key={heading}>{heading}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {janeProfiles.map((row) => (
                <TableRow key={row.name}>
                  <TableCell component="th" scope="row">
                    {row.name}
                  </TableCell>
                  <TableCell>{row.current}</TableCell>
                  <TableCell>{row.offer}</TableCell>
                  <TableCell>{row.proof}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <p className="i2e-note">
          These are two competitor comparison profiles, separate from the ten
          specialties. Use the clinic's actual invoice total below. Selecting a
          profile does not invent a Jane price or change the shared reference
          cost; cash-pay and insurance vendor bundles still need separate
          quotes.
        </p>
        <div className="i2e-switch-inputs">
          <TextField
            select
            label="Current Jane clinic profile"
            size="small"
            value={profile}
            onChange={(event) => setProfile(Number(event.target.value))}
          >
            {janeProfiles.map((row, index) => (
              <MenuItem key={row.name} value={index}>
                {row.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Clinic type for offer"
            size="small"
            value={market}
            onChange={(event) => setMarket(Number(event.target.value))}
          >
            {clinicMarkets.map((row, index) => (
              <MenuItem key={row.name} value={index}>
                {row.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Current replaceable software spend ($/mo)"
            type="number"
            size="small"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            error={!validCurrent}
            helperText="Default $1,354 is the illustrative stack below. Replace with actual invoices."
          />
          <TextField
            label="Desired customer saving (%)"
            type="number"
            size="small"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            error={!validDiscount}
            helperText="Choose 0–90%. This is a proposed offer, not approved pricing."
          />
          <TextField
            label="Active independent clinics"
            type="number"
            size="small"
            value={clinics}
            onChange={(e) => setClinics(e.target.value)}
            error={!validClinics}
            helperText="Whole clinics, 1–1,000; allocates the shared platform expense."
          />
          <TextField
            label="Extra cost allowance per clinic ($/mo)"
            type="number"
            size="small"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            error={!validExtra}
            helperText="Add specialty usage, support, hosting, account fees and other costs; $0 means unbudgeted."
          />
        </div>
        {e ? (
          <>
            <TableContainer
              className="i2e-grid"
              tabIndex={0}
              role="region"
              aria-label="Switching offer results"
            >
              <Table size="small" aria-label="Switching offer results">
                <TableHead>
                  <TableRow>
                    {[
                      "Proposed monthly price",
                      "Customer saves / month",
                      "Customer saves / year",
                      "Our allocated cost / month",
                      "Our contribution / month",
                    ].map((x) => (
                      <TableCell key={x}>{x}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>{money(e.offer)}</TableCell>
                    <TableCell>{money(e.saving)}</TableCell>
                    <TableCell>{money(e.annualSaving)}</TableCell>
                    <TableCell>{money(e.cost)}</TableCell>
                    <TableCell
                      className={e.contribution < 0 ? "i2e-negative" : ""}
                    >
                      {money(e.contribution)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
            <p role="status">
              <strong>
                {e.contribution <= 0
                  ? "Not sustainable at these inputs."
                  : selected.complex
                    ? "Potential price window; specialty costing is incomplete."
                    : "Potential price window under these assumptions."}
              </strong>{" "}
              {e.contribution <= 0
                ? "The proposed price does not cover the modeled expense. Reduce vendor costs, change the bundle, or target a clinic with higher replaceable software spend."
                : "Positive contribution is before unbudgeted expenses and is not net profit."}{" "}
              To cover {money(e.cost)} while offering {discount}% savings,
              current replaceable spend must be at least{" "}
              {money(e.minimumCurrent)} per month. A sustainable offer also
              needs a margin above that floor.
            </p>
          </>
        ) : (
          <p role="alert">
            Enter valid nonnegative amounts, a 0–90% saving, and a whole clinic
            count of 1–1,000.
          </p>
        )}
        <TableContainer
          className="i2e-grid"
          tabIndex={0}
          role="region"
          aria-label="Clinic switching proposition"
        >
          <Table size="small" aria-label="Clinic switching proposition">
            <TableBody>
              <TableRow>
                <TableCell component="th" scope="row">
                  Switching offer / {selectedProfile.name}
                </TableCell>
                <TableCell>
                  {selectedProfile.offer} {selectedProfile.proof}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">
                  Reason to choose us / {selected.name}
                </TableCell>
                <TableCell>{selected.switchReason}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">
                  What we must prove
                </TableCell>
                <TableCell>
                  {selected.proof} Validate scope, usage caps, external fees and
                  support before calling the bundle all-inclusive.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">
                  Switching cost
                </TableCell>
                <TableCell>
                  The published {sizes[size].toLowerCase()} implementation range
                  is {range(selected.implementation[size])}. Count migration,
                  overlapping subscriptions and implementation charges when
                  measuring first-year savings.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell component="th" scope="row">
                  Commercial approach
                </TableCell>
                <TableCell>
                  Price by specialty and usage, replace demonstrated workflows,
                  and quote third-party pass-through charges explicitly. Compete
                  on total software value; do not require drug sales or labor
                  savings to justify the subscription.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
        <p className="i2e-note">
          This offer calculator is independent of the network subscription
          assumption below and the published deck. Selecting a specialty changes
          the value proposition and implementation range, not the reference
          vendor cost; specialty costs still require validation.
        </p>
      </section>
    </>
  );
}
