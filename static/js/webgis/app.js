// ============================================================================
// app.js — Mappa principale (toponimi + layer poligonale map_details + legenda)
// ============================================================================

// === CONFIGURAZIONE ===
const DATA_URL = 'data/places.geojson';              // GeoJSON luoghi (punti + poligoni)
const ICON_BASE_PATH = 'images/icons/';             // cartella icone

// Mappa dimensione -> filename
const ICON_BY_DIM = {
  1: 'small.png',
  2: 'small_medium.png',
  3: 'medium.png',
  4: 'big.png',
  5: 'metropolis.png',
  11: 'other.svg',
};

// Colori bordo per tipologia poligonale (istruzione 3.2)
const TIPOLOGIA_COLOR = {
  'edificio civile':   '#2563eb', // blu
  'edificio militare': '#b91c1c', // rosso
  'edificio sacro':    '#7c3aed', // viola
  'possedimento':      '#0e7490', // teal
  'appezzamento':      '#65a30d', // verde oliva
  'proprietà':         '#c2410c', // arancio bruciato
};
const TIPOLOGIA_FALLBACK = '#334155';
function colorForTipologia(t){
  const k = (t || '').toString().trim().toLowerCase();
  return TIPOLOGIA_COLOR[k] || TIPOLOGIA_FALLBACK;
}
function labelForTipologia(t){
  const k = (t || '').toString().trim();
  return k || 'Non classificato';
}

const EDTYPE_ICON_BASE = 'images/icons/ed_type/';
const EDTYPE_ICON_BY_KEY = {
  'edificio civile': 'edificio_civile.png',
  'edificio militare': 'edificio_militare.png',
  'edificio sacro': 'edificio_sacro.png',
  'possedimento': 'possedimento.png',
  'appezzamento': 'appezzamento.png',
  'proprietà': 'proprieta.png',
  'proprieta': 'proprieta.png'
};
function typologyKey(t){
  return (t || '').toString().trim().toLowerCase().replace(/_/g, ' ');
}
function iconPathForTipologia(t){
  const key = typologyKey(t);
  return EDTYPE_ICON_BASE + (EDTYPE_ICON_BY_KEY[key] || 'appezzamento.png');
}

// === BASEMAPS ===
const baseLayers = {
  'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OSM contributors'
  }),
  'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data: &copy; OSM, SRTM | Map style: &copy; OpenTopoMap'
  })
};

const map = L.map('map', {
  center: [43.8, 11.2],
  zoom: 7,
  layers: [baseLayers['OpenStreetMap']]
});
L.control.layers(baseLayers, null, { collapsed: true }).addTo(map);

// ============================================================================
// PANES (ordine dei layer)
// ============================================================================

// Pane GeoTIFF (tra tiles e marker)
const rasterPane = map.createPane('geotiffPane');
rasterPane.style.zIndex = 350;           // sotto marker e sopra tiles
rasterPane.style.pointerEvents = 'none'; // click passano ai marker

// Pane poligoni "map_details" (sotto ai toponimi, ma interattivo)
const detailsPaneName = 'detailsPane';
if (!map.getPane(detailsPaneName)) map.createPane(detailsPaneName);
const detailsPane = map.getPane(detailsPaneName);
detailsPane.style.zIndex = 250;          // sotto marker (e sotto geotiff)
detailsPane.style.pointerEvents = 'auto';// serve per hover/click

// ============================================================================
// CLUSTER TOPONIMI
// ============================================================================
const clusterGroup = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 50,
  disableClusteringAtZoom: 15
}).addTo(map);

// ============================================================================
// STATO FILTRI + LEGENDA
// ============================================================================
const DIM_KEYS = [1, 2, 3, 4, 5, 11];

// toggles dimensioni (default ON)
const dimEnabled = Object.fromEntries(DIM_KEYS.map(d => [d, true]));

// toggle layer
let toponymsVisible = true;
let detailsVisible = true;

// filtro attivo (da dashboard.js)
let activeFidSet = null; // Set<string> oppure null

// contatori per legenda (calcolati su present=true)
const dimCounts = Object.fromEntries(DIM_KEYS.map(d => [d, 0]));

// ============================================================================
// HELPERS COMUNI
// ============================================================================
function truthy(v) {
  return v === true || v === 1 || v === '1' || (typeof v === 'string' && v.toLowerCase() === 'true');
}
function toNumber(n, fallback = null) {
  const num = Number(n);
  return Number.isFinite(num) ? num : fallback;
}

// Parsing WKT Point (lon lat)
function parseWKTPoint(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;
  const m = wkt.match(/point\s*\(\s*([\-0-9\.]+)\s+([\-0-9\.]+)\s*\)/i);
  if (!m) return null;
  const lon = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

// ============================================================================
// WIKIPEDIA HELPERS (popup toponimi)
// ============================================================================
function parseWikipediaField(val) {
  if (!val || typeof val !== 'string') return null;
  const m = val.match(/^([a-z-]+):(.*)$/i);
  if (!m) return null;
  const lang = m[1].toLowerCase();
  const rawTitle = m[2].trim();
  const pageTitleForUrl = rawTitle.replace(/ /g, '_');
  const pageUrl = `https://${lang}.wikipedia.org/wiki/${pageTitleForUrl}`;
  const apiUrl  = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(rawTitle)}`;
  return { lang, rawTitle, pageUrl, apiUrl };
}

// Wikipedia helper per map_details: campo con URL intero
function parseWikipediaUrlField(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const raw = urlStr.trim();
  if (!raw) return null;

  let u;
  try { u = new URL(raw); } catch { return { pageUrl: raw, apiUrl: null, rawTitle: '' }; }

  const host = (u.hostname || '').toLowerCase();
  if (!host.includes('wikipedia.org')) {
    return { pageUrl: raw, apiUrl: null, rawTitle: '' };
  }

  const lang = host.split('.')[0]; // es. it.wikipedia.org
  const path = u.pathname || '';
  // caso standard: /wiki/Titolo
  if (path.startsWith('/wiki/')) {
    const titleEncoded = path.slice('/wiki/'.length);
    const title = decodeURIComponent(titleEncoded).replace(/_/g, ' ').trim();
    // per API ignoriamo hash (sezione)
    const pageUrl = raw; // mantengo eventuale #hash
    const apiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    return { pageUrl, apiUrl, rawTitle: title };
  }

  // fallback: link valido ma non in formato /wiki/
  return { pageUrl: raw, apiUrl: null, rawTitle: '' };
}

let popupIdCounter = 0;
function nextPopupId() {
  popupIdCounter += 1;
  return `popup-${Date.now()}-${popupIdCounter}`;
}

function makeDivIcon(dimensions, interpreted) {
  const dim = toNumber(dimensions, 3);
  const file = ICON_BY_DIM[dim] || ICON_BY_DIM[3];
  const borderClass = truthy(interpreted) ? 'border-orange' : 'border-green';
  return L.divIcon({
    className: '',
    html: `<div class="poi-icon ${borderClass}"><img src="${ICON_BASE_PATH + file}" alt="icon ${dim}"/></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22]
  });
}

function buildPopupHTML(props, containers) {
  const name = props.name ?? props.as ?? 'Senza nome';
  const dims = props.dimension ?? props.dimensions ?? '—';
  const interpretedStr = truthy(props.interpreted) ? 'true' : 'false';

  const wikidataLink = props.wikidata
    ? `<a href="https://www.wikidata.org/wiki/${props.wikidata}" target="_blank" rel="noopener">Apri su Wikidata</a>`
    : '';

  const wikiBlock = containers.wikiContainerId
    ? `<div id="${containers.wikiContainerId}" class="wiki">
         <div class="wiki-thumb"></div>
         <div class="wiki-body">
           <div class="wiki-title muted">Caricamento anteprima…</div>
           <div class="wiki-extract muted">Sto recuperando i contenuti da Wikipedia.</div>
         </div>
       </div>`
    : '';

  const noDataBlock = (!props.wikipedia || String(props.wikipedia).trim() === '')
    ? `<div class="muted">no data available ${wikidataLink ? `· ${wikidataLink}` : ''}</div>`
    : '';

  return `
    <div class="popup-card">
      <div class="popup-header">
        <div class="popup-title">${name}</div>
        <div class="popup-badges">
          <span class="badge">dim: ${dims}</span>
          <span class="badge">interpreted: ${interpretedStr}</span>
        </div>
      </div>
      ${wikiBlock || noDataBlock}
    </div>
  `;
}

async function loadWikipediaPreview(containerId, wikipediaField) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const info = parseWikipediaField(wikipediaField);
  if (!info) return;

  try {
    const res = await fetch(info.apiUrl, { headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const thumb = (json.thumbnail && json.thumbnail.source) ? json.thumbnail.source : '';
    const displayTitle = json.title || info.rawTitle;
    const extract = json.extract || '—';
    container.innerHTML = `
      ${thumb ? `<img class="wiki-thumb" src="${thumb}" alt="${displayTitle}"/>` : `<div class="wiki-thumb"></div>`}
      <div class="wiki-body">
        <div class="wiki-title">${displayTitle}</div>
        <div class="wiki-extract">${extract}</div>
        <div class="wiki-actions">
          <a href="${info.pageUrl}" target="_blank" rel="noopener">Apri su Wikipedia</a>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="wiki-thumb"></div>
      <div class="wiki-body">
        <div class="wiki-title">Anteprima non disponibile</div>
        <div class="wiki-extract muted">Impossibile recuperare il contenuto (${String(err)}).</div>
        <div class="wiki-actions">
          <a href="${info.pageUrl}" target="_blank" rel="noopener">Apri su Wikipedia</a>
        </div>
      </div>
    `;
  }
}

// mini Wikipedia per map_details (URL intero)
async function loadWikipediaPreviewFromUrl(containerId, urlStr) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const info = parseWikipediaUrlField(urlStr);
  if (!info) return;

  // se non ho apiUrl, mostro solo pulsante
  if (!info.apiUrl) {
    container.innerHTML = `
      <div class="wiki-thumb"></div>
      <div class="wiki-body">
        <div class="wiki-title">Wikipedia</div>
        <div class="wiki-extract muted">Link disponibile.</div>
        <div class="wiki-actions">
          <a href="${info.pageUrl}" target="_blank" rel="noopener">Apri su Wikipedia</a>
        </div>
      </div>
    `;
    return;
  }

  try {
    const res = await fetch(info.apiUrl, { headers: { 'accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const thumb = (json.thumbnail && json.thumbnail.source) ? json.thumbnail.source : '';
    const displayTitle = json.title || info.rawTitle || 'Wikipedia';
    const extract = json.extract || '—';
    container.innerHTML = `
      ${thumb ? `<img class="wiki-thumb" src="${thumb}" alt="${displayTitle}"/>` : `<div class="wiki-thumb"></div>`}
      <div class="wiki-body">
        <div class="wiki-title">${displayTitle}</div>
        <div class="wiki-extract">${extract}</div>
        <div class="wiki-actions">
          <a href="${info.pageUrl}" target="_blank" rel="noopener">Apri su Wikipedia</a>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="wiki-thumb"></div>
      <div class="wiki-body">
        <div class="wiki-title">Anteprima non disponibile</div>
        <div class="wiki-extract muted">Impossibile recuperare il contenuto (${String(err)}).</div>
        <div class="wiki-actions">
          <a href="${info.pageUrl}" target="_blank" rel="noopener">Apri su Wikipedia</a>
        </div>
      </div>
    `;
  }
}

// ============================================================================
// MARKER MANAGEMENT & FILTERING (dimension toggles + layer toggle + filtro dashboard)
// ============================================================================
const allMarkers = new Map(); // fidKey(string) -> marker
let rawFeatures = [];         // features GeoJSON originali

function featureLatLng(f) {
  const props = f.properties || {};
  if (f.geometry && f.geometry.type === 'Point' && Array.isArray(f.geometry.coordinates)) {
    const [lon, lat] = f.geometry.coordinates;
    return [lat, lon];
  } else if (props.wkt_geom) {
    return parseWKTPoint(props.wkt_geom);
  } else if (f.wkt_geom) {
    return parseWKTPoint(f.wkt_geom);
  }
  return null;
}

function getFidKeyFromFeature(f) {
  const props = f.properties || {};
  const fid = props.fid ?? props.id ?? null;
  if (fid == null) return null;
  return String(fid);
}

function getDimFromFeature(f) {
  const props = f.properties || {};
  return toNumber(props.dimension ?? props.dimensions, 3);
}

function createMarkerForFeature(f) {
  const props = f.properties || {};
  const latlng = featureLatLng(f);
  if (!latlng) return null;

  const wikiHasValue = props.wikipedia && String(props.wikipedia).trim() !== '';
  const wikiContainerId = wikiHasValue ? nextPopupId() : null;
  const popupHTML = buildPopupHTML(props, { wikiContainerId });

  const interpreted = truthy(props.interpreted);
  const popupClass = interpreted ? 'popup-orange' : 'popup-green';

  const marker = L.marker(latlng, {
    icon: makeDivIcon(props.dimension ?? props.dimensions, props.interpreted),
    title: props.name || props.as || ''
  }).bindPopup(popupHTML, { className: popupClass });

  marker.__fidKey = getFidKeyFromFeature(f);
  marker.__dim = getDimFromFeature(f);

  if (wikiHasValue) marker.on('popupopen', () => loadWikipediaPreview(wikiContainerId, props.wikipedia));
  return marker;
}

// Un record punto è "candidato marker" solo se: geometry.type=Point e dimension != null/vuoto
function isPointMarkerCandidate(f){
  if (!f?.geometry || f.geometry.type !== 'Point') return false;
  const p = f.properties || {};
  const dim = p.dimension ?? p.dimensions;
  if (dim === null || dim === undefined) return false;
  const s = String(dim).trim();
  if (s === '' || s.toLowerCase() === 'null') return false;
  return true;
}

/**
 * Ricostruisce i marker visibili.
 * - Filtro dashboard: se activeFidSet != null → mostra SOLO fid nel set (ignora present)
 * - Se activeFidSet == null → mostra SOLO features puntiformi con dimension != NULL/vuoto
 * - In entrambi i casi applica: toponymsVisible + dimEnabled
 */
function rebuildMarkers({ fitBounds = false } = {}) {
  clusterGroup.clearLayers();
  if (!toponymsVisible) return;

  const bounds = L.latLngBounds([]);
  rawFeatures.forEach(f => {
    const fidKey = getFidKeyFromFeature(f);
    if (!fidKey) return;

    // (1) regola visibilità base
    let visible = false;
    if (activeFidSet) {
      // sotto filtro attivo → mostra i fid richiesti che siano comunque punti disegnabili
      visible = activeFidSet.has(fidKey) && !!featureLatLng(f);
    } else {
      // caricamento base: SOLO punti con dimension valorizzata (istruzione D)
      visible = isPointMarkerCandidate(f);
    }
    if (!visible) return;

    // (2) filtro per dimensioni
    const dim = getDimFromFeature(f);
    if (dimEnabled[dim] === false) return;

    // marker (cache)
    let marker = allMarkers.get(fidKey);
    if (!marker) {
      marker = createMarkerForFeature(f);
      if (!marker) return;
      allMarkers.set(fidKey, marker);
    }

    clusterGroup.addLayer(marker);
    bounds.extend(marker.getLatLng());
  });

  if (fitBounds && bounds.isValid()) map.fitBounds(bounds.pad(0.1));
}

// Eventi dal pannello per applicare/azzerare il filtro
window.addEventListener('toponyms:setFilterByFids', (e) => {
  const ids = e.detail && e.detail.ids ? e.detail.ids : null;
  activeFidSet = ids ? new Set(ids.map(String)) : null;
  rebuildMarkers({ fitBounds: true });
});
window.addEventListener('toponyms:clearFilter', () => {
  activeFidSet = null;
  rebuildMarkers({ fitBounds: true });
});

// Esponiamo una minima API (opzionale)
window.ToponymsAPI = {
  clearFilter: () => window.dispatchEvent(new CustomEvent('toponyms:clearFilter')),
  setFilterByFids: (ids) => window.dispatchEvent(new CustomEvent('toponyms:setFilterByFids', { detail: { ids } }))
};

// ============================================================================
// LAYER POLIGONALE: map_details.geojson (più evidente + hover highlight + popup)
// ============================================================================

let mapDetailsLayer = null;

// colore pastello deterministico + versione più “accesa” per hover
function hueForKey(key) {
  let h = 0;
  const s = String(key ?? '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}
function pastelFill(key) {
  const hue = hueForKey(key);
  return `hsl(${hue} 55% 82%)`;
}
function highlightFill(key) {
  const hue = hueForKey(key);
  return `hsl(${hue} 70% 72%)`; // più saturo/scuro → “acceso” ma ancora elegante
}

function baseDetailsStyle(feature) {
  const props = feature?.properties || {};
  const key = props.name ?? props.fid ?? '';
  return {
    pane: detailsPaneName,
    color: 'rgba(2,6,23,0.22)',
    weight: 1.5,         // un filo più evidente
    opacity: 0.35,
    fillColor: pastelFill(key),
    fillOpacity: 0.45     // un filo più evidente
  };
}

function hoveredDetailsStyle(feature) {
  const props = feature?.properties || {};
  const key = props.name ?? props.fid ?? '';
  return {
    color: '#000',
    weight: 2.2,
    opacity: 0.9,
    dashArray: '5 4',     // tratteggiato
    fillColor: highlightFill(key),
    fillOpacity: 0.58
  };
}

// mini preview geometria in popup (no tiles, no toponimi)
function mountGeometryPreview(containerId, feature) {
  const el = document.getElementById(containerId);
  if (!el) return null;

  // se già montata, evita duplicati
  if (el.dataset.mounted === '1') return null;
  el.dataset.mounted = '1';

  // Leaflet vuole un contenitore con dimensioni
  const mini = L.map(el, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    tap: false
  });

  // sfondo trasparente
  el.style.background = 'transparent';
  el.classList.add('md-mini');

  const g = L.geoJSON(feature, {
    style: {
      color: '#111',
      weight: 1.2,
      opacity: 0.85,
      fillColor: '#ffffff',
      fillOpacity: 0.0 // niente riempimento (solo contorno) per “wireframe”
    },
    interactive: false
  }).addTo(mini);

  const b = g.getBounds();
  if (b && b.isValid()) mini.fitBounds(b.pad(0.12));
  else mini.setView([43.5, 12.5], 5);

  // ritorno istanza per cleanup
  return mini;
}

function buildDetailsPopupHTML(props, ids) {
  const title = (props.name || '—').toString().trim();
  const desc  = (props.descrizione || '').toString().trim();
  const hasWiki = props.wikipedia && String(props.wikipedia).trim() !== '';

  const descBlock = desc
    ? `<div class="mapd-desc">${desc}</div>`
    : `<div class="mapd-desc muted">no data available</div>`;

  const geomBlock = `
    <section class="mapd-panel mapd-geom">
      <div class="mapd-panel-h">Anteprima geometria</div>
      <div id="${ids.mapId}" class="mapd-mini"></div>
    </section>
  `;

  const wikiBlock = hasWiki
    ? `
      <section class="mapd-panel mapd-wiki">
        <div class="mapd-panel-h">Wikipedia</div>
        <div id="${ids.wikiId}" class="wiki mapd-wiki-inner">
          <div class="wiki-thumb"></div>
          <div class="wiki-body">
            <div class="wiki-title muted">Caricamento anteprima…</div>
            <div class="wiki-extract muted">Sto recuperando i contenuti da Wikipedia.</div>
          </div>
        </div>
      </section>
    `
    : `
      <section class="mapd-panel mapd-wiki">
        <div class="mapd-panel-h">Wikipedia</div>
        <div class="muted">no data available</div>
      </section>
    `;

  return `
    <div class="popup-card mapd-card">
      <div class="mapd-wrap">
        <!-- COLONNA SINISTRA: descrizione -->
        <div class="mapd-left">
          <div class="mapd-title">${title}</div>
          ${descBlock}
        </div>

        <!-- COLONNA DESTRA: geometria + wikipedia -->
        <div class="mapd-right">
          ${geomBlock}
          ${wikiBlock}
        </div>
      </div>
    </div>
  `;
}

async function loadMapDetailsLayer() {
  const r = await fetch(MAP_DETAILS_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error('Impossibile caricare ' + MAP_DETAILS_URL);
  const gj = await r.json();

  // piccolo CSS inline per la mini preview (solo qui)
  if (!document.getElementById('md-mini-style')) {
    const st = document.createElement('style');
    st.id = 'md-mini-style';
    st.textContent = `
      .md-mini.leaflet-container { background: transparent !important; }
      .md-mini .leaflet-control-container { display:none !important; }
    `;
    document.head.appendChild(st);
  }

  mapDetailsLayer = L.geoJSON(gj, {
    filter: (feature) => {
      const t = feature?.geometry?.type;
      return t === 'Polygon' || t === 'MultiPolygon';
    },
    pane: detailsPaneName,
    style: baseDetailsStyle,
    interactive: true,
    onEachFeature: (feature, layer) => {
      const props = feature?.properties || {};

      const mapId  = nextPopupId();
      const wikiId = nextPopupId();

      const popupHTML = buildDetailsPopupHTML(props, { mapId, wikiId });

      layer.bindPopup(popupHTML, {
        className: 'mapd-popup',
        maxWidth: 720,
        minWidth: 520,
        autoPanPadding: [18, 18]
      });

      layer.on('mouseover', (e) => {
        // evidenzia
        e.target.setStyle(hoveredDetailsStyle(feature));
        e.target.bringToFront();
      });

      layer.on('mouseout', (e) => {
        // ripristina stile base
        if (mapDetailsLayer) mapDetailsLayer.resetStyle(e.target);
      });

      layer.on('popupopen', () => {
        // preview geometria
        const mini = mountGeometryPreview(mapId, feature);
        layer.__miniMap = mini || layer.__miniMap || null;

        // wikipedia
        if (props.wikipedia && String(props.wikipedia).trim() !== '') {
          loadWikipediaPreviewFromUrl(wikiId, props.wikipedia) || loadWikipediaPreview(wikiId, props.wikipedia);
        }
      });

      layer.on('popupclose', () => {
        // cleanup mini-map per non accumulare istanze
        try {
          if (layer.__miniMap) {
            layer.__miniMap.remove();
            layer.__miniMap = null;
          }
        } catch {}
      });
    }
  });

  if (detailsVisible) mapDetailsLayer.addTo(map);
}

// ============================================================================
// LEGENDA INTERATTIVA (bottom-left)
// ============================================================================
function ensureLegendStyles() {
  if (document.getElementById('legendctl-style')) return;
  const st = document.createElement('style');
  st.id = 'legendctl-style';
  st.textContent = `
    .legendctl{
      background: rgba(255,255,255,0.92);
      border: 1px solid rgba(2,6,23,0.10);
      border-radius: 14px;
      padding: 10px 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.18);
      font: 13px/1.25 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: #0f172a;
      min-width: 270px;
    }
    .legendctl-title{ display:flex; flex-direction:column; gap:2px; margin-bottom:8px; }
    .legendctl-title > div:first-child{ font-weight:800; letter-spacing:.2px; }
    .legendctl-sub{ font-size: 11px; color:#475569; }

    .legendctl-block{
      border-top: 1px solid rgba(2,6,23,0.08);
      padding-top: 8px;
      margin-top: 8px;
      display: grid;
      gap: 6px;
    }
    .lg-h{ font-weight:700; font-size: 12px; color:#334155; margin-bottom: 2px; }

    .lg-row{
      display:flex;
      align-items:center;
      gap: 8px;
      width:100%;
      border:0;
      background:transparent;
      padding:2px 0;
      text-align:left;
      cursor:pointer;
      user-select:none;
    }
    .lg-row:focus-visible{ outline:2px solid rgba(37,99,235,.24); outline-offset:2px; border-radius:12px; }
    .lg-row.is-off .lg-icon{ filter:grayscale(1); opacity:.42; }
    .lg-row.is-off .lg-label{ color:#94a3b8; }

    .lg-icon{
      width: 24px; height: 24px;
      border-radius: 9999px;
      background:#fff;
      border: 1px solid rgba(2,6,23,0.10);
      display:grid;
      place-items:center;
      box-shadow: 0 2px 8px rgba(0,0,0,.10);
      flex: 0 0 auto;
      overflow:hidden;
    }
    .lg-icon img{ width: 16px; height: 16px; display:block; object-fit:contain; }

    .lg-swatch{
      width: 14px; height: 14px;
      border-radius: 4px;
      border: 1px solid rgba(2,6,23,0.12);
      background: linear-gradient(135deg, rgba(147,197,253,.55), rgba(167,139,250,.55));
      flex: 0 0 auto;
    }

    .lg-label{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: 10px;
      width: 100%;
      color:#0f172a;
    }
    .lg-count{
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 9999px;
      background: rgba(2,6,23,0.06);
      color:#334155;
    }
    #lg-dims.is-disabled{ opacity: .5; filter: grayscale(0.2); pointer-events: none; }
  `;
  document.head.appendChild(st);
}

function labelForDim(d) {
  if (d === 11) return 'Non in Vandelli (altre mappe)';
  return `Livello ${d}`;
}

function mountLegendControl() {
  ensureLegendStyles();

  const ctl = L.control({ position: 'bottomleft' });
  ctl.onAdd = () => {
    const div = L.DomUtil.create('div', 'legendctl');

    div.innerHTML = `
      <div class="legendctl-title">
        <div class="legendctl-title-row"><span>Legenda</span><button type="button" id="lg-reset" class="lg-reset" title="Ripristina legenda"><i class="bi bi-arrow-counterclockwise"></i></button></div>
        <div class="legendctl-sub">Fonte: Domenico Vandelli · 1746</div>
      </div>

      <div class="legendctl-block" id="lg-dims">

        ${DIM_KEYS.map(d => `
          <button type="button" class="lg-row" data-kind="dim" data-dim="${d}">
            <span class="lg-icon">
              <img src="${ICON_BASE_PATH + (ICON_BY_DIM[d] || ICON_BY_DIM[3])}" alt="dim ${d}">
            </span>
            <span class="lg-label">
              <span>${labelForDim(d)}</span>
              <span class="lg-count">${dimCounts[d] ?? 0}</span>
            </span>
          </button>
        `).join('')}
      </div>
    `;

    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    const dimsWrap = div.querySelector('#lg-dims');
    const resetBtn = div.querySelector('#lg-reset');
    const syncLegendStates = () => {
      div.querySelectorAll('[data-kind="dim"]').forEach(btn => {
        const d = Number(btn.dataset.dim);
        btn.classList.toggle('is-off', !dimEnabled[d]);
      });
    };

    resetBtn?.addEventListener('click', () => {
      toponymsVisible = true;
      DIM_KEYS.forEach(d => { dimEnabled[d] = true; });
      if (!map.hasLayer(clusterGroup)) clusterGroup.addTo(map);
      dimsWrap.classList.remove('is-disabled');
      syncLegendStates();
      rebuildMarkers({ fitBounds: false });
    });

    div.querySelectorAll('[data-kind="dim"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = Number(btn.dataset.dim);
        dimEnabled[d] = !dimEnabled[d];
        syncLegendStates();
        rebuildMarkers({ fitBounds: false });
      });
    });
    syncLegendStates();

    return div;
  };

  ctl.addTo(map);
  return ctl;
}

// ============================================================================
// CARICAMENTO DATI: solo toponimi puntiformi al load
// (i poligoni compaiono on-demand nella "study mode" di una mappa georeferita)
// ============================================================================
fetch(DATA_URL)
  .then(r => {
    if (!r.ok) throw new Error('Impossibile caricare ' + DATA_URL);
    return r.json();
  })
  .then(data => {
    if (!data || !Array.isArray(data.features)) {
      console.error('Formato GeoJSON inatteso. Atteso FeatureCollection con array features.');
      return;
    }

    rawFeatures = data.features;

    // contatori dimensioni vista "default" (solo Point con dimension)
    rawFeatures.forEach(f => {
      if (!isPointMarkerCandidate(f)) return;
      const dim = getDimFromFeature(f);
      if (dimCounts[dim] != null) dimCounts[dim] += 1;
    });

    // precache marker per i soli punti candidati (i poligoni li disegniamo on-demand)
    rawFeatures.forEach(f => {
      if (!isPointMarkerCandidate(f)) return;
      const fidKey = getFidKeyFromFeature(f);
      if (!fidKey) return;
      if (!allMarkers.has(fidKey)) {
        const m = createMarkerForFeature(f);
        if (m) allMarkers.set(fidKey, m);
      }
    });

    // La vista iniziale è gestita dal modulo storico (2006 + 2001).
    // I toponimi restano caricati, ma non forzano più un fitBounds globale.
    rebuildMarkers({ fitBounds: false });
    mountLegendControl();
  })
  .catch(err => {
    console.error(err);
    alert('Errore nel caricamento dei dati: ' + err.message);
  });

// ============================================================================
// OVERLAY CARTOGRAFICO (tile remote con fallback GeoTIFF locale)
// ============================================================================
const REMOTE_TILES = Object.freeze({
  // Nel repository le piramidi sono dentro una cartella omonima aggiuntiva.
  baseUrl: 'https://erasmdif.github.io/terre_unione_reosurces/terre_unione_reosurces/',
  metadataFile: 'leaflet.html',
  defaultMinZoom: 12,
  defaultMaxZoom: 19,
  // geotiff_tile_builder.py invoca gdal2tiles con --xyz.
  defaultTms: false,
  tileExtension: 'png'
});

let currentGeoLayer = null;
let currentGeoFid = null;
let currentGeoOpacity = 0.92;
let geoOverlayRequestId = 0;

function setGeoTiffOpacity(value){
  const v = Math.max(0, Math.min(1, Number(value)));
  currentGeoOpacity = Number.isFinite(v) ? v : 0.92;
  if (currentGeoLayer && typeof currentGeoLayer.setOpacity === 'function') {
    currentGeoLayer.setOpacity(currentGeoOpacity);
  } else if (currentGeoLayer?.options) {
    currentGeoLayer.options.opacity = currentGeoOpacity;
    try { currentGeoLayer.redraw?.(); } catch {}
  }
}

function normalizedTileCode(value){
  return String(value || '').trim();
}

function remoteTileFolderUrl(tileCode){
  const code = normalizedTileCode(tileCode);
  if (!code) return '';
  return `${REMOTE_TILES.baseUrl}${encodeURIComponent(code)}/`;
}

function parseRemoteTileMetadata(html, folderUrl){
  const fitBounds = String(html || '').match(
    /fitBounds\s*\(\s*\[\s*\[\s*([-+\d.eE]+)\s*,\s*([-+\d.eE]+)\s*\]\s*,\s*\[\s*([-+\d.eE]+)\s*,\s*([-+\d.eE]+)\s*\]/i
  );
  const bounds = fitBounds
    ? L.latLngBounds(
        [Number(fitBounds[1]), Number(fitBounds[2])],
        [Number(fitBounds[3]), Number(fitBounds[4])]
      )
    : null;
  const minMatch = String(html || '').match(/minZoom\s*:\s*(\d+)/i);
  const maxMatch = String(html || '').match(/maxZoom\s*:\s*(\d+)/i);
  const tmsMatch = String(html || '').match(/tms\s*:\s*(true|false)/i);
  return {
    available: true,
    folderUrl,
    bounds: bounds?.isValid() ? bounds : null,
    minZoom: minMatch ? Number(minMatch[1]) : REMOTE_TILES.defaultMinZoom,
    maxZoom: maxMatch ? Number(maxMatch[1]) : REMOTE_TILES.defaultMaxZoom,
    tms: tmsMatch ? tmsMatch[1].toLowerCase() === 'true' : REMOTE_TILES.defaultTms
  };
}

const __remoteTileMetadataCache = new Map();
async function getRemoteTileMetadata(tileCode){
  const code = normalizedTileCode(tileCode);
  if (!code) return { available: false };
  if (__remoteTileMetadataCache.has(code)) return __remoteTileMetadataCache.get(code);

  const promise = (async () => {
    const folderUrl = remoteTileFolderUrl(code);
    try {
      const response = await fetch(`${folderUrl}${REMOTE_TILES.metadataFile}`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store'
      });
      if (!response.ok) return { available: false, status: response.status, folderUrl };
      return parseRemoteTileMetadata(await response.text(), folderUrl);
    } catch (error) {
      console.info(`[tiles] ${code}: repository remota non raggiungibile, uso il raster locale.`, error);
      return { available: false, folderUrl, error };
    }
  })();

  __remoteTileMetadataCache.set(code, promise);
  return promise;
}

function createRemoteTileLayer(metadata, opacity){
  const template = `${metadata.folderUrl}{z}/{x}/{y}.${REMOTE_TILES.tileExtension}`;
  const layer = L.tileLayer(template, {
    pane: 'geotiffPane',
    opacity,
    tms: metadata.tms,
    minNativeZoom: metadata.minZoom,
    maxNativeZoom: metadata.maxZoom,
    maxZoom: Math.max(22, metadata.maxZoom),
    bounds: metadata.bounds || undefined,
    noWrap: true,
    crossOrigin: true,
    keepBuffer: 3,
    updateWhenIdle: true,
    attribution: 'Carta storica: Terre di Castelli'
  });
  layer._terreUnioneSource = 'remote-tiles';
  layer._terreUnioneBounds = metadata.bounds || null;
  layer.getBounds = () => layer._terreUnioneBounds;
  return layer;
}

function activateGeoOverlayLayer(layer, fid, opacity, fit, requestId, source){
  if (requestId !== geoOverlayRequestId) return null;
  if (currentGeoLayer) map.removeLayer(currentGeoLayer);
  layer.addTo(map);
  currentGeoLayer = layer;
  currentGeoFid = fid;
  currentGeoOpacity = opacity;

  const bounds = layer.getBounds?.();
  if (fit && bounds?.isValid?.()) map.fitBounds(bounds.pad(0.05));

  window.dispatchEvent(new CustomEvent('maps:geoOverlayChanged', {
    detail: { activeFid: fid, source }
  }));
  return layer;
}
function ensureWebgisLoading(){
  let el = document.getElementById('webgis-loading');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'webgis-loading';
  el.className = 'webgis-loading';
  el.hidden = true;
  el.innerHTML = '<div class="webgis-loading-card"><span class="webgis-loading-spinner"></span><strong>Caricamento</strong><small>Preparazione overlay e geometrie…</small></div>';
  document.body.appendChild(el);
  return el;
}
function showWebgisLoading(label = 'Caricamento overlay…'){
  const el = ensureWebgisLoading();
  const small = el.querySelector('small');
  if (small) small.textContent = label;
  el.hidden = false;
}
function hideWebgisLoading(){
  const el = document.getElementById('webgis-loading');
  if (el) el.hidden = true;
}

function getGeoRasterGlobals() {
  const parseFn =
    window.parseGeoraster ||
    (window.georaster && window.georaster.parseGeoraster);

  const LayerCtor =
    window.GeoRasterLayer ||
    (window["georasterLayer"] && window["georasterLayer"].default) ||
    (window["georaster-layer-for-leaflet"] && window["georaster-layer-for-leaflet"].default);

  return { parseFn, LayerCtor };
}

// Prova in sequenza una lista di URL candidati (estensioni fallback),
// ferma alla prima che risponde 200 OK.
async function fetchFirstOk(urls){
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (res.ok) return { url: u, arrayBuffer: await res.arrayBuffer() };
    } catch { /* try next */ }
  }
  throw new Error('Nessuna delle URL candidate ha risposto 200: ' + urls.join(' | '));
}

const __geoRasterCache = new Map();
async function getCachedGeoRaster(candidates){
  const key = candidates.join('|');
  if (__geoRasterCache.has(key)) return __geoRasterCache.get(key);
  const promise = (async () => {
    const { arrayBuffer } = await fetchFirstOk(candidates);
    const { parseFn } = getGeoRasterGlobals();
    const georaster = await parseFn(arrayBuffer);
    return { georaster };
  })();
  __geoRasterCache.set(key, promise);
  return promise;
}

async function addLocalGeoTiffOverlay(url, fid, opts = {}, requestId = geoOverlayRequestId) {
  const { fit = true, opacity = currentGeoOpacity } = opts;
  try {
    const { parseFn, LayerCtor } = getGeoRasterGlobals();
    if (typeof parseFn !== 'function' || typeof LayerCtor !== 'function') {
      console.error('GeoRaster globals not found', { parseFn, LayerCtor });
      alert('Modulo GeoTIFF non disponibile. Le globali non sono esposte dalla libreria.');
      return null;
    }

    const candidates = Array.isArray(url) ? url : [url];
    const { georaster } = await getCachedGeoRaster(candidates);
    if (requestId !== geoOverlayRequestId) return null;

    const layer = new LayerCtor({
      georaster,
      opacity,
      pane: 'geotiffPane',
      resolution: 128,
      pixelValuesToColorFn: (vals) => {
        if (!vals || !vals.length) return null;
        let [r,g,b,a] = vals.map(v => Number.isFinite(v) ? Math.max(0, Math.min(255, Math.round(v))) : 0);
        if ((r + g + b) === 0 && !a) return null;
        // Molti GeoTIFF JPEG/COG salvati con PHOTOMETRIC=YCbCr arrivano qui come Y,Cb,Cr.
        // La conversione euristica evita l'effetto rosa/verde, senza rompere RGB normali.
        const likelyYCbCr = vals.length >= 3 && Math.abs(g - 128) + Math.abs(b - 128) < 105;
        if (likelyYCbCr) {
          const y = r, cb = g - 128, cr = b - 128;
          r = Math.max(0, Math.min(255, Math.round(y + 1.402 * cr)));
          g = Math.max(0, Math.min(255, Math.round(y - 0.344136 * cb - 0.714136 * cr)));
          b = Math.max(0, Math.min(255, Math.round(y + 1.772 * cb)));
        }
        return `rgba(${r},${g},${b},${a != null && a > 0 ? Math.min(1, a / 255) : 1})`;
      }
    });

    layer._terreUnioneSource = 'local-geotiff';
    return activateGeoOverlayLayer(layer, fid, opacity, fit, requestId, 'local-geotiff');
  } catch (err) {
    if (requestId !== geoOverlayRequestId) return null;
    console.error('Errore nel caricamento del GeoTIFF', err);
    alert('Impossibile caricare il GeoTIFF (verifica CORS/COG): ' + (err?.message || err));
    if (currentGeoLayer) { map.removeLayer(currentGeoLayer); currentGeoLayer = null; }
    currentGeoFid = null;
    window.dispatchEvent(new CustomEvent('maps:geoOverlayChanged', { detail: { activeFid: null } }));
    return null;
  }
}

// url può essere una stringa singola o un array di candidati locali.
// Se opts.tileCode è valorizzato, prova prima:
// https://erasmdif.github.io/terre_unione_reosurces/terre_unione_reosurces/<SIGLA>/{z}/{x}/{y}.png
async function addGeoTiffOverlay(url, fid, opts = {}) {
  const { fit = true, opacity = currentGeoOpacity, tileCode = '' } = opts;
  const candidates = (Array.isArray(url) ? url : [url]).filter(Boolean);
  const requestId = ++geoOverlayRequestId;
  const code = normalizedTileCode(tileCode);

  if (code) {
    const metadata = await getRemoteTileMetadata(code);
    if (requestId !== geoOverlayRequestId) return null;
    if (metadata.available) {
      const tileLayer = createRemoteTileLayer(metadata, opacity);
      const activated = activateGeoOverlayLayer(tileLayer, fid, opacity, fit, requestId, 'remote-tiles');
      if (!activated) return null;

      let loadedTiles = 0;
      let failedTiles = 0;
      let fallbackStarted = false;
      let fallbackTimer = null;
      tileLayer.on('tileload', () => {
        loadedTiles += 1;
        if (fallbackTimer) {
          window.clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
      });
      tileLayer.on('tileerror', () => {
        failedTiles += 1;
        if (fallbackStarted || fallbackTimer || loadedTiles > 0 || failedTiles < 3) return;
        // Alcune tile di bordo possono legittimamente non esistere. Attendiamo
        // che almeno una tile valida abbia il tempo di caricarsi prima del fallback.
        fallbackTimer = window.setTimeout(() => {
          fallbackTimer = null;
          if (fallbackStarted || loadedTiles > 0) return;
          if (currentGeoLayer !== tileLayer || requestId !== geoOverlayRequestId) return;
          fallbackStarted = true;
          console.warn(`[tiles] ${code}: nessuna tile valida caricata; ripiego sul GeoTIFF locale.`);
          addLocalGeoTiffOverlay(candidates, fid, { fit, opacity }, requestId);
        }, 1800);
      });

      console.info(`[tiles] ${code}: overlay remoto attivo (${metadata.tms ? 'TMS' : 'XYZ'}, zoom ${metadata.minZoom}–${metadata.maxZoom}).`);
      return tileLayer;
    }
  }

  return addLocalGeoTiffOverlay(candidates, fid, { fit, opacity }, requestId);
}

function clearGeoTiffOverlay() {
  geoOverlayRequestId += 1;
  if (currentGeoLayer) {
    map.removeLayer(currentGeoLayer);
    currentGeoLayer = null;
  }
  currentGeoFid = null;
  window.dispatchEvent(new CustomEvent('maps:geoOverlayChanged', { detail: { activeFid: null } }));
}

// Listener dal pannello (toggle)
window.addEventListener('maps:toggleGeoOverlay', (e) => {
  const { fid, url, tileCode } = e.detail || {};
  if (!fid || !url) return;

  if (currentGeoLayer && String(currentGeoFid) === String(fid)) {
    clearGeoTiffOverlay();
  } else {
    addGeoTiffOverlay(url, fid, { tileCode });
  }
});

// ============================================================================
// STUDY MODE — mappa georeferita + poligoni + pannello laterale + modale ricco
// ============================================================================
// Entrypoint: evento "maps:studyMap" con payload:
//   { fid, sigla, name, descrizione, cartiglio, geoCandidates:[url...],
//     polygonFids:[fid...], pointFids:[fid...], peopleByPlace:{fid:[people]} }
// Chiusura: evento "maps:studyMap:close"
// Legge window.WEBGIS_DATA per lookup parent e altri metadati.



let studyState = null;
const STUDY_PANE = 'studyPolyPane';
if (!map.getPane(STUDY_PANE)) map.createPane(STUDY_PANE);
map.getPane(STUDY_PANE).style.zIndex = 380;
map.getPane(STUDY_PANE).style.pointerEvents = 'auto';

const STUDY_LABEL_PANE = 'studyLabelPane';
if (!map.getPane(STUDY_LABEL_PANE)) map.createPane(STUDY_LABEL_PANE);
map.getPane(STUDY_LABEL_PANE).style.zIndex = 430;
map.getPane(STUDY_LABEL_PANE).style.pointerEvents = 'auto';

function firstNonEmpty(...vals){
  for (const v of vals){
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s && s.toLowerCase() !== 'null') return s;
  }
  return '';
}
function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function normKey(v){ return String(v ?? '').trim().toLowerCase(); }
function getPlaceFeature(fid){
  const d = window.WEBGIS_DATA;
  if (!d?.placesById) return null;
  return d.placesById.get(String(fid)) || null;
}
function getMapRecordById(fid){
  const d = window.WEBGIS_DATA;
  return d?.mapsById?.get(String(fid)) || null;
}
function getPeopleForPlace(fid){
  const d = window.WEBGIS_DATA;
  if (!d) return [];
  const ids = d.peopleByPlaceId?.get(String(fid)) || [];
  return ids.map(id => d.peopleById?.get(String(id))).filter(Boolean);
}
function getRelatedPeopleForPlace(fid, { includeParent = true } = {}){
  const seen = new Map();
  const collect = (placeId) => {
    getPeopleForPlace(placeId).forEach(person => {
      if (!person?.id) return;
      seen.set(String(person.id), person);
    });
  };
  collect(fid);
  if (includeParent) {
    const feature = getPlaceFeature(fid);
    const parentFid = firstNonEmpty(feature?.properties?.parent_id);
    if (parentFid) collect(parentFid);
  }
  return Array.from(seen.values());
}
function isFamilyPerson(person){
  const tipo = normKey(person?.tipo || person?.tipo_soggetto);
  const name = normKey(person?.name);
  return tipo.includes('famiglia') || tipo.includes('casato') || name.startsWith('famiglia ');
}

function isEntityPerson(person){
  const tipo = normKey(person?.tipo || person?.tipo_soggetto);
  return tipo.includes('ente') || tipo.includes('comune') || tipo.includes('istituzione');
}
function lastTokenName(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? normKey(parts[parts.length - 1].replace(/[.,;:()]/g, '')) : '';
}
function inferRelatedOwnerIds(person){
  const d = window.WEBGIS_DATA || {};
  const ids = new Set([String(person?.id || '')]);
  if (!person?.id) return Array.from(ids).filter(Boolean);
  const parentId = firstNonEmpty(person.parent_id, person.parent, person.id_parent);
  if (parentId) ids.add(String(parentId));
  d.peopleById?.forEach(candidate => {
    const cid = String(candidate?.id || '');
    if (!cid || cid === String(person.id)) return;
    const cParent = firstNonEmpty(candidate.parent_id, candidate.parent, candidate.id_parent);
    if ((isFamilyPerson(person) || isEntityPerson(person)) && cParent && String(cParent) === String(person.id)) ids.add(cid);
  });
  if (parentId || isFamilyPerson(person) || isEntityPerson(person)) return Array.from(ids).filter(Boolean);
  const surname = lastTokenName(person?.name);
  if (!surname) return Array.from(ids).filter(Boolean);
  d.peopleById?.forEach(candidate => {
    if (!candidate?.id || String(candidate.id) === String(person.id)) return;
    if (!(isFamilyPerson(candidate) || isEntityPerson(candidate))) return;
    const cname = normKey(candidate.name);
    if (cname === surname || cname.endsWith(' ' + surname) || surname.endsWith(' ' + cname) || cname.includes(surname)) ids.add(String(candidate.id));
  });
  return Array.from(ids).filter(Boolean);
}
function getStudyTypeKey(feature){ return normKey(feature?.properties?.tipologia || 'non classificato'); }
function getStudyTypeLabel(feature){ return labelForTipologia(feature?.properties?.tipologia || 'Non classificato'); }
function getStudyFeatureName(feature){ return firstNonEmpty(feature?.properties?.name, feature?.properties?.as, `#${feature?.properties?.fid ?? ''}`); }
function latLngWithPixelOffset(latlng, dx, dy){
  const p = map.project(latlng, map.getZoom());
  return map.unproject(L.point(p.x + dx, p.y + dy), map.getZoom());
}
function inferComuneLabelFromArchive(archivio){
  const s = String(archivio || '').trim();
  const m = s.match(/archivio\s+di\s+(.+)$/i);
  return m ? m[1].trim() : s || 'n/d';
}
function getMapsForPlace(fid){
  const d = window.WEBGIS_DATA || {};
  const out = [];
  const seen = new Set();
  const byNm = d.placeToMaps?.get(String(fid));
  if (byNm) {
    Array.from(byNm).forEach(mapId => {
      const rec = d.mapsById?.get(String(mapId));
      if (rec && !seen.has(String(rec.fid))) { seen.add(String(rec.fid)); out.push(rec); }
    });
  }
  if (!out.length) {
    const place = getPlaceFeature(fid);
    const raw = firstNonEmpty(place?.properties?.mappa);
    raw.split(';').map(x => x.trim()).filter(Boolean).forEach(sigla => {
      const rec = Array.from(d.mapsById?.values?.() || []).find(m => String(m.sigla) === sigla || String(m.name) === sigla);
      if (rec && !seen.has(String(rec.fid))) { seen.add(String(rec.fid)); out.push(rec); }
      else if (sigla && !seen.has(sigla)) { seen.add(sigla); out.push({ fid: sigla, sigla, name: sigla, archivio: '', year: '' }); }
    });
  }
  return out;
}
function ensureChildrenByParentIndex(){
  const d = window.WEBGIS_DATA || {};
  if (d.childrenByParent) return d.childrenByParent;
  const idx = new Map();
  d.placesById?.forEach((f, fid) => {
    const parentId = firstNonEmpty(f?.properties?.parent_id);
    if (!parentId) return;
    if (!idx.has(String(parentId))) idx.set(String(parentId), []);
    idx.get(String(parentId)).push(f);
  });
  d.childrenByParent = idx;
  return idx;
}
function projectLonLatToMeters(lon, lat){
  const x = lon * 20037508.34 / 180;
  let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  y = y * 20037508.34 / 180;
  return [x, y];
}
function ringAreaMeters(ring){
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % ring.length];
    const [x1, y1] = projectLonLatToMeters(lon1, lat1);
    const [x2, y2] = projectLonLatToMeters(lon2, lat2);
    sum += (x1 * y2) - (x2 * y1);
  }
  return Math.abs(sum / 2);
}
function featureAreaSqm(feature){
  const geom = feature?.geometry;
  if (!geom?.coordinates) return 0;
  if (geom.type === 'Polygon') {
    const coords = geom.coordinates;
    if (!coords.length) return 0;
    let area = ringAreaMeters(coords[0]);
    for (let i = 1; i < coords.length; i++) area -= ringAreaMeters(coords[i]);
    return Math.max(0, area);
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.reduce((tot, poly) => {
      if (!poly?.length) return tot;
      let area = ringAreaMeters(poly[0]);
      for (let i = 1; i < poly.length; i++) area -= ringAreaMeters(poly[i]);
      return tot + Math.max(0, area);
    }, 0);
  }
  return 0;
}
function formatArea(areaSqm){
  if (!Number.isFinite(areaSqm) || areaSqm <= 0) return 'n/d';
  if (areaSqm >= 10000) return `${(areaSqm / 10000).toFixed(2)} ha`;
  return `${Math.round(areaSqm)} m²`;
}
function placeHasPerson(personId, placeFid){
  return getRelatedPeopleForPlace(placeFid).some(p => String(p.id) === String(personId));
}
function collectPortfolioForPerson(personId, excludePlaceFid = null){
  const d = window.WEBGIS_DATA || {};
  const items = [];
  d.placesById?.forEach((feature, fid) => {
    if (String(fid) === String(excludePlaceFid)) return;
    const gt = feature?.geometry?.type;
    if (gt !== 'Polygon' && gt !== 'MultiPolygon') return;
    if (!placeHasPerson(personId, fid)) return;
    items.push({
      fid: String(fid),
      feature,
      name: getStudyFeatureName(feature),
      maps: getMapsForPlace(fid),
      areaSqm: featureAreaSqm(feature),
      owners: getRelatedPeopleForPlace(fid)
    });
  });
  items.sort((a,b) => (b.areaSqm - a.areaSqm) || a.name.localeCompare(b.name, 'it'));
  return items;
}
function portfolioDedupeKey(holding){
  const parentId = firstNonEmpty(holding?.feature?.properties?.parent_id);
  return parentId && parentId !== '0' ? `parent:${parentId}` : `fid:${holding?.fid}`;
}
function collectPortfolioForOwnerGroup(person){
  const ids = inferRelatedOwnerIds(person);
  const items = new Map();
  ids.forEach(id => {
    collectPortfolioForPerson(id, null).forEach(h => {
      const key = portfolioDedupeKey(h);
      const prev = items.get(key);
      if (!prev || (Number(h.areaSqm) || 0) > (Number(prev.areaSqm) || 0)) items.set(key, h);
    });
  });
  return Array.from(items.values()).sort((a,b) => (b.areaSqm - a.areaSqm) || a.name.localeCompare(b.name, 'it'));
}
function getFeatureFamilyIds(fid){
  return studyState?.familyIdsByPlace?.get(String(fid)) || new Set();
}
function featureMatchesFamilyFilter(fid){
  const sel = studyState?.selectedFamilyIds;
  if (!sel?.size) return true;
  const ids = getFeatureFamilyIds(fid);
  for (const id of ids) if (sel.has(String(id))) return true;
  return false;
}
function featureMatchesTypeFilter(feature){
  const sel = studyState?.selectedTypeKeys;
  if (!sel?.size) return true;
  return sel.has(getStudyTypeKey(feature));
}
function featureMatchesFilters(feature){
  const fid = String(feature?.properties?.fid ?? '');
  return featureMatchesTypeFilter(feature) && featureMatchesFamilyFilter(fid);
}
function featureIsColorized(feature){
  const sel = studyState?.selectedTypeKeys;
  return !!(sel?.size && sel.has(getStudyTypeKey(feature)));
}
function labelShouldBeBaseVisible(fid, feature){
  if (!featureMatchesFilters(feature)) return false;
  if (!studyState?.showLabels) return false;
  return !!studyState?.labelEligible?.has(String(fid));
}
function studyPolyStyle(feature, opts = {}){
  const tipColor = colorForTipologia(feature?.properties?.tipologia);
  const fid = String(feature?.properties?.fid ?? '');
  const hovered = !!opts.hovered;
  const active = !!opts.active;
  const matches = featureMatchesFilters(feature);
  const colorized = featureIsColorized(feature);
  const visibleByToggle = !!studyState?.showPolygons;
  const polyOpacity = Number.isFinite(studyState?.polyOpacity) ? studyState.polyOpacity : 0.65;

  if (active) {
    return { pane: STUDY_PANE, color: tipColor, weight: 3.2, opacity: 1, fillColor: tipColor, fillOpacity: 0.16 };
  }
  if (hovered) {
    return { pane: STUDY_PANE, color: tipColor, weight: 2.6, opacity: 0.98, fillColor: tipColor, fillOpacity: 0.11 };
  }
  if (!matches) {
    return { pane: STUDY_PANE, color: 'rgba(148,163,184,0.12)', weight: 0.8, opacity: visibleByToggle ? 0.12 : 0, fillColor: tipColor, fillOpacity: 0 };
  }
  if (!visibleByToggle) {
    return { pane: STUDY_PANE, color: tipColor, weight: 1, opacity: 0, fillColor: tipColor, fillOpacity: 0 };
  }
  if (colorized) {
    return { pane: STUDY_PANE, color: tipColor, weight: 1.9, opacity: 0.95 * polyOpacity, fillColor: tipColor, fillOpacity: 0.05 * polyOpacity };
  }
  return { pane: STUDY_PANE, color: 'rgba(71,85,105,0.72)', weight: 1.15, opacity: 0.72 * polyOpacity, fillColor: tipColor, fillOpacity: 0 };
}
function applyStudyPolyStyles(){
  if (!studyState?.layer) return;
  studyState.layer.eachLayer(ly => {
    const fid = String(ly.feature?.properties?.fid ?? '');
    ly.setStyle(studyPolyStyle(ly.feature, {
      hovered: studyState.hoveredPolyFid === fid,
      active: studyState.activePolyFid === fid
    }));
    if (studyState.hoveredPolyFid === fid || studyState.activePolyFid === fid) ly.bringToFront();
  });
}
function updateLabelLineStyle(fid, feature){
  const marker = studyState?.labelByFid?.get(String(fid));
  const line = studyState?.leaderByFid?.get(String(fid));
  const chip = marker?.getElement()?.querySelector('.study-label-chip');
  if (!marker || !chip) return;
  const color = colorForTipologia(feature?.properties?.tipologia);
  const active = studyState?.activePolyFid === String(fid);
  const hovered = studyState?.hoveredPolyFid === String(fid);
  const matches = featureMatchesFilters(feature);
  const baseVisible = labelShouldBeBaseVisible(fid, feature);
  const labelOpacity = Number.isFinite(studyState?.labelOpacity) ? studyState.labelOpacity : 0.68;
  const visible = active || hovered || baseVisible;
  chip.style.setProperty('--study-label-color', color);
  chip.classList.toggle('is-active', active);
  chip.classList.toggle('is-hover', hovered);
  chip.classList.toggle('is-colored', featureIsColorized(feature) && matches);
  chip.classList.toggle('is-muted', !visible || !matches);
  chip.style.opacity = visible && matches ? (active ? '1' : hovered ? '0.98' : String(labelOpacity)) : '0';
  chip.style.pointerEvents = 'auto';
  marker.getElement().style.display = (visible && matches) ? '' : 'none';
  marker.setZIndexOffset(active ? 1000 : hovered ? 500 : 0);
  if (line) {
    const lineVisible = visible && matches;
    line.setStyle({
      color: active || hovered || featureIsColorized(feature) ? color : 'rgba(100,116,139,0.45)',
      opacity: lineVisible ? (active ? 0.9 : hovered ? 0.78 : 0.42) : 0,
      weight: active ? 1.8 : hovered ? 1.4 : 1,
      dashArray: active || hovered ? '2 4' : '3 5'
    });
  }
}
function refreshStudyLabels(){
  if (!studyState?.labelByFid) return;
  studyState.labelByFid.forEach((marker, fid) => {
    const ly = studyState.polyByFid.get(String(fid));
    if (ly) updateLabelLineStyle(fid, ly.feature);
  });
}
function refreshStudyCentroidIcons(){
  if (!studyState) return;
  if (!studyState.centroidLayer) {
    studyState.centroidLayer = L.layerGroup().addTo(map);
  }
  studyState.centroidLayer.clearLayers();
  (studyState.polyFeatures || []).forEach(feature => {
    const fid = String(feature?.properties?.fid ?? '');
    const ly = studyState.polyByFid?.get(fid);
    const show = studyState.activePolyFid === fid || studyState.hoveredPolyFid === fid || (studyState.selectedTypeKeys?.size && studyState.selectedTypeKeys.has(getStudyTypeKey(feature)));
    if (!show || !ly?.getBounds) return;
    const center = ly.getBounds().getCenter();
    const tip = firstNonEmpty(feature?.properties?.tipologia);
    const icon = L.divIcon({
      className: 'study-centroid-icon',
      html: `<span style="--centroid-color:${colorForTipologia(tip)}"><img src="${iconPathForTipologia(tip)}" alt=""></span>`,
      iconSize: [36,36],
      iconAnchor: [18,18]
    });
    L.marker(center, { pane: STUDY_LABEL_PANE, icon, interactive:false, keyboard:false }).addTo(studyState.centroidLayer);
  });
}
function refreshStudyVisualState(){
  applyStudyPolyStyles();
  refreshStudyLabels();
  refreshStudyCentroidIcons();
  updateStudyCounters();
}
function setStudyHovered(fid){ if (!studyState) return; studyState.hoveredPolyFid = fid ? String(fid) : null; refreshStudyVisualState(); }
function setStudyActive(fid){ if (!studyState) return; studyState.activePolyFid = fid ? String(fid) : null; refreshStudyVisualState(); }
function clearStudyActive(){ if (!studyState) return; studyState.activePolyFid = null; refreshStudyVisualState(); }
function ensureDashboardCollapseHandle(){
  const sidebar = document.getElementById('dashboard');
  if (!sidebar) return null;
  let btn = document.getElementById('dashboard-collapse-handle');
  if (btn) return btn;
  btn = document.createElement('button');
  btn.id = 'dashboard-collapse-handle';
  btn.type = 'button';
  btn.className = 'dashboard-collapse-handle';
  btn.hidden = true;
  btn.innerHTML = '<i class="bi bi-layout-sidebar-inset"></i>';
  btn.addEventListener('click', () => setStudySidebarCollapsed(!studyState?.dashboardCollapsed));
  sidebar.appendChild(btn);
  return btn;
}
function setStudySidebarCollapsed(collapsed){
  const appEl = document.getElementById('app');
  const sidebarEl = document.getElementById('dashboard');
  const btn = ensureDashboardCollapseHandle();
  const isCollapsed = !!collapsed;
  if (btn) btn.hidden = !studyState;
  appEl?.classList.toggle('study-dashboard-collapsed', isCollapsed);
  sidebarEl?.classList.toggle('is-collapsed', isCollapsed);
  if (studyState) studyState.dashboardCollapsed = isCollapsed;
  if (btn) {
    btn.classList.toggle('is-collapsed', isCollapsed);
    btn.setAttribute('aria-label', isCollapsed ? 'Apri pannello mappe' : 'Chiudi pannello mappe');
    btn.innerHTML = isCollapsed ? '<i class="bi bi-chevron-left"></i>' : '<i class="bi bi-layout-sidebar-inset"></i>';
  }
}
function updateStudyCounters(){
  const typeSelEl = document.getElementById('sp-type-selected');
  const famSelEl = document.getElementById('sp-family-selected');
  if (typeSelEl) typeSelEl.textContent = String(studyState?.selectedTypeKeys?.size || 0);
  if (famSelEl) famSelEl.textContent = String(studyState?.selectedFamilyIds?.size || 0);
}
function buildStudyPanel(detail){
  document.getElementById('study-panel')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'study-panel';
  wrap.className = 'study-panel';

  const name = detail.name || `Mappa ${detail.sigla || '#'+detail.fid}`;
  const archive = detail.archivio || 'Archivio';
  const year = detail.year || 'n/d';
  const typeGroups = new Map();
  (studyState?.polyFeatures || []).forEach(f => {
    const key = getStudyTypeKey(f);
    if (!typeGroups.has(key)) typeGroups.set(key, { key, raw: firstNonEmpty(f?.properties?.tipologia), label: getStudyTypeLabel(f), count: 0 });
    typeGroups.get(key).count += 1;
  });
  const families = Array.from(studyState?.familiesAgg?.values?.() || []).sort((a,b) => (a.person?.name || '').localeCompare(b.person?.name || '', 'it'));

  wrap.innerHTML = `
    <div class="sp-head">
      <div class="sp-title-wrap">
        <div class="sp-title-row"><span class="sp-title-icon"><i class="bi bi-map"></i></span><div><div class="sp-title">${escapeHtml(name)}</div><div class="sp-meta">${escapeHtml(archive)} · ${escapeHtml(year)}</div></div></div>
      </div>
      <div class="sp-head-actions">
        <div class="sp-viewswitch">
          <button type="button" class="sp-segment is-active" data-role="sp-view" data-view="interactive"><i class="bi bi-sliders"></i><span>Interattiva</span></button>
          <button type="button" class="sp-segment" data-role="sp-view" data-view="info"><i class="bi bi-journal-richtext"></i><span>Info mappa</span></button>
        </div>
        <button class="sp-close" title="Chiudi">✕</button>
      </div>
    </div>
    <div class="sp-body">
      <div class="sp-content-panel is-active" data-view-pane="interactive">
        <div class="sp-columns">
          <section class="sp-column sp-column--visual">
            <div class="sp-col-head"><h4>Visualizzazione</h4></div>
            <div class="sp-control-card">
              <label class="sp-switchrow"><span><i class="bi bi-bounding-box"></i> Poligoni</span><button type="button" class="sp-switch ${studyState.showPolygons ? 'is-on' : ''}" data-role="toggle-polygons" aria-pressed="${studyState.showPolygons ? 'true' : 'false'}"><span></span></button></label>
              <label class="sp-switchrow"><span><i class="bi bi-type"></i> Etichette</span><button type="button" class="sp-switch ${studyState.showLabels ? 'is-on' : ''}" data-role="toggle-labels" aria-pressed="${studyState.showLabels ? 'true' : 'false'}"><span></span></button></label>
              <label class="sp-sliderrow"><span>Opacità mappa</span><div><input id="sp-map-opacity" type="range" min="0.15" max="1" step="0.05" value="${studyState.mapOpacity}"><strong id="sp-map-opacity-val">${Math.round(studyState.mapOpacity * 100)}%</strong></div></label>
              <label class="sp-sliderrow"><span>Opacità poligoni</span><div><input id="sp-poly-opacity" type="range" min="0" max="1" step="0.05" value="${studyState.polyOpacity}"><strong id="sp-poly-opacity-val">${Math.round(studyState.polyOpacity * 100)}%</strong></div></label>
              <label class="sp-sliderrow"><span>Opacità etichette</span><div><input id="sp-label-opacity" type="range" min="0.2" max="1" step="0.05" value="${studyState.labelOpacity}"><strong id="sp-label-opacity-val">${Math.round(studyState.labelOpacity * 100)}%</strong></div></label>
            </div>
          </section>
          <section class="sp-column">
            <div class="sp-col-head"><h4>Categorie</h4><span class="sp-counter"><b id="sp-type-selected">0</b>/${typeGroups.size}</span></div>
            <div class="sp-checklist sp-checklist--iconic">${Array.from(typeGroups.values()).map(obj => `
              <button type="button" class="sp-checkitem sp-type-iconbtn" data-kind="type" data-key="${escapeHtml(obj.key)}">
                <span class="sp-check-avatar sp-check-avatar--img"><img src="${iconPathForTipologia(obj.raw)}" alt="${escapeHtml(obj.label)}"></span>
                <span class="sp-check-text">${escapeHtml(obj.label)}</span>
                <span class="sp-check-count">${obj.count}</span>
              </button>`).join('') || '<div class="sp-empty">Nessuna categoria</div>'}
            </div>
          </section>
          <section class="sp-column">
            <div class="sp-col-head"><h4>Proprietari</h4><span class="sp-counter"><b id="sp-family-selected">0</b>/${families.length}</span></div>
            <div class="sp-searchmini"><i class="bi bi-search"></i><input id="sp-family-search" type="search" placeholder="Cerca proprietario..."></div>
            <div class="sp-checklist sp-checklist--families">${families.map(({ person, places }) => `
              <button type="button" class="sp-checkitem sp-family-row" data-kind="family" data-id="${escapeHtml(person.id)}" data-label="${escapeHtml(normKey(person.name))}">
                <span class="sp-check-avatar"><i class="bi ${isFamilyPerson(person) ? 'bi-people' : 'bi-person'}"></i></span>
                <span class="sp-check-text">${escapeHtml(person.name)}</span>
                <span class="sp-check-count">${places.size}</span>
              </button>`).join('') || '<div class="sp-empty">Nessun proprietario</div>'}
            </div>
          </section>
        </div>
      </div>
      <div class="sp-content-panel" data-view-pane="info">
        <div class="sp-mapinfo-grid">
          ${detail.cartiglio ? `<section class="sp-mapinfo-card"><h4><i class="bi bi-card-text"></i> Cartiglio</h4><div class="sp-mapinfo-text">${escapeHtml(detail.cartiglio)}</div></section>` : ''}
          ${detail.descrizione ? `<section class="sp-mapinfo-card"><h4><i class="bi bi-file-earmark-text"></i> Descrizione</h4><div class="sp-mapinfo-text">${escapeHtml(detail.descrizione)}</div></section>` : ''}
          ${(!detail.cartiglio && !detail.descrizione) ? `<div class="sp-empty">Nessuna informazione testuale disponibile per questa mappa.</div>` : ''}
        </div>
      </div>
    </div>`;

  document.getElementById('map')?.appendChild(wrap);
  try { L.DomEvent.disableClickPropagation(wrap); L.DomEvent.disableScrollPropagation(wrap); } catch {}
  return wrap;
}
function buildStudyPolygons(detail){
  const feats = (detail.polygonFids || []).map(fid => getPlaceFeature(fid)).filter(f => f && ['Polygon','MultiPolygon'].includes(f.geometry?.type));
  const polyByFid = new Map();
  const layer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
    pane: STUDY_PANE,
    style: f => studyPolyStyle(f),
    onEachFeature: (f, ly) => {
      const fid = String(f.properties?.fid ?? '');
      if (fid) polyByFid.set(fid, ly);
      ly.on('mouseover', () => setStudyHovered(fid));
      ly.on('mouseout', () => setStudyHovered(null));
      ly.on('click', () => { setStudyActive(fid); openStudyPolyModal(f); });
    }
  });
  return { layer, polyByFid, features: feats };
}
function computeLabelCandidate(feature, index){
  const fid = String(feature?.properties?.fid ?? '');
  const layer = studyState?.polyByFid?.get(fid);
  const center = layer?.getBounds?.()?.getCenter?.();
  if (!center) return null;
  const area = featureAreaSqm(feature);
  const baseAngles = [-30, 35, 115, 150, -120, 75, -75, 165];
  const angle = baseAngles[index % baseAngles.length] * Math.PI / 180;
  const radius = 92 + (index % 4) * 16;
  const dx = Math.round(Math.cos(angle) * radius);
  const dy = Math.round(Math.sin(angle) * radius);
  const labelLatLng = latLngWithPixelOffset(center, dx, dy);
  const centerPx = map.project(center, map.getZoom());
  const labelPx = map.project(labelLatLng, map.getZoom());
  const text = getStudyFeatureName(feature);
  const width = Math.min(190, 28 + text.length * 6.4);
  const height = 22;
  return { fid, feature, area, center, labelLatLng, centerPx, labelPx, rect: { x: labelPx.x, y: labelPx.y - 12, w: width, h: height } };
}
function rectsOverlap(a, b, pad = 14){
  return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x || a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
}
function computeVisibleLabels(){
  const candidates = (studyState?.polyFeatures || []).map((f, idx) => computeLabelCandidate(f, idx)).filter(Boolean);
  candidates.sort((a,b) => (b.area - a.area) || a.fid.localeCompare(b.fid));
  const accepted = [];
  const visible = new Set();
  candidates.forEach(item => {
    const collision = accepted.some(r => rectsOverlap(item.rect, r.rect));
    if (!collision) {
      accepted.push(item);
      visible.add(item.fid);
    }
  });
  studyState.labelEligible = visible;
  return candidates;
}
function buildStudyLabels(){
  if (!studyState?.layer) return;
  if (studyState.labelLayer) { try { map.removeLayer(studyState.labelLayer); } catch {} }
  const labelLayer = L.layerGroup();
  const labelByFid = new Map();
  const leaderByFid = new Map();
  const candidates = computeVisibleLabels();
  candidates.forEach(item => {
    const line = L.polyline([item.center, item.labelLatLng], { pane: STUDY_LABEL_PANE, interactive: false, color: 'rgba(100,116,139,0.35)', weight: 1, opacity: 0.34, dashArray: '3 5' }).addTo(labelLayer);
    const icon = L.divIcon({ className: 'study-label-icon-wrap', html: `<div class="study-label-chip" style="--study-label-color:${colorForTipologia(item.feature?.properties?.tipologia)}"><span class="study-label-dot"></span><span class="study-label-text">${escapeHtml(getStudyFeatureName(item.feature))}</span></div>`, iconSize: [0,0], iconAnchor: [0, 12] });
    const marker = L.marker(item.labelLatLng, { pane: STUDY_LABEL_PANE, icon, interactive: true, keyboard: false, bubblingMouseEvents: false });
    marker.on('click', () => { setStudyActive(item.fid); openStudyPolyModal(item.feature); });
    marker.addTo(labelLayer);
    labelByFid.set(item.fid, marker);
    leaderByFid.set(item.fid, line);
  });
  labelLayer.addTo(map);
  studyState.labelLayer = labelLayer;
  studyState.labelByFid = labelByFid;
  studyState.leaderByFid = leaderByFid;
  refreshStudyLabels();
}
function ensureStudyModalRoot(){
  let el = document.getElementById('study-modal');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'study-modal';
  el.className = 'study-modal-overlay';
  el.hidden = true;
  el.innerHTML = `
    <div class="study-modal" role="dialog" aria-modal="true">
      <div class="study-modal-head">
        <div class="study-modal-title">—</div>
        <button class="study-modal-close" title="Chiudi">✕</button>
      </div>
      <div class="study-modal-tabs"></div>
      <div class="study-modal-body"></div>
    </div>`;
  document.body.appendChild(el);
  const close = () => {
    el.hidden = true;
    try { if (el._miniMap) { el._miniMap.remove(); el._miniMap = null; } } catch {}
    clearStudyActive();
  };
  el.addEventListener('click', ev => { if (ev.target === el) close(); });
  el.querySelector('.study-modal-close').addEventListener('click', close);
  window.addEventListener('keydown', ev => { if (!el.hidden && ev.key === 'Escape') close(); });
  return el;
}
function uniqueComuneCountForHoldings(holdings){
  const comuni = new Set();
  holdings.forEach(h => {
    (h.maps || []).forEach(m => {
      const c = inferComuneLabelFromArchive(m.archivio || '');
      if (c && c !== 'n/d') comuni.add(c);
    });
  });
  return comuni.size;
}
function ownerPortfolioStats(person){
  const ownerHoldings = collectPortfolioForOwnerGroup(person);
  const ownArea = ownerHoldings.reduce((sum, h) => sum + (Number(h.areaSqm) || 0), 0);
  const ownCount = ownerHoldings.length;
  const ownComuni = uniqueComuneCountForHoldings(ownerHoldings);

  const ownIds = new Set(inferRelatedOwnerIds(person));
  const allPersons = Array.from(studyState?.familiesAgg?.values?.() || []).map(x => x.person).filter(Boolean);
  const otherGroups = allPersons.filter(p => !ownIds.has(String(p.id)));
  const seen = new Set();
  let otherArea = 0;
  let otherCount = 0;
  const otherComuni = new Set();
  otherGroups.forEach(p => {
    collectPortfolioForOwnerGroup(p).forEach(h => {
      const key = String(h.fid);
      if (seen.has(key) || ownerHoldings.some(oh => String(oh.fid) === key)) return;
      seen.add(key);
      otherArea += Number(h.areaSqm) || 0;
      otherCount += 1;
      (h.maps || []).forEach(m => {
        const c = inferComuneLabelFromArchive(m.archivio || '');
        if (c && c !== 'n/d') otherComuni.add(c);
      });
    });
  });
  return { ownerHoldings, ownArea, ownCount, ownComuni, otherArea, otherCount, otherComuni: otherComuni.size };
}

function ownerGroupForPerson(person){
  if (!person) return null;
  const d = window.WEBGIS_DATA || {};
  const parentId = firstNonEmpty(person.parent_id, person.parent, person.id_parent);
  if (parentId && d.peopleById?.has(String(parentId))) return d.peopleById.get(String(parentId));
  return person;
}
function ownerRowsForScope(scope, metric){
  const d = window.WEBGIS_DATA || {};
  const currentFids = new Set((studyState?.detail?.polygonFids || []).map(String));
  const people = Array.from(d.peopleById?.values?.() || []);
  const basePeople = people.filter(p => isFamilyPerson(p) || isEntityPerson(p));
  const rows = [];
  basePeople.forEach(person => {
    let holdings = collectPortfolioForOwnerGroup(person);
    if (scope === 'map') holdings = holdings.filter(h => currentFids.has(String(h.fid)));
    const area = holdings.reduce((sum, h) => sum + (Number(h.areaSqm) || 0), 0);
    const count = holdings.length;
    const value = metric === 'count' ? count : area / 10000;
    if (value > 0) rows.push({ person, holdings, area, count, value });
  });
  rows.sort((a,b) => b.value - a.value || (a.person.name || '').localeCompare(b.person.name || '', 'it'));
  return rows;
}
function pieSlicePath(cx, cy, r, startDeg, endDeg, explode = 0){
  const mid = (startDeg + endDeg) / 2;
  const rad = Math.PI / 180;
  const dx = Math.cos((mid - 90) * rad) * explode;
  const dy = Math.sin((mid - 90) * rad) * explode;
  const start = {
    x: cx + dx + r * Math.cos((startDeg - 90) * rad),
    y: cy + dy + r * Math.sin((startDeg - 90) * rad)
  };
  const end = {
    x: cx + dx + r * Math.cos((endDeg - 90) * rad),
    y: cy + dy + r * Math.sin((endDeg - 90) * rad)
  };
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${cx+dx} ${cy+dy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y} Z`;
}
function renderPieSvg(rows, targetId, metric){
  const cleanRows = rows.filter(r => r.value > 0);
  const total = cleanRows.reduce((sum, r) => sum + r.value, 0) || 1;
  const palette = ['#4f78f2','#2bb7a8','#e7aa3a','#a879dc','#e96a63','#4a9ed8','#7dbf57','#d978b0','#e58b2d','#22aabd','#7459d6','#50bde7','#df6683','#93c04b','#d9662c','#4db283','#b987e8','#579bed','#c99936','#72beb4'];
  const targetRow = cleanRows.find(r => String(r.person.id) === String(targetId));
  let displayRows = cleanRows.slice();
  if (cleanRows.length > 18) {
    const top = cleanRows.filter(r => String(r.person.id) !== String(targetId)).slice(0, targetRow ? 17 : 18);
    displayRows = targetRow ? [targetRow, ...top] : top;
    const used = new Set(displayRows.map(r => String(r.person.id)));
    const otherValue = cleanRows.filter(r => !used.has(String(r.person.id))).reduce((sum, r) => sum + r.value, 0);
    if (otherValue > 0) displayRows.push({ person: { id: '__other__', name: 'Altri proprietari' }, value: otherValue, area: 0, count: 0, holdings: [] });
  }
  const cx = 185, cy = 145, r = 108;
  let cursor = 0;
  let targetMid = 0;
  let targetPct = 0;
  const calloutFor = (mid, row, pct, val, color, cls = 'sm-pie-hover-callout') => {
    const rad = Math.PI / 180;
    const lx1 = cx + Math.cos((mid - 90) * rad) * (r + 7);
    const ly1 = cy + Math.sin((mid - 90) * rad) * (r + 7);
    const labelRight = Math.cos((mid - 90) * rad) >= 0;
    const lx2 = labelRight ? 330 : 40;
    const ly2 = Math.max(28, Math.min(260, ly1));
    const anchor = labelRight ? 'start' : 'end';
    const name = String(row.person?.name || '—');
    return `<g class="${cls}">
      <polyline points="${lx1},${ly1} ${lx2},${ly2}" fill="none" stroke="${color}" stroke-width="1.25" stroke-dasharray="3 3"/>
      <text class="sm-pie-callout-text" x="${lx2 + (labelRight ? 6 : -6)}" y="${ly2 - 4}" text-anchor="${anchor}">${(pct*100).toFixed(1)}%</text>
      <text class="sm-pie-callout-name" x="${lx2 + (labelRight ? 6 : -6)}" y="${ly2 + 12}" text-anchor="${anchor}">${escapeHtml(name.length > 22 ? name.slice(0,21)+'…' : name)}</text>
    </g>`;
  };
  const groups = displayRows.map((row, idx) => {
    const pct = row.value / total;
    const start = cursor * 360;
    cursor += pct;
    const end = Math.min(359.999, cursor * 360);
    const mid = (start + end) / 2;
    const isTarget = String(row.person.id) === String(targetId);
    const color = isTarget ? '#3f69e8' : palette[idx % palette.length];
    const val = metric === 'count' ? `${Math.round(row.value)} proprietà` : `${row.value.toFixed(2)} ha`;
    const label = `${row.person.name}: ${val} · ${(pct*100).toFixed(1)}%`;
    if (isTarget) { targetMid = mid; targetPct = pct * 100; }
    return `<g class="sm-pie-slice-group ${isTarget ? 'is-target' : ''}">
      <path class="sm-pie-slice ${isTarget ? 'is-target' : ''}" d="${pieSlicePath(cx,cy,r,start,end,isTarget ? 11 : 0)}" fill="${color}" stroke="rgba(255,255,255,.26)" stroke-width="0.35"><title>${escapeHtml(label)}</title></path>
      ${calloutFor(mid, row, pct, val, color)}
    </g>`;
  }).join('');
  const target = targetRow;
  const targetName = target?.person?.name || '—';
  const targetVal = target ? (metric === 'count' ? `${target.count || Math.round(target.value)} proprietà` : `${target.value.toFixed(2)} ha`) : '0';
  const targetLabel = target ? calloutFor(targetMid, target, targetPct / 100, targetVal, '#2563eb', 'sm-pie-target-callout') : '';
  const legendRows = displayRows.map((row, idx) => {
    const pct = row.value / total;
    const isTarget = String(row.person.id) === String(targetId);
    const color = isTarget ? '#3f69e8' : palette[idx % palette.length];
    const val = metric === 'count' ? `${Math.round(row.value)} proprietà` : `${row.value.toFixed(2)} ha`;
    return `<div class="sm-pie-legend-line ${isTarget ? 'is-target' : ''}"><i style="background:${color}"></i><span>${escapeHtml(row.person.name)}</span><strong>${(pct*100).toFixed(1)}%</strong><small>${escapeHtml(val)}</small></div>`;
  }).join('');
  return `<div class="sm-pie-frame">
    <div class="sm-pie-topbar">
      <button type="button" class="sm-pie-mini-btn" data-pie-legend-toggle><i class="bi bi-list-ul"></i><span>Legenda</span></button>
      <button type="button" class="sm-pie-info-btn sm-pie-warning-btn" title="Le stime sugli ettari sono approssimative e calcolate solo sui terreni presenti nella cartografia digitalizzata; la cartografia non sempre riporta l'intera estensione dei territori."><i class="bi bi-exclamation-triangle-fill"></i></button>
    </div>
    <div class="sm-pie-layout sm-pie-layout--solo">
      <svg class="sm-pie-svg" viewBox="0 0 370 285" role="img" aria-label="Distribuzione proprietà">${groups}${targetLabel}</svg>
    </div>
    <div class="sm-pie-caption"><strong>${targetPct.toFixed(1)}%</strong><span>${escapeHtml(targetName)}</span><small>${escapeHtml(targetVal)}</small></div>
    <div class="sm-pie-warning" hidden><i class="bi bi-exclamation-triangle-fill"></i><span>Le stime sugli ettari sono approssimative e calcolate solo sui terreni presenti nella cartografia digitalizzata. La cartografia non sempre riporta l'intera estensione dei territori.</span></div>
    <div class="sm-pie-legend-panel" hidden>${legendRows}</div>
  </div>`;
}
function renderOwnerDistribution(fid){
  const owners = getRelatedPeopleForPlace(fid).filter(Boolean);
  if (!owners.length) return '<div class="sm-empty">Nessun soggetto collegato.</div>';
  const targetOwner = ownerGroupForPerson(owners.find(isFamilyPerson) || owners[0]) || owners[0];
  const targetId = String(targetOwner.id);
  const combos = [
    ['all','area'], ['all','count'], ['map','area'], ['map','count']
  ];
  return `<div class="sm-dist-wrap">
    <div class="sm-switch-row">
      <div class="sm-graph-switch" data-scope-switch>
        <button type="button" class="is-active" data-scope="all"><i class="bi bi-globe2"></i> Dataset</button>
        <button type="button" data-scope="map"><i class="bi bi-map"></i> Solo mappa</button>
      </div>
      <div class="sm-graph-switch" data-graph-switch>
        <button type="button" class="is-active" data-graph="area"><i class="bi bi-pie-chart-fill"></i> Superficie</button>
        <button type="button" data-graph="count"><i class="bi bi-bar-chart-fill"></i> Proprietà</button>
      </div>
    </div>
    ${combos.map(([scope, metric], idx) => {
      const rows = ownerRowsForScope(scope, metric);
      return `<div class="sm-graph-panel ${idx === 0 ? 'is-active' : ''}" data-scope-pane="${scope}" data-graph-pane="${metric}">
        ${rows.length ? renderPieSvg(rows, targetId, metric) : '<div class="sm-empty">Nessun dato disponibile per questo perimetro.</div>'}
      </div>`;
    }).join('')}
  </div>`;
}

function statPercent(a, b){
  const tot = (Number(a) || 0) + (Number(b) || 0);
  if (!tot) return 0;
  return Math.max(0, Math.min(100, (Number(a) || 0) / tot * 100));
}
function renderOwnerCompareChart(stats){
  const rows = [
    { label: 'Superficie', own: stats.ownArea / 10000, other: stats.otherArea / 10000, unit: 'ha', fmt: v => v.toFixed(2) },
    { label: 'Proprietà', own: stats.ownCount, other: stats.otherCount, unit: '', fmt: v => String(Math.round(v)) },
    { label: 'Comuni', own: stats.ownComuni, other: stats.otherComuni, unit: '', fmt: v => String(Math.round(v)) }
  ];
  return `<div class="sm-owner-chart">
    ${rows.map(row => {
      const pct = statPercent(row.own, row.other);
      return `<div class="sm-statrow">
        <div class="sm-stathead"><span>${row.label}</span><strong>${row.fmt(row.own)}${row.unit ? ' ' + row.unit : ''}</strong></div>
        <div class="sm-statbar"><span style="width:${pct}%"></span></div>
        <div class="sm-statfoot">altri: ${row.fmt(row.other)}${row.unit ? ' ' + row.unit : ''}</div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderOwnerPortfolio(fid){
  const owners = getRelatedPeopleForPlace(fid).filter(Boolean);
  if (!owners.length) return '<div class="sm-empty">Nessun soggetto collegato.</div>';
  return owners.map(person => {
    const group = ownerGroupForPerson(person) || person;
    const stats = ownerPortfolioStats(group);
    const holdings = stats.ownerHoldings.filter(h => String(h.fid) !== String(fid));
    const relatedIds = new Set(inferRelatedOwnerIds(group));
    const relatedPeople = relatedIds.size > 1
      ? Array.from(relatedIds).map(id => (window.WEBGIS_DATA?.peopleById?.get(String(id)))).filter(Boolean).filter(p => String(p.id) !== String(group.id))
      : [];
    return `
      <details class="sm-accordion" open>
        <summary><span><i class="bi bi-people"></i> ${escapeHtml(group.name || person.name || '—')}</span><span class="sm-pill">${holdings.length} altri terreni</span></summary>
        <div class="sm-accordion-body">
          <div class="sm-person-meta">
            ${group.tipo ? `<span class="sm-mini-pill">${escapeHtml(group.tipo)}</span>` : ''}
            ${group.varianti ? `<span class="sm-varianti">${escapeHtml(group.varianti)}</span>` : ''}
            ${relatedPeople.length ? `<span class="sm-mini-pill">include ${escapeHtml(relatedPeople.map(p => p.name).slice(0,4).join(', '))}${relatedPeople.length > 4 ? '…' : ''}</span>` : ''}
          </div>
          <div class="sm-holdings-summary">
            <div><strong>${formatArea(stats.ownArea)}</strong><span>superficie totale</span></div>
            <div><strong>${stats.ownCount}</strong><span>proprietà</span></div>
            <div><strong>${stats.ownComuni}</strong><span>comuni/mappe</span></div>
          </div>
          ${holdings.length ? `<div class="sm-linked-list">${holdings.slice(0,18).map(h => `<div class="sm-linked-item"><div><strong>${escapeHtml(h.name)}</strong><div class="sm-subline">${escapeHtml(h.maps.map(m => m.sigla || m.name).join(', ') || 'mappa n/d')}</div></div><span class="sm-size">${escapeHtml(formatArea(h.areaSqm))}</span></div>`).join('')}</div>` : '<div class="sm-empty">Nessun altro possedimento individuato.</div>'}
        </div>
      </details>`;
  }).join('');
}

function renderSiblingAttestations(feature){
  const fid = String(feature?.properties?.fid ?? '');
  const parentId = firstNonEmpty(feature?.properties?.parent_id);
  if (!parentId || parentId === '0') return '<div class="sm-empty">Nessun record padre associato.</div>';
  const siblings = (ensureChildrenByParentIndex().get(String(parentId)) || []).filter(Boolean);
  const parent = getPlaceFeature(parentId);
  return `
    <div class="sm-note-card"><div class="sm-note-title">Record padre</div><div><strong>${escapeHtml(getStudyFeatureName(parent || feature))}</strong> · id ${escapeHtml(parentId)}</div></div>
    <div class="sm-linked-list">${siblings.map(sib => {
      const sid = String(sib?.properties?.fid ?? '');
      const maps = getMapsForPlace(sid);
      return `<div class="sm-linked-item ${sid === fid ? 'is-current' : ''}"><div><strong>${escapeHtml(getStudyFeatureName(sib))}</strong><div class="sm-subline">record ${escapeHtml(sid)}</div></div><span class="sm-mapchips">${maps.map(m => `<span>${escapeHtml(m.sigla || m.name || m.fid)}</span>`).join(' ') || '<span>n/d</span>'}</span></div>`;
    }).join('')}</div>`;
}
function renderMapPanel(detail){
  const comune = inferComuneLabelFromArchive(detail.archivio);
  return `
    <div class="sm-mapgrid">
      <div class="sm-note-card"><div class="sm-note-title">Mappa selezionata</div><strong>${escapeHtml(detail.sigla || detail.name || detail.fid)}</strong><div class="sm-subline">${escapeHtml(detail.archivio || 'Archivio')}</div></div>
      <div class="sm-note-card"><div class="sm-note-title">Comune di riferimento</div><strong>${escapeHtml(comune)}</strong><div class="sm-subline">${detail.year ? 'anno ' + escapeHtml(detail.year) : 'data n/d'}</div></div>
      <div class="sm-note-card"><div class="sm-note-title">Elementi sulla mappa</div><strong>${escapeHtml(detail.polygonFids?.length || 0)}</strong><div class="sm-subline">poligoni collegati</div></div>
    </div>
    ${detail.cartiglio ? `<details class="sm-accordion"><summary><span><i class="bi bi-journal-text"></i> Cartiglio / note di mappa</span></summary><div class="sm-accordion-body"><div class="sm-textblock">${escapeHtml(detail.cartiglio)}</div></div></details>` : ''}
    ${detail.descrizione ? `<details class="sm-accordion"><summary><span><i class="bi bi-file-earmark-text"></i> Descrizione della mappa</span></summary><div class="sm-accordion-body"><div class="sm-textblock">${escapeHtml(detail.descrizione)}</div></div></details>` : ''}`;
}
function openStudyPolyModal(feature){
  const el = ensureStudyModalRoot();
  const p = feature.properties || {};
  const fid = String(p.fid ?? '');
  setStudyActive(fid);
  const tip = firstNonEmpty(p.tipologia);
  const tipColor = colorForTipologia(tip);
  const parentId = firstNonEmpty(p.parent_id);
  const parent = parentId ? getPlaceFeature(parentId) : null;
  const parentDesc = firstNonEmpty(parent?.properties?.descrizione);
  const parentIdent = firstNonEmpty(parent?.properties?.identificazione_attuale);
  const childDesc = firstNonEmpty(p.descrizione);
  const childIdent = firstNonEmpty(p.identificazione_attuale);
  const modalMapId = `sm-geom-${fid}`;
  const tabs = [
    { key: 'sintesi', label: 'Sintesi', icon: 'bi-card-text' },
    { key: 'proprieta', label: 'Proprietà', icon: 'bi-buildings' },
    { key: 'attestazioni', label: 'Attestazioni', icon: 'bi-diagram-3' }
  ];
  el.querySelector('.study-modal-title').innerHTML = `<span class="sm-tip-dot" style="background:${tipColor}"></span><div><div>${escapeHtml(getStudyFeatureName(feature))}</div><div class="sm-modal-sub">${escapeHtml(tip || 'Elemento poligonale')}</div></div>`;
  el.querySelector('.study-modal-tabs').innerHTML = tabs.map((tab, idx) => `<button type="button" class="sm-tab ${idx === 0 ? 'is-active' : ''}" data-tab="${tab.key}"><i class="bi ${tab.icon}"></i><span>${tab.label}</span></button>`).join('');
  const body = el.querySelector('.study-modal-body');
  body.innerHTML = `
    <section class="sm-pane is-active" data-pane="sintesi">
      <div class="sm-hero-grid">
        <div class="sm-hero-card">
          <div class="sm-note-title">Profilo</div>
          <div class="sm-badgerow">${tip ? `<span class="sm-badge" style="border-color:${tipColor};color:${tipColor}"><img class="sm-badge-icon" src="${iconPathForTipologia(tip)}" alt=""> ${escapeHtml(tip)}</span>` : ''}${p.dimension ? `<span class="sm-badge">livello ${escapeHtml(p.dimension)}</span>` : ''}${studyState?.detail?.sigla ? `<span class="sm-badge">${escapeHtml(studyState.detail.sigla)}</span>` : ''}</div>
          ${p.as && p.as !== p.name ? `<div class="sm-textblock"><strong>Attestato come:</strong> ${escapeHtml(p.as)}</div>` : ''}
          ${(childDesc || parentDesc) ? `<details class="sm-accordion" open><summary><span><i class="bi bi-file-earmark-text"></i> Descrizione</span></summary><div class="sm-accordion-body">${parentDesc ? `<div class="sm-split-card is-parent"><div class="sm-note-title">Dal record padre</div><div class="sm-textblock">${escapeHtml(parentDesc)}</div></div>` : ''}${childDesc ? `<div class="sm-split-card is-child"><div class="sm-note-title">Specifica di questa mappa</div><div class="sm-textblock">${escapeHtml(childDesc)}</div></div>` : ''}</div></details>` : ''}
        </div>
        <div class="sm-hero-card">
          <div class="sm-note-title">Viewer geometria</div>
          <div id="${modalMapId}" class="sm-geom-preview"></div>
          <div class="sm-subline">Anteprima della geometria associata al record.</div>
          ${(childIdent || parentIdent) ? `<details class="sm-accordion sm-ident-under-map" open><summary><span><i class="bi bi-geo-alt"></i> Identificazione attuale</span></summary><div class="sm-accordion-body">${parentIdent ? `<div class="sm-split-card is-parent"><div class="sm-note-title">Dal record padre</div><div class="sm-textblock">${escapeHtml(parentIdent)}</div></div>` : ''}${childIdent ? `<div class="sm-split-card is-child"><div class="sm-note-title">Specifica di questa mappa</div><div class="sm-textblock">${escapeHtml(childIdent)}</div></div>` : ''}</div></details>` : ''}
        </div>
      </div>
    </section>
    <section class="sm-pane" data-pane="proprieta">${renderOwnerDistribution(fid)}</section>
    <section class="sm-pane" data-pane="attestazioni">${renderOwnerPortfolio(fid)}</section>`;

  el.querySelectorAll('.sm-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.sm-tab').forEach(b => b.classList.toggle('is-active', b === btn));
      const key = btn.dataset.tab;
      el.querySelectorAll('.sm-pane').forEach(pane => pane.classList.toggle('is-active', pane.dataset.pane === key));
    });
  });
  const refreshOwnerGraphPane = () => {
    const scope = body.querySelector('[data-scope-switch] button.is-active')?.dataset.scope || 'all';
    const metric = body.querySelector('[data-graph-switch] button.is-active')?.dataset.graph || 'area';
    body.querySelectorAll('[data-scope-pane][data-graph-pane]').forEach(pane => {
      pane.classList.toggle('is-active', pane.dataset.scopePane === scope && pane.dataset.graphPane === metric);
    });
  };
  body.querySelectorAll('[data-graph-switch] button').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('[data-graph-switch] button').forEach(b => b.classList.toggle('is-active', b===btn));
      refreshOwnerGraphPane();
    });
  });
  body.querySelectorAll('[data-scope-switch] button').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('[data-scope-switch] button').forEach(b => b.classList.toggle('is-active', b===btn));
      refreshOwnerGraphPane();
    });
  });
  body.querySelectorAll('[data-pie-legend-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.closest('.sm-pie-frame')?.querySelector('.sm-pie-legend-panel');
      if (panel) panel.hidden = !panel.hidden;
      btn.classList.toggle('is-active', panel && !panel.hidden);
    });
  });
  body.querySelectorAll('.sm-pie-info-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const warning = btn.closest('.sm-pie-frame')?.querySelector('.sm-pie-warning');
      if (warning) warning.hidden = !warning.hidden;
      btn.classList.toggle('is-active', warning && !warning.hidden);
    });
  });
  try { if (el._miniMap) { el._miniMap.remove(); el._miniMap = null; } } catch {}
  el.hidden = false;
  setTimeout(() => { el._miniMap = mountGeometryPreview(modalMapId, feature) || null; }, 20);
}
function highlightPolyBriefly(fid){
  const ly = studyState?.polyByFid?.get(String(fid));
  if (!ly) return;
  setStudyActive(fid);
  try { const b = ly.getBounds(); if (b?.isValid()) map.flyToBounds(b.pad(0.28), { duration: 0.45, maxZoom: 18 }); } catch {}
}
function bindStudyPanelEvents(panel){
  const syncSelections = () => {
    studyState.selectedTypeKeys = new Set(Array.from(panel.querySelectorAll('[data-kind="type"].is-active')).map(el => String(el.dataset.key)));
    studyState.selectedFamilyIds = new Set(Array.from(panel.querySelectorAll('[data-kind="family"].is-active')).map(el => String(el.dataset.id)));
    updateStudyCounters();
    refreshStudyVisualState();
  };
  const setSwitchState = (btn, on) => {
    btn.classList.toggle('is-on', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  panel.querySelectorAll('[data-role="sp-view"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      panel.querySelectorAll('[data-role="sp-view"]').forEach(b => b.classList.toggle('is-active', b === btn));
      panel.querySelectorAll('[data-view-pane]').forEach(pane => pane.classList.toggle('is-active', pane.dataset.viewPane === view));
    });
  });
  panel.querySelector('[data-role="toggle-polygons"]')?.addEventListener('click', ev => {
    studyState.showPolygons = !studyState.showPolygons;
    setSwitchState(ev.currentTarget, studyState.showPolygons);
    refreshStudyVisualState();
  });
  panel.querySelector('[data-role="toggle-labels"]')?.addEventListener('click', ev => {
    studyState.showLabels = !studyState.showLabels;
    setSwitchState(ev.currentTarget, studyState.showLabels);
    refreshStudyVisualState();
  });
  panel.querySelectorAll('input[type="range"]').forEach(range => {
    ['pointerdown','mousedown','touchstart','click','dblclick'].forEach(evt => range.addEventListener(evt, ev => ev.stopPropagation()));
  });
  panel.querySelector('#sp-map-opacity')?.addEventListener('input', ev => {
    studyState.mapOpacity = Number(ev.target.value);
    const out = panel.querySelector('#sp-map-opacity-val');
    if (out) out.textContent = `${Math.round(studyState.mapOpacity * 100)}%`;
    setGeoTiffOpacity(studyState.mapOpacity);
  });
  panel.querySelector('#sp-poly-opacity')?.addEventListener('input', ev => {
    studyState.polyOpacity = Number(ev.target.value);
    const out = panel.querySelector('#sp-poly-opacity-val');
    if (out) out.textContent = `${Math.round(studyState.polyOpacity * 100)}%`;
    refreshStudyVisualState();
  });
  panel.querySelector('#sp-label-opacity')?.addEventListener('input', ev => {
    studyState.labelOpacity = Number(ev.target.value);
    const out = panel.querySelector('#sp-label-opacity-val');
    if (out) out.textContent = `${Math.round(studyState.labelOpacity * 100)}%`;
    refreshStudyLabels();
  });
  panel.querySelectorAll('[data-kind="type"], [data-kind="family"]').forEach(btn => btn.addEventListener('click', () => {
    btn.classList.toggle('is-active');
    syncSelections();
  }));
  panel.querySelector('#sp-family-search')?.addEventListener('input', ev => {
    const q = normKey(ev.target.value);
    panel.querySelectorAll('.sp-family-row').forEach(row => {
      row.hidden = q && !String(row.dataset.label || '').includes(q);
    });
  });
  syncSelections();
}
function closeStudyMode(){
  if (!studyState) return;
  const returnView = studyState.returnView;
  try { if (studyState.layer) map.removeLayer(studyState.layer); } catch {}
  try { if (studyState.labelLayer) map.removeLayer(studyState.labelLayer); } catch {}
  try { if (studyState.centroidLayer) map.removeLayer(studyState.centroidLayer); } catch {}
  if (studyState.rebuildLabelsHandler) map.off('zoomend', studyState.rebuildLabelsHandler);
  document.getElementById('study-panel')?.remove();
  clearGeoTiffOverlay();
  document.body.classList.remove('has-study-panel');
  const appEl = document.getElementById('app');
  appEl?.classList.remove('study-dashboard-collapsed');
  document.getElementById('dashboard')?.classList.remove('is-collapsed');
  const handleBtn = document.getElementById('dashboard-collapse-handle');
  if (handleBtn) handleBtn.hidden = true;
  const modal = document.getElementById('study-modal');
  if (modal) {
    modal.hidden = true;
    try { if (modal._miniMap) { modal._miniMap.remove(); modal._miniMap = null; } } catch {}
  }
  studyState = null;
  if (returnView?.center && Number.isFinite(returnView.zoom)) {
    window.setTimeout(() => {
      map.invalidateSize();
      map.setView(returnView.center, returnView.zoom, { animate: true });
    }, 40);
  }
}

function confirmCloseStudyMode(){
  const confirmed = window.confirm(
    'Stai per uscire dalla modalità di studio: la carta storica e i relativi livelli interattivi verranno rimossi dalla mappa.\n\n' +
    'Se desideri soltanto liberare spazio, puoi comprimere il pannello con il comando laterale senza interrompere la consultazione.\n\n' +
    'Vuoi chiudere comunque la visualizzazione?'
  );
  if (confirmed) closeStudyMode();
}
async function openStudyMode(detail){
  if (studyState && String(studyState.detail?.fid) === String(detail.fid)) {
    if (detail.focusFid) {
      highlightPolyBriefly(detail.focusFid);
      return;
    }
    closeStudyMode();
    return;
  }
  if (studyState) closeStudyMode();

  studyState = { detail, layer: null, polyByFid: new Map(), polyFeatures: [], labelLayer: null, labelByFid: new Map(), leaderByFid: new Map(), centroidLayer: null, labelEligible: new Set(), familyIdsByPlace: new Map(), familiesAgg: new Map(), selectedTypeKeys: new Set(), selectedFamilyIds: new Set(), hoveredPolyFid: null, activePolyFid: null, dashboardCollapsed: true, rebuildLabelsHandler: null, showPolygons: true, showLabels: false, mapOpacity: 0.92, polyOpacity: 0.65, labelOpacity: 0.68, returnView: { center: map.getCenter(), zoom: map.getZoom() } };
  document.body.classList.add('has-study-panel');
  const handleBtn = ensureDashboardCollapseHandle();
  if (handleBtn) handleBtn.hidden = false;
  setStudySidebarCollapsed(true);

  showWebgisLoading('Ricerca delle tile e caricamento della mappa storica…');
  const geoLayerPromise = addGeoTiffOverlay(detail.geoCandidates || [detail.geoUrl], detail.fid, {
    fit: false,
    opacity: studyState.mapOpacity,
    tileCode: detail.tileCode || detail.sigla
  })
    .catch(() => null)
    .finally(() => hideWebgisLoading());
  const built = buildStudyPolygons(detail);
  studyState.layer = built.layer;
  studyState.polyByFid = built.polyByFid;
  studyState.polyFeatures = built.features;
  built.layer.addTo(map);

  built.features.forEach(f => {
    const fid = String(f.properties?.fid ?? '');
    const owners = getRelatedPeopleForPlace(fid).filter(Boolean);
    const famIds = new Set();
    owners.forEach(owner => {
      const person = ownerGroupForPerson(owner) || owner;
      const pid = String(person.id);
      if (!pid) return;
      famIds.add(pid);
      if (!studyState.familiesAgg.has(pid)) studyState.familiesAgg.set(pid, { person, places: new Set() });
      studyState.familiesAgg.get(pid).places.add(fid);
    });
    studyState.familyIdsByPlace.set(fid, famIds);
  });

  let fitDone = false;
  try { const pb = built.layer.getBounds?.(); if (pb?.isValid()) { map.fitBounds(pb.pad(0.20)); fitDone = true; } } catch {}

  geoLayerPromise.then(geoLayer => {
    if (!studyState || String(studyState.detail?.fid) !== String(detail.fid)) return;
    try { const rb = geoLayer?.getBounds?.(); if (rb?.isValid() && !detail.focusFid) map.fitBounds(rb.pad(0.05)); } catch {}
  });

  buildStudyLabels();
  studyState.rebuildLabelsHandler = () => buildStudyLabels();
  map.on('zoomend', studyState.rebuildLabelsHandler);

  const panel = buildStudyPanel(detail);
  panel.querySelector('.sp-close')?.addEventListener('click', confirmCloseStudyMode);
  bindStudyPanelEvents(panel);
  refreshStudyVisualState();
  if (detail.focusFid) {
    setTimeout(() => highlightPolyBriefly(detail.focusFid), 180);
  }
}
window.addEventListener('maps:studyMap', (e) => {
  const detail = e.detail || {};
  if (!detail.fid) return;
  openStudyMode(detail);
});
window.addEventListener('maps:studyMap:close', closeStudyMode);

// ============================================================================
// ZOOM DA MODALE "COMUNI" (evento lanciato da dashboard.js)
// ============================================================================
window.addEventListener('toponyms:zoomToFid', (e) => {
  const fid = e.detail?.fid;
  const latlngFromEvent = e.detail?.latlng || null;

  if (fid == null && !latlngFromEvent) return;

  const fidKey = fid != null ? String(fid) : null;

  // 1) prova marker già creato
  const marker = fidKey ? (allMarkers.get(fidKey) || null) : null;

  if (marker) {
    const ll = marker.getLatLng();
    map.flyTo(ll, Math.max(map.getZoom(), 13), { duration: 0.6 });
    marker.openPopup();
    return;
  }

  // 2) fallback: usa latlng passato dall’evento
  if (Array.isArray(latlngFromEvent) && latlngFromEvent.length === 2) {
    map.flyTo(latlngFromEvent, Math.max(map.getZoom(), 13), { duration: 0.6 });
    return;
  }

  // 3) fallback: cerca la feature e calcola latlng
  if (!fidKey) return;
  const f = rawFeatures.find(ff => getFidKeyFromFeature(ff) === fidKey);
  const ll = f ? featureLatLng(f) : null;
  if (ll) map.flyTo(ll, Math.max(map.getZoom(), 13), { duration: 0.6 });
});


// ============================================================================
// REMOTE WMS OVERLAY (Geoportale Emilia-Romagna)
// ============================================================================
let currentRemoteLayer = null;
let currentRemoteKey = null;

function clearRemoteWmsOverlay(silent = false){
  if (currentRemoteLayer) {
    map.removeLayer(currentRemoteLayer);
    currentRemoteLayer = null;
  }
  currentRemoteKey = null;
  if (!silent) {
    window.dispatchEvent(new CustomEvent('maps:geoOverlayChanged', { detail: { activeFid: null } }));
  }
}

async function addRemoteWmsOverlay(config){
  const { key, serviceUrl, layers, opacity, attribution } = config || {};
  if (!key || !serviceUrl || !layers) return;
  try {
    // Annulla eventuali richieste tile/GeoTIFF ancora in corso.
    geoOverlayRequestId += 1;
    if (currentGeoLayer) {
      map.removeLayer(currentGeoLayer);
      currentGeoLayer = null;
      currentGeoFid = null;
    }
    if (currentRemoteLayer) {
      map.removeLayer(currentRemoteLayer);
      currentRemoteLayer = null;
      currentRemoteKey = null;
    }
    const layer = L.tileLayer.wms(serviceUrl, {
      layers,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      opacity: Number.isFinite(Number(opacity)) ? Number(opacity) : 0.72,
      attribution: attribution || 'Geoportale Emilia-Romagna',
      pane: 'geotiffPane'
    });
    layer.addTo(map);
    currentRemoteLayer = layer;
    currentRemoteKey = key;
    window.dispatchEvent(new CustomEvent('maps:geoOverlayChanged', { detail: { activeFid: key } }));
  } catch (err) {
    console.error('Errore nel caricamento del WMS remoto', err);
    alert('Impossibile caricare il layer WMS remoto: ' + (err?.message || err));
    clearRemoteWmsOverlay();
  }
}

window.addEventListener('maps:toggleRemoteWms', (e) => {
  const cfg = e.detail || {};
  const key = cfg.key;
  if (!key) return;
  if (currentRemoteLayer && String(currentRemoteKey) === String(key)) {
    clearRemoteWmsOverlay();
  } else {
    addRemoteWmsOverlay(cfg);
  }
});

// Mutual exclusion with local GeoTIFF
const _origAddGeoTiffOverlay = addGeoTiffOverlay;
addGeoTiffOverlay = async function(url, fid, opts){
  if (currentRemoteLayer) {
    map.removeLayer(currentRemoteLayer);
    currentRemoteLayer = null;
    currentRemoteKey = null;
  }
  return _origAddGeoTiffOverlay(url, fid, opts);
};
const _origClearGeoTiffOverlay = clearGeoTiffOverlay;
clearGeoTiffOverlay = function(){
  _origClearGeoTiffOverlay();
};
