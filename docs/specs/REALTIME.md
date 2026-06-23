# Realtime 동기화 명세

> 달력: [CALENDAR.md](./CALENDAR.md)  
> 인덱스: [README.md](./README.md)

---

## 1. 역할

Supabase Realtime으로 `events`·`event_recurrence_exceptions` 변경을 구독하고, 다른 탭·기기·AI CRUD 후에도 달력 쿼리를 **자동 갱신**한다.

---

## 2. 동작

- 로그인 후 `useEventsRealtime` 활성화
- `events` / `event_recurrence_exceptions` 테이블 `*` 이벤트 수신 시 `['events']` 쿼리 invalidate

---

## 3. 구현 상태

| 항목 | 상태 |
|------|------|
| Realtime 구독 | ✅ 구현 |

---

## 4. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/hooks/useEventsRealtime.ts` | 구독·invalidate |
| `supabase/migrations/005_add_event_recurrence.sql` | exceptions Realtime publication |
