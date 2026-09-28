(function(){
  'use strict';

  const root = document.getElementById('archives-main');
  const U = window.MapsDataUtils;
  if(!root || !U) return;

  const ASSET = 'images/other_images/archives/portal/';
  const PLACEHOLDER = 'images/other_images/placeholders/map_generic_placeholder.svg';
  const ASMO_KEY = 'asmo';
  const MUNICIPALITIES = {
    castelnuovo:{name:'Castelnuovo Rangone', archiveLabel:'Archivio storico comunale di Castelnuovo Rangone', aliases:['castelnuovo','montale'], note:'Una sezione monografica dedicata al quaderno Galliani e al territorio di Montale Rangone.'},
    castelvetro:{name:'Castelvetro di Modena', archiveLabel:'Archivio storico comunale di Castelvetro di Modena', aliases:['castelvetro'], note:'Carte e documenti per leggere il borgo, il paesaggio agrario e la lunga organizzazione del territorio.'},
    guiglia:{name:'Guiglia', archiveLabel:'Archivio storico comunale di Guiglia', aliases:['guiglia'], note:'Un punto di accesso al patrimonio documentario della fascia collinare e appenninica occidentale.'},
    marano:{name:'Marano sul Panaro', archiveLabel:'Archivio storico comunale di Marano sul Panaro', aliases:['marano'], note:'Fonti comunali e cartografie dedicate alla valle del Panaro e alle sue trasformazioni.'},
    savignano:{name:'Savignano sul Panaro', archiveLabel:'Archivio storico comunale di Savignano sul Panaro', aliases:['savignano'], note:'Documenti e mappe per ricostruire il rapporto tra il borgo, la pianura e il corso del Panaro.'},
    spilamberto:{name:'Spilamberto', archiveLabel:'Archivio storico comunale di Spilamberto', aliases:['spilamberto'], note:'La memoria amministrativa e cartografica di un territorio posto tra il Panaro e la pianura modenese.'},
    vignola:{name:'Vignola', archiveLabel:'Archivio storico comunale di Vignola', aliases:['vignola'], note:'Un patrimonio riconosciuto di notevole interesse, con documentazione dal XIV secolo e una significativa raccolta di mappe e disegni.'},
    zocca:{name:'Zocca', archiveLabel:'Archivio storico comunale di Zocca', aliases:['zocca'], note:'La documentazione del comune appenninico, dei suoi nuclei abitati e del paesaggio rurale.'}
  };

  const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const currentView = new URL(window.location.href).searchParams.get('view') || 'landing';

  function activateNavigation(){
    document.querySelectorAll('[data-archive-link]').forEach(link => link.classList.toggle('is-active', link.dataset.archiveLink === currentView));
    const group = document.querySelector('[data-tree-group]');
    const toggle = group?.querySelector('.archive-tree__group-toggle');
    toggle?.addEventListener('click', () => {
      group.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', group.classList.contains('is-open') ? 'true' : 'false');
    });
    const sidebar = document.getElementById('archive-sidebar');
    const sidebarToggle = document.getElementById('archive-sidebar-toggle');
    const scrim = document.getElementById('archive-sidebar-scrim');
    const closeSidebar = () => { document.body.classList.remove('is-sidebar-open'); sidebarToggle?.setAttribute('aria-expanded','false'); if(scrim) scrim.hidden=true; };
    sidebarToggle?.addEventListener('click', () => { const open=!document.body.classList.contains('is-sidebar-open'); document.body.classList.toggle('is-sidebar-open',open); sidebarToggle.setAttribute('aria-expanded',String(open)); if(scrim) scrim.hidden=!open; });
    scrim?.addEventListener('click', closeSidebar);
    sidebar?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeSidebar));
  }

  function rule(){ return `<div class="archive-rule" aria-hidden="true"><img src="${ASSET}icons/divider_ornament.svg" alt=""></div>`; }

  function renderLanding(){
    document.title='Gli archivi · Atlante Storico Digitale';
    root.innerHTML=`<article class="archive-page">
      <header class="archive-landing-hero">
        <div class="archive-landing-hero__copy">
          <p class="archive-eyebrow"><i class="bi bi-archive"></i> Carte, istituzioni, territori</p>
          <h1>Gli archivi</h1>
          <p class="archive-lead">Un archivio non è soltanto un luogo di conservazione: è l’insieme ordinato dei documenti prodotti e ricevuti da un ente, una famiglia o una persona nel corso della propria attività. Questa sezione restituisce alle mappe dell’Atlante il loro contesto di provenienza.</p>
          ${rule()}
          <div class="archive-actions"><a class="archive-button archive-button--primary" href="archivi.html?view=unione"><i class="bi bi-map"></i> Esplora gli archivi comunali</a><a class="archive-button" href="archivi.html?view=asmo"><i class="bi bi-bank"></i> Vai all’Archivio di Stato</a></div>
        </div>
      </header>
      <section class="archive-principles" aria-label="Principi di organizzazione archivistica">
        ${[['icon_archive.svg','Fondo','I documenti prodotti da uno stesso soggetto conservano un’origine comune.'],['icon_document.svg','Serie','Atti simili per funzione e forma vengono ordinati in sequenze coerenti.'],['icon_time.svg','Contesto','Cronologia, istituzioni e relazioni spiegano perché una carta è stata prodotta.'],['icon_map.svg','Unità documentaria','La singola mappa si comprende pienamente dentro il fondo e la serie cui appartiene.']].map(x=>`<div class="archive-principle"><img src="${ASSET}icons/${x[0]}" alt=""><div><h3>${x[1]}</h3><p>${x[2]}</p></div></div>`).join('')}
      </section>
      <div class="archive-page__inner archive-landing-body">
        <div class="archive-prose">
          <p class="archive-eyebrow">Orientarsi tra le carte</p><h2>Dal produttore al documento</h2>
          <p>L’ordinamento archivistico rispetta i rapporti creati nel tempo: il soggetto produttore genera un fondo, il fondo si articola in serie e sottoserie, queste raccolgono fascicoli e singole unità documentarie. Conservare tale struttura significa non separare la mappa dalle pratiche amministrative, patrimoniali o tecniche che le hanno dato origine.</p>
          <p>Nell’Atlante, la provenienza è quindi una chiave di lettura. Le carte conservate dall’Archivio di Stato di Modena raccontano amministrazioni e giurisdizioni di scala più ampia; i nuclei degli archivi storici comunali documentano invece in modo ravvicinato la gestione delle comunità e del loro territorio.</p>
          <div class="archive-hierarchy"><h3>La gerarchia archivistica</h3><div class="archive-hierarchy__row"><strong>Fondo</strong><span>Complesso dei documenti prodotti da un soggetto.</span></div><div class="archive-hierarchy__row"><strong>Serie</strong><span>Raggruppamento determinato da attività e funzioni ricorrenti.</span></div><div class="archive-hierarchy__row"><strong>Fascicolo</strong><span>Insieme dei documenti relativi a uno stesso affare o procedimento.</span></div><div class="archive-hierarchy__row"><strong>Unità</strong><span>Il singolo documento, registro, disegno o carta.</span></div></div>
        </div>
        <aside class="archive-destinations">
          <a class="archive-destination" href="archivi.html?view=asmo" style="--dest-image:url('${ASSET}images/archive_books.png')"><span>Patrimonio statale</span><h3>Archivio di Stato di Modena</h3><p>Le carte del progetto provenienti dai fondi conservati a Modena.</p><i class="bi bi-arrow-right"></i></a>
          <a class="archive-destination" href="archivi.html?view=unione" style="--dest-image:url('${ASSET}images/archive_tools.png')"><span>Memorie delle comunità</span><h3>Archivio Terre Unione Castelli</h3><p>Otto archivi comunali, un unico territorio da attraversare.</p><i class="bi bi-arrow-right"></i></a>
        </aside>
      </div>
    </article>`;
  }

  function coordinates(geometry){
    const points=[];
    const visit=value=>{
      if(!Array.isArray(value)) return;
      if(value.length>=2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))){
        points.push([Number(value[0]),Number(value[1])]);
        return;
      }
      value.forEach(visit);
    };
    visit(geometry?.coordinates);
    return points;
  }
  function polygonPath(geometry, project){
    const polys=geometry?.type==='Polygon' ? [geometry.coordinates] : (geometry?.type==='MultiPolygon' ? geometry.coordinates : []);
    return polys.map(poly => poly.map(ring => ring.map((pt,i) => `${i?'L':'M'}${project(pt)[0].toFixed(2)},${project(pt)[1].toFixed(2)}`).join(' ')+' Z').join(' ')).join(' ');
  }
  function projectedOuterRings(geometry, project){
    const polygons=geometry?.type==='Polygon' ? [geometry.coordinates] : (geometry?.type==='MultiPolygon' ? geometry.coordinates : []);
    return polygons.map(poly => (poly?.[0] || []).map(project)).filter(ring => ring.length >= 3);
  }
  function signedRingArea(ring){
    return ring.reduce((sum,point,index)=>{ const next=ring[(index+1)%ring.length]; return sum + point[0]*next[1] - next[0]*point[1]; },0)/2;
  }
  function ringCentroid(ring){
    const area=signedRingArea(ring);
    if(Math.abs(area)<1e-8){
      const total=ring.reduce((acc,p)=>[acc[0]+p[0],acc[1]+p[1]],[0,0]);
      return [total[0]/ring.length,total[1]/ring.length];
    }
    let cx=0,cy=0;
    ring.forEach((point,index)=>{ const next=ring[(index+1)%ring.length], cross=point[0]*next[1]-next[0]*point[1]; cx+=(point[0]+next[0])*cross; cy+=(point[1]+next[1])*cross; });
    return [cx/(6*area),cy/(6*area)];
  }
  function pointInRing(point,ring){
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];
      if(((a[1]>point[1])!==(b[1]>point[1])) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1]||1e-9)+a[0]) inside=!inside;
    }
    return inside;
  }
  function segmentDistanceSq(point,a,b){
    const dx=b[0]-a[0],dy=b[1]-a[1];
    const length=dx*dx+dy*dy;
    const t=length ? Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)) : 0;
    const px=a[0]+t*dx,py=a[1]+t*dy;
    return (point[0]-px)**2+(point[1]-py)**2;
  }
  function visualCenter(feature,project){
    const rings=projectedOuterRings(feature.geometry,project);
    if(!rings.length) return [0,0];
    const ring=[...rings].sort((a,b)=>Math.abs(signedRingArea(b))-Math.abs(signedRingArea(a)))[0];
    const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const centroid=ringCentroid(ring);
    let best=pointInRing(centroid,ring) ? centroid : null;
    let bestDistance=-1;
    const candidates=[];
    if(best) candidates.push(best);
    for(let row=0;row<=18;row++) for(let column=0;column<=18;column++) candidates.push([minX+(maxX-minX)*(column+.5)/19,minY+(maxY-minY)*(row+.5)/19]);
    candidates.forEach(point=>{
      if(!pointInRing(point,ring)) return;
      let distance=Infinity;
      ring.forEach((edge,index)=>{ distance=Math.min(distance,segmentDistanceSq(point,edge,ring[(index+1)%ring.length])); });
      if(distance>bestDistance){ bestDistance=distance; best=point; }
    });
    return best || centroid;
  }
  function unionLabelLines(name){
    const clean=String(name||'').replace(' di Modena','');
    const forced={
      'Castelnuovo Rangone':['Castelnuovo','Rangone'],
      'Marano sul Panaro':['Marano','sul Panaro'],
      'Savignano sul Panaro':['Savignano','sul Panaro']
    };
    return forced[clean] || [clean];
  }
  function mapSlug(name){ const n=norm(name); return Object.keys(MUNICIPALITIES).find(key => MUNICIPALITIES[key].aliases.some(alias => n.includes(norm(alias)))) || ''; }
  function renderUnionMap(geojson){
    const all=geojson.features || [];
    const parent=all.find(f=>String(f.properties?.id)==='24');
    const children=all.filter(f=>String(f.properties?.parent_id)==='24');
    if(!parent) return '<div class="archive-empty"><p>Perimetro dell’Unione non disponibile.</p></div>';
    const parentPoints=coordinates(parent.geometry);
    const pts=parentPoints.length ? parentPoints : children.flatMap(feature=>coordinates(feature.geometry));
    if(!pts.length) return '<div class="archive-empty"><p>Geometrie comunali non disponibili.</p></div>';
    const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys), pad=24, width=620, height=440;
    const rangeX=Math.max(1e-9,maxX-minX),rangeY=Math.max(1e-9,maxY-minY);
    const scale=Math.min((width-pad*2)/rangeX,(height-pad*2)/rangeY);
    const offsetX=(width-(maxX-minX)*scale)/2;
    const offsetY=(height-(maxY-minY)*scale)/2;
    const project=([x,y])=>[offsetX+(x-minX)*scale, height-offsetY-(y-minY)*scale];
    const shapes=children.map(feature=>{ const slug=mapSlug(feature.properties?.nome); return slug ? `<a class="union-map-link" href="archivi.html?view=${slug}" aria-label="Apri l’archivio di ${esc(feature.properties.nome)}"><path class="union-shape" d="${polygonPath(feature.geometry,project)}"></path></a>` : ''; }).join('');
    const labels=children.map(feature=>{
      const slug=mapSlug(feature.properties?.nome); if(!slug) return '';
      const [x,y]=visualCenter(feature,project), lines=unionLabelLines(feature.properties?.nome);
      const compact=lines.some(line=>line.length>10) ? ' union-label--compact' : '';
      const firstY=y-((lines.length-1)*6.4);
      return `<text class="union-label${compact}" x="${x.toFixed(1)}" y="${firstY.toFixed(1)}">${lines.map((line,index)=>`<tspan x="${x.toFixed(1)}" dy="${index?12.8:0}">${esc(line)}</tspan>`).join('')}</text>`;
    }).join('');
    const outline=parentPoints.length ? `<path class="union-outline" d="${polygonPath(parent.geometry,project)}"></path>` : '';
    return `<svg class="union-map" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="union-map-title"><title id="union-map-title">Comuni dell’Unione Terre di Castelli</title>${shapes}${outline}${labels}</svg>`;
  }

  function renderUnion(geojson, rows=[]){
    const municipalMaps=rows.filter(row => Object.values(MUNICIPALITIES).some(config => config.aliases.some(alias => norm(row.archivio).includes(norm(alias))))).length;
    document.title='Archivio Terre di Castelli · Atlante Storico Digitale';
    root.innerHTML=`<article class="archive-page">
      <header class="union-hero">
        <div class="union-summary"><p class="archive-eyebrow"><i class="bi bi-map"></i> Le memorie delle comunità</p><h1>Archivio Terre<br><em>di Castelli</em></h1><p class="archive-lead">Una porta d’accesso agli archivi storici comunali: patrimoni distinti per provenienza, ma leggibili insieme attraverso il territorio che condividono.</p>${rule()}<div class="union-facts"><div class="union-fact"><strong>8</strong><span>comuni</span></div><div class="union-fact"><strong>${municipalMaps}</strong><span>mappe comunali censite</span></div><div class="union-fact"><strong>1</strong><span>quaderno monografico</span></div></div></div>
        <div class="union-map-card"><h2>Seleziona un comune</h2>${renderUnionMap(geojson)}</div>
      </header>
      <div class="archive-page__inner union-story">
        <section><p class="archive-eyebrow">Una storia condivisa</p><h2>Dall’unione amministrativa al patrimonio diffuso</h2><p>L’Unione Terre di Castelli nasce nel 2001 per volontà dei consigli comunali di Castelnuovo Rangone, Castelvetro di Modena, Savignano sul Panaro, Spilamberto e Vignola, con l’obiettivo di gestire congiuntamente funzioni e servizi. Nel 2006 l’assetto si amplia con Guiglia, Marano sul Panaro e Zocca, formando l’attuale sistema di otto comuni.</p><p>Il Polo Archivistico Storico dell’Unione è un archivio di concentrazione: riunisce fisicamente e valorizza gli archivi storici aderenti al Sistema Archivistico, senza cancellarne l’autonomia e la provenienza. Le carte restano così riconducibili alle istituzioni che le hanno prodotte, ma possono essere esplorate anche come testimonianza coordinata delle trasformazioni del territorio.</p><p>La mappa sovrastante è ricavata direttamente da <code>storico.geojson</code>: selezionando un comune si accede alla rispettiva pagina, dove le nuove mappe compariranno automaticamente quando saranno indicizzate in <code>maps.csv</code>.</p><div class="archive-actions"><a class="archive-button" href="https://www.unione.terredicastelli.mo.it/" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Fonte istituzionale</a></div></section>
        <aside class="union-callout"><img src="${ASSET}images/archive_open_book.png" alt=""><h3>Le consistenze</h3><p>Questa prima versione censisce <strong>${municipalMaps} mappe comunali</strong> nel catalogo digitale e tratta il quaderno Galliani come nucleo monografico autonomo. Il dato riguarda l’Atlante, non la consistenza complessiva degli archivi conservati dal Polo. Estremi cronologici, fondi e serie potranno essere aggiunti progressivamente nelle singole schede.</p></aside>
      </div>
    </article>`;
  }

  function archiveMatches(row, view){
    const archive=norm(row.archivio);
    if(view===ASMO_KEY) return archive.includes('archiviodistatodimodena') || archive.startsWith('asmo');
    const config=MUNICIPALITIES[view];
    return !!config && config.aliases.some(alias=>archive.includes(norm(alias)));
  }
  function statsFor(items){
    const years=items.map(x=>String(x.year||'').match(/(?:1[3-9]|20)\d{2}/)).filter(Boolean).map(x=>Number(x[0]));
    const period=years.length ? `${Math.min(...years)}–${Math.max(...years)}` : 'da integrare';
    return {count:items.length,geo:items.filter(U.hasGeo).length,tagged:items.filter(U.hasTagged).length,period};
  }
  function mapCard(item){
    const preview=U.resolvePreviewPath(item), full=U.resolveFullImagePath(item), label=item.name||item.sigla||`Mappa ${item.fid}`;
    const image=preview||full||PLACEHOLDER;
    return `<article class="map-card"><div class="map-card__image"><img src="${esc(image)}" alt="${esc(label)}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"><button type="button" data-lightbox-src="${esc(full||preview)}" data-lightbox-caption="${esc(label)}" aria-label="Ingrandisci ${esc(label)}"><i class="bi bi-arrows-angle-expand"></i></button></div><div class="map-card__body"><h3>${esc(label)}</h3><div class="map-card__meta"><span>${esc(item.year||'Data non indicata')}</span><span>${esc(item.sigla||'')}</span></div><div class="map-card__actions">${full?`<a href="${esc(full)}" target="_blank" rel="noopener"><i class="bi bi-image"></i> Originale</a>`:''}${U.hasGeo(item)?`<a href="${esc(U.webgisUrl(item))}"><i class="bi bi-globe2"></i> WebGIS</a>`:''}${U.hasTagged(item)?`<a href="${esc(U.detailUrl(item))}"><i class="bi bi-tags"></i> Dettaglio</a>`:''}</div></div></article>`;
  }
  function bindLightbox(){
    const lightbox=document.getElementById('archive-lightbox'), image=lightbox?.querySelector('img'), caption=lightbox?.querySelector('p');
    root.querySelectorAll('[data-lightbox-src]').forEach(button=>button.addEventListener('click',()=>{ const src=button.dataset.lightboxSrc; if(!src) return; image.src=src; caption.textContent=button.dataset.lightboxCaption||''; lightbox.hidden=false; }));
    const close=()=>{ if(!lightbox) return; lightbox.hidden=true; image.removeAttribute('src'); caption.textContent=''; };
    lightbox?.querySelector('[data-close-lightbox]')?.addEventListener('click',close); lightbox?.addEventListener('click',e=>{if(e.target===lightbox) close();}); document.addEventListener('keydown',e=>{if(e.key==='Escape') close();},{once:false});
  }
  function renderCollection(view, rows){
    const isAsmo=view===ASMO_KEY, config=MUNICIPALITIES[view], items=rows.filter(row=>archiveMatches(row,view));
    const stats=statsFor(items), label=isAsmo?'Archivio di Stato di Modena':config.archiveLabel, place=isAsmo?'Modena':config.name;
    document.title=`${label} · Atlante Storico Digitale`;
    const intro=isAsmo
      ? 'L’Archivio di Stato di Modena conserva un patrimonio di eccezionale rilievo, caratterizzato dalla continuità degli archivi estensi e austro-estensi. Accanto ai fondi di Casa d’Este e degli antichi Stati preunitari, custodisce documentazione degli uffici periferici dello Stato unitario e numerosi archivi aggregati. Le carte selezionate per l’Atlante vengono qui ricondotte alla loro provenienza e rese consultabili come corpus cartografico.'
      : `${config.note} Questa pagina funziona come punto di raccolta dinamico: seleziona da maps.csv tutte le carte la cui provenienza archivistica contiene il nome del comune, mantenendo disponibili anteprima, originale, WebGIS e annotazioni quando presenti.`;
    const special=view==='castelnuovo';
    root.innerHTML=`<article class="archive-page">
      <header class="collection-hero" style="--hero-image:url('${ASSET}images/archivi_header_vignette.png')"><div class="collection-hero__content"><p class="archive-eyebrow"><i class="bi ${isAsmo?'bi-bank':'bi-building'}"></i> ${isAsmo?'Patrimonio statale':'Archivio storico comunale'}</p><h1>${isAsmo?'Archivio di Stato<br><em>di Modena</em>':`Archivio di<br><em>${esc(place)}</em>`}</h1><p class="archive-lead">${esc(intro)}</p><div class="collection-stats"><span class="collection-stat"><i class="bi bi-images"></i> ${stats.count} mappe indicizzate</span><span class="collection-stat"><i class="bi bi-globe2"></i> ${stats.geo} georeferenziate</span><span class="collection-stat"><i class="bi bi-tags"></i> ${stats.tagged} annotate</span><span class="collection-stat"><i class="bi bi-calendar3"></i> ${stats.period}</span></div></div></header>
      <div class="archive-page__inner">
        ${special?renderGalliani():`<section class="collection-intro"><div><p class="archive-eyebrow">Contesto e consultazione</p><h2>${isAsmo?'Le carte modenesi nel progetto':'La memoria documentaria della comunità'}</h2><p>${isAsmo?'La particolare fisionomia dell’istituto deriva anche dal trasferimento a Modena del patrimonio archivistico estense dopo la devoluzione di Ferrara del 1598. La selezione digitale non sostituisce l’ordinamento dei fondi: costituisce un accesso tematico alle mappe utilizzate dal progetto, preservandone sigla, descrizione, cronologia e collegamenti agli strumenti di esplorazione.':esc(config.note)+' I contenuti descrittivi potranno essere approfonditi insieme agli inventari dell’archivio; la griglia sottostante è già pronta ad accogliere automaticamente le carte future.'}</p></div><aside class="collection-note"><strong>${isAsmo?'Nota sul patrimonio':'Scheda in aggiornamento'}</strong><p>${isAsmo?'L’istituto conserva fondi degli Stati estensi preunitari, di Casa d’Este, degli organi statali periferici e archivi aggregati. In questa pagina sono mostrate soltanto le unità cartografiche censite nel dataset del progetto.':'Le consistenze indicate riguardano le mappe presenti nell’Atlante, non l’intero patrimonio conservato dall’archivio comunale.'}</p></aside></section>`}
        ${special?'':`<section><div class="map-gallery-head"><h2>Mappe dell’archivio</h2><span>${items.length?`${items.length} risultati dal catalogo`:'Il catalogo è pronto per i nuovi inserimenti'}</span></div><div class="map-gallery">${items.length?items.map(mapCard).join(''):`<div class="archive-empty"><img src="${ASSET}icons/icon_archive.svg" alt=""><h3>Nessuna mappa ancora indicizzata</h3><p>La sezione è attiva. Le carte compariranno automaticamente quando il campo <strong>archivio</strong> di <code>maps.csv</code> conterrà “${esc(place)}”.</p></div>`}</div></section>`}
      </div>
    </article>`;
    bindLightbox();
  }
  function renderGalliani(){
    return `<section class="galliani-feature"><div class="galliani-feature__visual"><img src="images/other_images/archives/castelnuovo_galliani/castelnuovo_page_0036_general_plan.png" alt="Tavola generale del quaderno Galliani"></div><div><p class="archive-eyebrow">Un archivio nel volume</p><h2>Il quaderno Galliani</h2><p>Castelnuovo costituisce un caso specifico all’interno del percorso: il nucleo principale non è presentato come una comune serie di mappe sciolte, ma come un quaderno coerente di piante, misure e descrizioni dei beni Galliani nel territorio di Montale Rangone. La struttura seriale alterna vedute generali e tavole particolari, restituendo un vero atlante patrimoniale privato.</p><p>Per conservarne l’unità materiale e narrativa, il volume mantiene uno sfogliatore dedicato e un percorso di lettura che approfondisce paesaggio, proprietà, misure agrarie e continuità toponomastiche.</p><div class="galliani-details"><div><strong>Tipologia</strong><span>Quaderno / atlante patrimoniale</span></div><div><strong>Ambito</strong><span>Montale Rangone</span></div><div><strong>Lettura</strong><span>Sequenza e percorso narrativo</span></div></div><div class="archive-actions"><a class="archive-button archive-button--primary" href="static/html/gallery/archivio.html?archive=CASTELNUOVO_GALLIANI"><i class="bi bi-book-half"></i> Apri il quaderno Galliani</a></div></div></section>`;
  }

  activateNavigation();
  if(currentView==='landing') renderLanding();
  else if(currentView==='unione') Promise.all([fetch('data/storico.geojson',{cache:'no-cache'}).then(r=>{if(!r.ok) throw new Error(r.status);return r.json();}),U.loadMaps()]).then(([geojson,rows])=>renderUnion(geojson,rows)).catch(()=>renderUnion({features:[]},[]));
  else if(currentView===ASMO_KEY || MUNICIPALITIES[currentView]) U.loadMaps().then(rows=>renderCollection(currentView,rows)).catch(()=>renderCollection(currentView,[]));
  else renderLanding();
})();
