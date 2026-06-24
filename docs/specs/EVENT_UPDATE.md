# 일정 수정 기능 명세

> 공통: [EVENT_COMMON.md](./EVENT_COMMON.md) · 반복: [RECURRING_EVENTS.md](./RECURRING_EVENTS.md) · 확인 UI: [CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md) · AI: [AI_ASSISTANT.md](./AI_ASSISTANT.md)  
> 인덱스: [README.md](./README.md)

---

## 1. 진입

- 달력: 등록된 일정을 **클릭**하여 **일정 수정 Modal**을 연다. 반복 일정의 특정 회차를 클릭하면 해당 회차 기준으로 열린다.
- AI 어시스턴트: 자연어 수정 요청 ([AI_ASSISTANT.md](./AI_ASSISTANT.md) §7-1).

수정 범위 정책은 **달력과 AI 공통**이다.

---

## 2. 검증 및 실패

[EVENT_CREATE.md](./EVENT_CREATE.md)와 동일한 필수 항목·검증 규칙을 따른다.

실패 시 토스트:

- variant: `error`
- title: `일정 수정 실패`
- description: `{실패 사유}`

---

## 3. 성공 (일반 일정)

1. **"일정 수정 성공"** 토스트 (success)
2. Modal 닫힘
3. 달력 새로고침

---

## 4. 반복 일정 수정 범위

반복 **인스턴스**를 수정할 때 범위 선택 Dialog를 제시한다 ([CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md) §3).

| 버튼 | 동작 |
|------|------|
| `취소` | 닫기 (저장 안 함) |
| `해당 일정만` | 해당 회차만 분리·수정 |
| `전체 일정` | 시리즈 전체 수정 |

- 개별(비반복·분리된 단일) 일정 수정은 Dialog **없이** 바로 저장한다.
- 범위 Dialog는 [EVENT_COMMON.md](./EVENT_COMMON.md)의 `deferred` 흐름을 따른다.
- 실패 시: 달력은 토스트(`일정 수정 실패`), AI는 채팅 메시지.

---

## 5. 해당 일정만 수정

- 해당 회차는 시리즈 **제외 목록**(`event_recurrence_exceptions`)에 등록된다.
- 수정 내용은 **개별 일정(`events` row)** 으로 분리 생성된다.
- **어떤 필드를 수정하든** (제목·설명·카테고리·날짜 등) 동일하게 분리한다.
- 분리된 일정은 이후 **전체 수정**·**전체 삭제**의 영향을 받지 않는다.

---

## 6. 전체 일정 수정

- 마스터 이벤트와 남은 모든 회차가 수정된다.
- 이미 분리된 개별 일정은 수정 대상에서 **제외**된다.

**예시**

1. 매주 반복 일정 추가
2. 둘째 주를 **이 일정만 수정**으로 분리
3. 다른 회차에서 요일 변경(**전체 일정 수정**)
4. → 둘째 주는 분리·제외 상태이므로 새 패턴으로 **매꿔지지 않음**

---

## 7. 반복 규칙 변경

반복 옵션·간격·종료 조건 등 **반복 규칙이 하나라도 바뀌면**:

- **전체 일정 수정**(`scope: all`)으로 처리한다. (범위 Dialog 생략)
- 해당 시리즈의 **제외 목록 전체를 삭제**한다.
- 분리된 개별 일정 row는 **건드리지 않는다**.

---

## 8. 드래그·리사이즈

일반 일정: 드래그/리사이즈(시작·끝 양쪽) 후 즉시 저장. 뷰별 리사이즈 방향은 [CALENDAR.md](./CALENDAR.md) §7-2.

반복 인스턴스: **드래그·리사이즈한 회차만** preview로 변경 위치 유지, 나머지 회차는 refetch 반영. 취소/실패 시 `revert`.

---

## 9. 구현 상태

| 항목 | 상태 |
|------|------|
| 개별 수정 (Confirm 없음) | ✅ 구현 |
| 반복 수정 범위 선택 (공용 `ConfirmDialog`, 취소/해당 일정만/전체 일정) | ✅ 구현 |
| AI 반복 수정 범위 | ⏸ 보류 (V2.3 차단, [AI_ASSISTANT.md](./AI_ASSISTANT.md) §7-0) |

---

## 10. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/components/calendar/EventCalendar.tsx` | `handleSave`, `applyScope`, 드래그/리사이즈 |
| `frontend/src/components/common/ConfirmDialog.tsx` | 범위 선택 UI (3버튼) |
| `frontend/src/lib/recurrenceActions.ts` | 달력 `editRecurringEvent` |
| `frontend/src/lib/eventMapper.ts` | `recurrenceRuleChanged` |
| `frontend/src/components/ai/AIAssistantPanel.tsx` | AI 수정 범위 확인 |
| `supabase/functions/ai-assistant/recurrenceActions.ts` | AI 반복 수정·삭제 범위 처리 |
