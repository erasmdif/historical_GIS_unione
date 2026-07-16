(function(){
  'use strict';

  const main = document.getElementById('gallery-main');
  const viewButtons = Array.from(document.querySelectorAll('[data-gallery-view]'));
  const U = window.MapsDataUtils;
  if(!main || !U) return;

  const PATHS = {
    family: 'images/other_images/placeholders/family_crest_placeholder.svg',
    male: 'images/other_images/placeholders/person_male_placeholder.svg',
    female: 'images/other_images/placeholders/person_female_placeholder.svg',
    neutral: 'images/other_images/placeholders/person_neutral_placeholder.svg',
    map: 'images/other_images/placeholders/map_generic_placeholder.svg',
    citySkyline: 'images/other_images/gallery/city_history_skyline.png'
  };

  const VIEW_META = {
    families: { title:'Le famiglie', icon:'bi-people' },
    asmo: { title:'La collezione dell’Archivio di Modena (ASMo)', icon:'bi-building' },
    vignola: { title:'La collezione dell’Archivio di Vignola', icon:'bi-files' },
    castelnuovo: { title:'Castelnuovo Galliani', icon:'bi-bank' },
    cities: { title:'La città nella storia', icon:'bi-buildings' }
  };


  const COLLECTION_META = {
    asmo: {
      title:'La collezione dell’Archivio di Stato di Modena (ASMo)',
      shortTitle:'Collezione ASMo',
      subtitle:'Carte, fondi e territori estensi',
      icon:'bi-building',
      intro:'L’Archivio di Stato di Modena conserva il patrimonio documentario degli antichi Stati estensi e di Casa d’Este, insieme ai fondi degli uffici amministrativi preunitari e postunitari. Questa galleria riunisce le carte del progetto provenienti dalle sue raccolte, offrendo un accesso trasversale a territori, confini, insediamenti e trasformazioni del paesaggio storico.',
      matches(map){
        const archive = normalizeWord(map?.archivio || '');
        return archive.includes('archiviodistatodimodena') || archive === 'asmo' || archive.startsWith('asmo');
      }
    },
    vignola: {
      title:'La collezione dell’Archivio storico comunale di Vignola',
      shortTitle:'Archivio di Vignola',
      subtitle:'Mappe e memorie della comunità',
      icon:'bi-files',
      intro:'L’Archivio storico comunale di Vignola, valorizzato attraverso i percorsi e gli inventari digitali della Biblioteca Auris, conserva fondi e raccolte che documentano la vita amministrativa, culturale e territoriale della comunità. La galleria raccoglie le carte del progetto provenienti da questo patrimonio, permettendo di esplorare proprietà, confini e trasformazioni del paesaggio vignolese.',
      matches(map){
        return normalizeWord(map?.archivio || '').includes('archiviodivignola');
      }
    }
  };

  const FEMALE_NAMES = new Set([
    'adelaide','agata','agnese','alessandra','alice','amalia','anna','annamaria','antonia','beatrice','benedetta',
    'bianca','camilla','carolina','caterina','cecilia','clara','claudia','cristina','domenica','elisabetta','elena',
    'emilia','ernesta','eugenia','francesca','gabriella','geltrude','giovanna','giulia','isabella','laura','lucia',
    'lucrezia','maddalena','margherita','maria','marianna','matilde','natalia','paola','regina','rosa','rosalia',
    'teresa','vittoria','virginia'
  ]);

  let state = null;
  let selectedFamilyId = null;
  let currentView = 'families';
  let possessionGroupIndex = 0;
  let possessionSearch = '';
  let possessionView = 'cards';
  let familyInspectorRecordId = null;
  let modalReturnFocus = null;
  let familyMap = null;
  let familyMapLayer = null;
  let familyMapModel = null;
  let familyMapRange = null;
  let familyMapOverrides = new Map();
  let leafletPromise = null;
  let cityMap = null;
  let cityMapLayer = null;
  let selectedCityId = null;
  let cityTimeline = null;
  let cityMapOverrides = new Map();
  let cityInspectorRecordId = null;
  let cityActiveMapId = null;
  let cityPlaceSearch = '';
  let cityInspectorOpen = false;
  let citySidebarMode = 'maps';
  let cityRecordLayers = new Map();
  let cityMapPage = 0;
  let cityPlacePage = 0;
  let cityBaseMode = 'osm';
  let cityBaseLayers = {};
  const CITY_NAV_PAGE_SIZE = 5;
  let collectionState = null;
  let selectedCollectionMapId = null;
  const castelnuovoState = { mode:'narrative', chapter:0, page:0, items:[], loaded:false, loading:false, error:'' };

  function esc(value){
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function id(value){ return String(value ?? '').trim(); }
  function unique(values){ return Array.from(new Set(values.filter(Boolean))); }
  function hasParent(value){
    const parent = id(value);
    return !!parent && parent !== '0' && normalizeWord(parent) !== 'null';
  }
  function firstImage(value){
    const raw = String(value || '').trim();
    if(!raw) return '';
    const candidate = raw.split(/[;|]/).map(v => v.trim()).find(Boolean) || '';
    if(!candidate) return '';
    if(/^(?:https?:|data:|blob:)/i.test(candidate)) return candidate;
    const clean = candidate.replace(/\\/g,'/').replace(/^\.\//,'').replace(/^\//,'');
    if(/^(?:other_images|maps|icons)\//i.test(clean)) return `images/${clean}`;
    return clean;
  }
  function imageWithFallback(src, fallback, alt, className=''){
    const safeSrc = esc(src || fallback);
    const safeFallback = esc(fallback);
    return `<img${className ? ` class="${className}"` : ''} src="${safeSrc}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${safeFallback}'">`;
  }
  function truncate(value, max=310){
    const text = String(value || '').replace(/\s+/g,' ').trim();
    if(text.length <= max) return text;
    return text.slice(0, max).replace(/\s+\S*$/,'') + '…';
  }
  function normalizeWord(v){
    return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  }
  function personFallback(person){
    const explicit = normalizeWord(person.gender || person.sesso || person.sex || '');
    if(['f','female','femmina','donna'].includes(explicit)) return PATHS.female;
    if(['m','male','maschio','uomo'].includes(explicit)) return PATHS.male;
    const first = normalizeWord(String(person.name || '').split(/[\s,]+/)[0]);
    return FEMALE_NAMES.has(first) ? PATHS.female : PATHS.male;
  }
  function mapLink(map){
    if(U.hasTagged(map)) return U.detailUrl(map);
    if(U.hasGeo(map)) return U.webgisUrl(map);
    return U.resolveFullImagePath(map) || '#';
  }
  function mapLabel(map){ return map.name && map.name !== map.sigla ? map.name : (map.sigla || `Mappa ${map.id}`); }
  function mapYear(map){
    const raw = String(map?.year || map?.anno || '').trim();
    const match = raw.match(/(?:1[4-9]|20)\d{2}/);
    return match ? Number(match[0]) : null;
  }
  function isVendelliMap(map){
    return normalizeWord(`${map?.sigla || ''} ${map?.name || ''} ${map?.archivio || ''}`).includes('vendelli');
  }
  function ensureLeaflet(){
    if(window.L) return Promise.resolve(window.L);
    if(leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve,reject) => {
      if(!document.querySelector('link[data-gallery-leaflet]')){
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.dataset.galleryLeaflet = 'true';
        document.head.appendChild(link);
      }
      const existing = document.querySelector('script[data-gallery-leaflet]');
      if(existing){
        existing.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('Leaflet non disponibile.')), {once:true});
        existing.addEventListener('error', () => reject(new Error('Impossibile caricare Leaflet.')), {once:true});
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.dataset.galleryLeaflet = 'true';
      script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet non disponibile.'));
      script.onerror = () => reject(new Error('Impossibile caricare Leaflet.'));
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  async function fetchCsv(path){
    const response = await fetch(path, {cache:'no-cache'});
    if(!response.ok) throw new Error(`Impossibile caricare ${path}: ${response.status}`);
    return U.parseCSV(await response.text()).data;
  }

  function indexData(people, peoplePlaces, placesGeo, mapsPlaces, maps){
    const peopleById = new Map(people.map(row => [id(row.id), row]));
    const places = (placesGeo.features || []).map(feature => ({
      id:id(feature.id ?? feature.properties?.fid),
      feature,
      ...feature.properties,
      name:feature.properties?.name || feature.properties?.toponimo || `Luogo ${feature.id ?? ''}`
    }));
    const placesById = new Map(places.map(place => [id(place.id), place]));
    const mapsById = new Map(maps.map(map => [id(map.id || map.fid), map]));
    const mapsBySigla = new Map(maps.filter(map => map.sigla).map(map => [normalizeWord(map.sigla), map]));

    const personPlaces = new Map();
    peoplePlaces.forEach(rel => {
      const personId = id(rel.id_people);
      const placeId = id(rel.id_place);
      if(!personId || !placeId) return;
      if(!personPlaces.has(personId)) personPlaces.set(personId, new Set());
      personPlaces.get(personId).add(placeId);
    });

    const placeMaps = new Map();
    mapsPlaces.forEach(rel => {
      const placeId = id(rel.id_place);
      const mapId = id(rel.id_map);
      if(!placeId || !mapId) return;
      if(!placeMaps.has(placeId)) placeMaps.set(placeId, new Set());
      placeMaps.get(placeId).add(mapId);
    });

    // Mantiene compatibilità anche con dataset nei quali il collegamento è
    // ancora espresso nel campo `mappa` di places.geojson.
    places.forEach(place => {
      const values = String(place.mappa || '').split(/[;,|]/).map(value => value.trim()).filter(Boolean);
      values.forEach(value => {
        const map = mapsBySigla.get(normalizeWord(value));
        const mapId = id(map?.id || map?.fid);
        if(!mapId) return;
        if(!placeMaps.has(id(place.id))) placeMaps.set(id(place.id), new Set());
        placeMaps.get(id(place.id)).add(mapId);
      });
    });

    function rootForPlace(place){
      if(!place) return null;
      let current = place;
      const visited = new Set([id(current.id)]);
      while(hasParent(current.parent_id)){
        const parent = placesById.get(id(current.parent_id));
        if(!parent || visited.has(id(parent.id))) break;
        current = parent;
        visited.add(id(current.id));
      }
      return current;
    }

    // Il possedimento storico è il nodo più alto immediatamente sotto la città/località.
    // In questo modo le sue attestazioni cartografiche figlie vengono conteggiate una sola volta.
    function lineageForPlace(place){
      if(!place) return null;
      let current = place;
      const visited = new Set([id(current.id)]);
      while(hasParent(current.parent_id)){
        const parent = placesById.get(id(current.parent_id));
        if(!parent || visited.has(id(parent.id))) break;
        if(!hasParent(parent.parent_id)) break;
        current = parent;
        visited.add(id(current.id));
      }
      return current;
    }

    function relationModel(subjectIds){
      const placeIds = unique(subjectIds.flatMap(subjectId => Array.from(personPlaces.get(subjectId) || [])));
      const possessions = placeIds.map(placeId => placesById.get(placeId)).filter(Boolean);
      const mapIds = unique(placeIds.flatMap(placeId => Array.from(placeMaps.get(placeId) || [])));
      const relatedMaps = mapIds.map(mapId => mapsById.get(mapId)).filter(Boolean);
      const mapsForPlace = new Map(placeIds.map(placeId => [
        placeId,
        Array.from(placeMaps.get(placeId) || []).map(mapId => mapsById.get(mapId)).filter(Boolean)
      ]));
      const locations = unique(possessions.map(place => id(rootForPlace(place)?.id)))
        .map(rootId => placesById.get(rootId))
        .filter(Boolean)
        .sort((a,b) => String(a.name).localeCompare(String(b.name),'it'));
      const lineages = new Map();
      possessions.forEach(place => {
        const lineage = lineageForPlace(place) || place;
        const key = id(lineage.id);
        if(!lineages.has(key)) lineages.set(key, {id:key, root:lineage, appearances:[]});
        lineages.get(key).appearances.push(place);
      });
      return {placeIds, possessions, possessionCount:lineages.size, lineages, maps:relatedMaps, mapsForPlace, locations};
    }

    const membersByFamily = new Map();
    people.forEach(person => {
      const parent = id(person.parent_id);
      if(!parent || normalizeWord(person.tipo_soggetto) !== 'persona') return;
      if(!membersByFamily.has(parent)) membersByFamily.set(parent, []);
      membersByFamily.get(parent).push(person);
    });
    membersByFamily.forEach(list => list.sort((a,b) => String(a.name).localeCompare(String(b.name),'it')));

    const families = people
      .filter(person => normalizeWord(person.tipo_soggetto) === 'famiglia')
      .sort((a,b) => String(a.name).localeCompare(String(b.name),'it'));

    const personModels = new Map();
    people.filter(person => normalizeWord(person.tipo_soggetto) === 'persona').forEach(person => {
      personModels.set(id(person.id), {person, ...relationModel([id(person.id)])});
    });

    const models = new Map(families.map(family => {
      const familyId = id(family.id);
      const members = membersByFamily.get(familyId) || [];
      return [familyId, {
        family,
        members,
        ...relationModel([familyId, ...members.map(member => id(member.id))])
      }];
    }));

    // Modelli urbani dinamici. Una città/località è resa disponibile quando
    // essa, oppure almeno uno dei suoi discendenti, è collegata a una mappa
    // diversa dalla raccolta VENDELLI.
    const cityBuckets = new Map();
    places.forEach(place => {
      const validMapIds = Array.from(placeMaps.get(id(place.id)) || []).filter(mapId => {
        const map = mapsById.get(id(mapId));
        return map && !isVendelliMap(map);
      });
      if(!validMapIds.length) return;
      const city = rootForPlace(place);
      if(!city) return;
      const cityId = id(city.id);
      if(!cityBuckets.has(cityId)) cityBuckets.set(cityId, {city, placeIds:new Set(), mapIds:new Set()});
      const bucket = cityBuckets.get(cityId);
      bucket.placeIds.add(id(place.id));
      validMapIds.forEach(mapId => bucket.mapIds.add(id(mapId)));
    });

    const cityModels = new Map();
    cityBuckets.forEach((bucket,cityId) => {
      const appearances = Array.from(bucket.placeIds).map(placeId => placesById.get(placeId)).filter(Boolean);
      const mapsForPlace = new Map(appearances.map(place => [
        id(place.id),
        Array.from(placeMaps.get(id(place.id)) || [])
          .map(mapId => mapsById.get(id(mapId)))
          .filter(map => map && !isVendelliMap(map))
      ]));
      const lineages = new Map();
      appearances.filter(place => id(place.id) !== cityId).forEach(place => {
        const lineage = lineageForPlace(place) || place;
        const lineageId = id(lineage.id);
        if(!lineages.has(lineageId)) lineages.set(lineageId,{id:lineageId,root:lineage,appearances:[]});
        lineages.get(lineageId).appearances.push(place);
      });
      const relatedMaps = Array.from(bucket.mapIds).map(mapId => mapsById.get(mapId)).filter(Boolean)
        .sort((a,b) => {
          const ay = mapYear(a), by = mapYear(b);
          if(ay == null && by == null) return U.naturalCompare(a.sigla || a.name,b.sigla || b.name);
          if(ay == null) return 1;
          if(by == null) return -1;
          return ay - by || U.naturalCompare(a.sigla || a.name,b.sigla || b.name);
        });
      const mapPlaceCounts = new Map(relatedMaps.map(map => {
        const mapId = id(map.id || map.fid);
        return [mapId, appearances.filter(place => (mapsForPlace.get(id(place.id)) || []).some(item => id(item.id || item.fid) === mapId)).length];
      }));
      cityModels.set(cityId,{
        city:bucket.city,
        appearances,
        mapsForPlace,
        maps:relatedMaps,
        mapPlaceCounts,
        lineages,
        appearanceCount:appearances.filter(place => id(place.id) !== cityId).length,
        placeCount:lineages.size,
        years:unique(relatedMaps.map(mapYear).filter(Number.isFinite)).sort((a,b) => a-b)
      });
    });
    const cities = Array.from(cityModels.values()).map(model => model.city)
      .sort((a,b) => String(a.name).localeCompare(String(b.name),'it'));

    return {peopleById, placesById, mapsById, placeMaps, places, families, models, personModels, cityModels, cities, rootForPlace, lineageForPlace};
  }

  function scoreModel(model){
    return model.possessionCount * 4 + model.maps.length * 3 + model.members.length * 5 + (model.family.descrizione ? 1 : 0);
  }

  function pageHead(){
    return `<header class="gallery-pagehead">
      <div>
        <h1>Galleria</h1>
        <div class="gallery-pagehead__rule" aria-hidden="true"></div>
      </div>
    </header>`;
  }

  function renderFamiliesShell(){
    if(familyMap){ familyMap.remove(); familyMap = null; familyMapLayer = null; familyMapModel = null; }
    main.innerHTML = `${pageHead()}
      <section class="family-dashboard" aria-label="Galleria delle famiglie">
        <div class="family-intro-grid">
          <article class="gallery-card family-picker">
            <div class="family-picker__copy">
              <h2>Le famiglie</h2>
              <p>Esplora famiglie, persone e soggetti proprietari che hanno lasciato una traccia nelle carte storiche delle Terre di Castelli.</p>
            </div>
            <div class="family-picker__search">
              <label for="family-search">Cerca una famiglia</label>
              <div class="family-picker__searchbox">
                <i class="bi bi-search" aria-hidden="true"></i>
                <input id="family-search" type="search" autocomplete="off" placeholder="Bellucci, Rangoni…" />
              </div>
              <div id="family-options" class="family-picker__list" role="listbox" aria-label="Famiglie disponibili"></div>
              <div id="family-count" class="family-picker__count"></div>
            </div>
          </article>
          <article id="family-profile" class="gallery-card family-profile"></article>
        </div>

        <section class="family-section family-possessions-section">
          <div class="family-section__head family-section__head--possessions">
            <div>
              <h3>Possedimenti principali</h3>
              <div id="possession-map-meta" class="possession-map-meta"></div>
            </div>
            <div class="possession-head-actions">
              <div class="possession-view-switch" role="group" aria-label="Cambia visualizzazione dei possedimenti">
                <button id="possession-view-cards" class="is-active" type="button" data-possession-view="cards" title="Vista per schede" aria-label="Vista per schede" aria-pressed="true"><i class="bi bi-grid-3x2-gap"></i></button>
                <button id="possession-view-map" type="button" data-possession-view="map" title="Vista su mappa storica" aria-label="Vista su mappa storica" aria-pressed="false"><i class="bi bi-map"></i></button>
              </div>
              <div id="possession-card-controls" class="possession-toolbar">
                <label class="possession-search" for="possession-search">
                  <i class="bi bi-search" aria-hidden="true"></i>
                  <input id="possession-search" type="search" autocomplete="off" placeholder="Cerca un possedimento…" />
                </label>
                <div class="possession-pager" aria-label="Naviga tra le mappe">
                  <button id="possession-prev" type="button" aria-label="Mappa precedente"><i class="bi bi-chevron-left"></i></button>
                  <span id="possession-page" aria-live="polite"></span>
                  <button id="possession-next" type="button" aria-label="Mappa successiva"><i class="bi bi-chevron-right"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div id="possessions-stage" class="possessions-stage"></div>

          <section id="family-map-stage" class="family-map-stage" aria-label="Mappa storica dei possedimenti" hidden>
            <div class="family-map-stage__body">
              <div class="family-map-stage__map-wrap">
                <div id="family-history-map" class="family-history-map" aria-label="Mappa dei possedimenti familiari"></div>
                <div id="family-map-loader" class="family-map-loader" role="status"><span class="gallery-loading__spinner"></span><span>Sto preparando la mappa storica…</span></div>
                <div class="family-map-legend">
                  <span><i class="family-map-legend__swatch is-current"></i> attestato nel periodo</span>
                  <span><i class="family-map-legend__swatch is-uncertain"></i> non attestato nel periodo</span>
                  <span><i class="family-map-legend__swatch is-history"></i> possedimento con più fasi</span>
                </div>
              </div>
              <aside class="family-history-inspector" aria-live="polite">
                <header class="family-history-inspector__head">
                  <span>Scheda del luogo</span>
                  <i class="bi bi-pin-map" aria-hidden="true"></i>
                </header>
                <div id="family-history-inspector-content" class="family-history-inspector__content">
                  <div class="family-history-inspector__empty"><i class="bi bi-cursor"></i><p>Seleziona o sfiora un possedimento sulla mappa per consultarne dati e gerarchia territoriale.</p></div>
                </div>
              </aside>
            </div>
            <footer class="family-map-stage__timeline">
              <div class="family-timeline-bar__head">
                <div>
                  <span>Intervallo visualizzato</span>
                  <strong id="family-timeline-label">—</strong>
                </div>
                <button id="family-timeline-reset" type="button" title="Mostra tutto l’intervallo"><i class="bi bi-arrow-counterclockwise"></i><span>Tutto l’intervallo</span></button>
              </div>
              <div id="family-timeline" class="family-timeline"></div>
              <div id="family-history-summary" class="family-history-summary"></div>
              <p class="family-map-help"><i class="bi bi-info-circle"></i> I bordi tratteggiati indicano una fase storica o una presenza non attestata nell’intervallo. Le geometrie con più fasi consentono di scegliere una vista precedente tramite <strong>Historical view</strong>.</p>
            </footer>
          </section>
        </section>

        <div class="family-lower-grid">
          <section class="gallery-card family-section">
            <div class="family-section__head">
              <h3>Personaggi</h3>
              <span id="family-member-count" class="family-section__action" aria-hidden="true"></span>
            </div>
            <div id="family-members" class="members-grid"></div>
          </section>

          <section class="gallery-card family-section">
            <div class="family-section__head">
              <h3>Tracce documentarie</h3>
              <i class="bi bi-signpost-split" aria-hidden="true"></i>
            </div>
            <div id="family-traces" class="family-trace-list"></div>
          </section>
        </div>

        <div class="gallery-update-note"><i class="bi bi-info-circle"></i> I contenuti si aggiornano automaticamente quando vengono aggiunti nuovi soggetti, luoghi o collegamenti al dataset.</div>
      </section>

      <div id="person-modal" class="person-modal" hidden>
        <button class="person-modal__backdrop" type="button" data-person-modal-close aria-label="Chiudi la scheda"></button>
        <section class="person-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="person-modal-title">
          <button class="person-modal__close" type="button" data-person-modal-close aria-label="Chiudi"><i class="bi bi-x-lg"></i></button>
          <div id="person-modal-content"></div>
        </section>
      </div>`;

    bindFamiliesControls();
    renderFamilyOptions('');
    renderSelectedFamily();
    setPossessionView(possessionView, false);
  }

  function renderFamilyOptions(query){
    const root = document.getElementById('family-options');
    const count = document.getElementById('family-count');
    if(!root || !state) return;
    const needle = normalizeWord(query);
    const filtered = state.families.filter(family => !needle || normalizeWord(`${family.name} ${family.varianti || ''}`).includes(needle));
    root.innerHTML = filtered.length ? filtered.map(family => {
      const active = id(family.id) === selectedFamilyId;
      return `<button class="family-picker__option${active ? ' is-active' : ''}" type="button" role="option" aria-selected="${active}" data-family-id="${esc(id(family.id))}">${esc(family.name)}</button>`;
    }).join('') : `<div class="family-empty">Nessuna famiglia corrisponde alla ricerca.</div>`;
    count.textContent = `${filtered.length} ${filtered.length === 1 ? 'famiglia' : 'famiglie'} nel dataset`;
    root.querySelectorAll('[data-family-id]').forEach(button => button.addEventListener('click', () => selectFamily(button.dataset.familyId)));
    const active = root.querySelector('.family-picker__option.is-active');
    if(active && !needle) requestAnimationFrame(() => active.scrollIntoView({block:'nearest'}));
  }

  function bindFamiliesControls(){
    document.getElementById('family-search')?.addEventListener('input', event => renderFamilyOptions(event.target.value));
    document.getElementById('possession-search')?.addEventListener('input', event => {
      possessionSearch = event.target.value || '';
      possessionGroupIndex = 0;
      renderPossessions(state.models.get(selectedFamilyId));
    });
    document.getElementById('possession-prev')?.addEventListener('click', () => changePossessionGroup(-1));
    document.getElementById('possession-next')?.addEventListener('click', () => changePossessionGroup(1));
    document.querySelectorAll('[data-possession-view]').forEach(button => button.addEventListener('click', () => setPossessionView(button.dataset.possessionView)));
    document.getElementById('family-timeline-reset')?.addEventListener('click', resetFamilyTimeline);
    document.querySelectorAll('[data-person-modal-close]').forEach(button => button.addEventListener('click', closePersonModal));
    document.removeEventListener('keydown', handleModalKeydown);
    document.addEventListener('keydown', handleModalKeydown);
  }

  function setPossessionView(view, initialise=true){
    possessionView = view === 'map' ? 'map' : 'cards';
    const cardStage = document.getElementById('possessions-stage');
    const mapStage = document.getElementById('family-map-stage');
    const cardControls = document.getElementById('possession-card-controls');
    document.querySelectorAll('[data-possession-view]').forEach(button => {
      const active = button.dataset.possessionView === possessionView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if(cardStage) cardStage.hidden = possessionView !== 'cards';
    if(mapStage) mapStage.hidden = possessionView !== 'map';
    if(cardControls) cardControls.hidden = possessionView !== 'cards';
    const model = state?.models?.get(selectedFamilyId);
    const meta = document.getElementById('possession-map-meta');
    if(possessionView === 'map'){
      if(meta && model) meta.innerHTML = `<strong>${esc(model.family.name)} · evoluzione storica</strong><span>${model.possessionCount} possedimenti storici · ${model.maps.length} mappe collegate</span>`;
      if(initialise) initFamilyMap();
      else requestAnimationFrame(() => familyMap?.invalidateSize());
    }else if(model){
      renderPossessions(model);
    }
  }

  function handleModalKeydown(event){
    if(event.key === 'Escape' && !document.getElementById('person-modal')?.hidden) closePersonModal();
  }

  function selectFamily(familyId){
    if(!state.models.has(id(familyId))) return;
    selectedFamilyId = id(familyId);
    possessionGroupIndex = 0;
    possessionSearch = '';
    const possessionInput = document.getElementById('possession-search');
    if(possessionInput) possessionInput.value = '';
    const url = new URL(window.location.href);
    url.searchParams.set('family', selectedFamilyId);
    history.replaceState(null, '', url);
    familyInspectorRecordId = null;
    familyMapOverrides.clear();
    renderFamilyOptions(document.getElementById('family-search')?.value || '');
    renderSelectedFamily();
    if(possessionView === 'map'){
      setPossessionView('map', false);
      initFamilyMap(true);
    }
  }

  function renderSelectedFamily(){
    const model = state.models.get(selectedFamilyId);
    if(!model) return;
    const {family, members, possessionCount, maps, locations} = model;
    const familyImage = firstImage(family.images) || PATHS.family;
    const description = String(family.descrizione || '').trim();

    const profile = document.getElementById('family-profile');
    profile.innerHTML = `
      <div class="family-profile__crest">${imageWithFallback(familyImage, PATHS.family, `Segnaposto araldico della famiglia ${family.name}`)}</div>
      <div class="family-profile__body">
        <div class="family-profile__topline">
          <div>
            <h2>${esc(family.name)}</h2>
            <div class="family-profile__kind">Famiglia, casato o nucleo proprietario</div>
          </div>
          <span class="family-profile__badge"><i class="bi bi-diagram-3"></i> id ${esc(family.id)}</span>
        </div>
        <div class="family-profile__description${description ? '' : ' is-empty'}" tabindex="0" aria-label="Descrizione della famiglia">${esc(description)}</div>
        <div class="family-stats" aria-label="Statistiche della famiglia">
          <div class="family-stat" title="${esc(`${possessionCount} possedimenti`)}" aria-label="${esc(`${possessionCount} possedimenti`)}"><i class="bi bi-pin-map" aria-hidden="true"></i><strong>${possessionCount}</strong></div>
          <div class="family-stat" title="${esc(`${maps.length} mappe collegate`)}" aria-label="${esc(`${maps.length} mappe collegate`)}"><i class="bi bi-map" aria-hidden="true"></i><strong>${maps.length}</strong></div>
          <div class="family-stat" title="${esc(`${members.length} familiari riconosciuti`)}" aria-label="${esc(`${members.length} familiari riconosciuti`)}"><i class="bi bi-people" aria-hidden="true"></i><strong>${members.length}</strong></div>
          <div class="family-stat" title="${esc(`${locations.length} città o località: ${locations.map(place => place.name).join(', ') || 'nessuna'}`)}" aria-label="${esc(`${locations.length} città o località`)}"><i class="bi bi-buildings" aria-hidden="true"></i><strong>${locations.length}</strong></div>
        </div>
      </div>`;

    renderPossessions(model);
    renderMembers(members);
    renderTraces(model);
  }

  function buildPossessionGroups(model){
    if(!model) return [];
    const groups = new Map();
    const add = (key, map, place) => {
      if(!groups.has(key)) groups.set(key, {key, map, places:[]});
      const group = groups.get(key);
      if(!group.places.some(item => id(item.id) === id(place.id))) group.places.push(place);
    };

    model.possessions.forEach(place => {
      const relatedMaps = model.mapsForPlace.get(id(place.id)) || [];
      if(relatedMaps.length){
        relatedMaps.forEach(map => add(id(map.id || map.fid), map, place));
      }else{
        add('__unmapped__', null, place);
      }
    });

    return Array.from(groups.values()).sort((a,b) => {
      if(!a.map) return 1;
      if(!b.map) return -1;
      return U.naturalCompare(a.map.sigla || a.map.name, b.map.sigla || b.map.name);
    });
  }

  function filteredPossessionGroups(model){
    const needle = normalizeWord(possessionSearch);
    return buildPossessionGroups(model).map(group => ({
      ...group,
      places:group.places.filter(place => !needle || normalizeWord(`${place.name} ${place.tipologia || ''} ${place.descrizione || ''}`).includes(needle))
    })).filter(group => group.places.length);
  }

  function changePossessionGroup(delta){
    const model = state.models.get(selectedFamilyId);
    const groups = filteredPossessionGroups(model);
    if(groups.length < 2) return;
    possessionGroupIndex = (possessionGroupIndex + delta + groups.length) % groups.length;
    renderPossessions(model);
  }

  function renderPossessions(model){
    const root = document.getElementById('possessions-stage');
    const meta = document.getElementById('possession-map-meta');
    const page = document.getElementById('possession-page');
    const prev = document.getElementById('possession-prev');
    const next = document.getElementById('possession-next');
    if(!root || !model) return;

    const groups = filteredPossessionGroups(model);
    if(!groups.length){
      root.innerHTML = `<div class="family-empty">${possessionSearch ? 'Nessun possedimento corrisponde alla ricerca.' : 'Nessun possedimento collegato direttamente o attraverso i familiari riconosciuti.'}</div>`;
      if(meta) meta.textContent = '';
      if(page) page.textContent = '0 di 0';
      if(prev) prev.disabled = true;
      if(next) next.disabled = true;
      return;
    }

    possessionGroupIndex = Math.max(0, Math.min(possessionGroupIndex, groups.length - 1));
    const group = groups[possessionGroupIndex];
    const mapTitle = group.map ? mapLabel(group.map) : 'Senza mappa associata';
    const archive = group.map ? U.labelFromArchive(group.map.archivio) : 'Collegamenti territoriali';
    if(meta) meta.innerHTML = `<strong>${esc(mapTitle)}</strong><span>${esc(archive)} · ${group.places.length} ${group.places.length === 1 ? 'possedimento' : 'possedimenti'}</span>`;
    if(page) page.textContent = `${possessionGroupIndex + 1} di ${groups.length}`;
    if(prev) prev.disabled = groups.length < 2;
    if(next) next.disabled = groups.length < 2;

    root.innerHTML = `<div class="possession-map-group">
      <div class="possessions-grid">
        ${group.places.map(place => possessionCard(place, group.map)).join('')}
      </div>
    </div>`;
  }

  function possessionPreview(place, map){
    const preview = map ? U.resolvePreviewPath(map) : '';
    return imageWithFallback(preview || PATHS.map, PATHS.map, `Anteprima cartografica di ${place.name}`, 'possession-card__thumb');
  }

  function possessionCard(place, map){
    const root = state.rootForPlace(place);
    const details = [place.tipologia, root && id(root.id) !== id(place.id) ? root.name : '', place.province || place.historical_province].filter(Boolean);
    return `<article class="possession-card">
      <div class="possession-card__image">${possessionPreview(place, map)}</div>
      <div class="possession-card__body">
        <h4>${esc(place.name)}</h4>
        <p>${esc(details.join(' · ') || 'Luogo collegato alla famiglia')}</p>
      </div>
    </article>`;
  }


  function familyHistoryRecords(model){
    if(!model) return [];
    return Array.from(model.lineages.values()).map(lineage => {
      const events = [];
      lineage.appearances.forEach(place => {
        const maps = model.mapsForPlace.get(id(place.id)) || [];
        if(maps.length){
          maps.forEach(map => events.push({
            key:`${id(place.id)}|${id(map.id || map.fid)}`,
            place,
            map,
            year:mapYear(map)
          }));
        }else{
          events.push({key:`${id(place.id)}|`, place, map:null, year:null});
        }
      });
      const uniqueEvents = Array.from(new Map(events.map(event => [event.key,event])).values())
        .filter(event => event.place?.feature?.geometry)
        .sort((a,b) => {
          if(a.year == null && b.year == null) return U.naturalCompare(a.place.name,b.place.name);
          if(a.year == null) return 1;
          if(b.year == null) return -1;
          return a.year - b.year || U.naturalCompare(a.map?.sigla || '',b.map?.sigla || '');
        });
      return {
        id:id(lineage.id),
        root:lineage.root,
        events:uniqueEvents,
        hasHistory:new Set(uniqueEvents.map(event => id(event.place.id))).size > 1
      };
    }).filter(record => record.events.length);
  }

  function selectedHistoryEvent(record){
    if(!record?.events?.length) return null;
    const override = familyMapOverrides.get(record.id);
    if(override){
      const forced = record.events.find(event => event.key === override);
      if(forced) return {event:forced, attested:false, overridden:true};
    }
    if(!familyMapRange || !familyMapRange.years.length){
      return {event:record.events[record.events.length - 1], attested:true, overridden:false};
    }
    const {start,end} = familyMapRange;
    const inRange = record.events.filter(event => event.year != null && event.year >= start && event.year <= end);
    if(inRange.length) return {event:inRange[inRange.length - 1], attested:true, overridden:false};
    const before = record.events.filter(event => event.year != null && event.year <= end);
    if(before.length) return {event:before[before.length - 1], attested:false, overridden:false};
    const after = record.events.find(event => event.year != null && event.year > end);
    if(after) return {event:after, attested:false, overridden:false};
    return {event:record.events[record.events.length - 1], attested:false, overridden:false};
  }

  function historyPopup(record, selection){
    const current = selection.event;
    const choices = record.events.slice().reverse().map(event => {
      const active = event.key === current.key;
      const label = event.year != null ? String(event.year) : 's.d.';
      return `<button type="button" class="family-history-popup__choice${active ? ' is-active' : ''}" data-history-lineage="${esc(record.id)}" data-history-key="${esc(event.key)}">
        <strong>${esc(label)}</strong><span>${esc(event.place.name)}</span><small>${esc(event.map ? mapLabel(event.map) : 'Mappa non indicata')}</small>
      </button>`;
    }).join('');
    return `<div class="family-history-popup">
      <span class="family-history-popup__eyebrow">Historical view</span>
      <h3>${esc(record.root?.name || current.place.name)}</h3>
      <p>Fase visualizzata: <strong>${esc(current.year ?? 'senza data')}</strong>${selection.overridden ? ' · vista manuale' : ''}</p>
      ${record.hasHistory ? `<div class="family-history-popup__choices">${choices}</div>
        <button type="button" class="family-history-popup__auto" data-history-lineage="${esc(record.id)}" data-history-key="">Ripristina la fase automatica</button>` : '<small>Non sono presenti altre geometrie storiche associate.</small>'}
    </div>`;
  }

  function parentChainForPlace(place){
    const chain = [];
    let current = place;
    const visited = new Set([id(current?.id)]);
    while(current && hasParent(current.parent_id)){
      const parent = state.placesById.get(id(current.parent_id));
      if(!parent || visited.has(id(parent.id))) break;
      chain.push(parent);
      visited.add(id(parent.id));
      current = parent;
    }
    return chain;
  }

  function historyInspectorSection(title, icon, value){
    const text = String(value || '').trim();
    if(!text) return '';
    return `<section class="family-history-inspector__section"><h5><i class="bi ${icon}"></i>${esc(title)}</h5><p>${esc(text)}</p></section>`;
  }

  function renderHistoryInspector(record, selection){
    const root = document.getElementById('family-history-inspector-content');
    if(!root || !record || !selection?.event) return;
    const {place,map,year} = selection.event;
    const city = state.rootForPlace(place);
    const parents = parentChainForPlace(place);
    const directParent = hasParent(place.parent_id) ? state.placesById.get(id(place.parent_id)) : null;
    const note = place['note Marcello'] || place.note_marcello || place.note || place.notes || '';

    const childDescription = String(place.descrizione || '').trim();
    const parentDescription = String(directParent?.descrizione || '').trim();
    const childIdentification = String(place.identificazione_attuale || place.identification || '').trim();
    const parentIdentification = String(directParent?.identificazione_attuale || directParent?.identification || '').trim();

    // Nei record figli, descrizione e identificazione del parent descrivono il luogo storico
    // e sono quindi mostrate come dati principali. Gli eventuali valori specifici del figlio
    // vengono conservati in un box separato dedicato alla singola attestazione.
    const description = parentDescription || childDescription;
    const identification = parentIdentification || childIdentification;
    const specificDescription = parentDescription && childDescription && normalizeWord(parentDescription) !== normalizeWord(childDescription) ? childDescription : '';
    const specificIdentification = parentIdentification && childIdentification && normalizeWord(parentIdentification) !== normalizeWord(childIdentification) ? childIdentification : '';
    const hasSpecifics = !!(specificDescription || specificIdentification);

    const lineageName = record.root && id(record.root.id) !== id(place.id) ? record.root.name : '';
    const hierarchy = [place, ...parents];
    root.innerHTML = `<article class="family-history-inspector__record">
      <div class="family-history-inspector__status${selection.attested ? ' is-attested' : ' is-uncertain'}">
        <i class="bi ${selection.attested ? 'bi-check-circle' : 'bi-clock-history'}"></i>
        ${selection.attested ? 'Attestato nell’intervallo' : 'Fuori dall’intervallo'}
        ${selection.overridden ? '<span>vista manuale</span>' : ''}
      </div>
      <h4>${esc(place.name)}</h4>
      <div class="family-history-inspector__source">
        <span><i class="bi bi-map"></i>${esc(map ? mapLabel(map) : 'Mappa non indicata')}</span>
        <strong>${esc(year ?? 's.d.')}</strong>
      </div>
      <div class="family-history-inspector__chips">
        ${place.tipologia ? `<span>${esc(place.tipologia)}</span>` : ''}
        ${city ? `<span>${esc(city.name)}</span>` : ''}
        ${record.hasHistory ? '<span>più fasi storiche</span>' : ''}
      </div>
      ${historyInspectorSection('Descrizione','bi-file-text',description)}
      ${historyInspectorSection('Identificazione attuale','bi-geo-alt',identification)}
      ${hasSpecifics ? `<section class="family-history-inspector__section family-history-inspector__section--specifics">
        <h5><i class="bi bi-signpost-split"></i>Specifiche dell’attestazione selezionata</h5>
        <div class="family-history-inspector__specifics">
          ${specificDescription ? `<div><strong>Descrizione specifica</strong><p>${esc(specificDescription)}</p></div>` : ''}
          ${specificIdentification ? `<div><strong>Identificazione specifica</strong><p>${esc(specificIdentification)}</p></div>` : ''}
        </div>
      </section>` : ''}
      ${historyInspectorSection('Note','bi-journal-text',note)}
      ${lineageName ? historyInspectorSection('Possedimento storico','bi-diagram-3',lineageName) : ''}
      <section class="family-history-inspector__section family-history-inspector__section--hierarchy">
        <h5><i class="bi bi-bezier2"></i>Gerarchia territoriale</h5>
        <div class="family-history-inspector__hierarchy">
          ${hierarchy.map((item,index) => `<div class="${index === 0 ? 'is-current' : ''}"><span>${index === 0 ? 'Record visualizzato' : (index === hierarchy.length - 1 ? 'Città / località' : 'Parent')}</span><strong>${esc(item.name)}</strong>${item.tipologia ? `<small>${esc(item.tipologia)}</small>` : ''}</div>`).join('')}
        </div>
      </section>
    </article>`;
  }

  function handleHistoryMapClick(event){
    const button = event.target.closest('[data-history-lineage]');
    if(!button || !familyMapModel) return;
    const lineageId = id(button.dataset.historyLineage);
    const historyKey = String(button.dataset.historyKey || '');
    if(historyKey) familyMapOverrides.set(lineageId,historyKey);
    else familyMapOverrides.delete(lineageId);
    familyInspectorRecordId = lineageId;
    renderFamilyMapLayers(false);
    familyMap?.closePopup();
  }

  function renderFamilyMapLayers(fit=false){
    if(!familyMap || !familyMapModel || !window.L) return;
    if(familyMapLayer) familyMapLayer.clearLayers();
    else familyMapLayer = window.L.featureGroup().addTo(familyMap);
    const records = familyHistoryRecords(familyMapModel);
    let attestedCount = 0;
    let uncertainCount = 0;

    records.forEach(record => {
      const selection = selectedHistoryEvent(record);
      if(!selection?.event?.place?.feature?.geometry) return;
      if(selection.attested) attestedCount++; else uncertainCount++;
      const historyDash = record.hasHistory ? '8 5' : null;
      const isInspected = familyInspectorRecordId === record.id;
      const strokeColor = selection.overridden ? '#24323d' : (selection.attested ? '#934123' : '#7a7168');
      const fillOpacity = selection.attested ? .28 : (selection.overridden ? .14 : 0);
      const dashArray = selection.overridden ? '5 4' : (selection.attested ? historyDash : '2 7');
      const layer = window.L.geoJSON(selection.event.place.feature, {
        style:{
          color:strokeColor,
          weight:(record.hasHistory ? 3.2 : 2.4) + (isInspected ? 1.2 : 0),
          opacity:selection.attested || selection.overridden ? .96 : .72,
          fillColor:selection.overridden ? '#24323d' : '#934123',
          fillOpacity,
          dashArray,
          lineCap:'butt',
          lineJoin:'miter'
        },
        pointToLayer:(feature,latlng) => window.L.circleMarker(latlng,{
          radius:selection.attested ? 8 : 7,
          color:strokeColor,
          weight:(record.hasHistory ? 3 : 2) + (isInspected ? 1.2 : 0),
          fillColor:selection.overridden ? '#24323d' : '#934123',
          fillOpacity:selection.attested ? .34 : (selection.overridden ? .16 : 0),
          dashArray
        })
      });
      layer.bindPopup(historyPopup(record,selection), {className:'family-history-leaflet-popup', maxWidth:330, closeButton:true, autoPan:true});
      layer.bindTooltip(`<strong>${esc(record.root?.name || selection.event.place.name)}</strong><br><span>${esc(selection.event.place.name)}</span><br><small>${esc(selection.event.year ?? 'senza data')} · Historical view</small>`, {sticky:true, className:'family-history-tooltip'});
      layer.eachLayer(child => {
        const inspect = () => {
          familyInspectorRecordId = record.id;
          renderHistoryInspector(record,selection);
        };
        child.on('mouseover', () => { inspect(); child.openTooltip(); if(record.hasHistory) child.openPopup(); });
        child.on('click', () => { inspect(); child.openPopup(); });
      });
      layer.addTo(familyMapLayer);
    });

    if(fit && familyMapLayer.getLayers().length){
      const bounds = familyMapLayer.getBounds();
      if(bounds.isValid()) familyMap.fitBounds(bounds.pad(.16), {maxZoom:16});
    }
    const inspectedRecord = records.find(record => record.id === familyInspectorRecordId) || records[0];
    if(inspectedRecord){
      familyInspectorRecordId = inspectedRecord.id;
      renderHistoryInspector(inspectedRecord,selectedHistoryEvent(inspectedRecord));
    }else{
      const inspector = document.getElementById('family-history-inspector-content');
      if(inspector) inspector.innerHTML = '<div class="family-history-inspector__empty"><i class="bi bi-map"></i><p>Non sono disponibili geometrie per questa famiglia.</p></div>';
    }

    const summary = document.getElementById('family-history-summary');
    if(summary){
      const historical = records.filter(record => record.hasHistory).length;
      summary.innerHTML = `<div><strong>${attestedCount}</strong><span>attestati nel periodo</span></div><div><strong>${uncertainCount}</strong><span>fuori periodo</span></div><div><strong>${historical}</strong><span>con più fasi</span></div>`;
    }
  }

  function timelinePercent(year,min,max){
    if(max <= min) return 50;
    return ((year - min) / (max - min)) * 100;
  }

  function renderFamilyTimeline(records){
    const root = document.getElementById('family-timeline');
    const label = document.getElementById('family-timeline-label');
    if(!root) return;
    const years = unique(records.flatMap(record => record.events.map(event => event.year).filter(Number.isFinite))).sort((a,b) => a-b);
    if(!years.length){
      familyMapRange = {years:[],min:null,max:null,start:null,end:null};
      root.innerHTML = '<div class="family-timeline__empty">Le mappe collegate non hanno ancora un anno numerico utilizzabile.</div>';
      if(label) label.textContent = 'Cronologia non disponibile';
      return;
    }
    const min = years[0], max = years[years.length - 1];
    familyMapRange = {years,min,max,start:min,end:max};
    root.innerHTML = `<div class="family-timeline__track" style="--range-start:0%;--range-end:100%">
      <div class="family-timeline__rail"></div>
      <div class="family-timeline__selection"></div>
      ${years.map(year => `<button type="button" class="family-timeline__checkpoint" style="left:${timelinePercent(year,min,max)}%" data-timeline-year="${year}" aria-label="Imposta il termine al ${year}"><i></i><span>${year}</span></button>`).join('')}
      <input id="family-timeline-start" class="family-timeline__range is-start" type="range" min="${min}" max="${max}" step="1" value="${min}" aria-label="Anno iniziale" />
      <input id="family-timeline-end" class="family-timeline__range is-end" type="range" min="${min}" max="${max}" step="1" value="${max}" aria-label="Anno finale" />
    </div>
    <div class="family-timeline__bounds"><span>${min}</span><span>${max}</span></div>`;
    const startInput = document.getElementById('family-timeline-start');
    const endInput = document.getElementById('family-timeline-end');
    const apply = changed => {
      let start = Number(startInput.value), end = Number(endInput.value);
      if(start > end){
        if(changed === 'start') end = start; else start = end;
        startInput.value = String(start);
        endInput.value = String(end);
      }
      familyMapRange.start = start;
      familyMapRange.end = end;
      familyMapOverrides.clear();
      updateFamilyTimelineVisual();
      renderFamilyMapLayers(false);
    };
    startInput.addEventListener('input', () => apply('start'));
    endInput.addEventListener('input', () => apply('end'));
    root.querySelectorAll('[data-timeline-year]').forEach(button => button.addEventListener('click', () => {
      endInput.value = button.dataset.timelineYear;
      apply('end');
    }));
    updateFamilyTimelineVisual();
  }

  function updateFamilyTimelineVisual(){
    const track = document.querySelector('.family-timeline__track');
    const label = document.getElementById('family-timeline-label');
    if(!familyMapRange?.years?.length){
      if(label) label.textContent = 'Cronologia non disponibile';
      return;
    }
    const {min,max,start,end} = familyMapRange;
    track?.style.setProperty('--range-start',`${timelinePercent(start,min,max)}%`);
    track?.style.setProperty('--range-end',`${timelinePercent(end,min,max)}%`);
    if(label) label.textContent = start === end ? String(start) : `${start}–${end}`;
    document.querySelectorAll('[data-timeline-year]').forEach(button => {
      const year = Number(button.dataset.timelineYear);
      button.classList.toggle('is-in-range',year >= start && year <= end);
    });
  }

  function resetFamilyTimeline(){
    if(!familyMapRange?.years?.length) return;
    const startInput = document.getElementById('family-timeline-start');
    const endInput = document.getElementById('family-timeline-end');
    familyMapRange.start = familyMapRange.min;
    familyMapRange.end = familyMapRange.max;
    if(startInput) startInput.value = String(familyMapRange.min);
    if(endInput) endInput.value = String(familyMapRange.max);
    familyMapOverrides.clear();
    updateFamilyTimelineVisual();
    renderFamilyMapLayers(false);
  }

  async function initFamilyMap(force=false){
    const model = state.models.get(selectedFamilyId);
    const stage = document.getElementById('family-map-stage');
    const loader = document.getElementById('family-map-loader');
    if(!model || !stage || stage.hidden) return;
    const sameModel = familyMapModel && id(familyMapModel.family.id) === id(model.family.id);
    if(familyMap && sameModel && !force){
      if(loader) loader.hidden = true;
      requestAnimationFrame(() => familyMap?.invalidateSize());
      return;
    }
    familyMapModel = model;
    familyMapOverrides.clear();
    familyInspectorRecordId = null;
    if(loader){ loader.hidden = false; loader.classList.remove('is-error'); loader.innerHTML = '<span class="gallery-loading__spinner"></span><span>Sto preparando la mappa storica…</span>'; }
    try{
      await ensureLeaflet();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if(familyMap && (force || !sameModel)){
        familyMap.remove();
        familyMap = null;
        familyMapLayer = null;
      }
      const mapRoot = document.getElementById('family-history-map');
      if(!familyMap){
        familyMap = window.L.map(mapRoot,{zoomControl:true,attributionControl:true,preferCanvas:true});
        window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
          maxZoom:20,
          attribution:'&copy; OpenStreetMap &copy; CARTO'
        }).addTo(familyMap);
        mapRoot.removeEventListener('click',handleHistoryMapClick);
        mapRoot.addEventListener('click',handleHistoryMapClick);
      }
      const records = familyHistoryRecords(model);
      renderFamilyTimeline(records);
      renderFamilyMapLayers(true);
      if(!familyMapLayer?.getLayers().length) familyMap.setView([44.48,10.95],9);
      setTimeout(() => familyMap?.invalidateSize(),80);
      if(loader) loader.hidden = true;
    }catch(error){
      console.error(error);
      if(loader){ loader.hidden = false; loader.classList.add('is-error'); loader.innerHTML = `<i class="bi bi-exclamation-triangle"></i><span>${esc(error.message)}</span>`; }
    }
  }


  function renderMembers(members){
    const root = document.getElementById('family-members');
    const count = document.getElementById('family-member-count');
    if(!root) return;
    count.textContent = members.length ? `${members.length} totali` : '';
    if(!members.length){
      root.innerHTML = `<div class="family-empty">Il dataset non contiene ancora persone collegate come figli di questa famiglia.</div>`;
      return;
    }
    root.innerHTML = members.slice(0,12).map(person => {
      const fallback = personFallback(person);
      const image = firstImage(person.images) || fallback;
      return `<button class="member-card" type="button" data-person-id="${esc(id(person.id))}" aria-label="Apri la scheda di ${esc(person.name)}">
        <div class="member-card__portrait">${imageWithFallback(image, fallback, `Ritratto segnaposto di ${person.name}`)}</div>
        <h4>${esc(person.name)}</h4>
        <p>${esc(person.varianti ? truncate(person.varianti,55) : 'Apri la scheda')}</p>
      </button>`;
    }).join('');
    root.querySelectorAll('[data-person-id]').forEach(button => button.addEventListener('click', event => openPersonModal(button.dataset.personId, event.currentTarget)));
  }

  function renderTraces(model){
    const root = document.getElementById('family-traces');
    const maps = model.maps.slice().sort((a,b) => {
      const yearA = Number.parseInt(a.year,10), yearB = Number.parseInt(b.year,10);
      if(Number.isFinite(yearA) && Number.isFinite(yearB) && yearA !== yearB) return yearA - yearB;
      return U.naturalCompare(a.sigla || a.name, b.sigla || b.name);
    });
    if(!maps.length){
      root.innerHTML = `<div class="family-empty">Le attestazioni documentarie saranno mostrate quando saranno disponibili collegamenti a luoghi e mappe.</div>`;
      return;
    }
    root.innerHTML = maps.map(map => {
      const webgisButton = U.hasGeo(map)
        ? `<a class="family-trace__map" href="${esc(U.webgisUrl(map))}" title="Apri ${esc(mapLabel(map))} nel WebGIS" aria-label="Apri nel WebGIS"><i class="bi bi-globe2"></i></a>`
        : `<span class="family-trace__map is-disabled" title="Questa mappa non è georeferenziata" aria-hidden="true"><i class="bi bi-globe2"></i></span>`;
      return `<div class="family-trace">
        <strong>${esc(map.year || map.sigla || `#${map.id}`)}</strong>
        <span>${esc(mapLabel(map))}<small>${esc(U.labelFromArchive(map.archivio))}</small></span>
        ${webgisButton}
      </div>`;
    }).join('');
  }

  function openPersonModal(personId, trigger){
    const model = state.personModels.get(id(personId));
    const modal = document.getElementById('person-modal');
    const content = document.getElementById('person-modal-content');
    if(!model || !modal || !content) return;
    modalReturnFocus = trigger || document.activeElement;
    const {person, possessions, maps, locations} = model;
    const fallback = personFallback(person);
    const image = firstImage(person.images) || fallback;
    const description = String(person.descrizione || '').trim();

    content.innerHTML = `<header class="person-modal__header">
      <div class="person-modal__portrait">${imageWithFallback(image, fallback, `Ritratto segnaposto di ${person.name}`)}</div>
      <div>
        <span class="person-modal__eyebrow">Persona riconosciuta</span>
        <h2 id="person-modal-title">${esc(person.name)}</h2>
        ${person.varianti ? `<p class="person-modal__variants">Varianti: ${esc(person.varianti)}</p>` : ''}
        <div class="person-modal__stats">
          <span><strong>${possessions.length}</strong> possedimenti</span>
          <span><strong>${maps.length}</strong> mappe</span>
          <span><strong>${locations.length}</strong> località</span>
        </div>
      </div>
    </header>
    <div class="person-modal__body">
      <section class="person-modal__section person-modal__description">
        <h3><i class="bi bi-file-text"></i> Descrizione</h3>
        <div>${description ? esc(description) : '<em>Nessuna descrizione disponibile.</em>'}</div>
      </section>
      <div class="person-modal__columns">
        <section class="person-modal__section">
          <h3><i class="bi bi-pin-map"></i> Possedimenti associati</h3>
          <div class="person-modal__places">${possessions.length ? possessions.map(place => `<span>${esc(place.name)}</span>`).join('') : '<em>Nessun possedimento associato.</em>'}</div>
        </section>
        <section class="person-modal__section">
          <h3><i class="bi bi-map"></i> Mappe collegate</h3>
          <div class="person-modal__maps">${maps.length ? maps.map(map => {
            const href = mapLink(map);
            return `<a href="${esc(href)}" ${href === '#' ? 'aria-disabled="true"' : ''}><span>${esc(mapLabel(map))}</span><small>${esc(U.labelFromArchive(map.archivio))}</small><i class="bi bi-arrow-up-right"></i></a>`;
          }).join('') : '<em>Nessuna mappa associata.</em>'}</div>
        </section>
      </div>
    </div>`;

    modal.hidden = false;
    document.body.classList.add('is-modal-open');
    modal.querySelector('.person-modal__close')?.focus();
  }

  function closePersonModal(){
    const modal = document.getElementById('person-modal');
    if(!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('is-modal-open');
    modalReturnFocus?.focus?.();
    modalReturnFocus = null;
  }


  function collectionMapType(map){
    return String(map?.tipologia || map?.tipo || map?.type || '').trim() || 'Carta storica';
  }

  function collectionPeriod(map){
    const year = mapYear(map);
    if(!year) return 'undated';
    return String(Math.floor((year - 1) / 100) + 1);
  }

  function romanCentury(value){
    const number = Number(value);
    if(!Number.isFinite(number) || number <= 0) return 'Senza data';
    const values = [
      [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']
    ];
    let remaining = number;
    let result = '';
    values.forEach(([unit,label]) => {
      while(remaining >= unit){ result += label; remaining -= unit; }
    });
    return `${result} secolo`;
  }

  function collectionMapSearchText(map){
    return normalizeWord([
      mapLabel(map), map.sigla, map.archivio, map.descrizione, map.cartiglio,
      collectionMapType(map), map.year
    ].filter(Boolean).join(' '));
  }

  function collectionRows(view){
    const meta = COLLECTION_META[view];
    if(!meta || !state) return [];
    return Array.from(state.mapsById.values()).filter(map => meta.matches(map));
  }

  function collectionCoverage(rows){
    const years = rows.map(mapYear).filter(Number.isFinite).sort((a,b) => a-b);
    if(!years.length) return {label:'n/d', detail:'Cronologia da integrare'};
    const min = years[0], max = years[years.length - 1];
    return {label:min === max ? String(min) : `${min}–${max}`, detail:'Copertura cronologica'};
  }

  function collectionStats(rows){
    return {
      total:rows.length,
      geo:rows.filter(U.hasGeo).length,
      tagged:rows.filter(U.hasTagged).length,
      coverage:collectionCoverage(rows)
    };
  }

  function collectionFilterOptions(rows){
    const periods = unique(rows.map(collectionPeriod)).sort((a,b) => {
      if(a === 'undated') return 1;
      if(b === 'undated') return -1;
      return Number(a) - Number(b);
    });
    const types = unique(rows.map(collectionMapType)).sort((a,b) => a.localeCompare(b,'it'));
    return {periods,types};
  }

  function collectionMapActions(map, compact=false){
    const actions = [];
    if(U.hasGeo(map)) actions.push(`<a href="${esc(U.webgisUrl(map))}" class="collection-action" title="Apri nel WebGIS" aria-label="Apri ${esc(mapLabel(map))} nel WebGIS"><i class="bi bi-crosshair"></i>${compact ? '' : '<span>WebGIS</span>'}</a>`);
    if(U.hasTagged(map)) actions.push(`<a href="${esc(U.detailUrl(map))}" class="collection-action" title="Apri la mappa taggata" aria-label="Apri ${esc(mapLabel(map))} nel visualizzatore tag"><i class="bi bi-tag"></i>${compact ? '' : '<span>Tag</span>'}</a>`);
    const full = U.resolveFullImagePath(map);
    if(full) actions.push(`<a href="${esc(full)}" class="collection-action" target="_blank" rel="noopener" title="Apri l’immagine completa" aria-label="Apri l’immagine completa di ${esc(mapLabel(map))}"><i class="bi bi-arrows-fullscreen"></i>${compact ? '' : '<span>Immagine</span>'}</a>`);
    return actions.join('');
  }

  function collectionCard(map){
    const selected = id(map.id || map.fid) === selectedCollectionMapId;
    const preview = U.resolvePreviewPath(map) || PATHS.map;
    const year = map.year || 'Senza data';
    const availability = [
      U.hasGeo(map) ? '<span title="Georeferenziata"><i class="bi bi-crosshair"></i></span>' : '',
      U.hasTagged(map) ? '<span title="Taggata"><i class="bi bi-tag"></i></span>' : ''
    ].join('');
    return `<article class="collection-map-card${selected ? ' is-selected' : ''}" tabindex="0" role="button" aria-selected="${selected}" data-collection-map-id="${esc(id(map.id || map.fid))}">
      <div class="collection-map-card__image">
        ${imageWithFallback(preview, PATHS.map, `Anteprima di ${mapLabel(map)}`)}
        <span class="collection-map-card__select"><i class="bi bi-eye"></i> Esplora</span>
      </div>
      <div class="collection-map-card__body">
        <div class="collection-map-card__archive"><i class="bi bi-archive"></i>${esc(U.labelFromArchive(map.archivio))}</div>
        <h3>${esc(mapLabel(map))}</h3>
        <div class="collection-map-card__meta"><span>${esc(year)}</span><span>${esc(collectionMapType(map))}</span></div>
        <div class="collection-map-card__footer">
          <span class="collection-map-card__availability">${availability || '<i class="bi bi-image"></i>'}</span>
          <span class="collection-map-card__signature">${esc(map.sigla || '')}</span>
        </div>
      </div>
    </article>`;
  }

  function filteredCollectionRows(){
    if(!collectionState) return [];
    const query = normalizeWord(collectionState.query || '');
    let rows = collectionState.rows.filter(map => {
      if(query && !collectionMapSearchText(map).includes(query)) return false;
      if(collectionState.period !== 'all' && collectionPeriod(map) !== collectionState.period) return false;
      if(collectionState.type !== 'all' && collectionMapType(map) !== collectionState.type) return false;
      if(collectionState.geo && !U.hasGeo(map)) return false;
      if(collectionState.tagged && !U.hasTagged(map)) return false;
      return true;
    });
    rows = rows.slice().sort((a,b) => {
      const ay = mapYear(a), by = mapYear(b);
      if(collectionState.sort === 'date-asc') return (ay ?? 99999) - (by ?? 99999) || U.naturalCompare(mapLabel(a),mapLabel(b));
      if(collectionState.sort === 'date-desc') return (by ?? -1) - (ay ?? -1) || U.naturalCompare(mapLabel(a),mapLabel(b));
      if(collectionState.sort === 'title-desc') return U.naturalCompare(mapLabel(b),mapLabel(a));
      return U.naturalCompare(mapLabel(a),mapLabel(b));
    });
    return rows;
  }

  function renderCollectionGrid(){
    const grid = document.getElementById('collection-map-grid');
    const count = document.getElementById('collection-results-count');
    if(!grid || !collectionState) return;
    const rows = filteredCollectionRows();
    if(count) count.textContent = `${rows.length} ${rows.length === 1 ? 'mappa' : 'mappe'}`;
    grid.classList.toggle('is-list', collectionState.layout === 'list');
    grid.innerHTML = rows.length ? rows.map(collectionCard).join('') : `<div class="collection-empty"><i class="bi bi-search"></i><strong>Nessuna mappa corrisponde ai filtri.</strong><span>Prova a modificare il periodo, la disponibilità o i termini di ricerca.</span></div>`;
    grid.querySelectorAll('[data-collection-map-id]').forEach(card => {
      card.addEventListener('click', event => {
        if(event.target.closest('a')) return;
        selectCollectionMap(card.dataset.collectionMapId, true);
      });
      card.addEventListener('keydown', event => {
        if(event.key === 'Enter' || event.key === ' '){
          event.preventDefault();
          selectCollectionMap(card.dataset.collectionMapId, true);
        }
      });
    });
  }

  function selectedCollectionMap(){
    return collectionState?.rows.find(map => id(map.id || map.fid) === selectedCollectionMapId) || null;
  }

  function collectionInfoBlock(title, icon, content, emptyText){
    const text = String(content || '').trim();
    return `<section class="collection-map-sheet__block${text ? '' : ' is-empty'}">
      <h4><i class="bi ${icon}"></i>${esc(title)}</h4>
      <div>${text ? esc(text) : `<em>${esc(emptyText)}</em>`}</div>
    </section>`;
  }

  function renderCollectionDetail(){
    const root = document.getElementById('collection-map-detail');
    if(!root) return;
    const map = selectedCollectionMap();
    if(!map){
      root.innerHTML = `<div class="collection-map-sheet__empty"><i class="bi bi-cursor"></i><strong>Seleziona una mappa</strong><span>La preview estesa e la relativa scheda appariranno qui.</span></div>`;
      return;
    }
    const full = U.resolveFullImagePath(map) || U.resolvePreviewPath(map) || PATHS.map;
    const preview = U.resolvePreviewPath(map) || PATHS.map;
    root.innerHTML = `<article class="collection-map-sheet" aria-label="Scheda di ${esc(mapLabel(map))}">
      <header class="collection-map-sheet__head">
        <div>
          <span class="collection-map-sheet__eyebrow">Mappa selezionata · ${esc(U.labelFromArchive(map.archivio))}</span>
          <h2>${esc(mapLabel(map))}</h2>
          <div class="collection-map-sheet__meta">
            <span><i class="bi bi-upc-scan"></i>${esc(map.sigla || 'Sigla non disponibile')}</span>
            <span><i class="bi bi-calendar3"></i>${esc(map.year || 'Senza data')}</span>
            <span><i class="bi bi-map"></i>${esc(collectionMapType(map))}</span>
          </div>
        </div>
        <div class="collection-map-sheet__actions">${collectionMapActions(map)}</div>
      </header>
      <div class="collection-map-sheet__media is-loading">
        <div class="collection-map-sheet__loader"><span class="gallery-loading__spinner"></span><span>Caricamento della preview completa…</span></div>
        <img src="${esc(full)}" alt="Preview completa di ${esc(mapLabel(map))}" decoding="async" onload="this.parentElement.classList.remove('is-loading')" onerror="if(this.dataset.fallback!=='1'){this.dataset.fallback='1';this.src='${esc(preview)}'}else{this.parentElement.classList.remove('is-loading');this.parentElement.classList.add('has-error')}" />
      </div>
      <footer class="collection-map-sheet__footer">
        ${collectionInfoBlock('Descrizione','bi-file-text',map.descrizione,'Nessuna descrizione disponibile.')}
        ${collectionInfoBlock('Cartiglio / didascalia','bi-quote',map.cartiglio,'Nessun cartiglio disponibile.')}
        <section class="collection-map-sheet__facts">
          <h4><i class="bi bi-info-circle"></i>Dati della mappa</h4>
          <dl>
            <div><dt>Archivio</dt><dd>${esc(U.labelFromArchive(map.archivio))}</dd></div>
            <div><dt>Anno</dt><dd>${esc(map.year || 'Non indicato')}</dd></div>
            <div><dt>Georeferenziata</dt><dd>${U.hasGeo(map) ? 'Sì' : 'No'}</dd></div>
            <div><dt>Taggata</dt><dd>${U.hasTagged(map) ? 'Sì' : 'No'}</dd></div>
          </dl>
        </section>
      </footer>
    </article>`;
  }

  function selectCollectionMap(mapId, scroll=false){
    if(!collectionState?.rows.some(map => id(map.id || map.fid) === id(mapId))) return;
    selectedCollectionMapId = id(mapId);
    const url = new URL(window.location.href);
    url.searchParams.set('map', selectedCollectionMapId);
    history.replaceState(null, '', url);
    renderCollectionGrid();
    renderCollectionDetail();
    if(scroll) requestAnimationFrame(() => document.getElementById('collection-map-detail')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  function updateCollectionFilters(){
    if(!collectionState) return;
    collectionState.query = document.getElementById('collection-search')?.value || '';
    collectionState.period = document.getElementById('collection-period')?.value || 'all';
    collectionState.type = document.getElementById('collection-type')?.value || 'all';
    collectionState.sort = document.getElementById('collection-sort')?.value || 'title-asc';
    collectionState.geo = !!document.getElementById('collection-geo')?.checked;
    collectionState.tagged = !!document.getElementById('collection-tagged')?.checked;
    renderCollectionGrid();
  }

  function resetCollectionFilters(){
    if(!collectionState) return;
    Object.assign(collectionState,{query:'',period:'all',type:'all',sort:'title-asc',geo:false,tagged:false});
    const values = {
      'collection-search':'', 'collection-period':'all', 'collection-type':'all', 'collection-sort':'title-asc'
    };
    Object.entries(values).forEach(([key,value]) => { const element=document.getElementById(key); if(element) element.value=value; });
    ['collection-geo','collection-tagged'].forEach(key => { const element=document.getElementById(key); if(element) element.checked=false; });
    renderCollectionGrid();
  }

  function bindCollectionControls(){
    ['collection-search','collection-period','collection-type','collection-sort','collection-geo','collection-tagged'].forEach(key => {
      const element = document.getElementById(key);
      if(!element) return;
      element.addEventListener(element.type === 'search' ? 'input' : 'change', updateCollectionFilters);
    });
    document.getElementById('collection-reset')?.addEventListener('click', resetCollectionFilters);
    document.querySelectorAll('[data-collection-layout]').forEach(button => button.addEventListener('click', () => {
      collectionState.layout = button.dataset.collectionLayout === 'list' ? 'list' : 'grid';
      document.querySelectorAll('[data-collection-layout]').forEach(item => {
        const active = item.dataset.collectionLayout === collectionState.layout;
        item.classList.toggle('is-active',active);
        item.setAttribute('aria-pressed',String(active));
      });
      renderCollectionGrid();
    }));
  }

  function renderCollection(view){
    const meta = COLLECTION_META[view];
    const rows = collectionRows(view);
    const stats = collectionStats(rows);
    const options = collectionFilterOptions(rows);
    const previousView = collectionState?.view;
    collectionState = {
      view, rows, query:'', period:'all', type:'all', geo:false, tagged:false,
      sort:'title-asc', layout: previousView === view ? collectionState.layout : 'grid'
    };
    const requested = new URL(window.location.href).searchParams.get('map');
    selectedCollectionMapId = rows.some(map => id(map.id || map.fid) === id(requested)) ? id(requested) : null;

    const periodOptions = [`<option value="all">Tutti i periodi</option>`].concat(options.periods.map(period => `<option value="${esc(period)}">${period === 'undated' ? 'Senza data' : esc(romanCentury(period))}</option>`)).join('');
    const typeOptions = [`<option value="all">Tutte le tipologie</option>`].concat(options.types.map(type => `<option value="${esc(type)}">${esc(type)}</option>`)).join('');

    main.innerHTML = `${pageHead()}
      <section class="collection-dashboard" aria-label="${esc(meta.title)}">
        <article class="gallery-card collection-hero">
          <div class="collection-hero__mark"><i class="bi ${meta.icon}"></i></div>
          <div class="collection-hero__copy">
            <span>${esc(meta.subtitle)}</span>
            <h2>${esc(meta.title)}</h2>
            <p>${esc(meta.intro)}</p>
          </div>
          <div class="collection-hero__stats">
            <div><i class="bi bi-map"></i><strong>${stats.total}</strong><span>Mappe totali</span></div>
            <div><i class="bi bi-crosshair"></i><strong>${stats.geo}</strong><span>Georeferenziate</span></div>
            <div><i class="bi bi-tag"></i><strong>${stats.tagged}</strong><span>Taggate</span></div>
            <div><i class="bi bi-calendar3"></i><strong>${esc(stats.coverage.label)}</strong><span>${esc(stats.coverage.detail)}</span></div>
          </div>
        </article>

        <section class="gallery-card collection-filters" aria-label="Filtri della collezione">
          <label class="collection-filter collection-filter--search"><span>Cerca</span><div><i class="bi bi-search"></i><input id="collection-search" type="search" placeholder="Titolo, sigla, descrizione…" autocomplete="off" /></div></label>
          <label class="collection-filter"><span>Periodo storico</span><select id="collection-period">${periodOptions}</select></label>
          <label class="collection-filter"><span>Tipologia</span><select id="collection-type">${typeOptions}</select></label>
          <fieldset class="collection-availability"><legend>Disponibilità</legend><label><input id="collection-geo" type="checkbox" /><i class="bi bi-crosshair"></i>Georeferenziate</label><label><input id="collection-tagged" type="checkbox" /><i class="bi bi-tag"></i>Taggate</label></fieldset>
          <button id="collection-reset" class="collection-reset" type="button"><i class="bi bi-arrow-counterclockwise"></i><span>Azzera filtri</span></button>
        </section>

        <section class="collection-results">
          <header class="collection-results__head">
            <h2>Tutte le mappe <span id="collection-results-count"></span></h2>
            <div class="collection-results__tools">
              <label>Ordina per <select id="collection-sort"><option value="title-asc">Titolo (A–Z)</option><option value="title-desc">Titolo (Z–A)</option><option value="date-desc">Data (decrescente)</option><option value="date-asc">Data (crescente)</option></select></label>
              <div class="collection-layout-switch" role="group" aria-label="Cambia disposizione"><button class="is-active" type="button" data-collection-layout="grid" aria-label="Vista griglia" aria-pressed="true"><i class="bi bi-grid-3x3-gap"></i></button><button type="button" data-collection-layout="list" aria-label="Vista elenco" aria-pressed="false"><i class="bi bi-list"></i></button></div>
            </div>
          </header>
          <div id="collection-map-grid" class="collection-map-grid"></div>
        </section>

        <section id="collection-map-detail" class="collection-map-detail" aria-live="polite"></section>
      </section>`;
    bindCollectionControls();
    renderCollectionGrid();
    renderCollectionDetail();
  }

  function castelnuovoConfig(){
    return window.ArchivesConfig?.archives?.CASTELNUOVO_GALLIANI || null;
  }

  function castelnuovoSequenceUrl(config, index){
    return `${config?.sequenceDir || 'images/maps/castelnuovo/'}${config?.sequencePrefix || 'CASTELNUOVO_GALLIANI_'}${String(index).padStart(4,'0')}${config?.sequenceExt || '.jpg'}`;
  }

  async function castelnuovoResourceExists(url){
    try{
      const response = await fetch(url, {method:'HEAD', cache:'no-store'});
      if(response.ok) return true;
      if(response.status !== 405 && response.status !== 501) return false;
    }catch(_error){ /* fallback con Image */ }
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    });
  }

  async function discoverCastelnuovoSequence(config){
    const start = Math.max(1, Number(config?.sequenceStart || 1));
    const max = Math.max(start, Number(config?.sequenceMax || 9999));
    if(!(await castelnuovoResourceExists(castelnuovoSequenceUrl(config,start)))) return [];

    let confirmed = start;
    let probe = Math.min(max, Math.max(start + 1, start * 2));
    while(probe <= max && await castelnuovoResourceExists(castelnuovoSequenceUrl(config,probe))){
      confirmed = probe;
      if(probe === max) break;
      probe = Math.min(max, probe * 2);
    }
    if(confirmed !== max){
      let left = confirmed + 1;
      let right = Math.max(confirmed, probe - 1);
      while(left <= right){
        const middle = Math.floor((left + right) / 2);
        if(await castelnuovoResourceExists(castelnuovoSequenceUrl(config,middle))){
          confirmed = middle;
          left = middle + 1;
        }else{
          right = middle - 1;
        }
      }
    }
    return Array.from({length:confirmed - start + 1}, (_,offset) => {
      const index = start + offset;
      return {index, src:castelnuovoSequenceUrl(config,index), label:`Tavola ${String(index).padStart(4,'0')}`};
    });
  }

  function castelnuovoBlockImage(block, config){
    if(!block) return '';
    if(block.source === 'sequence' || block.source === 'preview'){
      const match = String(block.imageName || '').match(/(\d{4})$/);
      if(match) return castelnuovoSequenceUrl(config, Number(match[1]));
    }
    return block.path || block.fallbackPath || '';
  }

  function castelnuovoImageMarkup(block, config){
    if(block?.placeholder){
      return `<figure class="cg-book-figure cg-book-figure--placeholder">
        <div class="cg-media-placeholder" role="img" aria-label="${esc(block.placeholderTitle || 'Immagine in preparazione')}">
          <span class="cg-media-placeholder__mark"><i class="bi bi-map"></i></span>
          <strong>${esc(block.placeholderTitle || 'Immagine in preparazione')}</strong>
          <span>${esc(block.placeholderText || '')}</span>
        </div>
        ${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ''}
      </figure>`;
    }
    const src = castelnuovoBlockImage(block,config);
    const fallback = block?.fallbackPath || 'images/other_images/archives/castelnuovo_galliani/castelnuovo_putto_placeholder.png';
    if(!src) return `<div class="cg-inline-placeholder"><i class="bi bi-image"></i><span>Immagine non disponibile</span></div>`;
    return `<figure class="cg-book-figure">
      <button type="button" class="cg-image-open" data-cg-open-image="${esc(src)}" data-cg-image-label="${esc(block.caption || block.title || 'Illustrazione del capitolo')}" aria-label="Ingrandisci l’immagine">
        <img src="${esc(src)}" alt="${esc(block.caption || block.title || 'Illustrazione del capitolo')}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${esc(fallback)}'" />
        <span class="cg-image-open__icon"><i class="bi bi-arrows-fullscreen"></i></span>
      </button>
      ${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ''}
    </figure>`;
  }

  function openCastelnuovoLightbox(src, label='Tavola storica'){
    if(!src) return;
    document.querySelector('.cg-lightbox')?.remove();

    const lightbox = document.createElement('div');
    lightbox.className = 'cg-lightbox';
    lightbox.innerHTML = `<div class="cg-lightbox__panel" role="dialog" aria-modal="true" aria-label="${esc(label || 'Immagine ingrandita')}">
      <header class="cg-lightbox__toolbar">
        <strong>${esc(label || 'Tavola storica')}</strong>
        <div class="cg-lightbox__actions">
          <button type="button" data-cg-zoom="out" title="Riduci" aria-label="Riduci"><i class="bi bi-dash-lg"></i></button>
          <button type="button" data-cg-zoom="reset" title="Adatta alla finestra" aria-label="Reimposta zoom"><i class="bi bi-aspect-ratio"></i></button>
          <button type="button" data-cg-zoom="in" title="Ingrandisci" aria-label="Ingrandisci"><i class="bi bi-plus-lg"></i></button>
          <a href="${esc(src)}" target="_blank" rel="noopener" title="Apri l’originale in una nuova scheda" aria-label="Apri l’immagine in una nuova scheda"><i class="bi bi-box-arrow-up-right"></i></a>
          <button type="button" data-cg-close-lightbox title="Chiudi" aria-label="Chiudi"><i class="bi bi-x-lg"></i></button>
        </div>
      </header>
      <div class="cg-lightbox__viewport" tabindex="0">
        <img src="${esc(src)}" alt="${esc(label || 'Tavola storica')}" draggable="false" />
      </div>
    </div>`;

    document.body.appendChild(lightbox);
    document.body.classList.add('is-cg-lightbox-open');

    const viewport = lightbox.querySelector('.cg-lightbox__viewport');
    const image = lightbox.querySelector('img');
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    let pointerStartX = 0;
    let pointerStartY = 0;

    const applyTransform = () => {
      image.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
      viewport.classList.toggle('is-zoomed', scale > 1.001);
    };

    const resetZoom = () => {
      scale = 1;
      offsetX = 0;
      offsetY = 0;
      applyTransform();
    };

    const zoomAt = (factor, clientX, clientY) => {
      const nextScale = Math.max(1, Math.min(8, scale * factor));
      if(Math.abs(nextScale - scale) < .001) return;

      const rect = viewport.getBoundingClientRect();
      const focusX = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
      const focusY = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
      const ratio = nextScale / scale;

      offsetX = focusX - (focusX - offsetX) * ratio;
      offsetY = focusY - (focusY - offsetY) * ratio;
      scale = nextScale;
      applyTransform();
    };

    const close = () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('is-cg-lightbox-open');
      lightbox.remove();
    };

    const onKeyDown = event => {
      if(event.key === 'Escape') close();
      else if(event.key === '+' || event.key === '=') zoomAt(1.25);
      else if(event.key === '-') zoomAt(.8);
      else if(event.key === '0') resetZoom();
    };

    lightbox.querySelector('[data-cg-zoom="in"]')?.addEventListener('click', () => zoomAt(1.35));
    lightbox.querySelector('[data-cg-zoom="out"]')?.addEventListener('click', () => zoomAt(1 / 1.35));
    lightbox.querySelector('[data-cg-zoom="reset"]')?.addEventListener('click', resetZoom);
    lightbox.querySelector('[data-cg-close-lightbox]')?.addEventListener('click', close);
    lightbox.addEventListener('click', event => { if(event.target === lightbox) close(); });

    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      zoomAt(event.deltaY < 0 ? 1.18 : 1 / 1.18, event.clientX, event.clientY);
    }, {passive:false});

    viewport.addEventListener('dblclick', event => {
      event.preventDefault();
      if(scale > 1.15) resetZoom();
      else zoomAt(2, event.clientX, event.clientY);
    });

    viewport.addEventListener('pointerdown', event => {
      if(scale <= 1.001) return;
      dragging = true;
      pointerStartX = event.clientX - offsetX;
      pointerStartY = event.clientY - offsetY;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging');
    });

    viewport.addEventListener('pointermove', event => {
      if(!dragging) return;
      offsetX = event.clientX - pointerStartX;
      offsetY = event.clientY - pointerStartY;
      applyTransform();
    });

    const stopDragging = event => {
      dragging = false;
      viewport.classList.remove('is-dragging');
      try{ viewport.releasePointerCapture(event.pointerId); }catch(_error){}
    };
    viewport.addEventListener('pointerup', stopDragging);
    viewport.addEventListener('pointercancel', stopDragging);

    image.addEventListener('load', resetZoom, {once:true});
    document.addEventListener('keydown', onKeyDown);
    viewport.focus({preventScroll:true});
  }

  function bindCastelnuovoImageLinks(scope){
    scope?.querySelectorAll('[data-cg-open-image]').forEach(button => button.addEventListener('click', () => {
      openCastelnuovoLightbox(button.dataset.cgOpenImage, button.dataset.cgImageLabel || '');
    }));
  }

  function bindCastelnuovoModeSwitch(){
    document.querySelectorAll('[data-cg-mode]').forEach(button => button.addEventListener('click', () => {
      castelnuovoState.mode = button.dataset.cgMode === 'reader' ? 'reader' : 'narrative';
      renderCastelnuovoBody();
    }));
  }

  function castelnuovoModeMarkup(){
    return `<div class="castelnuovo-gallery__switch" role="group" aria-label="Modalità di consultazione">
      <button type="button" class="${castelnuovoState.mode === 'narrative' ? 'is-active' : ''}" data-cg-mode="narrative" aria-label="Percorso narrativo" title="Percorso narrativo" aria-pressed="${castelnuovoState.mode === 'narrative'}"><i class="bi bi-feather"></i></button>
      <button type="button" class="${castelnuovoState.mode === 'reader' ? 'is-active' : ''}" data-cg-mode="reader" aria-label="Volume digitalizzato" title="Volume digitalizzato" aria-pressed="${castelnuovoState.mode === 'reader'}"><i class="bi bi-book"></i></button>
    </div>`;
  }

  function renderCastelnuovoNarrative(config){
    const blocks = Array.isArray(config?.articleBlocks) ? config.articleBlocks : [];
    if(!blocks.length) return `<div class="gallery-wip"><span class="gallery-wip__label">WIP</span><h2>Percorso narrativo</h2></div>`;
    castelnuovoState.chapter = Math.max(0,Math.min(castelnuovoState.chapter,blocks.length-1));
    const block = blocks[castelnuovoState.chapter];
    const chapterNumber = String(castelnuovoState.chapter+1).padStart(2,'0');
    const heading = `<header class="cg-chapter-heading"><span class="cg-book-kicker">Capitolo ${chapterNumber}</span><h2>${esc(block.title || '')}</h2></header>`;
    const copy = block.type === 'callout'
      ? `<aside class="cg-book-callout"><p>${esc(block.text || '')}</p></aside>`
      : `<div class="cg-book-copy">${(block.paragraphs || []).map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}</div>`;
    const media = castelnuovoImageMarkup(block,config);
    const chapterSide = block.reverse || castelnuovoState.chapter % 2 ? 'is-media-left' : 'is-media-right';
    const chapterScale = ['is-media-wide','is-media-compact','is-media-tall'][castelnuovoState.chapter % 3];
    const sidebarStyle = config.sidebarFramePath ? `style="--cg-sidebar-frame:url('${esc(config.sidebarFramePath)}')"` : '';
    const bookStyle = config.bookFramePath ? `style="--cg-book-frame:url('${esc(config.bookFramePath)}')"` : '';
    return `<section class="cg-narrative-layout">
      <aside class="cg-chapter-index" ${sidebarStyle}>
        <div class="cg-chapter-index__inner">
          <span>Percorso di lettura</span>
          <h2>Castelnuovo<br>Galliani</h2>
          <p>${esc(config.archiveSummary || '')}</p>
          <nav aria-label="Capitoli del percorso">
            ${blocks.map((item,index) => `<button type="button" class="${index===castelnuovoState.chapter?'is-active':''}" data-cg-chapter="${index}"><b>${String(index+1).padStart(2,'0')}</b><span>${esc(item.title || `Capitolo ${index+1}`)}</span></button>`).join('')}
          </nav>
        </div>
      </aside>
      <div class="cg-open-book" ${bookStyle}>
        <div class="cg-open-book__pages">
          <article class="cg-chapter-sheet ${chapterSide} ${chapterScale}">
            ${heading}
            <div class="cg-chapter-sheet__flow">
              <div class="cg-chapter-sheet__media">${media}</div>
              <div class="cg-chapter-sheet__text">${copy}</div>
            </div>
          </article>
        </div>
        <div class="cg-open-book__controls">
          <button type="button" data-cg-chapter-nav="prev" ${castelnuovoState.chapter===0?'disabled':''} aria-label="Capitolo precedente"><i class="bi bi-chevron-left"></i></button>
          <span>${castelnuovoState.chapter+1} / ${blocks.length}</span>
          <button type="button" data-cg-chapter-nav="next" ${castelnuovoState.chapter===blocks.length-1?'disabled':''} aria-label="Capitolo successivo"><i class="bi bi-chevron-right"></i></button>
        </div>
      </div>
    </section>`;
  }

  function renderCastelnuovoReader(config){
    if(castelnuovoState.loading) return `<div class="cg-sequence-loading"><span class="gallery-loading__spinner"></span><strong>Preparazione del volume</strong><span>Ricerca delle tavole disponibili…</span></div>`;
    if(castelnuovoState.error) return `<div class="gallery-error"><i class="bi bi-exclamation-triangle"></i><strong>Impossibile preparare lo sfogliatore.</strong><span>${esc(castelnuovoState.error)}</span></div>`;
    if(!castelnuovoState.items.length) return `<div class="gallery-wip"><span class="gallery-wip__label">Nessuna tavola</span><h2>Il volume non contiene immagini raggiungibili.</h2></div>`;
    castelnuovoState.page = Math.max(0,Math.min(castelnuovoState.page,castelnuovoState.items.length-1));
    const current = castelnuovoState.items[castelnuovoState.page];
    const readerDecoration = 'images/other_images/archives/castelnuovo_galliani/castelnuovo_measurement_vignette.png';
    return `<section class="cg-reader">
      <img class="cg-reader__decoration" src="${readerDecoration}" alt="" aria-hidden="true" loading="lazy" />
      <header class="cg-reader__head">
        <div><span>Quaderno Galliani</span><h3>${esc(current.label)}</h3></div>
        <button type="button" data-cg-open-image="${esc(current.src)}" data-cg-image-label="${esc(current.label)}" aria-label="Ingrandisci la tavola"><i class="bi bi-arrows-fullscreen"></i></button>
      </header>
      <div class="cg-reader__stage">
        <button type="button" class="cg-reader__arrow is-prev" data-cg-page-nav="prev" ${castelnuovoState.page===0?'disabled':''} aria-label="Tavola precedente"><i class="bi bi-chevron-left"></i></button>
        <div class="cg-reader__image">
          <img src="${esc(current.src)}" alt="${esc(current.label)}" decoding="async" />
          <button type="button" class="cg-reader__expand" data-cg-open-image="${esc(current.src)}" data-cg-image-label="${esc(current.label)}" aria-label="Ingrandisci la tavola"><i class="bi bi-zoom-in"></i></button>
        </div>
        <button type="button" class="cg-reader__arrow is-next" data-cg-page-nav="next" ${castelnuovoState.page===castelnuovoState.items.length-1?'disabled':''} aria-label="Tavola successiva"><i class="bi bi-chevron-right"></i></button>
      </div>
      <div class="cg-reader__footer"><span>${castelnuovoState.page+1} di ${castelnuovoState.items.length}</span><div class="cg-reader__progress"><i style="width:${((castelnuovoState.page+1)/castelnuovoState.items.length)*100}%"></i></div></div>
      <div class="cg-reader__thumbs" aria-label="Miniature delle tavole">
        ${castelnuovoState.items.map((item,index) => `<button type="button" class="${index===castelnuovoState.page?'is-active':''}" data-cg-page="${index}" title="${esc(item.label)}"><img src="${esc(item.src)}" alt="" loading="lazy" decoding="async" /><span>${String(item.index).padStart(4,'0')}</span></button>`).join('')}
      </div>
    </section>`;
  }

  function renderCastelnuovoReaderView(config){
    return `<section class="cg-reader-section" aria-label="Volume digitalizzato">
      <div id="castelnuovo-reader-body">${renderCastelnuovoReader(config)}</div>
    </section>`;
  }

  function renderCastelnuovoBody(){
    if(currentView !== 'castelnuovo') return;
    const config = castelnuovoConfig();
    const body = document.getElementById('castelnuovo-view-body');
    if(!config || !body) return;

    body.innerHTML = castelnuovoState.mode === 'reader'
      ? renderCastelnuovoReaderView(config)
      : `<div id="castelnuovo-narrative-body">${renderCastelnuovoNarrative(config)}</div>`;

    document.querySelectorAll('[data-cg-mode]').forEach(button => {
      const active = button.dataset.cgMode === castelnuovoState.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    if(castelnuovoState.mode === 'narrative'){
      const narrativeBody = document.getElementById('castelnuovo-narrative-body');
      narrativeBody?.querySelectorAll('[data-cg-chapter]').forEach(button => button.addEventListener('click', () => {
        castelnuovoState.chapter = Number(button.dataset.cgChapter) || 0;
        renderCastelnuovoBody();
      }));
      narrativeBody?.querySelectorAll('[data-cg-chapter-nav]').forEach(button => button.addEventListener('click', () => {
        const delta = button.dataset.cgChapterNav === 'prev' ? -1 : 1;
        castelnuovoState.chapter += delta;
        renderCastelnuovoBody();
      }));
      bindCastelnuovoImageLinks(narrativeBody);
      return;
    }

    const readerBody = document.getElementById('castelnuovo-reader-body');
    readerBody?.querySelectorAll('[data-cg-page]').forEach(button => button.addEventListener('click', () => {
      castelnuovoState.page = Number(button.dataset.cgPage) || 0;
      renderCastelnuovoBody();
    }));
    readerBody?.querySelectorAll('[data-cg-page-nav]').forEach(button => button.addEventListener('click', () => {
      castelnuovoState.page += button.dataset.cgPageNav === 'prev' ? -1 : 1;
      renderCastelnuovoBody();
    }));
    bindCastelnuovoImageLinks(readerBody);
  }

  async function ensureCastelnuovoSequence(){
    if(castelnuovoState.loaded || castelnuovoState.loading) return;
    castelnuovoState.loading = true;
    castelnuovoState.error = '';
    renderCastelnuovoBody();
    try{
      castelnuovoState.items = await discoverCastelnuovoSequence(castelnuovoConfig());
      castelnuovoState.loaded = true;
    }catch(error){
      console.error(error);
      castelnuovoState.error = error.message || 'Errore durante la ricerca delle immagini.';
    }finally{
      castelnuovoState.loading = false;
      renderCastelnuovoBody();
    }
  }

  function renderCastelnuovo(){
    const config = castelnuovoConfig();
    if(!config){
      renderWip('castelnuovo');
      return;
    }
    const titleVignette = 'images/other_images/archives/castelnuovo_galliani/castelnuovo_villa_landscape_vignette.png';
    main.innerHTML = `${pageHead()}
      <section class="castelnuovo-gallery">
        <header class="castelnuovo-gallery__hero castelnuovo-gallery__hero--illustrated">
          <div class="castelnuovo-gallery__hero-copy">
            <span class="castelnuovo-gallery__eyebrow"><i class="bi bi-bank"></i> Quaderno Galliani</span>
            <h2>${esc(config.splitTitle || config.label || 'Castelnuovo Galliani')}</h2>
            <p>${esc(config.lead || config.gallerySummary || '')}</p>
          </div>
          <figure class="castelnuovo-gallery__hero-art" aria-hidden="true"><img src="${titleVignette}" alt="" loading="lazy" /></figure>
          ${castelnuovoModeMarkup()}
        </header>
        <div id="castelnuovo-view-body"></div>
      </section>`;

    bindCastelnuovoModeSwitch();
    renderCastelnuovoBody();
    ensureCastelnuovoSequence();
  }


  function destroyCityMap(){
    if(cityMap){
      cityMap.remove();
      cityMap = null;
      cityMapLayer = null;
      cityBaseLayers = {};
    }
  }

  function currentCityModel(){
    return state?.cityModels?.get(id(selectedCityId)) || null;
  }

  function cityHistoryRecords(model){
    if(!model) return [];
    return Array.from(model.lineages.values()).map(lineage => {
      const events = [];
      lineage.appearances.forEach(place => {
        const relatedMaps = model.mapsForPlace.get(id(place.id)) || [];
        if(relatedMaps.length){
          relatedMaps.forEach(map => events.push({
            key:`${id(place.id)}|${id(map.id || map.fid)}`,
            place,
            map,
            year:mapYear(map)
          }));
        }else{
          events.push({key:`${id(place.id)}|`,place,map:null,year:null});
        }
      });
      const uniqueEvents = Array.from(new Map(events.map(event => [event.key,event])).values())
        .filter(event => event.place?.feature?.geometry)
        .sort((a,b) => {
          if(a.year == null && b.year == null) return U.naturalCompare(a.place.name,b.place.name);
          if(a.year == null) return 1;
          if(b.year == null) return -1;
          return a.year - b.year || U.naturalCompare(a.map?.sigla || '',b.map?.sigla || '');
        });
      return {
        id:id(lineage.id),
        root:lineage.root,
        events:uniqueEvents,
        hasHistory:new Set(uniqueEvents.map(event => id(event.place.id))).size > 1
      };
    }).filter(record => record.events.length);
  }

  function selectedCityEvent(record){
    if(!record?.events?.length) return null;
    const activeMap = id(cityActiveMapId);
    const override = cityMapOverrides.get(record.id);
    if(override){
      const forced = record.events.find(event => event.key === override);
      if(forced){
        const inActiveMap = !activeMap || id(forced.map?.id || forced.map?.fid) === activeMap;
        return {event:forced,status:'manual',attested:inActiveMap,overridden:true,inActiveMap};
      }
    }

    if(activeMap){
      const mapEvents = record.events.filter(event => id(event.map?.id || event.map?.fid) === activeMap);
      if(mapEvents.length){
        const event = mapEvents[mapEvents.length - 1];
        return {event,status:'current',attested:true,overridden:false,inActiveMap:true};
      }
    }

    const dated = record.events.filter(event => Number.isFinite(event.year));
    let selection;
    if(!cityTimeline?.years?.length || !dated.length){
      const event = record.events[record.events.length-1];
      selection = {event,status:'current',attested:true,overridden:false};
    }else{
      const year = cityTimeline.year;
      const exact = dated.filter(event => event.year === year);
      if(exact.length){
        selection = {event:exact[exact.length-1],status:'current',attested:true,overridden:false};
      }else{
        const before = dated.filter(event => event.year <= year);
        if(before.length) selection = {event:before[before.length-1],status:'historical',attested:false,overridden:false};
        else{
          const after = dated.find(event => event.year > year);
          if(after) selection = {event:after,status:'future',attested:false,overridden:false};
          else selection = {event:record.events[record.events.length-1],status:'undated',attested:false,overridden:false};
        }
      }
    }
    selection.inActiveMap = !activeMap;
    return selection;
  }

  function cityHistoryPopup(record,selection){
    const current = selection.event;
    const choices = record.events.slice().reverse().map(event => {
      const active = event.key === current.key;
      return `<button type="button" class="family-history-popup__choice${active ? ' is-active' : ''}" data-city-history-lineage="${esc(record.id)}" data-city-history-key="${esc(event.key)}">
        <strong>${esc(event.year ?? 's.d.')}</strong><span>${esc(event.place.name)}</span><small>${esc(event.map ? mapLabel(event.map) : 'Mappa non indicata')}</small>
      </button>`;
    }).join('');
    return `<div class="family-history-popup city-history-popup">
      <span class="family-history-popup__eyebrow">Historical view</span>
      <h3>${esc(record.root?.name || current.place.name)}</h3>
      <p>Fase visualizzata: <strong>${esc(current.year ?? 'senza data')}</strong>${selection.overridden ? ' · vista manuale' : ''}</p>
      ${record.hasHistory ? `<div class="family-history-popup__choices">${choices}</div>
        <button type="button" class="family-history-popup__auto" data-city-history-lineage="${esc(record.id)}" data-city-history-key="">Ripristina la fase cronologica</button>` : '<small>Non sono presenti altre geometrie storiche associate.</small>'}
    </div>`;
  }

  function cityInspectorSection(title,icon,value){
    const text = String(value || '').trim();
    if(!text) return '';
    return `<section class="city-inspector__section"><h5><i class="bi ${icon}"></i>${esc(title)}</h5><p>${esc(text)}</p></section>`;
  }

  function cityStatusLabel(selection){
    if(selection.overridden) return ['is-manual','bi-arrow-counterclockwise','Vista storica manuale'];
    if(selection.status === 'current') return ['is-current','bi-check-circle','Attestato nella fase selezionata'];
    if(selection.status === 'historical') return ['is-historical','bi-clock-history','Attestazione precedente'];
    if(selection.status === 'future') return ['is-future','bi-hourglass','Non ancora attestato'];
    return ['is-undated','bi-question-circle','Attestazione senza data'];
  }

  function setCityInspectorOpen(open){
    cityInspectorOpen = !!open;
    const body = document.querySelector('.city-atlas__body');
    const inspector = document.getElementById('city-inspector');
    body?.classList.toggle('is-inspector-open',cityInspectorOpen);
    if(inspector) inspector.setAttribute('aria-hidden',cityInspectorOpen ? 'false' : 'true');
    window.setTimeout(() => cityMap?.invalidateSize(),240);
  }

  function focusCityRecord(recordId,eventKey=''){
    const model=currentCityModel();
    if(!model) return;
    const record=cityHistoryRecords(model).find(item => item.id === id(recordId));
    if(!record) return;
    if(eventKey) cityMapOverrides.set(record.id,eventKey);
    cityInspectorRecordId=record.id;
    setCityInspectorOpen(true);
    renderCityMapLayers(false);
    window.setTimeout(() => {
      const layer=cityRecordLayers.get(record.id);
      if(layer?.getBounds){
        const bounds=layer.getBounds();
        if(bounds?.isValid()) cityMap?.fitBounds(bounds.pad(.45),{maxZoom:18});
      }
    },40);
  }

  function renderCityInspector(record,selection){
    const root = document.getElementById('city-inspector-content');
    if(!root || !record || !selection?.event) return;
    const {place,map,year} = selection.event;
    const note = place['note Marcello'] || place.note_marcello || place.note || place.notes || '';
    const identification = place.identificazione_attuale || place.identification || '';
    const description = place.descrizione || '';
    const hierarchy = [place,...parentChainForPlace(place)];
    const [statusClass,statusIcon,statusText] = cityStatusLabel(selection);
    const mapHref = map ? mapLink(map) : '';
    root.innerHTML = `<article class="city-inspector__record">
      <div class="city-inspector__status ${statusClass}"><i class="bi ${statusIcon}"></i><span>${statusText}</span>${selection.overridden ? '<small>rewind attivo</small>' : ''}</div>
      <div class="city-inspector__title"><span>Scheda del luogo</span><h3>${esc(place.name)}</h3></div>
      <div class="city-inspector__source"><span><i class="bi bi-map"></i>${esc(map ? mapLabel(map) : 'Mappa non indicata')}</span><strong>${esc(year ?? 's.d.')}</strong></div>
      <div class="city-inspector__chips">
        ${place.tipologia ? `<span>${esc(place.tipologia)}</span>` : ''}
        ${record.hasHistory ? '<span>più fasi storiche</span>' : ''}
        ${place.province || place.historical_province ? `<span>${esc(place.province || place.historical_province)}</span>` : ''}
      </div>
      ${cityInspectorSection('Descrizione','bi-file-text',description)}
      ${cityInspectorSection('Identificazione attuale','bi-geo-alt',identification)}
      ${cityInspectorSection('Note','bi-journal-text',note)}
      <section class="city-inspector__section city-inspector__section--hierarchy">
        <h5><i class="bi bi-diagram-3"></i>Gerarchia territoriale</h5>
        <div class="city-inspector__hierarchy">${hierarchy.map((item,index) => `<div class="${index===0?'is-current':''}"><span>${index===0?'Record visualizzato':(index===hierarchy.length-1?'Città / località':'Parent')}</span><strong>${esc(item.name)}</strong>${item.tipologia?`<small>${esc(item.tipologia)}</small>`:''}</div>`).join('')}</div>
      </section>
      <div class="city-inspector__actions">
        ${mapHref ? `<a href="${esc(mapHref)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i>Apri la mappa</a>` : ''}
        ${place.wikipedia ? `<a href="${esc(place.wikipedia)}" target="_blank" rel="noopener"><i class="bi bi-wikipedia"></i>Wikipedia</a>` : ''}
        ${place.wikidata ? `<a href="${esc(place.wikidata)}" target="_blank" rel="noopener"><i class="bi bi-database"></i>Wikidata</a>` : ''}
      </div>
    </article>`;
  }

  function handleCityMapClick(event){
    const button = event.target.closest('[data-city-history-lineage]');
    if(!button) return;
    const lineageId = id(button.dataset.cityHistoryLineage);
    const historyKey = String(button.dataset.cityHistoryKey || '');
    if(historyKey) cityMapOverrides.set(lineageId,historyKey); else cityMapOverrides.delete(lineageId);
    cityInspectorRecordId = lineageId;
    setCityInspectorOpen(true);
    renderCityMapLayers(false);
    cityMap?.closePopup();
  }

  function cityRecordMatches(record){
    const needle = normalizeWord(cityPlaceSearch);
    if(!needle) return true;
    return normalizeWord(`${record.root?.name || ''} ${record.root?.tipologia || ''} ${record.events.map(event => `${event.place.name} ${event.place.tipologia || ''} ${event.place.descrizione || ''}`).join(' ')}`).includes(needle);
  }

  function renderCityMapLayers(fit=false){
    const model = currentCityModel();
    if(!cityMap || !model || !window.L) return;
    if(cityMapLayer) cityMapLayer.clearLayers(); else cityMapLayer = window.L.featureGroup().addTo(cityMap);
    cityRecordLayers = new Map();
    const records = cityHistoryRecords(model).filter(cityRecordMatches);
    let currentCount = 0, historicalCount = 0, futureCount = 0;

    records.forEach(record => {
      const selection = selectedCityEvent(record);
      if(!selection?.event?.place?.feature?.geometry) return;
      if(selection.status === 'current') currentCount++;
      else if(selection.status === 'future') futureCount++;
      else historicalCount++;
      const inspected = cityInspectorRecordId === record.id;
      const outsideSelectedMap = !!cityActiveMapId && selection.inActiveMap === false;
      let color = '#934123', fillOpacity = .28, dashArray = record.hasHistory ? '8 5' : null, opacity = .96;
      if(outsideSelectedMap){ color='#776c64'; fillOpacity=0; dashArray='6 5'; opacity=.66; }
      else if(selection.overridden){ color='#24323d'; fillOpacity=.14; dashArray='5 4'; }
      else if(selection.status === 'historical'){ color='#8a6758'; fillOpacity=0; dashArray='7 5'; opacity=.8; }
      else if(selection.status === 'future'){ color='#7a7168'; fillOpacity=0; dashArray='2 7'; opacity=.68; }
      else if(selection.status === 'undated'){ color='#82776e'; fillOpacity=.05; dashArray='3 6'; opacity=.72; }
      const pointFillOpacity = outsideSelectedMap ? 0 : (selection.status==='current'?.36:(selection.overridden?.16:.04));
      const layer = window.L.geoJSON(selection.event.place.feature,{
        style:{color,weight:(record.hasHistory?3.2:2.35)+(inspected?1.3:0),opacity,fillColor:color,fillOpacity,dashArray,lineCap:'butt',lineJoin:'miter'},
        pointToLayer:(feature,latlng) => window.L.circleMarker(latlng,{radius:selection.status==='current'?8:7,color,weight:(record.hasHistory?3:2)+(inspected?1.2:0),fillColor:color,fillOpacity:pointFillOpacity,dashArray})
      });
      const phaseLabel = outsideSelectedMap ? 'fuori dalla mappa selezionata' : (selection.status === 'current' ? 'presente nella mappa' : 'Historical view');
      layer.bindTooltip(`<strong>${esc(record.root?.name || selection.event.place.name)}</strong><br><span>${esc(selection.event.place.name)}</span><br><small>${esc(selection.event.year ?? 'senza data')} · ${phaseLabel}</small>`,{sticky:true,className:'family-history-tooltip city-history-tooltip'});
      layer.bindPopup(cityHistoryPopup(record,selection),{className:'family-history-leaflet-popup',maxWidth:340,closeButton:true,autoPan:true});
      layer.eachLayer(child => {
        child.on('click',() => {
          cityInspectorRecordId=record.id;
          setCityInspectorOpen(true);
          renderCityInspector(record,selection);
          renderCityMapLayers(false);
          window.setTimeout(() => cityRecordLayers.get(record.id)?.openPopup(),0);
        });
      });
      layer.addTo(cityMapLayer);
      cityRecordLayers.set(record.id,layer);
    });

    if(fit && cityMapLayer.getLayers().length){
      const bounds = cityMapLayer.getBounds();
      if(bounds.isValid()) cityMap.fitBounds(bounds.pad(.14),{maxZoom:16});
    }
    if(cityInspectorRecordId){
      const inspected = records.find(record => record.id === cityInspectorRecordId);
      if(inspected) renderCityInspector(inspected,selectedCityEvent(inspected));
      else{
        cityInspectorRecordId=null;
        const inspector = document.getElementById('city-inspector-content');
        if(inspector) inspector.innerHTML = '<div class="city-inspector__empty"><i class="bi bi-map"></i><p>Il luogo selezionato non è visibile con i filtri correnti.</p></div>';
      }
    }
    const legend = document.getElementById('city-map-legend');
    if(legend){
      legend.innerHTML = cityActiveMapId
        ? '<span><i class="is-current"></i>presente nella mappa</span><span><i class="is-outside"></i>altre attestazioni</span><span><i class="is-multi"></i>più geometrie storiche</span>'
        : '<span><i class="is-current"></i>fase selezionata</span><span><i class="is-historical"></i>fase precedente</span><span><i class="is-future"></i>non ancora attestato</span><span><i class="is-multi"></i>più geometrie storiche</span>';
    }
    const summary = document.getElementById('city-map-summary');
    if(summary){
      if(cityActiveMapId){
        const selectedCount = records.filter(record => selectedCityEvent(record)?.inActiveMap).length;
        summary.innerHTML = `<div><strong>${selectedCount}</strong><span>luoghi nella mappa</span></div><div><strong>${Math.max(0,records.length-selectedCount)}</strong><span>altre attestazioni</span></div>`;
      }else{
        summary.innerHTML = `<div><strong>${currentCount}</strong><span>fase selezionata</span></div><div><strong>${historicalCount}</strong><span>fasi precedenti</span></div><div><strong>${futureCount}</strong><span>non ancora attestati</span></div>`;
      }
    }
  }

  function updateCityTimelineVisual(){
    const track = document.querySelector('.city-timeline__track');
    const label = document.getElementById('city-timeline-label');
    if(!cityTimeline?.years?.length){ if(label) label.textContent='Cronologia non disponibile'; return; }
    const {min,max,year} = cityTimeline;
    track?.style.setProperty('--city-progress',`${timelinePercent(year,min,max)}%`);
    if(label) label.textContent=String(year);
    document.querySelectorAll('[data-city-year]').forEach(button => button.classList.toggle('is-active',Number(button.dataset.cityYear)===year));
    const input = document.getElementById('city-timeline-range');
    if(input && Number(input.value)!==year) input.value=String(year);
  }

  function setCityYear(year,fit=false){
    if(!cityTimeline?.years?.length) return;
    const numeric = Math.max(cityTimeline.min,Math.min(cityTimeline.max,Number(year)));
    cityTimeline.year=numeric;
    cityMapOverrides.clear();
    updateCityTimelineVisual();
    renderCityMapLayers(fit);
    renderCitySidebarPanel(currentCityModel());
  }

  function renderCityTimeline(records){
    const root = document.getElementById('city-timeline');
    if(!root) return;
    const years = unique(records.flatMap(record => record.events.map(event => event.year).filter(Number.isFinite))).sort((a,b)=>a-b);
    if(!years.length){
      cityTimeline={years:[],min:null,max:null,year:null};
      root.innerHTML='<div class="city-timeline__empty">Le mappe collegate non hanno ancora un anno numerico utilizzabile.</div>';
      updateCityTimelineVisual();
      return;
    }
    const min=years[0],max=years[years.length-1];
    const previous = cityTimeline?.year;
    const initial = Number.isFinite(previous) && previous>=min && previous<=max ? previous : max;
    cityTimeline={years,min,max,year:initial};
    root.innerHTML=`<div class="city-timeline__track" style="--city-progress:${timelinePercent(initial,min,max)}%">
      <div class="city-timeline__rail"></div><div class="city-timeline__progress"></div>
      ${years.map((year,index) => `<button type="button" class="city-timeline__checkpoint${year===initial?' is-active':''}${index===0?' is-first':''}${index===years.length-1?' is-last':''}" style="left:${timelinePercent(year,min,max)}%" data-city-year="${year}" title="Visualizza il ${year}"><i></i><span>${year}</span></button>`).join('')}
      <input id="city-timeline-range" type="range" min="${min}" max="${max}" step="1" value="${initial}" aria-label="Anno visualizzato" />
    </div><div class="city-timeline__bounds"><span>${min}</span><span>${max}</span></div>`;
    root.querySelector('#city-timeline-range')?.addEventListener('input',event => { cityActiveMapId=null; citySidebarMode='maps'; cityPlaceSearch=''; cityPlacePage=0; setCityYear(Number(event.target.value),false); });
    root.querySelectorAll('[data-city-year]').forEach(button => button.addEventListener('click',() => { cityActiveMapId=null; citySidebarMode='maps'; cityPlaceSearch=''; cityPlacePage=0; setCityYear(Number(button.dataset.cityYear),false); }));
    updateCityTimelineVisual();
  }

  function cityCenturies(model){
    return unique((model?.years || []).map(year => Math.ceil(Number(year) / 100)).filter(Number.isFinite)).length;
  }

  function cityMapEntries(model,mapId){
    const wanted=id(mapId);
    const records=cityHistoryRecords(model);
    const entries=[];
    records.forEach(record => {
      record.events.filter(event => id(event.map?.id || event.map?.fid) === wanted).forEach(event => entries.push({record,event}));
    });
    return Array.from(new Map(entries.map(entry => [entry.event.key,entry])).values())
      .sort((a,b) => U.naturalCompare(a.event.place.name,b.event.place.name));
  }

  function cityPaginate(items,page){
    const total = items.length;
    const pages = Math.max(1,Math.ceil(total / CITY_NAV_PAGE_SIZE));
    const safePage = Math.max(0,Math.min(pages - 1,Number(page) || 0));
    const start = safePage * CITY_NAV_PAGE_SIZE;
    return {items:items.slice(start,start + CITY_NAV_PAGE_SIZE),page:safePage,pages,total,start};
  }

  function cityPagerMarkup(kind,paging){
    if(paging.pages <= 1) return '';
    const previousDisabled = paging.page <= 0 ? ' disabled' : '';
    const nextDisabled = paging.page >= paging.pages - 1 ? ' disabled' : '';
    const label = `${paging.start + 1}–${Math.min(paging.start + CITY_NAV_PAGE_SIZE,paging.total)} di ${paging.total}`;
    return `<nav class="city-nav-pager" aria-label="Scorri ${kind === 'maps' ? 'le mappe' : 'i luoghi'}">
      <button type="button" data-city-${kind}-page="-1" aria-label="Pagina precedente"${previousDisabled}><i class="bi bi-chevron-left"></i></button>
      <span>${esc(label)}</span>
      <button type="button" data-city-${kind}-page="1" aria-label="Pagina successiva"${nextDisabled}><i class="bi bi-chevron-right"></i></button>
    </nav>`;
  }

  function citySidebarMapRow(map,model){
    const mapId=id(map.id || map.fid);
    const year=mapYear(map);
    const availability=[U.hasGeo(map)?'<i class="bi bi-crosshair" title="Georeferenziata"></i>':'',U.hasTagged(map)?'<i class="bi bi-tag" title="Taggata"></i>':''].filter(Boolean).join('');
    return `<button type="button" class="city-nav-map${mapId===id(cityActiveMapId)?' is-active':''}" data-city-sidebar-map="${esc(mapId)}">
      <span><strong>${esc(mapLabel(map))}</strong><small>${model.mapPlaceCounts.get(mapId) || 0} luoghi</small></span>
      <span class="city-nav-map__year">${esc(year ?? 's.d.')}</span>
      <span class="city-nav-map__icons">${availability}<i class="bi bi-chevron-right"></i></span>
    </button>`;
  }

  function renderCitySidebarPanel(model){
    const root=document.getElementById('city-sidebar-panel');
    if(!root || !model) return;
    if(citySidebarMode === 'places' && cityActiveMapId){
      const map=model.maps.find(item => id(item.id || item.fid) === id(cityActiveMapId));
      if(!map){ citySidebarMode='maps'; cityActiveMapId=null; return renderCitySidebarPanel(model); }
      const entries=cityMapEntries(model,cityActiveMapId);
      const needle=normalizeWord(cityPlaceSearch);
      const filtered=entries.filter(({record,event}) => !needle || normalizeWord(`${event.place.name} ${event.place.tipologia || ''} ${record.root?.name || ''}`).includes(needle));
      const paging=cityPaginate(filtered,cityPlacePage);
      cityPlacePage=paging.page;
      root.innerHTML=`<div class="city-nav-panel__head city-nav-panel__head--places">
        <button type="button" id="city-sidebar-back" aria-label="Torna alle mappe" title="Torna alle mappe"><i class="bi bi-arrow-left"></i></button>
        <div><span>Luoghi della mappa</span><strong>${esc(mapLabel(map))}</strong><small>${esc(mapYear(map) ?? 's.d.')} · ${entries.length} ${entries.length===1?'luogo':'luoghi'}</small></div>
        <a href="${esc(mapLink(map))}" target="_blank" rel="noopener" title="Apri la mappa"><i class="bi bi-box-arrow-up-right"></i></a>
      </div>
      <label class="city-nav-search"><i class="bi bi-search"></i><input id="city-place-search" type="search" value="${esc(cityPlaceSearch)}" placeholder="Cerca tra i luoghi…" /></label>
      <div class="city-nav-place-list">${paging.items.length ? paging.items.map(({record,event}) => {
        const parentName=record.root?.name && id(record.root.id)!==id(event.place.id) ? record.root.name : (parentChainForPlace(event.place)[0]?.name || 'Città selezionata');
        return `<button type="button" class="city-nav-place${record.id===cityInspectorRecordId?' is-active':''}" data-city-sidebar-place="${esc(record.id)}" data-city-sidebar-event="${esc(event.key)}">
          <span><strong>${esc(event.place.name)}</strong><small>Parent: ${esc(parentName)}</small></span><i class="bi bi-geo-alt"></i>
        </button>`;
      }).join('') : '<div class="city-nav-empty">Nessun luogo corrisponde alla ricerca.</div>'}</div>
      ${cityPagerMarkup('places',paging)}`;
      root.querySelector('#city-sidebar-back')?.addEventListener('click',() => {
        citySidebarMode='maps'; cityActiveMapId=null; cityPlaceSearch=''; cityPlacePage=0; cityMapOverrides.clear();
        renderCitySidebarPanel(model); renderCityMapLayers(false);
      });
      root.querySelector('#city-place-search')?.addEventListener('input',event => {
        cityPlaceSearch=event.target.value || '';
        cityPlacePage=0;
        renderCitySidebarPanel(model);
        renderCityMapLayers(false);
        requestAnimationFrame(() => {
          const input=document.getElementById('city-place-search');
          if(input){ input.focus(); input.setSelectionRange(input.value.length,input.value.length); }
        });
      });
      root.querySelectorAll('[data-city-places-page]').forEach(button => button.addEventListener('click',() => {
        cityPlacePage += Number(button.dataset.cityPlacesPage || 0);
        renderCitySidebarPanel(model);
      }));
      root.querySelectorAll('[data-city-sidebar-place]').forEach(button => button.addEventListener('click',() => {
        focusCityRecord(button.dataset.citySidebarPlace,button.dataset.citySidebarEvent || '');
        renderCitySidebarPanel(model);
      }));
      return;
    }

    citySidebarMode='maps';
    const paging=cityPaginate(model.maps,cityMapPage);
    cityMapPage=paging.page;
    root.innerHTML=`<div class="city-nav-panel__head"><div><span>Le mappe che la ritraggono</span><strong>${model.maps.length} ${model.maps.length===1?'mappa':'mappe'}</strong></div></div>
      <div class="city-nav-map-list">${paging.items.length ? paging.items.map(map => citySidebarMapRow(map,model)).join('') : '<div class="city-nav-empty">Nessuna mappa collegata.</div>'}</div>
      ${cityPagerMarkup('maps',paging)}`;
    root.querySelectorAll('[data-city-maps-page]').forEach(button => button.addEventListener('click',() => {
      cityMapPage += Number(button.dataset.cityMapsPage || 0);
      renderCitySidebarPanel(model);
    }));
    root.querySelectorAll('[data-city-sidebar-map]').forEach(button => button.addEventListener('click',() => {
      const map=model.maps.find(item => id(item.id || item.fid)===id(button.dataset.citySidebarMap));
      if(!map) return;
      cityActiveMapId=id(map.id || map.fid);
      citySidebarMode='places';
      cityPlaceSearch='';
      cityPlacePage=0;
      cityMapOverrides.clear();
      cityInspectorRecordId=null;
      setCityInspectorOpen(false);
      const year=mapYear(map);
      if(Number.isFinite(year) && cityTimeline?.years?.length) setCityYear(year,true);
      else{ renderCitySidebarPanel(model); renderCityMapLayers(true); }
    }));
  }

  function setCityBaseMode(mode){
    if(!cityMap || !cityBaseLayers?.[mode]) return;
    Object.values(cityBaseLayers).forEach(layer => {
      if(cityMap.hasLayer(layer)) cityMap.removeLayer(layer);
    });
    cityBaseMode = mode;
    cityBaseLayers[mode].addTo(cityMap);
    document.querySelectorAll('[data-city-basemap]').forEach(button => {
      const active = button.dataset.cityBasemap === cityBaseMode;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',active ? 'true' : 'false');
    });
  }

  function buildCityBaseLayers(){
    cityBaseLayers = {
      osm: window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,
        opacity:.74,
        attribution:'&copy; OpenStreetMap contributors',
        className:'city-base-tiles city-base-tiles--osm'
      }),
      carto: window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
        maxZoom:20,
        opacity:.92,
        attribution:'&copy; OpenStreetMap &copy; CARTO',
        className:'city-base-tiles city-base-tiles--carto'
      })
    };
    if(!cityBaseLayers[cityBaseMode]) cityBaseMode='osm';
    cityBaseLayers[cityBaseMode].addTo(cityMap);
  }


  async function initCityMap(force=false){
    const model=currentCityModel();
    const mapRoot=document.getElementById('city-history-map');
    const loader=document.getElementById('city-map-loader');
    if(!model || !mapRoot) return;
    if(loader){ loader.hidden=false; loader.classList.remove('is-error'); loader.innerHTML='<span class="gallery-loading__spinner"></span><span>Sto ricostruendo l’evoluzione urbana…</span>'; }
    try{
      await ensureLeaflet();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if(cityMap && force) destroyCityMap();
      if(!cityMap){
        cityMap=window.L.map(mapRoot,{zoomControl:false,attributionControl:true,preferCanvas:true});
        buildCityBaseLayers();
        mapRoot.addEventListener('click',handleCityMapClick);
      }
      const records=cityHistoryRecords(model);
      renderCityTimeline(records);
      renderCityMapLayers(true);
      if(!cityMapLayer?.getLayers().length){
        const geometry=model.city?.feature?.geometry;
        if(geometry){ const cityLayer=window.L.geoJSON(model.city.feature); const bounds=cityLayer.getBounds(); if(bounds.isValid()) cityMap.fitBounds(bounds.pad(.4),{maxZoom:13}); }
        else cityMap.setView([44.48,10.95],9);
      }
      setTimeout(() => cityMap?.invalidateSize(),80);
      if(loader) loader.hidden=true;
    }catch(error){
      console.error(error);
      if(loader){ loader.hidden=false; loader.classList.add('is-error'); loader.innerHTML=`<i class="bi bi-exclamation-triangle"></i><span>${esc(error.message)}</span>`; }
    }
  }

  function renderCityHero(model){
    const root=document.getElementById('city-left-profile');
    if(!root || !model) return;
    const centuries=cityCenturies(model);
    root.innerHTML=`<label class="city-nav__selector" for="city-selector"><span>Scegli la città</span><select id="city-selector">${state.cities.map(city => `<option value="${esc(id(city.id))}" ${id(city.id)===selectedCityId?'selected':''}>${esc(city.name)}</option>`).join('')}</select></label>
      <figure class="city-nav__illustration"><img src="${esc(PATHS.citySkyline)}" alt="Profilo illustrato di una città storica" /></figure>
      <div class="city-nav__stats">
        <div><strong>${model.maps.length}</strong><span>Mappe<br>collegate</span></div>
        <div><strong>${model.placeCount}</strong><span>Luoghi<br>rilevati</span></div>
        <div><strong>${centuries || '—'}</strong><span>Secoli<br>di storia</span></div>
      </div>`;
  }

  function bindCityControls(){
    document.getElementById('city-selector')?.addEventListener('change',event => {
      selectedCityId=id(event.target.value);
      const url = new URL(window.location.href);
      url.searchParams.set('view','cities');
      url.searchParams.set('city',selectedCityId);
      history.replaceState(null,'',url);
      cityTimeline=null; cityMapOverrides.clear(); cityInspectorRecordId=null; cityActiveMapId=null; cityPlaceSearch='';
      cityInspectorOpen=false; citySidebarMode='maps'; cityRecordLayers=new Map(); cityMapPage=0; cityPlacePage=0;
      destroyCityMap();
      renderCities();
    });
    document.getElementById('city-timeline-latest')?.addEventListener('click',() => {
      cityActiveMapId=null; citySidebarMode='maps'; cityPlaceSearch=''; cityPlacePage=0;
      if(cityTimeline?.years?.length) setCityYear(cityTimeline.max,false);
    });
    document.getElementById('city-fit-map')?.addEventListener('click',() => renderCityMapLayers(true));
    document.querySelectorAll('[data-city-basemap]').forEach(button => button.addEventListener('click',() => setCityBaseMode(button.dataset.cityBasemap)));
    document.getElementById('city-inspector-close')?.addEventListener('click',() => setCityInspectorOpen(false));
  }

  function renderCities(){
    const cities=state?.cities || [];
    if(!cities.length){
      main.innerHTML=`${pageHead()}<section class="gallery-error"><i class="bi bi-exclamation-triangle"></i><strong>Nessuna città dispone ancora di mappe collegate.</strong><span>La raccolta VENDELLI è esclusa da questa sezione.</span></section>`;
      return;
    }
    if(!state.cityModels.has(id(selectedCityId))){
      const vignola=cities.find(city => normalizeWord(city.name)==='vignola');
      selectedCityId=id((vignola || cities[0]).id);
    }
    const model=currentCityModel();
    destroyCityMap();
    cityInspectorOpen=false;
    cityRecordLayers=new Map();
    main.innerHTML=`${pageHead()}<section class="city-story" aria-label="La città nella storia">
      <section id="city-atlas" class="gallery-card city-atlas city-atlas--evolution">
        <div class="city-atlas__body">
          <aside class="city-nav" aria-label="Navigazione della città">
            <div id="city-left-profile" class="city-nav__profile"></div>
            <div id="city-sidebar-panel" class="city-nav__panel"></div>
          </aside>
          <div class="city-atlas__main">
            <div class="city-atlas__map-wrap">
              <div class="city-map-caption"><span>La città nella storia</span><strong>${esc(model.city.name)} — Evoluzione nel tempo</strong></div>
              <div class="city-map-controls">
                <div class="city-basemap-switch" role="group" aria-label="Scegli la base cartografica">
                  <button type="button" data-city-basemap="osm" class="${cityBaseMode==='osm'?'is-active':''}" title="Base OpenStreetMap" aria-label="Base OpenStreetMap" aria-pressed="${cityBaseMode==='osm'?'true':'false'}"><i class="bi bi-globe-europe-africa"></i></button>
                  <button type="button" data-city-basemap="carto" class="${cityBaseMode==='carto'?'is-active':''}" title="Base CartoDB" aria-label="Base CartoDB" aria-pressed="${cityBaseMode==='carto'?'true':'false'}"><i class="bi bi-map"></i></button>
                </div>
                <button id="city-fit-map" type="button" title="Adatta alle geometrie" aria-label="Adatta alle geometrie"><i class="bi bi-arrows-fullscreen"></i></button>
              </div>
              <div id="city-history-map" class="city-history-map" aria-label="Mappa storica di ${esc(model.city.name)}"></div>
              <div id="city-map-loader" class="family-map-loader" role="status"><span class="gallery-loading__spinner"></span><span>Sto preparando la mappa…</span></div>
              <div id="city-map-legend" class="city-map-legend"><span><i class="is-current"></i>fase selezionata</span><span><i class="is-historical"></i>fase precedente</span><span><i class="is-future"></i>non ancora attestato</span><span><i class="is-multi"></i>più geometrie storiche</span></div>
            </div>
            <footer class="city-atlas__timeline"><div class="city-timeline__head"><div><span>Fase visualizzata</span><strong id="city-timeline-label">—</strong></div><button id="city-timeline-latest" type="button"><i class="bi bi-skip-end"></i><span>Fase più recente</span></button></div><div id="city-timeline" class="city-timeline"></div><div id="city-map-summary" class="city-map-summary"></div><p><i class="bi bi-info-circle"></i> I bordi tratteggiati segnalano fasi precedenti, future o luoghi dotati di più geometrie storiche. Quando selezioni una mappa, le altre attestazioni restano visibili senza riempimento. Seleziona una geometria per aprire la scheda e utilizzare il rewind mirato.</p></footer>
          </div>
          <aside id="city-inspector" class="city-inspector" aria-hidden="true"><header><span>Luogo selezionato</span><button id="city-inspector-close" type="button" aria-label="Chiudi la scheda"><i class="bi bi-x-lg"></i></button></header><div id="city-inspector-content" class="city-inspector__content"><div class="city-inspector__empty"><i class="bi bi-cursor"></i><p>Seleziona una geometria per consultarne la scheda.</p></div></div></aside>
        </div>
      </section>
    </section>`;
    renderCityHero(model);
    renderCitySidebarPanel(model);
    bindCityControls();
    initCityMap(true);
  }

  function renderWip(view){
    const meta = VIEW_META[view] || {title:'Nuova galleria',icon:'bi-hourglass-split'};
    main.innerHTML = `${pageHead()}<section class="gallery-wip">
      <div class="gallery-wip__mark"><i class="bi ${meta.icon}"></i></div>
      <span class="gallery-wip__label">WIP</span>
      <h2>${esc(meta.title)}</h2>
      <p>La struttura è già raggiungibile dall’indice laterale. Contenuti, filtri e gallerie dinamiche saranno integrati nel passaggio dedicato.</p>
    </section>`;
  }

  function activateView(view, updateUrl=true){
    document.body.classList.remove('is-modal-open');
    const nextView = VIEW_META[view] ? view : 'families';
    if(currentView === 'cities' && nextView !== 'cities') destroyCityMap();
    currentView = nextView;
    viewButtons.forEach(button => {
      const active = button.dataset.galleryView === currentView;
      button.classList.toggle('is-active', active);
      if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    });
    if(updateUrl){
      const url = new URL(window.location.href);
      if(currentView === 'families') url.searchParams.delete('view'); else url.searchParams.set('view', currentView);
      history.replaceState(null, '', url);
    }
    if(currentView === 'families') renderFamiliesShell();
    else if(COLLECTION_META[currentView]) renderCollection(currentView);
    else if(currentView === 'castelnuovo') renderCastelnuovo();
    else if(currentView === 'cities') renderCities();
    else renderWip(currentView);
  }

  viewButtons.forEach(button => button.addEventListener('click', () => activateView(button.dataset.galleryView)));

  Promise.all([
    fetchCsv('data/people.csv'),
    fetchCsv('data/people_places.csv'),
    fetch('data/places.geojson', {cache:'no-cache'}).then(response => {
      if(!response.ok) throw new Error(`Impossibile caricare places.geojson: ${response.status}`);
      return response.json();
    }),
    fetchCsv('data/maps_places.csv'),
    fetchCsv('data/maps.csv').then(rows => rows.map(row => ({...row, ...U.normalizeMapRow(row)})))
  ]).then(([people, peoplePlaces, placesGeo, mapsPlaces, maps]) => {
    state = indexData(people, peoplePlaces, placesGeo, mapsPlaces, maps);
    const requestedFamily = new URL(window.location.href).searchParams.get('family');
    const ranked = state.families
      .map(family => state.models.get(id(family.id)))
      .sort((a,b) => scoreModel(b) - scoreModel(a) || String(a.family.name).localeCompare(String(b.family.name),'it'));
    const draftFamily = ranked.find(model => normalizeWord(model.family.name) === 'bellucci');
    const initialModel = draftFamily || ranked[0];
    selectedFamilyId = state.models.has(id(requestedFamily)) ? id(requestedFamily) : id(initialModel?.family.id || state.families[0]?.id);
    const requestedCity = new URL(window.location.href).searchParams.get('city');
    const vignolaCity = state.cities.find(city => normalizeWord(city.name) === 'vignola');
    selectedCityId = state.cityModels.has(id(requestedCity)) ? id(requestedCity) : id((vignolaCity || state.cities[0])?.id);
    const requestedView = new URL(window.location.href).searchParams.get('view') || 'families';
    activateView(requestedView, false);
  }).catch(error => {
    console.error(error);
    main.innerHTML = `${pageHead()}<section class="gallery-error"><i class="bi bi-exclamation-triangle"></i><strong>Non è stato possibile costruire la galleria delle famiglie.</strong><span>${esc(error.message)}</span></section>`;
  });
})();
