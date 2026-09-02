import type { StaffMember } from "../../api/contracts";
import { Card, Field, Form, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

export function Staff() {
  const { capabilities } = useClinic();
  const canWrite = capabilities.staff_write === true;
  const { data, error, refresh } = useResource<{ staff: StaffMember[] }>(
    "/api/clinic/staff",
  );
  if (!data) return <LoadState error={error} />;
  return (
    <>
      <p className="eyebrow">YOUR TEAM</p>
      <h1>Employees.</h1>
      <Card title="Staff directory">
        <div className="clinic-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Job title</th>
                <th>Status</th>
                <th>Directory action</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((p) => (
                <tr key={p.id}>
                  <td>{p.display_name}</td>
                  <td>{p.job_title}</td>
                  <td>{p.active ? "Active" : "Inactive"}</td>
                  <td>
                    {canWrite ? (
                      <Form
                        endpoint={"/api/clinic/staff/" + p.id}
                        method="PATCH"
                        values={{ active: !p.active }}
                        submit={p.active ? "Mark inactive" : "Mark active"}
                        onSuccess={refresh}
                      />
                    ) : (
                      <span>Directory view</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.staff.length === 0 && <p>No staff entries yet.</p>}
      </Card>
      {canWrite && (
        <Card title="Add employee">
          <Form
            endpoint="/api/clinic/staff"
            submit="Add staff entry"
            onSuccess={refresh}
          >
            <Field
              name="clinic_staff_member[display_name]"
              label="Name"
              maxLength={120}
            />
            <Field
              name="clinic_staff_member[job_title]"
              label="Job title"
              maxLength={120}
            />
          </Form>
          <p>
            No login, clinical authority, or access grant is created or revoked
            by these controls.
          </p>
        </Card>
      )}
    </>
  );
}
