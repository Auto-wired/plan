import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { ThemeMode, UserProfile } from '../types'

interface ProfileContextValue {
  profile: UserProfile | null
  loading: boolean
  updateProfile: ReturnType<typeof useProfile>['updateProfile']
  uploadAvatar: ReturnType<typeof useProfile>['uploadAvatar']
  setTheme: ReturnType<typeof useProfile>['setTheme']
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#1a1a1a' : '#f7f7f5')
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { profile, isLoading, updateProfile, uploadAvatar, setTheme } = useProfile(user?.id)

  useEffect(() => {
    if (profile?.theme) {
      applyTheme(profile.theme)
    }
  }, [profile?.theme])

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading: isLoading,
        updateProfile,
        uploadAvatar,
        setTheme,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfileContext(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) {
    throw new Error('useProfileContext must be used within ProfileProvider')
  }
  return ctx
}
