import {PERIODS,TYPES,readQuery,queryString,authorLine,doiURL} from './data.js';
import {searchWorks} from './crossref.js';
import {createInspector} from './inspector.js';
import {el,icon,externalLink,emptyState,notify,skeletons} from './dom.js';

const $=id=>document.getElementById(id);
const state={query:readQuery(location.search),items:[],total:0,nextCursor:null,selected:null,loading:false,retrievedAt:'',cached:false,error:'',requestId:0,controller:null,doiLookup:false};

function updateURL() { history.replaceState(null,'',`${location.pathname}?${queryString(state.query)}${location.hash}`); }
function syncControls() {
  $('searchInput').value=state.query.q;$('periodSelect').value=state.query.period;
  $('yearFrom').value=state.query.from;$('yearTo').value=state.query.to;$('typeFilter').value=state.query.type;
  $('hasAbstract').checked=state.query.abstract;$('hasOrcid').checked=state.query.orcid;$('hasReferences').checked=state.query.references;
  $('sortSelect').value=state.query.sort;
  document.querySelectorAll('[data-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.period===state.query.period)));
  const period=PERIODS.find(p=>p.id===state.query.period);
  $('periodDates').textContent=period ? `${period.name} · ${period.dates}` : 'All ancient Egypt';
  const chips=[state.query.q && `Search: ${state.query.q}`,period?.name,state.query.type && TYPES.get(state.query.type),state.query.from && `From ${state.query.from}`,state.query.to && `To ${state.query.to}`,state.query.abstract && 'Has abstract',state.query.orcid && 'Has ORCID',state.query.references && 'Has references'].filter(Boolean);
  $('activeQuery').replaceChildren(...chips.map(text=>el('span',{class:'query-chip'},text)));
}
const inspector=createInspector($('inspector'),{onClose:closeInspector});
function renderInspector(work) { inspector.show(work); }
function closeInspector() {
  $('research').classList.remove('mobile-detail-open');
  $('resultList').querySelector(`[data-record="${CSS.escape(state.selected || '')}"] .result-open`)?.focus();
}
function selectWork(work) {
  state.selected=work.id;renderList();renderInspector(work);
  if (matchMedia('(max-width:999px)').matches) {$('research').classList.add('mobile-detail-open');$('inspector').focus();$('research').scrollIntoView({block:'start'});}
}
function renderList() {
  const list=$('resultList');list.setAttribute('aria-busy',String(state.loading));
  if (state.loading && !state.items.length) {list.replaceChildren(...skeletons());return;}
  if (!state.items.length) {list.replaceChildren(el('li',{},emptyState(state.error?'Search is unavailable':'No publications found.',state.error?'Your search is still here. Retry when you are ready.':'Try a broader topic, another spelling, or fewer filters. Crossref may not contain the scholarship you need.')));return;}
  list.replaceChildren(...state.items.map(work=>{
    const title=el('button',{class:'result-open',onclick:()=>selectWork(work),'aria-label':`Inspect ${work.title}`},work.title);
    const badges=[work.abstract && ['file-text','Abstract'],work.authors.some(a=>a.orcid)&&['user-round','ORCID'],work.references.length>0&&['network',`${work.references.length} references`]].filter(Boolean);
    return el('li',{class:`result-row${state.selected===work.id?' is-selected':''}`,'data-record':work.id},el('div',{class:'result-top'},el('h3',{},title)),el('p',{class:'result-meta'},[authorLine(work),work.year||'Date not supplied',work.container||work.publisher].filter(Boolean).join(' · ')),work.abstract&&el('p',{class:'result-snippet'},work.abstract),el('div',{class:'metadata-badges'},el('span',{},work.typeLabel),badges.map(([name,label])=>el('span',{class:'metadata-badge'},icon(name),label))));
  }));
}
function renderStatus() {
  $('resultCount').textContent=state.loading ? (state.items.length?'Loading more publications…':'Searching Crossref…') : `${state.items.length.toLocaleString()} records loaded${state.total ? ` of ${state.total.toLocaleString()} bibliographic matches` : ''}`;
  $('scopeNote').textContent=state.doiLookup?'DOI lookup opens one exact Crossref record; topic and publication filters do not apply.':`Relevance is ranked by Crossref.${state.retrievedAt?` ${state.cached?'Cached response':'Retrieved'} ${new Date(state.retrievedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}.`:''} Matches are not a complete subject bibliography.`;
  const notice=$('requestNotice');notice.hidden=!state.error;
  if (state.error) notice.replaceChildren(el('div',{class:'notice notice-error'},icon('circle-alert'),el('div',{},el('p',{},state.error),el('button',{class:'button',onclick:()=>runSearch(state.items.length>0 && Boolean(state.nextCursor))},'Retry search'))));
  const footer=$('resultsFooter');footer.replaceChildren();
  if (state.nextCursor) footer.append(el('button',{class:'button',disabled:state.loading,onclick:()=>runSearch(true)},state.loading?'Loading…':'Load 25 more publications'),el('p',{class:'scope-note'},'Only loaded records are shown. Search more specifically to improve relevance.'));
  $('sortSelect').disabled=state.loading;
}
async function runSearch(append=false) {
  state.controller?.abort();const controller=new AbortController();state.controller=controller;
  const requestId=++state.requestId;state.loading=true;state.error='';
  if (!append) {state.items=[];state.selected=null;state.nextCursor=null;$('research').classList.remove('mobile-detail-open');renderInspector(null);}
  syncControls();updateURL();renderList();renderStatus();
  try {
    const result=await searchWorks(state.query,{cursor:append?state.nextCursor:'*',signal:controller.signal});
    if (requestId!==state.requestId) return;
    const existing=new Set(state.items.map(w=>w.id));const added=result.items.filter(w=>!existing.has(w.id));
    state.items=append?[...state.items,...added]:added;state.total=result.total;state.nextCursor=added.length?result.nextCursor:null;
    state.retrievedAt=result.retrievedAt;state.cached=result.cached;state.doiLookup=result.doiLookup;
    if (!state.selected && state.items.length) {state.selected=state.items[0].id;renderInspector(state.items[0]);}
  } catch(error) {
    if (controller.signal.aborted || requestId!==state.requestId) return;
    state.error=error.name==='TimeoutError'?'Crossref took too long to respond. Retry your search.':error.message==='Failed to fetch'?'We could not reach Crossref. Check your connection and retry.':error.message;
  } finally {if (requestId===state.requestId) {state.loading=false;renderList();renderStatus();}}
}
function choosePeriod(id) {state.query.period=id;runSearch();}
for (const period of PERIODS) {
  $('periodSelect').append(el('option',{value:period.id},period.name));
  $('periodButtons').append(el('button',{class:'period-button','data-period':period.id,'aria-pressed':'false',title:`${period.name}: ${period.dates}`,onclick:()=>choosePeriod(period.id)},period.name));
}
$('periodSelect').addEventListener('change',e=>choosePeriod(e.target.value));
$('searchForm').addEventListener('submit',e=>{e.preventDefault();state.query.q=$('searchInput').value.trim()||'ancient egypt';runSearch();});
$('sortSelect').addEventListener('change',e=>{state.query.sort=e.target.value;runSearch();});
$('filterForm').addEventListener('submit',e=>{
  e.preventDefault();const from=$('yearFrom').value;const to=$('yearTo').value;
  if (from && to && Number(from)>Number(to)) {$('filterError').textContent='The start year must come before the end year.';$('filterError').hidden=false;return;}
  $('filterError').hidden=true;Object.assign(state.query,{from,to,type:$('typeFilter').value,abstract:$('hasAbstract').checked,orcid:$('hasOrcid').checked,references:$('hasReferences').checked});runSearch();
});
$('clearFilters').addEventListener('click',()=>{Object.assign(state.query,{from:'',to:'',type:'',abstract:false,orcid:false,references:false});$('filterError').hidden=true;runSearch();});
$('aboutToggle').addEventListener('click',()=>{const open=$('aboutPanel').hidden;$('aboutPanel').hidden=!open;$('aboutToggle').setAttribute('aria-expanded',String(open));});
$('exploreNav').addEventListener('click',()=>{$('research').classList.remove('mobile-detail-open');$('searchInput').focus();});
window.addEventListener('popstate',()=>{state.query=readQuery(location.search);runSearch();});
if (matchMedia('(max-width:1299px)').matches) $('refinements').open=false;
runSearch();
