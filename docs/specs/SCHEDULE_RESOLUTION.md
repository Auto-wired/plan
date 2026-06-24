# 일정 해석 (Schedule Resolution)

> AI 어시스턴트: [AI_ASSISTANT.md](./AI_ASSISTANT.md) · 시간: [TIME.md](./TIME.md) · 테스트: [TESTING.md](./TESTING.md)

자연어 일정 표현을 **구조화된 스펙 → TS 계산 → DB/답변**으로 처리하는 설계.  
**설계 동결(V1)** — 추가 아키텍처 논의 없이 아래 정책·범위대로 구현한다.

---

## 1. 목표

사용자가 AI 어시스턴트만으로 일정 **조회·추가·수정·삭제**를 할 수 있게 한다.

- LLM: 자연어 → `ScheduleSpec` 등 **구조만** 생성
- TS: 날짜·시간·요일·confidence 계산
- 확신이 낮거나 후보가 여러 건이면 **절대 자동 실행하지 않고 되묻기**

---

## 2. 동결 정책 (구현 전 확정)

| # | 정책 |
|---|------|
| 1 | **Pagination**은 항상 canonical `start_date` / `end_date` 기반. `period`·`schedule_spec`은 더보기 args에 저장하지 않음. |
| 2 | **`sessionContext.lastQuery`** 를 V1에 포함. 후속 턴(「그거 삭제」 등)에서 이벤트 id 참조. |
| 3 | **delete**는 항상 confirmation 필요 (현행 유지). |
| 4 | **confidence**는 TS에서만 계산. LLM self-report 금지. |
| 5 | **다중 후보(2~5건)** 는 **pick-target** 목록. **6건+**·**0건**은 채팅 되묻기. **절대** 잘못된 id로 자동 실행 금지. |
| 6 | **V1**은 조회(Query) `resolveSchedule(mode: range)` 중심. |
| 7 | create/update/delete의 `ScheduleSpec` 적용은 **V2**. |

---

## 3. 도메인 모델

### 3-1. `DateSpec`

| kind | 필드 | 예 |
|------|------|-----|
| `absolute` | `start_date`, `end_date?` | `2026-07-03` |
| `day` | `day_offset` (0=오늘, 1=내일, 2=모레) | `5일 뒤` → `5` |
| `week` | `week_offset`, `weekday?` | 다다음주 수요일 → `2`, `wed` |
| `month_span` | `month_offset` | 이번달 → `0` |
| `year` | `year_offset` | 올해 → `0` |

달력 주는 **일요일~토요일(KST)**. `week` + `weekday`는 해당 주의 그 요일 **하루**로 범위를 좁힌다.

### 3-2. `TimeSpec` (V2 create/update)

| kind | 필드 | 예 |
|------|------|-----|
| `all_day` | — | 종일 |
| `clock` | `hour`, `minute?` | 15:30 → hour 15, minute 30 |
| `time_period` | `period` | 저녁 → evening (기본 18:00 KST) |
| `preserve` | — | update 시 `time` 생략 → **기존 회차/일정 시각 유지** (TS merge) |

V1 조회는 도구 인자 `time_period` 필터를 그대로 사용. V2 mutation은 `schedule_spec.time`으로 통합.

### 3-3. `ScheduleSpec`

```ts
{ date: DateSpec; time?: TimeSpec; duration_minutes?: number }
```

### 3-4. `ResolvedSchedule` (TS 출력)

| 필드 | 설명 |
|------|------|
| `startDate`, `endDate` | KST YYYY-MM-DD (inclusive) |
| `startUtc`, `endUtcExclusive` | DB 조회용 |
| `resolved_label` | 답변용 한국어 라벨 |
| `resolved_date` | 단일일 때 |
| `weekday_ko` | 단일일 때 |
| `granularity` | `day` \| `range` |
| `confidence` | `high` \| `medium` \| `low` (TS only) |

---

## 4. 레이어

### 조회 (V1)

```
LLM → query_events(schedule_spec | legacy period, filters)
    → enrichScheduleSpec (메시지 보강)
    → resolveSchedule(mode: 'range')
    → result { events, resolved }
```

### 추가·수정 (V2 / V2.2)

```
LLM → create_event | update_event
    → sanitizeUpdateArgs (V2.2: metadata vs reschedule)
    → [reschedule만] applyMutationScheduleSpec
    → result { event, resolved }
```

| 모듈 | 파일 |
|------|------|
| Mutation Safety | `mutationSafety.ts` |
| 타입 | `scheduleSpec.ts` |
| 해석 | `resolveSchedule.ts` |
| 조회·mutation 실행 | `tools.ts` |
| 메시지·세션 보강 | `index.ts`, `sessionEnrich.ts` |
| 세션 | `sessionContext` (요청 body) |

---

## 5. Legacy 호환 (V1)

`period`, `weekday`, `start_date`/`end_date`는 `legacyArgsToDateSpec`으로 `DateSpec`에 변환한다.

| legacy | DateSpec |
|--------|----------|
| `today` | `day` offset 0 |
| `tomorrow` | `day` offset 1 |
| `this_week` + `wed` | `week` offset 0 + wed |
| `next_week` | `week` offset 1 |
| `this_month` | `month_span` 0 |

`schedule_spec`이 있으면 legacy 날짜 필드보다 **우선**.

---

## 6. Pagination (canonical)

더보기(`mode: paginate`) 시 `queryArgs`는 반드시:

```json
{
  "start_date": "2026-07-08",
  "end_date": "2026-07-08",
  "keyword": "...",
  "time_period": "evening",
  "day_type": "weekday",
  "limit": 20
}
```

- `currentDate`가 바뀌어도 범위는 **저장된 절대 날짜**만 사용.
- `period`, `schedule_spec`, `weekday`는 저장하지 않음.

---

## 7. sessionContext (V1)

요청 body:

```ts
sessionContext?: {
  lastQuery?: {
    resolved: {
      resolved_label: string
      resolved_date?: string
      weekday_ko?: string
      start_date: string
      end_date: string
    }
    events: Array<{
      id: string
      title: string
      start_at: string
    }>
  }
}
```

- 프론트: 마지막 조회 성공 시 `lastQuery`를 다음 메시지에 첨부.
- 프롬프트: `sessionContext`의 id·`start_at`으로 update/delete에 사용. 불명확하면 `propose_action`.
- **반복 해당 회차:** `original_start_at` = 조회 결과의 그 회차 `start_at`. **마스터 `start_at`으로 fallback 하지 않는다** ([§9 V2.1](#v21-v1v2-잔여-이슈-수정)).

---

## 8. confidence (TS)

| 수준 | 조건 (V1) |
|------|-----------|
| `high` | `schedule_spec`으로 해석 |
| `medium` | legacy `period` / `start_date` 등으로만 해석 |
| `low` | 날짜 제약 없음 (전체 조회) |

조회는 `low`여도 범위가 없으면 넓은 조회를 수행. **삭제·수정**은 다중 후보 시 자동 실행 금지([§2](#2-동결-정책-구현-전-확정) #5).

---

## 9. V1 / V2 범위

### V1 (완료)

- [x] 설계 동결 (본 문서)
- [x] `scheduleSpec.ts`, `resolveSchedule.ts`, 테스트
- [x] `query_events` 연동 + `result.resolved`
- [x] canonical pagination args
- [x] `sessionContext.lastQuery`
- [x] 프롬프트 `schedule_spec` + resolved 인용

### V2 (완료)

- [x] `resolveInstantSchedule` → create/update `start_at`/`end_at`/`all_day`
- [x] `TimeSpec` 통합 (`clock`, `time_period`, `all_day`)
- [x] `create_event` / `update_event`에 `schedule_spec` (legacy `start_at`/`end_at` 브리지)
- [x] mutation `result.resolved` (resolved_label, time_label, start_at 등)
- [x] 프롬프트 create/update 규칙
- [ ] 레거시 `period` 제거 (후순위)

### V2.1 (V1/V2 잔여 이슈 수정)

- [x] **update 시간:** `schedule_spec`에 date만 있을 때 — 메시지「N시」보강 → 없으면 **기존 일정 시각 유지** (종일 강제 변환 방지)
- [x] **mutation enrich (create):** create 시 메시지에서 date·time 추론
- [x] **반복 해당 회차:** `sessionContext.lastQuery`로 `original_start_at` 보강, `masterStart` fallback **제거**
- [x] `parseTimeSpec` 관대 파싱 (`{ hour: 15 }` 등)

### V2.2 (Mutation Safety Layer)

**파이프라인:** (3) CRUD → (2) 날짜 역할 → (1) 계산 → (5) 대상 → (4) changes → (6) gate

| 구분 | 내용 | DB mutation |
|------|------|-------------|
| **target** | `id`, `original_start_at`, (향후 `keyword`, `filter`) | 사용 안 함 |
| **changes** | `title`, `description`, `category` | 메타만 반영 |
| **changes (reschedule)** | `schedule_spec` + time, `start_at`/`end_at` | instant resolve 후 반영 |

**동결 불변식 (V2.2a — flat schema + partition):**

1. `inferScheduleSpecFromMessage`는 **query_events 전용**. update에 주입 금지.
2. update에서 **이동 의도(`hasRescheduleIntent`)** 없으면 `schedule_spec`/`start_at`/`end_at` **strip** (`sanitizeUpdateArgs`).
3. 이동 의도: 메시지 동사(옮겨, 미뤄, …) 또는 `schedule_spec.time` (clock/time_period).
4. 반복 **해당만** 수정: changes에 날짜 없으면 **회차 `original_start_at` 시각** 유지.
5. (향후 V2.2b) nested `{ target, changes }` 스키마.

**구현:** `mutationSafety.ts` — `partitionUpdateArgs`, `sanitizeUpdateArgs`, `hasRescheduleIntent`

- [x] 문서 동결 (본 절)
- [x] `mutationSafety.ts` + 테스트
- [x] enrich / `buildUpdateFields` / `executeTool` / `updateRecurringByScope(this)` 연동
- [ ] nested `{ target, changes }` 스키마 (후순위)

### V2.3 (AI 반복 mutation 보류)

반복 일정 **추가·수정·삭제**는 AI에서 버그·UX 불일치로 **대규모 리워크 전까지 차단**한다.

| 구분 | 정책 |
|------|------|
| **조회** | 계속 지원 (`recurrence.ts` 회차 전개) |
| **create** | `recurrence_freq` 있으면 차단 |
| **update/delete** | 마스터 `recurrence_freq` 있으면 차단 |
| **안내** | `RECURRING_MUTATION_BLOCKED_MESSAGE` — 달력에서 변경 요청 |
| **레거시** | `recurrenceActions.ts`·confirm `scope` 경로는 코드 유지, AI UI에서는 진입 불가 |

- [x] `recurringPolicy.ts` + `index.ts` / `tools.ts` / 프롬프트 연동
- [ ] AI 반복 CRUD 대규모 리워크 (문장→scope, 달력 Confirm 복제)

### V2.4 (Confirm 확정 — propose/맞다 파이프라인)

**원칙:** 확인 문장 = 서버가 resolve한 payload 기준. 맞다 = **확정된 JSON** 그대로 실행.

| 단계 | 동작 |
|------|------|
| **propose_action** | `enrichToolArgs` → `freezePendingMutationArgs` (start_at/end_at 확정, schedule_spec 제거) → `buildConfirmationMessage` |
| **pending** | `_v24Frozen` + `triggerUserMessage` 저장 |
| **confirm** | frozen이면 재-enrich 없이 실행; 아니면 `triggerUserMessage` + `sessionContext`로 enrich. `executeTool(..., { userMessage })` |

- [x] `confirmProposal.ts`, `enrichToolArgs.ts` 분리
- [x] propose 시 LLM `question` 무시, 서버 문장
- [x] confirm 시 `triggerUserMessage` / `sessionContext` 전달
- [ ] QA: 모호한 수정(날짜 이동) 맞다 → 문장·달력 일치

### V3 (identifyEvents + pick-target)

**UI 3종:** pick-target 목록 · 맞다/아니다 · 삭제 Confirm (+ 0/6+건 채팅 fallback)

| 단계 | 동작 |
|------|------|
| **identify** | `extractSearchKeyword` + DB 조회 → tier: none / single / pick / too_many |
| **gate** | update/delete/propose 전 `gateMutationTarget` |
| **pick-target** | `mode=pick-target` → `continueAfterPickTarget` → delete Confirm / propose / execute |
| **한계** | 비반복 일정만; 반복 mutation V2.3 차단 유지 |

- [x] `identifyEvents.ts`, `mutationGate.ts` + 테스트
- [x] Edge `pick-target` mode, index gate 연동
- [x] 프론트 pick-target UI + `useAIChat.pickTarget`
- [ ] QA: 2~5건 목록 · pick→맞다/아니다 · 0/6+ 채팅

---

## 10. 구현 파일

| 파일 | 역할 |
|------|------|
| `supabase/functions/ai-assistant/scheduleSpec.ts` | 타입 |
| `supabase/functions/ai-assistant/resolveSchedule.ts` | 해석 |
| `supabase/functions/ai-assistant/resolveSchedule.test.ts` | 단위 테스트 |
| `supabase/functions/ai-assistant/mutationSafety.ts` | target/changes 분리·불변식 |
| `supabase/functions/ai-assistant/mutationSafety.test.ts` | Mutation Safety 테스트 |
| `supabase/functions/ai-assistant/recurringPolicy.ts` | AI 반복 mutation 차단 |
| `supabase/functions/ai-assistant/recurringPolicy.test.ts` | 반복 차단 정책 테스트 |
| `supabase/functions/ai-assistant/enrichToolArgs.ts` | 도구 인자 enrich |
| `supabase/functions/ai-assistant/confirmProposal.ts` | propose 확정·확인 문장 |
| `supabase/functions/ai-assistant/confirmProposal.test.ts` | 확인 문장 테스트 |
| `supabase/functions/ai-assistant/identifyEvents.ts` | mutation 대상 식별 |
| `supabase/functions/ai-assistant/identifyEvents.test.ts` | 키워드 추출 테스트 |
| `supabase/functions/ai-assistant/mutationGate.ts` | identify gate |
| `supabase/functions/ai-assistant/index.ts` | enrich·pick-target·confirm |
| `frontend/src/hooks/useAIChat.ts` | sessionContext 전송 |

---

## 11. QA

[TESTING.md](./TESTING.md) AI 조회·요일·다음주/다다음주 항목을 V1 배포 후 실행.
