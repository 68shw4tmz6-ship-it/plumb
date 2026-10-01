export type AppRole = "boss" | "crew";

export type ProjectStatus =
  | "unstarted"
  | "next"
  | "in_progress"
  | "on_hold"
  | "done"
  | "cancelled";

export type StepStatus = "todo" | "doing" | "done" | "blocked";
export type MaterialStatus = "to_order" | "ordered" | "delivered" | "missing";
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";
export type QuoteSource = "generated" | "uploaded";
export type QuoteLineKind = "work" | "material" | "other";
export type FollowUpChannel = "email" | "phone" | "sms" | "visit";
export type FileKind = "plan" | "quote" | "photo" | "invoice" | "other";

export type Profile = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  role: AppRole;
  email: string | null;
  phone: string | null;
  trade: string | null;
  abn: string | null;
  hourly_rate: number | null;
  charge_rate: number | null;
  is_active: boolean;
  created_at: string;
};

export type TeamMember = Pick<
  Profile,
  "id" | "full_name" | "role" | "trade" | "phone" | "is_active"
>;

export type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  suburb: string | null;
  postcode: string | null;
  state: string | null;
  notes: string | null;
  created_at: string;
};

export type PriceItem = {
  id: string;
  category: string;
  label: string;
  detail: string | null;
  unit: string;
  unit_price: number;
  kind: QuoteLineKind;
  is_active: boolean;
};

export type Quote = {
  id: string;
  reference: string;
  client_id: string;
  title: string;
  description: string | null;
  source: QuoteSource;
  status: QuoteStatus;
  file_path: string | null;
  amount_ex_gst: number;
  gst_rate: number;
  amount_inc_gst: number;
  issued_on: string;
  sent_at: string | null;
  valid_until: string | null;
  decided_at: string | null;
  decision_note: string | null;
  site_address: string | null;
  site_suburb: string | null;
  follow_up_days: number;
  max_follow_ups: number;
  follow_up_count: number;
  last_follow_up_at: string | null;
  next_follow_up_on: string | null;
  follow_ups_paused: boolean;
  project_id: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteLine = {
  id: string;
  quote_id: string;
  position: number;
  kind: QuoteLineKind;
  label: string;
  detail: string | null;
  unit: string;
  qty: number;
  unit_price: number;
  amount: number;
  price_item_id: string | null;
};

export type QuoteFollowUp = {
  id: string;
  quote_id: string;
  occurred_at: string;
  channel: FollowUpChannel;
  note: string | null;
  created_by: string | null;
};

export type Project = {
  id: string;
  reference: string;
  quote_id: string | null;
  client_id: string | null;
  name: string;
  address: string | null;
  suburb: string | null;
  postcode: string | null;
  description: string | null;
  notes: string | null;
  status: ProjectStatus;
  start_date: string | null;
  deadline: string | null;
  budget_ex_gst: number | null;
  progress: number;
  created_at: string;
  updated_at: string;
};

export type ProjectMember = {
  id: string;
  project_id: string;
  profile_id: string;
  role_on_job: string | null;
  assigned_at: string;
};

export type ProjectStep = {
  id: string;
  project_id: string;
  parent_id: string | null;
  position: number;
  label: string;
  detail: string | null;
  status: StepStatus;
  assignee_id: string | null;
  due_date: string | null;
  done_at: string | null;
  done_by: string | null;
};

export type ProjectMaterial = {
  id: string;
  project_id: string;
  label: string;
  qty: number;
  unit: string;
  status: MaterialStatus;
  needed_by: string | null;
  supplier: string | null;
  note: string | null;
  flagged_at: string | null;
  created_at: string;
};

export type ProjectReport = {
  id: string;
  project_id: string;
  author_id: string | null;
  report_date: string;
  content: string;
  weather: string | null;
  blocker: string | null;
  created_at: string;
};

export type ProjectFile = {
  id: string;
  project_id: string;
  report_id: string | null;
  kind: FileKind;
  storage_path: string;
  file_name: string | null;
  caption: string | null;
  taken_on: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type TimesheetEntry = {
  id: string;
  profile_id: string;
  project_id: string | null;
  work_date: string;
  start_time: string | null;
  finish_time: string | null;
  break_minutes: number;
  hours: number;
  note: string | null;
  is_approved: boolean;
  approved_at: string | null;
  created_at: string;
};

export type Activity = {
  id: string;
  project_id: string | null;
  quote_id: string | null;
  actor_id: string | null;
  verb: string;
  summary: string;
  created_at: string;
};

export type FollowUpDue = {
  quote_id: string;
  reference: string;
  title: string;
  client_name: string;
  client_email: string | null;
  amount_inc_gst: number;
  sent_at: string | null;
  follow_up_count: number;
  days_overdue: number;
};
