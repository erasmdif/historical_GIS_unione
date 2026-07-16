(function(){
  'use strict';

  const q = (selector, root=document) => root.querySelector(selector);
  const qa = (selector, root=document) => [...root.querySelectorAll(selector)];

  /* Reveal */
  const revealItems = qa('.reveal');
  revealItems.forEach(el => {
    el.style.transitionDelay = `${Number(el.dataset.delay || 0)}ms`;
  });
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    }, {threshold: 0.12});
    revealItems.forEach(el => revealObserver.observe(el));
  } else {
    revealItems.forEach(el => el.classList.add('is-in'));
  }

  /* Mobile vertical rail */
  const railToggle = q('#rail-toggle');
  const railScrim = q('#rail-scrim');
  function setRail(open){
    document.body.classList.toggle('rail-open', open);
    if (railToggle) railToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (railScrim) railScrim.hidden = !open;
  }
  railToggle?.addEventListener('click', () => setRail(!document.body.classList.contains('rail-open')));
  railScrim?.addEventListener('click', () => setRail(false));
  qa('.home-rail a').forEach(link => link.addEventListener('click', () => setRail(false)));

  /*
   * Fragment links must be handled explicitly because the page uses a <base>
   * element. Without this guard, href="#progetto" is resolved against the
   * base URL and may reload the homepage at its initial position.
   */
  qa('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      const target = q(hash);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });

      if (history.replaceState) history.replaceState(null, '', hash);
      else window.location.hash = hash;

      if (target.classList.contains('home-section')) activateSection(target);
      setRail(false);
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setRail(false);
  });

  /* Scrollspy and contextual rail colour */
  const sections = qa('.home-section[id]');
  const railLinks = qa('[data-section-link]');
  function activateSection(section){
    const id = section.id;
    railLinks.forEach(link => link.classList.toggle('is-active', link.dataset.sectionLink === id));
    document.body.dataset.railTheme = section.dataset.theme || 'hero';
  }
  if ('IntersectionObserver' in window) {
    const spyObserver = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) activateSection(visible.target);
    }, {rootMargin:'-18% 0px -52% 0px', threshold:[0.05,0.2,0.45]});
    sections.forEach(section => spyObserver.observe(section));
  }

  /* Robust CSV reader for the small public datasets */
  function parseCSV(text){
    const rows=[];
    let row=[], field='', quoted=false;
    for(let i=0;i<text.length;i++){
      const char=text[i];
      if(quoted){
        if(char==='"'){
          if(text[i+1]==='"'){ field+='"'; i++; }
          else quoted=false;
        } else field+=char;
      } else if(char==='"') quoted=true;
      else if(char===','){ row.push(field); field=''; }
      else if(char==='\n' || char==='\r'){
        if(char==='\r' && text[i+1]==='\n') i++;
        if(field!=='' || row.length){ row.push(field); rows.push(row); row=[]; field=''; }
      } else field+=char;
    }
    if(field!=='' || row.length){ row.push(field); rows.push(row); }
    if(!rows.length) return [];
    const headers=rows.shift().map(value => String(value || '').replace(/^\uFEFF/,'').trim());
    return rows.filter(r => r.some(value => String(value || '').trim())).map(r => {
      const record={};
      headers.forEach((header,index) => record[header]=String(r[index] ?? '').trim());
      return record;
    });
  }
  const normalize = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const isTrue = value => ['true','1','si','sì','yes'].includes(normalize(value));
  const isFilled = value => {
    const v=normalize(value);
    return Boolean(v && v!=='null' && v!=='none' && v!=='[]' && v!=='{}');
  };

  function animateNumber(el, target){
    const safeTarget = Number.isFinite(Number(target)) ? Number(target) : 0;
    const from = Number(el.textContent.replace(/\D/g,'')) || 0;
    const started = performance.now();
    const duration = 850;
    el.dataset.count = String(safeTarget);
    function frame(now){
      const progress=Math.min(1,(now-started)/duration);
      const eased=1-Math.pow(1-progress,3);
      el.textContent=Math.round(from+(safeTarget-from)*eased).toLocaleString('it-IT');
      if(progress<1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function setStat(name,value){
    const el=q(`[data-stat="${name}"]`);
    if(el) animateNumber(el,value);
  }

  async function loadHomepageData(){
    try{
      const [mapsResponse,placesResponse,peopleResponse]=await Promise.all([
        fetch('data/maps.csv',{cache:'no-cache'}),
        fetch('data/places.geojson',{cache:'no-cache'}),
        fetch('data/people.csv',{cache:'no-cache'})
      ]);
      if(!mapsResponse.ok || !placesResponse.ok || !peopleResponse.ok) throw new Error('Dataset homepage non disponibile');
      const [mapsText,places,peopleText]=await Promise.all([mapsResponse.text(),placesResponse.json(),peopleResponse.text()]);
      const maps=parseCSV(mapsText);
      const people=parseCSV(peopleText);
      const features=Array.isArray(places?.features) ? places.features : [];
      const families=people.filter(person => normalize(person.tipo_soggetto || person.type || person.tipologia).includes('famigl'));
      const archives=new Set(maps.map(map => normalize(map.archivio)).filter(Boolean));
      setStat('maps',maps.length);
      setStat('places',features.length);
      setStat('families',families.length);
      setStat('archives',archives.size);
      const taggedLink=q('#feature-tagged-link');
      if(taggedLink) taggedLink.href='static/html/tag_viewer/dettaglio.html';
    } catch(error){
      console.warn('[homepage]',error);
      setStat('maps',0); setStat('places',0); setStat('families',0); setStat('archives',0);
    }
  }
  loadHomepageData();

  /* Three-at-a-time feature carousel */
  const track=q('#features-track');
  const viewport=track?.parentElement;
  const previous=q('#features-prev');
  const next=q('#features-next');
  const dots=q('#features-dots');
  let activePage=0;
  let pageCount=1;
  let scrollTimer=0;

  function visibleCards(){
    if(window.innerWidth<=860) return 1;
    if(window.innerWidth<=1180) return 2;
    return 3;
  }
  function recalcCarousel(){
    if(!track || !viewport) return;
    const cardCount=track.children.length;
    pageCount=Math.max(1,Math.ceil(cardCount/visibleCards()));
    activePage=Math.min(activePage,pageCount-1);
    if(dots){
      dots.innerHTML='';
      for(let index=0;index<pageCount;index++){
        const button=document.createElement('button');
        button.type='button';
        button.setAttribute('aria-label',`Vai al gruppo ${index+1}`);
        button.classList.toggle('is-active',index===activePage);
        button.addEventListener('click',()=>goToPage(index));
        dots.appendChild(button);
      }
    }
    updateCarouselControls();
  }
  function goToPage(page){
    if(!track || !viewport) return;
    activePage=Math.max(0,Math.min(page,pageCount-1));
    track.scrollTo({left:activePage*viewport.clientWidth,behavior:'smooth'});
    updateCarouselControls();
  }
  function updateCarouselControls(){
    previous && (previous.disabled=activePage<=0);
    next && (next.disabled=activePage>=pageCount-1);
    qa('button',dots || document.createElement('div')).forEach((button,index)=>button.classList.toggle('is-active',index===activePage));
  }
  previous?.addEventListener('click',()=>goToPage(activePage-1));
  next?.addEventListener('click',()=>goToPage(activePage+1));
  track?.addEventListener('scroll',()=>{
    window.clearTimeout(scrollTimer);
    scrollTimer=window.setTimeout(()=>{
      if(!viewport) return;
      activePage=Math.max(0,Math.min(pageCount-1,Math.round(track.scrollLeft/viewport.clientWidth)));
      updateCarouselControls();
    },80);
  },{passive:true});
  window.addEventListener('resize',()=>{
    recalcCarousel();
    goToPage(activePage);
  });
  recalcCarousel();
})();
