'use strict';
const source=document.getElementById('source'),translation=document.getElementById('translation'),previous=document.getElementById('previous');
const result=document.getElementById('result'),error=document.getElementById('error'),report=document.getElementById('report');let current=null;
const revisions=new Map([[source,0],[translation,0],[previous,0]]);
const updateMode=()=>document.querySelector('input[name="mode"]:checked').value==='release-update';
function reset(){current=null;report.disabled=true;result.hidden=true;error.textContent='';document.getElementById('issues').replaceChildren();document.getElementById('changes').replaceChildren();}
function revise(textarea){revisions.set(textarea,revisions.get(textarea)+1);}
for(const textarea of [source,translation,previous])textarea.addEventListener('input',()=>{revise(textarea);reset();});
for(const radio of document.querySelectorAll('input[name="mode"]'))radio.addEventListener('change',()=>{
 reset();for(const textarea of revisions.keys())revise(textarea);
 const update=updateMode();document.getElementById('previous-field').hidden=!update;document.getElementById('editors').classList.toggle('three-editors',update);
 document.getElementById('source-label').textContent=update?'Оригинал после обновления':'Оригинал';
 document.getElementById('mode-help').textContent=update?'Три файла: предыдущий оригинал, новый оригинал и перевод, который вы хотите проверить. Строки сравниваются по точному пути и тексту.':'Два файла: оригинал и перевод одной версии.';
});
for(const [id,textarea]of [['source-file',source],['translation-file',translation],['previous-file',previous]])document.getElementById(id).addEventListener('change',async event=>{
 reset();revise(textarea);const revision=revisions.get(textarea),file=event.target.files[0];if(!file)return;event.target.value='';
 if(file.size>TerraLocalization.LIMIT){error.textContent='Файл больше 1 МиБ.';return;}
 try{const value=await file.text();if(revisions.get(textarea)!==revision)return;reset();textarea.value=value;}catch{if(revisions.get(textarea)===revision)error.textContent='Не удалось прочитать файл.';}
});
document.getElementById('sample').addEventListener('click',()=>{
 reset();for(const textarea of revisions.keys())revise(textarea);
 if(updateMode()){
  previous.value=JSON.stringify({ui:{greeting:'Hello, {player}',coins:'Coins: %d',exit:'Exit'}},null,2);
  source.value=JSON.stringify({ui:{greeting:'Welcome back, {player}',coins:'Coins: %d',save:'Save game'}},null,2);
  translation.value=JSON.stringify({ui:{greeting:'Привет, {player}',coins:'Монеты: %d',exit:'Выход'}},null,2);
 }else{source.value=JSON.stringify({greeting:'Hello, {player}',coins:'Coins: %d'},null,2);translation.value=JSON.stringify({greeting:'Привет, {player}',coins:'Монеты: %s'},null,2);}
});
function line(label,value){const p=document.createElement('p'),strong=document.createElement('strong');strong.textContent=label+' ';p.append(strong,document.createTextNode(value));return p;}
function renderChanges(){
 const changes=document.getElementById('changes');
 for(const [key,label]of [['added','Новые строки'],['changed','Изменённые строки: проверить перевод'],['removed','Удалённые из оригинала: проверить использование']]){
  const items=current[key];if(!items.length)continue;const group=document.createElement('details'),summary=document.createElement('summary');summary.textContent=label+' · '+items.length;group.append(summary);group.open=items.length<=10;
  for(const item of items.slice(0,100)){
   const row=document.createElement('div');row.className='change-row';const path=document.createElement('code');path.textContent=item.path;row.append(path);
   if(Object.hasOwn(item,'before'))row.append(line('Было:',item.before));if(Object.hasOwn(item,'after'))row.append(line('Стало:',item.after));
   row.append(line('В переводе:',item.translation===null?'нет текстового значения':item.translation));group.append(row);
  }
  if(items.length>100)group.append(line('Показаны первые 100.', 'Полный список — в отчёте.'));changes.append(group);
 }
}
document.getElementById('check').addEventListener('click',()=>{
 reset();try{
  current=updateMode()?TerraLocalization.compareUpdate(previous.value,source.value,translation.value):TerraLocalization.compare(source.value,translation.value);
  if(!current.sourceStrings&&(!updateMode()||!current.previousStrings))throw new Error('В оригинале нет текстовых значений для сравнения.');
  document.getElementById('result-title').textContent=updateMode()?'Изменения локализации после обновления':current.issues.length?'Найдено расхождений: '+current.issues.length:'Структурных расхождений не найдено';
  document.getElementById('counts').textContent='Строк в оригинале: '+current.sourceStrings+' · Сравнено: '+current.comparedStrings+' · Ошибок: '+current.errors+' · Предупреждений: '+current.warnings;
  document.getElementById('update-result').hidden=!updateMode();document.getElementById('issues-title').hidden=!updateMode();
  if(updateMode()){
   document.getElementById('update-counts').textContent='Новых: '+current.added.length+' · Изменённых: '+current.changed.length+' · Удалённых: '+current.removed.length+' · Без изменений: '+current.unchangedStrings;
   renderChanges();
  }
  const issues=document.getElementById('issues');
  for(const item of current.issues.slice(0,500)){const row=document.createElement('div');row.className='issue'+(item.severity==='warning'?' warning':'');const key=document.createElement('strong');key.textContent=item.path;const message=document.createElement('span');message.textContent=item.message;row.append(key,message);issues.append(row);}
  if(!current.issues.length){const note=document.createElement('p');note.className='note';note.textContent='Структурных расхождений не найдено. Смысл и отображение перевода требуют отдельной проверки.';issues.append(note);}
  if(current.issues.length>500){const note=document.createElement('p');note.className='note';note.textContent='Показаны первые 500 расхождений. Полный список — в скачиваемом отчёте.';issues.append(note);}
  result.hidden=false;report.disabled=false;
 }catch(e){current=null;error.textContent=e.message;}
});
report.addEventListener('click',()=>{
 if(!current)return;const content=JSON.stringify({...current,checkedAt:new Date().toISOString(),scope:'Structural JSON comparison and exact source-text changes; translation quality, custom syntax and in-game rendering are not validated.'},null,2);
 const url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=current.mode==='release-update'?'TerraTectra-localization-update.json':'TerraTectra-localization-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
