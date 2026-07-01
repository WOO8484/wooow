// app.js
// 설정 화면(Worker URL / 글 톤 / 금지어 / 하루 저장 제한 / 전체 초기화 / Worker 연결 테스트)과
// 앱 시작 시 초기화 처리를 담당합니다.

function refreshSettingsScreen(){
  const stored = loadLocal(STORAGE_KEYS.WORKER_URL, '');
  const workerUrlEl = document.getElementById('setting-worker-url');
  if (workerUrlEl) workerUrlEl.value = stored || DEFAULT_WORKER_URL;
  // r8: setting-tone은 index.html에 없으므로 null 체크
  const toneEl = document.getElementById('setting-tone');
  if (toneEl) toneEl.value = loadLocal(STORAGE_KEYS.TONE, '');
  const bannedEl = document.getElementById('setting-banned-words');
  if (bannedEl) bannedEl.value = loadLocal(STORAGE_KEYS.BANNED_WORDS, '');
  const dailyEl = document.getElementById('setting-daily-limit');
  if (dailyEl) dailyEl.value = getDailyPublishLimit();
  refreshWorkerStatusCard();
}

function saveWorkerUrl(){
  const rawUrl = document.getElementById('setting-worker-url').value;
  const url = normalizeWorkerUrl(rawUrl);
  saveLocal(STORAGE_KEYS.WORKER_URL, url);
  // 저장 후 입력창에도 정리된(끝 슬래시 제거된) URL을 다시 표시합니다.
  document.getElementById('setting-worker-url').value = url;
  const hint = document.getElementById('worker-saved-hint');
  hint.style.display = 'block';
  showToast('Worker URL이 저장되었습니다');
  setTimeout(()=> hint.style.display = 'none', 2000);
  refreshWorkerStatusCard();
}

function saveTone(){
  const el = document.getElementById('setting-tone');
  if (el) saveLocal(STORAGE_KEYS.TONE, el.value.trim());
  showToast('글 톤이 저장되었습니다');
}

function saveBannedWords(){
  saveLocal(STORAGE_KEYS.BANNED_WORDS, document.getElementById('setting-banned-words').value.trim());
  showToast('금지어 목록이 저장되었습니다');
}

function resetAllData(){
  if(!confirm('정말로 모든 데이터를 초기화하시겠습니까?')) return;
  resetLocalData();
  showToast('초기화되었습니다. 다시 로그인해주세요.');
  location.reload();
}

/* ----------------------------------------------------------
   Worker 연결 상태 카드
   - 현재 Worker URL, 연결 상태(미확인/연결 성공/연결 실패), 마지막 테스트 시간을 보여줍니다.
   - 실패해도 앱은 멈추지 않고 항상 Mock 모드로 계속 사용할 수 있습니다.
   ---------------------------------------------------------- */
function refreshWorkerStatusCard(){
  const url = loadLocal(STORAGE_KEYS.WORKER_URL, '');
  const status = loadLocal(STORAGE_KEYS.WORKER_STATUS, 'unknown'); // unknown | success | fail
  const lastChecked = loadLocal(STORAGE_KEYS.WORKER_LAST_CHECKED, '');
  const mode = getApiMode();

  document.getElementById('worker-status-url').textContent = getWorkerUrl() || '(아직 입력되지 않음)';

  const statusEl = document.getElementById('worker-status-badge');
  if(status === 'success'){
    statusEl.textContent = '연결 성공';
    statusEl.className = 'badge success';
  } else if(status === 'fail'){
    statusEl.textContent = '연결 실패';
    statusEl.className = 'badge';
  } else {
    statusEl.textContent = '미확인';
    statusEl.className = 'badge';
  }

  document.getElementById('worker-status-last-checked').textContent =
    lastChecked ? new Date(lastChecked).toLocaleString('ko-KR') : '아직 테스트한 적 없음';

  document.getElementById('worker-status-mode').textContent =
    mode === API_MODE.WORKER ? 'Worker 모드' : 'Mock 모드';

  document.getElementById('login-mode-info').textContent =
    mode === API_MODE.WORKER ? 'Worker /auth/login (ADMIN_PASSWORD)' : 'Worker URL 미설정';

  // Worker URL은 저장돼 있지만 아직 연결 테스트(성공)를 하지 않아 mock 모드로 남아 있는 경우 안내
  const settingsHint = document.getElementById('settings-worker-mode-hint');
  if(settingsHint){
    settingsHint.style.display = (url && mode !== API_MODE.WORKER) ? 'block' : 'none';
  }
}

// "Worker 연결 테스트" 버튼 클릭 시 실행
async function handleWorkerConnectionTest(){
  const url = getWorkerUrl();
  if(!url){
    showToast('먼저 Worker URL을 입력하고 저장해주세요');
    return;
  }

  showToast('Worker 연결을 테스트하는 중입니다...');

  const health = await checkWorkerHealth();

  if(health.ok){
    setApiMode(API_MODE.WORKER);
    showToast('Worker 연결 성공');
  } else {
    // 실패 시 항상 Mock 모드로 유지 (checkWorkerHealth 내부에서도 처리되지만 한 번 더 보장)
    setApiMode(API_MODE.MOCK);
    showToast('Worker 연결 실패, Mock 모드로 계속 사용합니다');
  }

  refreshWorkerStatusCard();
}

// 앱 시작점: 로그인 상태 확인 → 글 재료 폼 복원 → 로그인 이벤트 연결
window.addEventListener('DOMContentLoaded', () => {
  checkLoginOnLoad();
  loadMaterialIntoForm();
  bindLoginEvents();
});

/* ============================================================
   v0.1.0-test-r4 발행 준비 화면 (screen-publish)
   ============================================================ */

function refreshPublishScreen() {
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const emptyCard   = document.getElementById('publish-empty-card');
  const contentArea = document.getElementById('publish-content-area');
  if (!emptyCard || !contentArea) return;

  if (!post) {
    emptyCard.style.display = 'block';
    contentArea.style.display = 'none';
    return;
  }
  emptyCard.style.display = 'none';
  contentArea.style.display = 'block';

  // 제목
  const titleEl = document.getElementById('publish-title-text');
  if (titleEl) titleEl.textContent = post.title || '(제목 없음)';

  // 메타 설명
  const metaEl = document.getElementById('publish-meta-text');
  if (metaEl) metaEl.textContent = post.metaDescription || post.summary || '(메타 설명 없음)';

  // 라벨
  const labelsEl = document.getElementById('publish-labels-text');
  if (labelsEl) {
    const labels = Array.isArray(post.labels) ? post.labels : [];
    labelsEl.textContent = labels.length ? labels.join(', ') : '(태그 없음)';
  }

  // 이미지 프롬프트 (imagePrompts가 없으면 hero-image.js에서 생성)
  const imgPrompts = post.imagePrompts ||
    (typeof generateImagePrompts === 'function'
      ? generateImagePrompts(post.keyword || '', post.title || '', post.summary || '')
      : null);

  if (imgPrompts) {
    const el = id => document.getElementById(id);
    if (el('publish-img-prompt'))     el('publish-img-prompt').textContent     = imgPrompts.mainPrompt    || '';
    if (el('publish-thumbnail-text')) el('publish-thumbnail-text').textContent = imgPrompts.thumbnailText || '';
    if (el('publish-alt-text'))       el('publish-alt-text').textContent       = imgPrompts.altText       || '';
    if (el('publish-img-style'))      el('publish-img-style').textContent      = imgPrompts.style ? '스타일: ' + imgPrompts.style : '';
    if (el('publish-image-card'))     el('publish-image-card').style.display   = 'block';
  }

  // 최근 생성 글 목록 렌더링
  renderRecentPostsList();
}

function renderRecentPostsList() {
  const listEl = document.getElementById('recent-posts-list');
  if (!listEl) return;

  const posts = typeof getRecentPosts === 'function' ? getRecentPosts() : [];
  if (!posts.length) {
    listEl.innerHTML = '<p class="small-sub">저장된 글이 없습니다.</p>';
    return;
  }

  listEl.innerHTML = posts.map(p => `
    <div class="row-between" style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.title)}</div>
        <div style="font-size:11px;color:#6b7280;">${new Date(p.createdAt).toLocaleString('ko-KR')}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px;">
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 8px;" onclick="handleLoadRecentPost(${p.id})">열기</button>
        <button class="btn btn-ghost" style="font-size:11px;padding:4px 8px;color:#dc2626;" onclick="handleDeleteRecentPost(${p.id})">삭제</button>
      </div>
    </div>
  `).join('');
}

/* ----------------------------------------------------------
   복사 핸들러
   ---------------------------------------------------------- */
function handleCopyTitle() {
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  if (!post?.title) return showToast('제목이 없습니다');
  copyToClipboard(post.title, '제목');
}

function handleCopyMeta() {
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const text = post?.metaDescription || post?.summary || '';
  if (!text) return showToast('메타 설명이 없습니다');
  copyToClipboard(text, '메타 설명');
}

function handleCopyLabels() {
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const labels = Array.isArray(post?.labels) ? post.labels : [];
  if (!labels.length) return showToast('라벨이 없습니다');
  copyToClipboard(labels.join(', '), '라벨');
}

function handleCopyHtml() {
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const html = post?.html || post?.contentHtml || '';
  if (!html) return showToast('HTML 본문이 없습니다');
  copyToClipboard(html, 'HTML 본문');
}

function handleCopyImgPrompt() {
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const prompt = post?.imagePrompts?.mainPrompt ||
    (post ? generateImagePrompts(post.keyword || '', post.title || '', post.summary || '')?.mainPrompt : '');
  if (!prompt) return showToast('이미지 프롬프트가 없습니다');
  copyToClipboard(prompt, '이미지 프롬프트');
}

function handleCopyAlt() {
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const alt = post?.imagePrompts?.altText ||
    (post ? generateImagePrompts(post.keyword || '', post.title || '', post.summary || '')?.altText : '');
  if (!alt) return showToast('alt 문구가 없습니다');
  copyToClipboard(alt, 'alt 문구');
}

function handleCopyAll() {
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  if (!post) return showToast('생성된 글이 없습니다');
  const labels = Array.isArray(post.labels) ? post.labels.join(', ') : '';
  const packageText = [
    '=== 제목 ===',
    post.title || '',
    '',
    '=== HTML 본문 ===',
    post.html || post.contentHtml || '',
    '',
    '=== 메타 설명 ===',
    post.metaDescription || post.summary || '',
    '',
    '=== 라벨 ===',
    labels
  ].join('\n');
  copyToClipboard(packageText, '전체 패키지');
}

/* ----------------------------------------------------------
   최근 생성 글 핸들러
   ---------------------------------------------------------- */
function handleLoadRecentPost(id) {
  const posts = typeof getRecentPosts === 'function' ? getRecentPosts() : [];
  const post = posts.find(p => p.id === id);
  if (!post) return showToast('글을 찾을 수 없습니다');
  saveLocal(STORAGE_KEYS.CURRENT_POST, post);
  saveLocal(STORAGE_KEYS.QUALITY_SCORE, null);
  refreshPublishScreen();
  showToast('"' + post.title.slice(0, 20) + '" 글을 불러왔습니다');
}

function handleDeleteRecentPost(id) {
  if (typeof deleteRecentPost === 'function') deleteRecentPost(id);
  renderRecentPostsList();
  showToast('삭제했습니다');
}

function handleClearRecentPosts() {
  if (!confirm('최근 생성 글을 모두 삭제할까요?')) return;
  if (typeof clearRecentPosts === 'function') clearRecentPosts();
  renderRecentPostsList();
  showToast('전체 삭제 완료');
}

/* ============================================================
   v0.1.0-test-r6 새 화면 핸들러
   ============================================================ */

/* ============================================================
   v0.1.0-test-r7-operation 핸들러 추가
   ============================================================ */

// ── 자동작성 화면 옵션 토글 ──
function toggleWriteOptions() {
  const b = document.getElementById('write-options-body');
  const t = document.getElementById('write-options-toggle');
  if (!b) return;
  const v = b.style.display !== 'none';
  b.style.display = v ? 'none' : 'block';
  if (t) t.textContent = v ? '펼치기 ▼' : '접기 ▲';
}
function toggleMaterialOptions() {
  const b = document.getElementById('material-options-body');
  const t = document.getElementById('material-options-toggle');
  if (!b) return;
  const v = b.style.display !== 'none';
  b.style.display = v ? 'none' : 'block';
  if (t) t.textContent = v ? '펼치기 ▼' : '접기 ▲';
}
function toggleManualCopy() {
  const b = document.getElementById('manual-copy-body');
  const t = document.getElementById('manual-copy-toggle');
  if (!b) return;
  const v = b.style.display !== 'none';
  b.style.display = v ? 'none' : 'block';
  if (t) t.textContent = v ? '펼치기 ▼' : '접기 ▲';
}

// ── 자동작성 탭 글 생성: 결과를 자동작성 화면에 바로 표시 ──
function handleGeneratePostFromAutowrite() {
  const awKw = document.getElementById('autowrite-keyword');
  const edKw = document.getElementById('editor-keyword');
  if (awKw && edKw && awKw.value.trim()) edKw.value = awKw.value.trim();
  if (typeof handleGeneratePost === 'function') {
    handleGeneratePost();
  } else {
    showToast('글 생성 함수를 찾을 수 없습니다');
  }
}

function refreshAutowriteScreen() {
  const edKw = document.getElementById('editor-keyword');
  const awKw = document.getElementById('autowrite-keyword');
  if (edKw && awKw && edKw.value && !awKw.value) awKw.value = edKw.value;
  // 이미 글이 생성돼 있으면 결과 카드 표시
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const card = document.getElementById('editor-result-card');
  if (post && card && card.style.display === 'none') {
    // 기존 결과가 있으면 표시
    const titleEl = document.getElementById('editor-title-preview');
    if (titleEl && !titleEl.textContent) titleEl.textContent = post.title || '';
    card.style.display = 'block';
    // 메타/라벨 미리보기
    const metaArea   = document.getElementById('autowrite-result-meta');
    const metaPreEl  = document.getElementById('autowrite-meta-preview');
    const labelPreEl = document.getElementById('autowrite-labels-preview');
    if (metaArea && (post.metaDescription || post.labels?.length)) {
      metaArea.style.display = 'block';
      if (metaPreEl)  metaPreEl.textContent  = post.metaDescription || '(없음)';
      if (labelPreEl) labelPreEl.textContent = Array.isArray(post.labels) ? post.labels.join(', ') : '(없음)';
    }
  }
  // 품질검수 결과가 있으면 표시
  const score  = loadLocal(STORAGE_KEYS.QUALITY_SCORE, null);
  const checks = loadLocal(STORAGE_KEYS.QUALITY_CHECKS, null);
  if (score !== null && checks && typeof renderQualityResult === 'function') {
    renderQualityResult(score, checks);
  }
}

// ── 핫이슈 화면 refresh ──
function refreshHotissueScreen() {
  const kwEl = document.getElementById('hotissue-keyword');
  if (kwEl && kwEl.value.trim() && typeof onHotissueKeywordInput === 'function') {
    onHotissueKeywordInput();
  }
}

// ── syncAutowriteKeyword ──
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

// ── 발행 전 체크리스트 렌더링 ──
function renderPubmgmtChecklist(post, score, connected) {
  const el = document.getElementById('pubmgmt-checklist-list');
  if (!el) return;

  const dateVal = document.getElementById('schedule-date')?.value || '';
  const timeVal = document.getElementById('schedule-time')?.value || '';
  let schedFuture = false;
  if (dateVal && timeVal) {
    const st = new Date(`${dateVal}T${timeVal}:00`);
    schedFuture = st.getTime() > Date.now();
  }

  const items = [
    { label: 'Blogger 연결됨',      ok: connected },
    { label: '글 생성 완료',         ok: !!(post && post.title && post.html) },
    { label: '품질검수 완료',         ok: score !== null },
    { label: '품질점수 50점 이상',    ok: score !== null && score >= 50 },
    { label: '품질점수 70점 이상 (예약발행)', ok: score !== null && score >= 70 },
    { label: '제목 있음',             ok: !!(post && post.title) },
    { label: '본문 있음',             ok: !!(post && (post.html || post.contentHtml)) },
    { label: '메타 설명 있음',        ok: !!(post && post.metaDescription && post.metaDescription.length >= 20) },
    { label: '라벨 있음',             ok: !!(post && Array.isArray(post.labels) && post.labels.length > 0) },
    { label: '예약 시간이 미래',       ok: schedFuture }
  ];

  el.innerHTML = items.map(it =>
    `<div style="display:flex;gap:6px;align-items:center;font-size:12px;padding:3px 0;">
      <span>${it.ok ? '✅' : '⚪'}</span>
      <span style="color:${it.ok ? '#374151' : '#9ca3af'};">${it.label}</span>
    </div>`
  ).join('');
}

// ── 발행관리 화면 refresh ──
function refreshPubmgmtScreen() {
  const connected    = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTED, false);
  const connMode     = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, API_MODE.MOCK);
  const failReason   = loadLocal(STORAGE_KEYS.BLOGGER_FAIL_REASON, '');
  const blogName     = loadLocal('bloggerBlogName', '');
  const statusEl     = document.getElementById('pubmgmt-blogger-status');
  const failBox      = document.getElementById('pubmgmt-fail-box');
  const failReasonEl = document.getElementById('pubmgmt-fail-reason');
  const blogNameEl   = document.getElementById('pubmgmt-blogger-blog-name');

  if (statusEl) {
    if (connected && connMode === API_MODE.WORKER) {
      statusEl.textContent = '연결됨'; statusEl.className = 'badge success';
      if (failBox) failBox.style.display = 'none';
      if (blogNameEl && blogName) { blogNameEl.textContent = `블로그: ${blogName}`; blogNameEl.style.display = 'block'; }
    } else if (failReason) {
      statusEl.textContent = '연결 실패'; statusEl.className = 'badge';
      if (failBox)      failBox.style.display = 'block';
      if (failReasonEl) failReasonEl.textContent = failReason;
      if (blogNameEl)   blogNameEl.style.display = 'none';
    } else {
      statusEl.textContent = '미연결'; statusEl.className = 'badge';
      if (failBox)   failBox.style.display = 'none';
      if (blogNameEl) blogNameEl.style.display = 'none';
    }
  }

  const post        = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const emptyCard   = document.getElementById('pubmgmt-empty-card');
  const contentArea = document.getElementById('pubmgmt-content-area');
  if (!post) {
    if (emptyCard)   emptyCard.style.display   = 'block';
    if (contentArea) contentArea.style.display = 'none';
    return;
  }
  if (emptyCard)   emptyCard.style.display   = 'none';
  if (contentArea) contentArea.style.display = 'block';

  const titleEl = document.getElementById('pubmgmt-title');
  if (titleEl) titleEl.textContent = post.title || '(제목 없음)';

  const score      = loadLocal(STORAGE_KEYS.QUALITY_SCORE, null);
  const scoreEl    = document.getElementById('pubmgmt-score');
  const infoEl     = document.getElementById('pubmgmt-score-info');
  const draftBtn   = document.getElementById('btn-draft-save');
  const schedBtn   = document.getElementById('btn-schedule-save');
  const dailyLimit = typeof getDailyPublishLimit === 'function' ? getDailyPublishLimit() : DAILY_PUBLISH_LIMIT;
  const todayCount = typeof getTodaySavedCount   === 'function' ? getTodaySavedCount()   : 0;
  const overLimit  = todayCount >= dailyLimit;

  if (scoreEl) scoreEl.textContent = score !== null ? score + '점' : '검수 전';

  const dis = () => { if(draftBtn) draftBtn.className='btn btn-disabled'; if(schedBtn) schedBtn.className='btn btn-disabled'; };

  if (!connected)       { if(infoEl) infoEl.textContent = 'Blogger를 먼저 연결해주세요.'; dis(); }
  else if (overLimit)   { if(infoEl) infoEl.textContent = `오늘 발행 제한(${dailyLimit}건)을 초과했습니다.`; dis(); }
  else if (score===null){ if(infoEl) infoEl.textContent = '품질검수를 먼저 진행해주세요. (자동작성 탭)'; dis(); }
  else if (score < QUALITY_DRAFT_MIN_SCORE) {
    if(infoEl) infoEl.textContent = `${score}점: ${QUALITY_DRAFT_MIN_SCORE}점 미만이라 저장 제한됩니다.`; dis();
  } else if (score < QUALITY_SCHEDULE_MIN_SCORE) {
    if(infoEl) infoEl.textContent = `${score}점: 임시저장만 가능합니다. (오늘 ${todayCount}/${dailyLimit}건)`;
    if(draftBtn) draftBtn.className = 'btn btn-primary';
    if(schedBtn) schedBtn.className = 'btn btn-disabled';
  } else {
    if(infoEl) infoEl.textContent = `${score}점: 임시저장·예약발행 모두 가능합니다. (오늘 ${todayCount}/${dailyLimit}건)`;
    if(draftBtn) draftBtn.className = 'btn btn-primary';
    if(schedBtn) schedBtn.className = 'btn btn-success';
  }

  // 발행 전 체크리스트
  renderPubmgmtChecklist(post, score, connected && connMode === API_MODE.WORKER);

  // 이미지 프롬프트
  const imgEl = document.getElementById('pubmgmt-img-prompt');
  if (imgEl) {
    const pr = post.imagePrompts?.mainPrompt ||
      (typeof generateImagePrompts==='function' ? generateImagePrompts(post.keyword||'',post.title||'',post.summary||'')?.mainPrompt : '');
    imgEl.textContent = pr || '(이미지 프롬프트 없음)';
  }

  if (typeof renderRecentPostsList === 'function') renderRecentPostsList();
}

function handleBloggerConnectFromPubmgmt() {
  if (typeof handleBloggerConnect === 'function') {
    handleBloggerConnect().then(() => refreshPubmgmtScreen()).catch(() => refreshPubmgmtScreen());
  }
}

// ── 설정 화면 refresh (Worker 버전 표시 추가) ──
function refreshSettingsScreenExtra() {
  const verEl = document.getElementById('settings-worker-version');
  const aiEl  = document.getElementById('settings-ai-provider');
  const status = loadLocal(STORAGE_KEYS.WORKER_STATUS, null);
  if (verEl && status?.version) verEl.textContent = status.version;
  if (aiEl && status?.aiProviders) {
    const connected = Object.entries(status.aiProviders).filter(([,v])=>v).map(([k])=>k);
    aiEl.textContent = connected.length ? connected.join(', ') : '연결 안 됨';
  }
}

/* ============================================================
   r8-mobile-operation 추가 함수
   ============================================================ */

// ── 상단 상태바 업데이트 (로그인 후 표시, 로그인 중 숨김) ──
function updateStatusBar(currentScreen) {
  const bar = document.getElementById('status-bar');
  if (!bar) return;

  // 로그인 화면이면 숨김
  if (!currentScreen || currentScreen === 'login') {
    bar.classList.add('status-bar-hidden');
    return;
  }
  bar.classList.remove('status-bar-hidden');

  const mode      = typeof getApiMode === 'function' ? getApiMode() : '';
  const connected = typeof loadLocal  === 'function' ? loadLocal(STORAGE_KEYS.BLOGGER_CONNECTED, false) : false;
  const connMode  = typeof loadLocal  === 'function' ? loadLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, '') : '';
  const workerOk  = mode === API_MODE.WORKER;
  const bloggerOk = connected && connMode === API_MODE.WORKER;

  const sbMode    = document.getElementById('sb-mode');
  const sbScreen  = document.getElementById('sb-current-screen');
  const sbWorker  = document.getElementById('sb-worker');
  const sbAi      = document.getElementById('sb-ai');
  const sbBlogger = document.getElementById('sb-blogger-ind');
  const sbNaver   = document.getElementById('sb-naver');

  if (sbMode)    { sbMode.textContent = workerOk ? '🟢 W' : '🟡 M'; }
  if (sbScreen)  {
    const screenNames = { dashboard:'홈', hotissue:'핫이슈', autowrite:'자동작성', pubmgmt:'발행관리', settings:'설정', preview:'미리보기' };
    sbScreen.textContent = screenNames[currentScreen] || currentScreen;
  }
  if (sbWorker)  { sbWorker.textContent  = workerOk  ? '🟢W'  : '⚪W';  sbWorker.title  = workerOk  ? 'Worker 연결됨' : 'Worker 미연결'; }
  if (sbAi)      { sbAi.textContent      = workerOk  ? '🟢AI' : '⚪AI'; sbAi.title      = 'AI 상태'; }
  if (sbBlogger) { sbBlogger.textContent = bloggerOk ? '🟢B'  : '⚪B';  sbBlogger.title = bloggerOk ? 'Blogger 연결됨' : 'Blogger 미연결'; }
  if (sbNaver)   { sbNaver.textContent   = workerOk  ? '🟢N'  : '⚪N';  sbNaver.title   = 'Naver 상태'; }
}

// ── 바텀시트 열기/닫기 ──
function openBottomSheet(contentHtml) {
  const overlay = document.getElementById('bottom-sheet-overlay');
  const sheet   = document.getElementById('bottom-sheet');
  const content = document.getElementById('bottom-sheet-content');
  if (!sheet || !overlay) return;
  if (content) content.innerHTML = contentHtml;
  overlay.classList.add('open');
  sheet.classList.add('open');
  sheet.style.display = 'block';
  overlay.style.display = 'block';
}

function closeBottomSheet() {
  const overlay = document.getElementById('bottom-sheet-overlay');
  const sheet   = document.getElementById('bottom-sheet');
  if (!sheet || !overlay) return;
  sheet.classList.remove('open');
  overlay.classList.remove('open');
  setTimeout(() => {
    sheet.style.display   = 'none';
    overlay.style.display = 'none';
  }, 260);
}

// 저장 성공 후 상태바도 갱신
const _origShowPubmgmtSaveResult = typeof showPubmgmtSaveResult === 'function' ? showPubmgmtSaveResult : null;
function showPubmgmtSaveResult(result, type) {
  const card    = document.getElementById('pubmgmt-save-result');
  const content = document.getElementById('pubmgmt-save-result-content');
  if (!card || !content) return;
  card.style.display = 'block';

  const isFail = type && type.includes('fail');
  const typeLabel = type === 'draft' ? '임시저장' : type === 'schedule' ? '예약발행' : '저장';
  const now  = new Date().toLocaleString('ko-KR');
  const postId = result?.postId || result?.id || '';
  const url    = result?.url    || '';
  const score  = loadLocal(STORAGE_KEYS.QUALITY_SCORE, null);
  const err    = result?.error  || '';

  if (isFail) {
    card.style.borderColor = '#fecaca';
    card.style.background  = '#fef2f2';
    content.innerHTML = `<div style="color:#dc2626;font-weight:700;">❌ ${typeLabel} 실패</div>
      <div class="small-sub" style="margin-top:6px;">${err}</div>`;
  } else {
    card.style.borderColor = '#bbf7d0';
    card.style.background  = '#f0fdf4';
    content.innerHTML = `<div style="color:#16a34a;font-weight:700;">✅ ${typeLabel} 완료</div>
      <div class="row-between small-sub" style="margin-top:6px;"><span>저장 시간</span><span>${now}</span></div>
      ${score !== null ? `<div class="row-between small-sub" style="margin-top:4px;"><span>품질점수</span><span>${score}점</span></div>` : ''}
      ${postId ? `<div class="row-between small-sub" style="margin-top:4px;"><span>postId</span><span style="font-size:10px;">${postId}</span></div>` : ''}
      ${url ? `<div style="margin-top:8px;"><a href="${url}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#2563eb;">📎 원문/관리 링크 ↗</a></div>` : ''}`;
  }
  // 상태바도 갱신
  updateStatusBar();
}

// refreshDashboard 오버라이드: 상태바 갱신 추가
const _origRefreshDashboard = typeof refreshDashboard === 'function' ? refreshDashboard : null;
