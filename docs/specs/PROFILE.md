# 프로필·개인 설정 명세

> 공통 UI: [TOAST.md](./TOAST.md)  
> 인덱스: [README.md](./README.md)

---

## 1. 진입

우측 상단 **프로필** 클릭 → **개인 설정 Modal** (`UserSettingsModal`)

---

## 2. 프로필 사진

- 아바타 클릭 → 이미지 파일 선택 (jpeg, png, webp, gif)
- Supabase Storage `avatars` 버킷에 업로드
- 저장 즉시 반영:
  - 헤더 프로필 영역
  - AI 어시스턴트 채팅 **사용자 아바타** ([AI_ASSISTANT.md](./AI_ASSISTANT.md))

---

## 3. 닉네임

- 2~20자 (`maxLength={20}`)
- **저장** 버튼으로 변경
- 검증: 회원가입과 동일 (`isValidNickname`)

---

## 4. 다크 모드

- 라이트 / 다크 토글
- `document.documentElement.dataset.theme` 및 `theme-color` meta 즉시 반영

---

## 5. 실시간 적용

프로필 사진·닉네임·테마는 **저장 즉시 UI에 반영**된다.

---

## 6. 피드백

| 상황 | 방식 |
|------|------|
| 검증 실패 (닉네임) | 토스트 `error`, title 예: `프로필 저장 실패`, description: `{사유}` |
| API 실패 (사진·닉네임·테마) | 동일 |
| 성공 | 별도 토스트 없음 (UI 갱신으로 충분) |

일정·인증과 동일하게 **실패만 토스트** ([TOAST.md](./TOAST.md)). Modal 인라인 에러는 사용하지 않는다.

---

## 7. 구현 상태

| 항목 | 상태 |
|------|------|
| 기능 (사진·닉네임·테마) | ✅ 구현 |
| 실패 시 토스트 | ✅ 구현 |

---

## 8. 구현 참고

| 파일 | 역할 |
|------|------|
| `frontend/src/components/settings/UserSettingsModal.tsx` | 설정 UI |
| `frontend/src/lib/profileToast.ts` | 프로필 실패 토스트 문구 |
| `frontend/src/contexts/ProfileContext.tsx` | 테마 적용 |
| `frontend/src/hooks/useProfile.ts` | 프로필 CRUD·아바타 업로드 |
