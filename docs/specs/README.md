# 기능 명세 인덱스

Plan 일정 관리 앱의 **사용자 관점 기능 명세**입니다.

**작업 순서:** [TESTING.md](./TESTING.md) §2 — 명세 → 테스트 보강 → 구현 → **수동 QA**

---

## 현재 상태 요약

| 구분 | 상태 |
|------|------|
| 달력·인증·일정 CRUD·반복·프로필·토스트·Confirm | ✅ 구현 |
| AI 어시스턴트 고도화 (1·2·3차) | ✅ 구현 · Edge Function 배포 완료 |
| 단위 테스트 (`lib/`, 50건) + CI | ✅ 구현 |
| **수동 QA** | ⏳ [TESTING.md](./TESTING.md) §7 실행 대기 |
| 비밀번호 찾기/재설정 | ⏸️ 보류 |

## 공통

| 문서 | 내용 |
|------|------|
| [TOAST.md](./TOAST.md) | 토스트 UI |
| [CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md) | 삭제 확인 (커스텀 Dialog) |
| [TIME.md](./TIME.md) | 시간·타임존 (KST 벽시계) |
| [LAYOUT.md](./LAYOUT.md) | 앱 레이아웃·모바일 탭 |
| [REALTIME.md](./REALTIME.md) | Supabase Realtime 동기화 |
| [TESTING.md](./TESTING.md) | 테스트·작업 순서 |

---

## 인증

| 문서 | 내용 |
|------|------|
| [SIGNUP.md](./SIGNUP.md) | 회원가입 |
| [LOGIN.md](./LOGIN.md) | 로그인·로그아웃 |

---

## 일정

| 문서 | 내용 |
|------|------|
| [EVENT_COMMON.md](./EVENT_COMMON.md) | 일정 CRUD 공통 |
| [EVENT_CREATE.md](./EVENT_CREATE.md) | 일정 추가 |
| [EVENT_UPDATE.md](./EVENT_UPDATE.md) | 일정 수정 |
| [EVENT_DELETE.md](./EVENT_DELETE.md) | 일정 삭제 |
| [RECURRING_EVENTS.md](./RECURRING_EVENTS.md) | 반복 일정 |
| [CALENDAR.md](./CALENDAR.md) | 달력 |

---

## 기타

| 문서 | 내용 |
|------|------|
| [PROFILE.md](./PROFILE.md) | 프로필·개인 설정 |
| [AI_ASSISTANT.md](./AI_ASSISTANT.md) | AI 어시스턴트 (고도화 1·2·3차 ✅) |
| [SCHEDULE_RESOLUTION.md](./SCHEDULE_RESOLUTION.md) | 일정 날짜 해석 (ScheduleSpec V1) |

---

## 보류·선택

| 항목 | 문서 | 비고 |
|------|------|------|
| 비밀번호 찾기/재설정 | [LOGIN.md](./LOGIN.md) §6 | ⏸️ 보류 |
| `recurrenceActions.ts` 단위 테스트 | [TESTING.md](./TESTING.md) §3 | 선택 |
| React/FullCalendar/E2E 테스트 | [TESTING.md](./TESTING.md) §6 | 보류 |
| 수동 QA 체크리스트 **실행** | [TESTING.md](./TESTING.md) §7 | **다음 우선 작업** |
