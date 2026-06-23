# 달력 기능 명세

> 일정 CRUD: [EVENT_CREATE.md](./EVENT_CREATE.md) · [EVENT_UPDATE.md](./EVENT_UPDATE.md)  
> Realtime: [REALTIME.md](./REALTIME.md)  
> 인덱스: [README.md](./README.md)

---

## 1. 일정 표시

등록된 일정은 **카테고리**, **종일 여부**, **반복 여부**에 따라 달력에 표시된다.

---

## 2. 카테고리별 배경색

모든 일정의 배경색은 카테고리로 결정한다. ([EVENT_CREATE.md](./EVENT_CREATE.md) §6)

---

## 3. 카테고리 필터

상단 **카테고리 필터**로 선택한 카테고리 일정만 표시한다.

- 전체 카테고리 선택 시 모든 일정 표시
- 개별 카테고리 토글로 필터링

---

## 4. 종일·시간 표시

| 종일 여부 | 달력 표시 |
|-----------|-----------|
| 활성화(종일) | **제목만** |
| 비활성화 | **시작 시간 + 제목** |

---

## 5. 반복 일정 아이콘

반복 일정 **회차**에 반복 아이콘을 표시한다. 일정 내용 **가장 좌측**에 배치한다.

---

## 6. 뷰 전환

- 월 / 주 / 일 / 목록 뷰 지원 (FullCalendar)

---

## 7. 드래그·리사이즈

### 7-1. 드래그 (Drag & Drop)

달력에서 일정 블록을 잡고 **다른 날짜·시간으로 끌어다 놓기**.

- 일반 일정: 즉시 `updateEvent` 저장
- 반복 인스턴스: **드롭 위치를 유지**한 채 범위 Dialog 표시 ([RECURRING_EVENTS.md](./RECURRING_EVENTS.md))
  - controlled `events` prop 때문에 `dragPreviewOverride`로 **드래그한 회차만** 드롭 좌표 유지 (다른 회차는 refetch까지 옛 위치)
  - **범위 선택 후에도** 드래그한 회차 preview 유지 → refetch로 나머지 회차 이동 → 서버 반영 완료 시 preview state만 정리
  - **취소**(Dialog `취소`/오버레이) 또는 **저장 실패** 시에만 `revert` + preview 해제 — 범위 **선택** 시에는 `revert` 없음 ([CONFIRM_DIALOG.md](./CONFIRM_DIALOG.md))

### 7-2. 리사이즈 (Resize)

FullCalendar `eventResizableFromStart` — **시작·끝 양쪽** 가장자리에서 리사이즈.

| 뷰 | 종일 | 시간 일정 |
|----|------|-----------|
| **월간** | 가로 **좌·우** (여러 날 span) | 체감 거의 없음 |
| **일간** | (해당 시) 가로 | 세로 **상·하** |
| **주간** | 상단 종일 줄: 가로 **좌·우** | 그리드: 세로 **상·하** (다른 요일로는 **DnD**) |

- 일반 일정: 즉시 저장
- 반복 인스턴스: DnD와 동일 — **리사이즈한 회차만** preview 유지, 나머지는 refetch 반영 → 취소/실패 시 `revert`

### 7-3. 저장 실패

API 실패 시:

1. 달력상 위치 **되돌림** (`revert`)
2. 토스트 `error`, title: `일정 수정 실패`, description: `{실패 사유}`

> 반복 인스턴스에서 Dialog **취소**만 DnD/리사이즈 `revert` 대상이다. **해당/전체 선택**은 저장만 수행한다.

---

## 8. 로딩

일정 조회 중 달력 영역에 **「일정 불러오는 중...」** 표시.

---

## 9. 구현 상태

| 항목 | 상태 |
|------|------|
| 표시·필터·뷰·DnD | ✅ 구현 |
| 리사이즈 (시작·끝 양쪽, `eventResizableFromStart`) | ✅ 구현 |
| DnD 실패 토스트 | ✅ 구현 |

---

## 10. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/components/calendar/EventCalendar.tsx` | FullCalendar, 필터, DnD |
| `frontend/src/components/calendar/CalendarEventContent.tsx` | 제목·시간·반복 아이콘 |
| `frontend/src/components/calendar/CategoryFilterBar.tsx` | 카테고리 필터 |
| `frontend/src/lib/categories.ts` | 카테고리·색상 |
