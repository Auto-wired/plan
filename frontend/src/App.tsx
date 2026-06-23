import { useRef, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthGuard } from './components/auth/AuthGuard'
import { CategoryFilterBar } from './components/calendar/CategoryFilterBar'
import { EventCalendar, type EventCalendarHandle } from './components/calendar/EventCalendar'
import { ALL_EVENT_CATEGORIES, type EventCategory } from './lib/categories'
import { AIAssistantPanel } from './components/ai/AIAssistantPanel'
import { AIAssistantIcon } from './components/common/AIAssistantIcon'
import { AppLogo } from './components/common/AppLogo'
import { UserSettingsModal } from './components/settings/UserSettingsModal'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProfileProvider, useProfileContext } from './contexts/ProfileContext'
import { ToastProvider, useToast } from './contexts/ToastContext'
import { AUTH_TOAST } from './lib/authToast'
import { useEventsRealtime } from './hooks/useEventsRealtime'
import type { CalendarEvent } from './types'
import './App.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function CalendarIcon({ active }: { active?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3"
        y="4"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.5}
      />
      <path
        d="M3 10h18M8 2v4M16 2v4"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.5}
        strokeLinecap="round"
      />
    </svg>
  )
}

function AppHeader() {
  const { user, signOut } = useAuth()
  const { profile } = useProfileContext()
  const { showToast } = useToast()
  const [signingOut, setSigningOut] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } catch (err) {
      const reason = err instanceof Error ? err.message : '로그아웃에 실패했습니다. 잠시 후 다시 시도해주세요.'
      showToast(AUTH_TOAST.logoutFailure(reason), { variant: 'error' })
    } finally {
      setSigningOut(false)
    }
  }

  const nickname = profile?.nickname ?? user?.email?.split('@')[0] ?? '사용자'
  const userInitial = nickname.charAt(0).toUpperCase()

  return (
    <>
      <header className="app-header">
        <div className="app-header-left">
          <AppLogo className="app-logo" />
          <div className="app-header-brand">
            <h1 className="app-title">Plan</h1>
            <p className="app-tagline">일정 관리</p>
          </div>
        </div>
        <div className="app-header-right">
          <button
            type="button"
            className="user-badge"
            onClick={() => setSettingsOpen(true)}
            aria-label="개인 설정 열기"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="user-avatar-image" />
            ) : (
              <span className="user-avatar">{userInitial}</span>
            )}
            <span className="app-user">{nickname}</span>
          </button>
          <button
            type="button"
            className="app-signout"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? '...' : '로그아웃'}
          </button>
        </div>
      </header>

      {settingsOpen && (
        <UserSettingsModal email={user?.email} onClose={() => setSettingsOpen(false)} />
      )}
    </>
  )
}

function MainLayout() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'ai'>('calendar')
  const [selectedCategories, setSelectedCategories] = useState<EventCategory[]>(ALL_EVENT_CATEGORIES)
  const calendarRef = useRef<EventCalendarHandle>(null)

  useEventsRealtime()

  const handleAIEventClick = (event: CalendarEvent) => {
    calendarRef.current?.openEventForEdit(event)

    if (window.matchMedia('(max-width: 768px)').matches) {
      setActiveTab('calendar')
    }
  }

  return (
    <div className="app-layout">
      <AppHeader />

      <div className="app-content">
        <CategoryFilterBar
          selectedCategories={selectedCategories}
          onChange={setSelectedCategories}
        />

        <main className="app-main">
          <section className={`calendar-section ${activeTab === 'calendar' ? 'active' : ''}`}>
            <div className="calendar-card">
              <EventCalendar ref={calendarRef} selectedCategories={selectedCategories} />
            </div>
          </section>
          <aside className={`ai-section ${activeTab === 'ai' ? 'active' : ''}`}>
            <AIAssistantPanel onEventClick={handleAIEventClick} />
          </aside>
        </main>
      </div>

      <nav className="mobile-tabs" aria-label="탭 메뉴">
        <button
          type="button"
          className={activeTab === 'calendar' ? 'active' : ''}
          onClick={() => setActiveTab('calendar')}
          aria-label="달력"
          aria-current={activeTab === 'calendar' ? 'page' : undefined}
        >
          <CalendarIcon active={activeTab === 'calendar'} />
          <span>달력</span>
        </button>
        <button
          type="button"
          className={activeTab === 'ai' ? 'active' : ''}
          onClick={() => setActiveTab('ai')}
          aria-label="AI"
          aria-current={activeTab === 'ai' ? 'page' : undefined}
        >
          <AIAssistantIcon size={22} />
          <span>AI</span>
        </button>
      </nav>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <ProfileProvider>
              <AuthGuard>
                <MainLayout />
              </AuthGuard>
            </ProfileProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
