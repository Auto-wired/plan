import { createClient } from '@supabase/supabase-js'
import type { CalendarEvent, RecurrenceException, UserProfile } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'placeholder',
)

export type Database = {
  public: {
    Tables: {
      events: {
        Row: CalendarEvent
        Insert: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<CalendarEvent, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
      }
      profiles: {
        Row: UserProfile
        Insert: Omit<UserProfile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>>
      }
      event_recurrence_exceptions: {
        Row: RecurrenceException
        Insert: Omit<RecurrenceException, 'id' | 'created_at'>
        Update: Partial<Omit<RecurrenceException, 'id' | 'event_id' | 'created_at'>>
      }
    }
  }
}
