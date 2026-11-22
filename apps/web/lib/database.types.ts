export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      appeals: {
        Row: {
          attachment_path: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          reason: string
          requested_status: Database["public"]["Enums"]["att_status"]
          session_id: string
          status: string
          student_id: string
        }
        Insert: {
          attachment_path?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          reason: string
          requested_status?: Database["public"]["Enums"]["att_status"]
          session_id: string
          status?: string
          student_id: string
        }
        Update: {
          attachment_path?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          reason?: string
          requested_status?: Database["public"]["Enums"]["att_status"]
          session_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appeals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appeals_session_id_student_id_fkey"
            columns: ["session_id", "student_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["session_id", "student_id"]
          },
        ]
      }
      attendance: {
        Row: {
          first_seen_at: string | null
          flags: string[]
          last_verified_at: string | null
          method: string | null
          note: string | null
          session_id: string
          status: Database["public"]["Enums"]["att_status"]
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          first_seen_at?: string | null
          flags?: string[]
          last_verified_at?: string | null
          method?: string | null
          note?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["att_status"]
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          first_seen_at?: string | null
          flags?: string[]
          last_verified_at?: string | null
          method?: string | null
          note?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["att_status"]
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_evidence: {
        Row: {
          created_at: string
          detail: Json | null
          id: number
          rule_version: string | null
          session_id: string
          source: string
          source_id: string | null
          student_id: string
          weight: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          id?: number
          rule_version?: string | null
          session_id: string
          source: string
          source_id?: string | null
          student_id: string
          weight: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          id?: number
          rule_version?: string | null
          session_id?: string
          source?: string
          source_id?: string | null
          student_id?: string
          weight?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_evidence_session_id_student_id_fkey"
            columns: ["session_id", "student_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["session_id", "student_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string | null
          id: number
          reason: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: number
          reason?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: number
          reason?: string | null
        }
        Relationships: []
      }
      biometric_consents: {
        Row: {
          accepted_at: string
          student_id: string
          version: string
          withdrawn_at: string | null
        }
        Insert: {
          accepted_at?: string
          student_id: string
          version: string
          withdrawn_at?: string | null
        }
        Update: {
          accepted_at?: string
          student_id?: string
          version?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "biometric_consents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cameras: {
        Row: {
          device_id: string
          door_point: Json | null
          entry_line: Json | null
          exit_line: Json | null
          id: string
          kind: string
          roi: Json | null
          snapshot_at: string | null
          snapshot_path: string | null
          stream_url: string | null
        }
        Insert: {
          device_id: string
          door_point?: Json | null
          entry_line?: Json | null
          exit_line?: Json | null
          id?: string
          kind: string
          roi?: Json | null
          snapshot_at?: string | null
          snapshot_path?: string | null
          stream_url?: string | null
        }
        Update: {
          device_id?: string
          door_point?: Json | null
          entry_line?: Json | null
          exit_line?: Json | null
          id?: string
          kind?: string
          roi?: Json | null
          snapshot_at?: string | null
          snapshot_path?: string | null
          stream_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cameras_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "edge_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      class_sessions: {
        Row: {
          cancelled_reason: string | null
          ends_at: string
          finalized_at: string | null
          gate_offline_seconds: number
          id: string
          is_makeup: boolean
          is_simulation: boolean
          last_mismatch_check_at: string | null
          locked_at: string | null
          low_count_alerted_at: string | null
          low_count_since: string | null
          over_enrolled_alerted_at: string | null
          policy: Json | null
          recheck_checked_at: string | null
          room_id: string | null
          section_id: string
          session_date: string
          slot_id: string | null
          staff_count: number
          started_at: string | null
          starts_at: string
          state: Database["public"]["Enums"]["session_state"]
        }
        Insert: {
          cancelled_reason?: string | null
          ends_at: string
          finalized_at?: string | null
          gate_offline_seconds?: number
          id?: string
          is_makeup?: boolean
          is_simulation?: boolean
          last_mismatch_check_at?: string | null
          locked_at?: string | null
          low_count_alerted_at?: string | null
          low_count_since?: string | null
          over_enrolled_alerted_at?: string | null
          policy?: Json | null
          recheck_checked_at?: string | null
          room_id?: string | null
          section_id: string
          session_date: string
          slot_id?: string | null
          staff_count?: number
          started_at?: string | null
          starts_at: string
          state?: Database["public"]["Enums"]["session_state"]
        }
        Update: {
          cancelled_reason?: string | null
          ends_at?: string
          finalized_at?: string | null
          gate_offline_seconds?: number
          id?: string
          is_makeup?: boolean
          is_simulation?: boolean
          last_mismatch_check_at?: string | null
          locked_at?: string | null
          low_count_alerted_at?: string | null
          low_count_since?: string | null
          over_enrolled_alerted_at?: string | null
          policy?: Json | null
          recheck_checked_at?: string | null
          room_id?: string | null
          section_id?: string
          session_date?: string
          slot_id?: string | null
          staff_count?: number
          started_at?: string | null
          starts_at?: string
          state?: Database["public"]["Enums"]["session_state"]
        }
        Relationships: [
          {
            foreignKeyName: "class_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_sessions_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          credits: number | null
          department_id: string | null
          id: string
          title: string
        }
        Insert: {
          code: string
          credits?: number | null
          department_id?: string | null
          id?: string
          title: string
        }
        Update: {
          code?: string
          credits?: number | null
          department_id?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      edge_devices: {
        Row: {
          api_key_hash: string | null
          created_at: string
          id: string
          is_active: boolean
          kind: string
          last_seen: string | null
          name: string
          room_id: string | null
          status: Json | null
        }
        Insert: {
          api_key_hash?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          last_seen?: string | null
          name: string
          room_id?: string | null
          status?: Json | null
        }
        Update: {
          api_key_hash?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          last_seen?: string | null
          name?: string
          room_id?: string | null
          status?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "edge_devices_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edge_devices_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_geo"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_events: {
        Row: {
          event_id: string
          event_type: string
          model_version: string | null
          observed_at: string
          payload: Json
          received_at: string
          received_via: string | null
          session_id: string | null
          simulation: boolean
          source_device_id: string
        }
        Insert: {
          event_id: string
          event_type: string
          model_version?: string | null
          observed_at: string
          payload?: Json
          received_at?: string
          received_via?: string | null
          session_id?: string | null
          simulation?: boolean
          source_device_id: string
        }
        Update: {
          event_id?: string
          event_type?: string
          model_version?: string | null
          observed_at?: string
          payload?: Json
          received_at?: string
          received_via?: string | null
          session_id?: string | null
          simulation?: boolean
          source_device_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edge_events_received_via_fkey"
            columns: ["received_via"]
            isOneToOne: false
            referencedRelation: "edge_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edge_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edge_events_source_device_id_fkey"
            columns: ["source_device_id"]
            isOneToOne: false
            referencedRelation: "edge_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          created_at: string
          ends_on: string | null
          section_id: string
          starts_on: string
          student_id: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          section_id: string
          starts_on?: string
          student_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          section_id?: string
          starts_on?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      face_embeddings: {
        Row: {
          created_at: string
          embedding: string
          id: number
          pose: string | null
          quality: number | null
          student_id: string
        }
        Insert: {
          created_at?: string
          embedding: string
          id?: number
          pose?: string | null
          quality?: number | null
          student_id: string
        }
        Update: {
          created_at?: string
          embedding?: string
          id?: number
          pose?: string | null
          quality?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_embeddings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      face_profiles: {
        Row: {
          enrolled_at: string | null
          model_version: string | null
          review_note: string | null
          status: string
          student_id: string
          template: string | null
          updated_at: string
        }
        Insert: {
          enrolled_at?: string | null
          model_version?: string | null
          review_note?: string | null
          status?: string
          student_id: string
          template?: string | null
          updated_at?: string
        }
        Update: {
          enrolled_at?: string | null
          model_version?: string | null
          review_note?: string | null
          status?: string
          student_id?: string
          template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_events: {
        Row: {
          device_id: string | null
          direction: string | null
          event_id: string
          event_type: string
          margin: number | null
          received_at: string
          score: number | null
          session_id: string | null
          simulation: boolean
          snapshot_path: string | null
          student_id: string | null
          track_id: number | null
          ts: string
        }
        Insert: {
          device_id?: string | null
          direction?: string | null
          event_id: string
          event_type: string
          margin?: number | null
          received_at?: string
          score?: number | null
          session_id?: string | null
          simulation?: boolean
          snapshot_path?: string | null
          student_id?: string | null
          track_id?: number | null
          ts: string
        }
        Update: {
          device_id?: string | null
          direction?: string | null
          event_id?: string
          event_type?: string
          margin?: number | null
          received_at?: string
          score?: number | null
          session_id?: string | null
          simulation?: boolean
          snapshot_path?: string | null
          student_id?: string | null
          track_id?: number | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "edge_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "edge_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "gate_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          day: string
          id: string
          kind: string
          name: string | null
          semester_id: string | null
        }
        Insert: {
          day: string
          id?: string
          kind?: string
          name?: string | null
          semester_id?: string | null
        }
        Update: {
          day?: string
          id?: string
          kind?: string
          name?: string | null
          semester_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          expires_at: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          expires_at?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          expires_at?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      occupancy_samples: {
        Row: {
          device_id: string | null
          event_id: string | null
          id: number
          raw: number
          received_at: string
          session_id: string | null
          simulation: boolean
          smoothed: number
          stable: boolean
          ts: string
        }
        Insert: {
          device_id?: string | null
          event_id?: string | null
          id?: number
          raw: number
          received_at?: string
          session_id?: string | null
          simulation?: boolean
          smoothed: number
          stable?: boolean
          ts: string
        }
        Update: {
          device_id?: string | null
          event_id?: string | null
          id?: number
          raw?: number
          received_at?: string
          session_id?: string | null
          simulation?: boolean
          smoothed?: number
          stable?: boolean
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "occupancy_samples_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "edge_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occupancy_samples_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "edge_events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "occupancy_samples_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_enrollments: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          section_id: string
          student_no: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          section_id: string
          student_no?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          section_id?: string
          student_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_enrollments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department_id: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_simulated: boolean
          role: Database["public"]["Enums"]["user_role"]
          student_no: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          is_simulated?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          student_no?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_simulated?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          student_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          building: string | null
          code: string
          floor: number | null
          geofence: unknown
          id: string
          max_gps_accuracy_m: number
          name: string | null
          require_qr: boolean
        }
        Insert: {
          building?: string | null
          code: string
          floor?: number | null
          geofence?: unknown
          id?: string
          max_gps_accuracy_m?: number
          name?: string | null
          require_qr?: boolean
        }
        Update: {
          building?: string | null
          code?: string
          floor?: number | null
          geofence?: unknown
          id?: string
          max_gps_accuracy_m?: number
          name?: string | null
          require_qr?: boolean
        }
        Relationships: []
      }
      section_staff: {
        Row: {
          profile_id: string
          section_id: string
          staff_role: string
        }
        Insert: {
          profile_id: string
          section_id: string
          staff_role?: string
        }
        Update: {
          profile_id?: string
          section_id?: string
          staff_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_staff_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          course_id: string
          id: string
          room_id: string | null
          section_no: string
          semester_id: string
        }
        Insert: {
          course_id: string
          id?: string
          room_id?: string | null
          section_no: string
          semester_id: string
        }
        Update: {
          course_id?: string
          id?: string
          room_id?: string | null
          section_no?: string
          semester_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          ends_on: string
          id: string
          name: string
          starts_on: string
        }
        Insert: {
          ends_on: string
          id?: string
          name: string
          starts_on: string
        }
        Update: {
          ends_on?: string
          id?: string
          name?: string
          starts_on?: string
        }
        Relationships: []
      }
      session_secrets: {
        Row: {
          qr_secret: string
          session_id: string
        }
        Insert: {
          qr_secret: string
          session_id: string
        }
        Update: {
          qr_secret?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_secrets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      student_devices: {
        Row: {
          device_hash: string
          label: string | null
          registered_at: string
          student_id: string
        }
        Insert: {
          device_hash: string
          label?: string | null
          registered_at?: string
          student_id: string
        }
        Update: {
          device_hash?: string
          label?: string | null
          registered_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_devices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          end_time: string
          id: string
          is_active: boolean
          room_id: string | null
          section_id: string
          start_time: string
          weekday: number
        }
        Insert: {
          end_time: string
          id?: string
          is_active?: boolean
          room_id?: string | null
          section_id: string
          start_time: string
          weekday: number
        }
        Update: {
          end_time?: string
          id?: string
          is_active?: boolean
          room_id?: string | null
          section_id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms_geo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_attempts: {
        Row: {
          created_at: string
          device_id: string | null
          face_score: number | null
          gps_accuracy_m: number | null
          gps_ok: boolean | null
          id: string
          lat: number | null
          live_score: number | null
          liveness_ok: boolean | null
          lng: number | null
          qr_ok: boolean | null
          reason: string | null
          request_id: string
          result: string
          student_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          face_score?: number | null
          gps_accuracy_m?: number | null
          gps_ok?: boolean | null
          id?: string
          lat?: number | null
          live_score?: number | null
          liveness_ok?: boolean | null
          lng?: number | null
          qr_ok?: boolean | null
          reason?: string | null
          request_id: string
          result: string
          student_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          face_score?: number | null
          gps_accuracy_m?: number | null
          gps_ok?: boolean | null
          id?: string
          lat?: number | null
          live_score?: number | null
          liveness_ok?: boolean | null
          lng?: number | null
          qr_ok?: boolean | null
          reason?: string | null
          request_id?: string
          result?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_attempts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "verification_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          closed_at: string | null
          closes_at: string
          created_by: string | null
          id: string
          kind: string
          opens_at: string
          session_id: string
          status: string
          target_count: number
        }
        Insert: {
          closed_at?: string | null
          closes_at: string
          created_by?: string | null
          id?: string
          kind: string
          opens_at?: string
          session_id: string
          status?: string
          target_count?: number
        }
        Update: {
          closed_at?: string | null
          closes_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          opens_at?: string
          session_id?: string
          status?: string
          target_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "class_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_targets: {
        Row: {
          notified_at: string
          passed_at: string | null
          request_id: string
          student_id: string
        }
        Insert: {
          notified_at?: string
          passed_at?: string | null
          request_id: string
          student_id: string
        }
        Update: {
          notified_at?: string
          passed_at?: string | null
          request_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_targets_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "verification_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_targets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      rooms_geo: {
        Row: {
          geofence: Json | null
          id: string | null
        }
        Insert: {
          geofence?: never
          id?: string | null
        }
        Update: {
          geofence?: never
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_attendance_flag: {
        Args: { p_flag: string; p_session: string; p_student: string }
        Returns: undefined
      }
      apply_edge_events: {
        Args: { p_device: string; p_events: Json }
        Returns: Json
      }
      apply_self_verification: { Args: { p_attempt: string }; Returns: Json }
      assert_session_actor: { Args: { p_session: string }; Returns: undefined }
      attendance_summary: {
        Args: { p_section: string; p_student: string }
        Returns: {
          absent: number
          excused: number
          held: number
          late: number
          left_early: number
          pct: number
          pending: number
          present: number
        }[]
      }
      cancel_session: {
        Args: { p_reason: string; p_session: string }
        Returns: undefined
      }
      check_geofence: {
        Args: {
          p_accuracy_m: number
          p_lat: number
          p_lng: number
          p_room: string
        }
        Returns: boolean
      }
      close_verification_request: {
        Args: { p_now?: string; p_request: string }
        Returns: number
      }
      create_adhoc_session: {
        Args: {
          p_minutes: number
          p_room: string
          p_section: string
          p_simulation: boolean
          p_starts_at: string
        }
        Returns: string
      }
      current_session_for_room: { Args: { p_room: string }; Returns: Json }
      decide_appeal: {
        Args: { p_appeal: string; p_approve: boolean; p_note: string }
        Returns: undefined
      }
      file_appeal: {
        Args: {
          p_attachment?: string
          p_reason: string
          p_requested?: Database["public"]["Enums"]["att_status"]
          p_session: string
        }
        Returns: string
      }
      finalize_session: {
        Args: { p_now?: string; p_session: string }
        Returns: Json
      }
      get_app_config: { Args: { p_key: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_enrolled_in_section: { Args: { p_section: string }; Returns: boolean }
      is_operator: { Args: never; Returns: boolean }
      is_request_staff: { Args: { p_request: string }; Returns: boolean }
      is_request_target: { Args: { p_request: string }; Returns: boolean }
      is_section_staff: { Args: { p_section: string }; Returns: boolean }
      is_session_staff: { Args: { p_session: string }; Returns: boolean }
      manual_mark: {
        Args: {
          p_reason: string
          p_session: string
          p_status: Database["public"]["Enums"]["att_status"]
          p_student: string
        }
        Returns: undefined
      }
      match_face: {
        Args: { p_embedding: string; p_student: string }
        Returns: number
      }
      match_face_any: {
        Args: { p_embedding: string; p_exclude: string }
        Returns: {
          similarity: number
          student_id: string
        }[]
      }
      my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      notify_at_risk: { Args: { p_section: string }; Returns: number }
      notify_session_staff: {
        Args: {
          p_body: string
          p_data?: Json
          p_session: string
          p_title: string
          p_type: string
        }
        Returns: number
      }
      notify_user: {
        Args: {
          p_body: string
          p_data?: Json
          p_expires?: string
          p_title: string
          p_type: string
          p_user: string
        }
        Returns: string
      }
      open_verification_request: {
        Args: {
          p_by?: string
          p_kind: string
          p_now?: string
          p_session: string
        }
        Returns: string
      }
      pol_int: { Args: { d: number; k: string; p: Json }; Returns: number }
      pol_num: { Args: { d: number; k: string; p: Json }; Returns: number }
      privacy_retention: { Args: { p_now?: string }; Returns: Json }
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_s: number }
        Returns: boolean
      }
      record_evidence: {
        Args: {
          p_at: string
          p_detail?: Json
          p_force_present?: boolean
          p_method: string
          p_session: string
          p_source: string
          p_source_id: string
          p_student: string
        }
        Returns: Database["public"]["Enums"]["att_status"]
      }
      refresh_gate_offline: {
        Args: { p_now?: string; p_session: string }
        Returns: number
      }
      reset_demo: { Args: never; Returns: Json }
      run_count_checks: {
        Args: { p_now?: string; p_session: string }
        Returns: undefined
      }
      session_gallery: { Args: { p_session: string }; Returns: Json }
      session_tick: { Args: { p_now?: string }; Returns: Json }
      set_app_config: {
        Args: { p_key: string; p_value: string }
        Returns: undefined
      }
      set_push_webhook_secret: {
        Args: { p_secret: string }
        Returns: undefined
      }
      start_session: {
        Args: { p_now?: string; p_session: string }
        Returns: undefined
      }
      status_for_time: {
        Args: { p_at: string; p_session: string }
        Returns: Database["public"]["Enums"]["att_status"]
      }
      status_rank: {
        Args: { s: Database["public"]["Enums"]["att_status"] }
        Returns: number
      }
      store_face_enrollment: {
        Args: {
          p_embeddings: Json
          p_model: string
          p_note: string
          p_replace: boolean
          p_status: string
          p_student: string
        }
        Returns: Json
      }
      teaches_student: { Args: { p_student: string }; Returns: boolean }
    }
    Enums: {
      att_status:
        | "pending"
        | "present"
        | "late"
        | "absent"
        | "left_early"
        | "excused"
      session_state:
        | "scheduled"
        | "live"
        | "recheck"
        | "ended"
        | "locked"
        | "cancelled"
      user_role: "admin" | "professor" | "student" | "operator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      att_status: [
        "pending",
        "present",
        "late",
        "absent",
        "left_early",
        "excused",
      ],
      session_state: [
        "scheduled",
        "live",
        "recheck",
        "ended",
        "locked",
        "cancelled",
      ],
      user_role: ["admin", "professor", "student", "operator"],
    },
  },
} as const
