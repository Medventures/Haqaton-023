export type Lang = 'ru' | 'kk';
export type L = { ru: string; kk: string };

export type Answer = 'YES' | 'NO' | 'UNKNOWN';
export type Severity = 'URGENT' | 'HIGH' | 'MEDIUM';
export type Assignee = 'DOCTOR' | 'COORDINATOR';

export type Status =
  | 'DRAFT'                // intake in progress
  | 'NEEDS_CLINIC_REVIEW'  // flags → doctor/coordinator must decide
  | 'TESTS_PENDING'        // missing / expiring tests
  | 'WAITING_DOCTOR'       // intake clean, doctor has to clear and pick scheme
  | 'NOT_CLEARED'          // doctor: not cleared / consultation needed
  | 'PREPARATION'          // timeline running
  | 'PREP_PROBLEM'         // morning check failed → contact clinic before leaving
  | 'READY'                // morning check passed
  | 'COMPLETED'            // procedure done
  | 'RESULTS_READY'        // report published
  | 'CANCELLED';

export interface Flag {
  code: string;
  severity: Severity;
  assignee: Assignee;
  note?: string;
}

export interface TestRecord {
  done: boolean;
  date?: string; // YYYY-MM-DD local
}

export type PrepScheme = 'SPLIT' | 'SINGLE_EVENING';

export interface AppointmentLike {
  id: string;
  scheduled_at: string | null;
  status: Status;
  answers: Record<string, Answer>;
  tests: Record<string, TestRecord>;
  prep_drug: string | null;
  prep_scheme: PrepScheme | null;
  liquid_stop_hours: number;
  clock_offset_sec: number;
}

/** Marker for content that medics must still verify. */
export const TODO = 'TODO_MEDICAL_REVIEW';
