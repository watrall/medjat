import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWork,normalizeDOI,orcidURL,plainText,readQuery,queryString} from '../js/data.js';
import {buildSearchURL,searchWorks} from '../js/crossref.js';

const raw = {DOI:'10.1234/Example',title:['A "title" &amp; scholarship'],author:[{family:'Smith',given:'Ada',ORCID:'https://orcid.org/0000-0002-1825-0097'}],'published-online':{'date-parts':[[2020,2]]}};

test('normalization retains source metadata and never invents identities',()=>{
  const copy=structuredClone(raw);const work=normalizeWork(copy);
  assert.equal(work.authors[0].orcid,raw.author[0].ORCID);
  assert.deepEqual(copy,raw);assert.equal(work.year,2020);assert.equal(work.title,'A "title" & scholarship');
  assert.equal(normalizeWork({...raw,author:[{name:'Organization'}]}).authors[0].orcid,'');
  assert.equal(orcidURL('0000-0003-1234-5678'),'');
});
test('metadata URLs reject executable schemes and attribute injection',()=>{
  assert.equal(normalizeDOI('javascript:alert(1)'),'');
  assert.equal(orcidURL('0000-0002-1825-0097" onmouseover="alert(1)'), '');
  assert.equal(normalizeDOI('https://doi.org/10.1234/Example'),'10.1234/example');
  assert.equal(plainText('<jats:p>Evidence <jats:italic>from</jats:italic> Egypt.</jats:p>'),'Evidence from Egypt.');
});
test('query state round-trips and period queries do not become BCE publication filters',()=>{
  const query=readQuery('?q=Deir+el-Medina&period=new-kingdom&from=2000&abstract=1');
  assert.deepEqual(readQuery(queryString(query)),query);
  const params=new URL(buildSearchURL(query)).searchParams;
  assert.match(params.get('query'),/New Kingdom Egypt/);
  assert.match(params.get('filter'),/from-pub-date:2000-01-01/);
  assert.doesNotMatch(params.get('filter'),/1550/);
  assert.equal(params.get('mailto'),'ethan.watrall@gmail.com');
});
test('search validates the response, normalizes records, and carries a usable cursor',async()=>{
  const items=Array.from({length:25},(_,i)=>({...raw,DOI:`10.1234/item${i}`}));
  const result=await searchWorks(readQuery('?q=test-cursor'),{fetcher:async()=>new Response(JSON.stringify({message:{items,'total-results':70,'next-cursor':'next'}}))});
  assert.equal(result.items.length,25);assert.equal(result.total,70);assert.equal(result.nextCursor,'next');
  await assert.rejects(searchWorks(readQuery('?q=test-invalid'),{fetcher:async()=>new Response('{"message":{}}')}),/unexpected response/);
});
test('DOI lookup uses the single-record endpoint',async()=>{
  let requested='';
  const result=await searchWorks(readQuery('?q=10.1234%2Fdirect'),{fetcher:async url=>{requested=url;return new Response(JSON.stringify({message:{...raw,DOI:'10.1234/direct'}}));}});
  assert.match(requested,/\/works\/10.1234%2Fdirect\?/);assert.equal(result.doiLookup,true);assert.equal(result.nextCursor,null);
});
