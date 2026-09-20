export type DemoRunStepStatus = "locked" | "available" | "complete";

export type DemoRunStep = {
  id: string;
  title: string;
  description: string;
  status: DemoRunStepStatus;
  href: string;
  requires: string[];
  review?: boolean;
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
  lesson_key: string | null;
  sandbox: boolean;
  lessons: DemoLesson[];
  steps: DemoRunStep[];
};

export type DemoLesson = {
  id: string;
  title: string;
  description: string;
  role: string;
  section?: string;
  clinic_type?: string;
  prepared: string[];
  status: "available" | "complete";
};

export type DemoRunInactiveResponse = {
  active: false;
  visitor_registered: boolean;
  lessons: DemoLesson[];
  notice?: string;
};

export type DemoRunActiveResponse = {
  active: true;
  run: DemoRun;
};

export type DemoRunResponse = DemoRunInactiveResponse | DemoRunActiveResponse;

export type DemoEnrollmentResponse = {
  destination: string;
};
