(function(){
  const app = document.getElementById('archive-view-root');
  if(!app || !window.MapsDataUtils || !window.ArchivesConfig) return;
  const U = window.MapsDataUtils;
  const CFG = window.ArchivesConfig.archives || {};
  const params = new URLSearchParams(window.location.search);
  const archiveKey = params.get('archive') || 'CASTELNUOVO_GALLIANI';
  const headerTitle = document.getElementById('archive-title');
  const headerSub = document.getElementById('archive-subtitle');
  const statsHost = document.getElementById('archive-stats');
  const modeButtons = Array.from(document.querySelectorAll('[data-mode]'));
  const layout = document.getElementById('archive-layout');
  const readerHost = document.getElementById('archive-reader');
  const dossierHost = document.getElementById('archive-dossier');
  const lightbox = document.getElementById('archive-lightbox');
  const lightboxImg = lightbox?.querySelector('.lightbox__img');
  const lightboxCaption = lightbox?.querySelector('.lightbox__caption');
  const lightboxClose = lightbox?.querySelector('.lightbox__close');
  const state = { items: [], current: 0, mode: 'dossier', config: null, bookIndex: 0 };

  function escapeHtml(s){ return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function slugify(s){ return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function getItemsForKey(key, rows){ const config = CFG[key] || {}; if(Array.isArray(config.memberArchives) && config.memberArchives.length){ return rows.filter(row => config.memberArchives.includes(row.archivio)); } return rows.filter(row => row.archivio === key); }
  function isSequenceArchive(config){ return config && config.readerType === 'sequence'; }
  function labelFromArchive(key){ return (state.config && state.config.label) || U.labelFromArchive(key); }
  function resolveItemPreview(item){ return item?.previewPath || U.resolvePreviewPath(item) || ''; }
  function resolveItemFull(item){ return item?.fullPath || U.resolveFullImagePath(item) || resolveItemPreview(item) || ''; }
  function itemHasGeo(item){ return !!item?.geoUrl || (!item?.previewPath && U.hasGeo(item)); }
  function itemHasTagged(item){ return !!item?.taggedUrl || (!item?.previewPath && U.hasTagged(item)); }
  function itemGeoUrl(item){ return item?.geoUrl || U.webgisUrl(item) || ''; }
  function itemTaggedUrl(item){ return item?.taggedUrl || U.detailUrl(item) || ''; }
  function yearLabel(item){ return item?.year ? `Anno: ${escapeHtml(item.year)}` : 'Anno: n/d'; }
  function setMode(mode){
    state.mode = mode;
    layout.dataset.mode = mode;
    modeButtons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.mode === mode));
    if(mode === 'reader') renderReader();
    else if(mode === 'split') renderSplitText(state.config);
    else renderDossier(state.config);
  }
  function renderStats(items, config){
    if(isSequenceArchive(config)){
      statsHost.innerHTML = `<span class="hero-pill"><i class="bi bi-images"></i> ${items.length} tavole</span><span class="hero-pill"><i class="bi bi-book-half"></i> Quaderno illustrato</span><span class="hero-pill"><i class="bi bi-stars"></i> Percorso narrativo</span>`;
      return;
    }
    const geo=items.filter(U.hasGeo).length; const tagged=items.filter(U.hasTagged).length; const extra = Array.isArray(config?.memberArchives) ? `<span class="hero-pill"><i class="bi bi-diagram-3"></i> ${config.memberArchives.length} nuclei</span>` : ''; statsHost.innerHTML = `<span class="hero-pill"><i class="bi bi-images"></i> ${items.length} immagini</span><span class="hero-pill"><i class="bi bi-globe2"></i> ${geo} georeferite</span><span class="hero-pill"><i class="bi bi-pin-map"></i> ${tagged} taggate</span>${extra}`;
  }
  function makeActionButton(type, href){ const map = { zoom:{icon:'bi-plus-lg',label:'Ingrandisci'}, full:{icon:'bi-arrows-fullscreen',label:'Alta risoluzione'}, webgis:{icon:'bi-map',label:'Apri nel WebGIS'}, tagged:{icon:'bi-pin-map',label:'Apri vista taggata'} }; const meta = map[type]; return `<a class="icon-action ${type === 'zoom' ? 'js-zoom' : ''}" href="${href || '#'}" ${type === 'full' ? 'target="_blank" rel="noopener"' : ''} title="${meta.label}" aria-label="${meta.label}"><i class="bi ${meta.icon}"></i><span class="sr-only">${meta.label}</span></a>`; }
  function openLightbox(src, caption){ if(!lightbox || !src) return; lightbox.hidden = false; lightbox.removeAttribute('hidden'); document.body.classList.add('has-lightbox'); if(lightboxImg) lightboxImg.src = src; if(lightboxCaption) lightboxCaption.textContent = caption || ''; }
  function closeLightbox(){ if(!lightbox) return; lightbox.hidden = true; lightbox.setAttribute('hidden', 'hidden'); document.body.classList.remove('has-lightbox'); if(lightboxImg) lightboxImg.removeAttribute('src'); if(lightboxCaption) lightboxCaption.textContent = ''; }
  function bindZoomables(scope){ if(!scope) return; scope.querySelectorAll('[data-zoom-src]').forEach(node => node.addEventListener('click', (ev) => { ev.preventDefault(); openLightbox(node.dataset.zoomSrc, node.dataset.zoomCaption || ''); })); }

  function buildSequenceUrl(config, index){ return `${config.sequenceDir || ''}${config.sequencePrefix || ''}${String(index).padStart(4, '0')}${config.sequenceExt || '.jpg'}`; }
  async function resourceExists(url){
    try{
      const response = await fetch(url, { method:'HEAD', cache:'no-store' });
      if(response.ok) return true;
      if(response.status !== 405 && response.status !== 501) return false;
    }catch(_error){ /* fallback sotto */ }
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }
  async function findSequenceEnd(config){
    const start = Math.max(1, Number(config.sequenceStart || 1));
    const max = Math.max(start, Number(config.sequenceMax || 9999));
    if(!(await resourceExists(buildSequenceUrl(config, start)))) return start - 1;
    let low = start;
    let high = Math.min(max, Math.max(start + 1, start * 2));
    while(high <= max && await resourceExists(buildSequenceUrl(config, high))){
      low = high;
      if(high === max) return max;
      high = Math.min(max, high * 2);
    }
    let left = low + 1;
    let right = Math.max(low, high - 1);
    while(left <= right){
      const middle = Math.floor((left + right) / 2);
      if(await resourceExists(buildSequenceUrl(config, middle))){
        low = middle;
        left = middle + 1;
      }else{
        right = middle - 1;
      }
    }
    return low;
  }
  async function loadSequenceItems(config){
    const start = Math.max(1, Number(config.sequenceStart || 1));
    const end = await findSequenceEnd(config);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => {
      const index = start + offset;
      const url = buildSequenceUrl(config, index);
      return {
        fid: index,
        name: `${config.sequencePrefix || ''}${String(index).padStart(4, '0')}`,
        previewPath: url,
        fullPath: url,
        archivio: archiveKey,
        archivioLabel: config.label,
        info: `Tavola ${String(index).padStart(4, '0')} del quaderno Galliani.`,
        year: ''
      };
    });
  }

  function renderReader(){
    const item = state.items[state.current];
    if(!item){ readerHost.innerHTML = `<div class="empty-state">Nessuna immagine disponibile per questo archivio.</div>`; return; }
    const preview = resolveItemPreview(item), full = resolveItemFull(item), geo = itemHasGeo(item) ? itemGeoUrl(item) : '', tagged = itemHasTagged(item) ? itemTaggedUrl(item) : '';
    const actions = [full ? makeActionButton('full', full) : '', geo ? makeActionButton('webgis', geo) : '', tagged ? makeActionButton('tagged', tagged) : ''].filter(Boolean).join('');
    const thumbs = state.items.map((rec, idx) => `<button class="thumb-card ${idx===state.current?'is-active':''}" type="button" data-index="${idx}" title="${escapeHtml(rec.name || rec.fid)}"><img src="${resolveItemPreview(rec)}" alt="${escapeHtml(rec.name || rec.fid)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/other_images/placeholders/map_generic_placeholder.svg'"><span>${escapeHtml(rec.name || ('Mappa #' + rec.fid))}</span></button>`).join('');
    const kicker = isSequenceArchive(state.config) ? 'Sfoglia il volume' : 'Sfogliatore';
    const quick = isSequenceArchive(state.config) ? 'Sequenza delle tavole originali del quaderno. Le immagini vengono caricate in ordine progressivo a partire dal numero finale del file.' : (item.info || 'Nessuna nota descrittiva presente nel file di indicizzazione per questa immagine.');
    readerHost.innerHTML = `<div class="reader-shell ${isSequenceArchive(state.config)?'reader-shell--volume':''}"><div class="reader-stage"><div class="reader-stage__top"><div><div class="reader-stage__kicker">${kicker}</div><h2>${escapeHtml(item.name || ('Mappa #' + item.fid))}</h2><div class="reader-stage__meta">${yearLabel(item)} · ${escapeHtml(labelFromArchive(item.archivio))}</div></div><div class="reader-stage__actions">${actions}</div></div><div class="reader-image-wrap">${preview ? `<button class="image-zoom image-zoom--reader" type="button" data-zoom-src="${preview}" data-zoom-caption="${escapeHtml(item.name || item.fid)}"><i class="bi bi-arrows-angle-expand"></i></button><button class="reader-arrow left" type="button" data-nav="prev" aria-label="Immagine precedente"><i class="bi bi-chevron-left"></i></button><img class="reader-image" src="${preview}" alt="${escapeHtml(item.name || item.fid)}" onerror="this.onerror=null;this.src='images/other_images/placeholders/map_generic_placeholder.svg'"><button class="reader-arrow right" type="button" data-nav="next" aria-label="Immagine successiva"><i class="bi bi-chevron-right"></i></button>` : `<div class="archive-placeholder large">Anteprima non disponibile</div>`}</div><div class="reader-caption"><div class="reader-caption__label">Scheda rapida</div><p>${escapeHtml(quick)}</p></div></div><div class="reader-strip">${thumbs}</div></div>`;
    readerHost.querySelectorAll('[data-index]').forEach(btn => btn.addEventListener('click', () => { state.current = Number(btn.dataset.index) || 0; renderReader(); }));
    readerHost.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => { const dir = btn.dataset.nav === 'prev' ? -1 : 1; state.current = (state.current + dir + state.items.length) % state.items.length; renderReader(); }));
    bindZoomables(readerHost);
  }
  function findRecordByName(name){ return state.items.find(rec => rec.name === name) || null; }
  function mediaSource(block){
    if(block.source==='preview' && block.imageName){ const rec=findRecordByName(block.imageName); return rec?resolveItemPreview(rec):''; }
    if(block.source==='sequence' && block.imageName){
      if(/\.(png|jpe?g|webp)$/i.test(block.imageName)) return `${state.config.sequenceDir || ''}${block.imageName}`;
      return `${state.config.sequenceDir || ''}${block.imageName}${state.config.sequenceExt || '.jpg'}`;
    }
    if(block.source==='other'){ return block.path || ''; }
    return block.path || '';
  }
  function renderMediaFigure(block){ const src = mediaSource(block); const fallback = block.fallbackPath || ''; const caption = escapeHtml(block.caption || block.imageName || 'figura'); const media = src ? `<div class="article-media-frame"><img src="${src}" alt="${caption}" onerror="${fallback ? `this.onerror=null;this.src='${fallback}'` : `this.onerror=null;this.src='images/other_images/placeholders/map_generic_placeholder.svg'`} "><button class="image-zoom" type="button" data-zoom-src="${src}" data-zoom-caption="${caption}"><i class="bi bi-arrows-angle-expand"></i></button></div>` : `<div class="archive-placeholder figure">Immagine da inserire</div>`; return `<figure class="article-media-text__media">${media}${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`; }
  function renderFigure(block){ const src = mediaSource(block); const fallback = block.fallbackPath || ''; const caption = escapeHtml(block.caption || block.imageName || 'figura'); const img = src ? `<div class="article-media-frame"><img src="${src}" alt="${caption}" onerror="${fallback ? `this.onerror=null;this.src='${fallback}'` : `this.onerror=null;this.src='images/other_images/placeholders/map_generic_placeholder.svg'`} "><button class="image-zoom" type="button" data-zoom-src="${src}" data-zoom-caption="${caption}"><i class="bi bi-arrows-angle-expand"></i></button></div>` : `<div class="archive-placeholder figure">Immagine da inserire</div>`; return `<figure class="article-figure">${img}<figcaption>${escapeHtml(block.caption || '')}</figcaption></figure>`; }
  function extractTextBlocks(config){
    const blocks = config?.articleBlocks || [];
    return blocks.map(block => {
      if(block.type === 'text' || block.type === 'mediaText'){ return { title: block.title || '', paragraphs: block.paragraphs || [] }; }
      if(block.type === 'callout'){ return { title: block.title || '', paragraphs: [block.text || ''] }; }
      return null;
    }).filter(Boolean);
  }

  function renderCastelnuovoBook(config){
    const blocks = (config.articleBlocks || []).map((block, index) => ({
      ...block,
      id: block.title ? slugify(block.title) || `sezione-${index+1}` : `sezione-${index+1}`,
      imageSrc: mediaSource(block) || block.path || '',
      fallback: block.fallbackPath || 'images/other_images/placeholders/map_generic_placeholder.svg'
    }));
    const maxIndex = Math.max(0, blocks.length - 1);
    state.bookIndex = Math.min(state.bookIndex, maxIndex);
    const current = blocks[state.bookIndex] || null;
    if(!current){ dossierHost.innerHTML = `<div class="dossier-card"><p>Nessun contenuto disponibile.</p></div>`; return; }
    const sidebarStyle = config.sidebarFramePath ? `style="background-image:url('${config.sidebarFramePath}')"` : '';
    const bookStyle = config.bookFramePath ? `style="background-image:url('${config.bookFramePath}')"` : '';
    const toc = blocks.map((block, index) => `<button class="cg-chapter-link ${index===state.bookIndex?'is-active':''}" type="button" data-book-index="${index}"><span>${String(index + 1).padStart(2,'0')}</span><strong>${escapeHtml(block.title || `Capitolo ${index+1}`)}</strong></button>`).join('');
    const isCallout = current.type === 'callout';
    const copy = isCallout ? [current.text || ''] : (current.paragraphs || []);
    const paragraphs = copy.filter(Boolean).map(p => `<p>${escapeHtml(p)}</p>`).join('');
    const rightInner = current.imageSrc ? `<figure class="cg-book-figure"><img src="${current.imageSrc}" alt="${escapeHtml(current.caption || current.title || 'Illustrazione')}" onerror="this.onerror=null;this.src='${current.fallback}'"><figcaption>${escapeHtml(current.caption || '')}</figcaption></figure>` : `<div class="archive-placeholder figure">Immagine da inserire</div>`;
    dossierHost.innerHTML = `
      <section class="cg-book-shell">
        <aside class="cg-book-sidebar">
          <div class="cg-book-sidebar-frame" ${sidebarStyle}>
            <div class="cg-book-sidebar__eyebrow">Percorso di lettura</div>
            <h3>${escapeHtml(config.label)}</h3>
            <p>${escapeHtml(config.archiveSummary || '')}</p>
            <nav class="cg-book-chapters" aria-label="Indice dei capitoli">${toc}</nav>
          </div>
        </aside>
        <div class="cg-book-main">
          <div class="cg-book-frame" ${bookStyle}>
            <div class="cg-book-page cg-book-page--left">
              <div class="cg-page-kicker">Capitolo ${String(state.bookIndex + 1).padStart(2,'0')} / ${String(blocks.length).padStart(2,'0')}</div>
              <h2>${escapeHtml(current.title || '')}</h2>
              <div class="cg-book-text ${isCallout ? 'is-callout' : ''}">${paragraphs || '<p>Contenuto in preparazione.</p>'}</div>
            </div>
            <div class="cg-book-page cg-book-page--right">
              ${rightInner}
            </div>
          </div>
          <div class="cg-book-controls">
            <button class="btn switch" type="button" data-book-nav="prev" ${state.bookIndex===0?'disabled':''}><i class="bi bi-arrow-left"></i><span>Pagina precedente</span></button>
            <div class="cg-book-progress">${blocks.map((_, i) => `<button class="cg-book-dot ${i===state.bookIndex?'is-active':''}" type="button" data-book-index="${i}" aria-label="Vai al capitolo ${i+1}"></button>`).join('')}</div>
            <button class="btn switch" type="button" data-book-nav="next" ${state.bookIndex===maxIndex?'disabled':''}><span>Pagina successiva</span><i class="bi bi-arrow-right"></i></button>
          </div>
        </div>
      </section>`;
    dossierHost.querySelectorAll('[data-book-index]').forEach(btn => btn.addEventListener('click', () => { state.bookIndex = Number(btn.dataset.bookIndex) || 0; renderCastelnuovoBook(config); }));
    dossierHost.querySelectorAll('[data-book-nav]').forEach(btn => btn.addEventListener('click', () => {
      if(btn.dataset.bookNav === 'prev' && state.bookIndex > 0) state.bookIndex -= 1;
      if(btn.dataset.bookNav === 'next' && state.bookIndex < maxIndex) state.bookIndex += 1;
      renderCastelnuovoBook(config);
    }));
    bindZoomables(dossierHost);
  }

  function renderSplitText(config){
    if(isSequenceArchive(config)) return renderCastelnuovoBook(config);
    const textBlocks = extractTextBlocks(config);
    dossierHost.innerHTML = `<aside class="split-text-card"><div class="split-text-card__eyebrow">Scheda progetto</div><h2>${escapeHtml(config?.splitTitle || 'Lettura critica')}</h2>${config?.lead ? `<p class="split-text-card__lead">${escapeHtml(config.lead)}</p>` : ''}${textBlocks.map(block => `<section class="split-text-section">${block.title ? `<h3>${escapeHtml(block.title)}</h3>` : ''}${block.paragraphs.slice(0, 2).map(p => `<p>${escapeHtml(p)}</p>`).join('')}</section>`).join('')}</aside>`;
  }
  function renderDossier(config){
    if(isSequenceArchive(config)) return renderCastelnuovoBook(config);
    const blocks=config.articleBlocks || []; const intro=config.lead ? `<p class="dossier-lead">${escapeHtml(config.lead)}</p>` : '';
    if(!blocks.length){ dossierHost.innerHTML = `<div class="dossier-card"><h2>${escapeHtml(config.label || U.labelFromArchive(archiveKey))}</h2><p>${escapeHtml(config.archiveSummary || 'Sezione interpretativa in preparazione.')}</p></div>`; return; }
    const sections = blocks.map((block, index) => {
      const id = block.title ? slugify(block.title) || `sezione-${index+1}` : `sezione-${index+1}`;
      if(block.type==='text'){ return { id, title:block.title || `Sezione ${index+1}`, html:`<section id="${id}" class="article-block article-section">${block.title?`<h3>${escapeHtml(block.title)}</h3>`:''}${(block.paragraphs || []).map(p => `<p>${escapeHtml(p)}</p>`).join('')}</section>`}; }
      if(block.type==='mediaText'){ return { id, title:block.title || `Sezione ${index+1}`, html:`<section id="${id}" class="article-media-text article-section ${block.reverse ? 'is-reverse' : ''}">${renderMediaFigure(block)}<div class="article-media-text__body">${block.title?`<h3>${escapeHtml(block.title)}</h3>`:''}${(block.paragraphs || []).map(p => `<p>${escapeHtml(p)}</p>`).join('')}</div></section>`}; }
      if(block.type==='figure'){ return { id, title:block.title || `Figura ${index+1}`, html:`<section id="${id}" class="article-section">${renderFigure(block)}</section>`}; }
      if(block.type==='callout'){ return { id, title:block.title || `Nota ${index+1}`, html:`<section id="${id}" class="article-section"><aside class="article-callout">${block.title?`<h3>${escapeHtml(block.title)}</h3>`:''}<p>${escapeHtml(block.text || '')}</p></aside></section>`}; }
      return null;
    }).filter(Boolean);
    const toc = `<nav class="dossier-toc" aria-label="Indice dei paragrafi"><div class="dossier-toc__eyebrow">Indice</div>${sections.map((section, idx) => `<a href="#${section.id}"><span>${String(idx+1).padStart(2,'0')}</span>${escapeHtml(section.title)}</a>`).join('')}</nav>`;
    dossierHost.innerHTML = `<article class="dossier-shell">${toc}<div class="dossier-content"><div class="dossier-card">${intro}${sections.map(section => section.html).join('')}</div></div></article>`;
    bindZoomables(dossierHost);
  }
  modeButtons.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  if(lightboxClose){ lightboxClose.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); closeLightbox(); }); }
  if(lightbox){ lightbox.addEventListener('click', (ev) => { if(ev.target === lightbox) closeLightbox(); }); }
  document.addEventListener('keydown', (ev) => { if(ev.key === 'Escape' && lightbox && !lightbox.hidden) closeLightbox(); });

  readerHost.innerHTML = `<div class="archive-loading"><span class="archive-loading__spinner" aria-hidden="true"></span><div><strong>Preparazione dello sfogliatore</strong><span>Ricerca delle tavole disponibili…</span></div></div>`;
  dossierHost.innerHTML = `<div class="archive-loading"><span class="archive-loading__spinner" aria-hidden="true"></span><div><strong>Composizione del racconto</strong><span>Caricamento dei capitoli e delle immagini…</span></div></div>`;

  Promise.resolve(U.loadMaps()).then(async rows => {
    const config=CFG[archiveKey] || {};
    let items=getItemsForKey(archiveKey, rows);
    if(isSequenceArchive(config)) items = await loadSequenceItems(config);
    state.config = config;
    state.items = items.slice().sort((a,b) => {
      if(isSequenceArchive(config)) return (a.fid || 0) - (b.fid || 0);
      const ca = U.labelFromArchive(a.archivio).localeCompare(U.labelFromArchive(b.archivio), 'it'); return ca || U.naturalCompare(a.name || a.fid, b.name || b.fid);
    });
    const label=config.label || U.labelFromArchive(archiveKey);
    document.title = `${label} · Galleria`;
    document.body.dataset.navTitle = `${label} · Galleria`;
    headerTitle.textContent = label;
    headerSub.textContent = config.archiveSummary || 'Consultazione dell’archivio in forma dinamica e divulgativa.';
    renderStats(state.items, config);
    renderReader();
    renderDossier(config);
    if(isSequenceArchive(config)){
      const splitButton = modeButtons.find(btn => btn.dataset.mode === 'split');
      const readerButton = modeButtons.find(btn => btn.dataset.mode === 'reader');
      const dossierButton = modeButtons.find(btn => btn.dataset.mode === 'dossier');
      if(splitButton) splitButton.hidden = true;
      if(readerButton){ readerButton.querySelector('span').textContent = 'Sfoglia le tavole'; readerButton.querySelector('i').className = 'bi bi-book-half'; }
      if(dossierButton){ dossierButton.querySelector('span').textContent = 'Percorso narrativo'; dossierButton.querySelector('i').className = 'bi bi-journal-richtext'; }
    }
    setMode('dossier');
  }).catch(err => { console.error(err); app.innerHTML = `<div class="archives-error">Impossibile caricare l’archivio richiesto.</div>`; });
})();
