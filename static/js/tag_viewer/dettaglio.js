// dettaglio.js — viewer immagine + tag
// Patch grafica/UI limitata alla pagina tag_viewer/dettaglio.html.

const PLACES_URL = 'data/places.geojson';
const MAPS_CSV_URL = 'data/maps.csv';
const MAPS_PLACES_URL = 'data/maps_places.csv';
const PIN_BASE_SCALE = 1;

const qs = new URLSearchParams(location.search);
const QS = {
  fid: qs.get('fid') || '',
  name: decodeURIComponent(qs.get('name') || ''),
  path: qs.get('path') || ''
};

function setImageLoadingState(state = 'loading', message = ''){
  const overlay = document.getElementById('image-loading');
  const title = document.getElementById('image-loading-title');
  const text = document.getElementById('image-loading-text');
  if(!overlay) return;

  overlay.classList.toggle('is-hidden', state === 'hidden');
  overlay.classList.toggle('is-error', state === 'error');
  overlay.setAttribute('aria-busy', String(state === 'loading'));

  if(title){
    title.textContent = state === 'error' ? 'Immagine non disponibile' : 'Caricamento immagine';
  }
  if(text && message){
    text.textContent = message;
  }
}

function afterTwoFrames(){
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function isNonEmpty(value){
  return value != null && String(value).trim() !== '';
}

function normId(value){
  const raw = (value ?? '').toString().trim().replace(/^"+|"+$/g, '');
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? String(numeric) : raw;
}

function finiteCoord(value){
  if(!isNonEmpty(value)) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function imgUrl(relativePath){
  if(!relativePath) return '';
  const clean = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return clean.startsWith('images/') ? clean : `images/${clean}`;
}

function fullFromSigla(sigla){
  return sigla ? `maps/full_width/${sigla}.jpg` : '';
}

function parseCSV(text){
  const rows = [];
  let index = 0;
  let field = '';
  let row = [];
  let quoted = false;

  while(index < text.length){
    const char = text[index];
    if(quoted){
      if(char === '"'){
        if(text[index + 1] === '"'){
          field += '"';
          index += 1;
        }else{
          quoted = false;
        }
      }else{
        field += char;
      }
    }else if(char === '"'){
      quoted = true;
    }else if(char === ','){
      row.push(field);
      field = '';
    }else if(char === '\n' || char === '\r'){
      if(field !== '' || row.length){
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
      if(char === '\r' && text[index + 1] === '\n') index += 1;
    }else{
      field += char;
    }
    index += 1;
  }

  if(field !== '' || row.length){
    row.push(field);
    rows.push(row);
  }
  if(!rows.length) return {headers: [], data: []};

  const headers = rows[0].map(header => (header || '').trim().replace(/^\uFEFF/, ''));
  const data = rows.slice(1)
    .filter(cells => cells.some(cell => (cell ?? '').toString().trim()))
    .map(cells => {
      const result = {};
      headers.forEach((header, cellIndex) => {
        result[header] = (cells[cellIndex] ?? '').toString();
      });
      return result;
    });

  return {headers, data};
}

function parseMaybeJson(value){
  if(!isNonEmpty(value)) return [];
  try{
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }catch{
    return [];
  }
}

function escapeHtml(value){
  return (value ?? '').toString().replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function indexByFid(features){
  const index = new Map();
  features.forEach(feature => {
    const fid = feature.properties?.fid ?? feature.properties?.id;
    if(fid != null) index.set(String(fid), feature);
  });
  return index;
}

function featureLatLng(feature){
  if(!feature?.geometry || feature.geometry.type !== 'Point') return null;
  const [lon, lat] = feature.geometry.coordinates || [];
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

function parseWikipediaField(value){
  if(!value || typeof value !== 'string') return null;
  const match = value.match(/^([a-z-]+):(.*)$/i);
  if(match){
    const lang = match[1].toLowerCase();
    const rawTitle = match[2].trim();
    return {
      title: rawTitle,
      url: `https://${lang}.wikipedia.org/wiki/${rawTitle.replace(/ /g, '_')}`
    };
  }
  if(/^https?:\/\//i.test(value.trim())){
    return {title: 'Wikipedia', url: value.trim()};
  }
  return null;
}

function wikidataUrl(value){
  if(!isNonEmpty(value)) return null;
  const raw = String(value).trim();
  if(/^https?:\/\//i.test(raw)) return raw;
  const match = raw.match(/Q\d+/i);
  return match ? `https://www.wikidata.org/wiki/${match[0].toUpperCase()}` : null;
}

function imageCoordinateToPixel(value, dimension){
  if(!Number.isFinite(value) || !Number.isFinite(dimension) || dimension <= 0) return null;
  // Nei JSON correnti x/y sono normalizzati tra 0 e 1. Manteniamo però
  // compatibilità con eventuali coordinate già espresse in pixel.
  const pixel = value >= 0 && value <= 1 ? value * dimension : value;
  return Math.max(0, Math.min(dimension, pixel));
}

function placePins(pinLayer, tags, onClick, imgEl){
  pinLayer.innerHTML = '';
  const pins = [];
  const imageWidth = imgEl?.naturalWidth || imgEl?.width || 0;
  const imageHeight = imgEl?.naturalHeight || imgEl?.height || 0;

  // La layer deve avere sempre la stessa estensione reale dell'immagine.
  // Usare dimensioni e coordinate in pixel evita che le percentuali vengano
  // risolte quando il contenitore è ancora 1×1, spostando i tag in alto a sinistra.
  pinLayer.style.width = `${imageWidth}px`;
  pinLayer.style.height = `${imageHeight}px`;

  tags.forEach(tag => {
    const left = imageCoordinateToPixel(tag.x, imageWidth);
    const top = imageCoordinateToPixel(tag.y, imageHeight);
    if(left == null || top == null) return;

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'tag-pin';
    pin.dataset.tagId = String(tag.id);
    pin.dataset.imageX = String(tag.x);
    pin.dataset.imageY = String(tag.y);
    const label = isNonEmpty(tag.nome) ? tag.nome : `#${tag.id}`;
    const labelSpan = document.createElement('span');
    labelSpan.className = 'tag-pin-label';
    labelSpan.textContent = label;
    pin.appendChild(labelSpan);
    pin.title = label;
    pin.style.left = `${left}px`;
    pin.style.top = `${top}px`;
    pin.addEventListener('click', event => {
      event.stopPropagation();
      onClick?.(tag, true);
    });

    pinLayer.appendChild(pin);
    pins.push(pin);
  });

  return pins;
}

function makeThumbDataURL(imgEl, x01, y01, outW = 320, outH = 190){
  if(!Number.isFinite(x01) || !Number.isFinite(y01)) return null;

  const imageWidth = imgEl.naturalWidth;
  const imageHeight = imgEl.naturalHeight;
  if(!imageWidth || !imageHeight) return null;

  const centerX = Math.round(x01 * imageWidth);
  const centerY = Math.round(y01 * imageHeight);
  const sourceWidth = Math.max(1, Math.round(imageWidth / 6));
  const sourceHeight = Math.max(1, Math.round(imageHeight / 6));
  const sourceX = Math.max(0, Math.min(imageWidth - sourceWidth, centerX - sourceWidth / 2));
  const sourceY = Math.max(0, Math.min(imageHeight - sourceHeight, centerY - sourceHeight / 2));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const context = canvas.getContext('2d');
  context.drawImage(
    imgEl,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outW,
    outH
  );
  return canvas.toDataURL('image/jpeg', .86);
}

function createGalleryCard(tag, feature, imgEl, onSelect){
  const card = document.createElement('article');
  card.className = 'ds-card';
  card.dataset.tagId = String(tag.id);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  const thumbUrl = makeThumbDataURL(imgEl, tag.x, tag.y, 260, 130);
  if(thumbUrl){
    const image = document.createElement('img');
    image.src = thumbUrl;
    image.alt = '';
    thumb.appendChild(image);
  }else{
    thumb.innerHTML = '<div class="preview-placeholder">senza coordinate</div>';
  }

  const title = document.createElement('div');
  title.className = 'place-title';
  title.textContent = isNonEmpty(tag.nome) ? tag.nome : `#${tag.id}`;

  const meta = document.createElement('div');
  meta.className = 'muted';
  const fid = feature?.properties?.fid != null
    ? String(feature.properties.fid)
    : (isNonEmpty(tag.valore) ? String(tag.valore) : 'n/d');
  meta.textContent = `fid: ${fid}`;

  const select = () => onSelect?.(tag, true);
  card.addEventListener('click', select);
  card.addEventListener('keydown', event => {
    if(event.key === 'Enter' || event.key === ' '){
      event.preventDefault();
      select();
    }
  });

  card.append(thumb, title, meta);
  return card;
}

function setActiveSelection(tag, scrollGallery = false){
  document.querySelectorAll('.tag-pin').forEach(pin => pin.classList.remove('active'));
  document.querySelectorAll('.ds-card').forEach(card => card.classList.remove('active'));

  const pin = document.querySelector(`.tag-pin[data-tag-id="${CSS.escape(String(tag.id))}"]`);
  const card = document.querySelector(`.ds-card[data-tag-id="${CSS.escape(String(tag.id))}"]`);
  pin?.classList.add('active');
  card?.classList.add('active');

  if(scrollGallery && card){
    card.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'center'});
  }
}

function addDefinitionRow(target, label, value){
  if(!isNonEmpty(value)) return;
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = String(value).trim();
  target.append(dt, dd);
}

function addTextSection(target, title, value){
  if(!isNonEmpty(value)) return;
  const section = document.createElement('section');
  section.className = 'place-text-section';
  section.innerHTML = `
    <div class="place-text-title">${escapeHtml(title)}</div>
    <div class="place-text">${escapeHtml(String(value).trim())}</div>
  `;
  target.appendChild(section);
}

function renderSelectedPlace(tag, feature, imgEl){
  const properties = feature?.properties || {};
  const fid = properties.fid != null
    ? String(properties.fid)
    : (isNonEmpty(tag.valore) ? String(tag.valore) : 'n/d');
  const name = isNonEmpty(tag.nome)
    ? tag.nome
    : (properties.name || `Luogo ${fid}`);

  document.getElementById('selected-title').textContent = name;
  document.getElementById('selected-fid').textContent = `fid: ${fid}`;
  document.getElementById('selected-preview-name').textContent = name;
  document.getElementById('selected-preview-meta').textContent = [
    properties.tipologia,
    `fid: ${fid}`
  ].filter(isNonEmpty).join(' · ');

  const preview = document.getElementById('selected-preview');
  const previewUrl = makeThumbDataURL(imgEl, tag.x, tag.y, 500, 300);
  preview.innerHTML = previewUrl
    ? `<img src="${previewUrl}" alt="Ritaglio della mappa relativo a ${escapeHtml(name)}">`
    : '<span class="preview-placeholder">Anteprima non disponibile</span>';

  const details = document.getElementById('place-details');
  details.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'place-summary';
  [properties.tipologia, properties.region, properties.province]
    .filter(isNonEmpty)
    .forEach(value => {
      const badge = document.createElement('span');
      badge.className = 'place-badge';
      badge.textContent = String(value).trim();
      summary.appendChild(badge);
    });
  if(summary.childElementCount) details.appendChild(summary);

  const dataGrid = document.createElement('dl');
  dataGrid.className = 'place-data-grid';
  addDefinitionRow(dataGrid, 'Toponimo', properties.name || name);
  addDefinitionRow(dataGrid, 'Tipologia', properties.tipologia);
  addDefinitionRow(dataGrid, 'Proprietario / soggetti', tag.people);
  addDefinitionRow(dataGrid, 'Regione', properties.region);
  addDefinitionRow(dataGrid, 'Provincia', properties.province);
  addDefinitionRow(dataGrid, 'Provincia storica', properties.historical_province);
  addDefinitionRow(dataGrid, 'Dimensione', properties.dimension);
  addDefinitionRow(dataGrid, 'Interpretazione', properties.interpreted);
  addDefinitionRow(dataGrid, 'Classificazione', properties.as);
  if(dataGrid.childElementCount) details.appendChild(dataGrid);

  addTextSection(details, 'Descrizione storica', properties.descrizione);
  addTextSection(details, 'Identificazione attuale', properties.identificazione_attuale);
  addTextSection(details, 'Note di lavoro', properties['note Marcello']);
  addTextSection(details, 'Nota del tag', tag.note);

  const wiki = parseWikipediaField(properties.wikipedia);
  const wikidata = wikidataUrl(properties.wikidata);
  if(wiki || wikidata){
    const links = document.createElement('div');
    links.className = 'place-links';
    if(wiki){
      links.insertAdjacentHTML(
        'beforeend',
        `<a class="btn ghost sm" href="${escapeHtml(wiki.url)}" target="_blank" rel="noopener"><i class="bi bi-wikipedia" aria-hidden="true"></i> Wikipedia</a>`
      );
    }
    if(wikidata){
      links.insertAdjacentHTML(
        'beforeend',
        `<a class="btn ghost sm" href="${escapeHtml(wikidata)}" target="_blank" rel="noopener"><i class="bi bi-database" aria-hidden="true"></i> Wikidata</a>`
      );
    }
    details.appendChild(links);
  }

  if(!details.childElementCount){
    details.innerHTML = '<div class="empty-state">Per questo luogo non sono ancora disponibili informazioni descrittive.</div>';
  }
}

function buildMiniMap(elId, tags, matches, allFeatures, onSelect){
  const container = document.getElementById(elId);
  if(!window.L){
    console.warn('Leaflet non disponibile: la mini-mappa GIS viene disattivata, ma il viewer dell’immagine resta operativo.');
    if(container){
      container.innerHTML = `
        <div class="mini-map-unavailable" role="status">
          <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
          <span>Mini-mappa non disponibile</span>
        </div>`;
    }
    return null;
  }

  const map = window.L.map(elId, {
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: false
  });
  map.zoomControl.setPosition('bottomright');

  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const renderer = window.L.canvas({padding: .5});
  const presentGroup = window.L.featureGroup();
  const presentFids = new Set();

  matches.forEach((feature, index) => {
    const latLng = featureLatLng(feature);
    if(!latLng) return;

    const fid = feature.properties?.fid;
    if(fid != null) presentFids.add(String(fid));

    const marker = window.L.circleMarker(latLng, {
      renderer,
      radius: 5,
      weight: 1.7,
      color: '#24323d',
      fillColor: '#934123',
      fillOpacity: .9
    });
    marker.on('click', () => onSelect?.(tags[index], true));
    presentGroup.addLayer(marker);
  });

  if(presentGroup.getLayers().length){
    presentGroup.addTo(map);
    map.fitBounds(presentGroup.getBounds().pad(.24));
  }else{
    map.setView([44.45, 10.95], 9);
  }

  const othersGroup = window.L.layerGroup();
  allFeatures.forEach(feature => {
    const latLng = featureLatLng(feature);
    if(!latLng) return;
    const fid = feature.properties?.fid;
    if(fid != null && presentFids.has(String(fid))) return;

    window.L.circleMarker(latLng, {
      renderer,
      radius: 3,
      weight: 1.2,
      color: '#934123',
      fillColor: '#d6ad99',
      fillOpacity: .68
    }).addTo(othersGroup);
  });

  return {map, presentGroup, othersGroup};
}

function setupPanZoom(){
  const viewport = document.getElementById('raster-viewport');
  const stage = document.getElementById('raster-wrap');
  const img = document.getElementById('raster-img');
  const pinLayer = document.getElementById('pin-layer');

  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let imageWidth = 0;
  let imageHeight = 0;
  let fitScale = 1;
  let maxScale = 8;
  let scheduled = false;
  let panning = false;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let startTranslateX = 0;
  let startTranslateY = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function readImageSize(){
    imageWidth = img.naturalWidth || img.width || 0;
    imageHeight = img.naturalHeight || img.height || 0;
    if(!imageWidth || !imageHeight) return false;

    // L'elemento trasformato è assoluto: gli assegniamo sempre le dimensioni
    // reali dell'immagine per evitare che il layout lo consideri 0×0.
    stage.style.width = `${imageWidth}px`;
    stage.style.height = `${imageHeight}px`;
    img.style.width = `${imageWidth}px`;
    img.style.height = `${imageHeight}px`;
    if(pinLayer){
      pinLayer.style.width = `${imageWidth}px`;
      pinLayer.style.height = `${imageHeight}px`;
    }
    return true;
  }

  function getViewport(){
    return {
      left: 0,
      top: 0,
      width: Math.max(1, viewport.clientWidth),
      height: Math.max(1, viewport.clientHeight)
    };
  }

  function updateScaleLimits(){
    if(!readImageSize()) return false;
    const view = getViewport();
    fitScale = Math.max(.001, Math.min(view.width / imageWidth, view.height / imageHeight));
    maxScale = Math.max(2, Math.min(8, fitScale * 40));
    return true;
  }

  function clampTranslation(){
    if(!imageWidth || !imageHeight) return;
    const view = getViewport();
    const scaledWidth = imageWidth * scale;
    const scaledHeight = imageHeight * scale;

    if(scaledWidth <= view.width){
      translateX = (view.width - scaledWidth) / 2;
    }else{
      translateX = clamp(translateX, view.width - scaledWidth, 0);
    }

    if(scaledHeight <= view.height){
      translateY = (view.height - scaledHeight) / 2;
    }else{
      translateY = clamp(translateY, view.height - scaledHeight, 0);
    }
  }

  function applyPinScale(){
    document.documentElement.style.setProperty(
      '--pin-scale',
      String(PIN_BASE_SCALE / Math.max(scale, .001))
    );
  }

  function render(){
    scheduled = false;
    stage.style.transform = `translate3d(${translateX}px,${translateY}px,0) scale(${scale})`;
    applyPinScale();
  }

  function requestRender(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  function fitToViewport(){
    if(!updateScaleLimits()) return;
    const view = getViewport();
    scale = fitScale;
    translateX = (view.width - imageWidth * scale) / 2;
    translateY = (view.height - imageHeight * scale) / 2;
    clampTranslation();
    requestRender();
  }

  function resetToActualSize(){
    if(!updateScaleLimits()) return;
    const view = getViewport();
    scale = clamp(1, fitScale, maxScale);
    translateX = (view.width - imageWidth * scale) / 2;
    translateY = (view.height - imageHeight * scale) / 2;
    clampTranslation();
    requestRender();
  }

  function setScaleAround(factor, clientX, clientY){
    if(!updateScaleLimits()) return;
    const rect = viewport.getBoundingClientRect();
    const view = getViewport();
    const viewportX = clamp(clientX - rect.left, 0, view.width);
    const viewportY = clamp(clientY - rect.top, 0, view.height);
    const previousScale = scale;
    const nextScale = clamp(previousScale * factor, fitScale, maxScale);
    if(Math.abs(nextScale - previousScale) < 1e-6) return;

    const imageX = (viewportX - translateX) / previousScale;
    const imageY = (viewportY - translateY) / previousScale;
    scale = nextScale;
    translateX = viewportX - imageX * scale;
    translateY = viewportY - imageY * scale;
    clampTranslation();
    requestRender();
  }

  function viewportCenter(){
    const rect = viewport.getBoundingClientRect();
    return {
      x: rect.left + viewport.clientWidth / 2,
      y: rect.top + viewport.clientHeight / 2
    };
  }

  stage.addEventListener('pointerdown', event => {
    if(event.button !== 0 || event.target.closest('.tag-pin')) return;
    panning = true;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startTranslateX = translateX;
    startTranslateY = translateY;
    stage.setPointerCapture?.(event.pointerId);
    viewport.classList.add('is-panning');
    event.preventDefault();
  });

  stage.addEventListener('pointermove', event => {
    if(!panning || event.pointerId !== activePointerId) return;
    translateX = startTranslateX + (event.clientX - startX);
    translateY = startTranslateY + (event.clientY - startY);
    clampTranslation();
    requestRender();
  });

  function endPan(event){
    if(!panning || (event && event.pointerId !== activePointerId)) return;
    if(event && stage.hasPointerCapture?.(event.pointerId)){
      stage.releasePointerCapture(event.pointerId);
    }
    panning = false;
    activePointerId = null;
    viewport.classList.remove('is-panning');
  }

  stage.addEventListener('pointerup', endPan);
  stage.addEventListener('pointercancel', endPan);
  stage.addEventListener('lostpointercapture', () => endPan());

  viewport.addEventListener('wheel', event => {
    if(event.target.closest('#mini-hud')) return;
    event.preventDefault();
    const pixels = event.deltaMode === 1
      ? event.deltaY * 16
      : (event.deltaMode === 2 ? event.deltaY * viewport.clientHeight : event.deltaY);
    const factor = clamp(Math.exp(-pixels * .0015), .78, 1.28);
    setScaleAround(factor, event.clientX, event.clientY);
  }, {passive: false});

  document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
    const center = viewportCenter();
    setScaleAround(1.25, center.x, center.y);
  });
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
    const center = viewportCenter();
    setScaleAround(1 / 1.25, center.x, center.y);
  });
  document.getElementById('btn-zoom-reset')?.addEventListener('click', resetToActualSize);
  document.getElementById('btn-zoom-fit')?.addEventListener('click', fitToViewport);

  img.addEventListener('load', fitToViewport);
  if(img.complete && img.naturalWidth) fitToViewport();

  const resizeObserver = 'ResizeObserver' in window
    ? new ResizeObserver(() => {
        const wasFitted = Math.abs(scale - fitScale) < .002;
        updateScaleLimits();
        if(wasFitted){
          fitToViewport();
        }else{
          scale = clamp(scale, fitScale, maxScale);
          clampTranslation();
          requestRender();
        }
      })
    : null;
  resizeObserver?.observe(viewport);

  return {fitToViewport};
}

async function loadData(){
  const [mapsText, mapsPlacesText, places, peopleText, peoplePlacesText] = await Promise.all([
    fetch(MAPS_CSV_URL, {cache: 'no-cache'}).then(response => response.text()),
    fetch(MAPS_PLACES_URL, {cache: 'no-cache'}).then(response => response.text()),
    fetch(PLACES_URL, {cache: 'no-cache'}).then(response => response.json()),
    fetch('data/people.csv', {cache: 'no-cache'}).then(response => response.text()).catch(() => ''),
    fetch('data/people_places.csv', {cache: 'no-cache'}).then(response => response.text()).catch(() => '')
  ]);

  return {
    maps: parseCSV(mapsText).data,
    mapsPlaces: parseCSV(mapsPlacesText).data,
    places,
    people: parseCSV(peopleText).data,
    peoplePlaces: parseCSV(peoplePlacesText).data
  };
}

function normalizeMapRow(row){
  const id = normId(row.id || row.fid);
  const sigla = (row.sigla || '').trim();
  return {
    id,
    fid: id,
    sigla,
    name: (row.name || sigla || `Mappa #${id}`).trim(),
    path: fullFromSigla(sigla),
    descrizione: (row.descrizione || '').trim(),
    cartiglio: (row.cartiglio || '').trim(),
    archivio: (row.archivio || '').trim(),
    year: (row.anno || row.year || '').trim(),
    georeferenced: (row.georeferenced || '').trim(),
    json: (row.json || '').trim()
  };
}


function hasTaggedData(value){
  const raw = String(value ?? '').trim();
  if(!raw || /^(null|none)$/i.test(raw) || raw === '[]' || raw === '{}') return false;
  return true;
}

function tagCountFromJson(value){
  if(!hasTaggedData(value)) return 0;
  try{
    const parsed = JSON.parse(value);
    if(Array.isArray(parsed)) return parsed.length;
    if(Array.isArray(parsed?.tags)) return parsed.tags.length;
    if(parsed && typeof parsed === 'object') return Object.keys(parsed).length;
  }catch(error){
    // Il requisito di appartenenza alla selezione è il campo json valorizzato;
    // un contenuto non parseabile resta quindi selezionabile, senza counter.
  }
  return null;
}

function naturalCompare(a, b){
  return String(a || '').localeCompare(String(b || ''), 'it', {
    numeric: true,
    sensitivity: 'base'
  });
}

function taggedDetailUrl(mapRecord){
  const params = new URLSearchParams({
    fid: mapRecord.fid || mapRecord.id || '',
    name: mapRecord.name || mapRecord.sigla || 'Mappa taggata',
    path: mapRecord.path || fullFromSigla(mapRecord.sigla)
  });
  return `static/html/tag_viewer/dettaglio.html?${params.toString()}`;
}

async function initTagSelector(){
  const selectorPage = document.getElementById('tag-selector-page');
  const detailApp = document.getElementById('detail-app');
  const select = document.getElementById('tag-map-select');
  const summary = document.getElementById('tag-selector-summary');
  const title = document.getElementById('tag-selector-map-title');
  const meta = document.getElementById('tag-selector-map-meta');
  const count = document.getElementById('tag-selector-count');
  const status = document.getElementById('tag-selector-status');
  const openLink = document.getElementById('tag-selector-open');

  document.body.classList.add('tag-selector-mode');
  document.title = 'Tag · Seleziona una mappa';
  if(detailApp) detailApp.hidden = true;
  if(selectorPage) selectorPage.hidden = false;

  try{
    const response = await fetch(MAPS_CSV_URL, {cache: 'no-cache'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = parseCSV(await response.text()).data
      .map(normalizeMapRow)
      .filter(map => hasTaggedData(map.json))
      .sort((a, b) => naturalCompare(a.archivio, b.archivio) || naturalCompare(a.sigla || a.name, b.sigla || b.name));

    select.innerHTML = '';
    if(!rows.length){
      select.innerHTML = '<option value="">Nessuna mappa taggata disponibile</option>';
      select.disabled = true;
      status.textContent = 'Nel dataset corrente non risultano mappe con il campo json valorizzato.';
      return;
    }

    const groups = new Map();
    rows.forEach(map => {
      const key = map.archivio || 'Altre raccolte';
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(map);
    });

    const initial = document.createElement('option');
    initial.value = '';
    initial.textContent = 'Seleziona una mappa…';
    select.appendChild(initial);

    groups.forEach((maps, archive) => {
      const group = document.createElement('optgroup');
      group.label = archive;
      maps.forEach(map => {
        const option = document.createElement('option');
        option.value = map.fid;
        option.textContent = map.name && map.name !== map.sigla
          ? `${map.sigla} — ${map.name}`
          : map.sigla || map.name || `Mappa #${map.fid}`;
        group.appendChild(option);
      });
      select.appendChild(group);
    });

    const byId = new Map(rows.map(map => [normId(map.fid), map]));
    status.textContent = `${rows.length} ${rows.length === 1 ? 'mappa annotata disponibile' : 'mappe annotate disponibili'}.`;

    function updateSelection(){
      const map = byId.get(normId(select.value));
      if(!map){
        summary.hidden = true;
        openLink.classList.add('is-disabled');
        openLink.setAttribute('aria-disabled', 'true');
        openLink.href = 'static/html/tag_viewer/dettaglio.html';
        return;
      }

      const tagCount = tagCountFromJson(map.json);
      title.textContent = map.name || map.sigla || `Mappa #${map.fid}`;
      meta.textContent = [map.sigla, map.year, map.archivio].filter(isNonEmpty).join(' · ') || 'Mappa annotata';
      count.textContent = tagCount == null
        ? 'Tag disponibili'
        : `${tagCount} ${tagCount === 1 ? 'tag' : 'tag'}`;
      summary.hidden = false;
      openLink.href = taggedDetailUrl(map);
      openLink.classList.remove('is-disabled');
      openLink.removeAttribute('aria-disabled');
    }

    select.addEventListener('change', updateSelection);
    select.addEventListener('keydown', event => {
      if(event.key === 'Enter' && select.value && !openLink.classList.contains('is-disabled')){
        event.preventDefault();
        window.location.href = openLink.href;
      }
    });
    updateSelection();
  }catch(error){
    console.error(error);
    select.innerHTML = '<option value="">Errore nel caricamento</option>';
    select.disabled = true;
    status.textContent = 'Non è stato possibile caricare l’elenco delle mappe taggate.';
  }
}

function tagsFromJsonOrPlaces(mapRecord, placeIds, featuresByFid, peopleByPlace){
  const parsed = parseMaybeJson(mapRecord.json);
  if(parsed.length){
    return parsed.map((record, index) => {
      const fid = normId(record.valore ?? record.id_place ?? record.fid ?? '');
      return {
        id: record.id ?? String(index + 1),
        nome: record.nome || featuresByFid.get(fid)?.properties?.name || fid,
        valore: fid,
        note: record.note || '',
        x: finiteCoord(record.x),
        y: finiteCoord(record.y),
        people: peopleByPlace.get(fid) || ''
      };
    });
  }

  return placeIds.map((fid, index) => {
    const feature = featuresByFid.get(String(fid));
    return {
      id: String(index + 1),
      nome: feature?.properties?.name || `Luogo ${fid}`,
      valore: String(fid),
      note: '',
      x: null,
      y: null,
      people: peopleByPlace.get(String(fid)) || ''
    };
  });
}

function buildPeopleIndex(people, peoplePlaces){
  const peopleById = new Map(people.map(person => [normId(person.id), person.name || '']));
  const result = new Map();

  peoplePlaces.forEach(record => {
    const personId = normId(record.id_people);
    const placeId = normId(record.id_place);
    if(!placeId || !personId) return;

    const name = peopleById.get(personId);
    if(!name) return;

    const previous = result.get(placeId);
    result.set(placeId, previous ? `${previous}, ${name}` : name);
  });

  return result;
}

function populateMapInformation(mapRecord){
  const mapMeta = document.getElementById('map-meta-grid');
  mapMeta.innerHTML = '';
  addDefinitionRow(mapMeta, 'Sigla', mapRecord.sigla);
  addDefinitionRow(mapMeta, 'Archivio', mapRecord.archivio);
  addDefinitionRow(mapMeta, 'Datazione', mapRecord.year);
  addDefinitionRow(
    mapMeta,
    'Georeferita',
    /^(true|1|si|sì|yes)$/i.test(mapRecord.georeferenced) ? 'Sì' : (isNonEmpty(mapRecord.georeferenced) ? mapRecord.georeferenced : '')
  );

  document.getElementById('map-description').textContent = mapRecord.descrizione || 'Nessuna descrizione disponibile.';
  document.getElementById('map-cartiglio').textContent = mapRecord.cartiglio || 'Nessun cartiglio disponibile.';
}

(async function init(){
  const isSelectorRequest = !QS.fid && !QS.path && !QS.name;
  if(isSelectorRequest){
    await initTagSelector();
    return;
  }

  document.body.classList.remove('tag-selector-mode');
  const selectorPage = document.getElementById('tag-selector-page');
  const detailApp = document.getElementById('detail-app');
  if(selectorPage) selectorPage.hidden = true;
  if(detailApp) detailApp.hidden = false;

  const imgEl = document.getElementById('raster-img');
  const pinLayer = document.getElementById('pin-layer');
  const gallery = document.getElementById('tag-list');

  setImageLoadingState('loading', 'Caricamento dei dati e preparazione della carta…');

  const {
    maps,
    mapsPlaces,
    places,
    people,
    peoplePlaces
  } = await loadData();

  const mapRecord = normalizeMapRow(
    maps.find(row => normId(row.id || row.fid) === normId(QS.fid)) || {
      id: QS.fid,
      name: QS.name,
      path: QS.path
    }
  );
  if(QS.path) mapRecord.path = QS.path;

  const mapTitleEl = document.getElementById('ds-title');
  const mapMetaEl = document.getElementById('ds-meta');
  if(mapTitleEl) mapTitleEl.textContent = QS.name || mapRecord.name || 'Mappa';
  if(mapMetaEl){
    mapMetaEl.textContent = [
      mapRecord.sigla,
      mapRecord.year,
      mapRecord.archivio
    ].filter(isNonEmpty).join(' · ');
  }
  populateMapInformation(mapRecord);

  document.getElementById('btn-back')?.addEventListener('click', () => {
    if(history.length > 1) history.back();
    else window.close();
  });

  document.getElementById('btn-open-file')?.addEventListener('click', () => {
    const url = imgUrl(mapRecord.path);
    if(url) window.open(url, '_blank');
  });

  let labelsOn = true;
  const labelsButton = document.getElementById('btn-toggle-labels');
  labelsButton?.setAttribute('aria-pressed', 'true');
  labelsButton?.classList.add('is-active');
  labelsButton?.addEventListener('click', event => {
    labelsOn = !labelsOn;
    document.body.classList.toggle('labels-off', !labelsOn);
    event.currentTarget.classList.toggle('is-active', labelsOn);
    event.currentTarget.setAttribute('aria-pressed', String(labelsOn));
    event.currentTarget.querySelector('span').textContent = labelsOn ? 'Etichette' : 'Punti';
  });

  const imageUrl = imgUrl(mapRecord.path);
  setImageLoadingState('loading', 'Apertura dell’immagine ad alta risoluzione…');

  const imageLoaded = new Promise((resolve, reject) => {
    imgEl.addEventListener('load', resolve, {once: true});
    imgEl.addEventListener(
      'error',
      () => reject(new Error(`Impossibile caricare immagine: ${imageUrl}`)),
      {once: true}
    );
  });
  imgEl.src = imageUrl;
  try{
    if(imgEl.decode){
      await imgEl.decode();
    }else{
      await imageLoaded;
    }
  }catch(error){
    // decode() può fallire in alcuni browser anche quando il normale evento load
    // arriva correttamente: verifichiamo prima di mostrare un errore definitivo.
    if(!imgEl.complete || !imgEl.naturalWidth){
      setImageLoadingState('error', 'Non è stato possibile aprire il file della mappa.');
      throw error;
    }
    console.warn(error);
  }

  const features = places?.features || [];
  const featuresByFid = indexByFid(features);
  const placeIds = mapsPlaces
    .filter(record => normId(record.id_map || record.fid_map) === normId(mapRecord.fid))
    .map(record => normId(record.id_place || record.fid_toponimo))
    .filter(Boolean);
  const peopleByPlace = buildPeopleIndex(people, peoplePlaces);
  const tags = tagsFromJsonOrPlaces(mapRecord, placeIds, featuresByFid, peopleByPlace);
  const matches = tags.map(tag => featuresByFid.get(normId(tag.valore)) || null);
  const featureByTagId = new Map(tags.map((tag, index) => [String(tag.id), matches[index]]));

  const panZoom = setupPanZoom();
  // Adatta subito l'immagine: la visualizzazione principale non deve dipendere
  // dal caricamento di Leaflet o dalla costruzione della mini-mappa.
  panZoom.fitToViewport();
  requestAnimationFrame(() => panZoom.fitToViewport());

  function selectTag(tag, scrollGallery = false){
    setActiveSelection(tag, scrollGallery);
    renderSelectedPlace(tag, featureByTagId.get(String(tag.id)), imgEl);
  }

  placePins(pinLayer, tags, selectTag, imgEl);

  gallery.innerHTML = '';
  if(tags.length){
    tags.forEach((tag, index) => {
      gallery.appendChild(createGalleryCard(tag, matches[index], imgEl, selectTag));
    });
    selectTag(tags[0], false);
  }else{
    gallery.innerHTML = '<div class="gallery-empty">Nessun luogo associato a questa mappa nel database corrente.</div>';
  }

  const miniMap = buildMiniMap('mini-map', tags, matches, features, selectTag);
  if(miniMap){
    requestAnimationFrame(() => {
      miniMap.map.invalidateSize();
      if(miniMap.presentGroup.getLayers().length){
        miniMap.map.fitBounds(miniMap.presentGroup.getBounds().pad(.24));
      }
    });
  }
  const toggleOthersButton = document.getElementById('mini-toggle-others');
  let othersOn = false;

  if(miniMap){
    toggleOthersButton?.addEventListener('click', () => {
      othersOn = !othersOn;
      if(othersOn){
        miniMap.othersGroup.addTo(miniMap.map);
      }else{
        miniMap.map.removeLayer(miniMap.othersGroup);
      }
      toggleOthersButton.classList.toggle('is-active', othersOn);
      toggleOthersButton.setAttribute('aria-pressed', String(othersOn));
      toggleOthersButton.title = othersOn ? 'Nascondi gli altri luoghi' : 'Mostra anche gli altri luoghi';
      toggleOthersButton.setAttribute('aria-label', toggleOthersButton.title);
    });
  }else if(toggleOthersButton){
    toggleOthersButton.hidden = true;
  }

  const miniCard = document.getElementById('mini-card');
  const miniOpen = document.getElementById('mini-open');
  const miniExpandButton = document.getElementById('mini-expand');
  const miniCloseButton = document.getElementById('mini-close');

  miniExpandButton?.addEventListener('click', () => {
    const expanded = miniCard.classList.toggle('expanded');
    miniExpandButton.innerHTML = expanded
      ? '<i class="bi bi-arrows-angle-contract" aria-hidden="true"></i>'
      : '<i class="bi bi-arrows-fullscreen" aria-hidden="true"></i>';
    miniExpandButton.title = expanded ? 'Riduci mini-mappa' : 'Espandi mini-mappa';
    miniExpandButton.setAttribute('aria-label', miniExpandButton.title);
    if(miniMap){
      setTimeout(() => {
        miniMap.map.invalidateSize();
        if(miniMap.presentGroup.getLayers().length){
          miniMap.map.fitBounds(miniMap.presentGroup.getBounds().pad(.22));
        }
      }, 220);
    }
  });

  miniCloseButton?.addEventListener('click', () => {
    miniCard.hidden = true;
    miniOpen.hidden = false;
  });

  miniOpen?.addEventListener('click', () => {
    miniCard.hidden = false;
    miniOpen.hidden = true;
    if(miniMap) setTimeout(() => miniMap.map.invalidateSize(), 60);
  });

  panZoom.fitToViewport();
  await afterTwoFrames();
  panZoom.fitToViewport();
  setImageLoadingState('hidden');
})().catch(error => {
  console.error(error);
  setImageLoadingState('error', error?.message || 'Errore durante l’apertura della carta storica.');
});
