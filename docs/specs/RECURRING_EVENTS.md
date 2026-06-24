# 반복 일정 명세

> 수정: [EVENT_UPDATE.md](./EVENT_UPDATE.md) · 삭제: [EVENT_DELETE.md](./EVENT_DELETE.md)  
> 인덱스: [README.md](./README.md)

---

## 1. 데이터 모델

| 구성 요소 | 설명 |
|-----------|------|
| 마스터 이벤트 (`events`) | 반복 규칙을 가진 원본 1건 |
| 가상 회차 | 조회 기간 내 `recurrence.ts`로 전개되어 달력에 표시 |
| 제외 목록 (`event_recurrence_exceptions`) | 시리즈에서 숨길 회차의 키 (`event_id` + `original_start_at`) |
| 분리된 개별 일정 (`events`) | "이 일정만 수정" 시 생성되는 `recurrence_freq = null` row |

### `event_recurrence_exceptions` 스키마

| 컬럼 | 설명 |
|------|------|
| `id` | PK |
| `event_id` | 마스터 FK |
| `original_start_at` | 제외할 회차의 기준 시작 시각 (매칭 키) |

행이 존재하면 해당 회차는 전개에서 **제외**된다. `type`·`override_*` 컬럼은 사용하지 않는다.

가상 인스턴스 ID: `{masterId}_{originalStartAt}`

---

## 2. 수정 정책

| 동작 | 처리 |
|------|------|
| **이 일정만 수정** | 제외 row upsert + 독립 `events` insert (항상 분리) |
| **분리된 일정 수정** | 일반 일정과 동일 |
| **전체 수정 (시간 이동)** | 마스터 update + 제외 목록의 `original_start_at` migrate |
| **전체 수정 (제목/카테고리만)** | 마스터 update만 |
| **전체 수정 (규칙 변경)** | 제외 목록 전 삭제 + 마스터 update in place |
| **분리된 일정** | 전체 수정·삭제 영향 없음 |

---

## 3. 삭제 정책

| 동작 | 처리 |
|------|------|
| **이 일정만 삭제** | 제외 row upsert |
| **전체 삭제** | 제외 목록 전 삭제 + 마스터 delete |
| **마지막 1회차 (유한 반복)** | [EVENT_DELETE.md](./EVENT_DELETE.md) §2-3 — Confirm 후 전체 삭제 |
| **분리된 일정** | 전체 삭제 대상 아님 |

---

## 4. 범위 선택 Dialog

반복 인스턴스에서 수정·삭제·드래그·리사이즈 시 범위 선택을 받는다. 버튼·문구는 [CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md).

| 동작 | 버튼 | scope |
|------|------|-------|
| 수정 | `취소` / `해당 일정만` / `전체 일정` | `this` / `all` |
| 삭제 (2회차 이상) | `취소` / `해당 일정만` / `전체 일정` | `this` / `all` |
| 삭제 (마지막 1회차·유한) | `취소` / `전체 삭제` | `all` |

**달력과 AI 어시스턴트가 동일한 정책·범위**를 사용한다 ([AI_ASSISTANT.md](./AI_ASSISTANT.md) §7).

---

## 5. AI 어시스턴트 정합성

- AI 조회는 마스터가 아니라 **전개된 회차** 기준이며 **제외 회차를 반영**한다 ([AI_ASSISTANT.md](./AI_ASSISTANT.md) §4-3).
- AI 수정·삭제는 위 §4 범위 선택을 채팅 UI로 제공하며 **달력과 동일하게** 분리·제외·전체 처리한다.

---

## 6. 감수하는 edge case (의도적 미구현)

- split 후 반복 규칙 변경 → 같은 날 split 일정 + 새 시리즈 회차 **중복 표시 가능**
- "이 일정만 삭제" 후 규칙 변경 → 삭제했던 회차가 새 패턴에 **재등장 가능**

---

## 7. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/lib/recurrence.ts` | 회차 전개·제외 적용 |
| `frontend/src/lib/recurrenceActions.ts` | 달력 CRUD, migrate, 남은 회차 수 |
| `frontend/src/components/common/ConfirmDialog.tsx` | 범위 선택 UI (3버튼) |
| `supabase/functions/ai-assistant/recurrence.ts` | AI 조회 회차 전개·제외 |
| `supabase/functions/ai-assistant/recurrenceActions.ts` | 반복 범위 처리 (달력·레거시; AI mutation V2.3 차단) |
| `supabase/functions/ai-assistant/recurringPolicy.ts` | AI 반복 mutation 차단 |
| `supabase/migrations/005_add_event_recurrence.sql` | 초기 스키마 |
| `supabase/migrations/007_simplify_event_recurrence_exceptions.sql` | 제외 테이블 단순화 |

---

## 8. 테스트

[TESTING.md](./TESTING.md) — 반복 전개·남은 회차 수는 `recurrence.test.ts`로 일부 커버.  
AI **조회** 전개는 Edge `recurrence.ts`로 검증. AI 반복 **추가·수정·삭제**는 V2.3에서 차단([TESTING.md](./TESTING.md) §7 반복 mutation 차단).

---

## 9. DB 마이그레이션

| 마이그레이션 | 내용 |
|--------------|------|
| `005` | 반복 스키마·exceptions 테이블 |
| `006` | 레거시 UTC 1회 변환 (재실행 금지) |
| `007` | exceptions → `id`, `event_id`, `original_start_at` 만 유지 |

운영 환경에 `006`·`007` 적용 완료 전제.
