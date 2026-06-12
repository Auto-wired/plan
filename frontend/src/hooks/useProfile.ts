import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { ThemeMode, UserProfile } from '../types'

async function fetchProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data as UserProfile
}

export function useProfile(userId: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  })

  const updateProfile = useCallback(
    async (updates: Partial<Pick<UserProfile, 'nickname' | 'avatar_url' | 'theme'>>) => {
      if (!userId) throw new Error('로그인이 필요합니다.')

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single()

      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['profile', userId] })
      return data as UserProfile
    },
    [queryClient, userId],
  )

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!userId) throw new Error('로그인이 필요합니다.')

      const ext = file.name.split('.').pop() ?? 'png'
      const path = `${userId}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = `${publicData.publicUrl}?t=${Date.now()}`

      return updateProfile({ avatar_url: avatarUrl })
    },
    [updateProfile, userId],
  )

  const setTheme = useCallback(
    async (theme: ThemeMode) => updateProfile({ theme }),
    [updateProfile],
  )

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    updateProfile,
    uploadAvatar,
    setTheme,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['profile', userId] }),
  }
}
