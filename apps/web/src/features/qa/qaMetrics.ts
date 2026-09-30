export function githubOpenDefectCount(source: {
  status: string;
  issues: { state: string }[];
}): number | "Unavailable" {
  return source.status === "connected"
    ? source.issues.filter((issue) => issue.state === "open").length
    : "Unavailable";
}
