// Tipos do schema público (gerados pelo Supabase e enxugados: Relationships omitidas).
// Regenerar após cada migration nova.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Enums = Database["public"]["Enums"];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      consents: {
        Row: { accepted_at: string; document_version: string; id: string; kind: Enums["consent_kind"]; revoked_at: string | null; user_id: string };
        Insert: { accepted_at?: string; document_version: string; id?: string; kind: Enums["consent_kind"]; revoked_at?: string | null; user_id: string };
        Update: Partial<Database["public"]["Tables"]["consents"]["Insert"]>;
        Relationships: [];
      };
      contracts: {
        Row: {
          daily_rate_cents: number | null;
          default_kind: Enums["contract_kind"];
          end_date: string | null;
          household_id: string;
          id: string;
          monthly_salary_cents: number | null;
          scheduled_hours_per_day: number;
          scheduled_weekdays: number[];
          start_date: string;
          worker_id: string;
        };
        Insert: {
          daily_rate_cents?: number | null;
          default_kind: Enums["contract_kind"];
          end_date?: string | null;
          household_id: string;
          id?: string;
          monthly_salary_cents?: number | null;
          scheduled_hours_per_day?: number;
          scheduled_weekdays?: number[];
          start_date: string;
          worker_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["contracts"]["Insert"]>;
        Relationships: [];
      };
      household_employers: {
        Row: { household_id: string; user_id: string };
        Insert: { household_id: string; user_id: string };
        Update: { household_id?: string; user_id?: string };
        Relationships: [];
      };
      households: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          selfie_mode: string;
          site_lat: number | null;
          site_lng: number | null;
          site_radius_m: number;
          tz: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          selfie_mode?: string;
          site_lat?: number | null;
          site_lng?: number | null;
          site_radius_m?: number;
          tz?: string;
        };
        Update: Partial<Database["public"]["Tables"]["households"]["Insert"]>;
        Relationships: [];
      };
      punch_adjustments: {
        Row: {
          action: Enums["adjustment_action"];
          decided_at: string | null;
          decided_by: string | null;
          household_id: string;
          id: string;
          new_kind: Enums["punch_kind"] | null;
          new_punched_at: string | null;
          reason: string;
          requested_at: string;
          requested_by: string;
          status: Enums["approval_status"];
          target_punch_id: string | null;
          worker_id: string;
        };
        Insert: {
          action: Enums["adjustment_action"];
          household_id: string;
          id?: string;
          new_kind?: Enums["punch_kind"] | null;
          new_punched_at?: string | null;
          reason: string;
          requested_by: string;
          status?: Enums["approval_status"];
          target_punch_id?: string | null;
          worker_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["punch_adjustments"]["Insert"]>;
        Relationships: [];
      };
      rule_sets: {
        Row: { created_at: string; id: string; params: Json; source_note: string; valid_from: string; valid_to: string | null };
        Insert: { created_at?: string; id?: string; params: Json; source_note: string; valid_from: string; valid_to?: string | null };
        Update: Partial<Database["public"]["Tables"]["rule_sets"]["Insert"]>;
        Relationships: [];
      };
      time_punches: {
        Row: Punch;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      timesheets: {
        Row: {
          closed_at: string | null;
          employer_ack_at: string | null;
          employer_ack_by: string | null;
          household_id: string;
          id: string;
          ref_month: string;
          rule_set_id: string | null;
          snapshot: Json | null;
          snapshot_hash: string | null;
          worker_ack_at: string | null;
          worker_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      work_days: {
        Row: {
          daily_rate_cents: number | null;
          household_id: string;
          overnight: boolean;
          regime: Enums["contract_kind"];
          work_date: string;
          worker_id: string;
        };
        Insert: {
          daily_rate_cents?: number | null;
          household_id: string;
          overnight?: boolean;
          regime: Enums["contract_kind"];
          work_date: string;
          worker_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_days"]["Insert"]>;
        Relationships: [];
      };
      workers: {
        Row: Worker;
        Insert: {
          cpf?: string | null;
          full_name: string;
          household_id: string;
          id?: string;
          phone_e164?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["workers"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      effective_punches: {
        Row: { [K in keyof Punch]: Punch[K] | null };
        Relationships: [];
      };
      weekly_days: {
        Row: {
          days_worked: number | null;
          diarista_days: number | null;
          household_id: string | null;
          overnight_days: number | null;
          week_start: string | null;
          worker_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      accept_invite: { Args: { p_code: string }; Returns: Worker };
      create_household: { Args: { p_name: string }; Returns: Database["public"]["Tables"]["households"]["Row"] };
      register_punch: {
        Args: {
          p_client_id: string;
          p_worker_id: string;
          p_kind: Enums["punch_kind"];
          p_device_time: string;
          p_offline?: boolean;
          p_lat?: number;
          p_lng?: number;
          p_accuracy_m?: number;
          p_device_id?: string;
          p_selfie_path?: string;
        };
        Returns: Punch;
      };
      decide_adjustment: { Args: { p_id: string; p_accept: boolean }; Returns: Database["public"]["Tables"]["punch_adjustments"]["Row"] };
      ack_timesheet: { Args: { p_id: string }; Returns: Database["public"]["Tables"]["timesheets"]["Row"] };
      is_employer: { Args: { h: string }; Returns: boolean };
      is_worker: { Args: { w: string }; Returns: boolean };
      is_household_worker: { Args: { h: string }; Returns: boolean };
    };
    Enums: {
      adjustment_action: "add" | "void";
      approval_status: "pending" | "accepted" | "rejected";
      consent_kind: "geolocation" | "selfie" | "whatsapp";
      contract_kind: "mensalista" | "diarista";
      punch_kind: "in" | "out" | "break_start" | "break_end";
      time_quality: "online" | "offline_synced" | "suspect_clock" | "adjusted";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Punch = {
  accuracy_m: number | null;
  adjustment_id: string | null;
  client_id: string;
  clock_skew_ms: number | null;
  device_id: string | null;
  device_punched_at: string | null;
  household_id: string;
  id: string;
  kind: Enums["punch_kind"];
  lat: number | null;
  lng: number | null;
  punched_at: string;
  quality: Enums["time_quality"];
  received_at: string;
  selfie_path: string | null;
  shift_date: string;
  source: string;
  within_site: boolean | null;
  worker_id: string;
};

export type Worker = {
  cpf: string | null;
  created_at: string;
  full_name: string;
  household_id: string;
  id: string;
  invite_code: string | null;
  phone_e164: string | null;
  user_id: string | null;
};

export type Contract = Database["public"]["Tables"]["contracts"]["Row"];
export type PunchKind = Enums["punch_kind"];
