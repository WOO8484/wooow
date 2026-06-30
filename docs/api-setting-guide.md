# API 연결 준비 가이드

v0.0.4부터 **네이버 검색 API**, v0.0.5부터 **AI 글 생성 API**, v0.0.6부터
**Blogger 임시저장/예약발행**이 실제로 연결됩니다. v0.0.7부터는 AI 글 생성 요청에
생성 모드(빠른/일반/고급)와 글쓰기 옵션(글쓴이 느낌/작성 톤/이모티콘)이 함께 전달되어
프롬프트와 분량, 출력 토큰 수에 반영됩니다. 모든 Secret은 등록하지 않아도
앱은 정상 작동하며, 해당 기능만 자동으로 Mock으로 동작합니다.

이 문서는 Cloudflare Worker Secret으로 등록해야 하는 값을 항목별로 정리합니다.
아래 값은 **절대 프론트(index.html, assets/js/*.js)나 Git 저장소에 직접 적지
않습니다.** 모두 `wrangler secret put` 명령으로 Cloudflare에만 등록합니다.

## 1. 네이버 (v0.0.4부터 실제로 사용됨)
네이버 개발자센터(https://developers.naver.com)에서 애플리케이션을 등록하면 아래 값을 발급받습니다.
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

블로그 검색과 웹문서 검색을 함께 호출합니다. 뉴스 검색은 추후 필요 시 같은 방식으로
worker.js에 경로를 추가할 수 있습니다.

## 2. AI (v0.0.5부터 실제로 사용됨)
worker.js는 기본적으로 Google AI Studio(https://aistudio.google.com)에서 발급받는
**Gemini API 무료 티어 키**를 기준으로 작성되어 있습니다.
- `AI_API_KEY`
- `AI_PROVIDER` (선택) — 사용할 AI 제공사. 등록하지 않으면 `gemini`가 기본값입니다.
  현재 코드는 `gemini` 제공사만 실제로 지원하며, 그 외 값을 등록하면
  `/ai/generate`가 "지원하지 않는 AI_PROVIDER입니다"라는 오류를 반환합니다.
  다른 제공사를 새로 지원하려면 `handleAiGenerate()` 안에 분기를 추가해야 합니다.
- `AI_MODEL` (선택) — 사용할 Gemini 모델명. 등록하지 않으면 `gemini-2.5-flash`가
  기본값입니다. worker.js는 이 값을 그대로 Gemini API 호출 URL에 사용하므로,
  Google AI Studio에서 제공하는 다른 모델명(예: `gemini-2.5-pro`)으로 바로
  교체할 수 있습니다.

AI가 작성한 글은 제목/요약/본문/FAQ/체크리스트/이미지 제안/출처까지 포함한 JSON
구조로 요청하며, 사용자가 입력하지 않은 경험은 지어내지 말라고 프롬프트에
명시되어 있습니다. Gemini 호출에는 `generationConfig: { responseMimeType:
"application/json" }`을 함께 보내 코드블록 없이 순수 JSON으로 응답하도록 유도합니다.

### v0.0.7: 생성 모드 / 글쓰기 옵션
프론트(api.js)는 `/ai/generate` 호출 시 아래 값을 함께 보냅니다. 알 수 없는 값이
오면 worker.js가 안전한 기본값(`normal` / `neutral` / `friendly` / `few`)으로 보정합니다.
- `mode`: `fast`(800~1000자) / `normal`(1200~1500자) / `advanced`(2000자 이상).
  참고자료 개수, FAQ/체크리스트 개수, `generationConfig.maxOutputTokens`가 모드별로
  달라집니다.
- `persona`: `neutral` / `male` / `female`. 성별 고정관념 표현 없이 자연스러운 어조
  차이만 반영하도록 프롬프트에 명시되어 있습니다.
- `tone`: `basic` / `friendly` / `review` / `lifehack` / `expert`.
- `emoji`: `none` / `few` / `moderate`. 이모티콘 사용 정도를 조절합니다.

```json
{
  "title": "글 제목",
  "summary": "핵심 요약",
  "html": "본문 HTML",
  "faq": [{"question": "질문", "answer": "답변"}],
  "checklist": ["항목 1", "항목 2"],
  "imageIdeas": [{"purpose": "대표 이미지", "description": "설명", "alt": "대체 텍스트"}],
  "sources": [{"type": "blog 또는 web", "title": "출처 제목"}]
}
```

AI 호출이 실패하거나 응답이 위 형식(특히 title/html)을 충족하지 못하면, Worker가
`ok:false`를 반환하고 프론트는 자동으로 기존 Mock 글 생성으로 대체합니다.

### v0.0.7: BlogSpot용 HTML 박스 구조
`html` 필드는 Blogger(BlogSpot)에 그대로 붙여도 보기 좋도록 아래 class 구조를
사용하도록 프롬프트에 명시되어 있습니다. (Mock 생성도 동일한 구조를 사용합니다)
`bpw-post`(전체 wrapper), `bpw-intro-box`(도입부), `bpw-summary-box`(핵심 요약),
`bpw-warning-box`(주의사항), `bpw-checklist-box`(체크리스트), `bpw-faq-box`(FAQ),
`bpw-conclusion-box`(결론), `bpw-image-placeholder`(이미지 추천 안내),
`bpw-ad-slot`(광고 삽입 추천 위치). `<script>` 태그는 사용하지 않으며, 표는
`assets/css/style.css`에서 가로 스크롤 처리되어 모바일에서도 깨지지 않습니다.
실제 이미지 URL이 없으므로 `<img>` 태그 대신 설명+alt 텍스트로만 이미지를 제안합니다.

## 3. Blogger (v0.0.6부터 실제로 사용됨)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `BLOGGER_BLOG_ID` (글을 저장할 블로그의 ID, 이전 이름 `BLOG_ID`를 대체)

### GOOGLE_REFRESH_TOKEN 발급 절차 (요약)
1. Google Cloud Console에서 프로젝트를 만들고 "Blogger API"를 사용 설정합니다.
2. OAuth 동의 화면을 설정하고, OAuth 클라이언트(웹 애플리케이션 또는 데스크톱 앱)를
   만들어 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`을 발급받습니다.
3. Blogger 글쓰기 권한 범위(`https://www.googleapis.com/auth/blogger`)로 OAuth 동의를
   1회 진행해서 `refresh_token`을 발급받습니다. (Google OAuth Playground 등을 이용해
   직접 발급받는 방법이 가장 간단합니다)
4. 발급받은 `refresh_token`을 `GOOGLE_REFRESH_TOKEN`으로 Worker Secret에 등록합니다.
5. Blogger 블로그 관리 화면 주소나 API로 블로그 ID를 확인해 `BLOGGER_BLOG_ID`로 등록합니다.

worker.js는 요청이 올 때마다 `GOOGLE_REFRESH_TOKEN`으로 새 Access Token을 발급받아
Blogger API(`posts.insert`)를 호출합니다. Access Token은 어디에도 저장하지 않습니다.

⚠️ 이 프로그램에는 "바로 발행" 경로(`/blogger/publish`)가 없습니다. 지원하는 저장
방식은 임시저장(`isDraft=true`)과 예약발행(`isDraft=false` + 미래 `published` 날짜)
뿐입니다.

## 4. 관리자
- `ADMIN_PASSWORD` — 아직 미사용. worker.js의 `/auth/login`은 현재 Mock 응답만
  반환하며, 실제 비교 로직은 운영 전환 단계에서 구현합니다.

## 5. Cloudflare Worker Secret 등록 명령 모음

```
wrangler secret put NAVER_CLIENT_ID
wrangler secret put NAVER_CLIENT_SECRET
wrangler secret put AI_API_KEY
wrangler secret put AI_PROVIDER
wrangler secret put AI_MODEL
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GOOGLE_REFRESH_TOKEN
wrangler secret put BLOGGER_BLOG_ID
wrangler secret put ADMIN_PASSWORD
```

각 명령을 실행하면 값을 입력하라는 프롬프트가 나오고, 입력한 값은 Cloudflare에만
안전하게 저장됩니다. (코드나 Git 저장소에는 남지 않습니다)

## 6. CORS 허용 도메인 제한 (운영 전환 시)
worker.js 상단의 `ALLOWED_ORIGINS` 배열로 CORS를 제한할 수 있습니다.

```js
// 테스트 중 (기본값)
const ALLOWED_ORIGINS = ['*'];

// GitHub Pages 등으로 공개 배포할 때
const ALLOWED_ORIGINS = ['https://your-id.github.io'];
```

배열에 `'*'`가 들어 있으면 모든 도메인을 허용하고, 그렇지 않으면 요청의 Origin이
배열에 포함된 경우에만 허용합니다. 운영 전환 전에는 실제 GitHub Pages 주소(또는
사용하는 도메인)만 남기고 `'*'`를 제거하는 것을 권장합니다.

## 7. 프론트(브라우저)에 넣으면 안 되는 값
아래 값은 절대 index.html, assets/js/*.js 등 프론트 코드에 넣지 않습니다.
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`
- `AI_API_KEY`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` / `BLOGGER_BLOG_ID`
- `ADMIN_PASSWORD`

프론트는 오직 **Cloudflare Worker URL** 하나만 설정 화면에 입력합니다.
그 외 키 값은 프론트가 알 필요도, 알아서도 안 됩니다.
