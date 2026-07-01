# 설치 및 업로드 순서 가이드

> **기준 버전: BPW v0.1.0**  
> GitHub Pages 앱 v0.1.0 · Worker v0.1.0  
> 파일 기준: `wooow-v0.1.0-test-r1.zip` (내부 버전: v0.1.0)

---

## 1. 압축 해제

1. `wooow-v0.1.0-test-r1.zip` 파일을 다운로드합니다.
2. 압축을 풀면 `wooow-v0.1.0-test-r1` 폴더가 나옵니다.

---

## 2. GitHub 저장소 만들기

1. GitHub에 로그인한 뒤 새 저장소(Repository)를 만듭니다.
2. 저장소 이름 예시: `wooow`
3. Public 또는 Private 중 원하는 것을 선택합니다. (개인 테스트용이면 Private 추천)

---

## 3. GitHub 업로드

1. 새 저장소 페이지에서 **"Add file → Upload files"** 를 클릭합니다.
2. `wooow-v0.1.0-test-r1` 폴더 안의 모든 파일/폴더를 구조를 유지한 채로 업로드합니다.
   - `index.html`
   - `assets/`
   - `worker/`
   - `docs/`
   - `VERSION_RULES.md`
   - `CHANGELOG.md`
3. Commit 버튼을 눌러 저장합니다.

---

## 4. GitHub Pages 설정

1. 저장소의 **Settings → Pages** 메뉴로 이동합니다.
2. Branch를 `main`, 폴더를 `/ (root)`로 선택하고 저장합니다.
3. 1~2분 기다리면 `https://아이디.github.io/저장소이름/` 주소가 발급됩니다.

---

## 5. Cloudflare Worker 배포

> `worker/worker.js`는 v0.1.0 AI Provider Router 버전입니다. 이 파일을 Cloudflare에 배포합니다.

1. Cloudflare 계정으로 로그인한 뒤 Wrangler CLI를 설치합니다.
2. `worker/wrangler-example.toml`을 복사해서 `wrangler.toml`로 이름을 바꾸고
   본인 환경에 맞게 수정합니다.
3. `worker/worker.js`를 그대로 사용해 `wrangler deploy` 명령으로 배포합니다.
4. 배포가 끝나면 `https://....workers.dev` 형태의 Worker 주소가 발급됩니다.
5. Secret을 순서대로 등록합니다.

   **로그인 (필수)**
   ```
   wrangler secret put ADMIN_PASSWORD
   wrangler secret put SESSION_SECRET
   ```

   **네이버 검색 (실제 검색 사용 시)**
   ```
   wrangler secret put NAVER_CLIENT_ID
   wrangler secret put NAVER_CLIENT_SECRET
   ```

   **AI 글 생성 (실제 AI 사용 시)**
   ```
   wrangler secret put AI_API_KEY
   wrangler secret put AI_PROVIDER
   wrangler secret put AI_MODEL
   ```

   **Blogger 발행 (실제 Blogger 연결 시)**
   ```
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   wrangler secret put GOOGLE_REFRESH_TOKEN
   wrangler secret put BLOGGER_BLOG_ID
   ```

   Secret을 하나도 등록하지 않아도 앱은 정상 작동하며, 해당 기능은 자동으로
   Mock 결과/Mock 저장으로 진행됩니다.

---

## 6. Worker URL 복사

1. 배포 완료 후 터미널에 출력된 Worker 주소를 복사해둡니다.

---

## 7. 설정 화면에 Worker URL 입력

1. GitHub Pages로 접속합니다.
2. 로그인 화면에서 `ADMIN_PASSWORD`로 로그인합니다.
   - v0.0.9부터 적용된 실제 인증 방식으로, `/auth/login`은 Worker에서 `ADMIN_PASSWORD` Secret과 실제로 비교합니다.
3. "설정" 탭으로 이동해 "Cloudflare Worker URL" 입력란에 복사한 주소를 붙여넣습니다.
4. "Worker URL 저장" 버튼을 누릅니다.

---

## 8. Worker 연결 테스트

1. 설정 화면의 "Worker 연결 테스트" 버튼을 누릅니다.
2. `/health` 경로를 호출해 Worker가 응답하는지 확인합니다.
3. 성공 시 Worker 버전이 `v0.1.0`으로 표시됩니다.

---

## 9. 성공 여부 확인

- **성공**: "연결 성공" 배지로 바뀌고 동작 모드가 "Worker 모드"로 표시됩니다.
- **실패**: "연결 실패, Mock 모드로 계속 사용합니다" 안내가 뜨고, 동작 모드는 자동으로
  "Mock 모드"로 유지됩니다. 이 경우에도 다른 기능은 Mock으로 계속 사용할 수 있습니다.

---

## 10. 네이버 검색 / AI 글 생성 실제 연결 확인

1. Worker 연결 테스트가 성공하고 NAVER Secret도 등록되어 있다면, "키워드" 탭에서
   블로그 10건 / 웹문서 10건이 분리되어 표시됩니다.
2. AI_API_KEY가 등록되어 있다면, "글생성" 탭에서 "✅ 실제 AI 글 생성 (Gemini)" 배지와
   함께 AI가 작성한 글이 표시됩니다.
   - Gemini 무료 쿼터 초과(429) 시: "⛔ Gemini 무료 사용량(쿼터)을 초과했습니다." 안내가 표시됩니다.

---

## 11. Blogger 실제 연결/저장 확인

1. Worker 연결이 성공하고 Blogger Secret이 모두 등록되어 있다면,
   "발행" 탭의 "Blogger 연결하기" 클릭 시 "연결됨" 배지가 초록색으로 표시됩니다.
2. Secret이 없거나 연결 확인(`/blogger/status`)이 실패하면, 원인이 화면에 표시됩니다.

---

## 12. 품질검수 기준 (v0.0.9 이후 유지)

| 구분 | 기준 | 설명 |
|------|------|------|
| 임시저장 | **50점 이상** | 50점 미만은 "보완 권장" 안내 표시 |
| 예약발행 | **70점 이상** | 70점 미만은 예약발행 버튼 비활성화 |

- 품질검수는 글 본문의 구조(핵심 요약/최신정보/비교 표/체크리스트/FAQ 등)를 체크합니다.
- AI 생성 글은 Worker v0.1.0이 이 구조를 포함하도록 유도하므로 기존보다 높은 점수를 받습니다.
- 부족한 항목은 점수 화면에 구체적인 보완 팁과 함께 표시됩니다.

---

## 13. 하루 저장/예약 제한 설정

1. 설정 화면에서 하루 최대 저장/예약 발행 건수를 입력하고
   "하루 제한 저장"을 누릅니다. (기본값 3건, 초기 운영 권장값 3~5건)
2. 오늘 저장/예약한 건수가 설정값에 도달하면, 추가 임시저장/예약발행 버튼이
   비활성화되고 "오늘 발행 제한 N건을 초과했습니다" 안내가 표시됩니다.

---

## 14. 글 생성 모드 / 글쓰기 옵션

1. **생성 모드**: 빠른 생성(800~1000자) / 일반 생성(1200~1500자) / 고급 생성(2000자 이상)
2. **글쓴이 느낌**: 중립 / 남성 느낌 / 여성 느낌
3. **작성 톤**: 기본형 / 친근한 블로그형 / 꼼꼼한 리뷰형 / 생활 꿀팁형 / 전문가 정리형
4. **이모티콘**: 사용 안 함 / 적게 사용 / 적당히 사용

---

## 15. 클릭 테스트 순서

1. 로그인 (`ADMIN_PASSWORD`) → Worker 연결 테스트
2. 키워드 입력 → 네이버 검색 (블로그/웹문서 분리 표시 확인)
3. 글 생성 → AI 배지 확인 (실제 AI / Mock / 쿼터 초과 구분)
4. 품질검수 → 점수 + 부족 항목 안내 확인
5. Blogger 연결 → "연결됨" 배지 확인
6. 임시저장(50점 이상) / 예약발행(70점 이상 + 날짜·시간 입력)
7. 설정 화면 → 글 톤, 금지어, 전체 초기화 확인

---

## 16. 주의사항

- 이 저장소(특히 Public 저장소)에는 실제 API 키, OAuth 비밀값, 실제 비밀번호를
  절대 올리지 마세요.
- 실수로 올렸다면 즉시 키를 재발급하고, Git 히스토리에서도 제거해야 합니다.
- Worker Secret은 Cloudflare Dashboard 또는 `wrangler secret put` 명령으로만 등록합니다.
