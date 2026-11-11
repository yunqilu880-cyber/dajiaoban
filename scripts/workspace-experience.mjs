const $=id=>document.getElementById(id);
const advancedIds=['explorer','researchLab','recordComparison'];

export function createWorkspaceExperience(){
  let mode='quick';
  function setMode(next){
    mode=next==='research'?'research':'quick';
    document.body.dataset.workspaceMode=mode;
    for(const id of advancedIds)$(id).hidden=mode!=='research';
    for(const key of ['quick','research']){
      $(`mode-${key}`).setAttribute('aria-pressed',String(mode===key));
    }
    document.querySelectorAll('[data-research-nav]').forEach(link=>{link.hidden=mode!=='research';});
    $('workspaceModeNote').textContent=mode==='quick'?'跟随一条记录，完成观察、选段和报告。':'点位、事件、周期与记录对照已展开；当前选段和参数保持不变。';
    window.dispatchEvent(new Event('scroll'));
  }
  function reveal(target){
    const element=typeof target==='string'?$(target):target;
    if(!element)return;
    if(advancedIds.some(id=>$(id).contains(element)))setMode('research');
    element.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  for(const key of ['quick','research'])$(`mode-${key}`).addEventListener('click',()=>setMode(key));
  $('openResearch').addEventListener('click',()=>{setMode('research');reveal('explorer');});
  function revealHash(){let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}const target=$(id);if(target&&advancedIds.some(key=>$(key).contains(target))){setMode('research');reveal(target);}}
  window.addEventListener('hashchange',revealHash);
  setMode('quick');revealHash();
  return {reveal,setMode};
}
