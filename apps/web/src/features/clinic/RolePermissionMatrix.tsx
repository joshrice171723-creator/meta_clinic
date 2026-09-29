import { useState } from "react";
import {
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import { Card, ResourceState, useResource } from "../../shared/ui";

type RoleVersion = {
  id: number;
  role_code: string;
  version: number;
  permissions: string[];
};

type RoleVersionsResponse = {
  role_versions: RoleVersion[];
  pagination: { total: number };
};

export function RolePermissionMatrix() {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const path = `/api/clinic/role_versions?page=${page + 1}&per_page=${rowsPerPage}`;
  const { data, error, refresh } = useResource<RoleVersionsResponse>(path);

  return (
    <Card title="Role and permission matrix">
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Permission codes name server-defined actions. Codes ending in .read or
          .write describe access type; other codes name specific actions. This
          table lists stored role definitions, not a person&apos;s active
          grants. A grant also carries practice or site scope and effective
          dates, and can be revoked.
        </Typography>
        {!data && !error && <ResourceState state="loading" />}
        {error && (
          <ResourceState state="error" message={error} onRetry={refresh} />
        )}
        {data && data.role_versions.length === 0 && (
          <ResourceState
            state="empty"
            message="No role definitions are available."
          />
        )}
        {data && data.role_versions.length > 0 && (
          <>
            <TableContainer sx={{ maxWidth: "100%", overflowX: "auto" }}>
              <Table
                size="small"
                aria-label="Role versions and permission codes"
                sx={{ minWidth: 720 }}
              >
                <caption>
                  Stored role versions and their server-defined permissions.
                </caption>
                <TableHead>
                  <TableRow>
                    <TableCell>Role code</TableCell>
                    <TableCell>Version</TableCell>
                    <TableCell>Permission codes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.role_versions.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell component="th" scope="row">
                        {role.role_code}
                      </TableCell>
                      <TableCell>{role.version}</TableCell>
                      <TableCell>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          useFlexGap
                          sx={{ flexWrap: "wrap" }}
                        >
                          {role.permissions.map((permission) => (
                            <Chip
                              key={permission}
                              label={permission}
                              size="small"
                              variant="outlined"
                            />
                          ))}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={data.pagination.total}
              page={page}
              onPageChange={(_, nextPage) => setPage(nextPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(Number(event.target.value));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50]}
            />
          </>
        )}
      </Stack>
    </Card>
  );
}
