import type { Material, Paperwork } from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";

export function Portal({ clinicAvailable }: { clinicAvailable: boolean }) {
  const docs = useResource<{ paperworks: Paperwork[] }>("/api/paperworks");
  const guides = useResource<{ materials: Material[] }>("/api/materials");
  const checklist = [
    {
      label: "Launch paperwork",
      href: "/paperwork",
      items: docs.data?.paperworks ?? [],
      completedCount: (docs.data?.paperworks ?? []).filter(
        (item) => item.status === "completed",
      ).length,
    },
    {
      label: "Training and onboarding",
      href: "/training",
      items: guides.data?.materials ?? [],
      completedCount: (guides.data?.materials ?? []).filter(
        (item) => item.status === "completed",
      ).length,
    },
  ];
  return (
    <>
      <div className="portal-intro">
        <p className="eyebrow">YOUR CLINIC LAUNCH, IN MOTION</p>
        <h1>
          A supported start.
          <br />
          <em>Your next step is here.</em>
        </h1>
        <p>
          Your launch paperwork and practical onboarding resources, in one
          place.
        </p>
      </div>
      <div className="portal-modules">
        <a href="/paperwork" className="portal-module">
          <span className="module-number">01 / YOUR LAUNCH PACKET</span>
          <h2>Paperwork.</h2>
          <p>
            Review your assigned documents, track what is started, and complete
            the signing steps that need you.
          </p>
          {docs.data ? (
            <p>
              {
                docs.data.paperworks.filter((d) => d.status === "completed")
                  .length
              }{" "}
              of {docs.data.paperworks.length} completed · Open paperwork ↗
            </p>
          ) : (
            <LoadState error={docs.error} />
          )}
        </a>
        <a href="/training" className="portal-module training-module">
          <span className="module-number">
            02 / GET READY TO RUN YOUR CLINIC
          </span>
          <h2>
            Onboarding
            <br />
            &amp; training.
          </h2>
          <p>
            Build confidence with written how-to guides and, later, Kevin's
            video walkthroughs.
          </p>
          {guides.data ? (
            <p>
              {
                guides.data.materials.filter((m) => m.status === "completed")
                  .length
              }{" "}
              of {guides.data.materials.length} guides completed · Explore
              training ↗
            </p>
          ) : (
            <LoadState error={guides.error} />
          )}
        </a>
      </div>
      <section
        className="portal-checklist"
        aria-labelledby="launch-checklist-heading"
      >
        <div>
          <p className="eyebrow">LAUNCH CHECKLIST</p>
          <h2 id="launch-checklist-heading">
            What is blocking your next step?
          </h2>
          <p>Each item stays with its source workspace and completion owner.</p>
        </div>
        <div className="portal-checklist-items">
          {checklist.map((item) => {
            const total = item.items.length;
            const complete = item.completedCount;
            const status =
              total === 0 ? "Not assigned" : `${complete} of ${total} complete`;
            return (
              <a
                href={item.href}
                className="portal-checklist-item"
                key={item.href}
              >
                <strong>{item.label}</strong>
                <span>{status}</span>
                <span>
                  {total === 0
                    ? "No blocking item is assigned."
                    : complete === total
                      ? "Complete"
                      : "Open source workspace"}
                </span>
              </a>
            );
          })}
        </div>
      </section>
      {clinicAvailable && (
        <section className="portal-bottom">
          <div>
            <h2>Your clinic, day to day.</h2>
            <p>
              Switch to the separate workspace for EHR, inventory, and employee
              management.
            </p>
          </div>
          <a href="/clinic">Open clinic workspace ↗</a>
        </section>
      )}
      <p className="portal-boundary">
        This launch portal contains no patient records. Clinic operations have a
        separate interface and access boundary. The packaged clinic product
        remains separately scoped and sold.
      </p>
    </>
  );
}
