// worker/worker.js — BPW v0.1.0 AI Provider Router
//
// v0.1.0 변경 내용:
//   - AI Provider Router 추가 (Gemini → OpenAI → OpenRouter → Claude 순 fallback)
//   - callGeminiProvider / callOpenAiProvider / callClaudeProvider / callOpenRouterProvider
//   - generateArticleWithRouter: provider 순서대로 시도, 실패 시 다음 provider
//   - normalizeProviderResult: 모든 provider 결과를 동일한 article 구조로 변환
//   - shouldFallbackProvider: fallback 조건 판단
//   - getProviderErrorMessage: provider별 오류 메시지 한국어화
//   - 응답에 providerUsed / providersTried / fallbackUsed / fallbackReason 추가
//   - v0.0.9 기능(네이버 검색 / Blogger / 로그인 / CORS) 전부 유지
//
// Secret 이름 (Cloudflare Worker Secret으로만 등록):
//   [기존 유지]
//   ADMIN_PASSWORD       ← 관리자 로그인 비밀번호
//   SESSION_SECRET       ← 토큰 서명
//   NAVER_CLIENT_ID      ← 네이버 검색
//   NAVER_CLIENT_SECRET  ← 네이버 검색
//   AI_API_KEY           ← Gemini API 키
//   AI_PROVIDER          ← 기본 provider (기본값: gemini)
//   AI_MODEL             ← Gemini 모델 (기본값: gemini-2.5-flash)
//   GOOGLE_CLIENT_ID     ← Blogger OAuth
//   GOOGLE_CLIENT_SECRET ← Blogger OAuth
//   GOOGLE_REFRESH_TOKEN ← Blogger OAuth
//   BLOGGER_BLOG_ID      ← Blogger 블로그 ID
//   [v0.1.0 신규]
//   AI_FALLBACK_ORDER    ← fallback 순서 (기본: gemini,openai,openrouter,claude)
//   OPENAI_API_KEY       ← OpenAI API 키 (없으면 자동 건너뜀)
//   OPENAI_MODEL         ← OpenAI 모델 (기본: gpt-4o-mini)
//   CLAUDE_API_KEY       ← Anthropic Claude API 키 (없으면 자동 건너뜀)
//   CLAUDE_MODEL         ← Claude 모델 (기본: claude-3-haiku-20240307)
//   OPENROUTER_API_KEY   ← OpenRouter API 키 (없으면 자동 건너뜀)
//   OPENROUTER_MODEL     ← OpenRouter 모델 (기본: openai/gpt-4o-mini)
//   DAILY_AI_LIMIT       ← 하루 AI 생성 제한 (기본: 20, KV 없이는 요청 단위 참고만)
//   AI_CACHE_TTL_MINUTES ← 캐시 TTL 분 (v0.1.3 KV 캐시 적용 예정, 현재는 설계만)
//
// ⚠️ 실제 API Key 값은 절대 이 파일에 적지 않습니다.

const WORKER_VERSION = "v0.1.0";

/* ------------------------------------------------------------
   v0.0.9 글 생성 옵션 (유지)
   ------------------------------------------------------------ */
const WORKER_GENERATION_MODES = {
  fast:     { sourceCount: 3, minLength: 800,  maxLength: 1000, faqCount: 2, checklistCount: 3, imageIdeaCount: 1, maxOutputTokens: 2048, label: '빠른 생성' },
  normal:   { sourceCount: 5, minLength: 1200, maxLength: 1500, faqCount: 3, checklistCount: 4, imageIdeaCount: 2, maxOutputTokens: 3200, label: '일반 생성' },
  advanced: { sourceCount: 8, minLength: 2000, maxLength: 3000, faqCount: 5, checklistCount: 5, imageIdeaCount: 3, maxOutputTokens: 3200, label: '고급 생성' }
};

const WORKER_WRITER_PERSONAS = {
  neutral: '성별이 드러나지 않는 중립적인 운영자 어조',
  male:    '남성 운영자 느낌이 자연스럽게 드러나는 어조 (성별 고정관념 표현 금지)',
  female:  '여성 운영자 느낌이 자연스럽게 드러나는 어조 (성별 고정관념 표현 금지)'
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
  few:      '박스 제목에만 절제해서 사용한다',
  moderate: '박스 제목과 문단 한두 곳에 자연스럽게 사용한다'
};

/* ------------------------------------------------------------
   CORS (테스트: *, 운영: GitHub Pages 주소로 제한 권장)
   ------------------------------------------------------------ */
const ALLOWED_ORIGINS = ['*'];

function buildCorsHeaders(request) {
  let allowOrigin = '*';
  if (!ALLOWED_ORIGINS.includes('*')) {
    const origin = request.headers.get('Origin') || '';
    allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

/* ------------------------------------------------------------
   Token (HMAC-SHA256) — v0.0.9 유지
   ------------------------------------------------------------ */
function b64urlEncode(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  bytes.forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str) {
  let padded = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) padded += '=';
  const raw = atob(padded);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

async function makeHmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function createToken(secret, expiresInSeconds) {
  const header  = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now     = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ iat: now, exp: now + expiresInSeconds })));
  const sigInput = header + '.' + payload;
  const key = await makeHmacKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigInput));
  return sigInput + '.' + b64urlEncode(sigBuf);
}

async function verifyToken(token, secret) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return false;
    const sigInput = parts[0] + '.' + parts[1];
    const key = await makeHmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), new TextEncoder().encode(sigInput));
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return false;
    return true;
  } catch(e) { return false; }
}

async function checkAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  if (!token || !env.SESSION_SECRET) return false;
  return verifyToken(token, env.SESSION_SECRET);
}

/* ------------------------------------------------------------
   Router
   ------------------------------------------------------------ */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = buildCorsHeaders(request);

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    // 인증 불필요
    if (url.pathname === '/health')     return handleHealth(request, env, corsHeaders);
    if (url.pathname === '/auth/login' || url.pathname === '/login')
                                        return handleAuthLogin(request, env, corsHeaders);

    // 네이버 검색 다중 경로
    const naverPaths = new Set(['/search/naver','/naver/search','/api/search/naver','/api/naver/search','/keyword/search','/keywords/search']);
    if (naverPaths.has(url.pathname)) {
      const authed = await checkAuth(request, env);
      if (!authed) return jsonResponse({ ok: false, message: '인증이 필요합니다.' }, corsHeaders, 401);
      return handleSearchNaver(request, env, corsHeaders);
    }

    // AI 생성 다중 경로
    const aiPaths = new Set(['/ai/generate','/generate','/api/ai/generate','/api/generate']);
    if (aiPaths.has(url.pathname)) {
      const authed = await checkAuth(request, env);
      if (!authed) return jsonResponse({ ok: false, message: '인증이 필요합니다.' }, corsHeaders, 401);
      return handleAiGenerate(request, env, corsHeaders);
    }

    // 나머지 경로: 인증 필요
    const authed = await checkAuth(request, env);
    if (!authed) return jsonResponse({ ok: false, message: '인증이 필요합니다.' }, corsHeaders, 401);

    const routes = {
      '/blogger/status':   handleBloggerStatus,
      '/blogger/check':    handleBloggerStatus,
      '/blogger/connect':  handleBloggerStatus,
      '/api/blogger/status': handleBloggerStatus,
      '/blogger/post':     handleBloggerPost,
      '/blogger/create':   handleBloggerPost,
      '/blogger/draft':    handleBloggerPost,
      '/blogger/publish':  handleBloggerPost,
      '/api/blogger/post': handleBloggerPost,
      '/blogger/schedule': handleBloggerSchedule,
      '/blogger/scheduled':handleBloggerSchedule,
      '/api/blogger/schedule': handleBloggerSchedule,
      '/blogger/list':     handleBloggerList,
      '/blogger/posts':    handleBloggerList,
      '/api/blogger/list': handleBloggerList
    };

    const handler = routes[url.pathname];
    if (!handler) return jsonResponse({ ok: false, message: '존재하지 않는 경로입니다.', path: url.pathname }, corsHeaders, 404);
    return handler(request, env, corsHeaders);
  }
};

/* ----------------------------------------------------------
   Health
   ---------------------------------------------------------- */
async function handleHealth(request, env, corsHeaders) {
  return jsonResponse({
    ok: true, mode: 'worker', version: WORKER_VERSION,
    message: 'BPW Worker is running',
    aiProviders: {
      gemini:     !!env.AI_API_KEY,
      openai:     !!env.OPENAI_API_KEY,
      claude:     !!env.CLAUDE_API_KEY,
      openrouter: !!env.OPENROUTER_API_KEY
    },
    fallbackOrder: parseFallbackOrder(env)
  }, corsHeaders);
}

/* ----------------------------------------------------------
   Login
   ---------------------------------------------------------- */
async function handleAuthLogin(request, env, corsHeaders) {
  let body;
  try { body = await request.json(); } catch(e) {
    return jsonResponse({ ok: false, message: '요청 본문(JSON)을 읽을 수 없습니다.' }, corsHeaders, 400);
  }
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return jsonResponse({ ok: false, message: 'ADMIN_PASSWORD 또는 SESSION_SECRET이 등록되어 있지 않습니다.' }, corsHeaders, 500);
  }
  const inputPw = body && body.password ? String(body.password) : '';
  if (!inputPw) return jsonResponse({ ok: false, message: '비밀번호가 비어 있습니다.' }, corsHeaders, 400);
  if (inputPw !== env.ADMIN_PASSWORD) return jsonResponse({ ok: false, message: '비밀번호가 올바르지 않습니다.' }, corsHeaders, 401);
  const token = await createToken(env.SESSION_SECRET, 43200);
  return jsonResponse({ ok: true, mode: 'worker', version: WORKER_VERSION, token, expiresIn: 43200, message: '로그인 성공' }, corsHeaders);
}

/* ----------------------------------------------------------
   Naver Search
   ---------------------------------------------------------- */
async function handleSearchNaver(request, env, corsHeaders) {
  const url = new URL(request.url);
  let body = {};
  try { if (request.method !== 'GET') body = await request.json(); } catch(e) {}

  const keyword = String(
    body.keyword || body.query || body.q || body.term ||
    url.searchParams.get('keyword') || url.searchParams.get('query') || url.searchParams.get('q') || ''
  ).trim();

  if (!keyword) return jsonResponse({ ok: false, message: '검색어가 비어 있습니다.' }, corsHeaders, 400);
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    return jsonResponse({ ok: false, message: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 등록되어 있지 않습니다.' }, corsHeaders, 500);
  }

  const naverHeaders = { 'X-Naver-Client-Id': env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET };

  const results = await Promise.allSettled([
    fetchNaverSearch('blog', keyword, naverHeaders),
    fetchNaverSearch('webkr', keyword, naverHeaders)
  ]);

  const blogItems = [], webItems = [], errors = [];
  if (results[0].status === 'fulfilled') {
    (results[0].value.items || []).forEach(item => blogItems.push({
      type: 'blog', source: 'blog',
      title: stripNaverTags(item.title), description: stripNaverTags(item.description),
      link: item.link || '', postdate: item.postdate || ''
    }));
  } else {
    errors.push({ type: 'blog', message: String(results[0].reason?.message || results[0].reason) });
  }
  if (results[1].status === 'fulfilled') {
    (results[1].value.items || []).forEach(item => webItems.push({
      type: 'web', source: 'web',
      title: stripNaverTags(item.title), description: stripNaverTags(item.description),
      link: item.link || ''
    }));
  } else {
    errors.push({ type: 'webkr', message: String(results[1].reason?.message || results[1].reason) });
  }

  const items = [...blogItems, ...webItems];
  if (!items.length) return jsonResponse({ ok: false, message: '네이버 검색이 모두 실패했습니다.', keyword, errors }, corsHeaders, 502);

  return jsonResponse({
    ok: true, mode: 'worker', source: 'naver', version: WORKER_VERSION,
    keyword, query: keyword,
    items, results: items, data: items,
    blog: blogItems, web: webItems, naver: items,
    blogItems, webItems,
    total: items.length, count: items.length,
    warning: errors.length ? '일부 검색 타입이 실패했지만 성공한 결과를 사용합니다.' : '',
    errors
  }, corsHeaders);
}

async function fetchNaverSearch(type, keyword, naverHeaders) {
  const apiUrl = `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(keyword)}&display=10&sort=sim`;
  const response = await fetch(apiUrl, { headers: naverHeaders });
  if (!response.ok) {
    const detail = await readErrorDetail(response, naverHeaders['X-Naver-Client-Secret']);
    throw new Error(`네이버 ${type} 오류 (${response.status}) ${detail}`);
  }
  return response.json();
}

function stripNaverTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/* ============================================================
   AI Provider Router — v0.1.0 핵심
   ============================================================ */

/* ----------------------------------------------------------
   AI Generate 엔드포인트 진입점
   ---------------------------------------------------------- */
async function handleAiGenerate(request, env, corsHeaders) {
  let payload;
  try { payload = await request.json(); } catch(e) {
    return jsonResponse({ ok: false, message: '요청 본문(JSON)을 읽을 수 없습니다.' }, corsHeaders, 400);
  }

  const keyword = String(payload.keyword || payload.query || payload.q || payload.term || payload.title || payload.topic || '').trim();
  if (!keyword) return jsonResponse({ ok: false, message: 'keyword 값이 비어 있습니다.' }, corsHeaders, 400);

  // fallback order 결정
  const fallbackOrder = parseFallbackOrder(env);

  // 사용 가능한 provider가 하나도 없으면 바로 오류
  const available = fallbackOrder.filter(p => hasProviderKey(p, env));
  if (!available.length) {
    return jsonResponse({
      ok: false,
      message: '사용 가능한 AI API Key가 없습니다. Cloudflare Worker Secret에 AI_API_KEY(Gemini) 또는 OPENAI_API_KEY 등을 등록해주세요.',
      fallbackOrder
    }, corsHeaders, 500);
  }

  const material  = payload.material || payload.materials || {};
  const sources   = collectSources(payload);
  const modeKey   = WORKER_GENERATION_MODES[payload.mode] ? payload.mode : 'normal';
  const modeConfig = WORKER_GENERATION_MODES[modeKey];
  const personaKey = WORKER_WRITER_PERSONAS[payload.persona] ? payload.persona : 'neutral';
  const toneKey    = WORKER_WRITING_TONES[payload.tone]     ? payload.tone    : 'friendly';
  const emojiKey   = WORKER_EMOJI_LEVELS[payload.emoji]     ? payload.emoji   : 'few';

  const prompt = buildArticlePrompt(keyword, material, sources.slice(0, modeConfig.sourceCount), modeConfig, personaKey, toneKey, emojiKey);

  const routerResult = await generateArticleWithRouter(prompt, modeConfig, env, fallbackOrder);

  if (!routerResult.ok) {
    return jsonResponse({
      ok: false,
      message: routerResult.message || 'AI 글 생성에 모두 실패했습니다.',
      providersTried: routerResult.providersTried || [],
      errors: routerResult.errors || []
    }, corsHeaders, 502);
  }

  const article = normalizeProviderResult(routerResult.raw, keyword);

  return jsonResponse({
    ok: true, mode: 'worker', version: WORKER_VERSION,
    message: 'AI 글 생성 완료',
    // Provider 정보
    provider:       routerResult.providerUsed,
    model:          routerResult.model,
    providerUsed:   routerResult.providerUsed,
    providersTried: routerResult.providersTried,
    fallbackUsed:   routerResult.fallbackUsed,
    fallbackReason: routerResult.fallbackReason || null,
    sourcesUsed:    sources.length,
    // 글 필드 (v0.0.9 호환 유지)
    title:          article.title,
    html:           article.html,
    contentHtml:    article.html,
    content:        article.content,
    summary:        article.summary,
    metaDescription:article.metaDescription,
    labels:         article.labels,
    faq:            article.faq,
    // 구조화 응답
    article, post: article, data: article, result: article
  }, corsHeaders);
}

/* ----------------------------------------------------------
   Provider Fallback 순서 파싱
   ---------------------------------------------------------- */
function parseFallbackOrder(env) {
  const raw = String(env.AI_FALLBACK_ORDER || 'gemini,openai,openrouter,claude').trim();
  const order = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  // 기본 provider(AI_PROVIDER)가 맨 앞에 오도록
  const primary = String(env.AI_PROVIDER || 'gemini').trim().toLowerCase();
  const deduped = [primary, ...order.filter(p => p !== primary)];
  return [...new Set(deduped)]; // 중복 제거
}

/* ----------------------------------------------------------
   Provider별 API Key 존재 여부
   ---------------------------------------------------------- */
function hasProviderKey(provider, env) {
  if (provider === 'gemini')     return !!env.AI_API_KEY;
  if (provider === 'openai')     return !!env.OPENAI_API_KEY;
  if (provider === 'claude')     return !!env.CLAUDE_API_KEY;
  if (provider === 'openrouter') return !!env.OPENROUTER_API_KEY;
  return false;
}

/* ----------------------------------------------------------
   generateArticleWithRouter — 핵심 Router 함수
   fallback 순서대로 provider를 시도하고,
   성공한 provider 결과를 반환합니다.
   ---------------------------------------------------------- */
async function generateArticleWithRouter(prompt, modeConfig, env, fallbackOrder) {
  const providersTried = [];
  const errors = [];
  let fallbackReason = null;

  for (const provider of fallbackOrder) {
    if (!hasProviderKey(provider, env)) {
      // API Key 없으면 조용히 건너뜀
      continue;
    }

    providersTried.push(provider);

    let result;
    try {
      if (provider === 'gemini')     result = await callGeminiProvider(prompt, modeConfig, env);
      else if (provider === 'openai')     result = await callOpenAiProvider(prompt, modeConfig, env);
      else if (provider === 'claude')     result = await callClaudeProvider(prompt, modeConfig, env);
      else if (provider === 'openrouter') result = await callOpenRouterProvider(prompt, modeConfig, env);
      else continue;
    } catch(e) {
      const errMsg = String(e?.message || e);
      errors.push({ provider, message: errMsg });
      if (providersTried.length === 1) fallbackReason = getProviderErrorMessage(provider, 0, errMsg);
      continue;
    }

    if (!result.ok) {
      errors.push({ provider, status: result.status, message: result.message });
      // fallback 여부 결정
      if (shouldFallbackProvider(result.status)) {
        if (providersTried.length === 1) fallbackReason = getProviderErrorMessage(provider, result.status, result.message);
        continue; // 다음 provider 시도
      } else {
        // fallback하지 않고 즉시 반환 (인증 오류 등 → 다음 provider에 key가 있으면 계속)
        if (!hasAnyRemainingProvider(provider, fallbackOrder, env)) {
          return { ok: false, message: result.message, providersTried, errors };
        }
        if (providersTried.length === 1) fallbackReason = getProviderErrorMessage(provider, result.status, result.message);
        continue;
      }
    }

    // 성공
    return {
      ok: true,
      providerUsed: provider,
      providersTried,
      fallbackUsed: providersTried.length > 1,
      fallbackReason: providersTried.length > 1 ? fallbackReason : null,
      model: result.model,
      raw: result.raw
    };
  }

  // 모든 provider 실패
  return {
    ok: false,
    message: `모든 AI provider(${providersTried.join(', ') || '없음'})에서 글 생성에 실패했습니다. 각 provider의 API Key와 쿼터를 확인해주세요.`,
    providersTried,
    errors
  };
}

/* ----------------------------------------------------------
   Fallback 조건 판단
   ---------------------------------------------------------- */
function shouldFallbackProvider(status) {
  if (!status) return true;     // fetch 자체 실패 → fallback
  if (status === 429) return true;  // 쿼터 초과 → fallback
  if (status >= 500)  return true;  // 서버 오류 → fallback
  // 401/403: key 문제일 수 있어 caller에서 다음 provider를 시도하게 함
  return false;
}

function hasAnyRemainingProvider(currentProvider, fallbackOrder, env) {
  const idx = fallbackOrder.indexOf(currentProvider);
  return fallbackOrder.slice(idx + 1).some(p => hasProviderKey(p, env));
}

/* ----------------------------------------------------------
   Provider별 오류 메시지 한국어화
   ---------------------------------------------------------- */
function getProviderErrorMessage(provider, status, rawMsg) {
  const name = { gemini: 'Gemini', openai: 'OpenAI', claude: 'Claude', openrouter: 'OpenRouter' }[provider] || provider;
  if (status === 429) return `${name} 무료 사용량 또는 쿼터를 초과했습니다.`;
  if (status === 401) return `${name} API 키 인증에 실패했습니다.`;
  if (status === 403) return `${name} API 키 권한 또는 프로젝트 제한 문제입니다.`;
  if (status === 404) return `${name} 모델명을 확인해야 합니다.`;
  if (status >= 500)  return `${name} 서버 일시 오류입니다.`;
  if (!status)        return `${name} 연결에 실패했습니다.`;
  return `${name} 오류 (${status})`;
}

/* ----------------------------------------------------------
   callGeminiProvider
   ---------------------------------------------------------- */
async function callGeminiProvider(prompt, modeConfig, env) {
  const model = String(env.AI_MODEL || 'gemini-2.5-flash').trim();
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.AI_API_KEY)}`;

  let response, responseText;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.68, topP: 0.9, maxOutputTokens: modeConfig.maxOutputTokens }
      })
    });
    responseText = await response.text();
  } catch(e) {
    return { ok: false, status: 0, message: 'Gemini fetch 실패: ' + String(e?.message || e) };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, message: getProviderErrorMessage('gemini', response.status, responseText) };
  }

  let data;
  try { data = JSON.parse(responseText); } catch(e) {
    return { ok: false, status: 200, message: 'Gemini 응답 JSON 파싱 실패' };
  }

  const text = extractGeminiText(data);
  if (!text) return { ok: false, status: 200, message: 'Gemini 응답에서 텍스트를 찾을 수 없습니다.' };

  return { ok: true, model, raw: text };
}

function extractGeminiText(data) {
  try {
    return (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n').trim();
  } catch(e) { return ''; }
}

/* ----------------------------------------------------------
   callOpenAiProvider
   ---------------------------------------------------------- */
async function callOpenAiProvider(prompt, modeConfig, env) {
  const model = String(env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  let response, responseText;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.68,
        max_tokens: modeConfig.maxOutputTokens,
        response_format: { type: 'json_object' }
      })
    });
    responseText = await response.text();
  } catch(e) {
    return { ok: false, status: 0, message: 'OpenAI fetch 실패: ' + String(e?.message || e) };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, message: getProviderErrorMessage('openai', response.status, responseText) };
  }

  let data;
  try { data = JSON.parse(responseText); } catch(e) {
    return { ok: false, status: 200, message: 'OpenAI 응답 JSON 파싱 실패' };
  }

  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) return { ok: false, status: 200, message: 'OpenAI 응답에서 텍스트를 찾을 수 없습니다.' };

  return { ok: true, model, raw: text };
}

/* ----------------------------------------------------------
   callClaudeProvider (Anthropic)
   ---------------------------------------------------------- */
async function callClaudeProvider(prompt, modeConfig, env) {
  const model = String(env.CLAUDE_MODEL || 'claude-3-haiku-20240307').trim();
  let response, responseText;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: modeConfig.maxOutputTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    responseText = await response.text();
  } catch(e) {
    return { ok: false, status: 0, message: 'Claude fetch 실패: ' + String(e?.message || e) };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, message: getProviderErrorMessage('claude', response.status, responseText) };
  }

  let data;
  try { data = JSON.parse(responseText); } catch(e) {
    return { ok: false, status: 200, message: 'Claude 응답 JSON 파싱 실패' };
  }

  const text = (data?.content || []).map(b => b.text || '').join('\n').trim();
  if (!text) return { ok: false, status: 200, message: 'Claude 응답에서 텍스트를 찾을 수 없습니다.' };

  return { ok: true, model, raw: text };
}

/* ----------------------------------------------------------
   callOpenRouterProvider
   ---------------------------------------------------------- */
async function callOpenRouterProvider(prompt, modeConfig, env) {
  const model = String(env.OPENROUTER_MODEL || 'openai/gpt-4o-mini').trim();
  let response, responseText;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://woo8484.github.io/wooow/',
        'X-Title': 'BPW Blog Writer'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.68,
        max_tokens: modeConfig.maxOutputTokens
      })
    });
    responseText = await response.text();
  } catch(e) {
    return { ok: false, status: 0, message: 'OpenRouter fetch 실패: ' + String(e?.message || e) };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, message: getProviderErrorMessage('openrouter', response.status, responseText) };
  }

  let data;
  try { data = JSON.parse(responseText); } catch(e) {
    return { ok: false, status: 200, message: 'OpenRouter 응답 JSON 파싱 실패' };
  }

  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) return { ok: false, status: 200, message: 'OpenRouter 응답에서 텍스트를 찾을 수 없습니다.' };

  return { ok: true, model, raw: text };
}

/* ----------------------------------------------------------
   normalizeProviderResult
   모든 provider 결과를 동일한 article 구조로 변환
   ---------------------------------------------------------- */
function normalizeProviderResult(rawText, keyword) {
  const parsed = parseAiJsonLoose(rawText);

  let title = '', html = '', summary = '', metaDescription = '';
  let labels = [], faq = [], checklist = [], imageIdeas = [], sources = [];

  if (parsed) {
    title           = String(parsed.title || parsed.subject || `${keyword} 정리`).trim();
    html            = String(parsed.html || parsed.contentHtml || parsed.content || parsed.body || '').trim();
    summary         = String(parsed.summary || parsed.description || '').trim();
    metaDescription = String(parsed.metaDescription || parsed.meta || summary).slice(0, 180);
    labels          = Array.isArray(parsed.labels) ? parsed.labels : Array.isArray(parsed.tags) ? parsed.tags : [];
    faq             = Array.isArray(parsed.faq) ? parsed.faq : [];
    checklist       = Array.isArray(parsed.checklist) ? parsed.checklist : [];
    imageIdeas      = Array.isArray(parsed.imageIdeas) ? parsed.imageIdeas : [];
    sources         = Array.isArray(parsed.sources) ? parsed.sources : [];
  } else {
    // JSON 파싱 실패 → rawText 자체를 HTML로 변환
    title           = `${keyword} 정리`;
    html            = textToHtml(rawText, keyword);
    summary         = `${keyword}에 대한 핵심 내용을 정리했습니다.`;
    metaDescription = summary;
  }

  if (!title) title = `${keyword} 정리`;
  if (!summary) summary = `${keyword}에 대한 핵심 내용을 정리했습니다.`;
  if (!html) html = textToHtml(rawText, keyword);
  if (!labels.length) labels = [keyword, '정보', '생활정보'].filter(Boolean);

  // HTML 구조 보완 (품질검수 대응)
  html = ensureQualityHtml(html, keyword, sources, faq);
  const content = stripHtmlTags(html);

  return { title, html, contentHtml: html, content, summary, metaDescription, labels, faq, checklist, imageIdeas, sources };
}

function parseAiJsonLoose(text) {
  const cleaned = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(cleaned); } catch(e) {}
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch(e) {}
  }
  return null;
}

function stripHtmlTags(html) {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

function textToHtml(text, keyword) {
  const lines = String(text || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  const body = lines.map(line => {
    if (line.startsWith('### ')) return `<h3>${escapeBasicHtml(line.slice(4))}</h3>`;
    if (line.startsWith('## '))  return `<h2>${escapeBasicHtml(line.slice(3))}</h2>`;
    if (line.startsWith('# '))   return `<h2>${escapeBasicHtml(line.slice(2))}</h2>`;
    return `<p>${escapeBasicHtml(line)}</p>`;
  }).join('\n');
  return `<div class="bpw-post">\n<h2>핵심 요약</h2>\n${body}\n</div>`;
}

function escapeBasicHtml(v) {
  return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

/* ----------------------------------------------------------
   ensureQualityHtml — 품질검수 대응 섹션 보완 (v0.0.9 유지)
   ---------------------------------------------------------- */
function ensureQualityHtml(html, keyword, sources, faq) {
  let out = String(html || '').trim();
  if (!out) out = `<h2>핵심 요약</h2><p>${escapeBasicHtml(keyword)} 관련 핵심 정보를 정리했습니다.</p>`;

  const addIfMissing = (pattern, block) => {
    if (!pattern.test(out)) out += block;
  };

  addIfMissing(/<h2[^>]*>\s*핵심 요약\s*<\/h2>/i,
    `<h2>핵심 요약</h2><p>${escapeBasicHtml(keyword)} 관련 핵심 흐름과 확인 포인트를 먼저 정리했습니다.</p>`);
  addIfMissing(/<h2[^>]*>\s*최신정보\s*<\/h2>/i,
    `<h2>최신정보</h2><p>${escapeBasicHtml(keyword)} 관련 정보는 시점에 따라 달라질 수 있으므로 최근 자료를 함께 확인하세요.</p>`);
  addIfMissing(/<h2[^>]*>\s*실제 사례\s*<\/h2>/i,
    `<h2>실제 사례</h2><p>${escapeBasicHtml(keyword)} 관련 실제 적용 상황, 주의사항, 확인 절차를 함께 살펴봅니다.</p>`);
  addIfMissing(/<table[\s>]/i,
    `<h2>비교 표</h2><table><thead><tr><th>항목</th><th>내용</th><th>확인 포인트</th></tr></thead><tbody><tr><td>핵심 정보</td><td>${escapeBasicHtml(keyword)} 주요 내용</td><td>최신 자료와 비교</td></tr></tbody></table>`);
  addIfMissing(/<h2[^>]*>\s*체크리스트\s*<\/h2>/i,
    `<h2>체크리스트</h2><ul><li>최신 정보인지 확인하기</li><li>공식 출처와 비교하기</li><li>내 상황에 적용되는지 확인하기</li></ul>`);
  addIfMissing(/<h2[^>]*>\s*FAQ\s*<\/h2>/i,
    buildFaqHtml(faq, keyword));
  addIfMissing(/<h2[^>]*>\s*결론\s*<\/h2>/i,
    `<h2>결론</h2><p>${escapeBasicHtml(keyword)}는 최신 자료, 실제 사례, 조건별 차이를 함께 확인하는 것이 중요합니다.</p>`);
  addIfMissing(/<h2[^>]*>\s*출처\s*<\/h2>/i,
    buildSourceHtml(sources));
  addIfMissing(/이미지.*설명|alt/i,
    `<p><strong>이미지 설명(alt):</strong> ${escapeBasicHtml(keyword)} 관련 핵심 내용 정보 이미지</p>`);

  return out;
}

function buildFaqHtml(faq, keyword) {
  if (Array.isArray(faq) && faq.length > 0) {
    return `<h2>FAQ</h2>` + faq.slice(0, 3).map(x =>
      `<h3>${escapeBasicHtml(x.q||x.question||'질문')}</h3><p>${escapeBasicHtml(x.a||x.answer||'')}</p>`
    ).join('');
  }
  return `<h2>FAQ</h2><h3>${escapeBasicHtml(keyword)}는 어디서 확인하나요?</h3><p>공식 안내와 최근 검색 자료를 함께 확인하는 것이 좋습니다.</p><h3>정보가 자주 바뀌나요?</h3><p>시점에 따라 달라질 수 있으므로 최신 자료를 확인하세요.</p><h3>가장 먼저 확인할 것은?</h3><p>내 상황에 적용되는 조건과 최신 기준을 먼저 확인하는 것이 좋습니다.</p>`;
}

function buildSourceHtml(sources) {
  const valid = Array.isArray(sources) ? sources.filter(s => s.title || s.link) : [];
  if (!valid.length) return `<h2>출처 및 참고자료</h2><p>참고자료가 부족합니다. 추가 확인이 필요합니다.</p>`;
  const items = valid.slice(0, 5).map(s => {
    const title = escapeBasicHtml(s.title || s.link || '참고자료');
    const link  = escapeBasicHtml(s.link || '');
    return link ? `<li><a href="${link}" target="_blank" rel="noopener noreferrer">${title}</a></li>` : `<li>${title}</li>`;
  }).join('');
  return `<h2>출처 및 참고자료</h2><ul>${items}</ul>`;
}

/* ----------------------------------------------------------
   selectAiSources — 네이버 결과에서 AI 전달용 8건 선별
   ---------------------------------------------------------- */
function collectSources(payload) {
  const candidates = [];
  const arrays = [payload.sources, payload.items, payload.results, payload.blog, payload.web, payload.naverItems];
  arrays.forEach(arr => { if (Array.isArray(arr)) candidates.push(...arr); });
  if (payload.blog?.items) candidates.push(...payload.blog.items);
  if (payload.web?.items)  candidates.push(...payload.web.items);

  const seen = new Set();
  return candidates.filter(Boolean).map((x, i) => {
    const type = String(x.type || x.source || (x.link?.includes('blog.naver.com') ? 'blog' : 'web'));
    return { index: i+1, type, source: type, title: stripHtmlTags(x.title||''), description: stripHtmlTags(x.description||x.summary||''), link: x.link||x.url||'' };
  }).filter(x => x.title || x.description || x.link).filter(x => {
    const key = x.link || `${x.title}:${x.description}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function selectAiSources(allSources) {
  const blog = allSources.filter(s => s.type === 'blog' || s.source === 'blog');
  const web  = allSources.filter(s => s.type === 'web'  || s.source === 'web' || s.type === 'webkr');
  const selected = [...blog.slice(0, 4), ...web.slice(0, 4)];
  if (selected.length < 8) {
    for (const item of allSources) {
      if (selected.length >= 8) break;
      if (!selected.some(s => (s.link||s.title) === (item.link||item.title))) selected.push(item);
    }
  }
  return selected.slice(0, 8);
}

/* ----------------------------------------------------------
   buildArticlePrompt — 글 생성 프롬프트
   ---------------------------------------------------------- */
function buildArticlePrompt(keyword, material, allSources, modeConfig, personaKey, toneKey, emojiKey) {
  const sources = selectAiSources(allSources);
  const materialLines = Object.keys(material||{}).filter(k=>material[k]).map(k=>`- ${k}: ${material[k]}`).join('\n');
  const hasRealExp = !!(material && material.situation);
  const sourceLines = sources.map(s=>`- [${s.type==='blog'?'블로그':'웹문서'}] ${s.title}\n  요약: ${s.description}`).join('\n');
  const personaText = WORKER_WRITER_PERSONAS[personaKey] || WORKER_WRITER_PERSONAS.neutral;
  const toneText    = WORKER_WRITING_TONES[toneKey]     || WORKER_WRITING_TONES.friendly;
  const emojiText   = WORKER_EMOJI_LEVELS[emojiKey]     || WORKER_EMOJI_LEVELS.few;

  return `당신은 한국어 BlogSpot 수익형 블로그 글 작성 전문가입니다.

키워드: ${keyword}

[글쓰기 스타일]
- 글쓴이 느낌: ${personaText}
- 작성 톤: ${toneText}
- 이모티콘 사용: ${emojiText}
- 성별 고정관념 표현은 절대 사용하지 마세요.

[중요 기준]
- 구글 SEO와 네이버 웹문서 노출을 함께 고려합니다.
- 본문은 ${modeConfig.minLength}~${modeConfig.maxLength}자 정도의 정보형 글로 작성합니다.
- 과장하지 말고 광고 친화적인 안전한 문장으로 작성하세요.
- ${hasRealExp ? '사용자가 입력한 실제 경험이 있습니다. 아래 재료에 적힌 내용만 실제 경험으로 다루세요.' : '1인칭 실제 경험 표현은 사용하지 마세요.'}

[글 재료]
${materialLines || '(없음)'}

[참고자료 — 최대 ${sources.length}건]
${sourceLines || '(없음)'}

[본문 HTML 필수 섹션]
<h2>핵심 요약</h2> / <h2>최신정보</h2> / <h2>실제 사례</h2>
<h2>비교 표</h2> + <table> / <h2>체크리스트</h2> + <ul><li>
<h2>FAQ</h2> (${modeConfig.faqCount}개 이상) / <h2>결론</h2>
<h2>출처 및 참고자료</h2> / <p><strong>이미지 설명(alt):</strong> ...</p>

[출력 형식 — JSON만 반환]
{
  "title": "SEO 제목",
  "summary": "핵심 요약 1~2문장",
  "metaDescription": "150자 안팎 메타 설명",
  "labels": ["태그1","태그2","태그3"],
  "html": "전체 본문 HTML",
  "content": "HTML 태그 없는 텍스트",
  "faq": [{"q":"질문","a":"답변"}],
  "checklist": ["항목1","항목2"],
  "imageIdeas": [{"purpose":"대표 이미지","description":"설명","alt":"대체텍스트"}],
  "sources": [{"type":"blog","title":"출처 제목"}]
}`;
}

/* ----------------------------------------------------------
   Blogger 함수들 (v0.0.9 유지)
   ---------------------------------------------------------- */
function hasBloggerSecrets(env) {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN && env.BLOGGER_BLOG_ID);
}

async function getGoogleAccessToken(env) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token'
    })
  });
  if (!response.ok) throw new Error(`Google OAuth 실패 (${response.status})`);
  const data = await response.json();
  if (!data.access_token) throw new Error('access_token 없음');
  return data.access_token;
}

async function handleBloggerStatus(request, env, corsHeaders) {
  if (!hasBloggerSecrets(env)) return jsonResponse({ ok: false, connected: false, configured: false, blogExists: false, message: 'Blogger Secret이 없습니다.' }, corsHeaders);
  try {
    const accessToken = await getGoogleAccessToken(env);
    const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(env.BLOGGER_BLOG_ID)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`블로그 조회 실패 (${res.status})`);
    const blog = await res.json();
    return jsonResponse({ ok: true, connected: true, configured: true, blogExists: true, mode: 'worker', version: WORKER_VERSION, blog, blogId: blog.id||env.BLOGGER_BLOG_ID, blogName: blog.name||'', blogUrl: blog.url||'', message: 'Blogger 연결됨' }, corsHeaders);
  } catch(e) {
    return jsonResponse({ ok: false, connected: false, configured: false, blogExists: false, message: 'Blogger 확인 실패: ' + e.message }, corsHeaders, 502);
  }
}

async function handleBloggerPost(request, env, corsHeaders) {
  const body = await readJson(request);
  const blogId = String(env.BLOGGER_BLOG_ID || '');
  if (!blogId) return jsonResponse({ ok: false, message: 'BLOGGER_BLOG_ID가 없습니다.' }, corsHeaders, 500);

  const post   = body.post || {};
  const title  = String(post.title || body.title || '제목 없음');
  let   html   = String(post.contentHtml || post.html || post.content || body.html || body.contentHtml || body.content || '');
  const labels = normalizeLabels(post.labels || post.tags || body.labels || body.tags || []);
  const qualityScore = typeof body.qualityScore === 'number' ? body.qualityScore : 0;
  const path = new URL(request.url).pathname;
  const isDraft = !path.includes('publish');

  if (!html) return jsonResponse({ ok: false, message: '저장할 본문이 없습니다.' }, corsHeaders, 400);
  if (isDraft && qualityScore < 50) return jsonResponse({ ok: false, message: `품질점수 ${qualityScore}점: 임시저장은 50점 이상 필요합니다.` }, corsHeaders, 400);
  if (!hasBloggerSecrets(env)) return jsonResponse({ ok: false, message: 'Blogger Secret이 없습니다.' }, corsHeaders, 500);

  try {
    const accessToken = await getGoogleAccessToken(env);
    const apiUrl = `https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts/?isDraft=${isDraft}`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'blogger#post', title, content: html, labels })
    });
    if (!res.ok) throw new Error(`Blogger 저장 실패 (${res.status})`);
    const saved = await res.json();
    return jsonResponse({ ok: true, mode: 'worker', version: WORKER_VERSION, message: isDraft ? 'Blogger 임시저장 완료' : 'Blogger 발행 완료', draft: isDraft, post: saved, id: saved.id, url: saved.url }, corsHeaders);
  } catch(e) {
    return jsonResponse({ ok: false, message: e.message }, corsHeaders, 502);
  }
}

async function handleBloggerSchedule(request, env, corsHeaders) {
  const body = await readJson(request);
  const blogId = String(env.BLOGGER_BLOG_ID || '');
  if (!blogId) return jsonResponse({ ok: false, message: 'BLOGGER_BLOG_ID가 없습니다.' }, corsHeaders, 500);

  const post   = body.post || {};
  const title  = String(post.title || body.title || '제목 없음');
  const html   = String(post.contentHtml || post.html || post.content || body.html || body.contentHtml || body.content || '');
  const labels = normalizeLabels(post.labels || post.tags || body.labels || body.tags || []);
  const qualityScore = typeof body.qualityScore === 'number' ? body.qualityScore : 0;
  const scheduledAt  = String(body.scheduledAt || body.scheduledTime || '');

  if (!html) return jsonResponse({ ok: false, message: '저장할 본문이 없습니다.' }, corsHeaders, 400);
  if (!scheduledAt) return jsonResponse({ ok: false, message: 'scheduledAt이 필요합니다. (예: 2026-07-01T09:00:00+09:00)' }, corsHeaders, 400);
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(scheduledAt)) return jsonResponse({ ok: false, message: 'scheduledAt에 타임존이 필요합니다.' }, corsHeaders, 400);
  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime())) return jsonResponse({ ok: false, message: 'scheduledAt 날짜 형식 오류.' }, corsHeaders, 400);
  if (scheduledDate.getTime() <= Date.now()) return jsonResponse({ ok: false, message: '예약 시간이 과거입니다.' }, corsHeaders, 400);
  if (qualityScore < 70) return jsonResponse({ ok: false, message: `품질점수 ${qualityScore}점: 예약발행은 70점 이상 필요합니다.` }, corsHeaders, 400);
  if (!hasBloggerSecrets(env)) return jsonResponse({ ok: false, message: 'Blogger Secret이 없습니다.' }, corsHeaders, 500);

  try {
    const accessToken = await getGoogleAccessToken(env);
    const apiUrl = `https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts/?isDraft=false`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'blogger#post', title, content: html, labels, published: scheduledAt })
    });
    if (!res.ok) throw new Error(`Blogger 예약발행 실패 (${res.status})`);
    const saved = await res.json();
    return jsonResponse({ ok: true, mode: 'worker', version: WORKER_VERSION, message: 'Blogger 예약발행 완료', draft: false, scheduled: true, scheduledAt, post: saved, id: saved.id, url: saved.url }, corsHeaders);
  } catch(e) {
    return jsonResponse({ ok: false, message: e.message }, corsHeaders, 502);
  }
}

async function handleBloggerList(request, env, corsHeaders) {
  if (!hasBloggerSecrets(env)) return jsonResponse({ ok: false, message: 'Blogger Secret이 없습니다.' }, corsHeaders, 500);
  try {
    const accessToken = await getGoogleAccessToken(env);
    const authHeader = { Authorization: `Bearer ${accessToken}` };
    const base = `https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(env.BLOGGER_BLOG_ID)}/posts`;
    const [draftRes, liveRes] = await Promise.allSettled([
      fetch(`${base}?status=draft&maxResults=10&fetchBodies=false`, { headers: authHeader }),
      fetch(`${base}?status=LIVE&maxResults=10&fetchBodies=false`,  { headers: authHeader })
    ]);
    const parseItems = async (settled) => {
      if (settled.status !== 'fulfilled' || !settled.value.ok) return [];
      try { return (await settled.value.json()).items || []; } catch(_) { return []; }
    };
    const drafts = await parseItems(draftRes);
    const lives  = await parseItems(liveRes);
    const items  = [...drafts, ...lives].map(p => ({ postId: p.id||'', title: p.title||'', status: p.status||'', url: p.url||'', published: p.published||'', updated: p.updated||'' }));
    return jsonResponse({ ok: true, mode: 'worker', version: WORKER_VERSION, items, total: items.length }, corsHeaders);
  } catch(e) {
    return jsonResponse({ ok: false, message: 'Blogger 목록 조회 실패: ' + e.message }, corsHeaders, 502);
  }
}

/* ----------------------------------------------------------
   유틸
   ---------------------------------------------------------- */
async function readJson(request) {
  try { const t = await request.text(); return t ? JSON.parse(t) : {}; } catch(_) { return {}; }
}

function normalizeLabels(labels) {
  if (typeof labels === 'string') labels = labels.split(/[,#]/).map(x=>x.trim()).filter(Boolean);
  return Array.isArray(labels) ? labels : [];
}

async function readErrorDetail(response, ...secrets) {
  let text = '';
  try { text = await response.text(); } catch(e) { return ''; }
  secrets.forEach(s => { if (s) text = text.split(s).join('[REDACTED]'); });
  return text.slice(0, 500);
}

function jsonResponse(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders }
  });
}
