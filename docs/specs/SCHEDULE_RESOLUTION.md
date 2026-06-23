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
| 5 | **다중 후보(N건)** 는 절대 자동 실행하지 않음. `propose_action` 또는 후속 V3 `pick-target`. |
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

### 3-2. `TimeSpec` (V1 조회: `time_period` 필터로 유지)

V1 조회는 도구 인자 `time_period`를 그대로 사용. V2에서 `ScheduleSpec.time`으로 통합.

### 3-3. `ScheduleSpec`

```ts
{ date: DateSpec; time?: TimeSpec }  // V1 query: date만 사용
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

```
LLM → query_events(schedule_spec | legacy period, filters)
    → legacyArgsToDateSpec / parseScheduleSpec
    → resolveSchedule(mode: 'range')
    → executeEventQuery
    → result { events, range, resolved }
    → LLM 답변 (resolved만 인용)
```

| 모듈 | 파일 |
|------|------|
| 타입 | `scheduleSpec.ts` |
| 해석 | `resolveSchedule.ts` |
| 조회 실행 | `tools.ts` (`query_events`) |
| 메시지 보강 | `index.ts` (`enrichScheduleSpec`) |
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
- 프롬프트: `sessionContext`의 id만 update/delete에 사용. 불명확하면 `propose_action`.

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

### V1 (구현 중)

- [x] 설계 동결 (본 문서)
- [x] `scheduleSpec.ts`, `resolveSchedule.ts`, 테스트
- [x] `query_events` 연동 + `result.resolved`
- [x] canonical pagination args
- [x] `sessionContext.lastQuery`
- [x] 프롬프트 `schedule_spec` + resolved 인용

### V2

- `resolveSchedule(mode: instant)` → create/update
- `TimeSpec` 통합
- 레거시 `period` 제거

### V3

- `identifyEvents` + 다중 후보 UI
- `pick-target` confirmation

---

## 10. 구현 파일

| 파일 | 역할 |
|------|------|
| `supabase/functions/ai-assistant/scheduleSpec.ts` | 타입 |
| `supabase/functions/ai-assistant/resolveSchedule.ts` | 해석 |
| `supabase/functions/ai-assistant/resolveSchedule.test.ts` | 단위 테스트 |
| `supabase/functions/ai-assistant/tools.ts` | query 연동·프롬프트 |
| `supabase/functions/ai-assistant/index.ts` | enrich·sessionContext·pagination |
| `frontend/src/hooks/useAIChat.ts` | sessionContext 전송 |

---

## 11. QA

[TESTING.md](./TESTING.md) AI 조회·요일·다음주/다다음주 항목을 V1 배포 후 실행.
