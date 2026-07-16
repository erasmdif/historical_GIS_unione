(function(){
  const MAPS_CSV_URL = 'data/maps.csv';
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
    const headers = rows[0].map(h => (h || '').trim().replace(/^\uFEFF/, ''));
    const data = rows.slice(1).filter(r => r.length && r.some(c => (c ?? '').toString().trim() !== '')).map(r => {
      const o = {};
      headers.forEach((h, idx) => o[h] = (r[idx] ?? '').toString());
      return o;
    });
    return { headers, data };
  }
  function truthy(v){ return v === true || v === 1 || v === '1' || (typeof v === 'string' && ['true','1','yes','si','sì'].includes(v.trim().toLowerCase())); }
  function normalizeArchiveKey(key){ return (key || '').toString().trim() || 'altro'; }
  function slugify(v){ return (v || '').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); }
  function slugFromArchive(key){ return slugify(normalizeArchiveKey(key)); }
  function labelFromArchive(key){ return normalizeArchiveKey(key).replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()); }
  function sigla(rec){ return (rec.sigla || rec.code || rec.fid || '').toString().trim(); }
  function resolveImage(rel){ if(!rel) return ''; const p = rel.startsWith('/') ? rel.slice(1) : rel; return p.startsWith('images/') ? p : ('images/' + p); }
  function previewFromSigla(s){ return s ? `images/maps/preview/${s}.webp` : ''; }
  function fullFromSigla(s){ return s ? `images/maps/full_width/${s}.jpg` : ''; }
  function geoFromSigla(s){ return s ? `images/maps/georeferenced/${s}.tif` : ''; }
  function resolvePreviewPath(rec){ return rec.preview ? resolveImage(rec.preview) : previewFromSigla(sigla(rec)); }
  function resolveFullImagePath(rec){ return rec.allegato ? resolveImage(rec.allegato) : fullFromSigla(sigla(rec)); }
  function resolveGeoUrl(rec){ return truthy(rec.georeferenced) ? (rec.georeferenced_map ? resolveImage(rec.georeferenced_map) : geoFromSigla(sigla(rec))) : ''; }
  function hasGeo(rec){ return truthy(rec.georeferenced); }
  function hasTagged(rec){ return truthy(rec.tagged) || !!String(rec.json || '').trim(); }
  function detailUrl(rec){ const p = new URLSearchParams({ fid: rec.fid || '', name: rec.name || sigla(rec) || '', path: rec.allegato || fullFromSigla(sigla(rec)) }); return 'static/html/tag_viewer/dettaglio.html?' + p.toString(); }
  function webgisUrl(rec){ const p = new URLSearchParams({ overlay: rec.fid || '' }); return 'static/html/webgis/webgis.html?' + p.toString(); }
  function naturalKey(v){ return (v || '').toString().match(/\d+|\D+/g) || []; }
  function naturalCompare(a,b){ const aa = naturalKey(a), bb = naturalKey(b); const n = Math.max(aa.length, bb.length); for(let i=0;i<n;i++){ if(aa[i]==null) return -1; if(bb[i]==null) return 1; const an=Number(aa[i]), bn=Number(bb[i]); const aNum=Number.isFinite(an), bNum=Number.isFinite(bn); if(aNum && bNum && an!==bn) return an-bn; const c=String(aa[i]).localeCompare(String(bb[i]), 'it', {sensitivity:'base'}); if(c) return c; } return 0; }
  function normalizeMapRow(r){
    const id = (r.id || r.fid || '').trim();
    const s = (r.sigla || r.code || '').trim();
    return {
      fid: id,
      id,
      sigla: s,
      name: (r.name || s || (id ? `Mappa #${id}` : '')).trim(),
      archivio: normalizeArchiveKey(r.archivio || r.categoria || ''),
      allegato: (r.allegato || r.path || r.c || fullFromSigla(s)).trim(),
      preview: (r.preview || '').trim(),
      georeferenced: (r.georeferenced || '').trim(),
      tagged: (r.tagged || '').trim(),
      georeferenced_map: (r.georeferenced_map || '').trim(),
      data: (r.data || '').trim(),
      json: (r.json || '').trim(),
      info: (r.descrizione || r.info || r.cartiglio || '').trim(),
      descrizione: (r.descrizione || '').trim(),
      cartiglio: (r.cartiglio || '').trim(),
      year: (r.anno || r.year || '').trim()
    };
  }
  async function loadMaps(){
    const text = await fetch(MAPS_CSV_URL, { cache:'no-cache' }).then(r => r.text());
    const csv = parseCSV(text);
    const data = csv.data.map(normalizeMapRow).filter(r => r.fid);
    data.sort((a,b) => { const ac=labelFromArchive(a.archivio).localeCompare(labelFromArchive(b.archivio), 'it'); return ac || naturalCompare(a.sigla || a.name || a.fid, b.sigla || b.name || b.fid); });
    return data;
  }
  function groupByArchive(rows){ const m=new Map(); rows.forEach(rec => { const k=normalizeArchiveKey(rec.archivio || 'altro'); if(!m.has(k)) m.set(k, []); m.get(k).push(rec); }); return m; }
  window.MapsDataUtils = { MAPS_CSV_URL, parseCSV, truthy, normalizeArchiveKey, slugFromArchive, labelFromArchive, resolveImage, resolvePreviewPath, resolveFullImagePath, resolveGeoUrl, hasGeo, hasTagged, detailUrl, webgisUrl, loadMaps, groupByArchive, naturalCompare, normalizeMapRow, previewFromSigla, fullFromSigla, geoFromSigla };
})();
