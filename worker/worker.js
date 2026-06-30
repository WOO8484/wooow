// worker/worker.js
// Cloudflare Worker (v0.0.8.1 보안 패치)
//
// 변경 내용 (v0.0.7 → v0.0.8.1):
//   - /auth/login: 실제 env.ADMIN_PASSWORD 비교 + JWT-like 토큰 발급
//   - /health, /auth/login 제외 모든 경로: Authorization: Bearer 토큰 검증 (401 반환)
//   - SESSION_SECRET: 토큰 서명에 사용 (Cloudflare Secret으로 등록 필요)
//
// 등록해야 할 Secret (wrangler secret put 명령):
//   env.ADMIN_PASSWORD        ← 관리자 로그인 비밀번호
//   env.SESSION_SECRET        ← 토큰 서명용 비밀 문자열 (랜덤 긴 문자열)
//   env.NAVER_CLIENT_ID       ← 네이버 검색 API
//   env.NAVER_CLIENT_SECRET   ← 네이버 검색 API
//   env.AI_API_KEY            ← Gemini AI API 키
//   env.AI_PROVIDER           ← 'gemini' (기본값)
//   env.AI_MODEL              ← 'gemini-2.5-flash' (기본값)
//   env.GOOGLE_CLIENT_ID      ← Blogger OAuth
//   env.GOOGLE_CLIENT_SECRET  ← Blogger OAuth
//   env.GOOGLE_REFRESH_TOKEN  ← Blogger OAuth
//   env.BLOGGER_BLOG_ID       ← Blogger 블로그 ID
//
// ⚠️ 바로 발행(POST /blogger/publish) 경로는 의도적으로 만들지 않습니다.
// ⚠️ 실제 키 값은 절대 이 파일에 적지 않습니다.

const WORKER_VERSION = 'v0.0.8.1';

/* ------------------------------------------------------------
   v0.0.7 AI 글 생성 옵션
   ------------------------------------------------------------ */
const WORKER_GENERATION_MODES = {
  fast:     { sourceCount: 3, minLength: 800,  maxLength: 1000, faqCount: 2, checklistCount: 3, imageIdeaCount: 1, maxOutputTokens: 2048, label: '빠른 생성' },
  normal:   { sourceCount: 5, minLength: 1200, maxLength: 1500, faqCount: 3, checklistCount: 4, imageIdeaCount: 2, maxOutputTokens: 4096, label: '일반 생성' },
  advanced: { sourceCount: 8, minLength: 2000, maxLength: 3000, faqCount: 5, checklistCount: 5, imageIdeaCount: 3, maxOutputTokens: 8192, label: '고급 생성' }
};

const WORKER_WRITER_PERSONAS = {
  neutral: '성별이 드러나지 않는 중립적인 운영자 어조',
  male:    '남성 운영자 느낌이 자연스럽게 드러나는 어조 (성별 고정관념 표현은 절대 사용하지 않음)',
  female:  '여성 운영자 느낌이 자연스럽게 드러나는 어조 (성별 고정관념 표현은 절대 사용하지 않음)'
};

const WORKER_WRITING_TONES = {
  basic:    '기본형 - 담백하고 정보 전달에 집중하는 블로그 문체',
  friendly: '친근한 블로그형 - 옆집 이웃에게 말하듯 편안하고 다정한 문체',
  review:   '꼼꼼한 리뷰형 - 직접 따져보고 비교한 듯한 꼼꼼한 문체',
  lifehack: '생활 꿀팁형 - 실생활에 바로 쓸 수 있는 팁 위주의 가벼운 문체',
  expert:   '전문가 정리형 - 근거와 기준을 차분히 짚어주는 신뢰감 있는 문체'
};

const WORKER_EMOJI_LEVELS = {
  none:     '이모티콘을 전혀 사용하지 않는다',
  few:      '박스 제목에만 절제해서 사용한다 (핵심 요약 ✅, 팁 💡, 주의사항 ⚠️, 비추천 ❌, 결론 📌, 체크리스트 ☑️)',
  moderate: '박스 제목과 문단 한두 곳에 자연스럽게 사용한다 (문장마다 사용하지 않는다)'
};

/* ------------------------------------------------------------
   CORS 설정
   - 테스트 단계: ['*'] 로 두면 모든 도메인 허용
   - GitHub Pages 공개 후: ['https://woo8484.github.io'] 로 제한 권장
   ------------------------------------------------------------ */
const ALLOWED_ORIGINS = ['*'];

function buildCorsHeaders(request) {
  let allowOrigin = '*';
  if (!ALLOWED_ORIGINS.includes('*')) {
    const requestOrigin = request.headers.get('Origin') || '';
    allowOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

/* ------------------------------------------------------------
   토큰 발급/검증 (HMAC-SHA256, Web Crypto API)
   ------------------------------------------------------------ */

// 토큰 구조: base64url(header).base64url(payload).base64url(signature)
// payload: { iat, exp }  / 유효기간 12시간

function b64urlEncode(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  bytes.forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

async function makeHmacKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

async function createToken(secret, expiresInSeconds) {
  const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ iat: now, exp: now + expiresInSeconds })));
  const sigInput = header + '.' + payload;
  const key = await makeHmacKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigInput));
  return sigInput + '.' + b64urlEncode(sigBuf);
}

async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const sigInput = parts[0] + '.' + parts[1];
    const key = await makeHmacKey(secret);
    const sigBuf = b64urlDecode(parts[2]);
    const valid = await crypto.subtle.verify('HMAC', key, sigBuf, new TextEncoder().encode(sigInput));
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return false;
    return true;
  } catch(e) {
    return false;
  }
}

// Authorization 헤더에서 Bearer 토큰 추출 및 검증
async function checkAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  if (!token || !env.SESSION_SECRET) return false;
  return verifyToken(token, env.SESSION_SECRET);
}

/* ------------------------------------------------------------
   라우터
   ------------------------------------------------------------ */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = buildCorsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 인증 불필요 경로
    if (url.pathname === '/health') return handleHealth(request, env, corsHeaders);
    if (url.pathname === '/auth/login') return handleAuthLogin(request, env, corsHeaders);

    // 그 외 모든 경로: Authorization 토큰 검증
    const authed = await checkAuth(request, env);
    if (!authed) {
      return jsonResponse({ ok: false, message: '인증이 필요합니다. 다시 로그인해주세요.' }, corsHeaders, 401);
    }

    const routes = {
      '/search/naver':    handleSearchNaver,
      '/ai/generate':     handleAiGenerate,
      '/blogger/draft':   handleBloggerDraft,
      '/blogger/schedule': handleBloggerSchedule,
      '/blogger/list':    handleBloggerList,
      '/blogger/status':  handleBloggerStatus
    };

    const handler = routes[url.pathname];
    if (!handler) {
      return jsonResponse({ ok: false, message: '존재하지 않는 경로입니다.' }, corsHeaders, 404);
    }
    return handler(request, env, corsHeaders);
  }
};

/* ----------------------------------------------------------
   1. 헬스체크 (인증 불필요)
   ---------------------------------------------------------- */
async function handleHealth(request, env, corsHeaders) {
  return jsonResponse({
    ok: true,
    mode: 'worker',
    version: WORKER_VERSION,
    message: 'BPW Worker is running'
  }, corsHeaders);
}

/* ----------------------------------------------------------
   2. 관리자 로그인 (인증 불필요 - 토큰 발급 엔드포인트)
   env.ADMIN_PASSWORD와 비교, 일치하면 서명된 토큰 발급
   ---------------------------------------------------------- */
async function handleAuthLogin(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch(e) {
    return jsonResponse({ ok: false, message: '요청 본문(JSON)을 읽을 수 없습니다.' }, corsHeaders, 400);
  }

  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return jsonResponse({
      ok: false,
      message: 'ADMIN_PASSWORD 또는 SESSION_SECRET이 Worker Secret으로 등록되어 있지 않습니다.'
    }, corsHeaders, 500);
  }

  const inputPassword = body && body.password ? String(body.password) : '';
  if (!inputPassword) {
    return jsonResponse({ ok: false, message: '비밀번호가 비어 있습니다.' }, corsHeaders, 400);
  }

  // 타이밍 어택 방지를 위해 항상 비교 후 응답
  const isValid = inputPassword === env.ADMIN_PASSWORD;
  if (!isValid) {
    return jsonResponse({ ok: false, message: '비밀번호가 올바르지 않습니다.' }, corsHeaders, 401);
  }

  const expiresIn = 43200; // 12시간
  const token = await createToken(env.SESSION_SECRET, expiresIn);

  return jsonResponse({
    ok: true,
    mode: 'worker',
    version: WORKER_VERSION,
    token,
    expiresIn,
    message: '로그인 성공'
  }, corsHeaders);
}

/* ----------------------------------------------------------
   3. 네이버 검색 API 연동
   요청: POST /search/naver  body: { "keyword": "..." } 또는 { "query": "..." }
   ---------------------------------------------------------- */
async function handleSearchNaver(request, env, corsHeaders) {
  let keyword = '';
  try {
    const body = await request.json();
    keyword = (body && (body.keyword || body.query) ? String(body.keyword || body.query) : '').trim();
  } catch(e) {
    return jsonResponse({ ok: false, message: '요청 본문(JSON)을 읽을 수 없습니다.' }, corsHeaders, 400);
  }

  if (!keyword) {
    return jsonResponse({ ok: false, message: 'keyword 값이 비어 있습니다.' }, corsHeaders, 400);
  }

  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    return jsonResponse({
      ok: false,
      message: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 Worker Secret으로 등록되어 있지 않습니다.'
    }, corsHeaders, 500);
  }

  const naverHeaders = {
    'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
    'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET
  };

  try {
    const [blogResult, webResult] = await Promise.all([
      fetchNaverSearch('blog', keyword, naverHeaders),
      fetchNaverSearch('webkr', keyword, naverHeaders)
    ]);

    const items = [];
    (blogResult.items || []).forEach(item => {
      items.push({ type: 'blog', title: stripNaverTags(item.title), description: stripNaverTags(item.description), link: item.link, postdate: item.postdate || '' });
    });
    (webResult.items || []).forEach(item => {
      items.push({ type: 'web', title: stripNaverTags(item.title), description: stripNaverTags(item.description), link: item.link });
    });

    return jsonResponse({ ok: true, mode: 'worker', source: 'naver', query: keyword, keyword, items }, corsHeaders);
  } catch(e) {
    return jsonResponse({ ok: false, message: '네이버 검색 API 호출에 실패했습니다: ' + e.message }, corsHeaders, 502);
  }
}

async function fetchNaverSearch(type, keyword, naverHeaders) {
  const apiUrl = `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(keyword)}&display=5`;
  const response = await fetch(apiUrl, { headers: naverHeaders });
  if (!response.ok) {
    const detail = await readErrorDetail(response, naverHeaders['X-Naver-Client-Secret']);
    throw new Error(`네이버 ${type} 검색 응답 오류 (status: ${response.status}) ${detail}`);
  }
  return response.json();
}

function stripNaverTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/* ----------------------------------------------------------
   4. AI 글 생성 API 연동
   응답에 post.contentHtml 구조 포함 (프론트 v0.0.8.1 대응)
   ---------------------------------------------------------- */
async function handleAiGenerate(request, env, corsHeaders) {
  let payload;
  try { payload = await request.json(); } catch(e) {
    return jsonResponse({ ok: false, message: '요청 본문(JSON)을 읽을 수 없습니다.' }, corsHeaders, 400);
  }

  const keyword = (payload && payload.keyword ? String(payload.keyword) : '').trim();
  const material = (payload && payload.material) || {};
  const sources = (payload && Array.isArray(payload.sources)) ? payload.sources : [];
  const modeKey = WORKER_GENERATION_MODES[payload && payload.mode] ? payload.mode : 'normal';
  const modeConfig = WORKER_GENERATION_MODES[modeKey];
  const personaKey = WORKER_WRITER_PERSONAS[payload && payload.persona] ? payload.persona : 'neutral';
  const toneKey = WORKER_WRITING_TONES[payload && payload.tone] ? payload.tone : 'friendly';
  const emojiKey = WORKER_EMOJI_LEVELS[payload && payload.emoji] ? payload.emoji : 'few';

  if (!keyword) return jsonResponse({ ok: false, message: 'keyword 값이 비어 있습니다.' }, corsHeaders, 400);
  if (!env.AI_API_KEY) return jsonResponse({ ok: false, message: 'AI_API_KEY가 Worker Secret으로 등록되어 있지 않습니다.' }, corsHeaders, 500);

  const aiProvider = String(env.AI_PROVIDER || 'gemini').trim().toLowerCase();
  const aiModel = String(env.AI_MODEL || 'gemini-2.5-flash').trim();

  if (aiProvider !== 'gemini') {
    return jsonResponse({ ok: false, message: `지원하지 않는 AI_PROVIDER입니다: "${aiProvider}"` }, corsHeaders, 400);
  }

  const prompt = buildAiPrompt(keyword, material, sources.slice(0, modeConfig.sourceCount), modeConfig, personaKey, toneKey, emojiKey);

  try {
    const aiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(aiModel)}:generateContent?key=${env.AI_API_KEY}`;
    const response = await fetch(aiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: modeConfig.maxOutputTokens }
      })
    });

    if (!response.ok) {
      const detail = await readErrorDetail(response, env.AI_API_KEY);
      throw new Error(`AI API 응답 오류 (status: ${response.status}) ${detail}`);
    }

    const data = await response.json();
    const rawText = extractAiText(data);
    if (!rawText) throw new Error('AI 응답에서 텍스트를 찾을 수 없습니다.');
    const parsed = parseAiJson(rawText);
    if (!parsed || !parsed.title || !parsed.html) throw new Error('AI 응답 형식이 올바르지 않습니다 (title/html 누락).');

    // 응답: post.contentHtml 구조 (v0.0.8.1) + 레거시 title/html도 함께 반환
    const responseBody = {
      ok: true,
      mode: 'worker',
      source: 'ai',
      provider: aiProvider,
      model: aiModel,
      // 레거시 필드 (프론트 호환)
      title: parsed.title,
      html: parsed.html,
      // 신규 post 구조
      post: {
        title: parsed.title,
        contentHtml: parsed.html,
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        summary: parsed.summary || '',
        imageIdeas: Array.isArray(parsed.imageIdeas) ? parsed.imageIdeas : [],
        sources: Array.isArray(parsed.sources) ? parsed.sources : []
      }
    };
    if (typeof parsed.summary === 'string') responseBody.summary = parsed.summary;
    if (Array.isArray(parsed.faq)) responseBody.faq = parsed.faq;
    if (Array.isArray(parsed.checklist)) responseBody.checklist = parsed.checklist;
    if (Array.isArray(parsed.imageIdeas)) responseBody.imageIdeas = parsed.imageIdeas;
    if (Array.isArray(parsed.sources)) responseBody.sources = parsed.sources;

    return jsonResponse(responseBody, corsHeaders);
  } catch(e) {
    return jsonResponse({ ok: false, message: 'AI 글 생성에 실패했습니다: ' + e.message }, corsHeaders, 502);
  }
}

function buildAiPrompt(keyword, material, sources, modeConfig, personaKey, toneKey, emojiKey) {
  const materialLines = Object.keys(material || {})
    .filter(k => material[k])
    .map(k => `- ${k}: ${material[k]}`)
    .join('\n');
  const hasRealExperience = !!(material && material.situation);
  const sourceLines = (sources || [])
    .map(s => `- [${s.type === 'blog' ? '블로그' : '웹문서'}] ${s.title || ''}`)
    .join('\n');
  const personaText = WORKER_WRITER_PERSONAS[personaKey] || WORKER_WRITER_PERSONAS.neutral;
  const toneText = WORKER_WRITING_TONES[toneKey] || WORKER_WRITING_TONES.friendly;
  const emojiText = WORKER_EMOJI_LEVELS[emojiKey] || WORKER_EMOJI_LEVELS.few;

  return `당신은 한국어 블로그 글 작성 도우미입니다. 키워드 "${keyword}"에 대한 블로그 글을 작성하세요.

[글쓰기 스타일]
- 글쓴이 느낌: ${personaText}
- 작성 톤: ${toneText}
- 이모티콘 사용: ${emojiText}
- 성별 고정관념 표현("여자라서", "남자라서" 등)은 절대 사용하지 마세요.

[사람이 직접 쓴 것처럼 보이도록 반드시 지킬 것]
- "첫째, 둘째, 셋째" 같은 번호식 나열 표현을 남발하지 마세요.
- "결론적으로", "따라서", "중요합니다" 같은 표현을 반복하지 마세요.
- 문단 길이를 다양하게 구성하세요.
- 장점만 나열하지 말고, 단점/비추천 상황/주의사항도 함께 다루세요.
- 존댓말 블로그 문체를 유지하세요.
- ${hasRealExperience
    ? '[사용자가 입력한 실제 경험이 있습니다] 아래 재료에 적힌 내용만 실제 경험으로 다루세요.'
    : '[사용자가 입력한 실제 경험이 없습니다] "제가 직접 겪어보니" 같은 1인칭 실제 경험 표현을 절대 사용하지 마세요.'}

[사용자가 직접 입력한 글 재료]
${materialLines || '(입력된 재료 없음)'}

[참고 출처] (최대 ${modeConfig.sourceCount}개)
${sourceLines || '(제공된 출처 없음)'}

[분량 기준]
본문(html) 전체 텍스트 기준 ${modeConfig.minLength}자 이상 ${modeConfig.maxLength}자 내외로 작성하세요.
FAQ는 ${modeConfig.faqCount}개, 체크리스트 항목은 ${modeConfig.checklistCount}개, 이미지 제안은 ${modeConfig.imageIdeaCount}개를 만드세요.

[글 구조 - html 필드 안에 반드시 이 순서와 형식을 지키세요]
전체를 <div class="bpw-post"> ... </div> 로 감싸세요.
1. <h3>제목</h3>과 도입부 - <div class="bpw-intro-box">왜 이 글을 읽어야 하는지</div>
2. <h3>핵심 요약</h3> - <div class="bpw-summary-box">2~3문장</div>
3. <h3>최신정보 정리</h3>
4. <h3>왜 중요한가</h3>
5. <h3>사례</h3>
6. <h3>비교 기준</h3> - 반드시 <table> 태그로 비교표 포함 (열 3개 이내)
7. <h3>체크리스트</h3> - <div class="bpw-checklist-box"><ul><li>☑ 내용</li>...</ul></div>
8. <h3>주의사항</h3> - <div class="bpw-warning-box">단점/비추천 상황 포함</div>
9. <h3>FAQ</h3> - <div class="bpw-faq-box"><p><b>Q. 질문</b><br>A. 답변</p>...</div>
10. <h3>결론</h3> - <div class="bpw-conclusion-box">결론</div>
11. <h3>출처</h3> - <li>[출처] 제목</li> 형식
12. <h3>이미지 제안</h3> - <div class="bpw-image-placeholder"><b>이미지 추천</b><p>설명</p></div>
13. <div class="bpw-ad-slot">광고 삽입 추천 위치</div> 1곳 포함

[출력 형식 - 매우 중요]
다른 설명 없이 아래 JSON 형식으로만 응답하세요.
{
  "title": "글 제목",
  "summary": "핵심 요약 2~3문장",
  "html": "전체 본문 HTML 문자열",
  "faq": [{"question": "질문", "answer": "답변"}],
  "checklist": ["항목 1", "항목 2"],
  "imageIdeas": [{"purpose": "대표 이미지", "description": "설명", "alt": "대체 텍스트"}],
  "sources": [{"type": "blog", "title": "출처 제목"}]
}`;
}

function extractAiText(data) {
  try { return data.candidates[0].content.parts[0].text; } catch(e) { return ''; }
}

function parseAiJson(text) {
  try {
    const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch(e) { return null; }
}

async function readErrorDetail(response, ...secrets) {
  let bodyText = '';
  try { bodyText = await response.text(); } catch(e) { return ''; }
  let safeText = bodyText;
  secrets.forEach(secret => {
    if (secret) safeText = safeText.split(secret).join('[REDACTED]');
  });
  return safeText.slice(0, 200);
}

/* ----------------------------------------------------------
   Blogger 공통 도우미
   ---------------------------------------------------------- */
function hasBloggerSecrets(env) {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN && env.BLOGGER_BLOG_ID);
}

async function getGoogleAccessToken(env) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  if (!response.ok) throw new Error(`Google OAuth 토큰 발급 실패 (${response.status})`);
  const data = await response.json();
  if (!data.access_token) throw new Error('Google OAuth 응답에 access_token이 없습니다.');
  return data.access_token;
}

/* ----------------------------------------------------------
   5. Blogger 연결 상태 확인 GET /blogger/status
   ---------------------------------------------------------- */
async function handleBloggerStatus(request, env, corsHeaders) {
  if (!hasBloggerSecrets(env)) {
    return jsonResponse({ ok: false, mode: 'worker', configured: false, message: 'Blogger Secret is not configured' }, corsHeaders);
  }
  try {
    const accessToken = await getGoogleAccessToken(env);
    const blogUrl = `https://www.googleapis.com/blogger/v3/blogs/${env.BLOGGER_BLOG_ID}`;
    const blogResponse = await fetch(blogUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!blogResponse.ok) {
      const detail = await readErrorDetail(blogResponse);
      throw new Error(`블로그 조회 실패 (status: ${blogResponse.status}) ${detail}`);
    }
    const blogData = await blogResponse.json();
    return jsonResponse({
      ok: true, mode: 'worker', configured: true,
      blogIdExists: !!env.BLOGGER_BLOG_ID, refreshTokenExists: !!env.GOOGLE_REFRESH_TOKEN,
      blogExists: true, blogName: blogData.name || '', blogUrl: blogData.url || '',
      message: 'Blogger configuration is ready'
    }, corsHeaders);
  } catch(e) {
    return jsonResponse({ ok: false, mode: 'worker', configured: false, message: 'Blogger Secret 확인 실패: ' + e.message }, corsHeaders, 502);
  }
}

/* ----------------------------------------------------------
   6. Blogger 임시저장 POST /blogger/draft
   body: { post: { title, contentHtml, tags } } 또는 { title, html, labels, qualityScore }
   ---------------------------------------------------------- */
async function handleBloggerDraft(request, env, corsHeaders) {
  let payload;
  try { payload = await request.json(); } catch(e) {
    return jsonResponse({ ok: false, message: '요청 본문(JSON)을 읽을 수 없습니다.' }, corsHeaders, 400);
  }

  // 신규 구조(post.contentHtml) 또는 레거시(title/html) 모두 처리
  const post = payload.post || {};
  const title = String(post.title || payload.title || '');
  const html = String(post.contentHtml || post.html || payload.html || payload.contentHtml || '');
  const labels = Array.isArray(post.tags) ? post.tags : (Array.isArray(payload.labels) ? payload.labels : []);
  const qualityScore = typeof payload.qualityScore === 'number' ? payload.qualityScore : 0;

  if (!title || !html) return jsonResponse({ ok: false, message: 'title과 html은 필수입니다.' }, corsHeaders, 400);
  if (qualityScore < 70) return jsonResponse({ ok: false, message: '품질점수가 70점 미만이라 임시저장을 거부했습니다.' }, corsHeaders, 400);
  if (!hasBloggerSecrets(env)) return jsonResponse({ ok: false, message: 'Blogger Secret이 등록되어 있지 않습니다.' }, corsHeaders, 500);

  try {
    const accessToken = await getGoogleAccessToken(env);
    const apiUrl = `https://www.googleapis.com/blogger/v3/blogs/${env.BLOGGER_BLOG_ID}/posts/?isDraft=true`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content: html, labels })
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(`Blogger API 응답 오류 (status: ${response.status}) ${detail}`);
    }
    const data = await response.json();
    return jsonResponse({ ok: true, mode: 'worker', status: 'draft', postId: data.id || '', title: data.title || title, url: data.url || '', savedAt: new Date().toISOString() }, corsHeaders);
  } catch(e) {
    return jsonResponse({ ok: false, message: 'Blogger 임시저장에 실패했습니다: ' + e.message }, corsHeaders, 502);
  }
}

/* ----------------------------------------------------------
   7. Blogger 예약발행 POST /blogger/schedule
   body: { post: { title, contentHtml, tags }, scheduledAt: "ISO+09:00" }
   ---------------------------------------------------------- */
async function handleBloggerSchedule(request, env, corsHeaders) {
  let payload;
  try { payload = await request.json(); } catch(e) {
    return jsonResponse({ ok: false, message: '요청 본문(JSON)을 읽을 수 없습니다.' }, corsHeaders, 400);
  }

  const post = payload.post || {};
  const title = String(post.title || payload.title || '');
  const html = String(post.contentHtml || post.html || payload.html || payload.contentHtml || '');
  const labels = Array.isArray(post.tags) ? post.tags : (Array.isArray(payload.labels) ? payload.labels : []);
  const qualityScore = typeof payload.qualityScore === 'number' ? payload.qualityScore : 0;
  const scheduledAt = String(payload.scheduledAt || '');

  if (!title || !html) return jsonResponse({ ok: false, message: 'title과 html은 필수입니다.' }, corsHeaders, 400);
  if (!scheduledAt) return jsonResponse({ ok: false, message: 'scheduledAt은 필수입니다.' }, corsHeaders, 400);

  const hasTimezone = /(Z|[+-]\d{2}:\d{2})$/.test(scheduledAt);
  if (!hasTimezone) return jsonResponse({ ok: false, message: 'scheduledAt에 타임존이 포함되어야 합니다. 예: 2026-07-01T09:00:00+09:00' }, corsHeaders, 400);

  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime())) return jsonResponse({ ok: false, message: 'scheduledAt 형식이 올바르지 않습니다.' }, corsHeaders, 400);
  if (scheduledDate.getTime() <= Date.now()) return jsonResponse({ ok: false, message: '예약 시간이 과거이거나 현재 시각 이전입니다.' }, corsHeaders, 400);
  if (qualityScore < 85) return jsonResponse({ ok: false, message: '품질점수가 85점 미만이라 예약발행을 거부했습니다.' }, corsHeaders, 400);
  if (!hasBloggerSecrets(env)) return jsonResponse({ ok: false, message: 'Blogger Secret이 등록되어 있지 않습니다.' }, corsHeaders, 500);

  try {
    const accessToken = await getGoogleAccessToken(env);
    const apiUrl = `https://www.googleapis.com/blogger/v3/blogs/${env.BLOGGER_BLOG_ID}/posts/?isDraft=false`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content: html, labels, published: scheduledAt })
    });
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(`Blogger API 응답 오류 (status: ${response.status}) ${detail}`);
    }
    const data = await response.json();
    return jsonResponse({ ok: true, mode: 'worker', status: 'scheduled', postId: data.id || '', title: data.title || title, url: data.url || '', scheduledAt, savedAt: new Date().toISOString() }, corsHeaders);
  } catch(e) {
    return jsonResponse({ ok: false, message: 'Blogger 예약발행에 실패했습니다: ' + e.message }, corsHeaders, 502);
  }
}

/* ----------------------------------------------------------
   8. Blogger 글 목록 GET /blogger/list
   ---------------------------------------------------------- */
async function handleBloggerList(request, env, corsHeaders) {
  if (!hasBloggerSecrets(env)) return jsonResponse({ ok: false, message: 'Blogger Secret이 등록되어 있지 않습니다.' }, corsHeaders, 500);
  try {
    const accessToken = await getGoogleAccessToken(env);
    const apiUrl = `https://www.googleapis.com/blogger/v3/blogs/${env.BLOGGER_BLOG_ID}/posts?fetchBodies=false&maxResults=10`;
    const response = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(`Blogger API 응답 오류 (status: ${response.status}) ${detail}`);
    }
    const data = await response.json();
    const items = (data.items || []).map(item => ({ postId: item.id || '', title: item.title || '', status: item.status || '', url: item.url || '' }));
    return jsonResponse({ ok: true, mode: 'worker', items }, corsHeaders);
  } catch(e) {
    return jsonResponse({ ok: false, message: 'Blogger 글 목록 조회에 실패했습니다: ' + e.message }, corsHeaders, 502);
  }
}

function jsonResponse(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
