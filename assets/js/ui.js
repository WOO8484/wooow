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

function goScreen(name){
  // alias 변환
  name = SCREEN_ALIAS[name] || name;

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
}

// 탭바 클릭 — 글 생성 중 이탈 확인
function safeGoScreen(name){
  if(typeof isGenerating !== 'undefined' && isGenerating){
    if(!confirm('글 생성 중입니다. 이동하면 결과가 반영되지 않을 수 있습니다. 이동할까요?')) return;
  }
  goScreen(name);
}

// 화면 진입 시 데이터 새로고침
function refreshCurrentScreen(name){
  if(name === 'keyword')   typeof refreshKeywordScreen  === 'function' && refreshKeywordScreen();
  if(name === 'editor')    typeof refreshEditorScreen   === 'function' && refreshEditorScreen();
  if(name === 'quality')   typeof refreshQualityScreen  === 'function' && refreshQualityScreen();
  if(name === 'preview')   typeof refreshPreviewScreen  === 'function' && refreshPreviewScreen();
  if(name === 'blogger')   typeof refreshBloggerScreen  === 'function' && refreshBloggerScreen();
  if(name === 'publish')   typeof refreshPublishScreen  === 'function' && refreshPublishScreen();
  if(name === 'briefing')  typeof refreshBriefingScreen === 'function' && refreshBriefingScreen();
  if(name === 'settings')  { typeof refreshSettingsScreen === 'function' && refreshSettingsScreen(); typeof refreshSettingsScreenExtra === 'function' && refreshSettingsScreenExtra(); }
  if(name === 'dashboard') typeof refreshDashboard      === 'function' && refreshDashboard();
  if(name === 'hotissue')  typeof refreshHotissueScreen  === 'function' && refreshHotissueScreen();
  if(name === 'autowrite') typeof refreshAutowriteScreen === 'function' && refreshAutowriteScreen();
  if(name === 'pubmgmt')   typeof refreshPubmgmtScreen   === 'function' && refreshPubmgmtScreen();
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
    `<h3 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#1c2434;">📡 연결 상태</h3>` +
    row('Worker',       workerOk ? '연결됨 ✅' : 'Mock 모드', workerOk) +
    row('Worker 버전',  verStr,   verStr !== '—') +
    row('AI Provider',  aiProv,   aiProv !== '—' && aiProv !== '없음') +
    row('Blogger',      blogLabel, bloggerOk) +
    `<p style="font-size:11px;color:#9ca3af;margin-top:10px;margin-bottom:10px;line-height:1.5;">
      실제 연결 테스트는 <b>설정</b> 화면에서 진행해주세요.
    </p>` +
    `<div style="display:flex;flex-direction:column;gap:8px;">
      <button class="btn btn-secondary" onclick="uiCloseBottomSheet();safeGoScreen('settings')">⚙️ 설정으로 이동</button>
      <button class="btn btn-secondary" onclick="uiCloseBottomSheet();safeGoScreen('pubmgmt')">🚀 발행관리로 이동</button>
      <button class="btn btn-ghost" onclick="uiCloseBottomSheet();typeof handleWorkerConnectionTest==='function'&&handleWorkerConnectionTest()">🔄 연결 재확인</button>
    </div>`
  );
}
