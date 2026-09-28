(function(){
  const root = document.getElementById('site-nav-root');
  if(!root) return;
  const active = document.body.dataset.section || 'home';
  const title = document.body.dataset.navTitle || 'Atlante Storico Digitale';
  root.innerHTML = `
    <nav class="site-nav" aria-label="Navigazione principale">
      <div class="site-nav__inner">
        <a class="site-nav__brand" href="static/html/homepage/index.html">
          <span class="site-nav__brand-mark"><i class="bi bi-map"></i></span>
          <span class="site-nav__brand-copy">
            <span class="site-nav__eyebrow">Terre di Castelli</span>
            <span class="site-nav__title">${title}</span>
          </span>
        </a>
        <div class="site-nav__links">
          <a class="site-nav__link ${active === 'home' ? 'is-active' : ''}" href="static/html/homepage/index.html"><i class="bi bi-house-door"></i><span>Home</span></a>
          <a class="site-nav__link ${active === 'webgis' ? 'is-active' : ''}" href="static/html/webgis/webgis.html"><i class="bi bi-globe2"></i><span>WebGIS</span></a>
          <a class="site-nav__link ${active === 'tagged' || active === 'tag' ? 'is-active' : ''}" href="static/html/tag_viewer/dettaglio.html"><i class="bi bi-tags"></i><span>Tag</span></a>
          <a class="site-nav__link ${active === 'archives' ? 'is-active' : ''}" href="archivi.html"><i class="bi bi-archive"></i><span>Archivi</span></a>
          <a class="site-nav__link ${active === 'gallery' ? 'is-active' : ''}" href="static/html/gallery/archivi.html"><i class="bi bi-collection"></i><span>Galleria</span></a>
          <a class="site-nav__link ${active === 'wiki' ? 'is-active' : ''}" href="static/html/wiki/index.html"><i class="bi bi-journal-richtext"></i><span>Guida</span></a>
        </div>
      </div>
    </nav>`;
})();
