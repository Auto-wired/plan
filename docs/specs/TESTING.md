# 테스트 명세

> 인덱스: [README.md](./README.md)

---

## 1. 도구

- **Vitest** (`frontend/vitest.config.ts`)
- 환경: `node` (DOM 없음)
- 실행: `npm test` / `npm run watch`

---

## 2. 권장 작업 순서

1. **명세 보완** (`docs/specs/`)
2. **단위 테스트 보강** (`frontend/src/lib/*.test.ts`)
3. **명세 대비 미구현 기능** 구현 + 해당 테스트 추가
4. **수동 QA** ([§7](#7-수동-qa-체크리스트)) — 큰 변경·배포 후
5. **보류** 항목 해제 후 동일 순서 반복

---

## 3. 자동 테스트 대상 (우선순위)

| 우선순위 | 대상 | 상태 |
|----------|------|------|
| 1 | `authValidation.ts` | ✅ `authValidation.test.ts` |
| 1 | `eventValidation.ts` | ✅ `eventValidation.test.ts` |
| 2 | `recurrence.ts` 전개·제외 | ✅ `recurrence.test.ts` |
| 2 | `recurrenceActions.ts` 남은 회차 수·§5-7 | ⏳ 미작성 (핵심 로직은 `recurrence.ts`에서 테스트) |
| 2 | `eventMapper.ts` `recurrenceRuleChanged` | ✅ `eventMapper.test.ts` |
| 2 | `datetime.ts` | ✅ `datetime.test.ts` |
| 3 | React 컴포넌트·FullCalendar·Supabase | ⏳ 미작성 (jsdom/E2E 별도) |

---

## 4. 현재 테스트 파일

| 파일 | 테스트 수 (대략) |
|------|------------------|
| `frontend/src/lib/authValidation.test.ts` | 16 |
| `frontend/src/lib/eventValidation.test.ts` | 6 |
| `frontend/src/lib/recurrence.test.ts` | 6 |
| `frontend/src/lib/eventMapper.test.ts` | 7 |
| `frontend/src/lib/datetime.test.ts` | 15 |

**합계:** 50 (Vitest `npm test` 기준)

---

## 5. 실행 방법

| 명령 | 용도 |
|------|------|
| `cd frontend && npm test` | 전체 단위 테스트 1회 실행 |
| `cd frontend && npm run test:watch` | 파일 저장 시 자동 재실행 |

**CI:** GitHub Actions `.github/workflows/ci.yml` — `push`/`pull_request` 시 `npm test` + `npm run build`  
(Supabase env는 CI용 더미 값 사용)

---

## 6. 보류

- E2E (Playwright 등) — 별도 도입 시 명세 추가

---

## 7. 수동 QA 체크리스트

자동 테스트로 커버되지 않는 UI·API·Edge Function 연동 확인용.  
Edge Function 배포 후 또는 큰 변경 후 실행한다. 체크 시 `[x]`로 표시.

### 인증

- [X] 회원가입: 검증 실패 시 토스트만 (인라인 에러 없음)
- [X] 회원가입 성공 → 인증 안내 토스트 → 로그인 화면 전환
- [X] 로그인 실패/성공 토스트
- [X] 로그아웃 성공 시 로그인 화면 (실패 시 `로그아웃 실패` 토스트 — 네트워크 차단 등으로 재현)

### 일정 CRUD (달력)

- [X] 일정 추가: 검증 실패 토스트, 성공 토스트, Modal 닫힘
- [X] 일정 수정: 동일
- [X] **개별 일정 삭제:** 삭제 → Confirm Dialog(`취소`/`삭제`) → 성공 토스트 (`window.confirm` 아님)

### 반복 일정 삭제 (달력)

- [X] **2회차 이상 남음:** 삭제 → **단일** Confirm Dialog(`취소`/`해당 일정만`/`전체 일정`) → 삭제
- [X] **해당 일정만:** 해당 회차만 달력에서 사라짐 (제외 등록)
- [X] **전체 일정:** 시리즈 전체 삭제
- [X] **유한 반복 마지막 1회차:** Confirm(`취소`/`전체 삭제`) → 마스터 삭제 (`해당 일정만` 버튼 없음)

### 반복 일정 수정 (달력)

- [X] 인스턴스 수정 → Confirm Dialog(`취소`/`해당 일정만`/`전체 일정`) → 저장 토스트
- [X] 반복 규칙 변경 시 범위 Dialog 없이 전체 수정
- [X] DnD/리사이즈(반복) → 드래그 회차 DnD 종료 위치 유지 → 범위 선택 시 **revert 없이** 그 위치 유지 → 나머지 refetch 후 이동 → 취소/실패 시만 `revert`

### 달력 DnD

- [X] 일반 일정 드래그·리사이즈 즉시 저장
- [X] 저장 실패 시 위치 revert + `일정 수정 실패` 토스트

### 달력 리사이즈 (시작·끝 양쪽)

- [X] **월간** 종일·여러 날: 가로 **좌·우** (span 조절)
- [X] **일간** 시간 일정: 세로 **상·하**
- [X] **주간** 종일: 가로 **좌·우** / 시간: 세로 **상·하** (다른 요일은 DnD)
- [X] **반복** 인스턴스 리사이즈 → preview·범위 Dialog·취소/실패 `revert` (DnD와 동일)

### 프로필

- [X] 닉네임 검증/API 실패 → `프로필 저장 실패` 토스트 (Modal 인라인 에러 없음)
- [X] 아바타·테마 변경 즉시 UI 반영

### AI — 조회 (1차)

- [X] 「오늘 일정」「이번 주 일정」 등 자연어 조회 → 채팅 요약 + 상단 **「조회된 일정 N건」**
- [X] 반복 일정이 **회차 단위**로 표시되고, 제외한 회차는 결과에 없음 (달력과 일치)
- [X] 20건 초과 시 **「더보기」** → +20건 추가 (LLM 재호출 없이)
- [X] 시간대 필터: 「이번 주 저녁 일정」 등
- [X] 특정 날짜: 「30일 일정」(이번 달), 「6월 30일」 등
- [X] 「수요일 일정」「이번 주 수요일」→ `schedule_spec` week_offset 0 + wed, `resolved` 요일·날짜 답변 일치
- [X] 「다다음 주 수요일」→ `schedule_spec` week_offset 2 + wed, `resolved`에 7/8(수) 표시
- [X] 후속 「그 일정 삭제」→ `sessionContext.lastQuery` id 사용 또는 되묻기
- [X] 조회 항목 클릭 → 수정 Modal

### AI — 추가·수정 (1·3차)

- [X] 일정 추가 후 상단 **「추가된 일정 N건」**, 클릭 시 Modal
- [X] 개별 일정 수정 → **「수정된 일정 N건」** (되묻기 없음)
- [ ] 반복 일정 수정 → Confirm(`취소`/`해당 일정만`/`전체 일정`) → 달력 결과와 동일

### AI — 삭제 (2·3차)

- [ ] 개별 삭제 → Confirm(`취소`/`삭제`) → **「삭제된 일정 N건」** (비활성·취소선, 클릭 불가)
- [ ] 반복 삭제 → Confirm(`취소`/`해당 일정만`/`전체 일정` 또는 마지막 1회차 `전체 삭제`)
- [ ] 삭제 결과가 달력과 동일하게 반영

### AI — 되묻기 (2차)

- [ ] 모호한 요청 → AI가 해석 제안 + **「맞다」/「아니다」** 버튼
- [ ] **맞다** → LLM 재호출 없이 실행 (네트워크 탭에서 `mode: confirm` 확인 가능)
- [ ] **아니다** → 입력창 포커스, 사용자가 보충 입력

### AI — 음성 (1차)

- [ ] 음성 인식 결과가 **입력창에 채워짐** (즉시 전송 아님) → 확인 후 전송
- [ ] 마이크 권한·네트워크 오류 → 토스트(`error`)
