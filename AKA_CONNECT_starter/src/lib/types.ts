
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: { id: string; name: string; slug: string; created_at: string | null; },
        Insert: { id?: string; name: string; slug: string; created_at?: string | null; },
        Update: { id?: string; name?: string; slug?: string; created_at?: string | null; }
      },
      memberships: {
        Row: { id: string; user_id: string; client_id: string; role: 'admin'|'staff'|'client'; },
        Insert: { id?: string; user_id: string; client_id: string; role: 'admin'|'staff'|'client'; },
        Update: { id?: string; user_id?: string; client_id?: string; role?: 'admin'|'staff'|'client'; }
      },
      threads: {
        Row: { id: string; client_id: string; title: string; created_by: string; created_at: string | null; },
        Insert: { id?: string; client_id: string; title: string; created_by: string; created_at?: string | null; },
        Update: { id?: string; client_id?: string; title?: string; created_by?: string; created_at?: string | null; }
      },
      messages: {
        Row: { id: string; thread_id: string; author_id: string; content: string; created_at: string | null; },
        Insert: { id?: string; thread_id: string; author_id: string; content: string; created_at?: string | null; },
        Update: { id?: string; thread_id?: string; author_id?: string; content?: string; created_at?: string | null; }
      },
      events: {
        Row: { id: string; client_id: string; title: string; starts_at: string; ends_at: string; created_by: string; },
        Insert: { id?: string; client_id: string; title: string; starts_at: string; ends_at: string; created_by: string; },
        Update: { id?: string; client_id?: string; title?: string; starts_at?: string; ends_at?: string; created_by?: string; }
      },
      files: {
        Row: { id: string; client_id: string; name: string; path: string; uploaded_by: string; created_at: string | null; },
        Insert: { id?: string; client_id: string; name: string; path: string; uploaded_by: string; created_at?: string | null; },
        Update: { id?: string; client_id?: string; name?: string; path?: string; uploaded_by?: string; created_at?: string | null; }
      }
    },
    Views: {},
    Functions: {},
    Enums: {}
  }
}
