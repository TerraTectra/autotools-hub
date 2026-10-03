(function(root){
 'use strict';
 const LIMIT=1024*1024, MAX_NODES=20000, MAX_DEPTH=40;
 function readJSON(text,label){
  if(new TextEncoder().encode(text).length>LIMIT)throw new Error(label+': файл больше 1 МБ.');
  let value;try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error(label+': некорректный JSON. Проверьте кавычки, запятые и скобки.');}
  if(value===null||typeof value!=='object')throw new Error(label+': нужен объект или массив JSON.');
  const leaves=new Map();let count=0;
  function walk(node,path,depth){
   if(++count>MAX_NODES)throw new Error(label+': слишком много элементов (лимит 20 000).');
   if(depth>MAX_DEPTH)throw new Error(label+': вложенность больше 40 уровней.');
   if(node!==null&&typeof node==='object'){
    for(const key of Object.keys(node))walk(node[key],path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'),depth+1);
   }else leaves.set(path,node);
  }
  walk(value,'',0);return leaves;
 }
 const regexTokens={
  brace:/(?<!\{)\{[\p{L}\p{N}_]+(?:,[+-]?\d+)?(?::[^{}]+)?\}(?!\})/gu,
  printf:/%(?:\d+\$)?[-+ #0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?(?:hh|ll|[hlLjzt])?[diuoxXfFeEgGaAcspn]/g,
  tag:/<\/?[A-Za-z][^<>\r\n]*>/g
 };
 function multiset(text,regex){return (text.match(regex)||[]).sort();}
 function tokens(text,kind){
  if(kind!=='printf')return multiset(text,regexTokens[kind]);
  const found=text.replace(/%%/g,'').match(regexTokens.printf)||[];
  return found.every(token=>/^%\d+\$/.test(token))?found.sort():found;
 }
 function same(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i]);}
 function format(list){return list.length?list.join(', '):'нет';}
 function compare(sourceText,translationText){
  const source=readJSON(sourceText,'Оригинал'),translation=readJSON(translationText,'Перевод');const issues=[];
  let comparedStrings=0, sourceStrings=0;
  for(const [path,value]of source){
   if(typeof value!=='string')continue;sourceStrings++;
   if(!translation.has(path)){issues.push({path,type:'missing-key',severity:'error',message:'Нет ключа в переводе.'});continue;}
   const translated=translation.get(path);
   if(typeof translated!=='string'){issues.push({path,type:'value-type',severity:'error',message:'Ожидалась строка, получен другой тип значения.'});continue;}
   comparedStrings++;
   if(/\{\s*[\w]+\s*,\s*(?:plural|select|selectordinal)\s*,/.test(value+translated))issues.push({path,type:'unsupported-icu',severity:'warning',message:'Обнаружена ICU-конструкция. Для неё нужен отдельный разбор; эта проверка не подтверждает её корректность.'});
   if(value.trim()&&!translated.trim())issues.push({path,type:'empty',severity:'error',message:'Непустая строка стала пустой.'});
   for(const kind of ['brace','printf','tag']){
    const before=tokens(value,kind),after=tokens(translated,kind);
    if(!same(before,after))issues.push({path,type:kind,severity:'error',message:(kind==='tag'?'Теги отличаются':'Подстановки отличаются')+': '+format(before)+' → '+format(after)});
   }
   if(value.trim()===translated.trim()&&/\p{L}/u.test(value))issues.push({path,type:'unchanged',severity:'warning',message:'Строка совпадает с оригиналом. Проверьте, требуется ли перевод.'});
  }
  for(const [path,value]of translation)if(typeof value==='string'&&!source.has(path))issues.push({path,type:'extra-key',severity:'warning',message:'Ключ отсутствует в оригинале. Проверьте, нужен ли он.'});
  const errors=issues.filter(i=>i.severity==='error').length;
  return {version:'1.0',sourceStrings,comparedStrings,errors,warnings:issues.length-errors,issues};
 }
 const api={compare,readJSON,tokens,LIMIT};if(typeof module==='object'&&module.exports)module.exports=api;else root.TerraLocalization=api;
})(typeof globalThis==='object'?globalThis:this);
