# 토스트 UI 명세

> 기능별 메시지 문구는 각 명세(`SIGNUP.md`, `LOGIN.md` 등)를 따른다.  
> 인덱스: [README.md](./README.md)

---

## 1. 역할

- 앱 전역 하단 알림
- 성공·실패 피드백을 **제목 + 상세** 구조로 통일
- **삭제 확인**은 토스트가 아니라 [CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md)

---

## 2. 레이아웃

```
┌─────────────────────────────────────┐
│ [아이콘]  제목 (굵게)                │
│           상세 내용 (선택, 보통 굵기) │
└─────────────────────────────────────┘
```

- **왼쪽:** Lucide `CircleCheck`(success) / `CircleX`(error)
- **오른쪽:** 제목(`title`) + 상세(`description`, 선택)
- 텍스트 **왼쪽 정렬**

---

## 3. variant (2종)

| variant | 아이콘 | 스타일 | 기본 표시 시간 |
|---------|--------|--------|----------------|
| `success` | `CircleCheck` | 연두 테두리 + 연한 연두 배경 | 5.5초 |
| `error` | `CircleX` | 붉은 테두리 + 연한 붉은 배경 | 5초 |

### 색상 (라이트 모드)

| variant | 테두리 | 배경 | 아이콘 |
|---------|--------|------|--------|
| success | `#86efac` | `#f0fdf4` | `#16a34a` |
| error | `#fca5a5` | `#fef2f2` | `#dc2626` |

다크 모드: 동일 계열 어두운 배경·밝은 텍스트/아이콘.

---

## 4. 표시 위치

| 환경 | 위치 |
|------|------|
| 데스크톱 | 하단 중앙, `safe-area-inset-bottom` 반영 |
| 모바일 — 로그인/회원가입 | 하단 `16px` + safe area |
| 모바일 — 메인 앱 (`.mobile-tabs` 존재) | 하단 `72px` + safe area (하단 탭 위) |

---

## 5. 동작

- **최대 3개** 동시 표시. 초과 시 **가장 오래된 토스트부터 제거**
- 여러 토스트는 **아래에서 위로** 쌓임
- **각 토스트 독립 타이머** (새 토스트 추가 시 기존 타이머 리셋 없음)
- `pointer-events: none`
- `aria-live="polite"`
- 모바일: 패딩·글자 크기 축소, 너비 `100vw - 24px`

---

## 6. API

```typescript
interface ToastContent {
  title: string
  description?: string
}

showToast(
  content: ToastContent | string,  // string → title만
  options: {
    variant: 'success' | 'error'    // 필수
    duration?: number
  }
)
```

---

## 7. 메시지 예시 (요약)

| 영역 | 문서 |
|------|------|
| 인증 | [SIGNUP.md](./SIGNUP.md), [LOGIN.md](./LOGIN.md) |
| 일정 CRUD | [EVENT_COMMON.md](./EVENT_COMMON.md) |
| 프로필 실패 | [PROFILE.md](./PROFILE.md) — `프로필 저장 실패` 등 |
| DnD 실패 | [CALENDAR.md](./CALENDAR.md) — `일정 수정 실패` |
| 로그아웃 실패 | [LOGIN.md](./LOGIN.md) — `로그아웃 실패` |
| 음성 오류 | `error`, title만 |

---

## 8. 적용 범위·구현 상태

| 영역 | 명세 | 구현 |
|------|------|------|
| 인증 | 토스트 | ✅ |
| 일정 CRUD | 토스트 | ✅ |
| 음성 입력 오류 | 토스트 | ✅ |
| 프로필 실패 | 토스트 | ✅ 구현 |
| DnD/리사이즈 실패 | 토스트 | ✅ 구현 |
| 로그아웃 실패 | 토스트 | ✅ 구현 |
| AI 일반 오류 | ⏸️ 보류 | 채팅만 |

---

## 9. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/contexts/ToastContext.tsx` | Provider, 최대 3개, `showToast` |
| `frontend/src/contexts/Toast.css` | 스타일, 모바일·safe area |
| `frontend/src/lib/authToast.ts` | 인증 문구 |
| `frontend/src/lib/eventToast.ts` | 일정 문구 |
| `frontend/src/lib/profileToast.ts` | 프로필 문구 |
