// auth.js — v0.0.9
// Worker /auth/login 검증, sessionStorage 토큰, Authorization Bearer 구조 유지
// 추가: 로그인 화면 body 스크롤 잠금 / 로그인 성공 후 Worker 헬스체크 자동 실행

const SESSION_TOKEN_KEY = 'bpw_session_token';

function saveSessionToken(token) {
  try { sessionStorage.setItem(SESSION_TOKEN_KEY, token); } catch(e) {}
}
function getSessionToken() {
  try { return sessionStorage.getItem(SESSION_TOKEN_KEY) || ''; } catch(e) { return ''; }
}
function clearSessionToken() {
  try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch(e) {}
}

/* ----------------------------------------------------------
   화면 표시 제어 — classList + style.display 동시 제어 (Safari 대응)
   ---------------------------------------------------------- */
function showOnlyScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    target.style.display = 'flex';
  }
}

// 로그인 화면: body 스크롤 잠금
function lockBodyScroll()   { document.body.classList.add('login-open'); }
function unlockBodyScroll() { document.body.classList.remove('login-open'); }

/* ----------------------------------------------------------
   로그인 처리
   ---------------------------------------------------------- */
async function handleLogin() {
  const pwInput  = document.getElementById('login-password');
  const errorBox = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');
  const BTN_LABEL = '🚀 할 수 있다!';
  const pw = pwInput.value.trim();

  if (!pw) {
    errorBox.textContent = '비밀번호를 입력해주세요.';
    errorBox.style.display = 'block';
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = '확인 중...';
  errorBox.style.display = 'none';

  try {
    const workerUrl = getWorkerUrl();
    const response = await fetch(workerUrl + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const data = await response.json();

    if (response.ok && data.ok && data.token) {
      saveSessionToken(data.token);
      pwInput.value = '';
      errorBox.style.display = 'none';

      // tabbar 표시 + 로그인 화면 스크롤 잠금 해제
      unlockBodyScroll();
      document.getElementById('tabbar').style.display = 'flex';
      showToast('로그인 성공');
      goScreen('dashboard');

      // ★ 로그인 성공 직후 Worker 헬스체크 자동 실행
      autoConnectWorker();
    } else {
      errorBox.textContent = data.message || '비밀번호가 올바르지 않습니다.';
      errorBox.style.display = 'block';
      showToast('로그인 실패');
    }
  } catch(e) {
    errorBox.textContent = 'Worker 연결 오류. Worker URL을 확인해주세요.';
    errorBox.style.display = 'block';
    showToast('Worker 연결 오류');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = BTN_LABEL; // 항상 원래 문구 복구
  }
}

// 로그아웃
function handleLogout() {
  clearSessionToken();
  saveLocal(STORAGE_KEYS.IS_LOGGED_IN, false);
  setApiMode(API_MODE.MOCK);
  document.getElementById('tabbar').style.display = 'none';
  const pw = document.getElementById('login-password');
  if (pw) pw.value = '';
  const err = document.getElementById('login-error');
  if (err) { err.textContent = ''; err.style.display = 'none'; }
  showToast('로그아웃 되었습니다');
  lockBodyScroll();
  showOnlyScreen('screen-login');
}

// 401: 토큰 만료
function handleUnauthorized() {
  clearSessionToken();
  saveLocal(STORAGE_KEYS.IS_LOGGED_IN, false);
  setApiMode(API_MODE.MOCK);
  document.getElementById('tabbar').style.display = 'none';
  lockBodyScroll();
  showOnlyScreen('screen-login');
  setTimeout(() => {
    const err = document.getElementById('login-error');
    if (err) {
      err.textContent = '로그인이 만료되었습니다. 다시 로그인해주세요.';
      err.style.display = 'block';
    }
  }, 80);
  showToast('로그인이 만료되었습니다. 다시 로그인해주세요.');
}

/* ----------------------------------------------------------
   앱 로드 시 세션 토큰 확인
   ---------------------------------------------------------- */
function checkLoginOnLoad() {
  const token = getSessionToken();
  if (token) {
    unlockBodyScroll();
    document.getElementById('tabbar').style.display = 'flex';
    goScreen('dashboard');
    // ★ 재접속 시 Worker 상태 자동 복구
    autoConnectWorker();
  } else {
    document.getElementById('tabbar').style.display = 'none';
    lockBodyScroll();
    showOnlyScreen('screen-login');
  }
}

/* ----------------------------------------------------------
   Worker 자동 연결 (로그인 성공/재접속 공통)
   ---------------------------------------------------------- */
async function autoConnectWorker() {
  try {
    const health = await checkWorkerHealth();
    if (health.ok) {
      setApiMode(API_MODE.WORKER);
      // 대시보드가 보이고 있으면 상태 갱신
      if (typeof refreshDashboard === 'function') refreshDashboard();
      if (typeof refreshWorkerStatusCard === 'function') refreshWorkerStatusCard();
    } else {
      setApiMode(API_MODE.MOCK);
    }
  } catch(e) {
    setApiMode(API_MODE.MOCK);
  }
}

function bindLoginEvents() {
  const pwInput = document.getElementById('login-password');
  if (!pwInput) return;
  pwInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { handleLogin(); }
  });
}
