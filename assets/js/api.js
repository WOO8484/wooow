// api.js
// Cloudflare Worker와의 통신을 담당합니다. (v0.0.9 기준)
// - /health, /auth/login 외 모든 API는 Authorization: Bearer <token> 필요
// - 401 응답 시 handleUnauthorized() 호출 → 로그인 화면으로 이동
// - API 키, 비밀번호는 절대 이 파일에 넣지 않습니다.

function normalizeWorkerUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function getWorkerUrl() {
  const raw = loadLocal(STORAGE_KEYS.WORKER_URL, '');
  const normalized = normalizeWorkerUrl(raw);
  // localStorage에 저장된 값이 없으면 DEFAULT_WORKER_URL을 사용합니다.
  return normalized || normalizeWorkerUrl(DEFAULT_WORKER_URL);
}
function getApiMode() {
  return loadLocal(STORAGE_KEYS.API_MODE, DEFAULT_API_MODE);
}

function setApiMode(mode) {
  saveLocal(STORAGE_KEYS.API_MODE, mode);
}

// Worker 공통 호출 함수
// requireAuth=true(기본값)면 Authorization 헤더를 자동으로 추가합니다.
// 401 응답 시 handleUnauthorized()를 호출하고 에러를 던집니다.
async function callWorker(path, options) {
  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    throw new Error('Worker URL이 설정되어 있지 않습니다. 설정 화면에서 입력해주세요.');
  }

  const opts = options || {};
  const requireAuth = opts.requireAuth !== false; // 기본값 true

  const headers = { 'Content-Type': 'application/json' };
  if (requireAuth) {
    const token = getSessionToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
  }

  const response = await fetch(workerUrl + path, {
    method: opts.method || 'POST',
    headers,
    body: opts.method === 'GET' ? undefined : JSON.stringify(opts.payload || {}),
    signal: opts.signal
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('로그인이 만료되었습니다. 다시 로그인해주세요.');
  }

  if (!response.ok) {
    let errMsg = 'Worker 응답 오류: ' + response.status;
    let errStatus = response.status;
    try {
      const errBody = await response.json();
      // workerMessage: Worker가 보낸 message 우선
      if (errBody && errBody.message) errMsg = errBody.message;
      const err = new Error(errMsg);
      err.workerStatus  = errStatus;
      err.workerMessage = errMsg;
      // ★ Provider Router 오류 정보 보존 (프론트에서 상세 표시용)
      if (errBody.errors)          err.workerErrors      = errBody.errors;
      if (errBody.providersTried)  err.providersTried    = errBody.providersTried;
      if (errBody.fallbackReason)  err.fallbackReason    = errBody.fallbackReason;
      throw err;
    } catch(jsonErr) {
      if (jsonErr.workerStatus) throw jsonErr;
      throw new Error(errMsg);
    }
  }

  return response.json();
}

/* ----------------------------------------------------------
   Worker 연결 테스트 (/health) - 인증 불필요
   ---------------------------------------------------------- */
async function checkWorkerHealth() {
  try {
    const result = await callWorker('/health', { method: 'GET', requireAuth: false });
    saveLocal(STORAGE_KEYS.WORKER_STATUS, 'success');
    saveLocal(STORAGE_KEYS.WORKER_LAST_CHECKED, new Date().toISOString());
    return { ok: true, result };
  } catch(e) {
    setApiMode(API_MODE.MOCK);
    saveLocal(STORAGE_KEYS.WORKER_STATUS, 'fail');
    saveLocal(STORAGE_KEYS.WORKER_LAST_CHECKED, new Date().toISOString());
    return { ok: false, error: e.message };
  }
}

// Mock 네이버 검색 결과 (Worker 연결 실패 시 fallback)
async function searchNaverMock(keyword) {
  return {
    ok: true,
    mode: 'mock',
    keyword,
    items: [
      { type: 'blog', title: `${keyword} 관련 블로그 후기 (예시)`, description: `${keyword}에 대한 실사용 후기를 정리한 예시 데이터입니다.`, link: '', postdate: '' },
      { type: 'blog', title: `${keyword} 비교 정리 블로그 (예시)`, description: `${keyword} 관련 항목을 비교 정리한 예시 데이터입니다.`, link: '', postdate: '' },
      { type: 'web', title: `${keyword} 관련 웹문서 (예시)`, description: `${keyword} 관련 최신 정보를 요약한 예시 데이터입니다.`, link: '' }
    ]
  };
}

/* ----------------------------------------------------------
   네이버 검색 오케스트레이터 (v0.0.9)
   Worker v0.0.9 응답: blog[], web[], blogItems[], webItems[], items[]
   ---------------------------------------------------------- */
async function performNaverSearch(keyword) {
  const mode = getApiMode();
  const workerUrl = getWorkerUrl();

  if (mode === API_MODE.WORKER && workerUrl) {
    try {
      const result = await callWorker('/search/naver', { payload: { keyword, query: keyword } });
      if (result && result.ok) {
        saveLocal(STORAGE_KEYS.NAVER_LAST_STATUS, { state: 'success', checkedAt: new Date().toISOString() });

        // Worker v0.0.9: blog/web 배열 우선 사용, 없으면 items fallback
        const blogItems = Array.isArray(result.blog) ? result.blog
          : Array.isArray(result.blogItems) ? result.blogItems
          : (result.items || []).filter(it => it.type === 'blog' || it.source === 'blog');

        const webItems = Array.isArray(result.web) ? result.web
          : Array.isArray(result.webItems) ? result.webItems
          : (result.items || []).filter(it => it.type === 'web' || it.source === 'web' || it.type === 'webkr');

        // type/source 필드 정규화
        const normBlog = blogItems.map(it => ({ ...it, type: 'blog', source: 'blog' }));
        const normWeb  = webItems.map(it => ({ ...it, type: 'web',  source: 'web'  }));
        const allItems = [...normBlog, ...normWeb];

        const searchResult = {
          ok: true, mode: 'worker', fallback: false,
          keyword, query: keyword,
          blog: normBlog, web: normWeb, items: allItems,
          total: allItems.length
        };
        saveLocal(STORAGE_KEYS.NAVER_SEARCH_RESULTS, searchResult);
        return searchResult;
      }

      saveLocal(STORAGE_KEYS.NAVER_LAST_STATUS, { state: 'fail', checkedAt: new Date().toISOString() });
      const mockResult = await searchNaverMock(keyword);
      return { ok: true, mode: 'mock', fallback: true, fallbackReason: (result && result.message) || 'Worker 응답 실패', keyword, blog: [], web: [], items: mockResult.items };
    } catch(e) {
      if (e.message && e.message.includes('만료')) throw e;
      saveLocal(STORAGE_KEYS.NAVER_LAST_STATUS, { state: 'fail', checkedAt: new Date().toISOString() });
      const mockResult = await searchNaverMock(keyword);
      return { ok: true, mode: 'mock', fallback: true, fallbackReason: e.message, keyword, blog: [], web: [], items: mockResult.items };
    }
  }

  saveLocal(STORAGE_KEYS.NAVER_LAST_STATUS, { state: 'mock', checkedAt: new Date().toISOString() });
  const mockResult = await searchNaverMock(keyword);
  return { ok: true, mode: 'mock', fallback: false, keyword, blog: [], web: [], items: mockResult.items };
}

/* ----------------------------------------------------------
   AI 글 생성 오케스트레이터 (v0.1.0)
   Worker v0.1.0 응답: providerUsed / providersTried / fallbackUsed / fallbackReason
   ---------------------------------------------------------- */

// 연타 방지: 마지막 요청 메모리 보관
const _aiLastRequest = { keyword: '', timestamp: 0 };
const AI_DEBOUNCE_MS = typeof AI_GENERATE_DEBOUNCE_MS !== 'undefined' ? AI_GENERATE_DEBOUNCE_MS : 10000;

async function performPostGeneration(keyword, material, options) {
  const opts = options || {};
  const generationMode = opts.mode || DEFAULT_GENERATION_MODE;
  const persona = opts.persona || DEFAULT_WRITER_PERSONA;
  const tone    = opts.tone    || DEFAULT_WRITING_TONE;
  const emoji   = opts.emoji   || DEFAULT_EMOJI_LEVEL;
  const apiMode   = getApiMode();
  const workerUrl = getWorkerUrl();

  const savedSearch = loadLocal(STORAGE_KEYS.NAVER_SEARCH_RESULTS, null);
  let sources = [];
  if (savedSearch && (savedSearch.keyword === keyword || savedSearch.query === keyword)) {
    sources = savedSearch.items || [...(savedSearch.blog || []), ...(savedSearch.web || [])];
  }

  if (apiMode === API_MODE.WORKER && workerUrl) {
    // ★ 연타 방지: 같은 키워드 10초 이내 재요청 차단
    const now = Date.now();
    if (_aiLastRequest.keyword === keyword && (now - _aiLastRequest.timestamp) < AI_DEBOUNCE_MS) {
      const wait = Math.ceil((AI_DEBOUNCE_MS - (now - _aiLastRequest.timestamp)) / 1000);
      const post = buildMockPost(keyword, material, generationMode, persona, tone, emoji);
      return { source: 'block', fallback: false, blocked: true, blockReason: `같은 키워드로 ${wait}초 후 다시 시도해주세요. (쿼터 절약)`, post };
    }
    _aiLastRequest.keyword = keyword;
    _aiLastRequest.timestamp = now;

    try {
      const result = await callWorker('/ai/generate', {
        payload: { keyword, material, sources, mode: generationMode, persona, tone, emoji,
          blog: savedSearch ? (savedSearch.blog || []) : [],
          web:  savedSearch ? (savedSearch.web  || []) : [],
          items: sources },
        signal: opts.signal
      });

      if (result && result.ok) {
        const articleData = result.article || result.post || result;
        const title = articleData.title || result.title || '';
        const html  = articleData.html  || articleData.contentHtml || result.html || result.contentHtml || '';

        if (title && html) {
          saveLocal(STORAGE_KEYS.AI_LAST_STATUS, { state: 'success', checkedAt: new Date().toISOString() });
          const post = {
            title, keyword, html, contentHtml: html, createdAt: new Date().toISOString(),
            summary:         articleData.summary         || result.summary         || '',
            metaDescription: articleData.metaDescription || result.metaDescription || '',
            labels:    Array.isArray(articleData.labels)    ? articleData.labels    : (Array.isArray(result.labels)    ? result.labels    : []),
            faq:       Array.isArray(articleData.faq)       ? articleData.faq       : (Array.isArray(result.faq)       ? result.faq       : []),
            checklist: Array.isArray(articleData.checklist) ? articleData.checklist : [],
            imageIdeas:Array.isArray(articleData.imageIdeas)? articleData.imageIdeas: [],
            aiSources: Array.isArray(articleData.sources)   ? articleData.sources   : [],
            generationMode
          };
          return {
            source: 'ai', fallback: false, post,
            providerUsed:   result.providerUsed   || result.provider || 'gemini',
            providersTried: result.providersTried || [result.provider || 'gemini'],
            fallbackUsed:   result.fallbackUsed   || false,
            fallbackReason: result.fallbackReason || null
          };
        }
      }

      saveLocal(STORAGE_KEYS.AI_LAST_STATUS, { state: 'fail', checkedAt: new Date().toISOString() });

      // Worker ok:false 응답에서도 errors / providersTried / fallbackReason 보존
      const errMsg   = (result && result.message)       || 'AI 응답 형식 오류';
      const wErrors  = (result && result.errors)         || [];
      const wTried   = (result && result.providersTried) || [];
      const has429ok = wErrors.some(err => err.status === 429);

      const post = buildMockPost(keyword, material, generationMode, persona, tone, emoji);
      return {
        source: 'mock', fallback: true, fallbackReason: errMsg, post,
        providersTried: wTried,
        workerErrors:   wErrors,
        isQuotaExceeded: has429ok
      };

    } catch(e) {
      if (e && e.name === 'AbortError') throw e;
      if (e.message && e.message.includes('만료')) throw e;
      saveLocal(STORAGE_KEYS.AI_LAST_STATUS, { state: 'fail', checkedAt: new Date().toISOString() });

      const st = e.workerStatus || 0;
      const workerErrors = e.workerErrors || [];
      // errors 배열 안에 429가 있는지 확인
      const has429 = st === 429 || workerErrors.some(err => err.status === 429);

      let reason;
      // 1순위: workerMessage가 있으면 그대로 사용 (Worker가 이미 친절하게 작성)
      if (e.workerMessage && e.workerMessage !== ('Worker 응답 오류: ' + st)) {
        reason = e.workerMessage;
      } else if (has429) {
        // 2순위: 429 감지 (status 직접 또는 errors 배열 내부)
        reason = '⛔ AI 무료 사용량(쿼터)을 초과했습니다. 내일 다시 시도하거나 다른 provider API Key를 Cloudflare에 등록하세요.';
      } else if (st === 401) {
        reason = 'AI API 키 인증에 실패했습니다. Worker Secret을 확인해주세요.';
      } else if (st === 403) {
        reason = 'AI API 키 권한 또는 프로젝트 제한 문제입니다.';
      } else if (st === 404) {
        reason = 'AI 모델명을 확인해야 합니다. Worker Secret(AI_MODEL)을 확인해주세요.';
      } else {
        // 3순위: workerMessage가 없을 때만 기본 문구 (500+이라도 workerMessage 우선)
        reason = e.message || 'AI 연결 실패';
      }

      const post = buildMockPost(keyword, material, generationMode, persona, tone, emoji);
      const errResult = {
        source: 'mock', fallback: true, fallbackReason: reason, post,
        providersTried: e.providersTried || [],
        workerErrors:   workerErrors
      };
      if (has429) errResult.isQuotaExceeded = true;
      if (st)     errResult.workerStatus = st;
      return errResult;
    }
  }

  saveLocal(STORAGE_KEYS.AI_LAST_STATUS, { state: 'mock', checkedAt: new Date().toISOString() });
  const post = buildMockPost(keyword, material, generationMode, persona, tone, emoji);
  return { source: 'mock', fallback: false, post };
}

/* ----------------------------------------------------------
   Blogger API 함수들 (모두 Authorization 토큰 포함)
   ---------------------------------------------------------- */

async function checkBloggerStatus() {
  try {
    const result = await callWorker('/blogger/status', { method: 'GET' });
    return { ok: true, result };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// 임시저장: post 구조(title/contentHtml/tags) 또는 레거시(title/html/labels) 모두 지원
async function saveBloggerDraft(payload) {
  try {
    // Worker v0.0.9: { post.title, post.contentHtml } 또는 최상위 title/html 모두 수용
    const html = payload.html || payload.contentHtml || '';
    const workerPayload = {
      post: {
        title: payload.title,
        contentHtml: html,
        tags: payload.labels || payload.tags || []
      },
      // 레거시 필드도 함께 전송 (Worker 버전 호환)
      title: payload.title,
      html,
      labels: payload.labels || payload.tags || [],
      qualityScore: payload.qualityScore || 0
    };
    const result = await callWorker('/blogger/draft', { payload: workerPayload });
    return { ok: true, result };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// 예약발행: post 구조 + scheduledAt
async function scheduleBloggerPost(payload) {
  try {
    const html = payload.html || payload.contentHtml || '';
    const workerPayload = {
      post: {
        title: payload.title,
        contentHtml: html,
        tags: payload.labels || payload.tags || []
      },
      scheduledAt: payload.scheduledAt,
      // 레거시 필드 병행
      title: payload.title,
      html,
      labels: payload.labels || payload.tags || [],
      qualityScore: payload.qualityScore || 0,
    };
    const result = await callWorker('/blogger/schedule', { payload: workerPayload });
    return { ok: true, result };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function listBloggerPosts() {
  try {
    const result = await callWorker('/blogger/list', { method: 'GET' });
    return { ok: true, result };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}
