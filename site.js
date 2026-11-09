(() => {
  const toggle=document.getElementById('menuToggle');
  const nav=document.getElementById('siteNav');
  toggle?.addEventListener('click',()=>{
    const open=toggle.getAttribute('aria-expanded')!=='true';
    toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('is-open',open);
  });
  nav?.addEventListener('click',event=>{if(event.target.closest('a')){nav.classList.remove('is-open');toggle?.setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){nav?.classList.remove('is-open');toggle?.setAttribute('aria-expanded','false');}});
  document.documentElement.classList.add('has-js');
  if('IntersectionObserver' in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}});},{threshold:.07});
    document.querySelectorAll('.reveal').forEach(node=>observer.observe(node));
  }else document.querySelectorAll('.reveal').forEach(node=>node.classList.add('is-visible'));
  if('serviceWorker' in navigator&&['https:','http:'].includes(location.protocol)){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
})();
