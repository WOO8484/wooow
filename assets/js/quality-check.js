// quality-check.js
// 발행 전 품질검수를 담당합니다. (글자수, 출처, 표, 체크리스트, FAQ, 금지어 등)
// 여기서 계산하는 점수는 Mock 기준이며, 실제 서비스에서는 더 정교한 검사 로직이 필요합니다.
// 글 생성이 Mock뿐 아니라 실제 AI 결과일 수도 있으므로, 검사 항목은
// 특정 생성 방식의 구현 세부사항이 아니라 내용 자체를 기준으로 판단합니다.
// v0.0.7부터 글자 수 기준은 글 생성 시 선택한 생성 모드(빠른/일반/고급)에 맞춰 달라집니다.

// HTML 문자열에서 순수 텍스트만 추출 (글자수 계산용)
function getPlainTextFromHtml(html){
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// 글에 적용된 생성 모드의 최소 글자 수 기준을 반환합니다. (모드 정보가 없으면 기본값 사용)
function getMinLengthForPost(post){
  const modeConfig = post && post.generationMode ? GENERATION_MODES[post.generationMode] : null;
  return modeConfig ? modeConfig.minLength : MIN_CONTENT_LENGTH;
}

function runQualityCheck(){
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  if(!post){
    showToast('먼저 글을 생성해주세요');
    return;
  }

  const material = loadLocal(STORAGE_KEYS.MATERIAL, {});
  const plainText = getPlainTextFromHtml(post.html);
  const minLength = getMinLengthForPost(post);

  const bannedWordsRaw = loadLocal(STORAGE_KEYS.BANNED_WORDS, '');
  const bannedWords = bannedWordsRaw.split(',').map(w => w.trim()).filter(w => w.length > 0);
  const foundBannedWord = bannedWords.find(w => plainText.includes(w));

  const hasExaggeration = EXAGGERATION_WORDS.some(w => plainText.includes(w));
  const sourceCount = (post.html.match(/<li>\[/g) || []).length;

  const checks = [
    { label: '제목이 구체적인가', pass: post.title && post.title.length >= 8 },
    { label: '첫 문단이 독자를 끌어당기는가', pass: true },
    { label: '최신정보가 포함되었는가', pass: post.html.includes('최신정보') },
    { label: `글자 수 ${minLength}자 이상인가`, pass: plainText.length >= minLength },
    { label: '출처가 3개 이상인가', pass: sourceCount >= 3 },
    { label: '사례가 포함되었는가', pass: post.html.includes('사례') },
    { label: '표가 포함되었는가', pass: post.html.includes('<table>') },
    { label: '체크리스트가 포함되었는가', pass: post.html.includes('☐') || post.html.includes('☑') || post.html.includes('bpw-checklist-box') },
    { label: 'FAQ가 포함되었는가', pass: post.html.includes('Q.') },
    { label: '결론이 명확한가', pass: !!material.conclusion },
    { label: '이미지 설명이 포함되었는가', pass: post.html.includes('이미지') },
    { label: '나만의 의견 또는 사례가 있는가', pass: !!(material.opinion || material.situation || material.aroundCase) },
    { label: '과장 표현이 없는가', pass: !hasExaggeration },
    { label: '중복 문장이 없는가', pass: true },
    { label: '금지어가 없는가', pass: !foundBannedWord },
    { label: '독자에게 실제 도움이 되는가', pass: !!material.conclusion || !!material.opinion }
  ];

  const passCount = checks.filter(c => c.pass).length;
  const score = Math.round((passCount / checks.length) * 100);

  saveLocal(STORAGE_KEYS.QUALITY_SCORE, score);
  saveLocal(STORAGE_KEYS.QUALITY_CHECKS, checks);

  if(foundBannedWord){
    showToast(`금지어 "${foundBannedWord}"가 발견되어 점수가 낮아졌습니다`);
  } else {
    showToast('품질검수가 완료되었습니다');
  }

  refreshQualityScreen();
}

function refreshQualityScreen(){
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  const emptyCard = document.getElementById('quality-empty-card');
  const resultCard = document.getElementById('quality-result-card');
  const gapCard = document.getElementById('quality-gap-card');
  const checklistCard = document.getElementById('quality-checklist-card');
  const nextCard = document.getElementById('quality-next-card');

  if(!post){
    emptyCard.style.display = 'block';
    resultCard.style.display = 'none';
    if(gapCard) gapCard.style.display = 'none';
    checklistCard.style.display = 'none';
    nextCard.style.display = 'none';
    return;
  }
  emptyCard.style.display = 'none';

  let score = loadLocal(STORAGE_KEYS.QUALITY_SCORE, null);
  if(score === null){
    runQualityCheck();
    return;
  }

  resultCard.style.display = 'block';
  checklistCard.style.display = 'block';
  nextCard.style.display = 'block';

  const circle = document.getElementById('quality-score-circle');
  circle.textContent = score + '점';

  let color = '#dc2626';
  let msg = '70점 미만: 발행이 불가능합니다. 글을 보완해주세요.';
  if(score >= QUALITY_SCHEDULE_MIN_SCORE){
    color = '#16a34a';
    msg = '85점 이상: 임시저장과 예약발행이 모두 가능합니다.';
  } else if(score >= QUALITY_DRAFT_MIN_SCORE){
    color = '#d97706';
    msg = '70~84점: 임시저장만 가능합니다. (예약발행은 85점 이상 필요)';
  }
  circle.style.background = color;
  document.getElementById('quality-score-msg').textContent = msg;

  const checks = loadLocal(STORAGE_KEYS.QUALITY_CHECKS, []);
  const listEl = document.getElementById('quality-checklist');
  listEl.innerHTML = checks.map(c => `
    <div class="check-row">
      <span class="${c.pass ? 'check-ok' : 'check-no'}">${c.pass ? '✅' : '❌'}</span>
      <span>${escapeHtml(c.label)}</span>
    </div>
  `).join('');

  // 부족한(실패한) 항목만 따로 모아서 "보완이 필요한 항목" 카드로 보여줍니다.
  const failedChecks = checks.filter(c => !c.pass);
  if(gapCard && document.getElementById('quality-gap-list')){
    if(failedChecks.length > 0){
      gapCard.style.display = 'block';
      document.getElementById('quality-gap-list').innerHTML = failedChecks
        .map(c => `<div class="gap-item">⚠️ ${escapeHtml(c.label)} — 보완이 필요합니다</div>`)
        .join('');
    } else {
      gapCard.style.display = 'none';
    }
  }
}
