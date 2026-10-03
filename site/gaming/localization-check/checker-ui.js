'use strict';
const source=document.getElementById('source'),translation=document.getElementById('translation');
const result=document.getElementById('result'),error=document.getElementById('error'),report=document.getElementById('report');let current=null;
function reset(){current=null;report.disabled=true;result.hidden=true;error.textContent='';document.getElementById('issues').replaceChildren();}
source.addEventListener('input',reset);translation.addEventListener('input',reset);
for(const [id,textarea]of [['source-file',source],['translation-file',translation]])document.getElementById(id).addEventListener('change',async event=>{
 reset();const file=event.target.files[0];if(!file)return;
 if(file.size>TerraLocalization.LIMIT){error.textContent='Файл больше 1 МБ.';event.target.value='';return;}
 try{const value=await file.text();reset();textarea.value=value;event.target.value='';}catch{error.textContent='Не удалось прочитать файл.'}
});
document.getElementById('sample').addEventListener('click',()=>{reset();source.value=JSON.stringify({greeting:'Hello, {player}',coins:'Coins: %d'},null,2);translation.value=JSON.stringify({greeting:'Привет, {player}',coins:'Монеты: %s'},null,2);});
document.getElementById('check').addEventListener('click',()=>{
 reset();try{
  current=TerraLocalization.compare(source.value,translation.value);
  if(!current.sourceStrings)throw new Error('В оригинале нет текстовых значений для сравнения.');
  document.getElementById('result-title').textContent=current.issues.length?'Найдено расхождений: '+current.issues.length:'Структурных расхождений не найдено';
  document.getElementById('counts').textContent='Строк в оригинале: '+current.sourceStrings+' · Сравнено: '+current.comparedStrings+' · Ошибок: '+current.errors+' · Предупреждений: '+current.warnings;
  const issues=document.getElementById('issues');
  for(const item of current.issues.slice(0,500)){const row=document.createElement('div');row.className='issue'+(item.severity==='warning'?' warning':'');const key=document.createElement('strong');key.textContent=item.path;const message=document.createElement('span');message.textContent=item.message;row.append(key,message);issues.append(row);}
  if(current.issues.length>500){const note=document.createElement('p');note.className='note';note.textContent='Показаны первые 500 расхождений. Полный список — в скачиваемом отчёте.';issues.append(note);}
  result.hidden=false;report.disabled=false;
 }catch(e){current=null;error.textContent=e.message;}
});
report.addEventListener('click',()=>{
 if(!current)return;const content=JSON.stringify({...current,checkedAt:new Date().toISOString(),scope:'Structural JSON comparison; translation quality, custom syntax and in-game rendering are not validated.'},null,2);
 const url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='TerraTectra-localization-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
