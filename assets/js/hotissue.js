// hotissue.js — v0.1.0-test-r6
// 핫이슈 검색 강화 1차:
//   키워드 확장(10종) + 핫이슈 점수(0~100) + 추천 카드 + 자동작성 연동
//
// ※ 최신순(sort=date) 검색은 Worker 수정이 필요해 이번 r6에서는 보류.
//    r7 Worker 업데이트에서 /search/naver?sort=date 옵션으로 추가 예정.

/* ----------------------------------------------------------
   키워드 확장: 원본 + 9개 변형
   ---------------------------------------------------------- */
const KEYWORD_EXPAND_SUFFIXES = [
  '', ' 전망', ' 비교', ' 혜택', ' 방법',
  ' 이슈', ' 가격', ' 발표', ' 관련주', ' 수혜주'
];

function expandKeywords(keyword) {
  return KEYWORD_EXPAND_SUFFIXES.map(s => (keyword + s).trim()).filter(Boolean);
}

/* ----------------------------------------------------------
   핫이슈 점수 계산 (0~100)
   ---------------------------------------------------------- */
const HOT_SCORE_FRESH     = ['최신','오늘','발표','급등','논란','전망','속보','긴급','신규','개정'];
const HOT_SCORE_COMMERCE  = ['관련주','수혜주','가격','비교','혜택','방법','신청','할인','지원','수익'];
const HOT_SCORE_SENSITIVE = ['사건','사고','범죄','스캔들','폭로'];

function calcHotScore(items, keyword) {
  if (!Array.isArray(items) || !items.length) return 0;
  let score = 25;
  const kw      = keyword.toLowerCase();
  const titles  = items.map(it => (it.title       || '').toLowerCase());
  const descs   = items.map(it => (it.description || '').toLowerCase());
  const allText = [...titles, ...descs].join(' ');

  // 제목에 키워드 포함 건수 (최대 +20)
  score += Math.min(titles.filter(t => t.includes(kw)).length * 5, 20);

  // 최신성 키워드 (최대 +20)
  score += Math.min(HOT_SCORE_FRESH.filter(k => allText.includes(k)).length * 4, 20);

  // 수익형 키워드 (최대 +16)
  score += Math.min(HOT_SCORE_COMMERCE.filter(k => allText.includes(k)).length * 4, 16);

  // 블로그 + 웹문서 양쪽에 결과 있음 (+10)
  const hasBlog = items.some(it => it.type === 'blog' || it.source === 'blog');
  const hasWeb  = items.some(it => it.type === 'web'  || it.source === 'web');
  if (hasBlog && hasWeb) score += 10;

  // 결과 풍부도 (+5~+10)
  if (items.length >= 8)  score += 5;
  if (items.length >= 15) score += 5;

  // 민감 키워드 감점
  score -= HOT_SCORE_SENSITIVE.filter(k => kw.includes(k) || allText.includes(k)).length * 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function getScoreLabel(score) {
  if (score >= 80) return { emoji:'🔥', label:'수익형 글감 가능성 높음',  color:'#16a34a', bg:'#f0fdf4', border:'#bbf7d0' };
  if (score >= 60) return { emoji:'✅', label:'글감으로 적합',             color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe' };
  if (score >= 40) return { emoji:'📝', label:'보통 수준 글감',             color:'#d97706', bg:'#fffbeb', border:'#fde68a' };
  return               { emoji:'⚠️', label:'글감 적합도 낮음',             color:'#dc2626', bg:'#fef2f2', border:'#fecaca' };
}

/* ----------------------------------------------------------
   핫이슈 검색 실행 (handleHotissueSearch)
   ---------------------------------------------------------- */
async function handleHotissueSearch() {
  const kwEl   = document.getElementById('hotissue-keyword');
  const keyword = (kwEl && kwEl.value.trim()) || '';
  if (!keyword) { showToast('키워드를 입력해주세요'); return; }

  const loadCard  = document.getElementById('hotissue-loading-card');
  const resultEl  = document.getElementById('hotissue-result-area');
  const rawArea   = document.getElementById('hotissue-raw-area');

  if (loadCard)  loadCard.style.display = 'block';
  if (resultEl)  resultEl.innerHTML = '';
  if (rawArea)   rawArea.style.display = 'none';

  const expanded = expandKeywords(keyword);
  showExpandedKeywords(expanded);
  showToast('핫이슈 분석 중...');

  // 원본 키워드 네이버 검색
  let mainItems = [];
  try {
    const r = await performNaverSearch(keyword);
    mainItems = (r && r.items) ? r.items : [];
  } catch(e) { mainItems = []; }

  // Worker 모드이면 확장 키워드 3개 추가 검색 (중복 제거)
  if (getApiMode() === API_MODE.WORKER) {
    const seenTitles = new Set(mainItems.map(it => it.title || ''));
    for (const kw of expanded.slice(1, 4)) {
      try {
        const r = await performNaverSearch(kw);
        (r.items || []).forEach(it => {
          if (it.title && !seenTitles.has(it.title)) {
            seenTitles.add(it.title);
            mainItems.push(it);
          }
        });
      } catch(e) {}
    }
  }

  if (loadCard) loadCard.style.display = 'none';

  const score = calcHotScore(mainItems, keyword);
  renderHotissueResult(keyword, mainItems, score);
}

/* ----------------------------------------------------------
   확장 키워드 표시
   ---------------------------------------------------------- */
function showExpandedKeywords(expanded) {
  const card = document.getElementById('hotissue-expand-card');
  const list = document.getElementById('hotissue-expand-list');
  if (!card || !list) return;
  list.innerHTML = expanded.map(kw =>
    `<span style="display:inline-block;background:#f1f5f9;border-radius:20px;padding:3px 10px;font-size:12px;margin:3px;border:1px solid #e2e8f0;">${_esc(kw)}</span>`
  ).join('');
  card.style.display = 'block';
}

/* ----------------------------------------------------------
   결과 렌더링
   ---------------------------------------------------------- */
function renderHotissueResult(keyword, items, score) {
  const area    = document.getElementById('hotissue-result-area');
  const rawArea = document.getElementById('hotissue-raw-area');
  if (!area) return;

  const meta      = getScoreLabel(score);
  const blogItems = items.filter(it => it.type === 'blog' || it.source === 'blog');
  const webItems  = items.filter(it => it.type === 'web'  || it.source === 'web');

  area.innerHTML = `
    <div class="card" style="background:${meta.bg};border:1.5px solid ${meta.border};">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
        <div style="
          background:${meta.color};color:#fff;
          border-radius:50%;width:60px;height:60px;min-width:60px;
          display:flex;align-items:center;justify-content:center;
          font-size:17px;font-weight:800;flex-shrink:0;">
          ${score}점
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:16px;color:#1c2434;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(keyword)}</div>
          <div style="font-size:12px;color:${meta.color};margin-top:3px;">${meta.emoji} ${meta.label}</div>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
        <span style="background:rgba(255,255,255,0.8);border:1px solid #e5e7eb;border-radius:6px;padding:4px 10px;font-size:12px;">블로그 ${blogItems.length}건</span>
        <span style="background:rgba(255,255,255,0.8);border:1px solid #e5e7eb;border-radius:6px;padding:4px 10px;font-size:12px;">웹문서 ${webItems.length}건</span>
        <span style="background:rgba(255,255,255,0.8);border:1px solid #e5e7eb;border-radius:6px;padding:4px 10px;font-size:12px;">총 ${items.length}건</span>
      </div>
      <button class="btn btn-primary" style="font-size:15px;padding:14px;" onclick="handleHotissueToAutowrite(${JSON.stringify(keyword).replace(/"/g,'&quot;')})">
        ✍️ 이 키워드로 자동 글 만들기
      </button>
    </div>
    ${items.length > 0 ? `
      <div style="text-align:center;margin-bottom:8px;">
        <button class="btn btn-ghost" style="font-size:12px;" onclick="toggleRawResults()">🔍 검색 결과 보기 ▼</button>
      </div>` : `<p class="small-sub" style="text-align:center;padding:12px;">검색 결과가 없습니다. Worker 연결 후 다시 시도하거나 키워드를 바꿔보세요.</p>`}`;

  // 원문 채우기
  if (items.length > 0 && rawArea) {
    const rawCount = document.getElementById('hotissue-raw-count');
    const rawBlog  = document.getElementById('hotissue-raw-blog');
    const rawWeb   = document.getElementById('hotissue-raw-web');
    if (rawCount) rawCount.textContent = `블로그 ${blogItems.length}건 / 웹문서 ${webItems.length}건`;
    if (rawBlog)  rawBlog.innerHTML    = renderRawItems(blogItems, '📝 블로그');
    if (rawWeb)   rawWeb.innerHTML     = renderRawItems(webItems,  '🌐 웹문서');
  }

  showToast(`핫이슈 분석 완료 — ${score}점`);
}

function renderRawItems(items, label) {
  if (!items.length) return `<p class="small-sub" style="margin:8px 0;">${label} 결과 없음</p>`;
  return `<p class="small-sub" style="font-weight:700;margin:12px 0 4px;">${label} (${items.length}건)</p>` +
    items.slice(0, 10).map(it => `
      <div style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
        <div style="font-size:13px;font-weight:600;line-height:1.4;">${_esc(it.title || '')}</div>
        <div style="font-size:11.5px;color:#6b7280;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${_esc(it.description || '')}</div>
        ${it.link ? `<a href="${_esc(it.link)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#2563eb;display:inline-block;margin-top:3px;">원문보기 ↗</a>` : ''}
      </div>`).join('');
}

function toggleRawResults() {
  const a = document.getElementById('hotissue-raw-area');
  if (!a) return;
  const show = a.style.display === 'none';
  a.style.display = show ? 'block' : 'none';
}

/* ----------------------------------------------------------
   핫이슈 → 자동작성 연동
   ---------------------------------------------------------- */
function handleHotissueToAutowrite(keyword) {
  const awKw = document.getElementById('autowrite-keyword');
  const edKw = document.getElementById('editor-keyword');
  if (awKw) awKw.value = keyword;
  if (edKw) edKw.value = keyword;
  try { if (typeof saveLocal !== 'undefined') saveLocal(STORAGE_KEYS.LAST_KEYWORD, keyword); } catch(e) {}
  safeGoScreen('autowrite');
  showToast(`"${keyword}" 키워드로 자동작성 화면으로 이동했습니다`);
}

function syncAutowriteKeyword() {
  const hot = document.getElementById('hotissue-keyword');
  const aw  = document.getElementById('autowrite-keyword');
  if (hot && aw && hot.value.trim()) {
    aw.value = hot.value.trim();
    const edKw = document.getElementById('editor-keyword');
    if (edKw) edKw.value = hot.value.trim();
    showToast('핫이슈 키워드를 가져왔습니다');
  } else {
    showToast('핫이슈 탭에서 키워드를 먼저 입력해주세요');
    safeGoScreen('hotissue');
  }
}

function onHotissueKeywordInput() {
  const kw = document.getElementById('hotissue-keyword')?.value.trim() || '';
  if (!kw) {
    const c = document.getElementById('hotissue-expand-card');
    if (c) c.style.display = 'none';
    return;
  }
  showExpandedKeywords(expandKeywords(kw));
}

function refreshHotissueScreen() {
  const kwEl = document.getElementById('hotissue-keyword');
  if (kwEl && kwEl.value.trim()) showExpandedKeywords(expandKeywords(kwEl.value.trim()));
}

/* ----------------------------------------------------------
   내부 유틸
   ---------------------------------------------------------- */
function _esc(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
