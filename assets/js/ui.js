// ui.js — v0.0.9
// 화면 전환 / 토스트 / 탭 활성화
// classList + style.display 동시 제어로 Safari 화면 겹침 완전 차단

function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=> t.classList.remove('show'), 1800);
}

// ★ 화면 전환 핵심: classList와 style.display 동시 제어
// r8: 구버전 화면 이름 alias — 없는 화면 이동 시 빈 화면 방지
const SCREEN_ALIAS = {
  keyword: 'hotissue',
  material: 'autowrite',
  editor: 'autowrite',
  quality: 'autowrite',
  blogger: 'pubmgmt',
  publish: 'pubmgmt',
  briefing: 'dashboard'
};

// r9-gui-hard-reset-layout-fix: 화면 이동 전/후 UI 잠금 상태를 강제로 초기화한다.
// (editor.js/quality-check.js 등의 내부 생성 로직(isGenerating, currentPost 등)은 건드리지 않고,
//  화면에 남아 클릭을 막을 수 있는 오버레이 DOM/클래스 상태만 정리한다)
// r9-gui-overlap-navigation-fix에서 쓰던 clearOverlayLock()은 그대로 별칭으로 유지한다.
const HARD_RESET_LOCK_CLASSES = ['modal-open', 'sheet-open', 'overlay-open', 'no-scroll', 'locked'];

function hardResetUI(){
  try {
    // 바텀시트 — 애니메이션 지연 없이 즉시 닫음(전환 중간에 새 화면을 덮지 않도록)
    const sheet    = document.getElementById('bottom-sheet');
    const sOverlay = document.getElementById('bottom-sheet-overlay');
    if (sheet)    { sheet.classList.remove('open'); sheet.style.display = 'none'; }
    if (sOverlay) { sOverlay.classList.remove('open'); sOverlay.style.display = 'none'; }

    // 공통 팝업 배경 / 로딩 오버레이
    ['popup-overlay-backdrop', 'loading-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // 생성 진행 오버레이 / 품질점수 상세 오버레이 / 핫이슈 원문 팝업 — 표시 상태만 닫는다 (내부 로직 미변경)
    ['generate-progress-box', 'quality-result-card', 'hotissue-raw-area'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.classList.remove('active'); el.classList.remove('open'); }
    });

    // body/html/app/screen에 남을 수 있는 잠금 클래스 + pointer-events 차단 해제
    // (login-open은 goScreen이 별도로 관리하므로 건드리지 않는다)
    const lockTargets = [document.body, document.documentElement, document.getElementById('app')]
      .concat(Array.from(document.querySelectorAll('.screen')));
    lockTargets.forEach(el => {
      if (!el) return;
      HARD_RESET_LOCK_CLASSES.forEach(c => el.classList.remove(c));
      if (el.style.pointerEvents === 'none') el.style.pointerEvents = '';
    });
  } catch (e) {
    console.error('hardResetUI error', e);
  }
}

// 이전 버전 호환용 별칭
function clearOverlayLock(){ hardResetUI(); }

function goScreen(name){
  try {
    // alias 변환
    name = SCREEN_ALIAS[name] || name;

    // r9-gui-hard-reset-layout-fix: 화면 전환 전 hard reset
    hardResetUI();

    // 모든 화면 숨김
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });

    let target = document.getElementById('screen-' + name);
    // r8: 없는 화면명이면 dashboard로 fallback
    if (!target) {
      name = 'dashboard';
      target = document.getElementById('screen-dashboard');
    }
    if(target){
      target.classList.add('active');
      target.style.display = 'flex';
    }

    // 로그인 화면 ↔ 일반 화면 body 스크롤 제어
    if(name === 'login'){
      document.body.classList.add('login-open');
    } else {
      document.body.classList.remove('login-open');
    }

    // 탭 활성화
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector('.tab-item[data-tab="' + name + '"]');
    if(tab) tab.classList.add('active');

    window.scrollTo(0, 0);
    refreshCurrentScreen(name);
    // r8: 상태바 현재 화면 업데이트
    typeof updateStatusBar === 'function' && updateStatusBar(name);

    // r9-gui-hard-reset-layout-fix: 화면 전환 직후 한 번 더 hard reset
    // (전환 중 비동기로 열린 오버레이/시트가 있어도 다음 프레임에 확실히 정리)
    requestAnimationFrame(() => hardResetUI());
  } catch (e) {
    console.error('goScreen error', e);
    hardResetUI();
    typeof showToast === 'function' && showToast('화면 전환 중 문제가 발생했습니다. 다시 시도해주세요.');
  }
}

// 탭바 클릭 — 글 생성 중 이탈 확인
function safeGoScreen(name){
  if(typeof isGenerating !== 'undefined' && isGenerating){
    if(!confirm('글 생성 중입니다. 이동하면 결과가 반영되지 않을 수 있습니다. 이동할까요?')) return;
  }
  goScreen(name);
}

// 화면 진입 시 데이터 새로고침
// r9-gui-hard-reset-layout-fix: 개별 화면 refresh 함수 오류가 전체 화면 이동을 막지 않도록 최소 방어
function refreshCurrentScreen(name){
  const call = (fn) => { try { typeof fn === 'function' && fn(); } catch (e) { console.error('refreshCurrentScreen error', name, e); } };
  if(name === 'keyword')   call(typeof refreshKeywordScreen  === 'function' ? refreshKeywordScreen  : null);
  if(name === 'editor')    call(typeof refreshEditorScreen   === 'function' ? refreshEditorScreen   : null);
  if(name === 'quality')   call(typeof refreshQualityScreen  === 'function' ? refreshQualityScreen  : null);
  if(name === 'preview')   call(typeof refreshPreviewScreen  === 'function' ? refreshPreviewScreen  : null);
  if(name === 'blogger')   call(typeof refreshBloggerScreen  === 'function' ? refreshBloggerScreen  : null);
  if(name === 'publish')   call(typeof refreshPublishScreen  === 'function' ? refreshPublishScreen  : null);
  if(name === 'briefing')  call(typeof refreshBriefingScreen === 'function' ? refreshBriefingScreen : null);
  if(name === 'settings')  { call(typeof refreshSettingsScreen === 'function' ? refreshSettingsScreen : null); call(typeof refreshSettingsScreenExtra === 'function' ? refreshSettingsScreenExtra : null); }
  if(name === 'dashboard') call(typeof refreshDashboard      === 'function' ? refreshDashboard      : null);
  if(name === 'hotissue')  call(typeof refreshHotissueScreen  === 'function' ? refreshHotissueScreen  : null);
  if(name === 'autowrite') call(typeof refreshAutowriteScreen === 'function' ? refreshAutowriteScreen : null);
  if(name === 'pubmgmt')   call(typeof refreshPubmgmtScreen   === 'function' ? refreshPubmgmtScreen   : null);
}

/* ============================================================
   r9-mobile-ui-polish-2: 바텀시트 UI 연결 + 연결 상태 패널
   ============================================================ */

// openBottomSheet / closeBottomSheet는 app.js에 정의됨.
// ui.js에서 안전하게 호출하는 래퍼.
function uiOpenBottomSheet(contentHtml) {
  if (typeof openBottomSheet === 'function') openBottomSheet(contentHtml);
}

function uiCloseBottomSheet() {
  if (typeof closeBottomSheet === 'function') closeBottomSheet();
}

// 상태바 클릭 시 연결 상태 바텀시트 패널 표시 (표시 전용 — API 호출 없음)
function showConnectionPanel() {
  const WORKER = typeof API_MODE !== 'undefined' ? API_MODE.WORKER : 'worker';
  const mode      = typeof getApiMode === 'function' ? getApiMode() : '';
  const workerOk  = (mode === WORKER);
  const lc        = typeof loadLocal === 'function';
  const SK        = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS : {};

  // r9-guard: STORAGE_KEYS 기준으로 실제 저장값 사용
  const connected      = lc && SK.BLOGGER_CONNECTED       ? loadLocal(SK.BLOGGER_CONNECTED, false)      : false;
  const connectionMode = lc && SK.BLOGGER_CONNECTION_MODE ? loadLocal(SK.BLOGGER_CONNECTION_MODE, '')   : '';
  const status         = lc && SK.WORKER_STATUS           ? loadLocal(SK.WORKER_STATUS, null)           : null;
  const blogName       = lc ? loadLocal('bloggerBlogName', '') : '';

  // Blogger 실제 연결 기준: connected && Worker 모드
  const bloggerOk = connected && connectionMode === WORKER;

  const verStr = (status && status.version) || '—';
  const aiProv = (status && status.aiProviders)
    ? Object.entries(status.aiProviders).filter(([,v])=>v).map(([k])=>k).join(', ') || '없음'
    : '—';

  // escapeHtml 안전 fallback
  const esc = (typeof escapeHtml === 'function')
    ? escapeHtml
    : (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const dot = ok => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ok?'#16a34a':'#d1d5db'};flex-shrink:0;"></span>`;
  const row = (label, val, ok) =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid #f1f5f9;">
      <span style="display:flex;align-items:center;gap:7px;font-size:13px;color:#374151;">${dot(ok)}${esc(label)}</span>
      <span style="font-size:12px;color:#6b7280;text-align:right;max-width:55%;word-break:break-all;">${esc(val)}</span>
    </div>`;

  const blogLabel = bloggerOk
    ? ('연결됨' + (blogName ? ` (${String(blogName).slice(0,12)})` : ''))
    : '미연결';

  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">연결 상태</h3>` +
    row('Worker',       workerOk ? '연결됨' : 'Mock 모드', workerOk) +
    row('Worker 버전',  verStr,   verStr !== '—') +
    row('AI Provider',  aiProv,   aiProv !== '—' && aiProv !== '없음') +
    row('Blogger',      blogLabel, bloggerOk) +
    `<p style="font-size:11px;color:#9ca3af;margin-top:10px;margin-bottom:10px;line-height:1.5;">
      실제 연결 테스트는 <b>설정</b> 화면에서 진행해주세요.
    </p>` +
    `<div style="display:flex;flex-direction:column;gap:8px;">
      <button class="btn btn-secondary" onclick="uiCloseBottomSheet();safeGoScreen('settings')">설정으로 이동</button>
      <button class="btn btn-secondary" onclick="uiCloseBottomSheet();safeGoScreen('pubmgmt')">발행관리로 이동</button>
      <button class="btn btn-ghost" onclick="uiCloseBottomSheet();typeof reconnectAllFromStatusBar==='function'&&reconnectAllFromStatusBar()">연결 재확인</button>
    </div>`
  );
}

// r9-gui-layout-lock-fix1: 상태바 "연결 재확인" — 기존 Worker 연결 테스트 +
// 기존 Blogger 연결 확인 함수를 그대로 순서대로 호출만 한다. (새 로직 작성 금지)
async function reconnectAllFromStatusBar() {
  if (typeof handleWorkerConnectionTest === 'function') {
    await handleWorkerConnectionTest();
  }
  if (typeof handleBloggerConnect === 'function') {
    await handleBloggerConnect();
  }
}

// r9-gui-layout-lock-fix1: 계정/로그아웃 — 바로 로그아웃하지 않고
// 바텀시트로 한 번 확인한 뒤, 안에서 버튼을 눌러야만 handleLogout() 실행
function showAccountLogoutSheet() {
  uiOpenBottomSheet(
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">계정/로그아웃</h3>` +
    `<p style="font-size:13px;color:#6b7280;margin:0 0 16px;line-height:1.6;">로그아웃하면 다시 비밀번호를 입력해야 합니다. 로그아웃할까요?</p>` +
    `<div style="display:flex;flex-direction:column;gap:8px;">
      <button class="btn btn-danger" onclick="uiCloseBottomSheet();typeof handleLogout==='function'&&handleLogout();">로그아웃</button>
      <button class="btn btn-ghost" onclick="uiCloseBottomSheet();">취소</button>
    </div>`
  );
}
