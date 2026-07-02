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

// 설정 화면 본문은 메뉴 버튼만 남기고,
// 상세 내용은 각각 바텀시트로 연다. 바텀시트 내부는 스크롤을 만들지 않고
// 짧은 콘텐츠만 담는다. 저장/테스트 로직은 기존 함수를 그대로 재사용한다.
// 연결 설정 첫 화면은 Worker/AI/Blogger/Naver 상태 요약 +
// 핵심 버튼만 표시한다. Worker URL 입력은 별도 바텀시트(showWorkerUrlSheet)로 분리한다.
function showConnectionSettingsSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">연결 설정</h3>` +
    `<div style="display:flex;flex-direction:column;gap:2px;">
      <div class="row-between small-sub"><span>Worker</span><span id="worker-status-badge" class="badge">미확인</span></div>
      <div class="row-between small-sub"><span>AI Provider</span><span id="settings-ai-provider-inline">—</span></div>
      <div class="row-between small-sub"><span>Blogger</span><span id="settings-blogger-status-badge" class="badge">미확인</span></div>
      <div class="row-between small-sub"><span>Naver</span><span id="settings-naver-status-badge" class="badge">미확인</span></div>
    </div>` +
    `<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
      <button class="btn btn-secondary" onclick="showWorkerUrlSheet()">Worker URL 설정</button>
      <button class="btn btn-secondary" onclick="handleBloggerConnectFromSettings()">Blogger 연결 확인</button>
      <button class="btn btn-ghost" onclick="typeof reconnectAllFromStatusBar==='function'&&reconnectAllFromStatusBar()">전체 연결 재확인</button>
      <button class="btn btn-ghost" onclick="uiCloseBottomSheet();">닫기</button>
    </div>`
  );
  refreshWorkerStatusCard();
  refreshSettingsScreenExtra();
}

// Worker URL 입력/테스트/상세 상태는 별도 단계 화면으로 분리
function showWorkerUrlSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">Worker URL 설정</h3>` +
    `<input type="text" id="setting-worker-url" placeholder="https://your-worker.workers.dev" style="font-size:16px;">
    <div style="display:flex;gap:6px;margin-top:6px;">
      <button class="btn btn-primary" style="flex:1;min-height:38px;font-size:13px;" onclick="saveWorkerUrl()">URL 저장</button>
      <button class="btn btn-secondary" style="flex:1;min-height:38px;font-size:13px;" onclick="handleWorkerConnectionTest()">연결 테스트</button>
    </div>
    <p class="hint" id="worker-saved-hint" style="display:none;color:#16a34a;">저장되었습니다</p>
    <p class="hint" id="settings-worker-mode-hint" style="display:none;color:#d97706;">연결 테스트를 해주세요.</p>
    <div style="margin-top:8px;display:flex;flex-direction:column;gap:2px;">
      <div class="row-between small-sub"><span>동작 모드</span><span id="worker-status-mode">Mock 모드</span></div>
      <div class="row-between small-sub"><span>마지막 테스트</span><span id="worker-status-last-checked">없음</span></div>
      <div class="row-between small-sub"><span>URL</span><b id="worker-status-url" style="font-size:11px;word-break:break-all;text-align:right;max-width:60%;">(미입력)</b></div>
      <div class="row-between small-sub" style="display:none;"><span>로그인</span><span id="login-mode-info">Worker /auth/login</span></div>
    </div>` +
    `<button class="btn btn-ghost" style="margin-top:10px;" onclick="uiCloseBottomSheet();showConnectionSettingsSheet();">← 연결 설정으로</button>` +
    `<button class="btn btn-ghost" style="margin-top:6px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
  const workerUrlEl = document.getElementById('setting-worker-url');
  if (workerUrlEl) workerUrlEl.value = loadLocal(STORAGE_KEYS.WORKER_URL, '') || DEFAULT_WORKER_URL;
  refreshWorkerStatusCard();
}

function showWritingDefaultsSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1c2434;">글쓰기 기본값</h3>` +
    `<p class="desc" style="margin-top:0;">쉼표(,)로 구분해서 입력하세요.</p>
    <textarea id="setting-banned-words" placeholder="예: 100% 효과, 무조건 보장" style="min-height:70px;"></textarea>
    <button class="btn btn-secondary" onclick="saveBannedWords()">저장하기</button>
    <button class="btn btn-ghost" style="margin-top:6px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
  const bannedEl = document.getElementById('setting-banned-words');
  if (bannedEl) bannedEl.value = loadLocal(STORAGE_KEYS.BANNED_WORDS, '');
}

function showPublishSettingsSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1c2434;">발행 설정</h3>` +
    `<label style="margin-top:0;">최대 건수 (1~10)</label>
    <input type="number" id="setting-daily-limit" min="1" max="10" value="3">
    <button class="btn btn-secondary" onclick="saveDailyLimitSetting()">하루 제한 저장</button>
    <p class="hint">초기 운영 권장: 하루 3~5건</p>
    <button class="btn btn-ghost" style="margin-top:6px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
  const dailyEl = document.getElementById('setting-daily-limit');
  if (dailyEl) dailyEl.value = getDailyPublishLimit();
}

function showDataManagementSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1c2434;">데이터 관리</h3>` +
    `<div class="row-between small-sub"><span>앱</span><span>${typeof APP_DISPLAY_VERSION !== 'undefined' ? APP_DISPLAY_VERSION : '—'}</span></div>
    <div class="row-between small-sub"><span>Worker</span><span id="settings-worker-version">—</span></div>
    <div class="row-between small-sub"><span>AI</span><span id="settings-ai-provider">—</span></div>
    <button class="btn btn-danger" style="margin-top:10px;" onclick="resetAllData()">전체 초기화</button>
    <button class="btn btn-ghost" style="margin-top:6px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
  refreshSettingsScreenExtra();
}

function saveWorkerUrl(){
  const inputEl = document.getElementById('setting-worker-url');
  if (!inputEl) return;
  const url = normalizeWorkerUrl(inputEl.value);
  saveLocal(STORAGE_KEYS.WORKER_URL, url);
  // 저장 후 입력창에도 정리된(끝 슬래시 제거된) URL을 다시 표시합니다.
  inputEl.value = url;
  const hint = document.getElementById('worker-saved-hint');
  if (hint) {
    hint.style.display = 'block';
    setTimeout(()=> hint.style.display = 'none', 2000);
  }
  showToast('Worker URL이 저장되었습니다');
  refreshWorkerStatusCard();
}

function saveTone(){
  const el = document.getElementById('setting-tone');
  if (el) saveLocal(STORAGE_KEYS.TONE, el.value.trim());
  showToast('글 톤이 저장되었습니다');
}

function saveBannedWords(){
  const el = document.getElementById('setting-banned-words');
  if (!el) return;
  saveLocal(STORAGE_KEYS.BANNED_WORDS, el.value.trim());
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

  // 아래 요소들은 연결 설정 바텀시트가 열려 있을 때만 DOM에 존재한다.
  // 설정 화면 진입 시(바텀시트 미오픈)에도 오류 없이 동작하도록 전부 null guard 처리한다.
  const urlEl = document.getElementById('worker-status-url');
  if (urlEl) urlEl.textContent = getWorkerUrl() || '(아직 입력되지 않음)';

  const statusEl = document.getElementById('worker-status-badge');
  if (statusEl) {
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
  }

  const lastCheckedEl = document.getElementById('worker-status-last-checked');
  if (lastCheckedEl) {
    lastCheckedEl.textContent = lastChecked ? new Date(lastChecked).toLocaleString('ko-KR') : '아직 테스트한 적 없음';
  }

  const modeEl = document.getElementById('worker-status-mode');
  if (modeEl) modeEl.textContent = mode === API_MODE.WORKER ? 'Worker 모드' : 'Mock 모드';

  // compact-row 요약 텍스트
  const summaryEl = document.getElementById('settings-connection-summary');
  if(summaryEl){
    summaryEl.textContent = status === 'success' ? '연결됨' : (status === 'fail' ? '연결 실패' : '미확인');
  }

  const loginInfoEl = document.getElementById('login-mode-info');
  if (loginInfoEl) {
    loginInfoEl.textContent = mode === API_MODE.WORKER ? 'Worker /auth/login (ADMIN_PASSWORD)' : 'Worker URL 미설정';
  }

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
  // 핫이슈 결과/원문 영역을 한 화면 요약형으로 축소
  // (hotissue.js는 수정하지 않고, 렌더링 이후 결과 DOM만 후처리한다)
  initHotissueResultCompactor();
  // r9-gui-mobile-layout-reset: 홈 화면 "최근 생성 글" 카드도 긴 목록 대신
  // 최근 1건 + 요약 문구만 남긴다. (blogger.js의 refreshDashboard()는 수정하지 않고
  // 렌더링 이후 DOM만 후처리한다)
  initDashboardRecentListCompactor();
  // r9-gui-mobile-layout-reset-fix2: AI 생성 실패 안내는 본문 카드로 노출하지 않고
  // 바텀시트로 표시한다. (editor.js는 수정하지 않고, 카드 표시 여부만 후처리로 가로챈다)
  initAutowriteAiFailWatcher();
  // r9-gui-mobile-base-hardening-fix3: 품질검수 상세 문제 목록 요약 문구 +
  // 미리보기 본문 요약형 표시 후처리 (quality-check.js/editor.js 미수정)
  initQualityGapListAnnotator();
  initPreviewContentCompactor();
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

  // 저장 데이터가 5개를 넘어도 화면에는 실제로 5개까지만 표시
  const posts = (typeof getRecentPosts === 'function' ? getRecentPosts() : []).slice(0, 5);
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
// r9-gui-layout-lock-fix4: 글쓰기 옵션 — 카드 펼침 대신 바텀시트로 연다.
// input/select id는 그대로 유지하고, 시트 삽입 직후 editor.js의 바인딩/복원 함수를 재사용한다.
function toggleWriteOptions() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">글쓰기 옵션</h3>` +
    `<label style="margin-top:0;">글쓴이 느낌</label>
    <select id="setting-writer-persona">
      <option value="neutral">성별 드러내지 않음</option>
      <option value="male">남성 운영자 느낌</option>
      <option value="female">여성 운영자 느낌</option>
    </select>
    <label>작성 톤</label>
    <select id="setting-writing-tone">
      <option value="friendly">친근한 블로그형</option>
      <option value="basic">기본형</option>
      <option value="review">꼼꼼한 리뷰형</option>
      <option value="lifehack">생활 꿀팁형</option>
      <option value="expert">전문가 정리형</option>
    </select>
    <label>이모티콘 사용</label>
    <select id="setting-emoji-level">
      <option value="few">적게 사용</option>
      <option value="none">사용 안 함</option>
      <option value="moderate">적당히 사용</option>
    </select>
    <button class="btn btn-ghost" style="margin-top:10px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
  // 새로 생성된 select에 값 복원 + change 이벤트 바인딩 (editor.js 함수 재사용)
  const personaSelect = document.getElementById('setting-writer-persona');
  if (personaSelect && typeof getWriterPersona === 'function') personaSelect.value = getWriterPersona();
  const toneSelect = document.getElementById('setting-writing-tone');
  if (toneSelect && typeof getWritingTone === 'function') toneSelect.value = getWritingTone();
  const emojiSelect = document.getElementById('setting-emoji-level');
  if (emojiSelect && typeof getEmojiLevel === 'function') emojiSelect.value = getEmojiLevel();
  if (typeof bindGenerationOptionEvents === 'function') bindGenerationOptionEvents();
}

// 글 재료 — textarea 5개를 한 번에 쌓지 않고 탭으로 나눈다.
// textarea id는 그대로 유지하고, saveMaterial()/loadMaterialIntoForm()(editor.js)을 그대로 재사용한다.
const MATERIAL_TABS = [
  { key: 'situation', label: '상황', id: 'mat-situation',  ph: '실제 겪은 상황이 있다면 적어주세요' },
  { key: 'opinion',   label: '의견', id: 'mat-opinion',    ph: '이 주제에 대한 나의 의견' },
  { key: 'criteria',  label: '비교', id: 'mat-criteria',   ph: '무엇을 기준으로 비교했는지' },
  { key: 'cons',      label: '주의', id: 'mat-cons',       ph: '조심해야 할 점' },
  { key: 'mustline',  label: '문장', id: 'mat-mustline',   ph: '이 문장은 꼭 넣어주세요' }
];
function toggleMaterialOptions() {
  const tabsHtml = MATERIAL_TABS.map((t, i) =>
    `<button class="btn ${i===0?'btn-secondary':'btn-ghost'}" style="flex:1;min-height:34px;font-size:12px;margin-top:0;" id="mat-tab-btn-${t.key}" onclick="switchMaterialTab('${t.key}')">${t.label}</button>`
  ).join('');
  const panelsHtml = MATERIAL_TABS.map((t, i) =>
    `<div id="mat-tab-panel-${t.key}" style="display:${i===0?'block':'none'};">
      <textarea id="${t.id}" placeholder="${t.ph}"></textarea>
    </div>`
  ).join('');
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1c2434;">글 재료 (선택)</h3>` +
    `<p class="hint" style="margin-top:0;">실제 경험이 있으면 적어주세요. 없으면 AI가 일반적인 내용으로 작성합니다.</p>
    <div style="display:flex;gap:4px;margin-top:8px;">${tabsHtml}</div>
    <div style="margin-top:8px;">${panelsHtml}</div>
    <!-- 기존 editor.js가 참조하는 레거시 id 유지 (숨김) -->
    <textarea id="mat-around-case" style="display:none;"></textarea>
    <textarea id="mat-pros" style="display:none;"></textarea>
    <textarea id="mat-conclusion" style="display:none;"></textarea>
    <textarea id="mat-photo-desc" style="display:none;"></textarea>
    <textarea id="mat-verified-source" style="display:none;"></textarea>
    <textarea id="mat-reader-question" style="display:none;"></textarea>
    <button class="btn btn-secondary" onclick="saveMaterial()">재료 저장하기</button>
    <p class="hint" id="material-saved-hint" style="display:none;color:#16a34a;">저장되었습니다</p>
    <button class="btn btn-ghost" style="margin-top:8px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
  if (typeof loadMaterialIntoForm === 'function') loadMaterialIntoForm();
}
function switchMaterialTab(key) {
  MATERIAL_TABS.forEach(t => {
    const panel = document.getElementById('mat-tab-panel-' + t.key);
    const btn   = document.getElementById('mat-tab-btn-' + t.key);
    if (panel) panel.style.display = (t.key === key) ? 'block' : 'none';
    if (btn)   btn.className = 'btn ' + (t.key === key ? 'btn-secondary' : 'btn-ghost');
    if (btn)   btn.style.cssText = 'flex:1;min-height:34px;font-size:12px;margin-top:0;';
  });
}

// 생성된 글 상세(메타 설명/라벨) — 바텀시트에서 CURRENT_POST를 직접 읽어 표시
function showAutowriteDetailSheet() {
  const post = typeof loadLocal === 'function' ? loadLocal(STORAGE_KEYS.CURRENT_POST, null) : null;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => String(s == null ? '' : s));
  const meta = post?.metaDescription || post?.summary || '(없음)';
  const labels = Array.isArray(post?.labels) && post.labels.length ? post.labels.join(', ') : '(없음)';
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">생성된 글 상세</h3>` +
    `<div class="row-between small-sub" style="margin-bottom:2px;"><span>제목</span></div>
    <p class="small-sub" style="margin:0 0 10px;font-size:12px;line-height:1.6;">${esc(post?.title || '(없음)')}</p>
    <div class="row-between small-sub" style="margin-bottom:2px;"><span>메타 설명</span></div>
    <p class="small-sub" style="margin:0 0 10px;font-size:12px;line-height:1.6;">${esc(meta)}</p>
    <div class="row-between small-sub" style="margin-bottom:2px;"><span>라벨</span></div>
    <p class="small-sub" style="margin:0;font-size:12px;">${esc(labels)}</p>` +
    `<button class="btn btn-ghost" style="margin-top:14px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
}
function toggleManualCopy() {
  const post = typeof loadLocal === 'function' ? loadLocal(STORAGE_KEYS.CURRENT_POST, null) : null;
  const imgPrompt = post
    ? (post.imagePrompts?.mainPrompt ||
       (typeof generateImagePrompts === 'function'
         ? generateImagePrompts(post.keyword || '', post.title || '', post.summary || '')?.mainPrompt
         : ''))
    : '';
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => String(s == null ? '' : s));
  const MC_TABS = [
    { key: 'basic', label: '기본 복사' },
    { key: 'image', label: '이미지 문구' },
    { key: 'all',   label: '전체' }
  ];
  const tabsHtml = MC_TABS.map((t, i) =>
    `<button class="btn ${i===0?'btn-secondary':'btn-ghost'}" style="flex:1;min-height:34px;font-size:12px;margin-top:0;" id="mc-tab-btn-${t.key}" onclick="switchManualCopyTab('${t.key}')">${t.label}</button>`
  ).join('');
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1c2434;">수동 복사 (보조)</h3>` +
    `<p class="hint" style="margin-top:0;">자동발행 실패 시 사용하는 보조 기능입니다.</p>
    <div style="display:flex;gap:4px;margin-top:8px;">${tabsHtml}</div>
    <div id="mc-tab-panel-basic" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
      <button class="btn btn-secondary" onclick="handleCopyTitle()">제목 복사</button>
      <button class="btn btn-secondary" onclick="handleCopyMeta()">메타 설명 복사</button>
      <button class="btn btn-secondary" onclick="handleCopyLabels()">라벨/태그 복사</button>
    </div>
    <div id="mc-tab-panel-image" style="margin-top:10px;display:none;">
      <p class="small-sub" style="font-size:11px;background:#f8fafc;padding:8px;border-radius:6px;margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(imgPrompt || (post ? '(프롬프트 없음)' : '(생성된 글이 없습니다)'))}</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button class="btn btn-ghost" onclick="handleCopyImgPrompt()">프롬프트 복사</button>
        <button class="btn btn-ghost" onclick="handleCopyAlt()">alt 문구 복사</button>
      </div>
    </div>
    <div id="mc-tab-panel-all" style="margin-top:10px;display:none;flex-direction:column;gap:8px;">
      <button class="btn btn-primary" onclick="handleCopyHtml()">HTML 전체 복사</button>
      <button class="btn btn-secondary" onclick="handleCopyAll()">전체 패키지 복사</button>
    </div>
    <button class="btn btn-ghost" style="margin-top:10px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
}
function switchManualCopyTab(key) {
  const displayMode = { basic: 'flex', image: 'block', all: 'flex' };
  ['basic', 'image', 'all'].forEach(k => {
    const panel = document.getElementById('mc-tab-panel-' + k);
    const btn   = document.getElementById('mc-tab-btn-' + k);
    if (panel) panel.style.display = (k === key) ? displayMode[k] : 'none';
    if (btn) { btn.className = 'btn ' + (k === key ? 'btn-secondary' : 'btn-ghost'); btn.style.cssText = 'flex:1;min-height:34px;font-size:12px;margin-top:0;'; }
  });
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
  // r9-gui-no-overlap-popup-fix2: 화면 진입 시 남은 오버레이/바텀시트를 먼저 정리한다.
  typeof hardResetUI === 'function' && hardResetUI();

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
  }
  // r9-gui-no-overlap-popup-fix2: 품질검수 팝업은 사용자가 버튼을 눌렀을 때만 열려야 하므로
  // 화면 진입 시 자동으로 renderQualityResult()를 호출해 팝업을 띄우지 않는다.
  // (품질점수 원본 데이터는 그대로 storage에 남아있고, "품질검수" 버튼을 누르면
  //  runQualityCheckAndShow()가 필요할 때 다시 계산/표시한다.)
  const qCard = document.getElementById('quality-result-card');
  if (qCard) { qCard.style.display = 'none'; qCard.classList.remove('active'); }

  updateAutowriteImportStatus();
}

// ── 핫이슈 화면 refresh ──
function refreshHotissueScreen() {
  const kwEl = document.getElementById('hotissue-keyword');
  if (kwEl && kwEl.value.trim() && typeof onHotissueKeywordInput === 'function') {
    onHotissueKeywordInput();
  }
}

// r9-gui-no-overlap-popup-fix2: 가져오기 영역 — 무엇을 가져왔는지 표시한다.
function updateAutowriteImportStatus(source) {
  const el = document.getElementById('autowrite-import-status');
  if (!el) return;
  const aw = document.getElementById('autowrite-keyword');
  const kw = aw && aw.value.trim();
  if (!kw) { el.textContent = '가져온 키워드 없음'; return; }
  const lastHot = (typeof loadLocal === 'function' && typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.LAST_KEYWORD)
    ? loadLocal(STORAGE_KEYS.LAST_KEYWORD, '') : '';
  const src = (source === 'hotissue' || (lastHot && lastHot === kw)) ? '핫이슈' : '직접입력';
  el.textContent = `가져온 키워드: ${kw} · 출처: ${src} · 상태: 적용됨`;
}

// ── syncAutowriteKeyword ──
function syncAutowriteKeyword() {
  const hot = document.getElementById('hotissue-keyword');
  const aw  = document.getElementById('autowrite-keyword');
  if (hot && aw && hot.value.trim()) {
    aw.value = hot.value.trim();
    const edKw = document.getElementById('editor-keyword');
    if (edKw) edKw.value = hot.value.trim();
    updateAutowriteImportStatus('hotissue');
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

  // 첫 화면에는 핵심 5개만 표시하고, 나머지는 요약 문구로 압축한다.
  const coreItems = [
    { label: 'Blogger 연결됨', ok: connected },
    { label: '글 생성 완료',   ok: !!(post && post.title && post.html) },
    { label: '제목/본문',     ok: !!(post && post.title && (post.html || post.contentHtml)) },
    { label: '라벨 있음',     ok: !!(post && Array.isArray(post.labels) && post.labels.length > 0) },
    { label: '예약 시간이 미래', ok: schedFuture }
  ];

  const extraOkCount =
    (score !== null ? 1 : 0) +
    (score !== null && score >= 50 ? 1 : 0) +
    (score !== null && score >= 70 ? 1 : 0) +
    ((post && post.metaDescription && post.metaDescription.length >= 20) ? 1 : 0);

  el.innerHTML = coreItems.map(it =>
    `<div style="display:flex;gap:6px;align-items:center;font-size:12px;padding:3px 0;">
      <span class="status-dot ${it.ok ? 'on' : 'off'}"></span>
      <span style="color:${it.ok ? '#374151' : '#9ca3af'};">${it.label}</span>
    </div>`
  ).join('') +
    `<div class="hint" style="margin-top:6px;">품질점수 ${score !== null ? score + '점' : '검수 전'} · 상세 항목 ${extraOkCount}/4 통과 (품질검수/50점/70점/메타설명)</div>`;
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

  const post         = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const contentArea  = document.getElementById('pubmgmt-content-area');
  const actionFull   = document.getElementById('pubmgmt-action-full');
  const actionEmpty  = document.getElementById('pubmgmt-action-empty');
  const menuFull     = document.getElementById('pubmgmt-menu-full');
  const menuEmpty    = document.getElementById('pubmgmt-menu-empty');
  // r9-gui-mobile-layout-reset-fix2: 글이 없어도 같은 3카드 구조를 유지하되,
  // 별도의 4번째 안내 카드를 추가하지 않고 카드2/카드3 내부만 empty 상태로 전환한다.
  if (contentArea) contentArea.style.display = 'block';
  if (!post) {
    if (actionFull)  actionFull.style.display  = 'none';
    if (actionEmpty) actionEmpty.style.display = 'block';
    if (menuFull)    menuFull.style.display    = 'none';
    if (menuEmpty)   menuEmpty.style.display   = 'block';
    const titleEl = document.getElementById('pubmgmt-title');
    if (titleEl) titleEl.textContent = '생성된 글 없음';
    const scoreEl = document.getElementById('pubmgmt-score');
    if (scoreEl) scoreEl.textContent = '—';
    const infoEl = document.getElementById('pubmgmt-score-info');
    if (infoEl) infoEl.textContent = '자동작성 탭에서 글을 먼저 만들어주세요.';
    const draftBtn = document.getElementById('btn-draft-save');
    const schedBtn = document.getElementById('btn-schedule-save');
    if (draftBtn) draftBtn.className = 'btn btn-disabled';
    if (schedBtn) schedBtn.className = 'btn btn-disabled';
    return;
  }
  if (actionFull)  actionFull.style.display  = 'block';
  if (actionEmpty) actionEmpty.style.display = 'none';
  if (menuFull)    menuFull.style.display    = 'block';
  if (menuEmpty)   menuEmpty.style.display   = 'none';

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

// 발행관리 화면에서 Blogger 연결 카드를 제거한 대신,
// 임시저장/예약발행 클릭 시 미연결이면 안내 팝업만 띄운다.
// 실제 저장/예약 로직은 기존 handleSaveDraft()/handleSchedule()(blogger.js) 그대로 호출한다.
function isBloggerConnectedForPubmgmt() {
  const connected = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTED, false);
  const connMode  = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, '');
  return connected && connMode === API_MODE.WORKER;
}
function showBloggerConnectGuideSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">Blogger 연결 필요</h3>` +
    `<p style="font-size:13px;color:#6b7280;margin:0 0 16px;line-height:1.6;">설정 &gt; 연결 설정에서 Blogger 연결을 확인하세요.</p>` +
    `<div style="display:flex;flex-direction:column;gap:8px;">
      <button class="btn btn-primary" onclick="uiCloseBottomSheet();safeGoScreen('settings')">설정 &gt; 연결 설정으로 이동</button>
      <button class="btn btn-ghost" onclick="uiCloseBottomSheet();">닫기</button>
    </div>`
  );
}
function handlePubmgmtDraftClick() {
  if (!isBloggerConnectedForPubmgmt()) { showBloggerConnectGuideSheet(); return; }
  if (typeof handleSaveDraft === 'function') handleSaveDraft();
}
// 예약발행은 버튼 클릭 후 바텀시트에서 날짜/시간을 선택한다.
function handlePubmgmtScheduleTrigger() {
  if (!isBloggerConnectedForPubmgmt()) { showBloggerConnectGuideSheet(); return; }
  showPubmgmtScheduleSheet();
}
function showPubmgmtScheduleSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">예약발행</h3>` +
    `<label style="margin-top:0;">예약 날짜 / 시간</label>
    <div class="field-row">
      <div><input type="date" id="schedule-date"></div>
      <div><input type="time" id="schedule-time"></div>
    </div>` +
    `<div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">
      <button class="btn btn-primary" onclick="confirmPubmgmtSchedule()">예약 확정</button>
      <button class="btn btn-ghost" onclick="uiCloseBottomSheet();">취소</button>
    </div>`
  );
}
async function confirmPubmgmtSchedule() {
  if (typeof handleSchedule === 'function') { await handleSchedule(); }
  uiCloseBottomSheet();
}

// 품질점수 상세 팝업 닫기
function closeQualityResultCard() {
  const el = document.getElementById('quality-result-card');
  if (el) el.style.display = 'none';
}

// Blogger 글 목록 / 최근 생성 글은 공통 바텀시트로 열림
// (pubmgmt 화면 자체는 핵심 요소만 남기고 고정, 목록은 바텀시트 내부에서만 스크롤)
function showBloggerListSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">Blogger 글 목록</h3>` +
    `<p class="hint" style="margin-top:0;">최근 5건만 표시합니다.</p>` +
    `<button class="btn btn-ghost" style="font-size:13px;" onclick="handleLoadBloggerListLimited()">목록 새로 고침</button>` +
    `<div id="blogger-saved-list" style="margin-top:8px;"><p class="small-sub">목록을 불러오려면 위 버튼을 눌러주세요.</p></div>` +
    `<button class="btn btn-ghost" style="margin-top:8px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
}
// blogger.js의 handleLoadBloggerList()는 그대로 재사용하되,
// 바텀시트 내부 스크롤을 만들지 않기 위해 렌더링된 목록을 최근 5건으로만 자른다.
function handleLoadBloggerListLimited() {
  if (typeof handleLoadBloggerList !== 'function') return;
  handleLoadBloggerList().then(() => {
    const listEl = document.getElementById('blogger-saved-list');
    if (!listEl) return;
    const items = listEl.querySelectorAll('.list-item');
    items.forEach((el, idx) => { if (idx >= 5) el.style.display = 'none'; });
  });
}

function showRecentPostsSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">최근 생성 글</h3>` +
    `<p class="hint" style="margin-top:0;">최근 5건까지 저장됩니다.</p>` +
    `<div id="recent-posts-list"><p class="small-sub">저장된 글이 없습니다.</p></div>` +
    `<button class="btn btn-ghost" onclick="handleClearRecentPosts()" style="margin-top:8px;font-size:12px;color:#dc2626;">전체 삭제</button>` +
    `<button class="btn btn-ghost" style="margin-top:8px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
  if (typeof renderRecentPostsList === 'function') renderRecentPostsList();
}

// r9-gui-hard-reset-layout-fix: 발행관리 본문에는 "발행 전 체크"와 "기타 메뉴" 버튼만 두고,
// 수동 복사 / Blogger 글 목록 / 최근 생성 글은 기타 메뉴 바텀시트 안에서 연다.
function showPubmgmtMoreMenuSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1c2434;">기타 메뉴</h3>` +
    `<div class="settings-menu-row" onclick="uiCloseBottomSheet();toggleManualCopy();">
      <span class="smr-icon">복</span><span class="smr-label">수동 복사 (보조)</span><span class="smr-arrow">›</span>
    </div>
    <div class="settings-menu-row" onclick="uiCloseBottomSheet();showBloggerListSheet();">
      <span class="smr-icon">목</span><span class="smr-label">Blogger 글 목록</span><span class="smr-arrow">›</span>
    </div>
    <div class="settings-menu-row" style="border-bottom:none;" onclick="uiCloseBottomSheet();showRecentPostsSheet();">
      <span class="smr-icon">최</span><span class="smr-label">최근 생성 글</span><span class="smr-arrow">›</span>
    </div>` +
    `<button class="btn btn-ghost" style="margin-top:8px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
}

// r9-gui-layout-lock-fix4: 발행 전 체크리스트도 공통 바텀시트로 열림
// (renderPubmgmtChecklist는 refreshPubmgmtScreen 안에서 null-safe하게 호출되므로,
//  시트를 먼저 열어 #pubmgmt-checklist-list를 만든 뒤 refreshPubmgmtScreen()을 재호출해 채운다.)
function showPubmgmtChecklistSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">발행 전 체크</h3>` +
    `<div id="pubmgmt-checklist-list" style="display:flex;flex-direction:column;gap:5px;font-size:13px;"></div>` +
    `<button class="btn btn-ghost" style="margin-top:10px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
  if (typeof refreshPubmgmtScreen === 'function') refreshPubmgmtScreen();
}

// ── 설정 화면 refresh (Worker 버전 표시 추가) ──
function refreshSettingsScreenExtra() {
  const verEl = document.getElementById('settings-worker-version');
  const aiEl  = document.getElementById('settings-ai-provider');
  const aiInlineEl = document.getElementById('settings-ai-provider-inline');
  const status = loadLocal(STORAGE_KEYS.WORKER_STATUS, null);
  if (verEl && status?.version) verEl.textContent = status.version;
  const aiText = (status && status.aiProviders)
    ? (Object.entries(status.aiProviders).filter(([,v])=>v).map(([k])=>k).join(', ') || '연결 안 됨')
    : '연결 안 됨';
  if (aiEl) aiEl.textContent = aiText;
  if (aiInlineEl) aiInlineEl.textContent = aiText;

  // 연결 설정 안에 Blogger/Naver 상태도 함께 표시
  const mode      = typeof getApiMode === 'function' ? getApiMode() : '';
  const workerOk  = mode === API_MODE.WORKER;
  const connected = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTED, false);
  const connMode  = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, '');
  const bloggerOk = connected && connMode === API_MODE.WORKER;
  const blogName  = loadLocal('bloggerBlogName', '');

  const bgEl = document.getElementById('settings-blogger-status-badge');
  if (bgEl) { bgEl.textContent = bloggerOk ? '연결됨' : '미연결'; bgEl.className = bloggerOk ? 'badge success' : 'badge'; }
  const bnEl = document.getElementById('settings-blogger-blog-name');
  if (bnEl) bnEl.textContent = blogName || '—';
  const nvEl = document.getElementById('settings-naver-status-badge');
  if (nvEl) { nvEl.textContent = workerOk ? '연결됨' : '미확인'; nvEl.className = workerOk ? 'badge success' : 'badge'; }
}

// 설정 화면에서 Blogger 연결 확인 (기존 handleBloggerConnect 재사용)
function handleBloggerConnectFromSettings() {
  if (typeof handleBloggerConnect === 'function') {
    handleBloggerConnect().then(() => refreshSettingsScreenExtra()).catch(() => refreshSettingsScreenExtra());
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

  if (sbMode)    { sbMode.textContent = workerOk ? 'Worker' : 'Mock'; }
  if (sbScreen)  {
    const screenNames = { dashboard:'홈', hotissue:'핫이슈', autowrite:'자동작성', pubmgmt:'발행관리', settings:'설정', preview:'미리보기' };
    sbScreen.textContent = screenNames[currentScreen] || currentScreen;
  }
  if (sbWorker)  { sbWorker.innerHTML  = '<span class="status-dot ' + (workerOk  ? 'on' : 'off') + '"></span>W';  sbWorker.title  = workerOk  ? 'Worker 연결됨' : 'Worker 미연결'; }
  if (sbAi)      { sbAi.innerHTML      = '<span class="status-dot ' + (workerOk  ? 'on' : 'off') + '"></span>AI'; sbAi.title      = 'AI 상태'; }
  if (sbBlogger) { sbBlogger.innerHTML = '<span class="status-dot ' + (bloggerOk ? 'on' : 'off') + '"></span>B';  sbBlogger.title = bloggerOk ? 'Blogger 연결됨' : 'Blogger 미연결'; }
  if (sbNaver)   { sbNaver.innerHTML   = '<span class="status-dot ' + (workerOk  ? 'on' : 'off') + '"></span>N';  sbNaver.title   = 'Naver 상태'; }
}

// ── 바텀시트 열기/닫기 ──
// r9-gui-final-safari-stability-fix: close→즉시 reopen 패턴(설정 하위 메뉴 등)에서
// 이전 닫기 타이머가 뒤늦게 발동해 방금 연 시트/overlay를 강제로 숨기는 경쟁 상태를 막는다.
let _bottomSheetCloseTimer = null;
function openBottomSheet(contentHtml) {
  const overlay = document.getElementById('bottom-sheet-overlay');
  const sheet   = document.getElementById('bottom-sheet');
  const content = document.getElementById('bottom-sheet-content');
  if (!sheet || !overlay) return;
  if (_bottomSheetCloseTimer) { clearTimeout(_bottomSheetCloseTimer); _bottomSheetCloseTimer = null; }
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
  if (_bottomSheetCloseTimer) clearTimeout(_bottomSheetCloseTimer);
  _bottomSheetCloseTimer = setTimeout(() => {
    sheet.style.display   = 'none';
    overlay.style.display = 'none';
    _bottomSheetCloseTimer = null;
  }, 260);
}

// hardResetUI(ui.js)가 즉시 닫을 때, 뒤늦게 발동할 수 있는 예약된 닫기 타이머도 함께 정리한다.
function cancelBottomSheetCloseTimer() {
  if (_bottomSheetCloseTimer) { clearTimeout(_bottomSheetCloseTimer); _bottomSheetCloseTimer = null; }
}

// 저장 성공 후 상태바도 갱신
// r9-gui-overlap-navigation-fix: 저장 결과를 본문 카드에 길게 남기지 않고 바텀시트로 표시한다.
const _origShowPubmgmtSaveResult = typeof showPubmgmtSaveResult === 'function' ? showPubmgmtSaveResult : null;
function showPubmgmtSaveResult(result, type) {
  const isFail = type && type.includes('fail');
  const typeLabel = type === 'draft' ? '임시저장' : type === 'schedule' ? '예약발행' : '저장';
  const now  = new Date().toLocaleString('ko-KR');
  const postId = result?.postId || result?.id || '';
  const url    = result?.url    || '';
  const score  = loadLocal(STORAGE_KEYS.QUALITY_SCORE, null);
  const err    = result?.error  || '';

  let bodyHtml;
  if (isFail) {
    bodyHtml = `<div style="color:#dc2626;font-weight:700;">${typeLabel} 실패</div>
      <div class="small-sub" style="margin-top:6px;">${err}</div>`;
  } else {
    bodyHtml = `<div style="color:#16a34a;font-weight:700;">${typeLabel} 완료</div>
      <div class="row-between small-sub" style="margin-top:6px;"><span>저장 시간</span><span>${now}</span></div>
      ${score !== null ? `<div class="row-between small-sub" style="margin-top:4px;"><span>품질점수</span><span>${score}점</span></div>` : ''}
      ${postId ? `<div class="row-between small-sub" style="margin-top:4px;"><span>postId</span><span style="font-size:10px;">${postId}</span></div>` : ''}
      ${url ? `<div style="margin-top:8px;"><a href="${url}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#2563eb;">원문/관리 링크 ↗</a></div>` : ''}`;
  }
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">저장 결과</h3>` +
    bodyHtml +
    `<button class="btn btn-ghost" style="margin-top:14px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
  // r9-gui-hard-reset-layout-fix: 본문에는 짧은 요약 한 줄만 남긴다 (예: "임시저장 완료 · 88점")
  const summaryEl = document.getElementById('pubmgmt-last-save-summary');
  if (summaryEl) {
    const scoreTxt = score !== null ? ` · ${score}점` : '';
    summaryEl.textContent = isFail ? `${typeLabel} 실패` : `${typeLabel} 완료${scoreTxt}`;
  }
  // 상태바도 갱신
  updateStatusBar();
}


// refreshDashboard 오버라이드: 상태바 갱신 추가
const _origRefreshDashboard = typeof refreshDashboard === 'function' ? refreshDashboard : null;

// 생성 진행 오버레이 / 품질점수 상세 / 메타·라벨 팝업이
// 보일 때만 공통 배경(#popup-overlay-backdrop)을 함께 보여준다.
// editor.js/quality-check.js가 각 요소의 class/style을 그대로 토글하는 방식을 유지하고,
// 여기서는 그 변화를 관찰만 해서 배경 표시 여부만 동기화한다(내부 로직은 건드리지 않음).
(function initPopupOverlayBackdrop() {
  const backdrop = document.getElementById('popup-overlay-backdrop');
  if (!backdrop) return;
  const watchIds = ['generate-progress-box', 'quality-result-card', 'hotissue-raw-area'];
  const isAnyVisible = () => watchIds.some(id => {
    const el = document.getElementById(id);
    if (!el) return false;
    return window.getComputedStyle(el).display !== 'none';
  });
  const sync = () => { backdrop.style.display = isAnyVisible() ? 'block' : 'none'; };
  watchIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  });
  sync();
})();

// 핫이슈 결과/원문 영역 한 화면 요약형 후처리
// (hotissue.js의 renderHotissueResult()/renderRawItems() 출력 결과를 건드리지 않고
//  렌더링 완료 후 DOM만 다듬는다: 이모지 중심 표시 제거 + 블로그/웹문서 각 2건으로 축소)
const HOTISSUE_EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}]/gu;

function stripEmojiTextIn(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach(node => {
    if (!HOTISSUE_EMOJI_RE.test(node.nodeValue)) return;
    HOTISSUE_EMOJI_RE.lastIndex = 0;
    node.nodeValue = node.nodeValue.replace(HOTISSUE_EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
  });
}

function compactHotissueRawList(container, max) {
  if (!container) return;
  // hotissue.js의 renderRawItems()는 [라벨 <p>, 아이템 <div>...] 형태로 렌더링한다.
  const children = Array.from(container.children).filter(el => el.tagName === 'DIV');
  // 새 검색으로 목록 자체가 바뀌면(첫 항목 제목/건수 변경) 요약 문구를 다시 계산한다.
  const sig = children.length + '|' + (children[0]?.textContent.slice(0, 20) || '');
  if (container.dataset.hiSig === sig) return;
  container.dataset.hiSig = sig;
  if (children.length <= max) return;
  children.forEach((el, idx) => { if (idx >= max) el.style.display = 'none'; });
  const old = container.querySelector('.hi-more-note');
  if (old) old.remove();
  // "더보기"로 전체를 펼치지 않고, 짧은 요약 문구만 남긴다.
  const note = document.createElement('p');
  note.className = 'small-sub hi-more-note';
  note.style.cssText = 'font-size:11px;margin:4px 0 0;color:#9ca3af;';
  note.textContent = `총 ${children.length}건 중 ${max}건 표시 · 추가 결과는 다음 버전에서 확인`;
  container.appendChild(note);
}

// r9-gui-no-overlap-popup-fix3: rawBlog/rawWeb의 아이템 DOM(제목/설명/링크)만 읽어서
// app.js가 직접 최대 max개짜리 요약 HTML을 구성한다. hotissue.js의 원본 HTML(더보기 토글
// 버튼 포함)은 그대로 쓰지 않는다 — 바텀시트 안에서 hotissue-raw-area 고정 팝업이
// 다시 열리는 것을 막기 위함이다.
function extractRawItemSummaryHtml(container, max) {
  if (!container) return '<p class="small-sub" style="margin:4px 0;">결과 없음</p>';
  const items = Array.from(container.children)
    .filter(el => el.tagName === 'DIV' && el.style.display !== 'none')
    .slice(0, max);
  if (!items.length) return '<p class="small-sub" style="margin:4px 0;">결과 없음</p>';
  return items.map(el => {
    const rows  = Array.from(el.children).filter(c => c.tagName === 'DIV');
    const title = rows[0]?.textContent.trim() || '';
    const desc  = rows[1]?.textContent.trim() || '';
    const link  = el.querySelector('a')?.getAttribute('href') || '';
    return `<div style="padding:6px 0;border-bottom:1px solid #f1f5f9;">
      <div style="font-size:12.5px;font-weight:600;line-height:1.4;">${escapeHtml(title)}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(desc)}</div>
      ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:#2563eb;">원문보기 ↗</a>` : ''}
    </div>`;
  }).join('');
}

// r9-gui-no-overlap-popup-fix2/fix3: 핫이슈 검색 결과를 본문에 길게 펼치지 않고,
// 짧은 요약(키워드/점수/건수) + "결과 보기" 버튼만 본문에 남긴다.
// 바텀시트에 넣을 내용은 app.js가 직접 한 화면 요약형으로 구성해 dataset에 저장한다.
function compactHotissueMainResult(area) {
  if (!area || !area.innerHTML.trim()) return;
  if (area.querySelector('.hi-compacted-wrap')) return; // 이미 처리됨(무한 루프 방지)

  const fullHtml    = area.innerHTML;
  const scoreText   = area.querySelector('div[style*="border-radius:50%"]')?.textContent.trim() || '';
  const keywordText = area.querySelector('div[style*="font-weight:800;font-size:16px"]')?.textContent.trim() || '';
  const badgeTexts  = Array.from(area.querySelectorAll('span[style*="background:rgba(255,255,255,0.8)"]')).map(s => s.textContent.trim());

  if (!scoreText) {
    // 예상한 구조가 아니면(검색 결과 없음 안내 등) 원본을 그대로 둔다.
    area.innerHTML = `<div class="hi-compacted-wrap">${fullHtml}</div>`;
    return;
  }

  const rawBlog = document.getElementById('hotissue-raw-blog');
  const rawWeb  = document.getElementById('hotissue-raw-web');
  const sheetBodyHtml =
    `<div class="row-between" style="margin-bottom:4px;">
      <span style="font-weight:700;font-size:14px;">${escapeHtml(keywordText)}</span>
      <span style="font-weight:800;color:#2563eb;">${escapeHtml(scoreText)}</span>
    </div>
    <p class="small-sub" style="margin:0 0 10px;">${escapeHtml(badgeTexts.join(' · '))}</p>
    <p class="small-sub" style="font-weight:700;margin:0 0 2px;">블로그</p>
    ${extractRawItemSummaryHtml(rawBlog, 2)}
    <p class="small-sub" style="font-weight:700;margin:8px 0 2px;">웹문서</p>
    ${extractRawItemSummaryHtml(rawWeb, 2)}`;
  area.dataset.hiSheetHtml = encodeURIComponent(sheetBodyHtml);

  area.innerHTML =
    `<div class="hi-compacted-wrap card" style="padding:10px 12px;">
      <div class="row-between" style="margin-bottom:2px;">
        <span style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">${keywordText}</span>
        <span style="font-weight:800;color:#2563eb;font-size:13px;">${scoreText}</span>
      </div>
      <p class="small-sub" style="margin:2px 0 8px;">${badgeTexts.join(' · ')}</p>
      <button class="btn btn-primary" style="font-size:13px;" onclick="showHotissueResultSheet()">결과 보기</button>
    </div>`;
}

// r9-gui-no-overlap-popup-fix3: 바텀시트 내용은 app.js가 직접 만든 요약 HTML만 사용한다.
// (hotissue.js의 "검색 결과 보기 ▼" 토글 버튼은 포함하지 않으므로 hotissue-raw-area
//  고정 팝업이 바텀시트 위에 다시 열리는 일이 없다)
function showHotissueResultSheet() {
  const area = document.getElementById('hotissue-result-area');
  const stored = area && area.dataset.hiSheetHtml;
  if (!stored) return;
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">핫이슈 검색 결과</h3>` +
    decodeURIComponent(stored) +
    `<button class="btn btn-ghost" style="margin-top:12px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
}

function compactHotissueResultDom() {
  const resultArea = document.getElementById('hotissue-result-area');
  const rawBlog     = document.getElementById('hotissue-raw-blog');
  const rawWeb       = document.getElementById('hotissue-raw-web');
  if (rawBlog) { stripEmojiTextIn(rawBlog); compactHotissueRawList(rawBlog, 2); }
  if (rawWeb)  { stripEmojiTextIn(rawWeb);  compactHotissueRawList(rawWeb, 2); }
  if (resultArea) { stripEmojiTextIn(resultArea); compactHotissueMainResult(resultArea); }
}

// r9-gui-mobile-layout-reset-fix1: 확장 검색 키워드(10개) 카드를 본문에 길게 펼치지 않는다.
// hotissue.js가 매 검색마다 #hotissue-expand-list.innerHTML을 다시 채우므로,
// 그 요소 자체는 삭제/치환하지 않고 화면에서만 숨긴 뒤, 요약 줄 + "보기" 버튼을 추가한다.
function compactHotissueExpandCard() {
  const card = document.getElementById('hotissue-expand-card');
  const list = document.getElementById('hotissue-expand-list');
  if (!card || !list || !list.innerHTML.trim()) return;

  const h2 = card.querySelector('h2');
  if (h2 && h2.style.display !== 'none') h2.style.display = 'none';
  if (list.style.display !== 'none') list.style.display = 'none';

  const count = list.querySelectorAll('span').length;
  let summary = card.querySelector('.hi-expand-summary-row');
  if (!summary) {
    summary = document.createElement('div');
    summary.className = 'row-between hi-expand-summary-row';
    summary.style.cssText = 'align-items:center;';
    summary.innerHTML = `<span class="small-sub" style="font-weight:700;">확장 검색 키워드</span>
      <button class="btn btn-ghost" style="font-size:12px;min-height:28px;padding:0 10px;margin:0;" onclick="showHotissueExpandSheet()"></button>`;
    card.insertBefore(summary, card.firstChild);
  }
  const btn = summary.querySelector('button');
  if (btn) btn.textContent = `${count}개 보기`;
}

function showHotissueExpandSheet() {
  const list = document.getElementById('hotissue-expand-list');
  if (!list || !list.innerHTML.trim()) return;
  const spans = Array.from(list.querySelectorAll('span'));
  const shown = spans.slice(0, 5).map(s => s.outerHTML).join('');
  const note = spans.length > 5
    ? `<p class="small-sub" style="font-size:11px;margin:6px 0 0;color:#9ca3af;">총 ${spans.length}개 중 5개 표시</p>`
    : '';
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">확장 검색 키워드</h3>` +
    `<div style="line-height:2;">${shown}</div>` +
    note +
    `<button class="btn btn-ghost" style="margin-top:12px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
}

function initHotissueResultCompactor() {
  const resultArea = document.getElementById('hotissue-result-area');
  const rawArea     = document.getElementById('hotissue-raw-area');
  const expandList  = document.getElementById('hotissue-expand-list');
  if (!resultArea && !rawArea && !expandList) return;
  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; compactHotissueResultDom(); compactHotissueExpandCard(); }, 0);
  };
  if (resultArea) new MutationObserver(run).observe(resultArea, { childList: true, subtree: true });
  if (rawArea)    new MutationObserver(run).observe(rawArea, { childList: true, subtree: true });
  if (expandList) new MutationObserver(run).observe(expandList, { childList: true });
}

// r9-gui-mobile-layout-reset: 홈 화면 "최근 생성 글" 카드는 최근 1건 + 요약 문구만 남긴다.
// blogger.js의 refreshDashboard()가 만드는 목록(.list-item)을 건드리지 않고,
// 렌더링 이후 DOM만 후처리한다.
function compactDashboardRecentList(listEl) {
  if (!listEl) return;
  const items = Array.from(listEl.children).filter(el => el.classList && el.classList.contains('list-item'));
  const sig = items.length + '|' + (items[0]?.textContent.slice(0, 20) || '');
  if (listEl.dataset.dashSig === sig) return;
  listEl.dataset.dashSig = sig;
  if (items.length <= 1) return;
  items.forEach((el, idx) => { if (idx >= 1) el.style.display = 'none'; });
  const old = listEl.querySelector('.dash-more-note');
  if (old) old.remove();
  const note = document.createElement('p');
  note.className = 'small-sub dash-more-note';
  note.style.cssText = 'font-size:11px;margin:4px 0 0;color:#9ca3af;';
  note.textContent = `외 ${items.length - 1}건 더 · 발행관리 탭에서 확인`;
  listEl.appendChild(note);
}

function initDashboardRecentListCompactor() {
  const listEl = document.getElementById('dash-recent-list');
  if (!listEl) return;
  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; compactDashboardRecentList(listEl); }, 0);
  };
  new MutationObserver(run).observe(listEl, { childList: true });
}

// r9-gui-mobile-layout-reset-fix2: editor.js의 showAiGenerationFailure()가
// #autowrite-ai-fail-card를 display:block으로 바꾸는 순간을 가로채서,
// 본문 카드로 남기지 않고 즉시 숨긴 뒤 같은 메시지를 바텀시트로 보여준다.
// editor.js의 실패 판단/메시지 생성 로직은 전혀 건드리지 않는다.
function initAutowriteAiFailWatcher() {
  const card = document.getElementById('autowrite-ai-fail-card');
  if (!card) return;
  new MutationObserver(() => {
    if (card.style.display === 'block') {
      const reasonEl = document.getElementById('autowrite-ai-fail-reason');
      const msg = reasonEl ? reasonEl.textContent : '';
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => String(s == null ? '' : s));
      card.style.display = 'none';
      uiOpenBottomSheet(
        `<h3 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#991b1b;">AI 생성 실패 / Worker 설정 필요</h3>` +
        `<p class="small-sub" style="color:#7f1d1d;margin:0 0 12px;">${esc(msg)}</p>` +
        `<div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn btn-secondary" onclick="uiCloseBottomSheet();safeGoScreen('settings')">설정으로 이동</button>
          <button class="btn btn-ghost" onclick="uiCloseBottomSheet();">닫기</button>
        </div>`
      );
    }
  }).observe(card, { attributes: true, attributeFilter: ['style'] });
}

// r9-gui-mobile-base-hardening-fix3: 품질검수 상세 문제 목록은 CSS(#quality-gap-list
// > div:nth-child(n+4))가 이미 4번째부터 숨긴다. 여기서는 숨겨진 개수만큼
// "외 N개 항목" 요약 문구를 붙인다. quality-check.js는 수정하지 않는다.
function annotateQualityGapList(gapEl) {
  if (!gapEl) return;
  const items = Array.from(gapEl.children).filter(el => el.tagName === 'DIV');
  const sig = items.length + '|' + (items[0]?.textContent.slice(0, 20) || '');
  if (gapEl.dataset.qcSig === sig) return;
  gapEl.dataset.qcSig = sig;
  const old = gapEl.querySelector('.qc-more-note');
  if (old) old.remove();
  if (items.length > 3) {
    const note = document.createElement('p');
    note.className = 'small-sub qc-more-note';
    note.style.cssText = 'font-size:11px;margin:4px 0 0;color:#9ca3af;';
    note.textContent = `외 ${items.length - 3}개 항목`;
    gapEl.appendChild(note);
  }
}

function initQualityGapListAnnotator() {
  const gapEl = document.getElementById('quality-gap-list');
  if (!gapEl) return;
  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; annotateQualityGapList(gapEl); }, 0);
  };
  new MutationObserver(run).observe(gapEl, { childList: true });
}

// r9-gui-mobile-base-hardening-fix3: 미리보기 화면은 editor.js가 post.html(전체 본문)을
// #preview-content에 그대로 채운다. 여기서는 editor.js를 수정하지 않고, 채워진 뒤
// 제목/요약/점수 중심의 짧은 카드로 바꾸고, 전체 본문은 "본문 요약 보기" 바텀시트에서
// 텍스트만 축약해 보여준다.
function compactPreviewContent(contentEl) {
  if (!contentEl || contentEl.style.display === 'none' || !contentEl.innerHTML.trim()) return;
  if (contentEl.querySelector('.hi-preview-compacted')) return; // 이미 처리됨(재처리 방지)
  const fullHtml = contentEl.innerHTML;

  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => String(s == null ? '' : s));
  const post  = typeof loadLocal === 'function' ? loadLocal(STORAGE_KEYS.CURRENT_POST, null) : null;
  const score = typeof loadLocal === 'function' ? loadLocal(STORAGE_KEYS.QUALITY_SCORE, null) : null;
  const title = post?.title || '(제목 없음)';
  const summaryText = post?.metaDescription || post?.summary || (contentEl.textContent || '').trim().slice(0, 150);

  contentEl.dataset.hiPreviewFullHtml = encodeURIComponent(fullHtml);
  contentEl.innerHTML =
    `<div class="hi-preview-compacted card" style="padding:10px 12px;margin:0;">
      <p style="font-weight:700;font-size:14px;line-height:1.4;margin:0 0 6px;">${esc(title)}</p>
      <p class="small-sub" style="margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${esc(summaryText)}</p>
      <div class="row-between small-sub"><span>품질점수</span><b>${score !== null ? score + '점' : '검수 전'}</b></div>
      <button class="btn btn-ghost" style="margin-top:8px;font-size:12px;" onclick="showPreviewBodySummarySheet()">본문 요약 보기</button>
    </div>`;
}

function showPreviewBodySummarySheet() {
  const contentEl = document.getElementById('preview-content');
  const stored = contentEl && contentEl.dataset.hiPreviewFullHtml;
  if (!stored) return;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => String(s == null ? '' : s));
  const tmp = document.createElement('div');
  tmp.innerHTML = decodeURIComponent(stored);
  const text = (tmp.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 600);
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1c2434;">본문 요약</h3>` +
    `<p class="small-sub" style="line-height:1.6;">${esc(text)}${text.length >= 600 ? '…' : ''}</p>` +
    `<button class="btn btn-ghost" style="margin-top:12px;" onclick="uiCloseBottomSheet();">닫기</button>`
  );
}

function initPreviewContentCompactor() {
  const contentEl = document.getElementById('preview-content');
  if (!contentEl) return;
  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; compactPreviewContent(contentEl); }, 0);
  };
  new MutationObserver(run).observe(contentEl, { childList: true, attributes: true, attributeFilter: ['style'] });
}
