import type { Material, Paperwork } from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";

export function Portal({ clinicAvailable }: { clinicAvailable: boolean }) {
  const docs = useResource<{ paperworks: Paperwork[] }>("/api/paperworks");
  const guides = useResource<{ materials: Material[] }>("/api/materials");
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
