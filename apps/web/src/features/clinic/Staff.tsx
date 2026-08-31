import type { StaffMember } from "../../api/contracts";
import { Card, Field, Form, LoadState, useResource } from "../../shared/ui";

export function Staff() {
  const { data, error, refresh } = useResource<{ staff: StaffMember[] }>(
    "/api/clinic/staff",
  );
  if (!data) return <LoadState error={error} />;
  return (
    <>
      <p className="eyebrow">YOUR TEAM</p>
      <h1>Employees.</h1>
      <p>
        A synthetic directory. Employment records, payroll, schedules,
        invitations, and account permissions are not managed here.
      </p>
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
                    <Form
                      endpoint={"/api/clinic/staff/" + p.id}
                      method="PATCH"
                      values={{ active: !p.active }}
                      submit={p.active ? "Mark inactive" : "Mark active"}
                      onSuccess={refresh}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.staff.length === 0 && <p>No staff entries yet.</p>}
      </Card>
      <Card title="Add a fictional employee">
        <Form
          endpoint="/api/clinic/staff"
          submit="Add staff entry"
          onSuccess={refresh}
        >
          <Field
            name="clinic_staff_member[display_name]"
            label="Fictional name"
            maxLength={120}
          />
          <Field
            name="clinic_staff_member[job_title]"
            label="Job title"
            maxLength={120}
          />
        </Form>
        <p>
          No login, clinical authority, or access grant is created or revoked by
          these controls.
        </p>
      </Card>
    </>
  );
}
