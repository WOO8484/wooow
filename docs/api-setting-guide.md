# API 연결 준비 가이드

> **기준 버전: BPW v0.1.0 / Worker v0.1.0**

v0.0.9부터 **관리자 로그인(`ADMIN_PASSWORD`)**이 실제 Worker에서 검증됩니다.
네이버 검색, AI 글 생성, Blogger 임시저장/예약발행도 실제로 연결됩니다.
Secret을 등록하지 않은 기능은 자동으로 Mock으로 동작합니다.

모든 Secret 값은 **절대 프론트(index.html, assets/js/*.js)나 Git 저장소에 적지 않습니다.**
`wrangler secret put` 명령으로 Cloudflare에만 등록합니다.

---

## 1. 관리자 로그인 (v0.0.9 필수)

- `ADMIN_PASSWORD` — 앱 로그인 비밀번호. Worker `/auth/login`에서 이 값과 실제 비교합니다.
- `SESSION_SECRET` — 로그인 토큰 서명에 사용. 길고 랜덤한 문자열을 사용하세요.

> **v0.0.9 변경 사항**: 이전 버전의 Mock 로그인(프론트에서 비밀번호 비교)이 완전히 제거됐습니다.  
> `/auth/login`은 Worker에서 `ADMIN_PASSWORD` Secret과 실제로 비교하고 세션 토큰을 발급합니다.  
> 이후 모든 API 호출에 `Authorization: Bearer <token>` 헤더가 자동으로 포함됩니다.

```
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
```

---

## 2. 네이버 검색

네이버 개발자센터(https://developers.naver.com)에서 애플리케이션을 등록하면 발급받습니다.

- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

블로그 검색(blog) + 웹문서 검색(webkr)을 동시에 호출해 최대 20건(블로그 10건 + 웹문서 10건)을 반환합니다.
AI 글 생성에는 이 중 블로그 4건 + 웹문서 4건(최대 8건)만 선별해서 전달합니다.

```
wrangler secret put NAVER_CLIENT_ID
wrangler secret put NAVER_CLIENT_SECRET
```

---

## 3. AI 글 생성 (Gemini)

Google AI Studio(https://aistudio.google.com)에서 API 키를 발급받습니다.

- `AI_API_KEY` — Gemini API 키
- `AI_PROVIDER` (선택) — `gemini` (기본값, 현재 코드는 Gemini만 지원)
- `AI_MODEL` (선택) — `gemini-2.5-flash` (기본값)

**v0.0.9 최적화**:
- `maxOutputTokens`: 3,200 (쿼터 절약)
- `temperature`: 0.68
- AI 응답이 JSON이 아니어도 rawText를 HTML로 자동 변환

**오류 메시지 (v0.0.9)**:

| 상태 코드 | 메시지 |
|-----------|--------|
| 400 | AI 요청 형식 또는 모델 설정에 문제가 있습니다. |
| 401 | AI API 키 인증에 실패했습니다. |
| 403 | AI API 키 권한 또는 프로젝트 제한 문제가 있습니다. |
| 404 | AI 모델명을 확인해야 합니다. |
| **429** | **Gemini 무료 사용량 또는 쿼터를 초과했습니다. 잠시 후 다시 시도하세요.** |
| 500+ | Gemini 서버 또는 일시적인 AI 처리 오류입니다. |

```
wrangler secret put AI_API_KEY
wrangler secret put AI_PROVIDER
wrangler secret put AI_MODEL
```

### 생성 요청 필드

```json
{
  "keyword": "검색 키워드",
  "mode": "normal",
  "persona": "neutral",
  "tone": "friendly",
  "emoji": "few",
  "sources": [],
  "blog": [],
  "web": []
}
```

### 생성 응답 필드 (v0.0.9)

```json
{
  "ok": true,
  "title": "글 제목",
  "html": "본문 HTML",
  "contentHtml": "본문 HTML (html과 동일)",
  "content": "HTML 제거 텍스트",
  "summary": "핵심 요약",
  "metaDescription": "메타 설명",
  "labels": ["태그1", "태그2"],
  "faq": [{"q": "질문", "a": "답변"}],
  "sourcesUsed": 8,
  "article": { ... },
  "post": { ... }
}
```

### v0.0.9 HTML 구조 (품질검수 대응)

AI가 생성하는 글에는 아래 섹션이 포함되도록 유도합니다:

- `<h2>핵심 요약</h2>`
- `<h2>최신정보</h2>`
- `<h2>실제 사례</h2>`
- `<h2>비교 표</h2>` + `<table>`
- `<h2>체크리스트</h2>` + `<ul><li>`
- `<h2>FAQ</h2>` (3개 이상)
- `<h2>결론</h2>`
- `<h2>출처 및 참고자료</h2>`
- `<p><strong>이미지 설명(alt):</strong> ...</p>`

---

## 4. Blogger 임시저장 / 예약발행

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `BLOGGER_BLOG_ID`

### Blogger Secret 발급 순서

1. Google Cloud Console(https://console.cloud.google.com)에서 프로젝트를 만들고
   Blogger API를 활성화합니다.
2. OAuth 2.0 클라이언트 ID를 만들어 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`을 발급받습니다.
3. Blogger 글쓰기 권한 범위(`https://www.googleapis.com/auth/blogger`)로 OAuth 동의를
   1회 진행해서 `refresh_token`을 발급받습니다. (Google OAuth Playground 이용 추천)
4. 발급받은 `refresh_token`을 `GOOGLE_REFRESH_TOKEN`으로 등록합니다.
5. Blogger 블로그 ID를 확인해 `BLOGGER_BLOG_ID`로 등록합니다.

Worker는 요청이 올 때마다 `GOOGLE_REFRESH_TOKEN`으로 새 Access Token을 발급받아
Blogger API를 호출합니다. Access Token은 저장하지 않습니다.

### 지원 경로 (v0.0.9)

| 경로 | 설명 |
|------|------|
| `POST /blogger/status` | 연결 상태 확인 |
| `POST /blogger/draft` | 임시저장 (품질점수 50점 이상 필요) |
| `POST /blogger/schedule` | 예약발행 (품질점수 70점 이상, 미래 시각 필수) |
| `GET /blogger/list` | 최근 글 목록 |

> ⚠️ **바로 발행 기능 없음**: 지원하는 방식은 임시저장(`isDraft=true`)과
> 예약발행(`isDraft=false` + 미래 `published` 날짜) 뿐입니다.

```
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
wrangler secret put BLOGGER_BLOG_ID
```

---

## 5. Secret 등록 명령 전체 목록

```
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
wrangler secret put NAVER_CLIENT_ID
wrangler secret put NAVER_CLIENT_SECRET
wrangler secret put AI_API_KEY
wrangler secret put AI_PROVIDER
wrangler secret put AI_MODEL
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
wrangler secret put BLOGGER_BLOG_ID
```

---

## 6. CORS 허용 도메인 (운영 전환 시)

v0.0.9 Worker는 `corsHeaders()` 함수에서 요청 Origin을 그대로 허용합니다.
운영 강화 시 특정 GitHub Pages 주소만 허용하도록 아래처럼 개선할 수 있습니다:

```js
// 운영 강화 예시 (worker.js 수정 필요)
const ALLOWED_ORIGINS = ['https://woo8484.github.io'];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    ...
  };
}
```

---

## 7. 프론트(브라우저)에 넣으면 안 되는 값

아래 값은 절대 `index.html`, `assets/js/*.js` 등 프론트 코드에 넣지 않습니다:

- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`
- `AI_API_KEY`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` / `BLOGGER_BLOG_ID`
- `ADMIN_PASSWORD` / `SESSION_SECRET`

프론트는 오직 **Cloudflare Worker URL** 하나만 설정 화면에 입력합니다.

---

## 8. v0.1.0 신규 Secret (AI Provider Router)

아래 Secret은 선택 사항입니다. 등록하지 않은 provider는 자동으로 건너뜁니다.

```
wrangler secret put AI_FALLBACK_ORDER     (기본: gemini,openai,openrouter,claude)
wrangler secret put OPENAI_API_KEY        (없으면 OpenAI 건너뜀)
wrangler secret put OPENAI_MODEL          (기본: gpt-4o-mini)
wrangler secret put CLAUDE_API_KEY        (없으면 Claude 건너뜀)
wrangler secret put CLAUDE_MODEL          (기본: claude-3-haiku-20240307)
wrangler secret put OPENROUTER_API_KEY    (없으면 OpenRouter 건너뜀)
wrangler secret put OPENROUTER_MODEL      (기본: openai/gpt-4o-mini)
```

### Fallback 순서 설정 예시

```
# Gemini 우선, 실패 시 OpenAI
AI_FALLBACK_ORDER = gemini,openai

# OpenAI 우선, 실패 시 OpenRouter
AI_FALLBACK_ORDER = openai,openrouter

# Gemini만 사용 (fallback 없음)
AI_FALLBACK_ORDER = gemini
```

### 향후 설계 (v0.1.3 이후 적용 예정)

```
DAILY_AI_LIMIT = 20          ← 하루 AI 생성 제한 (KV 기반, v0.1.3 적용)
AI_CACHE_TTL_MINUTES = 60    ← 캐시 TTL (KV 기반, v0.1.3 적용)
```

> ⚠️ `DAILY_AI_LIMIT`와 `AI_CACHE_TTL_MINUTES`는 v0.1.0에서는 구조 설계만 되어 있습니다.
> 실제 적용은 Cloudflare KV가 추가되는 v0.1.3에서 진행됩니다.
