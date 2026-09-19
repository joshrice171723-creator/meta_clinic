export type DemoRunStepStatus = "locked" | "available" | "complete";

export type DemoRunStep = {
  id: string;
  title: string;
  description: string;
  status: DemoRunStepStatus;
  href: string;
  requires: string[];
};

export type DemoTemplateOption = {
  key: string;
  title: string;
  description: string;
};

export type DemoRun = {
  id: string;
  template_key: string;
  mode: "clinic" | "patient";
  view: "clinic" | "patient";
  clinic: { id: number | string; name: string; slug: string };
  patient: { id?: number | string; name?: string } | null;
  steps: DemoRunStep[];
};

export type DemoRunInactiveResponse = {
  active: false;
  visitor_registered: boolean;
  options: DemoTemplateOption[];
};

export type DemoRunActiveResponse = {
  active: true;
  run: DemoRun;
};

export type DemoRunResponse = DemoRunInactiveResponse | DemoRunActiveResponse;

export type DemoEnrollmentResponse = {
  destination: string;
};
