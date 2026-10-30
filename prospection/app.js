(() => {
  'use strict';
  const D = window.AKA_DATA;
  const STATUS = Object.fromEntries(D.statuses.map(s => [s.id, s]));
  const ZONE = Object.fromEntries(D.zones.map(z => [z.id, z]));
  const OFFICE_SKIP = new Set(['government', 'ngo', 'religion', 'association', 'educational_institution', 'diplomatic', 'political_party', 'union', 'yes']);
  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const CELL = 0.02;            // la carte est découpée en cases de ~2 km, chargées à la demande
  const CELL_TTL = 30 * 864e5;  // une case est rechargée après 30 jours
  const AUTO_MIN_ZOOM = 13;

  // ---------- Stockage local ----------
  const LS = { places: 'aka.prosp.places.v1', crm: 'aka.prosp.crm.v1', tour: 'aka.prosp.tour.v1', zones: 'aka.prosp.zones.v1', prefs: 'aka.prosp.prefs.v1', cells: 'aka.prosp.cells.v1' };
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('⚠️ Impossible de sauvegarder (stockage du navigateur plein ou bloqué).'); } };

  let places = load(LS.places, {});   // id -> fiche commerce (OSM ou manuelle)
  let crm = load(LS.crm, {});         // id -> { status, notes, fav, date, contact, override, history, updated }
  let tour = load(LS.tour, []);       // ids ordonnés
  let loadedZones = load(LS.zones, {}); // zoneId -> { at, count }
  let prefs = load(LS.prefs, {});
  let cells = load(LS.cells, {});     // "i:j" -> date du dernier chargement
  let myPos = null;
  let selectedId = null;
  let addMode = false;

  const saveCrm = () => save(LS.crm, crm);
  const saveTour = () => save(LS.tour, tour);
  const savePlaces = () => save(LS.places, places);

  // ---------- Utilitaires ----------
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const humanize = v => { const s = String(v).replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };
  const fmtDate = ts => new Date(ts).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtKm = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
  function dist(a, b) {
    const R = 6371000, toR = x => x * Math.PI / 180;
    const dLat = toR(b[0] - a[0]), dLon = toR(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  let toastTimer;
  function toast(msg, ms = 2800) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
  }
  const safeUrl = u => { if (!u) return ''; const s = String(u).trim(); return /^https?:\/\//i.test(s) ? s : 'https://' + s; };

  // ---------- Modèle ----------
  const getCrm = id => crm[id] || { status: 'a_visiter' };
  const getPlace = id => { const p = places[id]; if (!p) return null; const o = crm[id]?.override; return o ? { ...p, ...o } : p; };
  function touch(id, patch) {
    const c = crm[id] = { status: 'a_visiter', ...crm[id], ...patch, updated: Date.now() };
    return c;
  }
  function setStatus(id, status) {
    const c = getCrm(id);
    if (c.status === status) return;
    const history = [...(c.history || []), { at: Date.now(), status }];
    touch(id, { status, history });
    saveCrm();
  }

  function score(p) {
    if (p.chain) return { value: -1, label: 'Chaîne', cls: 'low' };
    let v = D.groups[p.group]?.weight ?? 0;
    const reasons = [];
    if (!p.website) { v += 3; reasons.push(p.facebook ? 'Facebook seulement, pas de site web' : 'Aucun site web détecté'); }
    if (!p.facebook && !p.instagram) { v += 1; reasons.push('Aucun réseau social répertorié'); }
    if (!p.phone) reasons.push('Téléphone à trouver sur place');
    const label = v >= 5 ? '🔥 Chaud' : v >= 3 ? 'Bon potentiel' : 'À évaluer';
    return { value: v, label, cls: v >= 5 ? 'hot' : v >= 3 ? 'mid' : 'low', reasons };
  }

  function classify(t) {
    const C = D.categories;
    for (const key of ['amenity', 'healthcare', 'leisure', 'tourism', 'craft', 'office', 'shop']) {
      const v = t[key]; if (!v) continue;
      const hit = C[key]?.[v];
      if (hit) return { cat: hit[0], group: hit[1] };
      if (key === 'shop' && v !== 'vacant') return { cat: humanize(v), group: 'detail' };
      if (key === 'craft') return { cat: humanize(v), group: 'metiers' };
      if (key === 'healthcare') return { cat: humanize(v), group: 'sante' };
      if (key === 'office' && !OFFICE_SKIP.has(v)) return { cat: humanize(v), group: 'services' };
    }
    return null;
  }

  function nearestZone(lat, lon) {
    let best = D.zones[0], bd = Infinity;
    for (const z of D.zones) { const d = dist([lat, lon], z.center); if (d < bd) { bd = d; best = z; } }
    return best.id;
  }

  function fromOsm(el) {
    const t = el.tags || {};
    if (!t.name) return null;
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) return null;
    const c = classify(t); if (!c) return null;
    let website = t.website || t['contact:website'] || t.url || '';
    let facebook = t['contact:facebook'] || t.facebook || '';
    if (/facebook\.com|fb\.me/i.test(website)) { facebook = facebook || website; website = ''; }
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    // Un commerce dont la position tombe dans une autre zone (bbox qui se chevauchent) va à la zone la plus proche.
    const zoneId = nearestZone(lat, lon);
    return {
      id: `osm-${el.type[0]}${el.id}`, source: 'osm', name: t.name, cat: c.cat, group: c.group,
      lat, lon, zone: zoneId, street, city: t['addr:city'] || ZONE[zoneId].name,
      postcode: t['addr:postcode'] || '', phone: t.phone || t['contact:phone'] || '', website, facebook,
      instagram: t['contact:instagram'] || t.instagram || '', email: t.email || t['contact:email'] || '',
      hours: t.opening_hours || '', chain: !!(t.brand || t['brand:wikidata'])
    };
  }

  // ---------- OpenStreetMap / Overpass ----------
  function buildQuery(b) {
    const am = 'restaurant|cafe|bar|pub|fast_food|ice_cream|biergarten|dentist|clinic|doctors|pharmacy|veterinary|car_wash|car_rental|driving_school|childcare|kindergarten|cinema|theatre|nightclub|fuel|studio';
    const le = 'fitness_centre|sports_centre|dance|golf_course|escape_game|bowling_alley|marina|amusement_arcade|trampoline_park';
    const to = 'hotel|motel|guest_house|attraction|camp_site|winery';
    return `[out:json][timeout:120][bbox:${b.join(',')}];
(
  nwr["shop"]["name"];
  nwr["craft"]["name"];
  nwr["office"]["name"];
  nwr["healthcare"]["name"];
  nwr["amenity"~"^(${am})$"]["name"];
  nwr["leisure"~"^(${le})$"]["name"];
  nwr["tourism"~"^(${to})$"]["name"];
);
out center tags;`;
  }
  let epIndex = 0; // on commence par le dernier serveur qui a répondu
  async function overpass(q) {
    let last;
    for (let k = 0; k < ENDPOINTS.length; k++) {
      const i = (epIndex + k) % ENDPOINTS.length;
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 40000);
      try {
        const r = await fetch(ENDPOINTS[i], { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
        if (!r.ok) throw new Error(r.status === 429 ? 'serveur surchargé (429)' : r.status === 504 ? 'serveur trop lent (504)' : `HTTP ${r.status}`);
        const json = await r.json();
        epIndex = i;
        return json;
      } catch (e) {
        last = e.name === 'AbortError' ? new Error('délai dépassé') : e;
        console.warn('Overpass', ENDPOINTS[i], last.message);
      } finally { clearTimeout(timer); }
    }
    throw last || new Error('Aucun serveur disponible');
  }

  const cellKey = c => `${c[0]}:${c[1]}`;
  function cellsIn(b) {
    const out = [];
    for (let i = Math.floor(b[0] / CELL); i < Math.ceil(b[2] / CELL); i++)
      for (let j = Math.floor(b[1] / CELL); j < Math.ceil(b[3] / CELL); j++) out.push([i, j]);
    return out;
  }
  const isFresh = c => Date.now() - (cells[cellKey(c)] || 0) < CELL_TTL;

  // Charge des cases par blocs de 3×3 (≈6 km) : petites requêtes rapides plutôt qu'une énorme qui expire.
  async function fetchCells(list, onProgress) {
    const groups = new Map();
    for (const c of list) {
      const k = `${Math.floor(c[0] / 3)}:${Math.floor(c[1] / 3)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    let added = 0, done = 0, failed = 0, lastErr = null;
    for (const g of groups.values()) {
      const is = g.map(c => c[0]), js = g.map(c => c[1]);
      const bbox = [Math.min(...is) * CELL, Math.min(...js) * CELL, (Math.max(...is) + 1) * CELL, (Math.max(...js) + 1) * CELL];
      try {
        const json = await overpass(buildQuery(bbox));
        for (const el of json.elements || []) {
          const p = fromOsm(el); if (!p) continue;
          if (!places[p.id]) added++;
          places[p.id] = p;
        }
        const now = Date.now();
        g.forEach(c => (cells[cellKey(c)] = now));
      } catch (e) { failed++; lastErr = e; }
      done++;
      onProgress?.(done, groups.size, added);
    }
    savePlaces(); save(LS.cells, cells);
    return { added, failed, lastErr, total: groups.size };
  }

  const loading = new Map(); // zoneId -> texte de progression
  async function loadZone(zoneId, { force = false } = {}) {
    const z = ZONE[zoneId]; if (!z || loading.has(zoneId)) return;
    const list = cellsIn(z.bbox).filter(c => force || !isFresh(c));
    loading.set(zoneId, '…'); renderZones();
    try {
      const r = await fetchCells(list, (d, t) => { loading.set(zoneId, `${d}/${t}`); renderZones(); });
      if (r.failed < r.total || !r.total) loadedZones[zoneId] = { at: Date.now() };
      save(LS.zones, loadedZones);
      if (r.failed) toast(`⚠️ ${z.name} : ${r.failed} secteur(s) sur ${r.total} n'ont pas répondu (${r.lastErr?.message}). Réappuie sur « Charger » pour compléter.`, 6000);
      else toast(`✅ ${z.name} : ${r.added} nouveaux commerces`);
      refresh();
    } finally {
      loading.delete(zoneId); renderZones();
    }
  }

  // ---------- Chargement automatique de la vue (temps réel) ----------
  let autoBusy = false, autoAgain = false, autoTimer, statusTimer;
  function mapStatus(html, ms) {
    const el = $('#mapStatus');
    clearTimeout(statusTimer);
    if (!html) { el.hidden = true; return; }
    el.innerHTML = html; el.hidden = false;
    if (ms) statusTimer = setTimeout(() => (el.hidden = true), ms);
  }
  function viewBbox(pad = 0.15) {
    const b = map.getBounds().pad(pad);
    return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
  }
  async function autoLoad(force = false) {
    if (prefs.autoload === false && !force) return;
    if (map.getZoom() < AUTO_MIN_ZOOM) {
      if (prefs.autoload !== false) mapStatus('🔍 Zoome sur un secteur pour charger ses commerces');
      return;
    }
    if (autoBusy) { autoAgain = true; return; }
    const missing = cellsIn(viewBbox()).filter(c => force || !isFresh(c));
    if (!missing.length) { mapStatus(''); return; }
    autoBusy = true;
    mapStatus('<span class="spin dark"></span> Chargement des commerces du secteur…');
    try {
      const r = await fetchCells(missing, (d, t) => t > 1 && mapStatus(`<span class="spin dark"></span> Chargement des commerces… ${d}/${t}`));
      if (r.failed === r.total) mapStatus(`❌ Serveur OpenStreetMap indisponible (${esc(r.lastErr?.message)}). <button class="link" id="retryLoad">Réessayer</button>`);
      else mapStatus(r.added ? `✅ ${r.added} nouveaux commerces` : '✅ Secteur à jour', 2500);
      refresh();
    } finally {
      autoBusy = false;
      if (autoAgain) { autoAgain = false; autoLoad(); }
    }
  }

  // ---------- Carte ----------
  const map = L.map('map', { preferCanvas: true, zoomControl: true }).setView(prefs.view?.c || [45.33, -74.15], prefs.view?.z || 10);
  // Fonds de carte gratuits sans clé API. Les tuiles OSM exigent un référent HTTP(S) :
  // en ouverture directe du fichier (file://), on démarre sur Esri.
  const osmAttr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const esriAttr = 'Tuiles &copy; Esri';
  const baseLayers = {
    'Plan (OpenStreetMap)': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: osmAttr }),
    'Plan (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: esriAttr }),
    'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: esriAttr })
  };
  const defaultBase = location.protocol.startsWith('http') ? 'Plan (OpenStreetMap)' : 'Plan (Esri)';
  (baseLayers[prefs.base] || baseLayers[defaultBase]).addTo(map);
  map.on('baselayerchange', e => { prefs.base = e.name; save(LS.prefs, prefs); });
  const markersLayer = L.layerGroup().addTo(map);
  const tourLayer = L.layerGroup().addTo(map);
  const zonesLayer = L.layerGroup();
  let posMarker = null;
  const markers = new Map();

  D.zones.forEach(z => {
    L.rectangle([[z.bbox[0], z.bbox[1]], [z.bbox[2], z.bbox[3]]], { color: '#111', weight: 1, dashArray: '4 4', fill: false, interactive: false })
      .bindTooltip(z.name, { permanent: false }).addTo(zonesLayer);
  });
  L.control.layers(baseLayers, { 'Contours des zones': zonesLayer }, { position: 'topright' }).addTo(map);

  map.on('moveend', () => {
    prefs.view = { c: [map.getCenter().lat, map.getCenter().lng], z: map.getZoom() }; save(LS.prefs, prefs);
    if ($('#fInView').checked) renderList();
    clearTimeout(autoTimer); autoTimer = setTimeout(autoLoad, 500);
  });
  $('#mapStatus').addEventListener('click', e => { if (e.target.id === 'retryLoad') autoLoad(true); });
  map.on('click', e => {
    if (!addMode) return;
    setAddMode(false);
    openNewForm(e.latlng.lat, e.latlng.lng);
  });

  function renderMarkers(items) {
    markersLayer.clearLayers(); markers.clear();
    for (const p of items) {
      const c = getCrm(p.id), st = STATUS[c.status] || STATUS.a_visiter, sc = score(p);
      const m = L.circleMarker([p.lat, p.lon], {
        radius: p.id === selectedId ? 10 : (sc.cls === 'hot' ? 7 : 6),
        color: p.id === selectedId ? '#000' : (c.fav ? '#facc15' : '#fff'),
        weight: p.id === selectedId || c.fav ? 3 : 1.5,
        fillColor: st.color, fillOpacity: 0.9
      });
      m.bindTooltip(`<b>${esc(p.name)}</b><br>${esc(p.cat)} · ${esc(st.label)}`, { direction: 'top', offset: [0, -6] });
      m.on('click', ev => { L.DomEvent.stopPropagation(ev); select(p.id); });
      m.addTo(markersLayer); markers.set(p.id, m);
    }
  }

  function renderTourLayer() {
    tourLayer.clearLayers();
    const pts = tour.map(getPlace).filter(Boolean);
    if (pts.length > 1) L.polyline(pts.map(p => [p.lat, p.lon]), { color: '#111', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(tourLayer);
    pts.forEach((p, i) => {
      L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'tour-pin', html: `<span>${i + 1}</span>`, iconSize: [24, 24], iconAnchor: [12, 30] }), zIndexOffset: 1000 })
        .on('click', () => select(p.id)).addTo(tourLayer);
    });
  }

  // ---------- Filtres & liste ----------
  function initFilters() {
    $('#fZone').insertAdjacentHTML('beforeend', D.zones.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join(''));
    $('#fGroup').insertAdjacentHTML('beforeend', Object.entries(D.groups).map(([k, g]) => `<option value="${k}">${esc(g.label)}</option>`).join(''));
    $('#fStatus').insertAdjacentHTML('beforeend', D.statuses.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join(''));
    const f = prefs.filters || {};
    for (const [id, v] of Object.entries(f)) { const el = document.getElementById(id); if (!el) continue; el.type === 'checkbox' ? (el.checked = v) : (el.value = v); }
    ['fSearch', 'fZone', 'fGroup', 'fStatus', 'fSort', 'fNoSite', 'fNoChain', 'fInView', 'fFav'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener(el.type === 'search' ? 'input' : 'change', () => {
        prefs.filters = prefs.filters || {};
        prefs.filters[id] = el.type === 'checkbox' ? el.checked : el.value;
        if (id !== 'fSearch') save(LS.prefs, prefs);
        if (id === 'fSort' && el.value === 'distance' && !myPos) locate();
        refresh();
      });
    });
    $('#legend').innerHTML = D.statuses.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('');
  }

  function filtered({ ignoreView = false } = {}) {
    const q = norm($('#fSearch').value).trim();
    const zone = $('#fZone').value, group = $('#fGroup').value, status = $('#fStatus').value;
    const noSite = $('#fNoSite').checked, noChain = $('#fNoChain').checked, fav = $('#fFav').checked;
    const bounds = !ignoreView && $('#fInView').checked ? map.getBounds() : null;
    const out = [];
    for (const id in places) {
      const p = getPlace(id), c = getCrm(id);
      if (zone && p.zone !== zone) continue;
      if (group && p.group !== group) continue;
      if (status && c.status !== status) continue;
      if (noSite && p.website) continue;
      if (noChain && p.chain && !crm[id]) continue;
      if (fav && !c.fav) continue;
      if (bounds && !bounds.contains([p.lat, p.lon])) continue;
      if (q && !norm(`${p.name} ${p.cat} ${p.street} ${p.city} ${c.notes || ''} ${c.contact || ''}`).includes(q)) continue;
      out.push(p);
    }
    const sort = $('#fSort').value;
    const sc = new Map(out.map(p => [p.id, score(p).value]));
    if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    else if (sort === 'distance' && myPos) out.sort((a, b) => dist(myPos, [a.lat, a.lon]) - dist(myPos, [b.lat, b.lon]));
    else if (sort === 'updated') out.sort((a, b) => (crm[b.id]?.updated || 0) - (crm[a.id]?.updated || 0));
    else out.sort((a, b) => (sc.get(b.id) - sc.get(a.id)) || (+!!crm[b.id]?.fav - +!!crm[a.id]?.fav) || a.name.localeCompare(b.name, 'fr'));
    return out;
  }

  let listLimit = 150, lastList = [];
  function renderList() {
    const items = filtered();
    lastList = items;
    const total = Object.keys(places).length;
    $('#emptyList').hidden = total > 0;
    $('#resultCount').textContent = `${items.length} commerce${items.length > 1 ? 's' : ''}${total ? ` sur ${total}` : ''}`;
    $('#btnAddAllToTour').hidden = !items.length;
    const html = items.slice(0, listLimit).map(p => {
      const c = getCrm(p.id), st = STATUS[c.status] || STATUS.a_visiter, sc = score(p);
      const inTour = tour.includes(p.id);
      const d = myPos ? `<span class="dist">${fmtKm(dist(myPos, [p.lat, p.lon]))}</span>` : '';
      return `<li data-id="${p.id}" class="${p.id === selectedId ? 'sel' : ''}">
        <i class="dot" style="background:${st.color}"></i>
        <div class="li-main">
          <div class="li-title">${c.fav ? '★ ' : ''}${esc(p.name)}</div>
          <div class="li-sub">${esc(p.cat)} · ${esc(p.city)}${p.street ? ' · ' + esc(p.street) : ''}</div>
          <div class="li-tags"><span class="badge ${sc.cls}">${esc(sc.label)}</span>${!p.website ? '<span class="badge warn">Sans site</span>' : ''}<span class="badge st" style="--c:${st.color}">${esc(st.label)}</span>${c.date ? `<span class="badge">📅 ${esc(c.date)}</span>` : ''}${inTour ? '<span class="badge">🚗 Tournée</span>' : ''}</div>
        </div>${d}
      </li>`;
    }).join('');
    $('#list').innerHTML = html + (items.length > listLimit ? `<li class="more"><button class="btn ghost" id="btnMore">Afficher plus (${items.length - listLimit} restants)</button></li>` : '');
    renderMarkers(filtered({ ignoreView: true }));
  }
  $('#list').addEventListener('click', e => {
    if (e.target.id === 'btnMore') { listLimit += 150; renderList(); return; }
    const li = e.target.closest('li[data-id]'); if (li) select(li.dataset.id, { fly: true });
  });
  $('#btnAddAllToTour').addEventListener('click', () => {
    let n = 0;
    for (const p of lastList) { if (n >= 10) break; if (!tour.includes(p.id)) { tour.push(p.id); n++; if (getCrm(p.id).status === 'a_visiter') setStatus(p.id, 'planifie'); } }
    saveTour(); refresh(); toast(`🚗 ${n} arrêt(s) ajouté(s) à la tournée`);
  });

  function renderStats() {
    const counts = {};
    for (const id in places) { const s = getCrm(id).status; counts[s] = (counts[s] || 0) + 1; }
    $('#stats').innerHTML = D.statuses.filter(s => s.id !== 'a_visiter' || true).map(s =>
      `<button class="stat" data-status="${s.id}" title="Filtrer : ${esc(s.label)}"><i style="background:${s.color}"></i>${esc(s.label)} <b>${counts[s.id] || 0}</b></button>`).join('');
  }
  $('#stats').addEventListener('click', e => {
    const b = e.target.closest('[data-status]'); if (!b) return;
    const f = $('#fStatus'); f.value = f.value === b.dataset.status ? '' : b.dataset.status;
    f.dispatchEvent(new Event('change')); showTab('list');
  });

  // ---------- Fiche commerce ----------
  function select(id, { fly = false } = {}) {
    selectedId = id;
    const p = getPlace(id); if (!p) return;
    if (fly || window.innerWidth < 800) map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 16), { duration: 0.6 });
    renderDrawer(); renderList();
  }
  function closeDrawer() { selectedId = null; $('#drawer').hidden = true; renderList(); }
  $('#drawerClose').addEventListener('click', closeDrawer);

  function gmapsSearch(p) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.street || ''} ${p.city || ''}`)}`; }
  function gmapsDir(p) { return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`; }

  function renderDrawer() {
    const p = getPlace(selectedId);
    if (!p) { $('#drawer').hidden = true; return; }
    const c = getCrm(p.id), sc = score(p), inTour = tour.includes(p.id);
    const fb = p.facebook ? (/^https?:/i.test(p.facebook) ? p.facebook : `https://www.facebook.com/${p.facebook}`) : '';
    const ig = p.instagram ? (/^https?:/i.test(p.instagram) ? p.instagram : `https://www.instagram.com/${p.instagram.replace(/^@/, '')}`) : '';
    $('#drawerBody').innerHTML = `
      <div class="d-head">
        <div class="d-cat">${esc(p.cat)} · ${esc(D.groups[p.group]?.label || '')}</div>
        <h2>${esc(p.name)}</h2>
        <div class="d-addr">${esc([p.street, p.city, p.postcode].filter(Boolean).join(', ')) || '<span class="muted">Adresse non répertoriée</span>'}</div>
        <div class="li-tags"><span class="badge ${sc.cls}">${esc(sc.label)}</span>${p.chain ? '<span class="badge low">Chaîne / franchise</span>' : ''}${p.source === 'manuel' ? '<span class="badge">Ajout manuel</span>' : ''}</div>
      </div>
      <div class="d-actions">
        <a class="btn" href="${gmapsDir(p)}" target="_blank" rel="noopener">🧭 Itinéraire</a>
        <button class="btn ${inTour ? 'ghost' : ''}" data-act="tour">${inTour ? '✓ Dans la tournée' : '🚗 Ajouter à la tournée'}</button>
        <button class="btn ghost icon ${c.fav ? 'on' : ''}" data-act="fav" title="Prioritaire">${c.fav ? '★' : '☆'}</button>
      </div>

      <h3>Statut</h3>
      <div class="chips">${D.statuses.map(s => `<button class="chip ${c.status === s.id ? 'on' : ''}" style="--c:${s.color}" data-status="${s.id}">${esc(s.label)}</button>`).join('')}</div>

      ${sc.reasons?.length ? `<h3>Angles de pitch</h3><ul class="reasons">${sc.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}

      <h3>Coordonnées</h3>
      <dl class="contacts">
        <dt>Téléphone</dt><dd>${p.phone ? `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>` : '<span class="muted">—</span>'}</dd>
        <dt>Site web</dt><dd>${p.website ? `<a href="${esc(safeUrl(p.website))}" target="_blank" rel="noopener">${esc(p.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}</a>` : '<span class="muted">Aucun</span>'}</dd>
        <dt>Facebook</dt><dd>${fb ? `<a href="${esc(fb)}" target="_blank" rel="noopener">Voir la page</a>` : '<span class="muted">—</span>'}</dd>
        <dt>Instagram</dt><dd>${ig ? `<a href="${esc(ig)}" target="_blank" rel="noopener">Voir le profil</a>` : '<span class="muted">—</span>'}</dd>
        <dt>Courriel</dt><dd>${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '<span class="muted">—</span>'}</dd>
        ${p.hours ? `<dt>Heures</dt><dd class="small">${esc(p.hours)}</dd>` : ''}
      </dl>
      <div class="d-actions">
        <a class="btn ghost" href="${gmapsSearch(p)}" target="_blank" rel="noopener">Fiche Google</a>
        <a class="btn ghost" href="https://www.google.com/search?q=${encodeURIComponent(p.name + ' ' + (p.city || ''))}" target="_blank" rel="noopener">Recherche web</a>
        <button class="btn ghost" data-act="edit">✏️ Modifier</button>
      </div>

      <h3>Suivi</h3>
      <label class="field">Personne contact / décideur<input type="text" data-field="contact" value="${esc(c.contact || '')}" placeholder="Ex. Julie, propriétaire"></label>
      <label class="field">Date de visite / relance<input type="date" data-field="date" value="${esc(c.date || '')}"></label>
      <label class="field">Notes<textarea data-field="notes" rows="5" placeholder="Ce qui a été dit, besoins, budget, prochaine étape…">${esc(c.notes || '')}</textarea></label>

      ${c.history?.length ? `<h3>Historique</h3><ul class="history">${[...c.history].reverse().map(h => `<li><i class="dot" style="background:${STATUS[h.status]?.color}"></i>${esc(STATUS[h.status]?.label || h.status)} <span class="muted">· ${fmtDate(h.at)}</span></li>`).join('')}</ul>` : ''}
      ${p.source === 'manuel' ? '<div class="d-actions"><button class="btn danger ghost" data-act="delete">Supprimer ce commerce</button></div>' : ''}
      <p class="muted small">Source : ${p.source === 'osm' ? 'OpenStreetMap' : 'ajout manuel'}${c.updated ? ' · modifié le ' + fmtDate(c.updated) : ''}</p>
    `;
    $('#drawer').hidden = false;
  }

  $('#drawerBody').addEventListener('click', e => {
    const id = selectedId; if (!id) return;
    const st = e.target.closest('[data-status]');
    if (st) { setStatus(id, st.dataset.status); if (st.dataset.status === 'planifie' && !tour.includes(id)) { tour.push(id); saveTour(); } refresh(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'tour') { toggleTour(id); }
    else if (act === 'fav') { touch(id, { fav: !getCrm(id).fav }); saveCrm(); refresh(); }
    else if (act === 'edit') { openEditForm(id); }
    else if (act === 'delete') {
      if (!confirm('Supprimer ce commerce et ses notes ?')) return;
      delete places[id]; delete crm[id]; tour = tour.filter(t => t !== id);
      savePlaces(); saveCrm(); saveTour(); closeDrawer(); refresh();
    }
  });
  $('#drawerBody').addEventListener('input', e => {
    const f = e.target.dataset.field; if (!f || !selectedId) return;
    touch(selectedId, { [f]: e.target.value }); saveCrm();
  });
  $('#drawerBody').addEventListener('change', e => { if (e.target.dataset.field) renderList(); });

  // ---------- Ajout / édition ----------
  function setAddMode(on) {
    addMode = on; $('#addHint').hidden = !on;
    document.body.classList.toggle('adding', on);
    if (on) { showView('map'); toast('Touche la carte à l\'emplacement du commerce'); }
  }
  $('#btnAdd').addEventListener('click', () => setAddMode(!addMode));
  $('#cancelAdd').addEventListener('click', () => setAddMode(false));

  function formHtml(p, title) {
    const groups = Object.entries(D.groups).map(([k, g]) => `<option value="${k}" ${p.group === k ? 'selected' : ''}>${esc(g.label)}</option>`).join('');
    return `<form class="edit-form" id="editForm">
      <h2>${esc(title)}</h2>
      <label class="field">Nom *<input name="name" required value="${esc(p.name || '')}"></label>
      <label class="field">Type de commerce<input name="cat" value="${esc(p.cat || '')}" placeholder="Ex. Salon de coiffure"></label>
      <label class="field">Secteur<select name="group">${groups}</select></label>
      <label class="field">Adresse<input name="street" value="${esc(p.street || '')}" placeholder="123 boul. de la Gare"></label>
      <label class="field">Ville<input name="city" value="${esc(p.city || '')}"></label>
      <label class="field">Téléphone<input name="phone" type="tel" value="${esc(p.phone || '')}"></label>
      <label class="field">Site web<input name="website" value="${esc(p.website || '')}"></label>
      <label class="field">Facebook<input name="facebook" value="${esc(p.facebook || '')}"></label>
      <label class="field">Instagram<input name="instagram" value="${esc(p.instagram || '')}"></label>
      <label class="field">Courriel<input name="email" type="email" value="${esc(p.email || '')}"></label>
      <label class="check"><input type="checkbox" name="chain" ${p.chain ? 'checked' : ''}> Chaîne / franchise</label>
      <div class="d-actions"><button class="btn" type="submit">Enregistrer</button><button class="btn ghost" type="button" id="cancelForm">Annuler</button></div>
    </form>`;
  }
  function readForm(form) {
    const fd = new FormData(form), o = {};
    for (const k of ['name', 'cat', 'group', 'street', 'city', 'phone', 'website', 'facebook', 'instagram', 'email']) o[k] = String(fd.get(k) || '').trim();
    o.chain = fd.get('chain') === 'on';
    if (!o.cat) o.cat = D.groups[o.group]?.label || 'Commerce';
    return o;
  }
  function openNewForm(lat, lon) {
    const zone = nearestZone(lat, lon);
    selectedId = null;
    $('#drawerBody').innerHTML = formHtml({ group: 'detail', city: ZONE[zone].name }, 'Nouveau commerce');
    $('#drawer').hidden = false;
    const tmp = L.circleMarker([lat, lon], { radius: 9, color: '#000', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(map);
    const form = $('#editForm');
    form.querySelector('[name=name]').focus();
    $('#cancelForm').onclick = () => { map.removeLayer(tmp); $('#drawer').hidden = true; };
    form.onsubmit = ev => {
      ev.preventDefault(); map.removeLayer(tmp);
      const o = readForm(form);
      const id = 'man-' + Date.now().toString(36);
      places[id] = { id, source: 'manuel', lat, lon, zone, postcode: '', hours: '', ...o };
      touch(id, { status: 'a_visiter', history: [{ at: Date.now(), status: 'a_visiter' }] });
      savePlaces(); saveCrm(); select(id); refresh(); toast('✅ Commerce ajouté');
    };
  }
  function openEditForm(id) {
    const p = getPlace(id);
    $('#drawerBody').innerHTML = formHtml(p, 'Modifier la fiche');
    const form = $('#editForm');
    $('#cancelForm').onclick = () => renderDrawer();
    form.onsubmit = ev => {
      ev.preventDefault();
      const o = readForm(form);
      if (places[id].source === 'manuel') { Object.assign(places[id], o); savePlaces(); }
      else touch(id, { override: o }); // les corrections survivent à une actualisation OSM
      saveCrm(); renderDrawer(); refresh(); toast('✅ Fiche mise à jour');
    };
  }

  // ---------- Tournée ----------
  function toggleTour(id) {
    const i = tour.indexOf(id);
    if (i >= 0) tour.splice(i, 1);
    else { tour.push(id); if (getCrm(id).status === 'a_visiter') setStatus(id, 'planifie'); }
    saveTour(); refresh();
  }
  function routeLength(ids, start) {
    let d = 0, prev = start;
    for (const id of ids) { const p = getPlace(id); if (!p) continue; const pt = [p.lat, p.lon]; if (prev) d += dist(prev, pt); prev = pt; }
    return d;
  }
  function optimize() {
    const pts = tour.filter(id => getPlace(id));
    if (pts.length < 3 && !myPos) return toast('Ajoute au moins 3 arrêts pour optimiser');
    const pos = id => { const p = getPlace(id); return [p.lat, p.lon]; };
    // Plus proche voisin depuis ma position (ou le 1er arrêt), puis amélioration 2-opt.
    const rest = [...pts], route = [];
    let cur = myPos || pos(rest.shift());
    if (!myPos) route.push(pts[0]);
    while (rest.length) {
      let bi = 0, bd = Infinity;
      rest.forEach((id, i) => { const d = dist(cur, pos(id)); if (d < bd) { bd = d; bi = i; } });
      const [id] = rest.splice(bi, 1); route.push(id); cur = pos(id);
    }
    let improved = true, guard = 0;
    while (improved && guard++ < 200) {
      improved = false;
      for (let i = 0; i < route.length - 1; i++) for (let k = i + 1; k < route.length; k++) {
        const cand = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        if (routeLength(cand, myPos) + 1 < routeLength(route, myPos)) { route.splice(0, route.length, ...cand); improved = true; }
      }
    }
    tour = route; saveTour(); refresh();
    toast(`⚡ Ordre optimisé${myPos ? ' depuis ta position' : ''}`);
  }
  function renderTour() {
    tour = tour.filter(id => places[id]);
    $('#tourCount').textContent = tour.length;
    $('#emptyTour').hidden = tour.length > 0;
    $('#tour').innerHTML = tour.map((id, i) => {
      const p = getPlace(id), c = getCrm(id), st = STATUS[c.status] || STATUS.a_visiter;
      return `<li data-id="${id}">
        <span class="num">${i + 1}</span>
        <div class="li-main"><div class="li-title">${esc(p.name)}</div><div class="li-sub"><i class="dot sm" style="background:${st.color}"></i>${esc(st.label)} · ${esc(p.cat)} · ${esc(p.city)}</div></div>
        <div class="t-btns">
          <button data-t="done" title="Marquer visité">✓</button>
          <button data-t="up" title="Monter" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button data-t="down" title="Descendre" ${i === tour.length - 1 ? 'disabled' : ''}>↓</button>
          <button data-t="rm" title="Retirer">✕</button>
        </div></li>`;
    }).join('');
    const len = routeLength(tour, myPos);
    $('#tourInfo').textContent = tour.length ? `${tour.length} arrêt(s) · environ ${fmtKm(len * 1.3)} de route${myPos ? ' depuis ta position' : ''} · ~${Math.round(tour.length * 15 + len * 1.3 / 1000 * 1.2)} min (15 min/visite)` : '';
    // Google Maps accepte ~9 étapes intermédiaires : on découpe en segments.
    const links = [], CH = 9;
    const coords = tour.map(id => { const p = getPlace(id); return `${p.lat},${p.lon}`; });
    for (let i = 0; i < coords.length; i += CH + 1) {
      const seg = coords.slice(i, i + CH + 1);
      const origin = i === 0 ? (myPos ? `${myPos[0]},${myPos[1]}` : '') : coords[i - 1];
      const dest = seg[seg.length - 1], way = seg.slice(0, -1);
      const url = `https://www.google.com/maps/dir/?api=1${origin ? '&origin=' + origin : ''}&destination=${dest}${way.length ? '&waypoints=' + encodeURIComponent(way.join('|')) : ''}&travelmode=driving`;
      links.push(`<a class="btn" href="${url}" target="_blank" rel="noopener">🧭 Google Maps · arrêts ${i + 1}–${i + seg.length}</a>`);
    }
    $('#tourLinks').innerHTML = links.join('');
    renderTourLayer();
  }
  $('#tour').addEventListener('click', e => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    const id = li.dataset.id, i = tour.indexOf(id), t = e.target.closest('[data-t]')?.dataset.t;
    if (t === 'rm') tour.splice(i, 1);
    else if (t === 'up' && i > 0) [tour[i - 1], tour[i]] = [tour[i], tour[i - 1]];
    else if (t === 'down' && i < tour.length - 1) [tour[i + 1], tour[i]] = [tour[i], tour[i + 1]];
    else if (t === 'done') { setStatus(id, 'visite'); toast('✓ Marqué comme visité'); }
    else { select(id, { fly: true }); return; }
    saveTour(); refresh();
  });
  $('#btnOptimize').addEventListener('click', optimize);
  $('#btnClearTour').addEventListener('click', () => { if (tour.length && confirm('Vider la tournée ?')) { tour = []; saveTour(); refresh(); } });

  // ---------- Zones ----------
  function renderZones() {
    const counts = {};
    for (const id in places) { const z = places[id].zone; counts[z] = (counts[z] || 0) + 1; }
    $('#zones').innerHTML = D.zones.map(z => {
      const lz = loadedZones[z.id], busy = loading.get(z.id);
      return `<li>
        <div class="li-main"><div class="li-title">${esc(z.name)}</div><div class="li-sub">${esc(z.sub)}</div>
        <div class="li-sub">${counts[z.id] ? `✅ ${counts[z.id]} commerces` : 'Pas encore chargé'}${lz ? ` · maj ${fmtDate(lz.at)}` : ''}</div></div>
        <div class="z-btns">
          <button class="btn ghost sm" data-z="view" data-id="${z.id}">Voir</button>
          <button class="btn sm" data-z="load" data-id="${z.id}" ${busy ? 'disabled' : ''}>${busy ? `<span class="spin"></span> ${busy}` : lz ? 'Actualiser' : 'Charger'}</button>
        </div></li>`;
    }).join('');
  }
  $('#zones').addEventListener('click', e => {
    const b = e.target.closest('[data-z]'); if (!b) return;
    const z = ZONE[b.dataset.id];
    if (b.dataset.z === 'view') { map.fitBounds([[z.bbox[0], z.bbox[1]], [z.bbox[2], z.bbox[3]]]); $('#fZone').value = z.id; $('#fZone').dispatchEvent(new Event('change')); showView('map'); }
    else loadZone(z.id, { force: !!loadedZones[z.id] });
  });
  $('#fAuto').checked = prefs.autoload !== false;
  $('#fAuto').addEventListener('change', e => { prefs.autoload = e.target.checked; save(LS.prefs, prefs); if (e.target.checked) autoLoad(); else mapStatus(''); });
  $('#btnLoadAll').addEventListener('click', async () => {
    for (const z of D.zones) await loadZone(z.id); // séquentiel pour ménager le serveur gratuit
  });

  // ---------- Géolocalisation ----------
  function locate() {
    if (!navigator.geolocation) return toast('Géolocalisation non disponible');
    toast('📍 Recherche de ta position…');
    navigator.geolocation.getCurrentPosition(pos => {
      myPos = [pos.coords.latitude, pos.coords.longitude];
      if (posMarker) map.removeLayer(posMarker);
      posMarker = L.circleMarker(myPos, { radius: 8, color: '#fff', weight: 3, fillColor: '#0ea5e9', fillOpacity: 1 }).bindTooltip('Ma position').addTo(map);
      map.flyTo(myPos, Math.max(map.getZoom(), 15));
      refresh();
    }, err => toast('Position refusée ou indisponible (' + err.message + ')', 4000), { enableHighAccuracy: true, timeout: 10000 });
  }
  $('#btnLocate').addEventListener('click', locate);

  // ---------- Import / export ----------
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  $('#btnMenu').addEventListener('click', e => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; });
  document.addEventListener('click', () => ($('#menu').hidden = true));
  $('#menu').addEventListener('click', e => {
    const act = e.target.dataset.act; if (!act) return;
    if (act === 'export-json') {
      download(`aka-prospection-${stamp()}.json`, JSON.stringify({ version: 1, exported: Date.now(), places, crm, tour, loadedZones }, null, 1), 'application/json');
    } else if (act === 'import-json') {
      $('#fileImport').click();
    } else if (act === 'export-csv') {
      const cols = ['Nom', 'Type', 'Secteur', 'Adresse', 'Ville', 'Téléphone', 'Site web', 'Facebook', 'Courriel', 'Statut', 'Prioritaire', 'Contact', 'Date', 'Notes', 'Potentiel', 'Latitude', 'Longitude'];
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = filtered({ ignoreView: true }).map(p => {
        const c = getCrm(p.id);
        return [p.name, p.cat, D.groups[p.group]?.label, p.street, p.city, p.phone, p.website, p.facebook, p.email, STATUS[c.status]?.label, c.fav ? 'oui' : '', c.contact, c.date, c.notes, score(p).label, p.lat, p.lon].map(q).join(';');
      });
      download(`aka-prospection-${stamp()}.csv`, '﻿' + [cols.map(q).join(';'), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
      toast(`📄 ${rows.length} lignes exportées (selon les filtres actuels)`);
    } else if (act === 'reset') {
      if (!confirm('Effacer TOUTES les données (commerces, notes, statuts, tournée) ? Pense à sauvegarder avant.')) return;
      Object.values(LS).forEach(k => localStorage.removeItem(k));
      location.reload();
    }
  });
  $('#fileImport').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.places || !data.crm) throw new Error('format inconnu');
      places = { ...places, ...data.places }; crm = { ...crm, ...data.crm };
      tour = data.tour || tour; loadedZones = { ...loadedZones, ...(data.loadedZones || {}) };
      savePlaces(); saveCrm(); saveTour(); save(LS.zones, loadedZones);
      refresh(); toast(`✅ Sauvegarde restaurée (${Object.keys(data.places).length} commerces)`);
    } catch (err) { toast('❌ Fichier invalide : ' + err.message, 4000); }
    e.target.value = '';
  });

  // ---------- Navigation (onglets / mobile) ----------
  function showTab(tab) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    ['list', 'tour', 'zones'].forEach(t => ($('#panel-' + t).hidden = t !== tab));
    prefs.tab = tab; save(LS.prefs, prefs);
  }
  function showView(view) {
    $('.layout').dataset.view = view;
    document.querySelectorAll('#bottomNav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    if (view !== 'map') showTab(view);
    setTimeout(() => map.invalidateSize(), 50);
  }
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  $('#bottomNav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) showView(b.dataset.view); });
  document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) { showTab(g.dataset.goto); showView(g.dataset.goto); } });
  window.addEventListener('resize', () => map.invalidateSize());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (addMode) setAddMode(false); else if (!$('#drawer').hidden) closeDrawer(); } });

  function refresh() { renderStats(); renderList(); renderTour(); renderZones(); if (selectedId) renderDrawer(); }

  initFilters();
  showTab(prefs.tab || (Object.keys(places).length ? 'list' : 'zones'));
  refresh();
  if (!Object.keys(places).length) toast('👋 Zoome sur une ville (ou appuie sur 📍) : les commerces se chargent tout seuls', 5000);
  autoLoad();
})();
