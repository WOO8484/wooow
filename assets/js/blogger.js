// blogger.js
// Blogger 연결, 임시저장, 예약발행, 저장 목록, 대시보드 갱신을 담당합니다.
// v0.0.6부터 API 모드가 worker이면 실제 Blogger Worker 경로(/blogger/status,
// /blogger/draft, /blogger/schedule)를 먼저 시도하고, 실패하면 자동으로 Mock 저장으로
// 대체합니다. (api.js의 checkBloggerStatus / saveBloggerDraft / scheduleBloggerPost 참고)
// 이 파일에서는 Google OAuth 토큰을 절대 다루지 않습니다. 그런 민감 정보는
// Cloudflare Worker Secret(worker/worker.js)에서만 다룹니다.
// ⚠️ 바로 발행 기능은 의도적으로 만들지 않습니다. 기본은 임시저장과 예약발행만 허용합니다.

/* ----------------------------------------------------------
   하루 저장/예약 제한 (설정 가능, 1~10건, 기본값 3건)
   ---------------------------------------------------------- */

// 현재 적용 중인 하루 저장/예약 제한 값을 반환합니다.
// 설정값이 없으면 기본값(DAILY_PUBLISH_LIMIT = 3)을 사용하고,
// 설정값이 있으면 1~10 범위로 보정해서 사용합니다.
function getDailyPublishLimit(){
  const setting = loadLocal(STORAGE_KEYS.DAILY_LIMIT_SETTING, null);
  if(setting === null || setting === undefined || setting === ''){
    return DAILY_PUBLISH_LIMIT;
  }
  let value = parseInt(setting, 10);
  if(isNaN(value)) return DAILY_PUBLISH_LIMIT;
  if(value < DAILY_LIMIT_MIN) value = DAILY_LIMIT_MIN;
  if(value > DAILY_LIMIT_MAX) value = DAILY_LIMIT_MAX;
  return value;
}

// 설정 화면의 "하루 제한 저장" 버튼에서 호출합니다. (index.html에 입력칸 추가)
function saveDailyLimitSetting(){
  const input = document.getElementById('setting-daily-limit');
  if(!input) return;

  let value = parseInt(input.value, 10);
  if(isNaN(value)){
    showToast('숫자를 입력해주세요');
    return;
  }
  if(value < DAILY_LIMIT_MIN) value = DAILY_LIMIT_MIN;
  if(value > DAILY_LIMIT_MAX) value = DAILY_LIMIT_MAX;

  saveLocal(STORAGE_KEYS.DAILY_LIMIT_SETTING, value);
  input.value = value;
  showToast(`하루 저장/예약 제한이 ${value}건으로 저장되었습니다`);
  refreshDashboard();
  refreshBloggerScreen();
}

/* ----------------------------------------------------------
   Blogger 연결
   worker 모드이면 /blogger/status로 실제 설정 여부를 확인하고,
   실패하면 Mock 연결로 대체합니다. (앱이 멈추지 않도록)
   ---------------------------------------------------------- */
async function handleBloggerConnect(){
  const mode = getApiMode();
  const workerUrl = getWorkerUrl();

  if(mode === API_MODE.WORKER && workerUrl){
    showToast('Blogger 연결 상태를 확인하는 중입니다...');
    const statusResult = await checkBloggerStatus();
    const r = statusResult.result || {};

    // Worker v0.0.9: connected:true OR configured:true 모두 성공으로 처리
    const isConnected = r.connected === true || r.configured === true || r.blogExists === true;

    if(statusResult.ok && isConnected){
      saveLocal(STORAGE_KEYS.BLOGGER_CONNECTED, true);
      saveLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, API_MODE.WORKER);
      saveLocal(STORAGE_KEYS.BLOGGER_FAIL_REASON, '');
      // Worker v0.0.9가 반환하는 blogName/blogUrl 저장
      if(r.blogName) saveLocal('bloggerBlogName', r.blogName);
      if(r.blogUrl)  saveLocal('bloggerBlogUrl',  r.blogUrl);
      showToast(`Blogger 연결 성공${r.blogName ? ' (' + r.blogName + ')' : ''}`);
      refreshBloggerScreen();
      return;
    }

    // 실패 원인 분석
    const rawMsg = r.message || statusResult.error || '';
    let failReason = 'Blogger 설정 확인 실패';
    if(rawMsg.includes('GOOGLE_REFRESH_TOKEN'))  failReason = 'GOOGLE_REFRESH_TOKEN 확인 필요';
    else if(rawMsg.includes('BLOGGER_BLOG_ID'))  failReason = 'BLOGGER_BLOG_ID 확인 필요';
    else if(rawMsg.includes('Secret'))           failReason = 'Blogger Secret 누락 가능성';
    else if(rawMsg.includes('OAuth'))            failReason = 'Google OAuth 인증 실패';
    else if(rawMsg.includes('Access Token'))     failReason = 'Google Access Token 발급 실패';
    else if(rawMsg)                              failReason = rawMsg.slice(0, 60);

    saveLocal(STORAGE_KEYS.BLOGGER_CONNECTED, false);
    saveLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, API_MODE.MOCK);
    saveLocal(STORAGE_KEYS.BLOGGER_FAIL_REASON, failReason);
    showToast(`Blogger 연결 실패 — ${failReason}`);
    refreshBloggerScreen();
    return;
  }

  // Worker 모드가 아닌 경우
  saveLocal(STORAGE_KEYS.BLOGGER_CONNECTED, false);
  saveLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, API_MODE.MOCK);
  saveLocal(STORAGE_KEYS.BLOGGER_FAIL_REASON, 'Worker 모드가 아님 (설정에서 Worker 연결 테스트 필요)');
  showToast('Worker 모드가 아닙니다. 설정에서 Worker 연결 테스트를 먼저 진행해주세요.');
  refreshBloggerScreen();
}

// 오늘 날짜 기준으로 저장/예약된 글 개수 계산
function getTodaySavedCount(){
  const saved = loadLocal(STORAGE_KEYS.SAVED_POSTS, []);
  const todayStr = new Date().toDateString();
  return saved.filter(p => p.savedAtISO && new Date(p.savedAtISO).toDateString() === todayStr).length;
}

function refreshBloggerScreen(){
  const connected = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTED, false);
  const connectionMode = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, API_MODE.MOCK);
  const statusEl = document.getElementById('blogger-connect-status');

  // 연결 상태 배지 (모순 없게: connected=true & Worker이면 "연결됨")
  if(connected && connectionMode === API_MODE.WORKER){
    const blogName = loadLocal('bloggerBlogName', '');
    statusEl.textContent = blogName ? `연결됨 (${blogName.slice(0,15)})` : '연결됨';
    statusEl.className = 'badge success';
  } else if(connected){
    // connected이지만 Worker가 아닌 경우 (이 케이스는 이제 거의 발생하지 않음)
    statusEl.textContent = '로컬 모드';
    statusEl.className = 'badge mock';
  } else {
    const failReason = loadLocal(STORAGE_KEYS.BLOGGER_FAIL_REASON, '');
    if(failReason){
      statusEl.textContent = '연결 실패';
      statusEl.className = 'badge';
      statusEl.title = failReason; // 툴팁으로 상세 원인 표시
    } else {
      statusEl.textContent = '미연결';
      statusEl.className = 'badge';
    }
  }

  const score = loadLocal(STORAGE_KEYS.QUALITY_SCORE, null);
  const infoEl = document.getElementById('blogger-score-info');
  const draftBtn = document.getElementById('btn-draft-save');
  const scheduleBtn = document.getElementById('btn-schedule-save');
  const dailyLimit = getDailyPublishLimit();
  const todayCount = getTodaySavedCount();
  const limitReached = todayCount >= dailyLimit;

  if(!connected){
    infoEl.textContent = '먼저 위에서 Blogger 연결을 진행해주세요.';
    draftBtn.className = 'btn btn-disabled';
    scheduleBtn.className = 'btn btn-disabled';
  } else if(limitReached){
    infoEl.textContent = `오늘 발행 제한(${dailyLimit}건)을 초과했습니다.`;
    draftBtn.className = 'btn btn-disabled';
    scheduleBtn.className = 'btn btn-disabled';
  } else if(score === null){
    infoEl.textContent = '아직 품질검수를 진행하지 않았습니다. 먼저 검수를 진행해주세요.';
    draftBtn.className = 'btn btn-disabled';
    scheduleBtn.className = 'btn btn-disabled';
  } else if(score < QUALITY_DRAFT_MIN_SCORE){
    infoEl.textContent = `현재 점수 ${score}점: ${QUALITY_DRAFT_MIN_SCORE}점 미만이라 저장이 제한됩니다.`;
    draftBtn.className = 'btn btn-disabled';
    scheduleBtn.className = 'btn btn-disabled';
  } else if(score < QUALITY_SCHEDULE_MIN_SCORE){
    infoEl.textContent = `현재 점수 ${score}점: 임시저장만 가능합니다. (오늘 ${todayCount}/${dailyLimit}건)`;
    draftBtn.className = 'btn btn-primary';
    scheduleBtn.className = 'btn btn-disabled';
  } else {
    infoEl.textContent = `현재 점수 ${score}점: 임시저장과 예약발행이 모두 가능합니다. (오늘 ${todayCount}/${dailyLimit}건)`;
    draftBtn.className = 'btn btn-primary';
    scheduleBtn.className = 'btn btn-success';
  }

  renderBloggerSavedList();
}

/* ----------------------------------------------------------
   임시저장 (실제 Blogger 시도 → 실패 시 Mock fallback)
   ---------------------------------------------------------- */
async function handleSaveDraft(){
  if(!loadLocal(STORAGE_KEYS.BLOGGER_CONNECTED, false)){
    showToast('먼저 Blogger 연결을 진행해주세요');
    return;
  }
  const dailyLimit = getDailyPublishLimit();
  if(getTodaySavedCount() >= dailyLimit){
    showToast(`오늘 발행 제한 ${dailyLimit}건을 초과했습니다`);
    return;
  }
  const score = loadLocal(STORAGE_KEYS.QUALITY_SCORE, null);
  if(score === null || score < QUALITY_DRAFT_MIN_SCORE){
    showToast(`${QUALITY_DRAFT_MIN_SCORE}점 이상이어야 저장할 수 있습니다`);
    return;
  }
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  if(!post){
    showToast('저장할 글이 없습니다');
    return;
  }

  const connectionMode = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, API_MODE.MOCK);
  const canUseWorker = connectionMode === API_MODE.WORKER && getApiMode() === API_MODE.WORKER;

  if(canUseWorker){
    showToast('Blogger에 임시저장하는 중입니다...');
    const result = await saveBloggerDraft({
      title: post.title,
      html: post.html,
      labels: [],
      qualityScore: score
    });

    if(result.ok && result.result && result.result.ok){
      const r = result.result;
      addSavedPost(post, 'draft', score, null, {
        savedVia: SAVE_VIA.BLOGGER,
        postId: r.postId || '',
        url: r.url || ''
      });
      showToast('임시저장 완료 (실제 Blogger)');
      refreshBloggerScreen();
      refreshDashboard();
      return;
    }

    // 실제 저장 실패 → Mock으로 대체
    const reason = (result.result && result.result.message) || result.error || 'Blogger 저장 실패';
    addSavedPost(post, 'draft', score, null, { savedVia: SAVE_VIA.MOCK });
    showToast(`Blogger 저장 실패, Mock 저장으로 계속 진행합니다. (${reason})`);
    refreshBloggerScreen();
    refreshDashboard();
    return;
  }

  // Mock 연결인 경우
  addSavedPost(post, 'draft', score, null, { savedVia: SAVE_VIA.MOCK });
  showToast('임시저장 완료 (Mock)');
  refreshBloggerScreen();
  refreshDashboard();
}

/* ----------------------------------------------------------
   예약발행 (실제 Blogger 시도 → 실패 시 Mock fallback)
   ---------------------------------------------------------- */
async function handleSchedule(){
  if(!loadLocal(STORAGE_KEYS.BLOGGER_CONNECTED, false)){
    showToast('먼저 Blogger 연결을 진행해주세요');
    return;
  }
  const dailyLimit = getDailyPublishLimit();
  if(getTodaySavedCount() >= dailyLimit){
    showToast(`오늘 발행 제한 ${dailyLimit}건을 초과했습니다`);
    return;
  }
  const score = loadLocal(STORAGE_KEYS.QUALITY_SCORE, null);
  if(score === null || score < QUALITY_SCHEDULE_MIN_SCORE){
    showToast(`예약발행은 ${QUALITY_SCHEDULE_MIN_SCORE}점 이상일 때만 가능합니다`);
    return;
  }
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  if(!post){
    showToast('예약할 글이 없습니다');
    return;
  }

  const dateVal = document.getElementById('schedule-date').value;
  const timeVal = document.getElementById('schedule-time').value;
  if(!dateVal || !timeVal){
    showToast('예약 날짜와 시간을 선택해주세요');
    return;
  }

  // 이 프로그램은 한국 기준(KST, +09:00) 블로그 운영을 가정하므로 타임존을 명시해서 보냅니다.
  // 타임존이 없으면 Worker나 Blogger API가 시간을 다르게 해석할 수 있어 항상 +09:00을 붙입니다.
  const scheduledAtISO = `${dateVal}T${timeVal}:00+09:00`;
  const scheduledAtDisplay = `${dateVal} ${timeVal} (KST)`;

  // 예약 시간이 과거이면 Worker까지 갈 필요 없이 화면에서 먼저 막습니다.
  if(new Date(scheduledAtISO).getTime() <= Date.now()){
    showToast('예약 시간이 과거이거나 현재 시각 이전입니다. 미래 시각으로 다시 설정해주세요.');
    return;
  }

  const connectionMode = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, API_MODE.MOCK);
  const canUseWorker = connectionMode === API_MODE.WORKER && getApiMode() === API_MODE.WORKER;

  if(canUseWorker){
    showToast('Blogger에 예약발행을 등록하는 중입니다...');

    const result = await scheduleBloggerPost({
      title: post.title,
      html: post.html,
      labels: [],
      qualityScore: score,
      scheduledAt: scheduledAtISO
    });

    if(result.ok && result.result && result.result.ok){
      const r = result.result;
      addSavedPost(post, 'scheduled', score, scheduledAtDisplay, {
        savedVia: SAVE_VIA.BLOGGER,
        postId: r.postId || '',
        url: r.url || ''
      });
      showToast('예약발행 완료 (실제 Blogger)');
      refreshBloggerScreen();
      refreshDashboard();
      return;
    }

    // 실제 예약 실패 → Mock으로 대체
    const reason = (result.result && result.result.message) || result.error || 'Blogger 예약 실패';
    addSavedPost(post, 'scheduled', score, scheduledAtDisplay, { savedVia: SAVE_VIA.MOCK });
    showToast(`Blogger 예약 실패, Mock 예약으로 계속 진행합니다. (${reason})`);
    refreshBloggerScreen();
    refreshDashboard();
    return;
  }

  // Mock 연결인 경우
  addSavedPost(post, 'scheduled', score, scheduledAtDisplay, { savedVia: SAVE_VIA.MOCK });
  showToast('예약발행 완료 (Mock)');
  refreshBloggerScreen();
  refreshDashboard();
}

// 저장/예약 목록에 글을 추가하는 공통 함수 (중복 로직 통합)
// extra: { savedVia, postId, url } - 실제 Blogger 저장이면 postId/url이 채워집니다.
function addSavedPost(post, status, score, scheduledAt, extra){
  const saved = loadLocal(STORAGE_KEYS.SAVED_POSTS, []);
  const ex = extra || {};
  const entry = {
    title: post.title,
    status,
    score,
    savedAt: new Date().toLocaleString('ko-KR'),
    savedAtISO: new Date().toISOString(),
    savedVia: ex.savedVia || SAVE_VIA.MOCK,
    postId: ex.postId || '',
    url: ex.url || ''
  };
  if(scheduledAt) entry.scheduledAt = scheduledAt;
  saved.unshift(entry);
  saveLocal(STORAGE_KEYS.SAVED_POSTS, saved);
}

// http/https로 시작하는 링크만 허용합니다. (javascript: 등 위험한 스킴을 통한 XSS 방지)
function isSafeBloggerUrl(url){
  return /^https?:\/\//i.test(String(url || '').trim());
}

function renderBloggerSavedList(){
  const saved = loadLocal(STORAGE_KEYS.SAVED_POSTS, []);
  const listEl = document.getElementById('blogger-saved-list');
  if(saved.length === 0){
    listEl.innerHTML = '<p class="small-sub">아직 저장된 글이 없습니다.</p>';
    return;
  }
  listEl.innerHTML = saved.map(p => {
    const viaLabel = p.savedVia === SAVE_VIA.BLOGGER ? '실제 Blogger' : 'Mock';
    const viaBadge = `<span class="badge ${p.savedVia === SAVE_VIA.BLOGGER ? 'success' : 'mock'}">${viaLabel}</span>`;
    const postIdLine = p.postId ? `<div class="small-sub">postId: ${escapeHtml(p.postId)}</div>` : '';
    const linkLine = (p.url && isSafeBloggerUrl(p.url))
      ? `<div class="small-sub"><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">원문/관리 링크 ↗</a></div>`
      : '';
    return `
      <div class="list-item">
        <div class="row-between">
          <b>${escapeHtml(p.title)}</b>
          <span class="status-tag ${p.status === 'draft' ? 'status-draft' : 'status-scheduled'}">
            ${p.status === 'draft' ? '임시저장' : '예약발행'}
          </span>
        </div>
        <div class="row-between" style="margin-top:4px;">
          ${viaBadge}
          <span class="small-sub">점수 ${p.score}점</span>
        </div>
        <div class="small-sub">${p.savedAt}${p.scheduledAt ? ' · 예약시간: ' + escapeHtml(p.scheduledAt) : ''}</div>
        ${postIdLine}
        ${linkLine}
      </div>
    `;
  }).join('');
}

function refreshDashboard(){
  const dailyLimit = getDailyPublishLimit();
  const todayCount = getTodaySavedCount();
  document.getElementById('dash-today-count').textContent = `${todayCount}건 / ${dailyLimit}건`;

  const apiMode = getApiMode();
  const modeBadge = document.getElementById('dash-mode-badge');
  if(modeBadge){
    modeBadge.textContent = apiMode === API_MODE.WORKER ? 'Worker 모드' : 'Mock 모드';
    modeBadge.className = apiMode === API_MODE.WORKER ? 'badge success' : 'badge mock';
  }

  // Worker 연결 상태
  const workerStatus = loadLocal(STORAGE_KEYS.WORKER_STATUS, 'unknown');
  setStatusMiniCard('dash-status-worker',
    workerStatus === 'success' ? 'on' : (workerStatus === 'fail' ? 'fail' : 'off'),
    workerStatus === 'success' ? '연결됨' : (workerStatus === 'fail' ? '연결 실패' : '미확인'));

  // 네이버 검색 마지막 상태
  const naverStatus = loadLocal(STORAGE_KEYS.NAVER_LAST_STATUS, null);
  setStatusMiniCard('dash-status-naver',
    naverStatus ? (naverStatus.state === 'success' ? 'on' : (naverStatus.state === 'fail' ? 'fail' : 'off')) : 'off',
    naverStatus ? (naverStatus.state === 'success' ? '실제 성공' : (naverStatus.state === 'fail' ? '실패→Mock' : 'Mock')) : '대기');

  // AI 글 생성 마지막 상태
  const aiStatus = loadLocal(STORAGE_KEYS.AI_LAST_STATUS, null);
  setStatusMiniCard('dash-status-ai',
    aiStatus ? (aiStatus.state === 'success' ? 'on' : (aiStatus.state === 'fail' ? 'fail' : 'off')) : 'off',
    aiStatus ? (aiStatus.state === 'success' ? '실제 성공' : (aiStatus.state === 'fail' ? '실패→Mock' : 'Mock')) : '대기');

  // Blogger 연결 상태 (대시보드 미니카드 + 발행 화면과 공유하는 배지)
  const connected = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTED, false);
  const connectionMode = loadLocal(STORAGE_KEYS.BLOGGER_CONNECTION_MODE, API_MODE.MOCK);
  let bloggerDot = 'off', bloggerText = '미연결';
  if(connected && connectionMode === API_MODE.WORKER){ bloggerDot = 'on'; bloggerText = '연결됨'; }
  else if(connected){ bloggerDot = 'off'; bloggerText = 'Mock 모드'; }
  else { bloggerDot = 'fail'; bloggerText = '연결 실패'; }
  setStatusMiniCard('dash-blogger-status', bloggerDot, bloggerText);

  const saved = loadLocal(STORAGE_KEYS.SAVED_POSTS, []);
  const listEl = document.getElementById('dash-recent-list');
  if(saved.length === 0){
    listEl.innerHTML = '<p class="small-sub">아직 저장된 글이 없습니다.</p>';
  } else {
    listEl.innerHTML = saved.slice(0, 3).map(p => `
      <div class="list-item">
        <b>${escapeHtml(p.title)}</b>
        <div class="small-sub">${p.status === 'draft' ? '임시저장' : '예약발행'} · ${p.score}점 · ${p.savedVia === SAVE_VIA.BLOGGER ? '실제 Blogger' : 'Mock'}</div>
      </div>
    `).join('');
  }
}

// 대시보드 상태 미니카드(점 + 텍스트)를 갱신하는 공통 도우미 함수
function setStatusMiniCard(elementId, dotClass, text){
  const el = document.getElementById(elementId);
  if(!el) return;
  el.innerHTML = `<span class="status-dot ${dotClass}"></span>${escapeHtml(text)}`;
}
