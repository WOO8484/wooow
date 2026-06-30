// auth.js
// v0.0.7.1: Mock 로그인 완전 제거 → Cloudflare Worker /auth/login으로 실제 검증합니다.
// 비밀번호는 Worker로만 전송하고, 응답 토큰은 sessionStorage에만 저장합니다.
// (localStorage에는 비밀번호/토큰을 절대 저장하지 않습니다)

// sessionStorage 키
const SESSION_TOKEN_KEY = 'bpw_session_token';

// 세션 토큰 저장 (sessionStorage 전용)
function saveSessionToken(token) {
  try { sessionStorage.setItem(SESSION_TOKEN_KEY, token); } catch(e) {}
}

// 세션 토큰 조회
function getSessionToken() {
  try { return sessionStorage.getItem(SESSION_TOKEN_KEY) || ''; } catch(e) { return ''; }
}

// 세션 토큰 삭제
function clearSessionToken() {
  try { sessionStorage.removeItem(SESSION_TOKEN_KEY); } catch(e) {}
}

// 로그인 처리: Worker /auth/login으로 POST
async function handleLogin() {
  const pwInput = document.getElementById('login-password');
  const errorBox = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');
  const pw = pwInput.value.trim();

  if (!pw) {
    errorBox.textContent = '비밀번호를 입력해주세요.';
    errorBox.style.display = 'block';
    return;
  }

  const workerUrl = getWorkerUrl();
  if (!workerUrl) {
    errorBox.textContent = '설정 화면에서 Worker URL을 먼저 입력해주세요.';
    errorBox.style.display = 'block';
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = '로그인 중...';
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
      document.getElementById('tabbar').style.display = 'flex';
      showToast('로그인 성공');
      goScreen('dashboard');
    } else {
      errorBox.textContent = data.message || '비밀번호가 올바르지 않습니다.';
      errorBox.style.display = 'block';
      showToast('로그인 실패');
    }
  } catch(e) {
    errorBox.textContent = 'Worker 연결에 실패했습니다. Worker URL을 확인해주세요.';
    errorBox.style.display = 'block';
    showToast('Worker 연결 오류');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = '로그인';
  }
}

function handleLogout() {
  clearSessionToken();
  saveLocal(STORAGE_KEYS.IS_LOGGED_IN, false);
  document.getElementById('tabbar').style.display = 'none';
  document.getElementById('login-password').value = '';
  showToast('로그아웃 되었습니다');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-login').classList.add('active');
}

// 401 응답 처리: 토큰 만료 시 로그인 화면으로 이동
function handleUnauthorized() {
  clearSessionToken();
  saveLocal(STORAGE_KEYS.IS_LOGGED_IN, false);
  document.getElementById('tabbar').style.display = 'none';
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-login').classList.add('active');
  // 잠깐 후 에러 표시 (화면 전환 후)
  setTimeout(() => {
    const errorBox = document.getElementById('login-error');
    if (errorBox) {
      errorBox.textContent = '로그인이 만료되었습니다. 다시 로그인해주세요.';
      errorBox.style.display = 'block';
    }
  }, 100);
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
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-login').classList.add('active');
  }
}

function bindLoginEvents() {
  const pwInput = document.getElementById('login-password');
  if (!pwInput) return;
  pwInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { handleLogin(); }
  });
}
