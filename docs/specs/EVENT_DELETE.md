# 일정 삭제 기능 명세

> 공통: [EVENT_COMMON.md](./EVENT_COMMON.md) · 확인 UI: [CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md) · 반복: [RECURRING_EVENTS.md](./RECURRING_EVENTS.md) · AI: [AI_ASSISTANT.md](./AI_ASSISTANT.md)  
> 인덱스: [README.md](./README.md)

---

## 1. 진입

- 달력: **일정 수정 Modal**의 삭제 버튼.
- AI 어시스턴트: 자연어 삭제 요청 ([AI_ASSISTANT.md](./AI_ASSISTANT.md) §7-2).

삭제 정책·버튼 구성은 **달력과 AI 공통**이다.

---

## 2. 삭제 플로우 (확정)

모든 확인은 **커스텀 Confirm Dialog** ([CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md)). `window.confirm` 사용 안 함.  
범위 선택과 확인은 **하나의 Dialog 버튼**으로 통합한다.

### 2-1. 개별 일정 (비반복·분리된 단일)

```
삭제 → Confirm(취소 / 삭제) → 삭제 API → 성공 토스트 → Modal 닫힘
```

문구: `이 일정을 삭제하시겠습니까?`

### 2-2. 반복 일정 (남은 회차 2개 이상)

```
삭제 → Confirm(취소 / 해당 일정만 / 전체 일정) → 삭제 API → 성공 토스트
```

- 별도 범위 Dialog 없이 **3버튼 한 번**으로 범위와 확인을 동시에 받는다.
- `해당 일정만` → 해당 회차만 제외, `전체 일정` → 시리즈 전체 삭제.

### 2-3. 마지막 1회차 (유한 반복만)

```
삭제 → Confirm(취소 / 전체 삭제) → 전체 삭제(마스터) API → 성공 토스트 → 닫힘
```

- 선택할 회차가 없으므로 **2버튼** (`해당 일정만` 없음).
- 문구: `전체 반복 일정을 삭제하시겠습니까?`
- 동작은 전체 삭제와 동일 (마스터 + 제외 목록 삭제).

무한 반복(계속 반복)은 §2-3 대상 **아님** → §2-2와 동일.

---

## 3. 실패

- 달력: 토스트 (`error`, title `일정 삭제 실패`, description `{실패 사유}`). Modal은 닫히지 않는다.
- AI 어시스턴트: **채팅 메시지**로 안내 (토스트 없음, [AI_ASSISTANT.md](./AI_ASSISTANT.md) §3).

취소(Confirm 단계에서 닫기)한 경우는 API 미호출.

---

## 4. 성공

1. **"일정 삭제 성공"** 토스트 (success)
2. Modal 닫힘 (이미 닫힌 경우 생략)
3. 달력 새로고침

---

## 5. 해당 일정만 삭제 (반복)

해당 회차를 `event_recurrence_exceptions`에 등록하여 시리즈 전개에서 **제외**한다.

---

## 6. 전체 일정 삭제 (반복)

마스터 이벤트(`events`)와 해당 시리즈의 **제외 목록 전체**를 삭제한다.

> 분리된 개별 일정은 전체 삭제 대상이 **아니며** 독립 일정으로 남는다.

---

## 7. 구현 상태

| 항목 | 상태 |
|------|------|
| 개별 삭제 Confirm (취소/삭제) — 달력·AI | ✅ 구현 |
| 반복 삭제 3버튼 통합 (취소/해당/전체) — 달력 | ✅ 구현 |
| 마지막 1회차 2버튼 (취소/전체 삭제) — 달력 | ✅ 구현 |
| 반복 삭제 범위 — AI (달력 동일 정책) | ✅ 구현 |
| 마지막 1회차 전체 삭제 로직 | ✅ 구현 |

---

## 8. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/components/calendar/EventModal.tsx` | 삭제 버튼·개별 Confirm |
| `frontend/src/components/calendar/EventCalendar.tsx` | `handleDelete`, `executeRecurringDelete` |
| `frontend/src/components/common/ConfirmDialog.tsx` | 2/3버튼 확인 UI |
| `frontend/src/lib/recurrenceActions.ts` | 달력 `deleteRecurringEvent`, `getRemainingRecurringOccurrences` |
| `frontend/src/components/ai/AIAssistantPanel.tsx` | AI 삭제 확인·스냅샷 |
| `supabase/functions/ai-assistant/recurrenceActions.ts` | AI 반복 삭제 범위 처리 |
