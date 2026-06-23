# 시간·타임존 명세

> 인덱스: [README.md](./README.md)

---

## 1. KST 벽시계

앱의 모든 일정 시각은 **KST(한국 표준시) 벽시계**를 기준으로 한다.

- **DB 저장:** 사용자가 입력한 시·분이 ISO 문자열에 그대로 반영 (`…T09:00:00.000Z` 형태, 타임존 변환 없음)
- **UI 표시:** DB 값에서 날짜·시간 필드를 추출해 그대로 표시
- **타임존 설정 UI:** 없음

FullCalendar는 `timeZone="UTC"`로 두고, DB 벽시계 값을 UTC 필드에 매핑해 사용한다.

---

## 2. 종일 일정

- 저장: 시작·종료 모두 해당 날짜 `00:00:00`
- FullCalendar exclusive end ↔ inclusive end 변환은 `datetime.ts`에서 처리

---

## 3. AI 요청

Edge Function 호출 시 `getBrowserTimezone()`을 body에 포함한다. (AI 도구의 날짜 해석용)

---

## 4. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/lib/datetime.ts` | 파싱·저장·표시·달력 변환 |
| `supabase/migrations/006_migrate_events_to_real_utc.sql` | 레거시 1회 (재실행 금지) |
| `supabase/migrations/007_simplify_event_recurrence_exceptions.sql` | 제외 테이블 단순화 |

운영 DB에 `006`·`007` **수동 적용 완료**를 전제한다. 앱 런타임은 [§1](#1-kst-벽시계) 벽시계 무변환 전략을 따른다.
