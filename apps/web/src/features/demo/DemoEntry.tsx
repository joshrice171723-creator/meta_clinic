import type { ReactNode } from "react";
import { Button, LinearProgress } from "@mui/material";
import { MetaClinicMarketing } from "../marketing/MetaClinicMarketing";
import "./demoEntry.css";

export function DemoEntryLoading() {
  return (
    <DemoEntry>
      <div className="demo-entry__loading" role="status" aria-live="polite">
        <h2>Getting the clinic ready</h2>
        <LinearProgress aria-label="Loading the Meta Clinic demo" />
        <p>Checking your session and the shared workspace.</p>
        <Button variant="text" onClick={() => window.location.reload()}>
          Reload if this takes too long
        </Button>
      </div>
    </DemoEntry>
  );
}

export function DemoEntry({ children }: { children: ReactNode }) {
  return (
    <MetaClinicMarketing title="Explore the working demo - Meta Clinic">
      <main id="main" className="demo-entry meta-marketing__section">
        <section
          className="demo-entry__intro"
          aria-labelledby="demo-entry-title"
        >
          <h1 id="demo-entry-title">
            Step inside a <em>working clinic.</em>
          </h1>
          <p className="demo-entry__lead">
            Follow a clinic day from appointments to patient care, billing, and
            inventory. Choose an account to see the work from that perspective.
          </p>
          <div className="demo-entry__shared">
            <h2>A shared space to explore</h2>
            <p>
              This is a working demo with fictional people and records. Other
              visitors use the same clinic, so you may see their changes and
              they may see yours. Please keep real patient and sensitive
              information out of the demo.
            </p>
            <p>
              A nightly refresh is scheduled. It depends on the reset service
              being connected and ready, so it may not run every night. A reset
              removes shared changes and can end active sessions.
            </p>
          </div>
          <a className="demo-entry__tour-link" href="/meta-clinic/platform">
            Get to know the platform first
          </a>
        </section>
        <section className="demo-entry__panel" aria-label="Open the demo">
          {children}
        </section>
      </main>
    </MetaClinicMarketing>
  );
}
