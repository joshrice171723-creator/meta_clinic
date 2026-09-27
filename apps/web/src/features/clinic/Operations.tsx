import type { ReactNode } from "react";
import type { ClinicOverview } from "../../api/contracts";
import { Card } from "../../shared/ui";
import { LabReviewWorklist } from "./LabReviewWorklist";
import { LabFollowUpWorklist } from "./LabFollowUpWorklist";
import { OperationFollowUps } from "./OperationFollowUps";
import { OperationsProviderReadiness } from "./OperationsProviderReadiness";
import { OperationsIntegrationInventory } from "./OperationsIntegrationInventory";
import { OperationsReportsCatalog } from "./OperationsReportsCatalog";
import { OperationsWorkflowGuide } from "./OperationsWorkflowGuide";
import { useClinic, useClinicOverview } from "./Workspace";

export function OperationsView({
  clinic,
  facilitiesRead = false,
  billingRead = false,
  readinessAndReports,
  followUps,
}: {
  clinic: ClinicOverview;
  facilitiesRead?: boolean;
  billingRead?: boolean;
  readinessAndReports?: ReactNode;
  followUps?: ReactNode;
}) {
  const c = clinic.capabilities;
  return (
    <>
      <p className="eyebrow">PRACTICE OPERATIONS</p>
      <h1>Operations</h1>
      <p className="clinic-lead">
        Keep follow-ups moving, review supplies, and manage the clinic's daily
        work.
      </p>
      {readinessAndReports}
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
        <Card title="Clinic setup">
          <ul className="clinic-feature-list">
            {facilitiesRead && (
              <li>
                <a className="text-link" href="/clinic/setup">
                  Clinic profile, facilities, and visit types →
                </a>
                <p>Set up sites, operating hours, and appointment choices.</p>
              </li>
            )}
            {c.staff_access && (
              <li>
                <a className="text-link" href="/clinic/staff">
                  Workforce access →
                </a>
                <p>Set up employees, work sites, and effective access dates.</p>
              </li>
            )}
            {c.inventory_access && (
              <li>
                <a className="text-link" href="/clinic/inventory">
                  Inventory locations →
                </a>
                <p>
                  Configure storage before receiving or administering stock.
                </p>
              </li>
            )}
            {billingRead && (
              <li>
                <a className="text-link" href="/clinic/billing">
                  Services and payments →
                </a>
                <p>
                  Review billable services, invoices, and collection workflows.
                </p>
              </li>
            )}
          </ul>
        </Card>
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
                <a className="text-link" href="/clinic/setup">
                  Clinic profile, facilities, and visit types →
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
        billingRead={context.capabilities.billing_read === true}
        readinessAndReports={
          <>
            <OperationsWorkflowGuide capabilities={context.capabilities} />
            <div className="clinic-grid">
              <OperationsProviderReadiness
                canConfigureTelehealth={
                  context.capabilities.telehealth_configure === true
                }
              />
              <OperationsIntegrationInventory
                canReadBilling={context.capabilities.billing_read === true}
                canReadClinical={
                  context.capabilities.clinical_records_read === true
                }
              />
              <OperationsReportsCatalog
                capabilities={context.capabilities}
                siteId={context.current_site?.id}
              />
            </div>
          </>
        }
        followUps={
          <>
            <LabReviewWorklist />
            <LabFollowUpWorklist />
            <OperationFollowUps />
          </>
        }
      />
      <Card title="Care workflow access">
        <ul className="clinic-feature-list">
          {context.capabilities.patients && (
            <li>
              <a className="text-link" href="/clinic/schedule">
                Schedule and encounters →
              </a>
              <p>
                Schedule appointments, open visits, and review encounter
                history.
              </p>
            </li>
          )}
        </ul>
      </Card>
    </>
  );
}
