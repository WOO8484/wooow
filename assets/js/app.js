// app.js
// 설정 화면(Worker URL / 글 톤 / 금지어 / 하루 저장 제한 / 전체 초기화 / Worker 연결 테스트)과
// 앱 시작 시 초기화 처리를 담당합니다.

function refreshSettingsScreen(){
  const stored = loadLocal(STORAGE_KEYS.WORKER_URL, '');
  document.getElementById('setting-worker-url').value = stored || DEFAULT_WORKER_URL;
  document.getElementById('setting-tone').value = loadLocal(STORAGE_KEYS.TONE, '');
  document.getElementById('setting-banned-words').value = loadLocal(STORAGE_KEYS.BANNED_WORDS, '');
  document.getElementById('setting-daily-limit').value = getDailyPublishLimit();
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
  saveLocal(STORAGE_KEYS.TONE, document.getElementById('setting-tone').value.trim());
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
