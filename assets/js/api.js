// api.js
// Cloudflare Worker와의 통신을 담당합니다. (v0.0.7.1: 보안 패치)
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
    throw new Error('Worker 응답 오류: ' + response.status);
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
   네이버 검색 오케스트레이터
   ---------------------------------------------------------- */
async function performNaverSearch(keyword) {
  const mode = getApiMode();
  const workerUrl = getWorkerUrl();

  if (mode === API_MODE.WORKER && workerUrl) {
    try {
      const result = await callWorker('/search/naver', { payload: { keyword } });
      if (result && result.ok) {
        saveLocal(STORAGE_KEYS.NAVER_LAST_STATUS, { state: 'success', checkedAt: new Date().toISOString() });
        return { ok: true, mode: 'worker', fallback: false, keyword, items: result.items || [] };
      }
      saveLocal(STORAGE_KEYS.NAVER_LAST_STATUS, { state: 'fail', checkedAt: new Date().toISOString() });
      const mockResult = await searchNaverMock(keyword);
      return { ok: true, mode: 'mock', fallback: true, fallbackReason: (result && result.message) || 'Worker 응답 실패', keyword, items: mockResult.items };
    } catch(e) {
      if (e.message && e.message.includes('만료')) throw e; // 401은 재throw
      saveLocal(STORAGE_KEYS.NAVER_LAST_STATUS, { state: 'fail', checkedAt: new Date().toISOString() });
      const mockResult = await searchNaverMock(keyword);
      return { ok: true, mode: 'mock', fallback: true, fallbackReason: e.message, keyword, items: mockResult.items };
    }
  }

  saveLocal(STORAGE_KEYS.NAVER_LAST_STATUS, { state: 'mock', checkedAt: new Date().toISOString() });
  const mockResult = await searchNaverMock(keyword);
  return { ok: true, mode: 'mock', fallback: false, keyword, items: mockResult.items };
}

/* ----------------------------------------------------------
   AI 글 생성 오케스트레이터
   Worker 응답: post.contentHtml 또는 title/html 모두 처리 (호환)
   ---------------------------------------------------------- */
async function performPostGeneration(keyword, material, options) {
  const opts = options || {};
  const generationMode = opts.mode || DEFAULT_GENERATION_MODE;
  const persona = opts.persona || DEFAULT_WRITER_PERSONA;
  const tone = opts.tone || DEFAULT_WRITING_TONE;
  const emoji = opts.emoji || DEFAULT_EMOJI_LEVEL;

  const apiMode = getApiMode();
  const workerUrl = getWorkerUrl();

  const savedSearch = loadLocal(STORAGE_KEYS.NAVER_SEARCH_RESULTS, null);
  const sources = (savedSearch && savedSearch.keyword === keyword) ? savedSearch.items : [];

  if (apiMode === API_MODE.WORKER && workerUrl) {
    try {
      const result = await callWorker('/ai/generate', {
        payload: { keyword, material, sources, mode: generationMode, persona, tone, emoji },
        signal: opts.signal
      });

      if (result && result.ok) {
        // Worker v0.0.7.1 응답 구조: result.post.contentHtml 또는 result.title/result.html 호환
        const postData = result.post || result;
        const title = postData.title || result.title || '';
        // contentHtml 우선, 없으면 html 필드
        const html = postData.contentHtml || postData.html || result.html || '';

        if (title && html) {
          saveLocal(STORAGE_KEYS.AI_LAST_STATUS, { state: 'success', checkedAt: new Date().toISOString() });
          const post = {
            title,
            keyword,
            html,
            contentHtml: html, // 호환용 alias
            createdAt: new Date().toISOString(),
            summary: postData.summary || result.summary || '',
            faq: Array.isArray(postData.faq) ? postData.faq : (Array.isArray(result.faq) ? result.faq : []),
            checklist: Array.isArray(postData.checklist) ? postData.checklist : (Array.isArray(result.checklist) ? result.checklist : []),
            imageIdeas: Array.isArray(postData.imageIdeas) ? postData.imageIdeas : (Array.isArray(result.imageIdeas) ? result.imageIdeas : []),
            aiSources: Array.isArray(postData.sources) ? postData.sources : (Array.isArray(result.sources) ? result.sources : [])
          };
          return { source: 'ai', fallback: false, post };
        }
      }

      saveLocal(STORAGE_KEYS.AI_LAST_STATUS, { state: 'fail', checkedAt: new Date().toISOString() });
      const post = buildMockPost(keyword, material, generationMode, persona, tone, emoji);
      return { source: 'mock', fallback: true, fallbackReason: (result && result.message) || 'AI 응답 형식 오류', post };
    } catch(e) {
      if (e && e.name === 'AbortError') throw e;
      if (e.message && e.message.includes('만료')) throw e; // 401
      saveLocal(STORAGE_KEYS.AI_LAST_STATUS, { state: 'fail', checkedAt: new Date().toISOString() });
      const post = buildMockPost(keyword, material, generationMode, persona, tone, emoji);
      return { source: 'mock', fallback: true, fallbackReason: e.message, post };
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
    // Worker v0.0.7.1은 { post: { title, contentHtml, tags } } 또는 { title, html, labels } 모두 수용
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
