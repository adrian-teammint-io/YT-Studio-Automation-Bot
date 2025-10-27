import { createClient } from '@supabase/supabase-js';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      live_campaigns: {
        Row: {
          campaign_id: string
          campaign_name: string
          created_at: string | null
          folder_id: string
          id: number
          parent_folder: string
          updated_at: string | null
        }
        Insert: {
          campaign_id: string
          campaign_name: string
          created_at?: string | null
          folder_id: string
          id?: number
          parent_folder: string
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string
          campaign_name?: string
          created_at?: string | null
          folder_id?: string
          id?: number
          parent_folder?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      live_products: {
        Row: {
          id: number
          product_name: string
          product_id: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          product_name: string
          product_id: string
          created_at?: string | null
          id?: number
          updated_at?: string | null
        }
        Update: {
          product_name?: string
          product_id?: string
          created_at?: string | null
          id?: number
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export type LiveCampaign = Database['public']['Tables']['live_campaigns']['Row'];
export type LiveCampaignInsert = Database['public']['Tables']['live_campaigns']['Insert'];

export type LiveProduct = Database['public']['Tables']['live_products']['Row'];
export type LiveProductInsert = Database['public']['Tables']['live_products']['Insert'];
