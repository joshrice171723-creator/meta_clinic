import type { ReactNode } from "react";
import type { ClinicOverview } from "../../api/contracts";
import { Card } from "../../shared/ui";
import { OperationFollowUps } from "./OperationFollowUps";
import { useClinic, useClinicOverview } from "./Workspace";

export function OperationsView({
  clinic,
  facilitiesRead = false,
  followUps,
}: {
  clinic: ClinicOverview;
  facilitiesRead?: boolean;
  followUps?: ReactNode;
}) {
  const c = clinic.capabilities;
  return (
    <>
      <p className="eyebrow">PRACTICE OPERATIONS</p>
      <h1>Operations</h1>
      <p className="clinic-lead">
        Keep follow-ups moving, review supplies, and manage the clinic's daily work.
      </p>
      {followUps}
      <div className="clinic-stats">
        {c.inventory_access && (
          <a className="clinic-stat" href="/clinic/inventory">
            <span>Office items to reorder</span>
            <strong>{clinic.low_stock?.length ?? "—"}</strong>
            <small>Review office inventory ↗</small>
          </a>
        )}
        {c.staff_access && (
          <a className="clinic-stat" href="/clinic/staff">
            <span>Active directory entries</span>
            <strong>{clinic.active_staff_count ?? "—"}</strong>
            <small>Manage employees ↗</small>
          </a>
        )}
        {c.patients_access && (
          <a className="clinic-stat" href="/clinic/patients">
            <span>Patients in directory</span>
            <strong>{clinic.patient_count ?? "—"}</strong>
            <small>Not today’s visit count · Open directory ↗</small>
          </a>
        )}
      </div>
      <div className="clinic-grid">
        <Card title="Office stock to review">
          {!c.inventory_access || clinic.low_stock === null ? (
            <p>Inventory details are restricted to assigned inventory users.</p>
          ) : clinic.low_stock.length === 0 ? (
            <p>No office items are currently at the reorder level.</p>
          ) : (
            <ul className="stock-alerts">
              {clinic.low_stock.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong>
                  <span>
                    {item.quantity} on hand · reorder at {item.reorder_level}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {c.inventory_access && (
            <a className="text-link" href="/clinic/inventory">
              Review office inventory →
            </a>
          )}
        </Card>
        <Card title="Workspace shortcuts">
          <ul className="clinic-feature-list">
            {c.staff_access && (
              <li>
                <a className="text-link" href="/clinic/staff">
                  Employees →
                </a>
                <p>
                  Directory entries do not create logins or change permissions.
                </p>
              </li>
            )}
            {facilitiesRead && (
              <li>
                <a className="text-link" href="/clinic/facilities">
                  Facilities and visit types →
                </a>
                <p>
                  Maintain clinic sites, operating hours and the visit choices
                  used for scheduling. Inventory storage locations stay
                  separate.
                </p>
              </li>
            )}
            <li>
              <a className="text-link" href="/clinic/settings">
                My settings →
              </a>
              <p>Appearance preferences for your signed-in account.</p>
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}

export function Operations() {
  const context = useClinic();
  const overview = useClinicOverview();
  return (
    <>
      <OperationsView
        clinic={overview}
        facilitiesRead={context.capabilities.facilities_read === true}
        followUps={<OperationFollowUps />}
      />
      <Card title="Care workflow access">
        <ul className="clinic-feature-list">
          {context.capabilities.patients && (
            <li>
              <a className="text-link" href="/clinic/schedule">
                Schedule and encounters →
              </a>
              <p>
                Schedule appointments, open visits, and review encounter history.
              </p>
            </li>
          )}
        </ul>
      </Card>
    </>
  );
}
