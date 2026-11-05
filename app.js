(() => {
  'use strict';
  const data = window.MIDTERM_CONTENT;
  const main = document.getElementById('main');
  if (!data?.chapters?.length) {
    main.innerHTML = '<p class="sources-note" style="padding-top:50px">教材資料尚未載入，請確認 content.js 與 index.html 位於同一目錄。</p>';
    return;
  }
  const { chapters, sources } = data;
  const allSections = chapters.flatMap(ch => ch.sections.map(s => ({ ...s, chapter: ch })));
  const totalQuestions = allSections.reduce((sum, section) => sum + section.questions.length, 0);
  const storageKey = 'ntut-microprocessor-review-v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { /* Private browser or unavailable storage. */ }
  const validSections = new Set(allSections.map(s => s.id));
  const completed = new Set((Array.isArray(saved.completed) ? saved.completed : []).filter(id => validSections.has(id)));
  const validChecks = new Set(chapters.flatMap(ch => ch.checks.map((_, i) => `${ch.id}-check-${i}`)));
  const checked = new Set((Array.isArray(saved.checked) ? saved.checked : []).filter(id => validChecks.has(id)));
  let currentChapter = null;
  let toastTimer;
  let observer;
  const mobile = window.matchMedia('(max-width: 760px)');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const paths = {
    menu: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    home: '<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    book: '<path d="M12 5v16M3 4c3-1 6 0 9 2 3-2 6-3 9-2v15c-3-1-6 0-9 2-3-2-6-3-9-2z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    file: '<path d="M14 2H5v20h14V7zM14 2v6h5M8 13h8M8 17h6"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
    terminal: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m6 9 3 3-3 3m6 0h5"/>',
    gpio: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
    qt: '<rect x="2" y="3" width="20" height="18" rx="3"/><path d="M2 8h20M7 12h3v5H7zm7 0h3m-3 4h3"/>',
    network: '<circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="m10 8-4 8m8-8 4 8M8 19h8"/>',
    spi: '<path d="M3 5h18M3 12h18M3 19h18m-5-3 3 3-3 3M8 2 5 5l3 3m8 1 3 3-3 3"/>',
    driver: '<path d="m12 2 10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.book}</svg>`;
  const chapterIcons = ['map', 'terminal', 'gpio', 'qt', 'network', 'spi', 'driver'];
  const chapterShort = ['課程導覽', 'Linux 與編譯', 'GPIO 輸入輸出', 'Qt 圖形介面', 'IoT 遠端控制', 'SPI 與感測', 'Linux 裝置驅動'];
  function sourceUrl(file, pages = '') {
    const page = String(pages).match(/\d+/)?.[0];
    return `../${file.split('/').map(encodeURIComponent).join('/')}${page ? `#page=${page}` : ''}`;
  }
  function saveProgress() {
    try { localStorage.setItem(storageKey, JSON.stringify({ completed: [...completed], checked: [...checked] })); }
    catch { toast('此瀏覽器無法保存紀錄，本次仍可繼續複習。'); }
    updateProgress();
  }
  function updateProgress() {
    const percent = Math.round(completed.size / allSections.length * 100);
    document.getElementById('progress-value').textContent = `${percent}%`;
    document.getElementById('progress-bar').style.width = `${percent}%`;
    document.getElementById('progress-detail').textContent = `${completed.size} / ${allSections.length} 小節已複習 · ${checked.size} 項自我檢查`;
    document.querySelectorAll('[data-complete]').forEach(button => {
      const done = completed.has(button.dataset.complete);
      button.classList.toggle('is-complete', done);
      button.setAttribute('aria-pressed', String(done));
      button.innerHTML = `${icon(done ? 'check' : 'circle')}${done ? '已複習' : '標記已複習'}`;
    });
  }
  function toast(message) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'), 2500);
  }
  function renderNavigation(active = 'home') {
    document.getElementById('chapter-nav').innerHTML = `
      <a href="#home" class="nav-link ${active === 'home' ? 'active' : ''}" ${active === 'home' ? 'aria-current="page"' : ''}><span class="nav-icon">${icon('home')}</span>複習總覽</a>
      ${chapters.map((ch, i) => `<a class="nav-link ${active === ch.id ? 'active' : ''}" href="#${ch.id}" ${active === ch.id ? 'aria-current="page"' : ''}><span class="nav-number">${ch.number}</span>${escape(chapterShort[i] || ch.title)}</a>
      ${active === ch.id ? `<div class="nav-sub">${ch.sections.map((s, j) => `<a href="#${s.id}" data-section-link="${s.id}">${j + 1}. ${escape(s.title)}</a>`).join('')}<a href="#${ch.id}-check" data-section-link="${ch.id}-check">章末自我檢查</a></div>` : ''}`).join('')}`;
  }
  function heroVisual() {
    return `<div class="hero-visual" aria-hidden="true">
      <svg class="hero-board" viewBox="0 0 360 350" fill="none">
        <defs><linearGradient id="chip-face" x1="110" y1="88" x2="250" y2="260" gradientUnits="userSpaceOnUse"><stop stop-color="#4c586e"/><stop offset="1" stop-color="#1e2739"/></linearGradient><linearGradient id="board-face" x1="80" y1="40" x2="300" y2="330" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#e8ecf2"/></linearGradient><filter id="chip-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#7386a2" flood-opacity=".19"/></filter></defs>
        <g transform="translate(181 176) rotate(-26) skewX(8) translate(-181 -176)">
          <rect x="61" y="61" width="239" height="239" rx="29" fill="#d8dfe9"/>
          <rect x="61" y="54" width="239" height="239" rx="29" fill="url(#board-face)" stroke="white" stroke-width="2"/>
          <g stroke="#ccd5e1" stroke-width="1.5"><path d="M60 107h51v43m-51 67h52v-31m188-85h-51v46m51 78h-51v-35M113 54v56h39m96-56v56h-36M114 293v-53h39m93 53v-53h-38"/><path d="M61 137h35m-35 51h35m204-52h-35m35 52h-35M145 54v33m35-33v33m34-33v33m-68 206v-33m35 33v-33m34 33v-33"/></g>
          <g fill="#abbdd2"><circle cx="82" cy="77" r="4"/><circle cx="279" cy="77" r="4"/><circle cx="82" cy="271" r="4"/><circle cx="279" cy="271" r="4"/></g>
          <g stroke="#8f9db0" stroke-width="5" stroke-linecap="round"><path d="M127 128h-10m10 17h-10m10 17h-10m10 17h-10m10 17h-10m10 17h-10m116-85h10m-10 17h10m-10 17h10m-10 17h10m-10 17h10m-10 17h10M138 117v-10m17 10v-10m17 10v-10m17 10v-10m17 10v-10m17 10v-10m-85 116v10m17-10v10m17-10v10m17-10v10m17-10v10m17-10v10"/></g>
          <rect x="126" y="116" width="109" height="109" rx="13" fill="url(#chip-face)" stroke="#5e6b80" filter="url(#chip-shadow)"/>
          <rect x="137" y="127" width="87" height="87" rx="8" stroke="#69768c" stroke-opacity=".4"/>
          <text x="181" y="180" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="30" fill="#e2eaff" font-weight="500">μP</text><text x="181" y="199" text-anchor="middle" font-family="sans-serif" font-size="5.8" letter-spacing="2.5" fill="#9aacc8">CONNECT THE DOTS</text>
        </g>
      </svg>
      <span class="hero-tag tag1">01 <b>Compile.</b></span><span class="hero-tag tag2">02 <b>Connect.</b></span><span class="hero-tag tag3">03 <b>Control.</b></span>
    </div>`;
  }
  function renderHome() {
    observer?.disconnect();
    currentChapter = 'home';
    renderNavigation('home');
    const next = allSections.find(s => !completed.has(s.id)) || allSections[0];
    const count = ch => ch.sections.filter(s => completed.has(s.id)).length;
    main.innerHTML = `
      <section class="home-hero">
        <div class="hero-copy"><div class="eyebrow">115-1 · MICROPROCESSOR SYSTEMS LAB</div><h1>看懂系統，<span>串起每個實作。</span></h1><p>從第一行編譯指令，到驅動硬體的那一刻。<br>讓每個觀念，找到它的位置。</p><div class="hero-actions"><a class="primary-button" href="#${next.id}">${completed.size ? '繼續複習' : '開始複習'}${icon('arrow')}</a><a class="quiet-link" href="#ch0">先看課程地圖 ↗</a></div></div>
        ${heroVisual()}
      </section>
      <div class="stats-strip" aria-label="教材統計"><div class="stat"><strong>${sources.length}</strong><span>份原始教材</span></div><div class="stat"><strong>${chapters.length}</strong><span>個複習主題</span></div><div class="stat"><strong>${allSections.length}</strong><span>個重點小節</span></div><div class="stat"><strong>${totalQuestions}</strong><span>題隨堂練習</span></div></div>
      <div class="section-heading"><h2>一步一步，建立全貌。</h2><p>依序閱讀，也可以自由跳轉。</p></div>
      <div class="chapter-grid">${chapters.map((ch, i) => i === 0 ? `
        <a class="chapter-card guide-card" href="#${ch.id}"><div class="card-top"><span class="card-symbol">${icon(chapterIcons[i])}</span></div><div><h3>00 · ${escape(ch.title)}</h3><div class="guide-description">課程地圖、開發平台與複習方式</div></div><div class="card-bottom"><span>${ch.sections.length} 小節 · 導讀</span>${icon('arrow')}</div></a>` : `
        <a class="chapter-card" href="#${ch.id}"><div class="card-top"><span class="card-number">${ch.number}</span><span class="card-symbol">${icon(chapterIcons[i])}</span></div><h3>${escape(chapterShort[i])}</h3><p>${escape(ch.summary)}</p><div class="card-bottom"><span>${ch.sections.length} 小節${count(ch) ? ` · 已複習 ${count(ch)}` : ` · ${ch.sources.length} 份教材`}</span>${icon('arrow')}</div></a>`).join('')}</div>
      <div class="study-note">${icon('info')}<div><strong>先試著回答，再展開答案。</strong><p>每節有分級練習，章末有自我檢查；答案預設收合。標記已複習，下一次就能接著讀。<br>級別為複習建議，題目依教材自編；實際期中範圍依教師公告。</p><div class="legend"><span>難度：1 辨識 · 2 應用 · 3 整合</span><span>重要性：1 補充 · 2 常用 · 3 核心</span><span>關聯：1 延伸 · 2 支援 · 3 先備</span></div></div></div>`;
    document.getElementById('breadcrumb').textContent = '期中複習';
    document.title = '微算機・期中複習';
  }
  function flow(nodes, caption) {
    return `<figure class="diagram"><div class="diagram-flow">${nodes.map((n, i) => `${i ? '<span class="diagram-arrow" aria-hidden="true">→</span>' : ''}<div class="diagram-node"><strong>${escape(n[0])}</strong><small>${escape(n[1])}</small></div>`).join('')}</div><figcaption>${caption}</figcaption></figure>`;
  }
  function diagram(type) {
    if (type === 'roadmap') return flow([['Host', '編輯與編譯'], ['Target', '執行程式'], ['介面', 'GUI / 網路'], ['硬體', 'GPIO / SPI']], '觀念圖 · 同一個系統，從開發端走到實體周邊。');
    if (type === 'toolchain') return flow([['前處理', '.cpp → 展開原始碼'], ['編譯', '→ .s 組合語言'], ['組譯', '→ .o 目的檔'], ['連結', '→ 可執行檔']], '編譯器在 Host 執行；交叉編譯產出的程式由 Target 執行。');
    if (type === 'gpio') return flow([['程式', '設定 direction'], ['GPIO', '讀／寫 value'], ['電路', '電位與電流路徑'], ['結果', '按鈕輸入／LED 亮滅']], '方向決定輸入或輸出；電位是否代表 LED 亮，要看接線。');
    if (type === 'qt') return flow([['Sender', 'Slider 數值改變'], ['Signal', 'valueChanged(int)'], ['Slot', 'setValue(int)'], ['Receiver', 'SpinBox / ProgressBar']], 'connect 建立事件與處理動作的關係；硬體控制需要另外呼叫。');
    if (type === 'network') return flow([['瀏覽器', 'HTTP 請求'], ['Node / Express', '路由與參數'], ['C++ 子程序', 'GPIO 控制'], ['周邊', 'LED 狀態']], 'Lab 4 控制路徑 · 反方向透過子程序輸出與 HTTP 回應傳回結果。');
    if (type === 'driver') return `<figure class="diagram"><div class="layer-diagram"><div class="layer"><strong>使用者程式</strong><span>open / read / write / close</span></div><div class="layer-arrow">↓ 系統呼叫</div><div class="layer"><strong>Linux 核心 / VFS</strong><span>裝置節點與 file_operations</span></div><div class="layer-arrow">↓ 驅動操作</div><div class="layer"><strong>裝置驅動程式</strong><span>回呼函式與硬體控制</span></div><div class="layer-arrow">↓</div><div class="layer"><strong>硬體周邊</strong><span>GPIO / SPI / 其他控制器</span></div></div><figcaption>使用者空間與核心空間分開；跨空間資料需要專用的複製介面。</figcaption></figure>`;
    if (type === 'spi') return `<figure class="diagram"><svg class="diagram-svg" viewBox="0 0 650 210" role="img" aria-label="SPI 四條訊號：SCLK 與 MOSI 從主控端到裝置，MISO 從裝置到主控端，CS 由主控選取裝置。"><defs><marker id="spi-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto-start-reverse"><path d="M0 0 6 3 0 6" fill="none" stroke="#809dbe"/></marker></defs><rect x="20" y="20" width="155" height="165" rx="15" fill="white" stroke="#dce3ed"/><rect x="475" y="20" width="155" height="165" rx="15" fill="white" stroke="#dce3ed"/><g font-family="-apple-system,sans-serif" text-anchor="middle"><text x="97" y="92" fill="#547496" font-size="17">主控端</text><text x="97" y="115" fill="#939da9" font-size="11">Jetson</text><text x="552" y="92" fill="#547496" font-size="17">SPI 裝置</text><text x="552" y="115" fill="#939da9" font-size="11">MCP3008 ADC</text></g><g stroke="#9bb0c9" stroke-width="1.5" marker-end="url(#spi-arrow)"><path d="M175 50h297"/><path d="M175 90h297"/><path d="M475 130H178"/><path d="M175 170h297"/></g><g fill="#7e8ea2" font-family="-apple-system,sans-serif" font-size="10" text-anchor="middle"><rect x="290" y="36" width="70" height="20" fill="#f7f8fb"/><text x="325" y="50">SCLK 時脈</text><rect x="290" y="76" width="70" height="20" fill="#f7f8fb"/><text x="325" y="90">MOSI 送出</text><rect x="290" y="116" width="70" height="20" fill="#f7f8fb"/><text x="325" y="130">MISO 接收</text><rect x="290" y="156" width="70" height="20" fill="#f7f8fb"/><text x="325" y="170">CS 片選</text></g></svg><figcaption>時序需符合裝置的 CPOL / CPHA；Lab 5 以 GPIO 模擬這些訊號。</figcaption></figure>`;
    return '';
  }
  function levelChip(label, value, modifier = '') {
    return `<span class="level-chip ${modifier}" title="${label} ${value} / 3"><span>${label}</span><span class="level-dots" aria-hidden="true">${[1,2,3].map(n => `<i class="${n <= value ? 'filled' : ''}"></i>`).join('')}</span><strong>${value}/3</strong></span>`;
  }
  function renderSection(s, ch, index) {
    return `<section class="lesson" id="${s.id}" aria-labelledby="${s.id}-title">
      <div class="lesson-heading"><span class="lesson-number">${ch.number}.${index + 1}</span><h2 id="${s.id}-title">${escape(s.title)}</h2></div>
      <div class="levels">${levelChip('難度', s.level)}${levelChip('重要性', s.importance, `important-${s.importance}`)}${levelChip(ch.id === 'ch6' ? '整合關聯' : '後續關聯', s.connectionLevel)}</div>
      <p class="lesson-intro">${escape(s.intro)}</p>
      <div class="key-points">${s.points.map(p => `<div class="key-point"><h3>${escape(p.term)}</h3><p>${escape(p.text)}</p></div>`).join('')}</div>
      ${s.diagram ? diagram(s.diagram) : ''}
      ${s.table ? `<div class="table-wrap"><table><thead><tr>${s.table.headers.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      ${s.code ? `<div class="code-block"><div class="code-caption"><span>${escape(s.code.caption)}</span><button class="copy-code" data-copy="${s.id}" aria-label="複製${escape(s.title)}的程式碼">複製</button></div><pre><code>${escape(s.code.text)}</code></pre></div>` : ''}
      ${s.pitfall ? `<div class="pitfall"><strong>容易混淆</strong>${escape(s.pitfall)}</div>` : ''}
      <div class="connections"><span>${ch.id === 'ch6' ? '整合應用 ↗' : '接著會用到 ↗'}</span><div class="connection-list">${s.connections.map(c => `<div>${c.target ? `<a href="#${c.target}">${escape(c.label)}</a>` : `<span class="connection-text">${escape(c.label)}</span>`}<span class="connection-reason">${escape(c.reason)}</span></div>`).join('')}</div></div>
      <div class="quiz"><div class="quiz-label"><h3>停一下，試著回答。</h3><span>點選題目查看答案</span></div>${s.questions.map((q, i) => `<details class="question"><summary><span class="question-index">${String(i + 1).padStart(2, '0')}</span><span class="question-text">${escape(q.prompt)}</span><span class="question-level">難度 ${q.level}/3</span></summary><div class="answer"><span class="answer-label">參考答案</span>${escape(q.answer)}</div></details>`).join('')}</div>
      <div class="lesson-footer"><div class="source-refs">${s.sourceRefs.map(ref => { const src = sources.find(item => item.file === ref.file); return `<a href="${sourceUrl(ref.file, ref.pages)}" target="_blank" rel="noopener" title="${escape(ref.file)}">${escape(src?.title?.split(' · ')[0] || '原教材')} · p.${escape(ref.pages)} ↗</a>`; }).join('')}</div><button class="complete-button" data-complete="${s.id}" aria-pressed="false">${icon('circle')}標記已複習</button></div>
    </section>`;
  }
  function renderChapter(ch) {
    currentChapter = ch.id;
    renderNavigation(ch.id);
    const index = chapters.indexOf(ch);
    main.innerHTML = `<header class="chapter-hero"><div class="eyebrow">CHAPTER ${ch.number} · ${escape(ch.subtitle)}</div><h1>${escape(ch.title)}</h1><p>${escape(ch.summary)}</p><div class="chapter-meta"><span>${ch.sections.length} 個小節 · ${ch.sections.reduce((n, s) => n + s.questions.length, 0)} 題練習</span>${ch.sources.map(src => `<a class="source-chip" href="${sourceUrl(src.file)}" target="_blank" rel="noopener" title="${escape(src.title)}">${icon('file')}${escape(src.title.split(' · ')[0])}</a>`).join('')}</div></header>
      <nav class="chapter-jump" aria-label="本章小節">${ch.sections.map((s, i) => `<a href="#${s.id}">${i + 1}. ${escape(s.title)}</a>`).join('')}<a href="#${ch.id}-check">自我檢查</a></nav>
      ${ch.sections.map((s, i) => renderSection(s, ch, i)).join('')}
      <section class="self-check" id="${ch.id}-check" aria-labelledby="check-title"><div class="eyebrow">CHECK YOUR UNDERSTANDING</div><h2 id="check-title">這一章，你掌握了嗎？</h2><p>先用自己的話解釋，再展開參考答案。勾選代表你能獨立說明。</p>${ch.checks.map((check, i) => { const id = `${ch.id}-check-${i}`; return `<div class="check-row"><input id="${id}" type="checkbox" data-check="${id}" ${checked.has(id) ? 'checked' : ''}><label for="${id}">${escape(check.prompt)}</label><details><summary>查看參考答案</summary><div class="answer">${escape(check.answer)}</div></details></div>`; }).join('')}</section>
      <nav class="chapter-next" aria-label="前後章節">${index > 0 ? `<a href="#${chapters[index - 1].id}"><small>上一章</small>← ${escape(chapterShort[index - 1])}</a>` : '<a href="#home"><small>回到首頁</small>← 複習總覽</a>'}${index < chapters.length - 1 ? `<a class="next-link" href="#${chapters[index + 1].id}"><small>下一章</small>${escape(chapterShort[index + 1])} →</a>` : '<a class="next-link" href="#home"><small>完成一輪，回頭串起觀念</small>回到複習總覽 →</a>'}</nav>`;
    document.getElementById('breadcrumb').textContent = `${ch.number} · ${chapterShort[index]}`;
    document.title = `${ch.title} | 微算機・期中複習`;
    updateProgress();
    observer?.disconnect();
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          document.querySelectorAll('[data-section-link]').forEach(a => {
            const active = a.dataset.sectionLink === entry.target.id;
            a.classList.toggle('current', active);
            if (active) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
          });
        }
      }, { rootMargin: '-90px 0px -65% 0px', threshold: 0 });
      document.querySelectorAll('.lesson, .self-check').forEach(node => observer.observe(node));
    }
  }
  function renderSources() {
    observer?.disconnect();
    currentChapter = 'sources';
    renderNavigation('sources');
    main.innerHTML = `<header class="chapter-hero"><div class="eyebrow">SOURCE LIBRARY</div><h1>每個重點，都能回查。</h1><p>14 份教材，一條清楚的複習路徑。</p></header><p class="sources-note">各節底部附 PDF 實體頁碼，點選即可回查。多段頁碼會先開啟第一段。<br>教材沿用原目錄位置；瀏覽器是否直接跳頁，取決於 PDF 閱讀器。課堂舊版介面以原環境為準。</p><div class="sources-list">${sources.map(src => { const used = chapters.filter(ch => ch.sources.some(s => s.file === src.file)); return `<div class="source-card">${icon('file')}<div><h2>${escape(src.title)}</h2><p>${src.pages} 頁 · ${used.map(ch => `<a href="#${ch.id}">第 ${ch.number} 章</a>`).join('、')}</p></div><a href="${sourceUrl(src.file)}" target="_blank" rel="noopener" aria-label="開啟${escape(src.title)}">開啟 PDF ↗</a></div>`; }).join('')}</div>`;
    document.getElementById('breadcrumb').textContent = '教材索引';
    document.title = '教材索引 | 微算機・期中複習';
  }
  function closeMobileSidebar() {
    const wasOpen = document.body.classList.contains('sidebar-mobile-open');
    document.body.classList.remove('sidebar-mobile-open');
    updateMenuState();
    if (wasOpen) document.getElementById('menu-toggle').focus();
  }
  function updateMenuState() {
    const expanded = mobile.matches ? document.body.classList.contains('sidebar-mobile-open') : !document.body.classList.contains('sidebar-collapsed');
    const button = document.getElementById('menu-toggle');
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', expanded ? '收合側邊欄' : '展開側邊欄');
    const sidebar = document.getElementById('sidebar');
    sidebar.inert = !expanded;
    sidebar.setAttribute('aria-hidden', String(!expanded));
    document.querySelector('.page-shell').inert = mobile.matches && expanded;
  }
  function route() {
    let target = 'home';
    try { target = decodeURIComponent(location.hash.slice(1)) || 'home'; } catch { /* Invalid URL fragment: return home. */ }
    const ch = chapters.find(item => target === item.id || item.sections.some(s => s.id === target) || target === `${item.id}-check`);
    if (ch) {
      if (currentChapter !== ch.id) renderChapter(ch);
      const anchor = target !== ch.id ? document.getElementById(target) : null;
      requestAnimationFrame(() => {
        if (anchor) anchor.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
      });
    } else {
      if (target === 'sources') renderSources(); else renderHome();
      window.scrollTo(0, 0);
    }
    closeSearch();
    closeMobileSidebar();
    if (!ch || target === ch.id) main.focus({ preventScroll: true });
  }
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  function closeSearch() {
    searchResults.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
  }
  function search() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    if (!query) { closeSearch(); return; }
    const terms = query.split(/\s+/);
    const results = allSections.filter(s => {
      const text = [s.title, s.intro, ...s.points.flatMap(p => [p.term, p.text]), s.code?.text || '', ...s.questions.map(q => q.prompt)].join(' ').toLocaleLowerCase();
      return terms.every(term => text.includes(term));
    });
    searchResults.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    searchResults.innerHTML = results.length ? results.slice(0, 10).map(s => `<a class="search-result" href="#${s.id}"><strong>${escape(s.title)}</strong><span>第 ${s.chapter.number} 章 · ${escape(s.chapter.title)} · 難度 ${s.level}/3</span></a>`).join('') : '<div class="search-empty">找不到相關小節。試試 GPIO、make、SPI 或權限。</div>';
  }
  main.addEventListener('click', async event => {
    const complete = event.target.closest('[data-complete]');
    if (complete) {
      const id = complete.dataset.complete;
      if (completed.has(id)) completed.delete(id); else completed.add(id);
      saveProgress();
      toast(completed.has(id) ? '已記下這一步，繼續前進。' : '已取消複習標記。');
    }
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      const section = allSections.find(s => s.id === copy.dataset.copy);
      try {
        await navigator.clipboard.writeText(section.code.text);
        toast('程式碼已複製。');
      } catch {
        const range = document.createRange();
        range.selectNodeContents(copy.closest('.code-block').querySelector('code'));
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        toast('已選取程式碼，按 ⌘C 或 Ctrl+C 複製。');
      }
    }
  });
  main.addEventListener('change', event => {
    const node = event.target.closest('[data-check]');
    if (node) { if (node.checked) checked.add(node.dataset.check); else checked.delete(node.dataset.check); saveProgress(); }
  });
  document.getElementById('reset-progress').addEventListener('click', () => {
    if (!completed.size && !checked.size) { toast('目前沒有複習紀錄。'); return; }
    if (window.confirm('清除所有小節與自我檢查紀錄，重新開始複習？')) {
      completed.clear(); checked.clear(); saveProgress();
      document.querySelectorAll('[data-check]').forEach(input => { input.checked = false; });
      if (currentChapter === 'home') renderHome();
      toast('複習紀錄已重設。');
    }
  });
  document.getElementById('menu-toggle').innerHTML = icon('menu');
  document.getElementById('sidebar-close').innerHTML = icon('close');
  document.getElementById('search-icon').innerHTML = icon('search');
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.body.classList.toggle(mobile.matches ? 'sidebar-mobile-open' : 'sidebar-collapsed');
    updateMenuState();
    if (mobile.matches && document.body.classList.contains('sidebar-mobile-open')) document.getElementById('sidebar-close').focus();
  });
  document.getElementById('sidebar-scrim').addEventListener('click', closeMobileSidebar);
  document.getElementById('sidebar-close').addEventListener('click', closeMobileSidebar);
  document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); main.focus(); main.scrollIntoView(); });
  document.getElementById('chapter-nav').addEventListener('click', event => { if (event.target.closest('a')) closeMobileSidebar(); });
  searchInput.addEventListener('input', search);
  searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) search(); });
  searchResults.addEventListener('click', event => { if (event.target.closest('a')) closeSearch(); });
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && !searchResults.hidden) { event.preventDefault(); searchResults.querySelector('a')?.focus(); }
    if (event.key === 'Enter' && !searchResults.hidden) { const first = searchResults.querySelector('a'); if (first) { event.preventDefault(); first.click(); } }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.search-wrap')) closeSearch(); });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !event.metaKey && !event.ctrlKey) { event.preventDefault(); searchInput.focus(); }
    if (event.key === 'Escape') { closeSearch(); closeMobileSidebar(); searchInput.blur(); }
    if (event.key === 'Tab' && mobile.matches && document.body.classList.contains('sidebar-mobile-open')) {
      const focusables = [...document.querySelectorAll('#sidebar a, #sidebar button')];
      const first = focusables[0], last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  mobile.addEventListener('change', () => { document.body.classList.remove('sidebar-mobile-open'); updateMenuState(); });
  window.addEventListener('hashchange', route);
  route();
  updateProgress();
  updateMenuState();
})();
