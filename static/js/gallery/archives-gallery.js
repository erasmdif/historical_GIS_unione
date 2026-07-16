(function(){
  const root = document.getElementById('archives-gallery-root');
  const navRoot = document.getElementById('archives-project-nav-root');
  if(!root || !window.MapsDataUtils || !window.ArchivesConfig) return;
  const U = window.MapsDataUtils;
  const CFG = window.ArchivesConfig;

  function getItemsForKey(key, rows){
    const config = CFG.archives[key] || {};
    if(Array.isArray(config.memberArchives) && config.memberArchives.length){
      return rows.filter(row => config.memberArchives.includes(row.archivio));
    }
    return rows.filter(row => row.archivio === key);
  }

  function getFeaturedRecord(items, config){
    if(config?.featuredImageName){
      const hit = items.find(it => it.name === config.featuredImageName);
      if(hit) return hit;
    }
    if(config?.featuredArchive){
      const same = items.find(it => it.archivio === config.featuredArchive);
      if(same) return same;
    }
    return items[0] || null;
  }

  function defaultSummary(label, items){
    const geo = items.filter(U.hasGeo).length;
    const tagged = items.filter(U.hasTagged).length;
    return `${label} raccoglie ${items.length} immagini, di cui ${geo} già visualizzabili in sovrapposizione geografica e ${tagged} esplorabili tramite tag toponomastici.`;
  }

  function stat(label, value){
    return `<div class="archive-stat"><span class="archive-stat__value">${value}</span><span class="archive-stat__label">${label}</span></div>`;
  }

  U.loadMaps().then(rows => {
    const rawArchives = Array.from(new Set(rows.map(row => row.archivio)));
    const hiddenMemberArchives = new Set(
      Object.values(CFG.archives || {}).flatMap(cfg => Array.isArray(cfg?.memberArchives) ? cfg.memberArchives : [])
    );

    const order = CFG.order
      .filter(key => getItemsForKey(key, rows).length)
      .concat(rawArchives.filter(k => !CFG.order.includes(k) && !hiddenMemberArchives.has(k)));

    if(navRoot){
      navRoot.innerHTML = order.map(key => {
        const config = CFG.archives[key] || {};
        const label = config.label || U.labelFromArchive(key);
        return `<a class="archives-project-link" href="#archive-${encodeURIComponent(key)}">${label}</a>`;
      }).join('');
    }

    root.innerHTML = order.map((key, index) => {
      const items = getItemsForKey(key, rows);
      const config = CFG.archives[key] || {};
      const label = config.label || U.labelFromArchive(key);
      const featured = getFeaturedRecord(items, config);
      const preview = featured ? U.resolvePreviewPath(featured) : '';
      const summary = config.gallerySummary || defaultSummary(label, items);
      const geo = items.filter(U.hasGeo).length;
      const tagged = items.filter(U.hasTagged).length;
      const link = `static/html/gallery/archivio.html?archive=${encodeURIComponent(key)}`;
      return `
        <article id="archive-${encodeURIComponent(key)}" class="archive-card archive-card--row" style="--stagger:${index};">
          <a class="archive-card__media" href="${link}" aria-label="Apri ${label}">
            ${preview
              ? `<img src="${preview}" alt="Anteprima ${label}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/other_images/placeholders/map_generic_placeholder.svg'">`
              : `<div class="archive-placeholder">Anteprima in arrivo</div>`}
          </a>
          <div class="archive-card__body">
            <div class="archive-card__intro">
              <div class="archive-card__topline">
                <span class="archive-chip"><i class="bi bi-collection"></i> ${label}</span>
                <span class="archive-chip soft">${items.length} immagini</span>
              </div>
              <h2>${label}</h2>
              <p>${summary}</p>
            </div>
            <div class="archive-card__footer">
              <div class="archive-stats">
                ${stat('Georeferite', geo)}
                ${stat('Taggate', tagged)}
                ${stat(Array.isArray(config.memberArchives) ? 'Nuclei' : 'Serie', Array.isArray(config.memberArchives) ? config.memberArchives.length : items.length)}
              </div>
              <div class="archive-card__actions">
                <a class="btn primary" href="${link}" aria-label="Esplora ${label}">
                  <span>Esplora</span>
                  <i class="bi bi-arrow-up-right"></i>
                </a>
              </div>
            </div>
          </div>
        </article>`;
    }).join('');
  }).catch(err => {
    console.error(err);
    root.innerHTML = `<div class="archives-error">Impossibile caricare l’indice degli archivi.</div>`;
  });
})();
