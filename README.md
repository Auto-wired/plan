# 일정 관리 AI 앱

React + FullCalendar + Supabase + AI(Gemini/OpenAI/Ollama) + 음성 입력을 활용한 다중 사용자 일정 관리 앱입니다.

## 기능

- **달력**: FullCalendar 기반 월/주/일/목록 뷰, 드래그 생성·이동·크기 조절
- **AI 일정 관리**: 자연어로 일정 추가/수정/삭제
- **AI 일정 조회**: "이번 주 일정 보여줘" 등 자연어 조회
- **음성 입력**: Web Speech API로 AI 기능 음성 사용 (Chrome/Edge)

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React, TypeScript, Vite, FullCalendar, TanStack Query |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions) |
| AI | Gemini (기본), OpenAI, Ollama (환경 변수로 전환) |
| Voice | Web Speech API (STT) |

## 프로젝트 구조

```
plan/
├── frontend/          # React 앱
├── supabase/
│   ├── migrations/    # DB 스키마
│   └── functions/
│       └── ai-assistant/  # AI Edge Function
└── README.md
```

## 시작하기

### 1. Supabase 프로젝트 생성

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 `supabase/migrations/001_create_events.sql` 실행
3. Project Settings → API에서 URL과 anon key 확인

### 2. 환경 변수 설정

**Frontend** (`frontend/.env`):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Edge Function** (Supabase Dashboard → Edge Functions → Secrets):

```env
GEMINI_API_KEY=your-gemini-api-key
AI_PROVIDER=gemini
# 선택: OPENAI_API_KEY, OLLAMA_BASE_URL
```

### 3. Edge Function 배포

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase functions deploy ai-assistant
```

### 4. Frontend 실행

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 http://localhost:5173 접속

## 로컬 Supabase 개발 (선택)

```bash
npx supabase start
npx supabase db reset
npx supabase functions serve ai-assistant --env-file supabase/.env.local
```

로컬 anon key와 URL은 `npx supabase status`로 확인합니다.

## AI 프로바이더 전환

Edge Function secrets에서 `AI_PROVIDER` 변경:

| Provider | AI_PROVIDER | 필요한 Secret |
|----------|-------------|---------------|
| Gemini (기본) | `gemini` | `GEMINI_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Ollama | `ollama` | `OLLAMA_BASE_URL` |

Ollama는 Supabase Cloud Edge Function에서 localhost 접근이 불가하므로, 공개 URL(ngrok, VPS 등)이 필요합니다.

## 음성 입력

- **지원**: Chrome, Edge (Web Speech API)
- **미지원**: Safari, Firefox → 텍스트 입력 사용
- 마이크 버튼 클릭 → 말하기 → 자동으로 AI에 전송

## 사용 예시

```
"내일 오후 3시에 치과 예약 추가해줘"
"이번 주 일정 보여줘"
"팀 미팅 일정을 오후 4시로 변경해줘"
"다음 주 월요일 회의 삭제해줘"
```

## 라이선스

MIT
