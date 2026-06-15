// Database types - generated from Supabase schema (001_initial_schema.sql)
// After running `supabase gen types typescript` you can replace this file
// with the auto-generated version for full accuracy.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_api_keys: {
        Row: {
          user_id: string;
          claude_key_encrypted: string | null;
          openai_key_encrypted: string | null;
          perplexity_key_encrypted: string | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          claude_key_encrypted?: string | null;
          openai_key_encrypted?: string | null;
          perplexity_key_encrypted?: string | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          claude_key_encrypted?: string | null;
          openai_key_encrypted?: string | null;
          perplexity_key_encrypted?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_api_keys_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          user_id: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_prompts: {
        Row: {
          id: string;
          user_id: string;
          agent_id: string;
          content: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          agent_id: string;
          content: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          agent_id?: string;
          content?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_prompts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_rag_data: {
        Row: {
          id: string;
          user_id: string;
          data_type: string;
          content: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          data_type: string;
          content: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          data_type?: string;
          content?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_rag_data_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      linkedin_accounts: {
        Row: {
          id: string;
          user_id: string;
          unipile_account_id: string;
          status: string | null;
          account_type: string | null;
          warmup_start_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          unipile_account_id: string;
          status?: string | null;
          account_type?: string | null;
          warmup_start_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          unipile_account_id?: string;
          status?: string | null;
          account_type?: string | null;
          warmup_start_date?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "linkedin_accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          id: string;
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          title: string | null;
          company: string | null;
          siren: string | null;
          linkedin_url: string | null;
          email: string | null;
          phone: string | null;
          score: number;
          status: string;
          stage: string;
          tags: string[] | null;
          notes: string | null;
          enrichment_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          first_name?: string | null;
          last_name?: string | null;
          title?: string | null;
          company?: string | null;
          siren?: string | null;
          linkedin_url?: string | null;
          email?: string | null;
          phone?: string | null;
          score?: number;
          status?: string;
          stage?: string;
          tags?: string[] | null;
          notes?: string | null;
          enrichment_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          first_name?: string;
          last_name?: string;
          title?: string | null;
          company?: string | null;
          siren?: string | null;
          linkedin_url?: string | null;
          email?: string | null;
          phone?: string | null;
          score?: number;
          status?: string;
          stage?: string;
          tags?: string[] | null;
          notes?: string | null;
          enrichment_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          siren: string;
          nom: string | null;
          naf: string | null;
          ville: string | null;
          date_creation: string | null;
          effectif: string | null;
          domain: string | null;
          unite_legale: Json | null;
          created_at: string;
        };
        Insert: {
          siren: string;
          nom?: string | null;
          naf?: string | null;
          ville?: string | null;
          date_creation?: string | null;
          effectif?: string | null;
          domain?: string | null;
          unite_legale?: Json | null;
          created_at?: string;
        };
        Update: {
          siren?: string;
          nom?: string | null;
          naf?: string | null;
          ville?: string | null;
          date_creation?: string | null;
          effectif?: string | null;
          domain?: string | null;
          unite_legale?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      lists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lists_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      list_leads: {
        Row: {
          list_id: string;
          lead_id: string;
        };
        Insert: {
          list_id: string;
          lead_id: string;
        };
        Update: {
          list_id?: string;
          lead_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "list_leads_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_leads_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      sequences: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          persona: string | null;
          status: string;
          stats: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          persona?: string | null;
          status?: string;
          stats?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          persona?: string | null;
          status?: string;
          stats?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sequences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sequence_steps: {
        Row: {
          id: string;
          sequence_id: string;
          step_type: string;
          delay_days: number;
          template: string | null;
          generation_mode: string;
          condition: string | null;
          step_order: number;
        };
        Insert: {
          id?: string;
          sequence_id: string;
          step_type: string;
          delay_days?: number;
          template?: string | null;
          generation_mode?: string;
          condition?: string | null;
          step_order: number;
        };
        Update: {
          id?: string;
          sequence_id?: string;
          step_type?: string;
          delay_days?: number;
          template?: string | null;
          generation_mode?: string;
          condition?: string | null;
          step_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sequence_steps_sequence_id_fkey";
            columns: ["sequence_id"];
            isOneToOne: false;
            referencedRelation: "sequences";
            referencedColumns: ["id"];
          },
        ];
      };
      sequence_leads: {
        Row: {
          id: string;
          sequence_id: string;
          lead_id: string;
          current_step: number;
          status: string;
          entered_at: string;
        };
        Insert: {
          id?: string;
          sequence_id: string;
          lead_id: string;
          current_step?: number;
          status?: string;
          entered_at?: string;
        };
        Update: {
          id?: string;
          sequence_id?: string;
          lead_id?: string;
          current_step?: number;
          status?: string;
          entered_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sequence_leads_sequence_id_fkey";
            columns: ["sequence_id"];
            isOneToOne: false;
            referencedRelation: "sequences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sequence_leads_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      actions: {
        Row: {
          id: string;
          user_id: string;
          lead_id: string | null;
          sequence_id: string | null;
          step_id: string | null;
          action_type: string;
          status: string;
          generated_message: string | null;
          final_message: string | null;
          scheduled_at: string | null;
          validated_at: string | null;
          sent_at: string | null;
          error_message: string | null;
          generation_reasoning: string | null;
          generation_data: Json | null;
          retry_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          lead_id?: string | null;
          sequence_id?: string | null;
          step_id?: string | null;
          action_type: string;
          status?: string;
          generated_message?: string | null;
          final_message?: string | null;
          scheduled_at?: string | null;
          validated_at?: string | null;
          sent_at?: string | null;
          error_message?: string | null;
          generation_reasoning?: string | null;
          generation_data?: Json | null;
          retry_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          lead_id?: string | null;
          sequence_id?: string | null;
          step_id?: string | null;
          action_type?: string;
          status?: string;
          generated_message?: string | null;
          final_message?: string | null;
          scheduled_at?: string | null;
          validated_at?: string | null;
          sent_at?: string | null;
          error_message?: string | null;
          generation_reasoning?: string | null;
          generation_data?: Json | null;
          retry_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "actions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_sequence_id_fkey";
            columns: ["sequence_id"];
            isOneToOne: false;
            referencedRelation: "sequences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_step_id_fkey";
            columns: ["step_id"];
            isOneToOne: false;
            referencedRelation: "sequence_steps";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          lead_id: string | null;
          channel: string;
          unipile_chat_id: string | null;
          status: string;
          updated_at: string;
          attendee_name: string | null;
          attendee_profile_url: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          lead_id?: string | null;
          channel: string;
          unipile_chat_id?: string | null;
          status?: string;
          updated_at?: string;
          attendee_name?: string | null;
          attendee_profile_url?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          lead_id?: string | null;
          channel?: string;
          unipile_chat_id?: string | null;
          status?: string;
          updated_at?: string;
          attendee_name?: string | null;
          attendee_profile_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          direction: string;
          content: string;
          attachments: Json | null;
          timestamp: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          direction: string;
          content: string;
          attachments?: Json | null;
          timestamp?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          direction?: string;
          content?: string;
          attachments?: Json | null;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage: {
        Row: {
          id: string;
          user_id: string;
          agent_id: string;
          provider: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          cached_tokens: number;
          estimated_cost_usd: number;
          metadata: Json | null;
          input_text: string | null;
          output_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          agent_id: string;
          provider: string;
          model: string;
          input_tokens?: number;
          output_tokens?: number;
          cached_tokens?: number;
          estimated_cost_usd?: number;
          metadata?: Json | null;
          input_text?: string | null;
          output_text?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          agent_id?: string;
          provider?: string;
          model?: string;
          input_tokens?: number;
          output_tokens?: number;
          cached_tokens?: number;
          estimated_cost_usd?: number;
          metadata?: Json | null;
          input_text?: string | null;
          output_text?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Convenience type aliases
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
