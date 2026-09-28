(function(){
  'use strict';
  const q=(selector,root=document)=>root.querySelector(selector);
  const qa=(selector,root=document)=>[...root.querySelectorAll(selector)];

  const menu=q('#wiki-sidebar'),toggle=q('#wiki-menu-toggle'),scrim=q('#wiki-scrim');
  function setMenu(open){document.body.classList.toggle('is-menu-open',open);toggle?.setAttribute('aria-expanded',String(open));if(scrim)scrim.hidden=!open;}
  toggle?.addEventListener('click',()=>setMenu(!document.body.classList.contains('is-menu-open')));
  scrim?.addEventListener('click',()=>setMenu(false));
  qa('[data-wiki-link]').forEach(link=>link.addEventListener('click',()=>setMenu(false)));

  qa('.wiki-index__group>button').forEach(button=>button.addEventListener('click',()=>{
    const group=button.closest('.wiki-index__group');
    const open=!group.classList.contains('is-open');
    group.classList.toggle('is-open',open);button.setAttribute('aria-expanded',String(open));
  }));

  const sections=qa('[data-wiki-section]'),links=qa('[data-wiki-link]');
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(!visible)return;
      links.forEach(link=>link.classList.toggle('is-active',link.getAttribute('href')===`#${visible.target.id}`));
    },{rootMargin:'-18% 0px -67% 0px',threshold:[.02,.15,.4]});
    sections.forEach(section=>observer.observe(section));
  }

  qa('.wiki-pin').forEach(pin=>pin.addEventListener('click',()=>{
    const target=document.getElementById(pin.dataset.note||'');
    if(!target)return;
    qa('.wiki-pin').forEach(item=>item.classList.toggle('is-active',item===pin));
    qa('.wiki-notes article').forEach(item=>item.classList.toggle('is-active',item===target));
    target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
  }));

  qa('[data-carousel]').forEach(carousel=>{
    const track=q('.wiki-carousel__track',carousel),slides=qa('.wiki-carousel__slide',carousel),label=q('[data-carousel-label]',carousel),dots=q('[data-carousel-dots]',carousel),prev=q('[data-carousel-prev]',carousel),next=q('[data-carousel-next]',carousel);
    let index=0;
    slides.forEach((slide,i)=>{const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label',`Vai alla schermata ${i+1}`);dot.addEventListener('click',()=>go(i));dots?.appendChild(dot);});
    function go(value){index=Math.max(0,Math.min(slides.length-1,value));if(track)track.style.transform=`translateX(-${index*100}%)`;if(label)label.textContent=`${index+1} / ${slides.length} · ${slides[index]?.dataset.slideLabel||''}`;qa('button',dots).forEach((dot,i)=>dot.classList.toggle('is-active',i===index));if(prev)prev.disabled=index===0;if(next)next.disabled=index===slides.length-1;}
    prev?.addEventListener('click',()=>go(index-1));next?.addEventListener('click',()=>go(index+1));go(0);
  });

  const searches=[q('#wiki-side-search'),q('#wiki-global-search')].filter(Boolean);
  function normalize(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function search(value){
    const needle=normalize(value).trim();let shown=0;
    sections.forEach(section=>{const match=!needle||normalize(`${section.dataset.search||''} ${section.textContent||''}`).includes(needle);section.hidden=!match;if(match)shown++;});
    const empty=q('#wiki-no-results');if(empty)empty.hidden=shown>0;
  }
  searches.forEach(input=>input.addEventListener('input',event=>{search(event.target.value);searches.forEach(other=>{if(other!==event.target)other.value=event.target.value;});}));
  document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();q('#wiki-global-search')?.focus();}if(event.key==='Escape'){setMenu(false);searches.forEach(input=>input.blur());}});
})();
