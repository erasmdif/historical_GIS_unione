// dashboard.js

// === Config dei file CSV ===
const MAPS_CSV_URL = 'data/maps.csv';           // id,name,sigla,archivio,descrizione,georeferenced,cartiglio,anno,json
const MAP_TOPO_CSV_URL = 'data/maps_places.csv';// id_map,id_place
const PEOPLE_CSV_URL = 'data/people.csv';       // id,name,tipo_soggetto,varianti,descrizione
const PEOPLE_PLACES_CSV_URL = 'data/people_places.csv'; // id_place,id_people
const TOPONYMS_GEOJSON_URL = 'data/places.geojson';

// === Parser CSV semplice con virgolette ===
function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else field += ch;
    }
    i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return { headers: [], data: [] };
  const headers = rows[0].map(h => h.trim());
  const data = rows.slice(1)
    .filter(r => r.length && r.some(c => (c ?? '').toString().trim() !== ''))
    .map(r => {
      const o = {};
      headers.forEach((h, idx) => o[h] = r[idx] ?? '');
      return o;
    });
  return { headers, data };
}

// === normalize per match robusto (case + accenti) ===
function norm(s) {
  const str = (s ?? '').toString().trim().toLowerCase();
  return str.normalize ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : str;
}
function tokenize(q) {
  return norm(q).split(/\s+/).filter(Boolean);
}
function truthy(v){
  return v === true || v === 1 || v === '1' || (typeof v === 'string' && v.trim().toLowerCase() === 'true');
}

// === Percorsi immagine (logica "fixed" basata su sigla, con fallback estensioni) ===
const PREVIEW_EXTS = ['webp', 'jpg', 'jpeg', 'png'];
const FULL_EXTS    = ['jpg', 'jpeg', 'png', 'webp'];
const GEO_EXTS     = ['tif', 'tiff'];

function mapCode(rec){ return (rec.sigla || rec.code || rec.fid || '').toString().trim(); }

function candidatePaths(kind, code){
  if (!code) return [];
  const dir =
    kind === 'preview'      ? 'images/maps/preview/'      :
    kind === 'full'         ? 'images/maps/full_width/'   :
    kind === 'georeferenced'? 'images/maps/georeferenced/': null;
  if (!dir) return [];
  const exts =
    kind === 'preview'      ? PREVIEW_EXTS :
    kind === 'full'         ? FULL_EXTS    :
    /* geo */                 GEO_EXTS;
  return exts.map(ext => `${dir}${code}.${ext}`);
}

// path "primario" (comodo per uso diretto) — il fallback si applica a runtime
function resolvePreviewPath(mapRec){
  const list = candidatePaths('preview', mapCode(mapRec));
  return list[0] || '';
}
function resolveFullImagePath(mapRec){
  const list = candidatePaths('full', mapCode(mapRec));
  return list[0] || '';
}
// per il GeoTIFF ritorniamo l'array di candidati: chi lo consuma prova in sequenza
function resolveGeoCandidates(rec){
  if (!truthy(rec.georeferenced)) return [];
  return candidatePaths('georeferenced', mapCode(rec));
}
function resolveGeoUrl(rec){
  // retro-compat: primo candidato oppure stringa vuota se non georeferita
  const c = resolveGeoCandidates(rec);
  return c[0] || '';
}

// Applica onerror a cascata su una <img> per provare la lista di sorgenti
function attachImgFallback(imgEl, candidates, onFinalError){
  let idx = 0;
  if (!candidates.length) { if (onFinalError) onFinalError(); return; }
  imgEl.src = candidates[idx];
  imgEl.onerror = () => {
    idx += 1;
    if (idx < candidates.length) {
      imgEl.src = candidates[idx];
    } else {
      imgEl.onerror = null;
      if (onFinalError) onFinalError();
    }
  };
}

// tag validity: il campo json è considerato valido solo se non vuoto e JSON parseabile
function hasValidJsonTags(rawJson){
  const s = (rawJson || '').toString().trim();
  if (!s) return false;
  try {
    const parsed = JSON.parse(s);
    // accettiamo sia array che object non vuoti
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (parsed && typeof parsed === 'object') return Object.keys(parsed).length > 0;
    return false;
  } catch { return false; }
}

// Per la classificazione della sidebar basta che maps.csv contenga un payload
// nel campo json: non vuoto e non il valore letterale NULL.
function hasTagData(rawJson){
  const s = (rawJson || '').toString().trim();
  return !!s && s.toLowerCase() !== 'null';
}

function archiveKey(raw){ return (raw || 'altro').toString().trim() || 'altro'; }

// === Crea card DOM per una mappa ===
function createMapCard(mapRec, onFilterClick) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.fid = mapRec.fid;

  const media = document.createElement('div');
  media.className = 'card-media';

  const openDetail = () => {
    const params = new URLSearchParams({
      fid: mapRec.fid,
      name: mapRec.name || '',
      path: resolveFullImagePath(mapRec)
    });
    window.open(`static/html/tag_viewer/dettaglio.html?${params.toString()}`, '_blank');
  };

  const quick = document.createElement('div');
  quick.className = 'quick-actions';

  const btnTopDett = document.createElement('button');
  btnTopDett.className = 'btn ghost sm';
  btnTopDett.textContent = 'Dettaglio';
  btnTopDett.addEventListener('click', (ev) => { ev.stopPropagation(); openDetail(); });
  quick.appendChild(btnTopDett);

  const geoUrl = resolveGeoUrl(mapRec);
  if (geoUrl) {
    const btnTopGeo = document.createElement('button');
    btnTopGeo.className = 'btn map sm';
    btnTopGeo.textContent = 'Vedi in mappa';
    btnTopGeo.dataset.fid = mapRec.fid;
    btnTopGeo.addEventListener('click', (ev) => {
      ev.stopPropagation();
      window.dispatchEvent(new CustomEvent('maps:toggleGeoOverlay', {
        detail: { fid: mapRec.fid, url: geoUrl }
      }));
    });
    quick.appendChild(btnTopGeo);
  }
  media.appendChild(quick);

  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton';
  media.appendChild(skeleton);

  const previewPath = resolvePreviewPath(mapRec);
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.setAttribute('fetchpriority', 'low');
  img.alt = mapRec.name || mapRec.fid || 'mappa (preview)';
  img.src = previewPath;

  img.onerror = () => {
    media.innerHTML = `<div class="fallback">Anteprima non disponibile<br/><small>${mapRec.path}</small></div>`;
    const quick2 = quick.cloneNode(true);
    quick2.querySelectorAll('button').forEach(b => {
      const txt = (b.textContent || '').toLowerCase();
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (txt.includes('dettaglio')) openDetail();
        else window.dispatchEvent(new CustomEvent('maps:toggleGeoOverlay', {
          detail: { fid: mapRec.fid, url: geoUrl }
        }));
      });
    });
    media.appendChild(quick2);
  };

  img.onload = () => skeleton.remove();
  media.appendChild(img);

  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = mapRec.name || `Mappa #${mapRec.fid}`;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = mapRec.year ? `Anno: ${mapRec.year}` : 'Anno: n/d';

  body.appendChild(title);
  body.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const btnFilter = document.createElement('button');
  btnFilter.className = 'btn sm';
  btnFilter.textContent = 'Filtra';
  btnFilter.addEventListener('click', (ev) => { ev.stopPropagation(); onFilterClick(mapRec, card); });
  actions.appendChild(btnFilter);

  const btnDetail = document.createElement('button');
  btnDetail.className = 'btn sm primary';
  btnDetail.textContent = 'Dettaglio';
  btnDetail.addEventListener('click', (ev) => { ev.stopPropagation(); openDetail(); });
  actions.appendChild(btnDetail);

  if (geoUrl) {
    const btnGeo = document.createElement('button');
    btnGeo.className = 'btn sm map';
    btnGeo.textContent = 'Vedi in mappa';
    btnGeo.dataset.fid = mapRec.fid;
    btnGeo.addEventListener('click', (ev) => {
      ev.stopPropagation();
      window.dispatchEvent(new CustomEvent('maps:toggleGeoOverlay', {
        detail: { fid: mapRec.fid, url: geoUrl }
      }));
    });
    actions.appendChild(btnGeo);
  }

  card.appendChild(media);
  card.appendChild(body);
  card.appendChild(actions);

  card.addEventListener('click', () => onFilterClick(mapRec, card));
  return card;
}

(async function initDashboard() {
  const grid = document.getElementById('maps-grid');
  const input = document.getElementById('map-search');
  const clearBtn = document.getElementById('btn-clear');
  const activeFilterBar = document.getElementById('active-filter');
  const filterLabelSpan = document.getElementById('filter-label');
  const toolsHost = document.getElementById('maps-tools');
  const peekHost  = document.getElementById('maps-peek');
  const geoportaleRoot = document.getElementById('geoportale-catalog');


  // UI state
  let onlyGeo = false;

  // ✅ STATO SELEZIONE
  let currentActiveFid = null;
  let currentActiveEl = null;
  let currentActiveMode = null; // 'georeferenced' | 'tagged'

  const ARCHIVE_META = {
    CASTELNUOVO_GALLIANI: { label: 'Castelnuovo Galliani', icon: 'journal-richtext' },
    VIGNOLA: { label: 'Vignola', icon: 'water' },
    ZOCCA: { label: 'Zocca', icon: 'map' },
    GUIGLIA: { label: 'Guiglia', icon: 'map' },
    ACQ: { label: 'ACQ', icon: 'droplet' },
    CANC: { label: 'CANC', icon: 'bounding-box' },
    GM: { label: 'GM', icon: 'pin-map' },
    SPILAMBERTO: { label: 'Spilamberto', icon: 'geo-alt' },
    altro: { label: 'Altro', icon: 'layers' }
  };
  const ARCHIVE_ORDER = ['CASTELNUOVO_GALLIANI','VIGNOLA','ZOCCA','GUIGLIA','ACQ','CANC','GM','SPILAMBERTO','altro'];

  const geoportaleGroups = [
    {
      title: 'Overlay WMS remoti del Geoportale',
      kind: 'wms',
      items: [
        {
          key: 'geoportale-csr1853',
          label: 'Carta Storica Regionale 1:50.000',
          note: 'WMS ufficiale · CC BY 4.0',
          mode: 'wms',
          serviceUrl: 'https://servizigis.regione.emilia-romagna.it/wms/carta_storica_regionale_1853',
          layers: 'carta_storica_regionale_1853',
          opacity: 0.74,
          url: 'https://geoportale.regione.emilia-romagna.it/servizi/servizi-ogc/elenco-capabilities-dei-servizi-wms/cartografia-di-base/service-25'
        },
        {
          key: 'geoportale-volo-gai-1954',
          label: 'Foto Aeree del volo IGMI GAI 1954-1955',
          note: 'WMS regionale · CC BY 4.0',
          mode: 'wms',
          serviceUrl: 'https://servizigis.regione.emilia-romagna.it/wms/VoloGAI1954',
          layers: 'VoloGAI1954',
          opacity: 0.82,
          url: 'https://geodati.gov.it/resource/id/r_emiro%3A2025-09-01T181629'
        }
      ]
    },
    {
      title: 'Raccolte applicative del Geoportale',
      kind: 'apps',
      items: [
        { label: 'Carte storiche in Emilia-Romagna dal 1580 al 1852', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/carte-storiche-in-emilia-romagna-dal-1580-al-1852', note: 'Applicazione regionale · nessun WMS pubblico verificato in questa pagina' },
        { label: 'Carte storiche in Emilia-Romagna dal 1853 al 1895', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/carte-storiche-in-emilia-romagna-dal-1853-al-1895', note: 'Applicazione regionale · nessun WMS pubblico verificato in questa pagina' },
        { label: 'Foto della Royal Air Force in Emilia-Romagna (1943-1944)', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/foto-della-royal-air-force-in-emilia-romagna-1943-1944', note: 'Applicazione regionale · endpoint WMS non ancora verificato con certezza per il lotto completo' },
        { label: 'Foto IBC da elicottero', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/foto-ibc-istituto-beni-culturali-da-elicottero', note: 'Applicazione regionale · endpoint WMS non verificato' },
        { label: 'Volo IGM 1931-1937', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/volo-igm-1931-1937', note: 'Applicazione regionale · endpoint WMS non verificato' },
        { label: 'Foto Aeree del volo IGMI GAI 1954-1955', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/foto-aeree-del-volo-igmi-gai-1954-1955', note: 'Applicazione regionale · overlay WMS disponibile nella sezione sopra' },
        { label: 'Catasti Storici in Emilia-Romagna', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/catasti-storici-in-emilia-romagna', note: 'Applicazione regionale · utile come indice ai singoli catasti storici' },
        { label: 'Catasto Ducale di Piacenza', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/catasto-ducale-di-piacenza', note: 'Applicazione regionale' },
        { label: 'Catasto Ducale di Parma', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/catasto-ducale-di-parma', note: 'Applicazione regionale' },
        { label: 'Catasto storico terreni di Reggio Emilia', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/catasto-storico-terreni-di-reggio-emilia', note: 'Applicazione regionale' },
        { label: 'Catasto storico terreni di Modena', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/catasto-storico-terreni-di-modena', note: 'Applicazione regionale' },
        { label: 'Catasto Napoleonico Pontificio di Bologna', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/catasto-napoleonico-pontificio-di-bologna', note: 'Applicazione regionale' },
        { label: 'Catasto Pontificio di Ferrara', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/catasto-pontificio-di-ferrara', note: 'Applicazione regionale' },
        { label: 'Catasto storico terreni di Ravenna', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/catasto-storico-terreni-di-ravenna', note: 'Applicazione regionale' },
        { label: 'Catasto storico di Forlì - Cesena e Rimini', url: 'https://geoportale.regione.emilia-romagna.it/applicazioni-gis/regione-emilia-romagna/cartografia-di-base/cartografia-storica/catasto-storico-di-forli-cesena-e-rimini', note: 'Applicazione regionale' }
      ]
    }
  ];

  // Modale Comuni
  const btnToponyms = document.getElementById('btn-toponyms');
  const modal = document.getElementById('toponyms-modal');
  const modalBody = document.getElementById('toponyms-body');
  const modalClose = document.getElementById('toponyms-close');

  // Carica dati principali
  const [mapsText, mapTopoText, peopleText, peoplePlacesText, placesJson] = await Promise.all([
    fetch(MAPS_CSV_URL).then(r => r.text()),
    fetch(MAP_TOPO_CSV_URL).then(r => r.text()),
    fetch(PEOPLE_CSV_URL).then(r => r.text()).catch(() => ''),
    fetch(PEOPLE_PLACES_CSV_URL).then(r => r.text()).catch(() => ''),
    fetch(TOPONYMS_GEOJSON_URL, { cache:'no-cache' }).then(r => r.json()).catch(() => ({ features: [] }))
  ]);

  const mapsCsv        = parseCSV(mapsText);
  const mapTopoCsv     = parseCSV(mapTopoText);
  const peopleCsv      = parseCSV(peopleText);
  const peoplePlacesCsv= parseCSV(peoplePlacesText);

  // Indici people
  const peopleById = new Map();
  peopleCsv.data.forEach(r => {
    const id = String(r.id || '').trim();
    if (!id) return;
    peopleById.set(id, {
      id,
      name: (r.name || '').trim(),
      tipo: (r.tipo_soggetto || '').trim(),
      varianti: (r.varianti || '').trim(),
      descrizione: (r.descrizione || '').trim(),
      parent_id: String(r.parent_id || r.parent || r.id_parent || '').trim()
    });
  });
  // fid_place -> [ id_people ]
  const peopleByPlaceId = new Map();
  peoplePlacesCsv.data.forEach(r => {
    // il CSV può avere un BOM sulla prima colonna (id_place)
    const idPlace  = String(r.id_place  || r['\ufeffid_place']  || '').trim();
    const idPerson = String(r.id_people || r['\ufeffid_people'] || '').trim();
    if (!idPlace || !idPerson) return;
    if (!peopleByPlaceId.has(idPlace)) peopleByPlaceId.set(idPlace, []);
    peopleByPlaceId.get(idPlace).push(idPerson);
  });

  // Indici places (fid -> feature) per lookup parent/geometrie/proprietà
  const placesById = new Map();
  (placesJson.features || []).forEach(f => {
    const p = f.properties || {};
    const fid = String(p.fid ?? p.id ?? '').trim();
    if (fid) placesById.set(fid, f);
  });

  const placeNameById = new Map();
  placesById.forEach((f, fid) => {
    const p = f.properties || {};
    const name = (p.name || p.as || '').toString().trim();
    if (name) placeNameById.set(fid, name);
  });

  // Espongo un piccolo namespace condiviso per app.js
  window.WEBGIS_DATA = {
    placesById,
    peopleById,
    peopleByPlaceId
  };

  const maps = mapsCsv.data.map(r => {
    const id = String(r.id || r.fid || '').trim();
    const sigla = (r.sigla || r.code || '').trim();
    const json = r.json || '';
    return {
      fid: id,
      sigla,
      name: (r.name || sigla || (id ? `Mappa #${id}` : '')).trim(),
      archivio: archiveKey(r.archivio || r.categoria || 'altro'),
      // path e preview NON più letti dal CSV: derivati dalla sigla
      path: resolveFullImagePath({ sigla }),
      preview: resolvePreviewPath({ sigla }),
      georeferenced: (r.georeferenced || '').trim(),
      tagged: hasTagData(json) ? 'true' : '',
      descrizione: (r.descrizione || '').trim(),
      cartiglio: (r.cartiglio || '').trim(),
      json: (json || '').trim(),
      year: (r.anno || r.year || '').trim()
    };
  }).filter(m => m.fid);

  // NUOVA LOGICA: maps.csv contiene SOLO mappe georeferite e/o taggate,
  // quindi tutte vanno mostrate in sidebar (niente filtro visibleMaps).
  const visibleMaps = maps.filter(m => resolveGeoCandidates(m).length || hasTagData(m.json));
  const mapsById = new Map(maps.map(m => [String(m.fid), m]));

  // Dizionari fid_map -> Set(fid_place) : tutti / solo poligonali / solo puntiformi
  // + indice testuale: fid_map -> string per ricerca "mappa o comune"
  const topoByMap        = new Map(); // filtro punti per sidebar "Filtra"
  const polyByMap        = new Map(); // poligoni per study-mode
  const pointsByMap      = new Map(); // punti (per infobox/legenda in study-mode se serve)
  const topoSearchByMap  = new Map();
  const placeToMaps      = new Map();
  const mapToPlaces      = new Map();

  mapTopoCsv.data.forEach(r => {
    const mId = String(r.id_map || r.fid_map || '').trim();
    const tId = String(r.id_place || r.fid_toponimo || '').trim();
    if (!mId) return;

    if (tId) {
      if (!placeToMaps.has(tId)) placeToMaps.set(tId, new Set());
      placeToMaps.get(tId).add(mId);
      if (!mapToPlaces.has(mId)) mapToPlaces.set(mId, new Set());
      mapToPlaces.get(mId).add(tId);
      // punti (retro-compat: la sidebar "Filtra" filtra i marker puntiformi)
      const f = placesById.get(tId);
      const gtype = f?.geometry?.type;
      if (gtype === 'Point') {
        if (!topoByMap.has(mId)) topoByMap.set(mId, new Set());
        topoByMap.get(mId).add(tId);
        if (!pointsByMap.has(mId)) pointsByMap.set(mId, new Set());
        pointsByMap.get(mId).add(tId);
      } else if (gtype === 'Polygon' || gtype === 'MultiPolygon') {
        if (!polyByMap.has(mId)) polyByMap.set(mId, new Set());
        polyByMap.get(mId).add(tId);
      }
      // record senza geometria (es. parent) non entrano in nessuno dei set
    }

    const topoName = (placeNameById.get(tId) || '').trim();
    const chunk = topoName;
    if (!chunk) return;

    const prev = topoSearchByMap.get(mId) || '';
    topoSearchByMap.set(mId, (prev ? (prev + ' | ') : '') + norm(chunk));
  });

  Object.assign(window.WEBGIS_DATA, { mapsById, placeToMaps, mapToPlaces });

  function labelForArchive(key){
    return (ARCHIVE_META[key] && ARCHIVE_META[key].label) || key || 'Altro';
  }
  function iconForArchive(key){
    return (ARCHIVE_META[key] && ARCHIVE_META[key].icon) || 'collection';
  }
  function naturalName(a,b){
    return String(a || '').localeCompare(String(b || ''), 'it', { numeric: true, sensitivity: 'base' });
  }
  function sortMaps(list){
    return list.slice().sort((a,b) => {
      const ay = Number(a.year), by = Number(b.year);
      if (Number.isFinite(ay) && Number.isFinite(by) && ay !== by) return ay - by;
      if (Number.isFinite(ay) && !Number.isFinite(by)) return -1;
      if (!Number.isFinite(ay) && Number.isFinite(by)) return 1;
      return naturalName(a.name || a.fid, b.name || b.fid);
    });
  }
  // "Tagged" dipende dalla presenza del campo json in maps.csv.
  function hasTagPage(mapRec){
    return hasTagData(mapRec?.json);
  }

  function mapContextMode(mapRec, requestedMode = ''){
    if (requestedMode === 'tagged' && hasTagPage(mapRec)) return 'tagged';
    if (requestedMode === 'georeferenced' && resolveGeoUrl(mapRec)) return 'georeferenced';
    if (hasTagPage(mapRec)) return 'tagged';
    if (resolveGeoUrl(mapRec)) return 'georeferenced';
    return '';
  }

  function findRenderedMapRow(fid, mode){
    return Array.from(grid.querySelectorAll('.map-row')).find(el =>
      String(el.dataset.fid) === String(fid) && el.dataset.mapMode === mode
    ) || null;
  }

  function scrollPeekToTop(){
    if (!peekHost || peekHost.hidden) return;
    const scroller = peekHost.closest('.sb-content');
    requestAnimationFrame(() => {
      if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
      else peekHost.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  // Costruisce il payload dell'evento "maps:studyMap" per app.js.
  // Include: candidati GeoTIFF, poligoni collegati, mapping people per luogo,
  // descrizione, cartiglio, nome mappa.
  function buildStudyDetail(mapRec){
    const fidMap = String(mapRec.fid);
    const geoCandidates = resolveGeoCandidates(mapRec);
    const polyFids = Array.from(polyByMap.get(fidMap) || []);
    const pointFids = Array.from(pointsByMap.get(fidMap) || []);

    // people: per ogni luogo collegato (poly), cerchiamo i soggetti
    const peopleByPlace = {};
    [...polyFids, ...pointFids].forEach(pid => {
      const arr = peopleByPlaceId.get(pid) || [];
      if (!arr.length) return;
      peopleByPlace[pid] = arr.map(id => peopleById.get(id) || { id, name: `#${id}` });
    });

    return {
      fid: fidMap,
      sigla: mapRec.sigla,
      name: mapRec.name,
      archivio: mapRec.archivio,
      year: mapRec.year,
      descrizione: mapRec.descrizione,
      cartiglio: mapRec.cartiglio,
      geoCandidates,          // lista di URL raster (estensioni fallback)
      geoUrl: geoCandidates[0] || '', // retro-compat
      polygonFids: polyFids,  // fid dei poligoni da mostrare
      pointFids,              // fid dei punti collegati (opzionale)
      peopleByPlace           // { fidPlace: [ {id,name,tipo,varianti,descrizione}, ... ] }
    };
  }

  function renderGeoportaleCatalog(){
    if (!geoportaleRoot) return;
    geoportaleRoot.innerHTML = `
      <div class="geoportal-head">
        <h3>Geoportale Emilia-Romagna</h3>
        <p>Le raccolte regionali sono tenute separate dai tuoi archivi. Gli overlay WMS qui presenti restano remoti e vengono richiamati direttamente dai servizi della Regione; le raccolte senza endpoint verificato restano invece come rimando esterno.</p>
      </div>
      ${geoportaleGroups.map(group => `
        <details class="geoportal-group">
          <summary>
            <div class="group-summary-left"><span class="group-summary-icon"><i class="bi bi-broadcast"></i></span><span>${group.title}</span></div>
            <span class="group-summary-badge">${group.items.length}</span>
          </summary>
          <div class="group-body">
            ${group.items.map(item => `
              <div class="geoportal-item">
                <div>
                  <div class="geoportal-item__title">${item.label}</div>
                  <div class="geoportal-item__meta">${item.note || ''}</div>
                </div>
                <div class="geoportal-actions">
                  ${item.mode === 'wms' ? `<button class="btn sm map" type="button" data-fid="${item.key}" data-role="remote-wms" title="Attiva overlay"><i class="bi bi-layers"></i></button>` : ''}
                  <a class="btn sm ghost" href="${item.url}" target="_blank" rel="noopener" title="Apri scheda regionale"><i class="bi bi-box-arrow-up-right"></i></a>
                </div>
              </div>
            `).join('')}
          </div>
        </details>
      `).join('')}
    `;

    geoportaleRoot.querySelectorAll('[data-role="remote-wms"]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const item = geoportaleGroups.flatMap(g => g.items).find(x => x.key === btn.dataset.fid);
        if (!item) return;
        window.dispatchEvent(new CustomEvent('maps:toggleRemoteWms', { detail: item }));
      });
    });
  }

  function renderPeek(mapRec, requestedMode = ''){
    if (!peekHost) return;
    if (!mapRec){
      peekHost.hidden = true;
      peekHost.innerHTML = '';
      return;
    }

    const previewCandidates = candidatePaths('preview', mapCode(mapRec));
    const geoUrl = resolveGeoUrl(mapRec);
    const canTag = hasTagPage(mapRec);
    const contextMode = mapContextMode(mapRec, requestedMode);
    const showGeoAction = contextMode === 'georeferenced' && !!geoUrl;
    const showTagAction = contextMode === 'tagged' && canTag;
    const contextLabel = contextMode === 'tagged' ? 'Mappa taggata' : 'Mappa georeferenziata';
    const contextIcon = contextMode === 'tagged' ? 'pin-map' : 'layers';

    peekHost.hidden = false;
    peekHost.innerHTML = `
      <div class="mappeek-inner">
        <div class="mappeek-media"><img alt="${(mapRec.name||'mappa').replace(/"/g,'&quot;')}" loading="lazy" decoding="async"></div>
        <div class="mappeek-meta">
          <div>
            <div class="mappeek-sub">${labelForArchive(mapRec.archivio)}</div>
            <div class="mappeek-title">${mapRec.name || `Mappa #${mapRec.fid}`}</div>
            <div class="mappeek-sub mappeek-context"><i class="bi bi-${contextIcon}"></i> ${contextLabel}${mapRec.year ? ` · ${mapRec.year}` : ''}</div>
          </div>
          <div class="mappeek-actions">
            <button class="btn sm" id="peek-filter" title="Filtra i toponimi della mappa"><i class="bi bi-funnel"></i></button>
            ${showGeoAction ? `<button class="btn sm map" id="peek-geo" data-fid="${mapRec.fid}" title="Apri la mappa georeferenziata"><i class="bi bi-layers"></i></button>` : ''}
            ${showTagAction ? `<button class="btn sm primary" id="peek-detail" title="Apri la mappa taggata"><i class="bi bi-pin-map"></i></button>` : ''}
          </div>
        </div>
      </div>
    `;

    const peekImg = peekHost.querySelector('.mappeek-media img');
    if (peekImg) {
      attachImgFallback(peekImg, previewCandidates, () => {
        const media = peekHost.querySelector('.mappeek-media');
        if (media) media.innerHTML = '<div class="thumb-fallback">n/d</div>';
      });
    }

    const openDetail = () => {
      const params = new URLSearchParams({ fid: mapRec.fid, name: mapRec.name || '', path: resolveFullImagePath(mapRec) });
      window.open(`static/html/tag_viewer/dettaglio.html?${params.toString()}`, '_blank');
    };

    peekHost.querySelector('#peek-filter')?.addEventListener('click', () => {
      const el = (currentActiveFid === mapRec.fid && currentActiveMode === contextMode)
        ? currentActiveEl
        : findRenderedMapRow(mapRec.fid, contextMode);
      if (el) applyFilterFor(mapRec, el, contextMode);
    });
    peekHost.querySelector('#peek-detail')?.addEventListener('click', openDetail);
    peekHost.querySelector('#peek-geo')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('maps:studyMap', { detail: buildStudyDetail(mapRec) }));
    });
  }

  function createMapRow(mapRec, onFilterClick, requestedMode = ''){
    const row = document.createElement('div');
    row.className = 'map-row';
    row.dataset.fid = mapRec.fid;

    const previewCandidates = candidatePaths('preview', mapCode(mapRec));
    const geoUrl = resolveGeoUrl(mapRec);
    const canTag = hasTagPage(mapRec);
    const contextMode = mapContextMode(mapRec, requestedMode);
    const isGeoContext = contextMode === 'georeferenced';
    const isTagContext = contextMode === 'tagged';
    row.dataset.mapMode = contextMode;

    row.innerHTML = `
      <div class="map-thumb"><img alt="" loading="lazy" decoding="async"></div>
      <div class="map-info">
        <div class="map-overline">${labelForArchive(mapRec.archivio)}</div>
        <div class="map-name" title="${(mapRec.name||'').replace(/"/g,'&quot;')}">${mapRec.name || `Mappa #${mapRec.fid}`}</div>
        <div class="map-meta-line">${mapRec.year ? `<span>${mapRec.year}</span>` : `<span>Senza data</span>`}${topoSearchByMap.get(mapRec.fid) ? '<span>Toponimi associati</span>' : ''}</div>
      </div>
      <div class="map-mini-actions">
        <button class="btn sm filter-btn" title="Filtra"><i class="bi bi-funnel"></i></button>
        ${isGeoContext && geoUrl ? `<button class="btn sm map" data-fid="${mapRec.fid}" data-mini="1" title="Apri la mappa georeferenziata"><i class="bi bi-layers"></i></button>` : ''}
        ${isTagContext && canTag ? `<button class="btn sm primary" title="Apri la mappa taggata"><i class="bi bi-pin-map"></i></button>` : ''}
      </div>
    `;

    const thumbImg = row.querySelector('.map-thumb img');
    attachImgFallback(thumbImg, previewCandidates, () => {
      const thumb = row.querySelector('.map-thumb');
      if (thumb) thumb.innerHTML = '<div class="thumb-fallback">n/d</div>';
    });

    const openDetail = () => {
      const params = new URLSearchParams({ fid: mapRec.fid, name: mapRec.name || '', path: resolveFullImagePath(mapRec) });
      window.open(`static/html/tag_viewer/dettaglio.html?${params.toString()}`, '_blank');
    };

    const btnFilter = row.querySelector('.filter-btn');
    const btnGeo = row.querySelector('.btn.map');
    const btnDetail = row.querySelector('.btn.primary');

    btnFilter?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onFilterClick(mapRec, row, contextMode);
    });
    btnGeo?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      window.dispatchEvent(new CustomEvent('maps:studyMap', { detail: buildStudyDetail(mapRec) }));
    });
    btnDetail?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openDetail();
    });

    row.addEventListener('mouseenter', () => renderPeek(mapRec, contextMode));
    row.addEventListener('focusin', () => renderPeek(mapRec, contextMode));
    row.addEventListener('click', () => onFilterClick(mapRec, row, contextMode));
    return row;
  }

  function applyFilterFor(mapRec, el, requestedMode = '') {
    const contextMode = mapContextMode(mapRec, requestedMode);
    const set = topoByMap.get(mapRec.fid) || new Set();
    const isSame = currentActiveFid &&
      String(currentActiveFid) === String(mapRec.fid) &&
      currentActiveMode === contextMode;

    if (isSame) {
      window.dispatchEvent(new CustomEvent('toponyms:clearFilter'));
      if (currentActiveEl) currentActiveEl.classList.remove('active');
      currentActiveFid = null;
      currentActiveEl = null;
      currentActiveMode = null;
      activeFilterBar.hidden = true;
      filterLabelSpan.textContent = '';
      return;
    }

    if (currentActiveEl) currentActiveEl.classList.remove('active');
    currentActiveFid = mapRec.fid;
    currentActiveEl = el;
    currentActiveMode = contextMode;
    currentActiveEl.classList.add('active');

    window.dispatchEvent(new CustomEvent('toponyms:setFilterByFids', { detail: { ids: Array.from(set) } }));

    activeFilterBar.hidden = false;
    filterLabelSpan.textContent = mapRec.name || `Mappa #${mapRec.fid}`;
    renderPeek(mapRec, contextMode);
    scrollPeekToTop();
  }

  function mountTools(){
    if (!toolsHost) return;
    toolsHost.innerHTML = `
      <label class="tool-check" title="Mostra solo le mappe georeferenziate"><input id="only-geo" type="checkbox"> Solo georeferenziate</label>
    `;
    toolsHost.querySelector('#only-geo')?.addEventListener('change', (e) => {
      onlyGeo = !!e.target.checked;
      renderList(input.value);
    });
  }

  function renderList(filterTerm = '') {
    grid.innerHTML = '';
    grid.classList.add('is-list');
    const tokens = tokenize(filterTerm);

    let filtered = visibleMaps.filter(m => {
      if (onlyGeo && !resolveGeoUrl(m)) return false;
      if (!tokens.length) return true;
      const hay = [norm(m.name || ''), norm(m.year || ''), norm(labelForArchive(m.archivio)), topoSearchByMap.get(m.fid) || ''].join(' ');
      return tokens.every(t => hay.includes(t));
    });

    const grouped = new Map();
    filtered.forEach(m => {
      const key = m.archivio || 'altro';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(m);
    });

    function appendRows(host, mapsForSection, mode){
      mapsForSection.forEach(m => {
        const el = createMapRow(m, applyFilterFor, mode);
        if (currentActiveFid &&
            String(currentActiveFid) === String(m.fid) &&
            currentActiveMode === mode) {
          el.classList.add('active');
          currentActiveEl = el;
        }
        host.appendChild(el);
      });
    }

    function appendKindSection(host, mapsForSection, mode){
      const isTagged = mode === 'tagged';
      const section = document.createElement('details');
      section.className = `map-kind-section is-${mode}`;
      section.open = true;
      section.innerHTML = `
        <summary class="map-kind-heading">
          <span class="map-kind-branch" aria-hidden="true"></span>
          <span class="map-kind-toggle" aria-hidden="true"><i class="bi bi-chevron-right"></i></span>
          <span class="map-kind-icon"><i class="bi bi-${isTagged ? 'pin-map' : 'layers'}"></i></span>
          <span class="map-kind-label">${isTagged ? 'Taggate' : 'Georeferenziate'}</span>
          <span class="map-kind-count">${mapsForSection.length}</span>
        </summary>
        <div class="map-kind-list"></div>
      `;
      appendRows(section.querySelector('.map-kind-list'), mapsForSection, mode);
      host.appendChild(section);
    }

    let rendered = 0;
    const orderedKeys = ARCHIVE_ORDER
      .filter(k => grouped.has(k))
      .concat(Array.from(grouped.keys()).filter(k => !ARCHIVE_ORDER.includes(k)).sort((a,b) => labelForArchive(a).localeCompare(labelForArchive(b), 'it')));

    orderedKeys.forEach(key => {
      const items = sortMaps(grouped.get(key));
      if (!items.length) return;
      rendered += items.length;

      const geoItems = items.filter(m => !!resolveGeoUrl(m));
      const taggedItems = onlyGeo ? [] : items.filter(m => hasTagPage(m));
      const showSubsections = geoItems.length > 0 && taggedItems.length > 0;

      const det = document.createElement('details');
      det.className = 'local-group';
      det.open = false;
      det.innerHTML = `
        <summary>
          <div class="group-summary-left"><span class="group-summary-icon"><i class="bi bi-${iconForArchive(key)}"></i></span><span>${labelForArchive(key)}</span></div>
          <span class="group-summary-badge">${items.length}</span>
        </summary>
        <div class="group-body"></div>
      `;
      const body = det.querySelector('.group-body');

      if (showSubsections) {
        appendKindSection(body, geoItems, 'georeferenced');
        appendKindSection(body, taggedItems, 'tagged');
      } else if (geoItems.length) {
        appendRows(body, geoItems, 'georeferenced');
      } else if (taggedItems.length) {
        appendRows(body, taggedItems, 'tagged');
      }

      grid.appendChild(det);
    });

    if (!rendered) {
      grid.innerHTML = '<div class="empty-state">Nessuna mappa corrisponde ai criteri attuali.</div>';
    }
  }

  mountTools();
  renderGeoportaleCatalog();
  renderList();
  renderPeek(null);

  const pageParams = new URLSearchParams(window.location.search);
  const overlayFid = (pageParams.get('overlay') || '').trim();
  if (overlayFid) {
    const targetMap = visibleMaps.find(m => String(m.fid) === String(overlayFid));
    if (targetMap) {
      renderPeek(targetMap, resolveGeoUrl(targetMap) ? 'georeferenced' : 'tagged');
      if (resolveGeoUrl(targetMap)) {
        window.dispatchEvent(new CustomEvent('maps:studyMap', { detail: buildStudyDetail(targetMap) }));
      }
    }
  }

  input?.addEventListener('input', () => renderList(input.value));

  clearBtn?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('toponyms:clearFilter'));
    // Chiude anche eventuale study-mode (overlay + poligoni + pannello laterale)
    window.dispatchEvent(new CustomEvent('maps:studyMap:close'));
    if (currentActiveEl) currentActiveEl.classList.remove('active');
    currentActiveFid = null;
    currentActiveEl = null;
    currentActiveMode = null;
    renderPeek(null);
    activeFilterBar.hidden = true;
    filterLabelSpan.textContent = '';
    input.value = '';
    renderList('');
  });

  window.addEventListener('maps:geoOverlayChanged', (e) => {
    const activeFid = e.detail?.activeFid || null;
    document.querySelectorAll('.btn.map').forEach(btn => {
      const isActive = (String(btn.dataset.fid) === String(activeFid));
      btn.classList.toggle('active', isActive);
      if (btn.dataset.mini === '1') {
        btn.innerHTML = isActive ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-layers"></i>';
      }
    });
  });
  // ======================================================================
  // MODALE “COMUNI” / “REGIONI STORICHE”
  // ======================================================================
  let toponymsCache = null;

  // Stato UI modale
  let modalMode = 'comuni'; // 'comuni' | 'storiche'
  let modalInited = false;

  // refs UI create-once
  let elModeComuni = null;
  let elModeStoriche = null;
  let elModalSearch = null;
  let elSuggest = null;
  let elCount = null;
  let elLegend = null;
  let elList = null;
  let elTerritoryMap = null;
  let elTerritoryList = null;
  let elTerritoryStatus = null;
  let territoryMap = null;
  let territoryLayers = [];
  let territoryCache = { current: null, historical: null };
  const territoryFilter = { region: '', province: '', historical: '' };

  function openModal() { if (modal) modal.hidden = false; }
  function closeModal() { if (modal) modal.hidden = true; }

  modalClose?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  window.addEventListener('keydown', (e) => { if (modal && !modal.hidden && e.key === 'Escape') closeModal(); });

  function classifyPlace(place) {
    const p = String(place || '').trim().toLowerCase();
    if (p === 'city') return 'place-city';
    if (p === 'village' || p === 'hamlet') return 'place-village';
    if (p === 'quarter' || p === 'isolated_dwelling' || p === 'locality') return 'place-small';
    return 'place-other';
  }

  function iconFileByDimensions(dim) {
    try {
      const d = Number(dim);
      // ICON_BY_DIM viene da app.js (binding globale), qui la riusiamo senza ridefinirla
      if (typeof ICON_BY_DIM === 'object' && ICON_BY_DIM) {
        return ICON_BY_DIM[d] || ICON_BY_DIM[3];
      }
    } catch {}
    return 'medium.png';
  }

  function colorForString(str) {
    let h = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    return `hsl(${hue} 65% 55%)`;
  }

  function featureLatLngFromTopo(f) {
    if (!f?.geometry || f.geometry.type !== 'Point') return null;
    const c = f.geometry.coordinates;
    if (!Array.isArray(c) || c.length < 2) return null;
    const [lon, lat] = c;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return [lat, lon];
  }


  function topoEscape(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function propFirst(props, keys) {
    for (const k of keys) {
      const v = props?.[k];
      if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
    }
    return '';
  }

  function territoryNormName(v) {
    return String(v || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/provincia\s+di\s+/g, '')
      .replace(/citta\s+metropolitana\s+di\s+/g, '')
      .replace(/regione\s+/g, '')
      .replace(/[-_']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function mapGetByNorm(map, name) {
    if (!map) return 0;
    if (map.has(name)) return map.get(name) || 0;
    const n = territoryNormName(name);
    for (const [k, v] of map.entries()) {
      const nk = territoryNormName(k);
      if (nk === n || nk.includes(n) || n.includes(nk)) return v || 0;
    }
    return 0;
  }
  function nameMatchesByNorm(a, b) {
    const na = territoryNormName(a);
    const nb = territoryNormName(b);
    return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
  }

  async function fetchOptionalGeoJSON(url) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      const json = await res.json();
      return (json && Array.isArray(json.features)) ? json : null;
    } catch {
      return null;
    }
  }

  async function loadTerritories(mode) {
    if (mode === 'storiche') {
      if (territoryCache.historical !== null) return territoryCache.historical;
      territoryCache.historical = await fetchOptionalGeoJSON('data/historical.geojson');
      return territoryCache.historical;
    }
    if (territoryCache.current !== null) return territoryCache.current;
    const regions = await fetchOptionalGeoJSON('data/regions.geojson');
    const provinces = await fetchOptionalGeoJSON('data/provinces.geojson');
    territoryCache.current = { regions, provinces };
    return territoryCache.current;
  }

  function clearTerritoryMapLayers() {
    if (!territoryMap) return;
    territoryLayers.forEach(layer => { try { territoryMap.removeLayer(layer); } catch {} });
    territoryLayers = [];
  }

  function ensureTerritoryMap() {
    if (!elTerritoryMap || territoryMap) return territoryMap;
    territoryMap = L.map(elTerritoryMap, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false,
      tap: true
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: ''
    }).addTo(territoryMap);
    territoryMap.setView([44.5, 10.9], 7);
    setTimeout(() => territoryMap?.invalidateSize(), 80);
    return territoryMap;
  }

  function territoryNameFromFeature(feature, mode, level) {
    const p = feature?.properties || {};
    if (mode === 'storiche') {
      return propFirst(p, ['name', 'nome', 'denominazione', 'historical_province', 'historicalProvince', 'area', 'label', 'NAME']);
    }
    if (level === 'province') {
      return propFirst(p, ['den_prov', 'DEN_PROV', 'den_uts', 'DEN_UTS', 'prov_name', 'PROV_NAME', 'nome_provincia', 'NOME_PROVINCIA', 'province', 'Province', 'provincia', 'Provincia', 'Name', 'name', 'NAME', 'nome', 'NOME', 'denominazione', 'sigla', 'SIGLA']);
    }
    return propFirst(p, ['den_reg', 'DEN_REG', 'region', 'Region', 'regione', 'Regione', 'Name', 'name', 'NAME', 'nome', 'NOME', 'denominazione']);
  }
  function territoryRegionFromFeature(feature){
    const p = feature?.properties || {};
    return propFirst(p, ['regione', 'Regione', 'REGIONE', 'den_reg', 'DEN_REG', 'region', 'Region', 'nome_regione', 'NOME_REGIONE']);
  }

  function countBy(items, keyFn) {
    const out = new Map();
    items.forEach(it => {
      const key = keyFn(it) || '—';
      out.set(key, (out.get(key) || 0) + 1);
    });
    return out;
  }

  function sortedCountEntries(map) {
    return Array.from(map.entries()).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'));
  }

  function summarizeToponyms(items) {
    const regions = countBy(items, it => it.region || '—');
    const provinces = countBy(items, it => it.province || '—');
    const historical = countBy(items, it => (it.historicalProvince || '').trim() || 'Da assegnare');
    return { regions, provinces, historical };
  }

  function heatRatio(count, max) {
    if (!max || max <= 0) return 0.08;
    return Math.max(0.08, Math.min(1, count / max));
  }

  function heatColor(count, max, active = false) {
    const r = heatRatio(count, max);
    const hue = 205;
    const sat = active ? 56 : 34;
    const light = active ? Math.round(58 - r * 8) : Math.round(92 - r * 12);
    return `hsl(${hue} ${sat}% ${light}%)`;
  }

  function renderTerritoryFallback(items) {
    if (!elTerritoryList) return;
    const summary = summarizeToponyms(items);

    if (modalMode === 'storiche') {
      const entries = sortedCountEntries(summary.historical);
      const max = Math.max(1, ...entries.map(([, count]) => count));
      elTerritoryList.innerHTML = `
        <div class="territory-chip-section">
          <div>Aree storiche</div>
          ${entries.map(([name, count]) => `
            <button type="button"
              class="territory-chip territory-heat ${territoryFilter.historical === name ? 'is-active' : ''}"
              style="--heat:${heatRatio(count,max)};--heat-color:${heatColor(count,max, territoryFilter.historical === name)}"
              data-territory-kind="historical"
              data-territory-name="${topoEscape(name)}">
              <span>${topoEscape(name)}</span><strong>${count}</strong>
            </button>`).join('')}
        </div>`;
      return;
    }

    if (!territoryFilter.region) {
      const regionEntries = sortedCountEntries(summary.regions);
      const max = Math.max(1, ...regionEntries.map(([, count]) => count));
      elTerritoryList.innerHTML = `
        <div class="territory-chip-section">
          <div>Regioni</div>
          ${regionEntries.map(([name, count]) => `
            <button type="button"
              class="territory-chip territory-heat"
              style="--heat:${heatRatio(count,max)};--heat-color:${heatColor(count,max)}"
              data-territory-kind="region"
              data-territory-name="${topoEscape(name)}">
              <span>${topoEscape(name)}</span><strong>${count}</strong>
            </button>`).join('')}
        </div>`;
      return;
    }

    const provinceItems = items.filter(it => (it.region || '—') === territoryFilter.region);
    const provinceEntries = sortedCountEntries(countBy(provinceItems, it => it.province || '—'));
    const max = Math.max(1, ...provinceEntries.map(([, count]) => count));
    elTerritoryList.innerHTML = `
      <div class="territory-breadcrumb">
        <button type="button" data-territory-kind="back-region">← Regioni</button>
        <strong>${topoEscape(territoryFilter.region)}</strong>
      </div>
      <div class="territory-chip-section">
        <div>Province</div>
        ${provinceEntries.map(([name,count]) => `
          <button type="button"
            class="territory-chip territory-heat ${territoryFilter.province === name ? 'is-active' : ''}"
            style="--heat:${heatRatio(count,max)};--heat-color:${heatColor(count,max, territoryFilter.province === name)}"
            data-territory-kind="province"
            data-territory-name="${topoEscape(name)}">
            <span>${topoEscape(name)}</span><strong>${count}</strong>
          </button>`).join('')}
      </div>`;
  }

  function bindTerritoryListClicks() {
    if (!elTerritoryList) return;
    elTerritoryList.querySelectorAll('[data-territory-kind]').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.territoryKind;
        const name = btn.dataset.territoryName || '';
        if (kind === 'back-region') {
          territoryFilter.region = '';
          territoryFilter.province = '';
        } else if (kind === 'region') {
          territoryFilter.region = name;
          territoryFilter.province = '';
        } else if (kind === 'province') {
          territoryFilter.province = territoryFilter.province === name ? '' : name;
        } else if (kind === 'historical') {
          territoryFilter.historical = territoryFilter.historical === name ? '' : name;
        }
        renderModal();
      });
    });
  }

  function resetTerritoryFiltersForMode() {
    territoryFilter.region = '';
    territoryFilter.province = '';
    territoryFilter.historical = '';
  }

  function styleTerritoryFeature(name, active, count = 0, max = 1) {
    const color = heatColor(count, max, active);
    const hasCount = (Number(count) || 0) > 0;
    return {
      color: active ? '#1d4ed8' : color,
      weight: active ? 3.1 : (hasCount ? 1.9 : 1.25),
      opacity: active ? 1 : (hasCount ? 0.92 : 0.62),
      fillColor: color,
      fillOpacity: active ? 0.46 : (hasCount ? (0.18 + heatRatio(count, max) * 0.38) : 0.06)
    };
  }

  async function renderTerritoryMap(items) {
    if (!elTerritoryMap || !elTerritoryStatus) return;
    const mini = ensureTerritoryMap();
    clearTerritoryMapLayers();
    renderTerritoryFallback(items);
    bindTerritoryListClicks();

    const data = await loadTerritories(modalMode);
    let hasGeom = false;
    const boundsGroup = L.featureGroup();
    const summary = summarizeToponyms(items);

    const regionCounts = summary.regions;
    const maxRegion = Math.max(1, ...Array.from(regionCounts.values()), 1);

    const provinceItems = territoryFilter.region
      ? items.filter(it => (it.region || '—') === territoryFilter.region)
      : items;
    const provinceCounts = countBy(provinceItems, it => it.province || '—');
    const maxProvince = Math.max(1, ...Array.from(provinceCounts.values()), 1);

    const historicalCounts = summary.historical;
    const maxHistorical = Math.max(1, ...Array.from(historicalCounts.values()), 1);

    const addGeoLayer = (gj, level) => {
      if (!gj?.features?.length) return;

      const layer = L.geoJSON(gj, {
        filter: (feature) => {
          const name = territoryNameFromFeature(feature, modalMode, level);
          if (!name) return false;
          if (modalMode === 'storiche') return mapGetByNorm(historicalCounts, name) > 0;
          if (level === 'regions') return !territoryFilter.region && mapGetByNorm(regionCounts, name) > 0;
          if (level === 'province') {
            if (!territoryFilter.region) return false;
            const featRegion = territoryRegionFromFeature(feature);
            const regionMatches = !featRegion || nameMatchesByNorm(featRegion, territoryFilter.region);
            // Mostra le province della regione selezionata anche se il nome provincia non combacia perfettamente.
            // Il conteggio e il colore restano agganciati al dataset quando c'è match.
            return regionMatches && (mapGetByNorm(provinceCounts, name) > 0 || !!featRegion);
          }
          return false;
        },
        style: (feature) => {
          const name = territoryNameFromFeature(feature, modalMode, level);
          const active = modalMode === 'storiche'
            ? territoryFilter.historical === name
            : (level === 'province' ? territoryFilter.province === name : territoryFilter.region === name);
          const count = modalMode === 'storiche'
            ? mapGetByNorm(historicalCounts, name)
            : (level === 'province' ? mapGetByNorm(provinceCounts, name) : mapGetByNorm(regionCounts, name));
          const max = modalMode === 'storiche'
            ? maxHistorical
            : (level === 'province' ? maxProvince : maxRegion);
          return styleTerritoryFeature(name, active, count, max);
        },
        onEachFeature: (feature, lyr) => {
          const name = territoryNameFromFeature(feature, modalMode, level);
          if (!name) return;
          const count = modalMode === 'storiche'
            ? mapGetByNorm(historicalCounts, name)
            : (level === 'province' ? mapGetByNorm(provinceCounts, name) : mapGetByNorm(regionCounts, name));
          const max = modalMode === 'storiche'
            ? maxHistorical
            : (level === 'province' ? maxProvince : maxRegion);
          lyr.bindTooltip(`${name} · ${count}`, { sticky: true, direction: 'top', className: 'territory-tooltip' });
          lyr.on('mouseover', () => {
            lyr.setStyle({ weight: 2.4, opacity: 0.96, fillOpacity: 0.45 });
            try { lyr.bringToFront(); } catch {}
          });
          lyr.on('mouseout', () => {
            const active = modalMode === 'storiche'
              ? territoryFilter.historical === name
              : (level === 'province' ? territoryFilter.province === name : territoryFilter.region === name);
            lyr.setStyle(styleTerritoryFeature(name, active, count, max));
          });
          lyr.on('click', () => {
            if (modalMode === 'storiche') {
              territoryFilter.historical = territoryFilter.historical === name ? '' : name;
            } else if (level === 'regions') {
              territoryFilter.region = name;
              territoryFilter.province = '';
            } else if (level === 'province') {
              territoryFilter.province = territoryFilter.province === name ? '' : name;
            }
            renderModal();
          });
        }
      }).addTo(mini);

      territoryLayers.push(layer);
      layer.eachLayer(l => boundsGroup.addLayer(l));
      if (layer.getLayers().length) hasGeom = true;
    };

    if (modalMode === 'storiche') {
      addGeoLayer(data, 'historical');
      elTerritoryStatus.textContent = data
        ? 'Aree storiche · gradiente per numero di elementi'
        : 'Aree storiche non trovate: uso elenco filtrabile';
    } else if (!territoryFilter.region) {
      addGeoLayer(data?.regions, 'regions');
      elTerritoryStatus.textContent = data?.regions
        ? 'Regioni · gradiente per numero di elementi'
        : 'Regioni non trovate: uso elenco filtrabile';
    } else {
      addGeoLayer(data?.provinces, 'province');
      elTerritoryStatus.textContent = data?.provinces
        ? `Province di ${territoryFilter.region} · gradiente per numero di elementi`
        : 'Province non trovate: uso elenco filtrabile';
    }

    if (hasGeom) {
      try {
        const b = boundsGroup.getBounds();
        if (b && b.isValid()) mini.fitBounds(b.pad(0.08));
      } catch {}
    }
    setTimeout(() => mini.invalidateSize(), 60);
  }

  function ownTerritoryFromProps(props) {
    const region = (props.region || '').toString().trim();
    const province = (props.province || props.pronvince || '').toString().trim();
    const historicalProvince = (props.historical_province ?? props.historicalProvince ?? props.historical_region ?? props.historicalRegion ?? '').toString().trim();
    const hasOwn = !!(region || province || historicalProvince);
    return { region, province, historicalProvince, hasOwn };
  }

  function ensureTopoChildrenIndex(features) {
    const byParent = new Map();
    const byId = new Map();
    features.forEach(f => {
      const fid = String(f?.properties?.fid ?? f?.properties?.id ?? f?.id ?? '').trim();
      if (fid) byId.set(fid, f);
    });
    features.forEach(f => {
      const fid = String(f?.properties?.fid ?? f?.properties?.id ?? f?.id ?? '').trim();
      const parentId = String(f?.properties?.parent_id ?? '').trim();
      if (!fid || !parentId || parentId.toLowerCase() === 'null' || parentId === '0') return;
      if (!byParent.has(parentId)) byParent.set(parentId, []);
      byParent.get(parentId).push(f);
    });
    return { byParent, byId };
  }

  function makeTerritoryItem(feature, inheritedFrom = null, inheritedTerritory = null) {
    const p = feature.properties || {};
    const fid = p.fid ?? p.id ?? feature.id ?? null;
    const name = (p.name || p.as || '').toString().trim();
    if (fid == null || !name) return null;

    const own = ownTerritoryFromProps(p);
    const effective = inheritedTerritory && !own.hasOwn ? inheritedTerritory : own;

    return {
      fid: String(fid),
      name,
      nameNorm: norm(name),
      place: (p.tipologia || p.place || '').toString().trim(),
      region: effective.region || '—',
      province: effective.province || '—',
      historicalProvince: effective.historicalProvince || '',
      dimensions: p.dimension ?? p.dimensions ?? 3,
      interpreted: p.interpreted ?? false,
      present: p.present,
      latlng: featureLatLngFromTopo(feature),
      origin: inheritedFrom ? 'inheritedChild' : 'direct',
      inheritedFrom: inheritedFrom ? String(inheritedFrom) : '',
      feature
    };
  }

  async function loadToponymsOnce() {
    if (toponymsCache) return toponymsCache;

    const res = await fetch(TOPONYMS_GEOJSON_URL);
    if (!res.ok) throw new Error('Impossibile caricare ' + TOPONYMS_GEOJSON_URL);
    const json = await res.json();
    const feats = Array.isArray(json.features) ? json.features : [];
    const { byParent, byId } = ensureTopoChildrenIndex(feats);
    window.WEBGIS_DATA = window.WEBGIS_DATA || {};
    window.WEBGIS_DATA.childrenByParent = byParent;

    const items = [];
    const included = new Set();

    feats.forEach(f => {
      const p = f.properties || {};
      const fid = String(p.fid ?? p.id ?? f.id ?? '').trim();
      if (!fid) return;
      const own = ownTerritoryFromProps(p);
      if (!own.hasOwn) return;

      const direct = makeTerritoryItem(f);
      if (direct && !included.has(direct.fid)) {
        items.push(direct);
        included.add(direct.fid);
      }

      // Conta e rende disponibili SOLO i figli diretti del record con territorio proprio.
      // Non propaga ai nipoti: Vignola + Rongioni Tosi sì; 486/487 no.
      (byParent.get(fid) || []).forEach(child => {
        const cp = child.properties || {};
        const cid = String(cp.fid ?? cp.id ?? child.id ?? '').trim();
        if (!cid || included.has(cid)) return;
        if (ownTerritoryFromProps(cp).hasOwn) return;
        const inherited = makeTerritoryItem(child, fid, own);
        if (inherited) {
          items.push(inherited);
          included.add(cid);
        }
      });
    });

    toponymsCache = items;
    return toponymsCache;
  }

  function ensureModalStructure() {
    if (modalInited || !modalBody) return;

    modalBody.innerHTML = '';
    modal?.classList.add('toponyms-modal-redesign');

    const tools = document.createElement('div');
    tools.className = 'modal-tools toponyms-tools-redesign';

    const switchWrap = document.createElement('div');
    switchWrap.className = 'modal-switch territory-switch';

    const btnComuni = document.createElement('button');
    btnComuni.type = 'button';
    btnComuni.className = 'btn sm ghost is-active';
    btnComuni.innerHTML = '<i class="bi bi-map"></i> Regioni attuali';

    const btnStoriche = document.createElement('button');
    btnStoriche.type = 'button';
    btnStoriche.className = 'btn sm ghost';
    btnStoriche.innerHTML = '<i class="bi bi-clock-history"></i> Regioni storiche';

    btnComuni.addEventListener('click', () => {
      modalMode = 'comuni';
      resetTerritoryFiltersForMode();
      btnComuni.classList.add('is-active');
      btnStoriche.classList.remove('is-active');
      renderModal();
    });
    btnStoriche.addEventListener('click', () => {
      modalMode = 'storiche';
      resetTerritoryFiltersForMode();
      btnStoriche.classList.add('is-active');
      btnComuni.classList.remove('is-active');
      renderModal();
    });

    switchWrap.appendChild(btnComuni);
    switchWrap.appendChild(btnStoriche);

    const searchWrap = document.createElement('div');
    searchWrap.className = 'modal-search territory-search';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Cerca comune, toponimo o area…';
    search.autocomplete = 'off';
    const suggest = document.createElement('div');
    suggest.className = 'suggest';
    suggest.hidden = true;
    search.addEventListener('input', () => renderModal());
    search.addEventListener('blur', () => setTimeout(() => { suggest.hidden = true; }, 120));
    searchWrap.appendChild(search);
    searchWrap.appendChild(suggest);

    const count = document.createElement('div');
    count.className = 'modal-count territory-count';

    tools.appendChild(switchWrap);
    tools.appendChild(searchWrap);
    tools.appendChild(count);

    const layout = document.createElement('div');
    layout.className = 'toponyms-territory-layout';

    const territoryPane = document.createElement('section');
    territoryPane.className = 'territory-pane';
    territoryPane.innerHTML = `
      <div class="territory-pane-head">
        <div><strong>Filtro territoriale</strong><span id="territory-status">—</span></div>
        <button type="button" class="territory-clear">Reset</button>
      </div>
      <div id="toponyms-territory-map" class="territory-map"></div>
      <div id="toponyms-territory-list" class="territory-list"></div>
    `;

    const resultsPane = document.createElement('section');
    resultsPane.className = 'toponyms-results-pane';
    resultsPane.innerHTML = `
      <div class="toponyms-results-head">
        <strong>Comuni e toponimi</strong>
        <span>Seleziona una voce per zoomare in mappa</span>
      </div>
      <div class="legend-onerow compact">
        <span class="legend-chip"><span class="legend-swatch" style="--c:#60a5fa"></span>City</span>
        <span class="legend-chip"><span class="legend-swatch" style="--c:#34d399"></span>Village/Hamlet</span>
        <span class="legend-chip"><span class="legend-swatch" style="--c:#fbbf24"></span>Locality/Quarter</span>
        <span class="legend-chip"><span class="legend-swatch" style="--c:#a78bfa"></span>Other</span>
      </div>
    `;
    const list = document.createElement('div');
    list.className = 'modal-list toponyms-results-list';
    resultsPane.appendChild(list);

    layout.appendChild(territoryPane);
    layout.appendChild(resultsPane);
    modalBody.appendChild(tools);
    modalBody.appendChild(layout);

    territoryPane.querySelector('.territory-clear')?.addEventListener('click', () => {
      resetTerritoryFiltersForMode();
      if (elModalSearch) elModalSearch.value = '';
      renderModal();
    });

    elModeComuni = btnComuni;
    elModeStoriche = btnStoriche;
    elModalSearch = search;
    elSuggest = suggest;
    elCount = count;
    elLegend = resultsPane.querySelector('.legend-onerow');
    elList = list;
    elTerritoryMap = territoryPane.querySelector('#toponyms-territory-map');
    elTerritoryList = territoryPane.querySelector('#toponyms-territory-list');
    elTerritoryStatus = territoryPane.querySelector('#territory-status');
    modalInited = true;
  }

  function cleanParentId(value) {
    const s = String(value ?? '').trim();
    return s && s.toLowerCase() !== 'null' && s !== '0' ? s : '';
  }

  function childrenOfPlace(fid) {
    const d = window.WEBGIS_DATA || {};
    return d.childrenByParent?.get(String(fid)) || [];
  }

  function mapsForPlaceFid(fid) {
    const d = window.WEBGIS_DATA || {};
    const out = [];
    const seen = new Set();
    const addMap = (m) => {
      if (!m) return;
      const key = String(m.fid || m.sigla || m.name || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(m);
    };
    (d.placeToMaps?.get(String(fid)) || new Set()).forEach(mapId => addMap(d.mapsById?.get(String(mapId))));
    if (!out.length) {
      const f = placesById.get(String(fid));
      const raw = String(f?.properties?.mappa || '').trim();
      raw.split(';').map(x => x.trim()).filter(Boolean).forEach(sigla => {
        const rec = Array.from(d.mapsById?.values?.() || []).find(m => String(m.sigla) === sigla || String(m.name) === sigla || String(m.fid) === sigla);
        addMap(rec || { fid: sigla, sigla, name: sigla });
      });
    }
    return out;
  }

  function polygonChildrenOptions(fid) {
    const kids = childrenOfPlace(fid).filter(f => ['Polygon','MultiPolygon'].includes(f?.geometry?.type));
    const baseFeature = placesById.get(String(fid));
    const baseIsPolygon = ['Polygon','MultiPolygon'].includes(baseFeature?.geometry?.type);
    const source = kids.length ? kids : (baseIsPolygon ? [baseFeature] : []);
    const options = [];
    source.forEach(f => {
      const targetFid = String(f?.properties?.fid ?? f?.properties?.id ?? '').trim();
      if (!targetFid) return;
      const maps = mapsForPlaceFid(targetFid);
      maps.forEach(mapRec => {
        if (!mapRec?.fid) return;
        options.push({ fid: targetFid, feature: f, mapRec });
      });
    });
    return options;
  }

  function activateMapPlace(option) {
    if (!option?.mapRec?.fid || !option?.fid) return;
    const detail = buildStudyDetail(option.mapRec);
    detail.focusFid = String(option.fid);
    window.dispatchEvent(new CustomEvent('maps:studyMap', { detail }));
    closeModal();
  }

  function renderAttestationChooser(item, options) {
    if (!elList) return;
    elList.innerHTML = '';
    const section = document.createElement('section');
    section.className = 'place-detail-view attestation-choice-view';
    section.innerHTML = `
      <div class="place-detail-head">
        <button type="button" class="territory-back" data-role="back-detail">← Torna a ${topoEscape(item.name)}</button>
        <div class="place-detail-title"><span>${topoEscape(item.name)}</span><strong>${options.length}</strong></div>
        <p>Scegli l'attestazione/mappa da aprire in overlay.</p>
      </div>
      <div class="attestation-list">
        ${options.map(opt => {
          const ident = (opt.feature?.properties?.identificazione_attuale || opt.feature?.properties?.name || opt.feature?.properties?.as || item.name || '').trim();
          const shortIdent = ident.length > 120 ? (ident.slice(0, 117) + '…') : ident;
          return `
          <button type="button" class="attestation-card attestation-card--row" data-fid="${topoEscape(opt.fid)}" data-map="${topoEscape(opt.mapRec.fid)}">
            <span class="attestation-mapchip">${topoEscape(opt.mapRec.sigla || opt.mapRec.name || opt.mapRec.fid)}</span>
            <strong>${topoEscape(shortIdent)}</strong>
            <small>${topoEscape(opt.feature?.properties?.name || item.name)}</small>
          </button>`;
        }).join('')}
      </div>`;
    elList.appendChild(section);
    section.querySelector('[data-role="back-detail"]')?.addEventListener('click', () => renderPlaceDetail(item));
    section.querySelectorAll('.attestation-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const opt = options.find(o => String(o.fid) === String(btn.dataset.fid) && String(o.mapRec.fid) === String(btn.dataset.map));
        activateMapPlace(opt);
      });
    });
  }

  function handleDetailPlaceClick(item) {
    const options = polygonChildrenOptions(item.fid);
    if (!options.length) {
      window.dispatchEvent(new CustomEvent('toponyms:zoomToFid', { detail: { fid: item.fid, latlng: item.latlng || null } }));
      closeModal();
      return;
    }
    if (options.length === 1) {
      activateMapPlace(options[0]);
      return;
    }
    renderAttestationChooser(item, options);
  }

  function detailChildrenForRoot(rootItem) {
    return (toponymsCache || [])
      .filter(it => it.origin === 'inheritedChild' && String(it.inheritedFrom) === String(rootItem.fid))
      .sort((a,b) => a.name.localeCompare(b.name, 'it'));
  }

  function renderPlaceDetail(rootItem) {
    if (!elList) return;
    const children = detailChildrenForRoot(rootItem);
    elList.innerHTML = '';
    const byType = new Map();
    children.forEach(ch => {
      const key = (ch.tipologia || ch.place || 'Altro').trim() || 'Altro';
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key).push(ch);
    });
    const section = document.createElement('section');
    section.className = 'place-detail-view';
    section.innerHTML = `
      <div class="place-detail-head">
        <button type="button" class="territory-back" data-role="back-results">← Torna ai risultati</button>
        <button type="button" class="place-root-card" data-role="zoom-root">
          <span>${topoEscape(rootItem.name)}</span>
          <small>${topoEscape(rootItem.province)} · ${topoEscape(rootItem.region)}</small>
          <strong>${children.length}</strong>
        </button>
      </div>
      <div class="place-child-groups">
        ${children.length ? Array.from(byType.entries()).map(([typeName, arr]) => `
          <details class="place-children-accordion">
            <summary><span class="detail-type-head"><img src="${(typeof iconPathForTipologia === 'function') ? iconPathForTipologia(typeName) : 'images/icons/ed_type/appezzamento.png'}" alt=""><span>${topoEscape(typeName)}</span></span><strong>${arr.length}</strong></summary>
            <div class="place-children-list">
              ${arr.map(ch => {
                const maps = mapsForPlaceFid(ch.fid).map(m => m.sigla || m.name || m.fid).join(', ');
                const opts = polygonChildrenOptions(ch.fid);
                return `<button type="button" class="place-child-row" data-fid="${topoEscape(ch.fid)}">
                  <span><strong>${topoEscape(ch.name)}</strong><small>${topoEscape(maps || 'mappa da scegliere tramite attestazioni')}</small></span>
                  <em>${opts.length > 1 ? `${opts.length} attestazioni` : (opts.length === 1 ? 'apri overlay' : 'zoom')}</em>
                </button>`;
              }).join('')}
            </div>
          </details>`).join('') : '<div class="toponyms-empty">Nessun luogo di dettaglio collegato.</div>'}
      </div>`;
    elList.appendChild(section);
    section.querySelector('[data-role="back-results"]')?.addEventListener('click', () => renderModal());
    section.querySelector('[data-role="zoom-root"]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('toponyms:zoomToFid', { detail: { fid: rootItem.fid, latlng: rootItem.latlng || null } }));
      closeModal();
    });
    section.querySelectorAll('.place-child-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const child = children.find(it => String(it.fid) === String(btn.dataset.fid));
        if (child) handleDetailPlaceClick(child);
      });
    });
  }

  function makeTopoButton(it) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const typ = (it.tipologia || it.place || '').trim();
    const hasTypIcon = typ && typeof iconPathForTipologia === 'function' && ['edificio civile','edificio militare','edificio sacro','possedimento','appezzamento','proprietà','proprieta'].includes(typ.toLowerCase().replace(/_/g,' '));
    btn.className = `topo-item ${classifyPlace(it.place)} ${it.origin === 'direct' ? 'is-direct-place' : 'is-child-place'} ${hasTypIcon ? 'is-typed' : 'is-dimensioned'}`;

    const file = iconFileByDimensions(it.dimensions);
    const borderClass =
      (it.interpreted === true || it.interpreted === 1 || it.interpreted === '1' || String(it.interpreted).toLowerCase() === 'true')
        ? 'border-orange'
        : 'border-green';
    const base = (typeof ICON_BASE_PATH === 'string' && ICON_BASE_PATH) ? ICON_BASE_PATH : 'images/icons/';
    const iconSrc = hasTypIcon ? iconPathForTipologia(typ) : (base + file);
    const children = detailChildrenForRoot(it);

    btn.innerHTML = `
      <div class="topo-icon ${borderClass}">
        <img src="${iconSrc}" alt="icon"/>
      </div>
      <div class="topo-name" title="${topoEscape(it.name)}">${topoEscape(it.name)}</div>
      ${children.length ? `<span class="topo-child-count">${children.length}</span>` : ''}
    `;

    btn.addEventListener('click', () => {
      if (it.origin === 'direct' && children.length) {
        renderPlaceDetail(it);
        return;
      }
      if (it.origin === 'inheritedChild') {
        handleDetailPlaceClick(it);
        return;
      }
      window.dispatchEvent(new CustomEvent('toponyms:zoomToFid', { detail: { fid: it.fid, latlng: it.latlng || null } }));
      if (input) {
        input.value = it.name;
        renderList(input.value);
      }
      closeModal();
    });

    return btn;
  }

  function renderSuggest(filtered, qNorm) {
    if (!elSuggest || !elModalSearch) return;
    if (!qNorm) { elSuggest.hidden = true; return; }

    const top = filtered.slice(0, 8);
    if (!top.length) { elSuggest.hidden = true; return; }

    elSuggest.innerHTML = '';
    top.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'suggest-item-rich';
      const typ = (it.tipologia || it.place || '').trim();
      const hasTypIcon = typ && typeof iconPathForTipologia === 'function' && ['edificio civile','edificio militare','edificio sacro','possedimento','appezzamento','proprietà','proprieta'].includes(typ.toLowerCase().replace(/_/g,' '));
      const base = (typeof ICON_BASE_PATH === 'string' && ICON_BASE_PATH) ? ICON_BASE_PATH : 'images/icons/';
      const iconSrc = hasTypIcon ? iconPathForTipologia(typ) : (base + iconFileByDimensions(it.dimensions));
      b.innerHTML = `<span class="suggest-icon"><img src="${iconSrc}" alt=""></span><span class="suggest-main"><strong>${topoEscape(it.name)}</strong><small>${topoEscape([it.province, it.region].filter(Boolean).join(' · ') || typ || 'luogo')}</small></span>`;
      b.addEventListener('click', () => {
        elModalSearch.value = it.name;
        elSuggest.hidden = true;
        const children = detailChildrenForRoot(it);
        if (it.origin === 'direct' && children.length) {
          renderPlaceDetail(it);
          if (elCount) elCount.textContent = `${1 + children.length} elementi associati · ${it.name}`;
          return;
        }
        const single = [it];
        renderToponymResults(single, it.name);
        if (elCount) elCount.textContent = `1 elemento associato · ${it.name}`;
      });
      elSuggest.appendChild(b);
    });
    elSuggest.hidden = false;
  }

  function applyTerritoryFilter(items) {
    let out = items;
    if (modalMode === 'storiche') {
      if (territoryFilter.historical) {
        out = out.filter(it => ((it.historicalProvince || '').trim() || 'Da assegnare') === territoryFilter.historical);
      }
      return out;
    }
    if (territoryFilter.region) out = out.filter(it => (it.region || '—') === territoryFilter.region);
    if (territoryFilter.province) out = out.filter(it => (it.province || '—') === territoryFilter.province);
    return out;
  }

  function renderRegionCards(items) {
    elList.innerHTML = '';
    const entries = sortedCountEntries(countBy(items, it => it.region || '—'));
    const max = Math.max(1, ...entries.map(([, count]) => count));
    const section = document.createElement('section');
    section.className = 'toponyms-result-section territory-drill-section';
    section.innerHTML = `
      <header>
        <span>Seleziona una regione</span>
        <strong>${items.length}</strong>
      </header>
      <div class="territory-result-grid">
        ${entries.map(([name, count]) => `
          <button type="button" class="territory-result-card"
            style="--heat:${heatRatio(count,max)};--heat-color:${heatColor(count,max)}"
            data-territory-kind="region"
            data-territory-name="${topoEscape(name)}">
            <span>${topoEscape(name)}</span>
            <strong>${count}</strong>
            <small>elementi associati</small>
          </button>`).join('')}
      </div>`;
    elList.appendChild(section);
    section.querySelectorAll('[data-territory-kind="region"]').forEach(btn => {
      btn.addEventListener('click', () => {
        territoryFilter.region = btn.dataset.territoryName || '';
        territoryFilter.province = '';
        renderModal();
      });
    });
  }

  function renderProvinceCards(items) {
    elList.innerHTML = '';
    const regionItems = items.filter(it => (it.region || '—') === territoryFilter.region);
    const entries = sortedCountEntries(countBy(regionItems, it => it.province || '—'));
    const max = Math.max(1, ...entries.map(([, count]) => count));
    const section = document.createElement('section');
    section.className = 'toponyms-result-section territory-drill-section';
    section.innerHTML = `
      <header>
        <span>${topoEscape(territoryFilter.region)} · seleziona provincia</span>
        <strong>${regionItems.length}</strong>
      </header>
      <div class="territory-result-grid">
        ${entries.map(([name, count]) => `
          <button type="button" class="territory-result-card"
            style="--heat:${heatRatio(count,max)};--heat-color:${heatColor(count,max, territoryFilter.province === name)}"
            data-territory-kind="province"
            data-territory-name="${topoEscape(name)}">
            <span>${topoEscape(name)}</span>
            <strong>${count}</strong>
            <small>elementi associati</small>
          </button>`).join('')}
      </div>`;
    elList.appendChild(section);
    section.querySelectorAll('[data-territory-kind="province"]').forEach(btn => {
      btn.addEventListener('click', () => {
        territoryFilter.province = btn.dataset.territoryName || '';
        renderModal();
      });
    });
  }

  function renderToponymResults(items, title = 'Risultati') {
    elList.innerHTML = '';
    const directItems = items.filter(it => it.origin === 'direct');
    const detailOnly = items.filter(it => it.origin === 'inheritedChild');
    const displayItems = directItems.length ? directItems : detailOnly;

    if (!displayItems.length) {
      elList.innerHTML = '<div class="toponyms-empty">Nessun risultato con questi filtri.</div>';
      return;
    }

    const intro = document.createElement('section');
    intro.className = 'toponyms-result-section territory-drill-section';
    intro.innerHTML = `<header><span>${topoEscape(title)}</span><strong>${items.length}</strong></header>`;
    elList.appendChild(intro);

    if (directItems.length) {
      const grid = document.createElement('div');
      grid.className = 'topo-grid compact';
      directItems.slice().sort((a,b) => a.name.localeCompare(b.name, 'it')).forEach(it => grid.appendChild(makeTopoButton(it)));
      elList.appendChild(grid);
      return;
    }

    const byType = new Map();
    detailOnly.forEach(it => {
      const key = (it.tipologia || it.place || 'Altro').trim() || 'Altro';
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key).push(it);
    });
    Array.from(byType.entries()).sort((a,b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'it')).forEach(([typeName, arr]) => {
      const group = document.createElement('details');
      group.className = 'acc-province result-province';
      group.open = true;
      group.innerHTML = `<summary><span class="prov-left detail-type-head"><img src="${(typeof iconPathForTipologia === 'function') ? iconPathForTipologia(typeName) : 'images/icons/ed_type/appezzamento.png'}" alt=""><span>${topoEscape(typeName)}</span></span><span class="badge-count">${arr.length}</span></summary>`;
      const grid = document.createElement('div');
      grid.className = 'topo-grid compact';
      arr.slice().sort((a,b) => a.name.localeCompare(b.name, 'it')).forEach(it => grid.appendChild(makeTopoButton(it)));
      group.appendChild(grid);
      elList.appendChild(group);
    });
  }

  function renderModeComuni(items) {
    if (!territoryFilter.region) {
      renderRegionCards(items);
      return;
    }
    if (!territoryFilter.province) {
      renderProvinceCards(items);
      return;
    }
    renderToponymResults(items, `${territoryFilter.region} · ${territoryFilter.province}`);
  }

  function renderModeStoriche(items) {
    if (!territoryFilter.historical) {
      elList.innerHTML = '';
      const entries = sortedCountEntries(countBy(items, it => (it.historicalProvince || '').trim() || 'Da assegnare'));
      const max = Math.max(1, ...entries.map(([, count]) => count));
      const section = document.createElement('section');
      section.className = 'toponyms-result-section territory-drill-section';
      section.innerHTML = `
        <header><span>Seleziona un’area storica</span><strong>${items.length}</strong></header>
        <div class="territory-result-grid">
          ${entries.map(([name, count]) => `
            <button type="button" class="territory-result-card"
              style="--heat:${heatRatio(count,max)};--heat-color:${heatColor(count,max)}"
              data-territory-kind="historical"
              data-territory-name="${topoEscape(name)}">
              <span>${topoEscape(name)}</span>
              <strong>${count}</strong>
              <small>elementi associati</small>
            </button>`).join('')}
        </div>`;
      elList.appendChild(section);
      section.querySelectorAll('[data-territory-kind="historical"]').forEach(btn => {
        btn.addEventListener('click', () => {
          territoryFilter.historical = btn.dataset.territoryName || '';
          renderModal();
        });
      });
      return;
    }
    renderToponymResults(items, territoryFilter.historical);
  }

  async function renderModal() {
    if (!modalInited || !elList || !elModalSearch || !elCount) return;
    if (!toponymsCache) return;

    const qRaw = elModalSearch.value || '';
    const qNorm = norm(qRaw);
    let filtered = toponymsCache;
    if (qNorm) filtered = filtered.filter(it => it.nameNorm.includes(qNorm) || norm(it.region).includes(qNorm) || norm(it.province).includes(qNorm) || norm(it.historicalProvince).includes(qNorm));

    await renderTerritoryMap(filtered);
    filtered = applyTerritoryFilter(filtered);

    const scopeLabel = modalMode === 'storiche'
      ? (territoryFilter.historical || 'aree storiche')
      : (territoryFilter.province || territoryFilter.region || 'regioni');
    elCount.textContent = `${filtered.length} elementi associati · ${scopeLabel}`;

    renderSuggest(filtered, qNorm);
    if (modalMode === 'storiche') renderModeStoriche(filtered);
    else renderModeComuni(filtered);
  }

  btnToponyms?.addEventListener('click', async (ev) => {
    ev.preventDefault();
    openModal();

    if (!modalBody) return;

    ensureModalStructure();

    if (!toponymsCache) {
      elList.innerHTML = '';
      elCount.textContent = 'Caricamento…';
      try {
        await loadToponymsOnce();
      } catch (err) {
        elList.innerHTML = `<div class="muted">Errore: ${String(err)}</div>`;
        console.error(err);
        return;
      }
    }

    renderModal();
    setTimeout(() => elModalSearch?.focus(), 50);
  });

})();
