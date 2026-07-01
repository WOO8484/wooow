// quality-check.js — v0.0.9
// 품질검수 로직 개선:
//   - Worker v0.0.9 AI가 생성한 HTML 구조에 맞는 항목 체크
//   - 점수 과도 저평가 완화 (h2 태그, faq 배열, metaDescription 등으로 가점)
//   - "발행 불가" → "보완 권장" 문구로 전환
//   - 임시저장 기준 50점, 예약발행 기준 70점 (config.js 기준)

// HTML에서 순수 텍스트 추출 (글자수 계산용)
function getPlainTextFromHtml(html){
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// 생성 모드 기준 최소 글자 수
function getMinLengthForPost(post){
  const modeConfig = post && post.generationMode ? GENERATION_MODES[post.generationMode] : null;
  return modeConfig ? modeConfig.minLength : MIN_CONTENT_LENGTH;
}

// HTML에 특정 h2 섹션이 있는지 확인
function hasH2Section(html, keyword){
  return new RegExp('<h2[^>]*>[^<]*' + keyword + '[^<]*</h2>', 'i').test(html);
}

function runQualityCheck(){
  const post = loadLocal(STORAGE_KEYS.CURRENT_POST, null);
  if(!post){
    showToast('먼저 글을 생성해주세요');
    return;
  }

  const material = loadLocal(STORAGE_KEYS.MATERIAL, {});
  const html = post.html || post.contentHtml || '';
  const plainText = getPlainTextFromHtml(html);
  const minLength = getMinLengthForPost(post);

  const bannedWordsRaw = loadLocal(STORAGE_KEYS.BANNED_WORDS, '');
  const bannedWords = bannedWordsRaw.split(',').map(w => w.trim()).filter(w => w.length > 0);
  const foundBannedWord = bannedWords.find(w => plainText.includes(w));
  const hasExaggeration = EXAGGERATION_WORDS.some(w => plainText.includes(w));

  // Worker v0.0.9 응답의 metaDescription, labels, faq 필드
  const hasMeta = !!(post.metaDescription && String(post.metaDescription).length >= 30);
  const hasLabels = Array.isArray(post.labels) && post.labels.length >= 2;
  const hasFaqArray = Array.isArray(post.faq) && post.faq.length >= 2;

  const checks = [
    // 기본 구조
    {
      key: 'title', label: '제목이 구체적인가 (8자 이상)',
      pass: !!(post.title && post.title.length >= 8),
      tip: '제목이 너무 짧습니다. 검색 노출을 위해 키워드를 포함한 구체적인 제목을 사용하세요.'
    },
    {
      key: 'length', label: `글자 수 ${minLength}자 이상인가 (현재 ${plainText.length}자)`,
      pass: plainText.length >= minLength,
      tip: `본문이 ${minLength}자 미만입니다. 정보량이 부족할 수 있습니다.`
    },
    // Worker v0.0.9 HTML 구조 체크
    {
      key: 'summary', label: '핵심 요약 섹션 포함',
      pass: hasH2Section(html, '핵심 요약') || !!(post.summary && post.summary.length > 10),
      tip: '<h2>핵심 요약</h2> 섹션이 없습니다. 독자가 핵심을 빠르게 파악할 수 있도록 추가하세요.'
    },
    {
      key: 'latest', label: '최신정보 섹션 포함',
      pass: hasH2Section(html, '최신정보') || html.includes('최신정보') || html.includes('최신 정보'),
      tip: '<h2>최신정보</h2> 섹션을 추가하면 검색 신뢰도가 높아집니다.'
    },
    {
      key: 'case', label: '실제 사례 섹션 포함',
      pass: hasH2Section(html, '실제 사례') || hasH2Section(html, '사례') || html.includes('사례'),
      tip: '실제 사례나 예시를 포함하면 독자 신뢰도가 높아집니다.'
    },
    {
      key: 'table', label: '비교 표 포함 (<table>)',
      pass: html.includes('<table'),
      tip: '비교 표가 없습니다. <table>로 항목 비교를 추가하면 가독성이 높아집니다.'
    },
    {
      key: 'checklist', label: '체크리스트 포함',
      pass: html.includes('<ul') && (html.includes('<li') || html.includes('☑') || html.includes('☐') || hasH2Section(html, '체크리스트')),
      tip: '체크리스트(ul/li)를 추가하면 독자가 정보를 활용하기 쉬워집니다.'
    },
    {
      key: 'faq', label: 'FAQ 포함 (2개 이상)',
      pass: hasFaqArray || hasH2Section(html, 'FAQ') || html.includes('<h2>FAQ') || (html.match(/Q\./g) || []).length >= 2,
      tip: 'FAQ(자주 묻는 질문)를 2개 이상 추가하세요.'
    },
    {
      key: 'conclusion', label: '결론 섹션 포함',
      pass: hasH2Section(html, '결론') || !!(material.conclusion),
      tip: '<h2>결론</h2> 섹션이 없습니다. 독자가 글을 읽고 나서 무엇을 해야 하는지 안내해주세요.'
    },
    {
      key: 'source', label: '출처 및 참고자료 포함',
      pass: hasH2Section(html, '출처') || html.includes('<a href') || (html.match(/<li>\[/g) || []).length >= 1,
      tip: '출처와 참고자료 링크를 추가하면 신뢰도가 높아집니다.'
    },
    {
      key: 'image', label: '이미지 설명(alt) 포함',
      pass: html.includes('이미지 설명') || /alt\s*=\s*["'][^"']+["']/i.test(html) || html.includes('alt:'),
      tip: '이미지 alt 설명을 추가하면 SEO에 도움이 됩니다.'
    },
    {
      key: 'meta', label: 'metaDescription 포함 (30자 이상)',
      pass: hasMeta,
      tip: 'metaDescription이 없거나 너무 짧습니다. 검색 결과에 표시될 설명 문장을 추가하세요.'
    },
    {
      key: 'labels', label: '태그/라벨 2개 이상',
      pass: hasLabels,
      tip: '태그(라벨)를 2개 이상 설정하면 블로그 분류에 도움이 됩니다.'
    },
    {
      key: 'noExaggeration', label: '과장 표현 없음',
      pass: !hasExaggeration,
      tip: `과장 표현(${EXAGGERATION_WORDS.join(', ')})이 발견됐습니다. 광고 친화도를 위해 수정하세요.`
    },
    {
      key: 'noBanned', label: '금지어 없음',
      pass: !foundBannedWord,
      tip: foundBannedWord ? `금지어 "${foundBannedWord}"가 발견됐습니다.` : ''
    }
  ];

  const passCount = checks.filter(c => c.pass).length;
  const score = Math.round((passCount / checks.length) * 100);

  saveLocal(STORAGE_KEYS.QUALITY_SCORE, score);
  saveLocal(STORAGE_KEYS.QUALITY_CHECKS, checks);

  if(foundBannedWord){
    showToast(`금지어 "${foundBannedWord}"가 발견됐습니다`);
  } else {
    showToast('품질검수 완료');
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
    if(emptyCard) emptyCard.style.display = 'block';
    if(resultCard) resultCard.style.display = 'none';
    if(gapCard) gapCard.style.display = 'none';
    if(checklistCard) checklistCard.style.display = 'none';
    if(nextCard) nextCard.style.display = 'none';
    return;
  }
  if(emptyCard) emptyCard.style.display = 'none';

  let score = loadLocal(STORAGE_KEYS.QUALITY_SCORE, null);
  if(score === null){
    runQualityCheck();
    return;
  }

  if(resultCard) resultCard.style.display = 'block';
  if(checklistCard) checklistCard.style.display = 'block';
  if(nextCard) nextCard.style.display = 'block';

  // 점수 원
  const circle = document.getElementById('quality-score-circle');
  if(circle) circle.textContent = score + '점';

  // 메시지 및 색상 (기준: QUALITY_DRAFT_MIN_SCORE=50, QUALITY_SCHEDULE_MIN_SCORE=70)
  let color = '#dc2626';
  let msg = '50점 미만: 임시저장 전 보완을 권장합니다.';
  if(score >= QUALITY_SCHEDULE_MIN_SCORE){
    color = '#16a34a';
    msg = '70점 이상: 임시저장과 예약발행이 모두 가능합니다.';
  } else if(score >= QUALITY_DRAFT_MIN_SCORE){
    color = '#d97706';
    msg = '50~69점: 임시저장 가능합니다. 예약발행은 70점 이상 필요합니다.';
  }
  if(circle) circle.style.background = color;
  const msgEl = document.getElementById('quality-score-msg');
  if(msgEl) msgEl.textContent = msg;

  // 전체 체크리스트
  const checks = loadLocal(STORAGE_KEYS.QUALITY_CHECKS, []);
  const listEl = document.getElementById('quality-checklist');
  if(listEl){
    listEl.innerHTML = checks.map(c => `
      <div class="check-row">
        <span class="${c.pass ? 'check-ok' : 'check-no'}">${c.pass ? '✅' : '⚠️'}</span>
        <span>${escapeHtml(c.label)}</span>
      </div>
    `).join('');
  }

  // 보완이 필요한 항목 카드
  const failedChecks = checks.filter(c => !c.pass);
  if(gapCard && document.getElementById('quality-gap-list')){
    if(failedChecks.length > 0){
      gapCard.style.display = 'block';
      document.getElementById('quality-gap-list').innerHTML = failedChecks
        .map(c => `
          <div class="gap-item">
            <b>⚠️ ${escapeHtml(c.label)}</b>
            ${c.tip ? `<div class="small-sub" style="margin-top:2px;">${escapeHtml(c.tip)}</div>` : ''}
          </div>
        `).join('');
    } else {
      gapCard.style.display = 'none';
    }
  }
}
