// auth.js
// v0.0.8.1: 화면 전환 display 직접 제어 + 버튼 문구 "🚀 할 수 있다!" 고정
// Worker /auth/login 검증, sessionStorage 토큰, Authorization Bearer 구조 유지

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

// 모든 화면 숨기고 특정 화면만 표시 (display 직접 제어 - Safari 대응)
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

// 로그인 처리: Worker /auth/login POST
async function handleLogin() {
  const pwInput  = document.getElementById('login-password');
  const errorBox = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');
  const pw = pwInput.value.trim();
  const BTN_LABEL = '🚀 할 수 있다!';

  if (!pw) {
    errorBox.textContent = '비밀번호를 입력해주세요.';
    errorBox.style.display = 'block';
    return;
  }

  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    errorBox.textContent = 'Worker URL을 먼저 설정해주세요.';
    errorBox.style.display = 'block';
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = '확인 중...';
  errorBox.style.display = 'none';

  try {
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
      document.getElementById('tabbar').style.display = 'flex';
      showToast('로그인 성공');
      // goScreen()으로 전환 (display + classList 동시 제어)
      goScreen('dashboard');
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
    loginBtn.textContent = BTN_LABEL; // 항상 원래 문구로 복구
  }
}

function handleLogout() {
  clearSessionToken();
  saveLocal(STORAGE_KEYS.IS_LOGGED_IN, false);
  document.getElementById('tabbar').style.display = 'none';
  document.getElementById('login-password').value = '';
  showToast('로그아웃 되었습니다');
  showOnlyScreen('screen-login');
}

// 401: 토큰 만료 → 로그인 화면
function handleUnauthorized() {
  clearSessionToken();
  saveLocal(STORAGE_KEYS.IS_LOGGED_IN, false);
  document.getElementById('tabbar').style.display = 'none';
  showOnlyScreen('screen-login');
  setTimeout(() => {
    const errorBox = document.getElementById('login-error');
    if (errorBox) {
      errorBox.textContent = '로그인이 만료되었습니다. 다시 로그인해주세요.';
      errorBox.style.display = 'block';
    }
  }, 80);
  showToast('로그인이 만료되었습니다. 다시 로그인해주세요.');
}

// 앱 로드 시 세션 토큰 확인
function checkLoginOnLoad() {
  const token = getSessionToken();
  if (token) {
    document.getElementById('tabbar').style.display = 'flex';
    goScreen('dashboard');
  } else {
    document.getElementById('tabbar').style.display = 'none';
    showOnlyScreen('screen-login');
  }
}

function bindLoginEvents() {
  const pwInput = document.getElementById('login-password');
  if (!pwInput) return;
  pwInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { handleLogin(); }
  });
}
