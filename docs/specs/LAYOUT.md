# 앱 레이아웃 명세

> 인덱스: [README.md](./README.md)

---

## 1. 인증 전

- 로그인 / 회원가입 단일 화면 (`LoginForm`, `AuthGuard` 밖)

---

## 2. 인증 후 (MainLayout)

### 데스크톱

- **헤더:** 로고(호버 시 앱 버전 `v{semver} · {git sha}`) · 프로필(아바타·닉네임) · 로그아웃
- **본문:** 좌측 달력 + 카테고리 필터 · 우측 AI 어시스턴트 패널

### 모바일

- **헤더:** 동일
- **본문:** 달력 **또는** AI 패널 (한 화면에 하나)
- **하단 탭:** 달력 / AI 전환 (`.mobile-tabs`)

토스트 위치는 [TOAST.md](./TOAST.md) §4 (모바일 탭 위 `72px`).

---

## 3. 전역

- `ErrorBoundary` — React 렌더 오류 시 폴백 UI
- `ToastProvider` — 전역 토스트
- `ProfileProvider` — 프로필·테마

---

## 4. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/App.tsx` | 레이아웃·탭·헤더 |
| `frontend/src/lib/appVersion.ts` | 빌드 시 주입된 semver·Git SHA |
| `frontend/vite.config.ts` | `__APP_VERSION__`·`__BUILD_SHA__` 주입 |
| `frontend/src/components/auth/AuthGuard.tsx` | 세션 없으면 로그인 화면 |
| `frontend/src/components/ErrorBoundary.tsx` | 에러 바운더리 |
