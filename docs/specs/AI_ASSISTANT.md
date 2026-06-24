# AI 어시스턴트 기능 명세

> 공통 UI: [TOAST.md](./TOAST.md) (음성 오류) · 확인 UI: [CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md)  
> 시간: [TIME.md](./TIME.md) · 반복: [RECURRING_EVENTS.md](./RECURRING_EVENTS.md)  
> 레이아웃: [LAYOUT.md](./LAYOUT.md) · 인덱스: [README.md](./README.md)

자연어(텍스트·음성)로 일정을 조회·추가·수정·삭제하는 어시스턴트.  
**고도화 1·2·3차 구현 완료.** 구현·배포·검증 상태는 [§12](#12-구현-단계와-상태)를 따른다.

---

## 1. 진입

- 데스크톱: 우측 **AI 어시스턴트** 패널
- 모바일: 하단 탭으로 달력 ↔ AI 전환

---

## 2. 지원 기능·입력

| 기능 | 설명 |
|------|------|
| 일정 조회 | 자연어로 기간·시간대·키워드 조회 |
| 일정 추가 | 자연어로 **비반복** 일정 생성 |
| 일정 수정 | 자연어로 일정 변경 |
| 일정 삭제 | 자연어로 일정 삭제 |

**입력:** 텍스트 + 음성 (Chrome/Edge, Web Speech API)

---

## 3. 공통 원칙 (전 기능)

| 항목 | 정책 |
|------|------|
| **타임존** | 항상 **KST(Asia/Seoul)** 기준. 달력·DB와 동일한 벽시계 ([TIME.md](./TIME.md)) |
| **카테고리 필터** | 달력 상단 필터는 AI 조회에 **적용하지 않는다** (항상 전체 대상) |
| **피드백** | 결과·안내는 **채팅 메시지로만**. 성공 토스트 없음 |
| **오류** | AI 요청 실패는 **채팅 메시지**(`오류: ...`)로만 표시. 별도 토스트 없음 |
| **되묻기 대상** | **삭제**와 **모호한 요청**만 ([§8](#8-되묻기-confirmation)). 추가·대상이 명확한 수정은 되묻지 않음 |
| **반복 일정** | **조회만** 지원. 추가·수정·삭제는 **달력**에서 ([§7](#7-일정-수정삭제)) |

음성 인식 자체의 오류(마이크 권한·네트워크 등)는 예외적으로 토스트(`error`)로 안내한다. ([§10](#10-음성-입력))

---

## 4. 일정 조회

### 4-1. 결과 표시

- AI가 **채팅**으로 결과를 요약한다.
- 패널 **상단**에 결과 목록을 표시한다. 라벨: **「조회된 일정 N건」**
- 목록 항목 **클릭** → 일정 수정 Modal 오픈

### 4-2. 조회 상한·더보기

- 기본 **최대 20건** 표시.
- 결과가 20건을 초과하면 목록 하단에 **「더보기」** 버튼과 **「총 N건 중 M건 표시」** 안내.
- 더보기는 **같은 조건으로 +20건씩** 추가 조회한다.
  - **LLM을 재호출하지 않고** 동일 조건으로 DB·전개만 다시 수행한다 (토큰 미소모).

### 4-3. 반복 일정 전개

- 조회는 마스터 row가 아니라 **전개된 회차** 기준으로 한다.
- `event_recurrence_exceptions`의 **제외 회차는 결과에서 빠진다**.
- 분리된 개별 일정과 시리즈 회차가 **중복 표시되지 않도록** 한다.
- 달력에 보이는 회차와 AI 조회 결과가 **일치**해야 한다.

### 4-4. 날짜·기간 해석

상대·절대 날짜는 **`query_events.schedule_spec`** (권장) 또는 legacy `period`/`start_date`로 넘긴다.  
TS가 KST 기준으로 `start_date`/`end_date`·`resolved`를 계산한다. LLM이 상대 날짜를 임의 ISO로 추측하지 않게 한다.

| 표현 | schedule_spec (권장) |
|------|----------------------|
| 오늘 / 내일 / 모레 / 글피 | `date.kind=day`, `day_offset` 0 / 1 / 2 / 3 |
| 이번 주 / 다음 주 / 다다음 주 | `date.kind=week`, `week_offset` 0 / 1 / 2 (일~토) |
| 이번 주 수요일 / 다음 주 금요일 | `week_offset` + `weekday` |
| 이번 달 / 다음 달 / 올해 | `month_span` / `year` |
| 특정 날짜 ("6월 30일") | `date.kind=absolute`, `start_date` |
| **연도 생략** | **올해** |
| **월 생략** ("30일") | **이번 달** |

legacy `period`/`weekday`도 호환되나 `schedule_spec` 우선. 상세: [SCHEDULE_RESOLUTION.md](./SCHEDULE_RESOLUTION.md).

### 4-5. 시간대 필터

[§5](#5-시간대-필터)를 따른다.

### 4-6. 조합

- **기간 + 시간대**는 **AND** ("이번 주 저녁" → `schedule_spec.date` + `time_period=evening`).
- **주말 / 평일** = `day_type` weekend / weekday.
- **특정 요일** = `schedule_spec.date.weekday` + `week_offset` (기본 0 = 이번 주).
- 키워드(제목·설명)와도 AND로 조합한다.

### 4-7. KST 캘린더 컨텍스트 (시스템 프롬프트)

Edge Function이 **오늘·내일·이번 주(일~토) 날짜·요일**을 코드로 계산해 LLM 시스템 프롬프트에 포함한다.  
LLM은 이 블록과 `query_events` 결과의 **`resolved`** 만으로 날짜·요일을 답하고, **요일을 재계산하거나 추측 참고("혹시 ~ 수요일?")를 붙이지 않는다.**

### 4-8. Schedule Resolution (V1 / V2 / V2.2)

[SCHEDULE_RESOLUTION.md](./SCHEDULE_RESOLUTION.md)를 따른다.

| 단계 | 조회 | 추가·수정 |
|------|------|-----------|
| LLM | `schedule_spec.date` (+ `time_period` 필터) | **metadata:** `title` 등만 / **reschedule:** `schedule_spec`+`time` |
| TS | `resolveSchedule` (range) | V2.2: `sanitizeUpdateArgs` → [reschedule만] instant |
| 보강 | 메시지 → `schedule_spec` (**query만**) | update: 이동 의도 있을 때만 time 보강 |
| 결과 | `result.resolved` | `result.resolved` (reschedule 시) |
| 후속 | `sessionContext.lastQuery` (id·**start_at**) | 동일 |

- **V2.2:** 「이번 주 ○○」는 **대상 한정** — 제목·설명만 변경 시 `schedule_spec` 금지.
- 더보기: canonical `start_date`/`end_date`만 저장.
- 반복 **해당 회차:** `original_start_at` = 조회 회차 `start_at`.

---

## 5. 시간대 필터

### 5-1. 단어별 구간 (KST)

| 단어 | 구간 |
|------|------|
| 새벽 | 01:00 ~ 05:59 |
| 아침 | 06:00 ~ 09:59 |
| 오전 | 00:00 ~ 11:59 |
| 낮 | 06:00 ~ 17:59 |
| 오후 | 12:00 ~ 23:59 |
| 저녁 | 18:00 ~ 20:59 |
| 밤 | 21:00 ~ 23:59 (당일, 자정 넘기지 않음) |

> 경계 기본값: **12:00 정각 = 오후**, **00:00~00:59 = 오전**(새벽 아님).  
> 「저녁·밤」을 단독으로 쓰면 위 표 기준이라 통념보다 넓게 잡힐 수 있다.

### 5-2. 단어 우선순위 (겹칠 때 1개만)

한 일정이 여러 단어에 걸칠 수 있으므로(예: 08:00 = 아침·오전·낮), 사용자가 **말한 단어의 표 구간만** 사용한다.  
한 문장에서 **여러 단어가 동시에 매칭되면 더 좁은 단어**를 우선한다.

**우선순위(좁은 → 넓은):** `새벽` → `아침` → `저녁` → `밤` → `낮` → `오전` / `오후`

### 5-3. 매칭 기준

- 시간 일정은 **시작 시각**이 해당 구간 안에 있으면 포함한다.
  - 예: 11:00~14:00 일정 → "오후"(12:00~) 에는 **미포함** (시작이 11시).
- **종일 일정**은 시간대 필터가 있어도 **항상 포함**한다.

### 5-4. 복수 시간대

- 한 문장에 시간대 단어가 둘 이상이면 **OR** 로 합친다.
  - 예: "아침이랑 저녁 일정" → 아침 구간 시작 ∪ 저녁 구간 시작.
- OR 결과에 종일 일정이 섞여도 목록에는 **한 번만** 표시한다.

### 5-5. 시각 vs 단어 충돌

- 구체적인 **시·분이 있으면 시각을 우선**하고 시간대 단어는 무시한다.
  - "새벽 9시" → **09:00**으로 해석 (새벽 구간 01~05 무시).
  - "새벽 7시" → **07:00**으로 해석.
- 시각도 없고 표현이 애매하면 **되묻기**([§8](#8-되묻기-confirmation)).

> 구현 권장: LLM은 `time_period`(enum) 또는 `start_hour`(시각) 중 하나로 넘기고,
> **시각이 있으면 서버가 `time_period`를 무시**한다.

---

## 6. 일정 추가

- AI가 **채팅**으로 추가 결과를 안내한다. **`result.resolved`** 의 날짜·시각만 인용.
- 패널 **상단** 라벨: **「추가된 일정 N건」**. 항목 **클릭** → 수정 Modal.
- `schedule_spec` 권장 (예: 「내일 저녁」→ `date.day_offset=1`, `time.period=evening`).
- **되묻기 없음.** 정보가 부족하면 모호한 요청으로 [§8](#8-되묻기-confirmation).

---

## 7. 일정 수정·삭제

### 7-0. 반복 일정 (AI mutation 보류)

반복 일정의 **추가·수정·삭제**는 현재 AI에서 **지원하지 않는다** (대규모 리워크 예정).  
사용자가 요청하면 채팅으로 **달력에서 변경해 달라**고 안내하며, DB mutation은 실행하지 않는다.

- **조회:** 반복 회차 전개·제외 반영 — 계속 지원 ([§4-3](#4-3-반복-일정-전개)).
- **차단:** `create_event`에 `recurrence_freq`, 반복 마스터에 대한 `update_event` / `delete_event`, `propose_action`의 동일 요청.
- 구현: `recurringPolicy.ts` — `RECURRING_MUTATION_BLOCKED_MESSAGE`.

달력의 반복 범위 선택·삭제는 [RECURRING_EVENTS.md](./RECURRING_EVENTS.md), [CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md)를 따른다.

### 7-1. 수정 (비반복)

| 대상 | 범위 선택 |
|------|-----------|
| 개별(비반복·분리된 단일) 일정 | 없음 (바로 수정) |

- 상단 라벨: **「수정된 일정 N건」**. 항목 클릭 → 수정 Modal.
- 일정 **이동:** 이동 의도 있을 때만 `schedule_spec` + `time` ([SCHEDULE_RESOLUTION.md](./SCHEDULE_RESOLUTION.md) V2.2).

### 7-2. 삭제 (비반복)

| 대상 | 버튼 |
|------|------|
| 개별 일정 | **취소 / 삭제** |

- 상단 라벨: **「삭제된 일정 N건」**.
- 삭제된 일정은 **클릭 불가**: 삭제 직전 **스냅샷(제목·시간)** 을 **비활성 텍스트**로만 표시한다.
- 삭제는 항상 위 버튼 확인을 거친다([§8](#8-되묻기-confirmation)).

자세한 버튼·문구는 [CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md), [EVENT_DELETE.md](./EVENT_DELETE.md), [EVENT_UPDATE.md](./EVENT_UPDATE.md).

---

## 8. 되묻기 (Confirmation) — V3 UX 3종

### 8-1. 대상 식별 분기 (서버 `identifyEvents`)

| 후보 수 | UX | 버튼 |
|---------|-----|------|
| **0건** | 채팅: 제목·날짜를 더 구체적으로 요청 | 없음 |
| **1건** | 비모호 시 바로 mutation; 해석 모호 시 propose | 아래 8-3 |
| **2~5건** | **pick-target** 일정 목록 → 사용자 선택 | 목록 클릭 |
| **6건+** | 채팅: 후보가 너무 많으니 좁혀 달라 | 없음 |

LLM은 채팅으로 추가 질문하지 않고 **도구 호출** → 서버가 위 분기를 강제한다.

### 8-2. pick-target 후속 (다건 + 해석)

1. 사용자가 목록에서 일정 **1건 선택**
2. **삭제** → 삭제 Confirm (`취소`/`삭제`)
3. **수정·날짜 이동 등 해석 필요** → **맞다/아니다** (V2.4 서버 문장)
4. **명확한 수정** → 즉시 실행 + 상단 결과

### 8-3. 해석 확인 (맞다/아니다) — V2.4

1. LLM `propose_action` 또는 pick 후 해석 gate
2. 서버가 enrich → resolve → **확인 문장 생성**
3. **맞다** → frozen pending 실행 / **아니다** → 입력창 포커스

### 8-4. 삭제 Confirm

- `delete_event` (및 pick 후 삭제) → **취소 / 삭제** Dialog

### 8-5. 토큰 절약

- 맞다·pick-target·삭제 Confirm 모두 **LLM 재호출 없음**
- pending은 **한 번에 1개**

---

## 9. UI 상단 결과 목록 요약

| 액션 | 라벨 | 항목 클릭 |
|------|------|-----------|
| 조회 | 조회된 일정 N건 | 수정 Modal |
| 추가 | 추가된 일정 N건 | 수정 Modal |
| 수정 | 수정된 일정 N건 | 수정 Modal |
| 삭제 | 삭제된 일정 N건 | **불가** (비활성 스냅샷) |

- 조회 결과는 20건/더보기 규칙([§4-2](#4-2-조회-상한더보기))을 따른다.
- 「초기화」 버튼으로 대화·상단 목록을 모두 비운다.

---

## 10. 음성 입력

- `ko-KR`, 단발 인식(`continuous=false`), 중간 결과 표시(`interimResults=true`).
- 인식 종료: 발화가 끊기면 브라우저가 자동 종료하거나, 사용자가 마이크 버튼으로 중지.
- **인식 결과는 즉시 전송하지 않고 입력창에 채운다.** 사용자가 **확인·수정 후 전송**한다.
- 마이크 권한·네트워크 등 음성 오류는 토스트(`error`, title만).

---

## 11. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/components/ai/AIAssistantPanel.tsx` | 패널·상단 목록·라벨·더보기·확인 버튼 |
| `frontend/src/hooks/useAIChat.ts` | Edge Function 호출·pending action·상태 |
| `frontend/src/components/ai/VoiceButton.tsx` | 음성 입력 |
| `frontend/src/hooks/useSpeechRecognition.ts` | Web Speech API |
| `supabase/functions/ai-assistant/index.ts` | 요청 처리·도구 루프·confirm/paginate 모드 |
| `supabase/functions/ai-assistant/tools.ts` | 도구 정의·실행·시스템 프롬프트 |
| `supabase/functions/ai-assistant/scheduleSpec.ts` | Schedule/DateSpec 타입 |
| `supabase/functions/ai-assistant/resolveSchedule.ts` | 날짜 해석 엔진 |
| `supabase/functions/ai-assistant/dateRanges.ts` | KST 날짜 유틸·legacy period |
| `supabase/functions/ai-assistant/recurrence.ts` | 조회 시 반복 회차 전개·제외 |
| `supabase/functions/ai-assistant/recurrenceActions.ts` | 반복 범위 처리 (달력·confirm 레거시; AI mutation 차단 시 미사용) |
| `supabase/functions/ai-assistant/enrichToolArgs.ts` | 도구 인자 enrich |
| `supabase/functions/ai-assistant/confirmProposal.ts` | propose 확정·서버 확인 문장 |
| `supabase/functions/ai-assistant/identifyEvents.ts` | mutation 대상 식별 (V3) |
| `supabase/functions/ai-assistant/mutationGate.ts` | identify gate · pick 후속 |

---

## 12. 구현 단계와 상태

> 작업 순서: **쉬운 것 → 까다로운 것**. 1차 → 2차 → 3차.

### 1차 — 조회·UI·기반

| 항목 | 상태 |
|------|------|
| 타임존 KST 고정 | ✅ 구현 |
| 반복 일정 **조회 전개** + 제외 반영 | ✅ 구현 |
| 상단 라벨 4종(조회/추가/수정/삭제) + 삭제 비클릭(스냅샷) | ✅ 구현 |
| 조회 상한 20 / 더보기 +20 (LLM 미호출) | ✅ 구현 |
| 시간대 필터 (표·우선순위·시작시각·OR·AND·주말/평일) | ✅ 구현 |
| 요일 필터 (`query_events.weekday`) + KST 캘린더 프롬프트 | ✅ 구현 |
| 날짜 기본값 (연도=올해, 월=이번 달) | ✅ 구현 |
| 음성 인식 결과 확인 후 전송 | ✅ 구현 |

### 2차 — 확인 UX

| 항목 | 상태 |
|------|------|
| 삭제 Confirm 개편 (개별 2버튼 / 반복 3버튼 / 마지막 1회차 2버튼) — **달력** | ✅ 구현 |
| AI 삭제·모호 요청 되묻기 (맞다/아니다, 아니오 시 입력) | ✅ 구현 |
| 맞다 시 LLM 미호출 구조화 실행(pending action) | ✅ 구현 |
| **V2.4** propose 시 서버 확인 문장 + frozen payload | ✅ 구현 · QA ⏳ |
| **V3** identifyEvents + pick-target + pick 후 interpret gate | ✅ 구현 · QA ⏳ |

### 3차 — 반복 CRUD 정합

| 항목 | 상태 |
|------|------|
| 달력 반복 수정·삭제 범위 (취소/해당/전체) | ✅ 구현 |
| 달력과 동일한 분리·제외·전체 처리 (`recurrenceActions.ts`) | ✅ 구현 |
| 달력 반복 수정 Dialog → 공용 `ConfirmDialog` 3버튼 | ✅ 구현 |
| AI 반복 **추가·수정·삭제** | ⏸ **보류** — `recurringPolicy.ts`로 차단, 달력 안내 ([§7-0](#7-0-반복-일정-ai-mutation-보류)) |

### 배포·검증

| 항목 | 상태 |
|------|------|
| Edge Function (`ai-assistant`) 배포 | ✅ 완료 |
| 수동 QA | ⏳ [TESTING.md](./TESTING.md) §7 실행 대기 |
