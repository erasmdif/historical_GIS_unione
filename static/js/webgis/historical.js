// ============================================================================
// historical.js — geometrie storiche, linea del tempo, schede e infografica
// ============================================================================
(() => {
  'use strict';

  const HISTORICAL_DATA_URL = 'data/storico.geojson';
  const ASSET_BASE = 'images/webgis/historical/';
  const INITIAL_YEAR = 2006;
  const YEARS = [1790, 2001, 2006];

  const YEAR_META = {
    1790: {
      short: 'Governo Estense',
      label: 'Giurisdizioni estensi',
      subtitle: 'Gerarchia politico-amministrativa, 1790',
      note: 'Sono visibili esclusivamente le geometrie riferite al 1790.'
    },
    2001: {
      short: 'Nascita dell’Unione',
      label: 'Terre di Castelli · 2001',
      subtitle: 'Assetto amministrativo iniziale, 2001',
      note: 'Sono visibili esclusivamente i confini associati al 2001.'
    },
    2006: {
      short: 'Assetto ampliato',
      label: 'Terre di Castelli · 2006',
      subtitle: 'Assetto amministrativo, 2006 · con i confini del 2001',
      note: 'Il 2006 mantiene in mappa anche i comuni già associati al 2001.'
    }
  };

  // Il draft colloca Monfestino e Savignano sotto il Marchesato di Vignola.
  // La regola è esclusivamente di presentazione: il GeoJSON sorgente resta invariato.
  const VISUAL_PARENT_OVERRIDES = new Map([
    ['6', '13'],
    ['8', '13']
  ]);

  const HIERARCHY_ORDER = new Map([
    ['1', ['2', '3', '4', '14', '15', '16', '17', '21', '22', '23']],
    ['4', ['5', '7', '33', '13']],
    ['33', ['9', '10', '11', '12']],
    ['13', ['6', '8']],
    ['17', ['18', '19', '20']],
    ['24', ['25', '26', '27', '28', '29', '30', '31', '32']]
  ]);

  const ICON_BY_TYPE = {
    governo: 'icona_corona.png',
    ducato: 'icona_palazzo.png',
    principato: 'icona_giglio.png',
    contea: 'icona_torre.png',
    provincia: 'icona_montagna.png',
    terra: 'icona_torre.png',
    marchesato: 'icona_castello_porta.png',
    giurisdizione: 'icona_torre.png',
    'comune moderno': 'icona_castello_porta.png',
    altro: 'icona_palazzo.png'
  };

  const state = {
    data: null,
    featuresById: new Map(),
    visibleFeatures: [],
    layersById: new Map(),
    layerGroup: null,
    currentYear: INITIAL_YEAR,
    explicitSelection: false,
    historicalPane: null,
    viewMode: 'map',
    selectedFeatureId: null,
    miniMap: null,
    miniLayerGroup: null
  };

  const timelineHost = document.getElementById('historical-year-switcher');
  const timelineNote = document.getElementById('historical-timeline-note');
  const infographic = document.getElementById('historical-infographic');
  const mapStatus = document.getElementById('historical-map-status');
  const mapElement = document.getElementById('map');
  const mapShell = document.querySelector('[data-historical-panel="map"]');
  const viewButtons = Array.from(document.querySelectorAll('[data-historical-view]'));
  const modal = document.getElementById('historical-modal');
  const modalTitle = document.getElementById('historical-modal-title');
  const modalKicker = document.getElementById('historical-modal-kicker');
  const modalBody = document.getElementById('historical-modal-body');

  if (!timelineHost || !mapElement || typeof map === 'undefined' || typeof L === 'undefined') {
    console.warn('Modulo storico non inizializzato: mappa o contenitori non disponibili.');
    return;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeType(value) {
    return String(value || 'altro').trim().toLowerCase();
  }

  function featureId(feature) {
    return String(feature?.properties?.id ?? feature?.id ?? '');
  }

  function featureYear(feature) {
    return Number(feature?.properties?.anno);
  }

  function displayParentId(feature) {
    const id = featureId(feature);
    const raw = feature?.properties?.parent_id;
    return VISUAL_PARENT_OVERRIDES.get(id) ?? (raw == null || raw === '' ? null : String(raw));
  }

  function iconForFeature(feature) {
    const type = normalizeType(feature?.properties?.tipologia);
    return ASSET_BASE + (ICON_BY_TYPE[type] || 'icona_torre.png');
  }

  function visibleForYear(year) {
    const all = state.data?.features || [];
    return all.filter(feature => {
      const y = featureYear(feature);
      return year === 2006 ? (y === 2001 || y === 2006) : y === year;
    });
  }

  function ringArea(ring) {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      area += Number(a?.[0] || 0) * Number(b?.[1] || 0) - Number(b?.[0] || 0) * Number(a?.[1] || 0);
    }
    return Math.abs(area / 2);
  }

  function geometryArea(geometry) {
    if (!geometry) return 0;
    if (geometry.type === 'Polygon') {
      return ringArea(geometry.coordinates?.[0]);
    }
    if (geometry.type === 'MultiPolygon') {
      return (geometry.coordinates || []).reduce((sum, polygon) => sum + ringArea(polygon?.[0]), 0);
    }
    return 0;
  }

  function geometryHasCoordinates(geometry) {
    if (!geometry || !Array.isArray(geometry.coordinates)) return false;
    const stack = [geometry.coordinates];
    while (stack.length) {
      const item = stack.pop();
      if (!Array.isArray(item)) continue;
      if (item.length >= 2 && Number.isFinite(Number(item[0])) && Number.isFinite(Number(item[1]))) return true;
      item.forEach(child => stack.push(child));
    }
    return false;
  }

  function hueFromId(id) {
    let hash = 0;
    for (const char of String(id)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return Math.abs(hash) % 360;
  }

  function hasVisibleChildren(feature) {
    const id = featureId(feature);
    return state.visibleFeatures.some(candidate => displayParentId(candidate) === id);
  }

  function historicalStyle(feature) {
    const id = featureId(feature);
    const parentId = displayParentId(feature);
    const hasChildren = hasVisibleChildren(feature);

    if (featureYear(feature) === 2001 || featureYear(feature) === 2006) {
      if (id === '24') {
        return {
          pane: 'historicalPane',
          color: '#7c8f79',
          weight: 2.4,
          opacity: 0.90,
          dashArray: '9 6',
          fillColor: '#d7e2d7',
          fillOpacity: 0.09
        };
      }
      if (featureYear(feature) === 2006) {
        return {
          pane: 'historicalPane',
          color: '#456f67',
          weight: 2.5,
          opacity: 0.95,
          fillColor: '#b9d2c8',
          fillOpacity: 0.34
        };
      }
      return {
        pane: 'historicalPane',
        color: '#7c8f79',
        weight: 2.15,
        opacity: 0.92,
        fillColor: '#d7e2d7',
        fillOpacity: 0.30
      };
    }

    if (id === '1') {
      return {
        pane: 'historicalPane',
        color: '#71523b',
        weight: 2.8,
        opacity: 0.92,
        dashArray: '10 5',
        fillColor: '#eadfce',
        fillOpacity: 0.09
      };
    }
    if (id === '4') {
      return {
        pane: 'historicalPane',
        color: '#936347',
        weight: 2.4,
        opacity: 0.92,
        fillColor: '#e4cfb7',
        fillOpacity: 0.14
      };
    }
    if (id === '33') {
      return {
        pane: 'historicalPane',
        color: '#934123',
        weight: 2.35,
        opacity: 0.96,
        dashArray: '7 4',
        fillColor: '#e7c7b4',
        fillOpacity: 0.16
      };
    }
    if (id === '13') {
      return {
        pane: 'historicalPane',
        color: '#735d78',
        weight: 2.35,
        opacity: 0.96,
        dashArray: '7 4',
        fillColor: '#d9c9df',
        fillOpacity: 0.17
      };
    }

    // Tutti i figli dei Feudi Rangoni condividono tonalità terracotta.
    if (parentId === '33') {
      const lightness = 76 + (Number(id) % 4) * 3;
      return {
        pane: 'historicalPane',
        color: '#9b4c30',
        weight: 2.15,
        opacity: 0.96,
        fillColor: `hsl(18 44% ${lightness}%)`,
        fillOpacity: 0.40
      };
    }

    // Tutti i figli del Marchesato di Vignola condividono tonalità malva.
    if (parentId === '13') {
      const lightness = 78 + (Number(id) % 3) * 3;
      return {
        pane: 'historicalPane',
        color: '#715a78',
        weight: 2.15,
        opacity: 0.96,
        fillColor: `hsl(279 26% ${lightness}%)`,
        fillOpacity: 0.39
      };
    }

    const hue = hueFromId(id);
    return {
      pane: 'historicalPane',
      color: `hsl(${hue} 25% 47%)`,
      weight: hasChildren ? 2.15 : 1.85,
      opacity: 0.90,
      fillColor: `hsl(${hue} 34% 82%)`,
      fillOpacity: hasChildren ? 0.16 : 0.34
    };
  }

  function hoverStyle(feature) {
    const base = historicalStyle(feature);
    return {
      ...base,
      weight: Math.max(3, Number(base.weight || 2) + 1),
      opacity: 1,
      fillOpacity: Math.min(0.54, Number(base.fillOpacity || 0.2) + 0.15)
    };
  }

  function ensurePane() {
    if (!map.getPane('historicalPane')) map.createPane('historicalPane');
    state.historicalPane = map.getPane('historicalPane');
    state.historicalPane.style.zIndex = '315';
    state.historicalPane.style.pointerEvents = 'auto';
  }

  function clearHistoricalLayers() {
    if (state.layerGroup && map.hasLayer(state.layerGroup)) map.removeLayer(state.layerGroup);
    state.layersById.clear();
    state.layerGroup = L.layerGroup();
  }

  function bindFeatureLayer(feature, layer) {
    const base = historicalStyle(feature);
    layer.setStyle(base);

    layer.on('mouseover', event => {
      event.target.setStyle(hoverStyle(feature));
      event.target.bringToFront();
    });
    layer.on('mouseout', event => {
      event.target.setStyle(historicalStyle(feature));
    });
    layer.on('click', event => {
      if (event?.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
      openFeatureModal(feature);
    });
  }

  function fitVisibleLayers({ animate = true } = {}) {
    const layers = Array.from(state.layersById.values());
    if (!layers.length) return;
    const bounds = L.featureGroup(layers).getBounds();
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, {
      paddingTopLeft: [35, 55],
      paddingBottomRight: [35, 35],
      maxZoom: state.currentYear === 1790 ? 8 : 10,
      animate,
      duration: 0.65
    });
  }

  function renderMapLayers({ fit = true } = {}) {
    clearHistoricalLayers();
    state.visibleFeatures = visibleForYear(state.currentYear);

    const ordered = [...state.visibleFeatures].sort(
      (a, b) => geometryArea(b.geometry) - geometryArea(a.geometry)
    );

    ordered.forEach(feature => {
      if (!geometryHasCoordinates(feature?.geometry)) return;
      const id = featureId(feature);
      const geoLayer = L.geoJSON(feature, {
        pane: 'historicalPane',
        style: historicalStyle,
        interactive: true
      });
      geoLayer.eachLayer(layer => bindFeatureLayer(feature, layer));
      geoLayer.addTo(state.layerGroup);
      state.layersById.set(id, geoLayer);
    });

    state.layerGroup.addTo(map);
    mapElement.classList.add('historical-mode');
    updateZoomMarkerVisibility();
    if (fit) window.setTimeout(() => fitVisibleLayers(), 50);
  }

  function updateMapStatus() {
    if (!mapStatus) return;
    const y = state.currentYear;
    const count = state.visibleFeatures.filter(feature => geometryHasCoordinates(feature.geometry)).length;
    const legend = y === 2006
      ? '<span class="historical-map-status__swatch is-2001"></span>2001 <span class="historical-map-status__swatch is-2006"></span>2006'
      : `<span class="historical-map-status__swatch is-${y}"></span>${y}`;
    mapStatus.innerHTML = `
      <strong>${escapeHtml(YEAR_META[y].label)}</strong>
      <span>${count} geometrie</span>
      <span class="historical-map-status__legend">${legend}</span>
    `;
  }

  function updateTimeline() {
    timelineHost.querySelectorAll('[data-historical-year]').forEach(button => {
      const active = Number(button.dataset.historicalYear) === state.currentYear;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
    if (timelineNote) timelineNote.textContent = YEAR_META[state.currentYear].note;
  }

  function selectYear(year, { explicit = false, fit = true } = {}) {
    if (!YEARS.includes(Number(year))) return;
    state.currentYear = Number(year);
    if (explicit) state.explicitSelection = true;
    updateTimeline();
    renderMapLayers({ fit });
    updateMapStatus();
    if (state.viewMode === 'infographic') renderInfographic();
  }

  function buildTimeline() {
    timelineHost.innerHTML = YEARS.map(year => `
      <button
        type="button"
        class="historical-year"
        role="tab"
        aria-selected="${year === INITIAL_YEAR ? 'true' : 'false'}"
        data-historical-year="${year}"
      >
        <span class="historical-year__dot"></span>
        <span class="historical-year__copy">
          <strong>${year}</strong>
          <small>${escapeHtml(YEAR_META[year].short)}</small>
        </span>
      </button>
    `).join('');

    timelineHost.addEventListener('click', event => {
      const button = event.target.closest('[data-historical-year]');
      if (!button) return;
      selectYear(Number(button.dataset.historicalYear), { explicit: true, fit: true });
    });

    timelineHost.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const index = YEARS.indexOf(state.currentYear);
      const nextIndex = event.key === 'ArrowRight'
        ? Math.min(YEARS.length - 1, index + 1)
        : Math.max(0, index - 1);
      const next = timelineHost.querySelector(`[data-historical-year="${YEARS[nextIndex]}"]`);
      next?.focus();
      selectYear(YEARS[nextIndex], { explicit: true, fit: true });
    });
  }

  function getAncestors(feature) {
    const result = [];
    const visited = new Set();
    let parentId = displayParentId(feature);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = state.featuresById.get(parentId);
      if (!parent) break;
      result.push(parent);
      parentId = displayParentId(parent);
    }
    return result;
  }

  function historyText(feature) {
    const text = String(feature?.properties?.storia || '').trim();
    return text || 'Scheda storica non ancora compilata.';
  }

  function sourceBlock(feature) {
    const source = String(feature?.properties?.source || '').trim();
    if (!source) return '';
    return `
      <div class="historical-story__source">
        <strong>Fonti</strong>
        <p>${escapeHtml(source)}</p>
      </div>
    `;
  }

  function featureDetailsHtml(feature) {
    const props = feature.properties || {};
    const ancestors = getAncestors(feature);
    const lineage = [...ancestors].reverse().concat(feature);
    return `
      <nav class="historical-lineage" aria-label="Gerarchia territoriale">
        ${lineage.map((item, index) => `
          ${index ? '<i class="bi bi-chevron-right"></i>' : ''}
          <button type="button" data-focus-historical="${escapeHtml(featureId(item))}">${escapeHtml(item.properties?.nome || '')}</button>
        `).join('')}
      </nav>

      <section class="historical-story historical-story--main">
        <header>
          <img src="${iconForFeature(feature)}" alt="" />
          <div>
            <span>Storia del luogo</span>
            <h3>${escapeHtml(props.nome || '')}</h3>
          </div>
        </header>
        <p>${escapeHtml(historyText(feature))}</p>
        ${sourceBlock(feature)}
      </section>

      <section class="historical-ancestors">
        <div class="historical-ancestors__heading">
          <span>Contesto gerarchico</span>
          <h3>Storie delle giurisdizioni superiori</h3>
        </div>
        ${ancestors.length ? ancestors.map((ancestor, index) => `
          <article class="historical-story historical-story--ancestor">
            <header>
              <img src="${iconForFeature(ancestor)}" alt="" />
              <div>
                <span>${index === 0 ? 'Giurisdizione genitrice' : `Livello superiore ${index + 1}`}</span>
                <h4>${escapeHtml(ancestor.properties?.nome || '')}</h4>
              </div>
              <button type="button" data-focus-historical="${escapeHtml(featureId(ancestor))}" title="Mostra in mappa">
                <i class="bi bi-geo-alt"></i>
              </button>
            </header>
            <p>${escapeHtml(historyText(ancestor))}</p>
            ${sourceBlock(ancestor)}
          </article>
        `).join('') : '<p class="historical-empty">Questa entità non ha giurisdizioni superiori nel dataset.</p>'}
      </section>
    `;
  }

  function openFeatureModal(feature) {
    if (!modal || !modalTitle || !modalBody) return;
    const props = feature.properties || {};
    modalKicker.textContent = `${props.tipologia || 'Giurisdizione'} · ${props.anno || ''}`;
    modalTitle.textContent = props.nome || 'Senza nome';
    modalBody.innerHTML = featureDetailsHtml(feature);

    modal.hidden = false;
    document.body.classList.add('historical-modal-open');
    modal.querySelector('.historical-modal__close')?.focus();
  }

  function closeFeatureModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('historical-modal-open');
  }

  function miniMapFeatures(feature) {
    if (geometryHasCoordinates(feature?.geometry)) return [feature];
    return descendantFeatures(feature).filter(item => geometryHasCoordinates(item.geometry));
  }

  function ensureMiniMap() {
    const host = document.getElementById('historical-mini-map');
    if (!host) return null;
    if (state.miniMap && state.miniMap.getContainer() !== host) {
      state.miniMap.remove();
      state.miniMap = null;
      state.miniLayerGroup = null;
    }
    if (state.miniMap) return state.miniMap;
    state.miniMap = L.map(host, {
      zoomControl: true,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: true,
      boxZoom: false,
      keyboard: false,
      minZoom: 6
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(state.miniMap);
    state.miniLayerGroup = L.layerGroup().addTo(state.miniMap);
    state.miniMap.setView([44.5, 10.95], 8);
    return state.miniMap;
  }

  function renderMiniMapSelection(feature) {
    const miniMap = ensureMiniMap();
    if (!miniMap || !state.miniLayerGroup) return;
    state.miniLayerGroup.clearLayers();
    const features = miniMapFeatures(feature);
    if (!features.length) return;
    const selectedId = featureId(feature);
    const layer = L.geoJSON({ type: 'FeatureCollection', features }, {
      interactive: false,
      style: candidate => {
        const direct = featureId(candidate) === selectedId;
        return {
          color: direct ? '#762d1b' : '#8e4c32',
          weight: direct ? 3 : 2,
          opacity: 1,
          fillColor: direct ? '#b75b3b' : '#ce9277',
          fillOpacity: direct ? 0.48 : 0.35
        };
      }
    }).addTo(state.miniLayerGroup);
    const bounds = layer.getBounds();
    window.setTimeout(() => {
      miniMap.invalidateSize();
      if (bounds.isValid()) miniMap.fitBounds(bounds, { padding: [22, 22], maxZoom: 12, animate: false });
    }, 30);
  }

  function selectInfographicFeature(id) {
    const feature = state.featuresById.get(String(id));
    const inspector = infographic?.querySelector('[data-historical-inspector-body]');
    if (!feature || !inspector) return;
    state.selectedFeatureId = featureId(feature);
    infographic.querySelectorAll('[data-focus-historical]').forEach(button => {
      const active = button.dataset.focusHistorical === state.selectedFeatureId;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const props = feature.properties || {};
    const inspectorKicker = infographic.querySelector('[data-historical-inspector-kicker]');
    const inspectorTitle = infographic.querySelector('[data-historical-inspector-title]');
    if (inspectorKicker) inspectorKicker.textContent = `${props.tipologia || 'Giurisdizione'} · ${props.anno || ''}`;
    if (inspectorTitle) inspectorTitle.textContent = props.nome || 'Senza nome';
    inspector.innerHTML = featureDetailsHtml(feature);
    renderMiniMapSelection(feature);
  }

  function scrollToInfographicInspector() {
    const inspector = infographic?.querySelector('.historical-infographic__inspector');
    if (!inspector) return;
    inspector.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
    inspector.classList.remove('is-arriving');
    window.requestAnimationFrame(() => inspector.classList.add('is-arriving'));
    window.setTimeout(() => inspector.classList.remove('is-arriving'), 900);
  }

  function scrollToHierarchyTree() {
    const tree = infographic?.querySelector('.historical-hierarchy-canvas');
    tree?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start'
    });
  }

  function setViewMode(mode) {
    const next = mode === 'infographic' ? 'infographic' : 'map';
    state.viewMode = next;
    viewButtons.forEach(button => {
      const active = button.dataset.historicalView === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (mapShell) mapShell.hidden = next !== 'map';
    if (infographic) infographic.hidden = next !== 'infographic';
    if (next === 'infographic') {
      closeFeatureModal();
      renderInfographic();
    } else {
      window.setTimeout(() => {
        map.invalidateSize();
        fitVisibleLayers({ animate: false });
      }, 40);
    }
  }

  function descendantFeatures(feature) {
    const output = [];
    const queue = [featureId(feature)];
    const visited = new Set(queue);
    while (queue.length) {
      const parentId = queue.shift();
      state.visibleFeatures.forEach(candidate => {
        const id = featureId(candidate);
        if (displayParentId(candidate) !== parentId || visited.has(id)) return;
        visited.add(id);
        output.push(candidate);
        queue.push(id);
      });
    }
    return output;
  }

  function focusLayersForFeature(feature) {
    const direct = state.layersById.get(featureId(feature));
    if (direct) return [direct];

    const descendants = descendantFeatures(feature)
      .map(item => state.layersById.get(featureId(item)))
      .filter(Boolean);
    if (descendants.length) return descendants;

    const ancestor = getAncestors(feature).find(item => state.layersById.has(featureId(item)));
    if (ancestor) return [state.layersById.get(featureId(ancestor))];

    return Array.from(state.layersById.values());
  }

  function focusFeature(id, { openModalAfter = false } = {}) {
    const key = String(id);
    const feature = state.featuresById.get(key);
    if (!feature) return;
    const layers = focusLayersForFeature(feature);

    closeFeatureModal();
    document.querySelector('.historical-map-shell')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    window.setTimeout(() => {
      map.invalidateSize();
      if (layers.length) {
        const bounds = L.featureGroup(layers).getBounds();
        if (bounds?.isValid()) {
          map.flyToBounds(bounds, {
            padding: [55, 55],
            maxZoom: Math.max(9, Math.min(12, map.getBoundsZoom(bounds) + 1)),
            duration: 0.8
          });
        }
        layers.forEach(layer => layer.eachLayer(path => {
          path.setStyle({ weight: 5, opacity: 1, fillOpacity: 0.56, color: '#8f341f' });
          path.bringToFront();
        }));
      }
      window.setTimeout(() => {
        layers.forEach(layer => {
          const layerFeature = state.featuresById.get(
            Array.from(state.layersById.entries()).find(([, value]) => value === layer)?.[0] || key
          ) || feature;
          layer.eachLayer(path => path.setStyle(historicalStyle(layerFeature)));
        });
        if (openModalAfter) openFeatureModal(feature);
      }, 1250);
    }, 420);
  }

  function childrenOf(parentId, featureSet) {
    const id = String(parentId);
    const preferred = HIERARCHY_ORDER.get(id) || [];
    const rank = new Map(preferred.map((childId, index) => [childId, index]));
    return featureSet
      .filter(feature => displayParentId(feature) === id)
      .sort((a, b) => {
        const aid = featureId(a);
        const bid = featureId(b);
        const ar = rank.has(aid) ? rank.get(aid) : Number.MAX_SAFE_INTEGER;
        const br = rank.has(bid) ? rank.get(bid) : Number.MAX_SAFE_INTEGER;
        if (ar !== br) return ar - br;
        return String(a.properties?.nome || '').localeCompare(String(b.properties?.nome || ''), 'it');
      });
  }

  function descendantCount(feature, featureSet) {
    const children = childrenOf(featureId(feature), featureSet);
    return children.length + children.reduce((sum, child) => sum + descendantCount(child, featureSet), 0);
  }

  function renderEntityButton(feature, className = 'hierarchy-card') {
    return `
      <button type="button" class="${className}" data-focus-historical="${escapeHtml(featureId(feature))}">
        <img src="${iconForFeature(feature)}" alt="" />
        <span>${escapeHtml(feature.properties?.nome || '')}</span>
        <small>${escapeHtml(feature.properties?.tipologia || '')}</small>
      </button>
    `;
  }

  function renderNestedList(features, featureSet, depth = 0) {
    if (!features.length) return '';
    return `
      <ul class="hierarchy-nested hierarchy-nested--depth-${depth}">
        ${features.map(feature => {
          const children = childrenOf(featureId(feature), featureSet);
          return `
            <li>
              ${renderEntityButton(feature, 'hierarchy-list-card')}
              ${renderNestedList(children, featureSet, depth + 1)}
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }

  function infographicTitle(year, root) {
    if (year === 1790) return root?.properties?.nome || 'Governo Estense';
    return root?.properties?.nome || 'Unione dei Comuni Terre di Castelli';
  }

  function renderInfographic() {
    if (!infographic) return;
    if (state.miniMap) {
      state.miniMap.remove();
      state.miniMap = null;
      state.miniLayerGroup = null;
    }
    const featureSet = [...state.visibleFeatures];
    const visibleIds = new Set(featureSet.map(featureId));
    const roots = featureSet.filter(feature => {
      const parentId = displayParentId(feature);
      return !parentId || !visibleIds.has(parentId);
    });
    const root = roots.find(feature => featureId(feature) === (state.currentYear === 1790 ? '1' : '24')) || roots[0];
    if (!root) {
      infographic.hidden = true;
      return;
    }

    const firstLevel = childrenOf(featureId(root), featureSet).filter(feature => {
      const name = String(feature.properties?.nome || '').trim().toLowerCase();
      const type = normalizeType(feature.properties?.tipologia);
      return name !== 'altro' && type !== 'altro';
    });
    const parentBranches = firstLevel.filter(feature => childrenOf(featureId(feature), featureSet).length > 0);
    const year = state.currentYear;
    const modern = year !== 1790;

    infographic.innerHTML = `
      <div class="historical-infographic__paper ${modern ? 'is-modern' : 'is-estense'}">
        <img class="historical-decoration historical-decoration--crest" src="${ASSET_BASE}${modern ? 'icona_castello_porta.png' : 'stemma_estense.png'}" alt="" />
        <img class="historical-decoration historical-decoration--putto" src="${ASSET_BASE}putto_cartografo.png" alt="" />
        <img class="historical-decoration historical-decoration--city" src="${ASSET_BASE}paesaggio_citta.png" alt="" />
        <img class="historical-decoration historical-decoration--mountains" src="${ASSET_BASE}paesaggio_monti.png" alt="" />

        <header class="historical-infographic__header">
          <span>Atlante delle giurisdizioni</span>
          <h2>${escapeHtml(infographicTitle(year, root))}</h2>
          <p>${escapeHtml(YEAR_META[year].subtitle)}</p>
        </header>

        <div class="historical-infographic__layout">
          <div class="historical-hierarchy-canvas">
            <div class="hierarchy-root-wrap">
              ${renderEntityButton(root, 'hierarchy-root')}
              <div class="hierarchy-domain">${modern ? 'Comuni dell’Unione' : 'Dominio Estense'}</div>
            </div>

            <div class="hierarchy-first-level" style="--entity-count:${Math.max(1, firstLevel.length)}">
              ${firstLevel.map(feature => {
                const hasDescendants = childrenOf(featureId(feature), featureSet).length > 0;
                return renderEntityButton(feature, `hierarchy-card${hasDescendants ? ' has-descendants' : ''}`);
              }).join('')}
            </div>

            ${parentBranches.length ? `
              <div class="hierarchy-subtrees">
                ${parentBranches.map(parent => {
                  const children = childrenOf(featureId(parent), featureSet);
                  const total = descendantCount(parent, featureSet);
                  return `
                    <section class="hierarchy-subtree ${total > 5 ? 'is-wide' : ''}">
                      <header>
                        ${renderEntityButton(parent, 'hierarchy-subtree__parent')}
                        <span>${total} ${total === 1 ? 'giurisdizione dipendente' : 'giurisdizioni dipendenti'}</span>
                      </header>
                      ${renderNestedList(children, featureSet)}
                    </section>
                  `;
                }).join('')}
              </div>
            ` : ''}

            <footer class="historical-infographic__footer">
              <span></span>
              <p>Seleziona un’entità per visualizzare territorio e scheda.</p>
              <span></span>
            </footer>
          </div>

          <aside class="historical-infographic__inspector" aria-live="polite">
            <header class="historical-infographic__inspector-head">
              <div>
                <span data-historical-inspector-kicker></span>
                <h3 data-historical-inspector-title></h3>
              </div>
              <button type="button" class="historical-inspector-back" data-historical-back-to-tree title="Torna al diagramma gerarchico" aria-label="Torna al diagramma gerarchico">
                <i class="bi bi-diagram-3"></i>
              </button>
            </header>
            <div class="historical-mini-map-wrap">
              <div id="historical-mini-map" class="historical-mini-map" aria-label="Territorio selezionato"></div>
              <span class="historical-mini-map__credit">© OpenStreetMap contributors</span>
            </div>
            <div class="historical-infographic__inspector-body" data-historical-inspector-body></div>
          </aside>
        </div>
      </div>
    `;
    infographic.hidden = state.viewMode !== 'infographic';

    const current = state.featuresById.get(String(state.selectedFeatureId || ''));
    const selected = current && featureSet.some(feature => featureId(feature) === featureId(current)) ? current : root;
    state.selectedFeatureId = featureId(selected);
    window.setTimeout(() => selectInfographicFeature(state.selectedFeatureId), 0);
  }

  function updateZoomMarkerVisibility() {
    const zoom = map.getZoom();
    mapElement.classList.toggle('historical-close-zoom', zoom >= 12);
    mapElement.classList.toggle('historical-mid-zoom', zoom >= 10 && zoom < 12);
  }

  function bindGlobalInteractions() {
    map.on('zoomend', updateZoomMarkerVisibility);

    document.addEventListener('click', event => {
      const focusButton = event.target.closest('[data-focus-historical]');
      if (focusButton) {
        event.preventDefault();
        const id = focusButton.dataset.focusHistorical;
        if (focusButton.closest('#historical-infographic')) {
          selectInfographicFeature(id);
          if (focusButton.closest('.historical-hierarchy-canvas')) scrollToInfographicInspector();
          return;
        }
        focusFeature(id, {
          openModalAfter: focusButton.closest('.historical-modal') != null
        });
        return;
      }
      if (event.target.closest('[data-historical-back-to-tree]')) {
        event.preventDefault();
        scrollToHierarchyTree();
        return;
      }
      if (event.target.closest('[data-historical-close]')) closeFeatureModal();
    });

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal && !modal.hidden) closeFeatureModal();
    });

    viewButtons.forEach(button => {
      button.addEventListener('click', () => setViewMode(button.dataset.historicalView));
    });
  }

  async function initHistoricalMap() {
    buildTimeline();
    bindGlobalInteractions();
    ensurePane();

    try {
      const response = await fetch(HISTORICAL_DATA_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Il file non è un FeatureCollection valido.');
      }
      state.data = data;
      data.features.forEach(feature => state.featuresById.set(featureId(feature), feature));
      selectYear(INITIAL_YEAR, { explicit: false, fit: true });
      setViewMode('map');
    } catch (error) {
      console.error('Errore caricamento storico.geojson', error);
      if (mapStatus) {
        mapStatus.innerHTML = '<strong>Dati storici non disponibili</strong><span>Controlla data/storico.geojson</span>';
      }
    }
  }

  initHistoricalMap();
})();
