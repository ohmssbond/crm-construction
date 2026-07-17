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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          category: string
          created_at: string
          filename: string | null
          id: string
          is_shared: boolean
          kind: string
          mime_type: string | null
          organization_id: string
          phase: string | null
          project_id: string
          size_bytes: number | null
          storage_path: string | null
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          category: string
          created_at?: string
          filename?: string | null
          id?: string
          is_shared?: boolean
          kind?: string
          mime_type?: string | null
          organization_id: string
          phase?: string | null
          project_id: string
          size_bytes?: number | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          filename?: string | null
          id?: string
          is_shared?: boolean
          kind?: string
          mime_type?: string | null
          organization_id?: string
          phase?: string | null
          project_id?: string
          size_bytes?: number | null
          storage_path?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_category_fk"
            columns: ["organization_id", "category"]
            isOneToOne: false
            referencedRelation: "file_categories"
            referencedColumns: ["organization_id", "key"]
          },
          {
            foreignKeyName: "attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          archived_at: string | null
          created_at: string
          customer_id: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          organization_id: string
          phone: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          organization_id: string
          phone?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          customer_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          organization_id?: string
          phone?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          archived_at: string | null
          bill_city: string | null
          bill_country: string | null
          bill_line1: string | null
          bill_line2: string | null
          bill_postal_code: string | null
          bill_state: string | null
          created_at: string
          email: string | null
          id: string
          last_synced_at: string | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          qbo_id: string | null
          qbo_sync_token: string | null
          source: string
          sync_status: string
        }
        Insert: {
          archived_at?: string | null
          bill_city?: string | null
          bill_country?: string | null
          bill_line1?: string | null
          bill_line2?: string | null
          bill_postal_code?: string | null
          bill_state?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          qbo_id?: string | null
          qbo_sync_token?: string | null
          source?: string
          sync_status?: string
        }
        Update: {
          archived_at?: string | null
          bill_city?: string | null
          bill_country?: string | null
          bill_line1?: string | null
          bill_line2?: string | null
          bill_postal_code?: string | null
          bill_state?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          qbo_id?: string | null
          qbo_sync_token?: string | null
          source?: string
          sync_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      file_categories: {
        Row: {
          archived_at: string | null
          created_at: string
          icon: string | null
          id: string
          key: string
          label: string
          organization_id: string
          sort: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          key: string
          label: string
          organization_id: string
          sort?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          key?: string
          label?: string
          organization_id?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          contact_id: string
          created_at: string
          email: string
          id: string
          organization_id: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          contact_id: string
          created_at?: string
          email: string
          id?: string
          organization_id: string
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          contact_id?: string
          created_at?: string
          email?: string
          id?: string
          organization_id?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_attachments: {
        Row: {
          added_at: string
          created_at: string
          filename: string | null
          id: string
          job_id: string
          label: string
          mime_type: string | null
          organization_id: string
          size_bytes: number | null
          status: string
          storage_path: string
          uploaded_at: string | null
          worker_user_id: string
        }
        Insert: {
          added_at?: string
          created_at?: string
          filename?: string | null
          id?: string
          job_id: string
          label: string
          mime_type?: string | null
          organization_id: string
          size_bytes?: number | null
          status?: string
          storage_path: string
          uploaded_at?: string | null
          worker_user_id: string
        }
        Update: {
          added_at?: string
          created_at?: string
          filename?: string | null
          id?: string
          job_id?: string
          label?: string
          mime_type?: string | null
          organization_id?: string
          size_bytes?: number | null
          status?: string
          storage_path?: string
          uploaded_at?: string | null
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_attachments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_material_lines: {
        Row: {
          created_at: string
          currency: string
          id: string
          item: string
          job_id: string
          material_id: string | null
          organization_id: string
          qty: number
          unit_cost: number | null
          worker_user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          item: string
          job_id: string
          material_id?: string | null
          organization_id: string
          qty: number
          unit_cost?: number | null
          worker_user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          item?: string
          job_id?: string
          material_id?: string | null
          organization_id?: string
          qty?: number
          unit_cost?: number | null
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_material_lines_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_material_lines_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_material_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_time_entries: {
        Row: {
          created_at: string
          entry_date: string
          id: string
          job_id: string
          last_synced_at: string | null
          no_charge: boolean
          organization_id: string
          qbo_id: string | null
          qbo_sync_token: string | null
          source: string
          sync_status: string
          worker_user_id: string
        }
        Insert: {
          created_at?: string
          entry_date: string
          id?: string
          job_id: string
          last_synced_at?: string | null
          no_charge?: boolean
          organization_id: string
          qbo_id?: string | null
          qbo_sync_token?: string | null
          source?: string
          sync_status?: string
          worker_user_id: string
        }
        Update: {
          created_at?: string
          entry_date?: string
          id?: string
          job_id?: string
          last_synced_at?: string | null
          no_charge?: boolean
          organization_id?: string
          qbo_id?: string | null
          qbo_sync_token?: string | null
          source?: string
          sync_status?: string
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_time_segments: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          organization_id: string
          time_in: string
          time_out: string | null
          worker_user_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          organization_id: string
          time_in: string
          time_out?: string | null
          worker_user_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          organization_id?: string
          time_in?: string
          time_out?: string | null
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_time_segments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "job_time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_time_segments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_work_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          job_id: string
          organization_id: string
          updated_at: string
          worker_user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          job_id: string
          organization_id: string
          updated_at?: string
          worker_user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          job_id?: string
          organization_id?: string
          updated_at?: string
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_work_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_work_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          archived_at: string | null
          billing_type: string
          contract_price: number | null
          created_at: string
          currency: string
          customer_id: string
          description: string | null
          end_date: string | null
          id: string
          job_city: string | null
          job_country: string | null
          job_line1: string | null
          job_line2: string | null
          job_postal_code: string | null
          job_state: string | null
          last_synced_at: string | null
          name: string
          notes: string | null
          organization_id: string
          qbo_id: string | null
          qbo_sync_token: string | null
          source: string
          start_date: string | null
          status: string
          sync_status: string
        }
        Insert: {
          archived_at?: string | null
          billing_type: string
          contract_price?: number | null
          created_at?: string
          currency?: string
          customer_id: string
          description?: string | null
          end_date?: string | null
          id?: string
          job_city?: string | null
          job_country?: string | null
          job_line1?: string | null
          job_line2?: string | null
          job_postal_code?: string | null
          job_state?: string | null
          last_synced_at?: string | null
          name: string
          notes?: string | null
          organization_id: string
          qbo_id?: string | null
          qbo_sync_token?: string | null
          source?: string
          start_date?: string | null
          status?: string
          sync_status?: string
        }
        Update: {
          archived_at?: string | null
          billing_type?: string
          contract_price?: number | null
          created_at?: string
          currency?: string
          customer_id?: string
          description?: string | null
          end_date?: string | null
          id?: string
          job_city?: string | null
          job_country?: string | null
          job_line1?: string | null
          job_line2?: string | null
          job_postal_code?: string | null
          job_state?: string | null
          last_synced_at?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          qbo_id?: string | null
          qbo_sync_token?: string | null
          source?: string
          start_date?: string | null
          status?: string
          sync_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          archived_at: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          last_synced_at: string | null
          name: string
          organization_id: string
          qbo_id: string | null
          qbo_sync_token: string | null
          sku: string | null
          source: string
          sync_status: string
          type: string
          unit_price: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          last_synced_at?: string | null
          name: string
          organization_id: string
          qbo_id?: string | null
          qbo_sync_token?: string | null
          sku?: string | null
          source?: string
          sync_status?: string
          type?: string
          unit_price?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          qbo_id?: string | null
          qbo_sync_token?: string | null
          sku?: string | null
          source?: string
          sync_status?: string
          type?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          organization_id: string
          product: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          product: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          product?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_products: {
        Row: {
          created_at: string
          organization_id: string
          product: string
          status: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          product: string
          status?: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          product?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          client_noun: string
          created_at: string
          id: string
          member_noun: string
          name: string
          primary_color: string
          timezone: string
        }
        Insert: {
          client_noun?: string
          created_at?: string
          id?: string
          member_noun?: string
          name: string
          primary_color?: string
          timezone?: string
        }
        Update: {
          client_noun?: string
          created_at?: string
          id?: string
          member_noun?: string
          name?: string
          primary_color?: string
          timezone?: string
        }
        Relationships: []
      }
      project_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          organization_id: string
          project_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          organization_id: string
          project_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          after_attachment_id: string | null
          archived_at: string | null
          before_attachment_id: string | null
          cover_attachment_id: string | null
          created_at: string
          customer_id: string
          end_date: string | null
          hero_attachment_id: string | null
          id: string
          name: string
          organization_id: string
          stage: string
          start_date: string | null
        }
        Insert: {
          after_attachment_id?: string | null
          archived_at?: string | null
          before_attachment_id?: string | null
          cover_attachment_id?: string | null
          created_at?: string
          customer_id: string
          end_date?: string | null
          hero_attachment_id?: string | null
          id?: string
          name: string
          organization_id: string
          stage?: string
          start_date?: string | null
        }
        Update: {
          after_attachment_id?: string | null
          archived_at?: string | null
          before_attachment_id?: string | null
          cover_attachment_id?: string | null
          created_at?: string
          customer_id?: string
          end_date?: string | null
          hero_attachment_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          stage?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_after_attachment_id_fkey"
            columns: ["after_attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_before_attachment_id_fkey"
            columns: ["before_attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_cover_attachment_id_fkey"
            columns: ["cover_attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_hero_attachment_id_fkey"
            columns: ["hero_attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      status_updates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_shared: boolean
          organization_id: string
          photo_attachment_id: string | null
          project_id: string
          title: string | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean
          organization_id: string
          photo_attachment_id?: string | null
          project_id: string
          title?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_shared?: boolean
          organization_id?: string
          photo_attachment_id?: string | null
          project_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "status_updates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_updates_photo_attachment_id_fkey"
            columns: ["photo_attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_workers: {
        Row: {
          created_at: string
          name: string
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          name: string
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          name?: string
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_workers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          body: string
          completed_at: string | null
          created_at: string
          done: boolean
          due_date: string | null
          id: string
          is_shared: boolean
          organization_id: string
          owner_contact_id: string | null
          project_id: string
        }
        Insert: {
          body: string
          completed_at?: string | null
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          is_shared?: boolean
          organization_id: string
          owner_contact_id?: string | null
          project_id: string
        }
        Update: {
          body?: string
          completed_at?: string | null
          created_at?: string
          done?: boolean
          due_date?: string | null
          id?: string
          is_shared?: boolean
          organization_id?: string
          owner_contact_id?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_owner_contact_id_fkey"
            columns: ["owner_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_days: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          organization_id: string
          start_time: string
          status: string
          work_date: string
          worker_user_id: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          organization_id: string
          start_time: string
          status?: string
          work_date: string
          worker_user_id: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          organization_id?: string
          start_time?: string
          status?: string
          work_date?: string
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_days_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      contact_can_see_project: { Args: { proj: string }; Returns: boolean }
      current_contact_id: { Args: never; Returns: string }
      current_contact_org: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      is_org_member: { Args: { org: string }; Returns: boolean }
      is_org_member_any: { Args: { org: string }; Returns: boolean }
      is_tb_admin: { Args: { org: string }; Returns: boolean }
      is_tb_member: { Args: { org: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
