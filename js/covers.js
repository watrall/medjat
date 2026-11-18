import {el,externalLink} from './dom.js';

export function validISBN(value) {
  if (typeof value !== 'string') return '';
  const isbn=value.replace(/[\s-]/g,'').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum=[...isbn].reduce((total,digit,index)=>total+(digit==='X'?10:Number(digit))*(10-index),0);
    return sum%11===0?isbn:'';
  }
  if (/^97[89]\d{10}$/.test(isbn)) {
    const sum=[...isbn].reduce((total,digit,index)=>total+Number(digit)*(index%2?3:1),0);
    return sum%10===0?isbn:'';
  }
  return '';
}

export function coverISBN(work) {return (Array.isArray(work.raw.ISBN)?work.raw.ISBN:[]).map(validISBN).find(Boolean)||'';}
const unavailable=new Set();
export function createCover(work) {
  const isbn=coverISBN(work);
  if(!isbn||unavailable.has(isbn))return null;
  const containerTitle=work.type==='book-chapter'&&work.container?work.container:work.title;
  const image=el('img',{alt:`Cover of ${containerTitle}`,width:84,height:120,decoding:'async',referrerpolicy:'no-referrer'});
  const figure=el('figure',{class:'publication-cover',hidden:true},image,el('figcaption',{},el('span',{},work.type==='book-chapter'?'Containing book':'Book cover'),externalLink('Cover via Open Library',`https://openlibrary.org/isbn/${isbn}`),el('small',{},`Matched by ISBN ${isbn}`)));
  image.addEventListener('load',()=>{if(image.naturalWidth>1)figure.hidden=false;});
  image.addEventListener('error',()=>{unavailable.add(isbn);figure.remove();});
  image.src=`https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
  return figure;
}
