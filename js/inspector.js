import {authorLine,doiURL,normalizeDOI,plainText,safeURL} from './data.js';
import {getWork,getCitation} from './crossref.js';
import {el,icon,externalLink,emptyState,notify} from './dom.js';
import {createCover} from './covers.js';

export function createInspector(root,{onClose,onSave,isSaved=()=>false}={}) {
  let work=null,tab='overview',style='apa',generation=0,citation='',citationError='',citationLoading=false;
  let trail=[],referenceLimit=20,followError='',following=false;

  function show(next,{fromReference=false}={}) {
    generation++;work=next;tab='overview';referenceLimit=20;citation='';citationError='';citationLoading=false;followError='';following=false;
    if (!fromReference) trail=[];
    render();
  }
  function actionButton(savedWork) {
    return el('button',{class:'button button-primary','aria-pressed':String(isSaved(savedWork.id)),onclick:()=>onSave?.(savedWork)},icon(isSaved(savedWork.id)?'bookmark-check':'bookmark'),isSaved(savedWork.id)?'Saved to collection':'Save to collection');
  }
  function render() {
    const top=el('div',{class:'inspector-top'},el('span',{class:'inspector-kicker'},'Publication details'),el('button',{class:'inspector-close','aria-label':'Back to publications',onclick:onClose},icon('x')));
    root.replaceChildren(top);
    if (!work) {root.append(emptyState('A closer look.','Choose a publication to inspect its metadata, follow deposited references, or save it to your collection.','book-open'));return;}
    if (trail.length) root.append(el('button',{class:'text-button',onclick:()=>{const previous=trail.pop();show(previous,{fromReference:true});}},icon('arrow-left'),'Back to previous publication'));
    const tabs=el('div',{class:'inspector-tabs','aria-label':'Publication detail views'});
    for (const [id,label] of [['overview','Overview'],['connections','Connections'],['cite','Cite']]) tabs.append(el('button',{class:'inspector-tab','aria-pressed':String(tab===id),onclick:()=>{tab=id;render();if(id==='cite'&&!citation)loadCitation();}},label));
    root.append(tabs,el('h2',{class:'detail-title'},work.title));
    root.append(el('div',{class:'detail-authors'},work.authors.length?work.authors.map(author=>el('span',{},author.name,author.orcid&&externalLink(el('span',{class:'orcid-id'},'iD'),author.orcid,{class:'orcid-link','aria-label':`ORCID profile for ${author.name}`}))):'Authors not supplied'));
    root.append(el('p',{class:'detail-meta'},[work.year||'Date not supplied',work.container||work.publisher,work.typeLabel].filter(Boolean).join(' · ')));
    const content=el('div',{'aria-label':`${tab} details`});
    if (tab==='overview') overview(content);
    else if (tab==='connections') connections(content);
    else cite(content);
    root.append(content);
    const actions=el('div',{class:'detail-actions'});
    if (onSave) actions.append(actionButton(work));
    actions.append(externalLink([icon('external-link'),'Open publication'],doiURL(work.doi),{class:'button'}));
    root.append(actions,el('p',{class:'detail-provenance'},'Member-deposited metadata via Crossref. Identifiers and relationships are shown only when supplied.'));
  }
  function section(title,...children) {return el('section',{class:'detail-section'},el('h3',{},title),...children);}
  function overview(container) {
    const cover=createCover(work);if(cover)container.append(cover);
    container.append(section('Abstract',el('p',{class:'abstract-text'},work.abstract||'No abstract was deposited for this record. Open the publication for more information.')));
    const fields=[['DOI',externalLink(work.doi,doiURL(work.doi))],['Type',work.typeLabel],['Published',work.year||'Date not supplied'],['Publisher',work.publisher||'Not supplied']];
    if(work.volume)fields.push(['Volume',work.volume]);if(work.issue)fields.push(['Issue',work.issue]);if(work.pages)fields.push(['Pages',work.pages]);
    const dl=el('dl',{class:'metadata-list'});for(const [key,value] of fields)dl.append(el('dt',{},key),el('dd',{},value));
    container.append(section('Publication record',dl));
    const affiliations=[...new Set(work.authors.flatMap(a=>a.affiliations))];
    if(affiliations.length)container.append(section('Author affiliations',el('p',{},affiliations.join('; '))));
    if(work.funders.length)container.append(section('Funding supplied',el('p',{},work.funders.map(f=>[plainText(f.name),Array.isArray(f.award)?f.award.map(plainText).join(', '):''].filter(Boolean).join(' · ')).filter(Boolean).join('; '))));
    const licenses=work.licenses.map(l=>safeURL(l?.URL)).filter(Boolean);
    if(licenses.length)container.append(section('Deposited licenses',...licenses.map(url=>el('p',{},externalLink(url,url)))));
    container.append(section('Reuse this record',el('button',{class:'text-button',onclick:()=>{
      const blob=new Blob([JSON.stringify(work.raw,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=el('a',{href:url,download:'crossref-record.json'});link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }},icon('download'),'Download source metadata')));
  }
  async function follow(doi) {
    following=true;followError='';render();const id=++generation;
    try {const next=await getWork(doi);if(id!==generation)return;trail.push(work);show(next,{fromReference:true});}
    catch(error){if(id!==generation)return;following=false;followError=error.message;render();}
  }
  function connections(container) {
    container.append(section('Follow deposited connections',el('p',{},'References and relationships come from this record. Their absence does not mean a work has no connections.')));
    if(following)container.append(el('p',{class:'citation-note',role:'status'},'Retrieving the referenced publication…'));
    if(followError)container.append(el('div',{class:'notice notice-error',role:'alert'},el('p',{},followError,' Use the DOI link to open its registration directly.')));
    const refs=work.references;
    if(!refs.length)container.append(section('References',el('p',{},'No reference list was deposited for this record.')));
    else {
      const list=el('ol',{class:'reference-list'});
      for(const ref of refs.slice(0,referenceLimit)) {
        const doi=normalizeDOI(ref.DOI);
        const label=plainText(ref.unstructured)||[plainText(ref.author),plainText(ref['article-title']),plainText(ref['journal-title']),plainText(String(ref.year||''))].filter(Boolean).join('. ')||doi||'Reference details not supplied';
        list.append(el('li',{},el('p',{},label),doi&&el('div',{},el('button',{disabled:following,onclick:()=>follow(doi)},'Inspect reference'),el('small',{},externalLink(doi,doiURL(doi))))));
      }
      const block=section(`References (${refs.length})`,list);
      if(refs.length>referenceLimit)block.append(el('button',{class:'text-button',onclick:()=>{referenceLimit+=20;render();}},'Show 20 more references'));
      container.append(block);
    }
    const relations=[];
    for(const [type,values]of Object.entries(work.relations))for(const ref of Array.isArray(values)?values:[]) {
      const doi=normalizeDOI(ref.id);if(doi)relations.push(el('li',{},el('p',{},plainText(type.replaceAll('-',' '))),el('button',{disabled:following,onclick:()=>follow(doi)},doi),el('small',{},externalLink('Open DOI',doiURL(doi)))));
    }
    if(relations.length)container.append(section('Related records',el('ul',{class:'reference-list'},relations)));
    if(work.citedBy!==null)container.append(section('Cited-by count',el('p',{},`${work.citedBy.toLocaleString()} citations recorded by Crossref. This is not a complete citation count or an available list of citing works.`)));
  }
  async function loadCitation() {
    const id=++generation;citationLoading=true;citationError='';citation='';render();
    try {const text=await getCitation(work.doi,style);if(id!==generation)return;citation=text;}
    catch(error){if(id!==generation)return;citationError=error.message;}
    finally{if(id===generation){citationLoading=false;render();}}
  }
  function cite(container) {
    const select=el('select',{id:'citationStyle',onchange:e=>{style=e.target.value;loadCitation();}});
    for(const [value,label]of [['apa','APA'],['mla','MLA'],['chicago','Chicago author-date']])select.append(el('option',{value,selected:value===style},label));
    const block=section('Formatted citation',el('div',{class:'citation-controls'},el('label',{for:'citationStyle'},'Style'),select));
    if(citationLoading)block.append(el('p',{role:'status'},'Retrieving a formatted citation from Crossref…'));
    else if(citationError)block.append(el('div',{class:'notice notice-error'},el('div',{},el('p',{},citationError),el('button',{class:'button',onclick:loadCitation},'Retry citation'))));
    else if(citation) {
      const text=el('textarea',{readonly:true,'aria-label':'Formatted citation'},citation);
      block.append(text,el('button',{class:'text-button',onclick:async()=>{
        try {if(!navigator.clipboard)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(citation);notify('Citation copied.');}
        catch {text.focus();text.select();notify('Citation selected. Use your device’s Copy command.');}
      }},icon('copy'),'Copy citation'));
    }
    block.append(el('p',{class:'citation-note'},'Formatted by Crossref using CSL styles. Check the citation against your required style and the publication itself.'));
    container.append(block);
  }
  return {show,refresh:render,getCurrentWork:()=>work};
}
