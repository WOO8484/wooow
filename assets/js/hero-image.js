// hero-image.js — v0.1.0-test-r4
// 대표 이미지(히어로 카드) 자동 생성 + H2 아이콘 삽입 + 이미지 프롬프트 생성

/* ----------------------------------------------------------
   H2 아이콘 맵 (섹션 제목 → 이모지)
   ---------------------------------------------------------- */
const H2_ICON_MAP = [
  { patterns: ['핵심 요약', '요약', 'summary'],           icon: '✅' },
  { patterns: ['최신정보', '최신 정보', '최근'],           icon: '🔥' },
  { patterns: ['실제 사례', '사례', '예시'],               icon: '📌' },
  { patterns: ['비교', '비교 표', '비교표'],               icon: '📊' },
  { patterns: ['체크리스트', '체크', '확인'],              icon: '☑️' },
  { patterns: ['FAQ', '자주 묻는', '질문'],                icon: '❓' },
  { patterns: ['결론', '마무리', '정리'],                   icon: '📝' },
  { patterns: ['출처', '참고자료', '참고', '링크'],         icon: '🔗' },
  { patterns: ['이미지', '사진', 'alt', '이미지 설명'],    icon: '🖼️' },
  { patterns: ['주의', '주의사항', '경고', '비추천'],      icon: '⚠️' },
  { patterns: ['장점', '혜택', '이점'],                    icon: '👍' },
  { patterns: ['단점', '문제점', '한계'],                  icon: '👎' }
];

/* ----------------------------------------------------------
   H2에 아이콘 적용
   emojiLevel: 'none' | 'few' | 'moderate'
   ---------------------------------------------------------- */
function applyH2Icons(html, emojiLevel) {
  if (!emojiLevel || emojiLevel === 'none') return html;

  // 'few': 핵심 요약/FAQ/결론/체크리스트/출처 5개만
  // 'moderate': 모든 매핑 적용
  const allowedFew = new Set(['✅','❓','📝','☑️','🔗','⚠️']);

  return html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (match, attrs, text) => {
    const cleanText = text.replace(/<[^>]*>/g, '').trim();
    // 이미 아이콘 있으면 그대로
    if (/[\u{1F300}-\u{1FAFF}✅☑️⚠️❓]/u.test(cleanText.slice(0, 3))) return match;

    for (const entry of H2_ICON_MAP) {
      if (entry.patterns.some(p => cleanText.includes(p))) {
        if (emojiLevel === 'few' && !allowedFew.has(entry.icon)) continue;
        return `<h2${attrs}>${entry.icon} ${text}</h2>`;
      }
    }
    return match;
  });
}

/* ----------------------------------------------------------
   히어로 카드 HTML 생성 (inline style — BlogSpot 호환)
   ---------------------------------------------------------- */
function buildHeroImageBlock(keyword, title, summary, options) {
  const opts = options || {};
  const badge1 = opts.badge1 || keyword;
  const badge2 = opts.badge2 || '정보글';
  const badge3 = opts.badge3 || '2026';
  const hookText = opts.hookText || (summary ? summary.slice(0, 50) + '…' : '핵심 정보를 한눈에 정리했습니다.');
  const icon = opts.icon || getKeywordIcon(keyword);
  const accentColor = opts.accentColor || '#2563eb';

  return `<div class="bpw-hero" style="
    background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
    border-radius: 16px;
    padding: 32px 24px;
    margin: 0 0 24px 0;
    text-align: center;
    border: 1.5px solid #dbeafe;
    font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Segoe UI', sans-serif;
  ">
    <div style="font-size: 48px; margin-bottom: 12px;">${icon}</div>
    <h1 style="
      font-size: 22px;
      font-weight: 800;
      color: #1e3a5f;
      margin: 0 0 10px 0;
      line-height: 1.4;
      letter-spacing: -0.3px;
    ">${escapeBasicHtml(title || keyword + ' 완전 정리')}</h1>
    <p style="
      font-size: 14px;
      color: #4b5563;
      margin: 0 0 16px 0;
      line-height: 1.6;
    ">${escapeBasicHtml(hookText)}</p>
    <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
      <span style="
        background: ${accentColor};
        color: white;
        font-size: 12px;
        font-weight: 700;
        padding: 4px 12px;
        border-radius: 999px;
      ">${escapeBasicHtml(badge1)}</span>
      <span style="
        background: #f1f5f9;
        color: #475569;
        font-size: 12px;
        font-weight: 600;
        padding: 4px 12px;
        border-radius: 999px;
      ">${escapeBasicHtml(badge2)}</span>
      <span style="
        background: #f1f5f9;
        color: #475569;
        font-size: 12px;
        font-weight: 600;
        padding: 4px 12px;
        border-radius: 999px;
      ">${escapeBasicHtml(badge3)}</span>
    </div>
    <!-- 🖼️ [이미지 삽입 위치] AI 이미지 생성 후 이 자리에 <img> 태그로 교체하세요. -->
    <!-- 향후 v0.1.5에서 AI 이미지 생성 API 연결 예정 -->
  </div>`;
}

/* ----------------------------------------------------------
   키워드 → 대표 아이콘 자동 선택
   ---------------------------------------------------------- */
function getKeywordIcon(keyword) {
  const kw = String(keyword || '').toLowerCase();
  if (/요금|비용|가격|절약|절감/.test(kw))  return '💰';
  if (/대출|금리|금융|보험/.test(kw))        return '🏦';
  if (/청소기|가전|제품|스마트/.test(kw))    return '🔌';
  if (/부동산|아파트|전세|월세/.test(kw))    return '🏠';
  if (/ai|챗gpt|인공지능|gemini/.test(kw))   return '🤖';
  if (/건강|운동|다이어트|식단/.test(kw))    return '💪';
  if (/여행|관광|숙박|호텔/.test(kw))        return '✈️';
  if (/음식|레시피|맛집|요리/.test(kw))      return '🍽️';
  if (/육아|아이|자녀|교육/.test(kw))        return '👶';
  if (/취업|직장|이직|연봉/.test(kw))        return '💼';
  return '📋';
}

/* ----------------------------------------------------------
   AI 이미지 프롬프트 생성
   ---------------------------------------------------------- */
function generateImagePrompts(keyword, title, summary) {
  const kw = keyword || '';
  const ttl = title || kw + ' 정리';
  const sum = summary ? summary.slice(0, 80) : kw + '에 관한 정보';

  return {
    mainPrompt: `Clean, modern Korean blog thumbnail. Topic: "${kw}". Style: bright white background, flat design, minimal icons, Korean text "${ttl.slice(0,20)}", professional and trustworthy, high contrast, 1200x628px`,
    thumbnailText: ttl.slice(0, 25),
    altText: `${kw} 관련 핵심 정보 정리 이미지 — ${sum}`,
    style: '밝은 흰색 배경 / 플랫 디자인 / 미니멀 아이콘 / 한국어 제목 포함',
    insertGuide: '본문 시작 부분(히어로 카드 아래) 또는 각 H2 섹션 시작 부분에 삽입하면 가독성이 높아집니다.',
    size: '1200 × 628px (블로그 대표 이미지 표준)'
  };
}

/* ----------------------------------------------------------
   글 본문에 히어로 카드 + H2 아이콘 적용 (통합)
   ---------------------------------------------------------- */
function enrichPostHtml(post, emojiLevel) {
  if (!post) return post;

  const html = post.html || post.contentHtml || '';
  const keyword = post.keyword || '';
  const title   = post.title   || '';
  const summary = post.summary || '';

  // H2 아이콘 적용
  const iconHtml = applyH2Icons(html, emojiLevel || 'few');

  // 히어로 카드 생성
  const heroBlock = buildHeroImageBlock(keyword, title, summary);

  // 히어로 카드를 맨 위에 삽입 (기존 div.bpw-post 안이면 그 안의 첫 번째 h2 앞에)
  let enrichedHtml;
  if (iconHtml.includes('class="bpw-post"')) {
    enrichedHtml = iconHtml.replace(
      /(<div[^>]*class="bpw-post"[^>]*>)/i,
      '$1' + heroBlock
    );
  } else {
    enrichedHtml = heroBlock + iconHtml;
  }

  // 이미지 프롬프트 생성
  const imagePrompts = generateImagePrompts(keyword, title, summary);

  return { ...post, html: enrichedHtml, contentHtml: enrichedHtml, imagePrompts };
}

/* ----------------------------------------------------------
   최근 생성 글 localStorage 관리 (최대 5개)
   ---------------------------------------------------------- */
const RECENT_POSTS_KEY = 'bpw_recent_posts';
const RECENT_POSTS_MAX = 5;

function saveRecentPost(post) {
  try {
    const saved = getRecentPosts();
    const newPost = {
      id:        Date.now(),
      title:     post.title || '(제목 없음)',
      keyword:   post.keyword || '',
      createdAt: post.createdAt || new Date().toISOString(),
      html:      post.html || '',
      contentHtml: post.contentHtml || post.html || '',
      summary:   post.summary || '',
      metaDescription: post.metaDescription || '',
      labels:    post.labels || [],
      imagePrompts: post.imagePrompts || null
    };
    const updated = [newPost, ...saved.filter(p => p.title !== newPost.title)].slice(0, RECENT_POSTS_MAX);
    localStorage.setItem(RECENT_POSTS_KEY, JSON.stringify(updated));
  } catch(e) {}
}

function getRecentPosts() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_POSTS_KEY) || '[]');
  } catch(e) { return []; }
}

function deleteRecentPost(id) {
  try {
    const filtered = getRecentPosts().filter(p => p.id !== id);
    localStorage.setItem(RECENT_POSTS_KEY, JSON.stringify(filtered));
  } catch(e) {}
}

function clearRecentPosts() {
  try { localStorage.removeItem(RECENT_POSTS_KEY); } catch(e) {}
}

/* ----------------------------------------------------------
   클립보드 복사 유틸
   ---------------------------------------------------------- */
async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast((label || '내용') + ' 복사 완료!');
    return true;
  } catch(e) {
    // fallback
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast((label || '내용') + ' 복사 완료!');
    return true;
  }
}

function escapeBasicHtml(v) {
  return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
