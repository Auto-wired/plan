import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/** 앱 전체에서 한 번만 호출 — Realtime 구독 중복 방지 */
export function useEventsRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
    }

    const channel = supabase
      .channel('events-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_recurrence_exceptions' },
        invalidate,
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient])
}
