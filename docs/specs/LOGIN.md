# 로그인 기능 명세

> 공통 UI: [TOAST.md](./TOAST.md)  
> 인덱스: [README.md](./README.md)

---

## 1. 입력 항목

| 필드 | 설명 |
|------|------|
| 이메일 | 가입 시 사용한 이메일 |
| 비밀번호 | 계정 비밀번호 |

---

## 2. 검증

### 2-1. 방식

- **브라우저 기본 검증 사용하지 않음** (`noValidate`, `required` 없음)
- **폼 하단 인라인 에러 없음**
- 모든 피드백은 **토스트**로만 표시

### 2-2. 클라이언트 선행 검증 (빈 값)

Supabase 호출 **전에** 이메일·비밀번호 입력 여부만 검사한다.

| 상황 | description |
|------|-------------|
| 둘 다 비어 있음 | `이메일과 비밀번호를 입력해주세요.` |
| 이메일만 비어 있음 | `이메일을 입력해주세요.` |
| 비밀번호만 비어 있음 | `비밀번호를 입력해주세요.` |

토스트 (error): title `로그인 실패`, description 위 문구.

### 2-3. API 검증

빈 값 검증 통과 후 `signInWithPassword` 호출. 실패 시 아래 매핑.

| Supabase / 상황 | description |
|-----------------|-------------|
| 잘못된 이메일 또는 비밀번호 | `이메일 또는 비밀번호가 올바르지 않습니다.` |
| 이메일 미인증 | `이메일 인증이 완료되지 않았습니다.` |
| 기타 | `로그인에 실패했습니다. 잠시 후 다시 시도해주세요.` |

---

## 3. 성공 / 실패

### 3-1. 실패

토스트 (error):

| title | description |
|-------|-------------|
| `로그인 실패` | `{실패 사유}` |

### 3-2. 성공

1. Supabase `signInWithPassword` 성공 → 세션 생성
2. 토스트 (success):

| title | description |
|-------|-------------|
| `로그인 성공` | — |

3. **일정 관리 페이지**로 이동 (`AuthGuard`, [LAYOUT.md](./LAYOUT.md))

---

## 4. UI / UX (부가)

| 항목 | 동작 |
|------|------|
| 제출 중 | 버튼 `처리 중...` 표시 + `disabled` (중복 제출 방지) |
| 로그인 ↔ 회원가입 전환 | 하단 토글 버튼, 전환 시 비밀번호 등 초기화 (이메일 유지) |
| 이메일 input | `inputMode="email"`, `autoComplete="email"` |

---

## 5. 로그아웃

- 헤더 **로그아웃** 클릭 → 세션 제거 → 로그인 화면
- 성공 시 별도 토스트 없음
- **실패 시** 토스트 `error`, title: `로그아웃 실패`, description: `{실패 사유}`

---

## 6. 보류

- 비밀번호 찾기 / 재설정

---

## 7. 구현 상태

| 항목 | 상태 |
|------|------|
| 로그인·로그아웃 기본 | ✅ 구현 |
| 로그아웃 실패 토스트 | ✅ 구현 |
| 비밀번호 찾기 | ⏸️ **보류** |

---

## 8. 테스트

- `frontend/src/lib/authValidation.test.ts` — `validateLoginForm`, `mapLoginError` 등

---

## 9. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/components/auth/LoginForm.tsx` | 로그인 UI·제출 |
| `frontend/src/lib/authValidation.ts` | 빈 값 검증, `mapLoginError` |
| `frontend/src/lib/authToast.ts` | 토스트 문구 상수 |
| `frontend/src/contexts/AuthContext.tsx` | `signIn` / `signOut` |
| `frontend/src/components/auth/AuthGuard.tsx` | 세션 기반 화면 분기 |
| `frontend/src/App.tsx` | 로그아웃 버튼 |
