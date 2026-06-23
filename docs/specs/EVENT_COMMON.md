# 일정 CRUD 공통 명세

> 공통 UI: [TOAST.md](./TOAST.md) · 확인: [CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md)  
> 인덱스: [README.md](./README.md)

일정 **추가** · **수정** · **삭제**에 공통으로 적용되는 규칙입니다.

- 추가: [EVENT_CREATE.md](./EVENT_CREATE.md)
- 수정: [EVENT_UPDATE.md](./EVENT_UPDATE.md)
- 삭제: [EVENT_DELETE.md](./EVENT_DELETE.md)
- 반복 일정: [RECURRING_EVENTS.md](./RECURRING_EVENTS.md)

---

## 1. 피드백

- **브라우저 기본 검증 없음** (`noValidate`, `required` 없음)
- **Modal 인라인 에러 없음**
- 성공/실패는 **토스트**만 (`EVENT_TOAST`)
- 삭제 **확인**은 **Confirm Dialog** ([CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md)) — 토스트 아님

| 상황 | variant | title | description |
|------|---------|-------|-------------|
| 일정 추가 실패 | error | `일정 추가 실패` | `{실패 사유}` |
| 일정 추가 성공 | success | `일정 추가 성공` | — |
| 일정 수정 실패 | error | `일정 수정 실패` | `{실패 사유}` |
| 일정 수정 성공 | success | `일정 수정 성공` | — |
| 일정 삭제 실패 | error | `일정 삭제 실패` | `{실패 사유}` |
| 일정 삭제 성공 | success | `일정 삭제 성공` | — |

검증 실패 시 Modal은 **닫히지 않음**. API 실패 시에도 Modal은 유지한다.

---

## 2. 클라이언트 검증 (`validateEventForm`)

저장 전 순차 검사 (첫 실패 시 중단):

| 항목 | 실패 사유 예시 |
|------|----------------|
| 제목 | `제목을 입력해주세요.` |
| 시작일 | `시작일을 입력해주세요.` |
| 종료일 | `종료일을 입력해주세요.` |
| 시작/종료 순서 | `종료일은 시작일 이후여야 합니다.` |
| 날짜 형식 | `올바른 날짜를 입력해주세요.` |
| 카테고리 | `카테고리를 선택해주세요.` |
| 반복 횟수 | `반복 횟수를 입력해주세요.` |
| 반복 종료일 | `반복 종료 날짜를 입력해주세요.` |

---

## 3. 반복 일정과 범위 Dialog

반복 **인스턴스**에서 범위 선택이 필요한 저장/삭제:

1. Modal 저장/삭제 → `deferred` (범위 Dialog 표시, 성공 토스트 **아직 없음**)
2. 범위 선택 완료 → `EventCalendar.applyScope`에서 성공/실패 토스트

반복 **규칙 변경**으로 자동 `all` 적용 시 → Modal에서 즉시 수정 완료 토스트.

드래그·리사이즈로 반복 인스턴스를 이동할 때도 동일한 범위 선택 Dialog가 표시된다.  
DnD/리사이즈로 진입한 경우 **드래그한 회차만** `dragPreviewOverride`로 드롭 위치를 유지한다 (다른 회차는 refetch까지 기존 위치).  
범위 선택·저장 후에도 드래그한 회차는 DnD 종료 위치에 그대로 두고, refetch가 끝나면 나머지 회차가 함께 이동한다.  
Dialog **취소** 또는 **저장 실패** 시에만 `revert` + preview 해제. 범위 **선택** 시 `revert` 없음.

---

## 4. UI / UX

| 항목 | 동작 |
|------|------|
| 저장/삭제 중 | 버튼 `저장 중...` / `disabled` |
| 삭제 확인 | [EVENT_DELETE.md](./EVENT_DELETE.md) · [CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md) |

---

## 5. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/components/calendar/EventModal.tsx` | 검증, 토스트, 폼 |
| `frontend/src/components/calendar/EventCalendar.tsx` | CRUD API, 반복 scope 토스트 |
| `frontend/src/lib/eventValidation.ts` | 검증, `mapEventError` |
| `frontend/src/lib/eventToast.ts` | 토스트 문구 |
| `frontend/src/lib/eventValidation.test.ts` | 단위 테스트 |

테스트 범위: [TESTING.md](./TESTING.md)
