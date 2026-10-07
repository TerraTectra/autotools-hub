'use strict';
const form=document.getElementById('brief-form');
const result=document.getElementById('brief-result');
const text=document.getElementById('brief-text');
const status=document.getElementById('brief-status');
form.addEventListener('input',event=>{if(event.target.setCustomValidity)event.target.setCustomValidity('');result.hidden=true;status.textContent='';});
form.addEventListener('change',()=>{result.hidden=true;status.textContent='';});
function download(content,name,type='text/plain;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([content],{type})); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
form.addEventListener('submit',event=>{
 event.preventDefault();
 for(const field of form.querySelectorAll('[required]'))field.setCustomValidity(field.value.trim()?'':'Заполните это поле.');
 if(!form.reportValidity())return;
 const value=id=>document.getElementById(id).value.trim();
 text.value=['Сценарий проверки игрового проекта','Направление: '+value('service'),'Игра / проект: '+value('game'),'Версия и платформа: '+value('version'),'Условия: '+(value('constraints')||'нужно уточнить'),'','Сейчас → ожидаемый результат и проверка:',value('goal'),'','Перед изменением: проверить права и версию, сохранить резервную копию, подготовить возврат.','После изменения: записать проверенный сценарий, результат и оставшиеся ограничения.'].join('\n');
 result.hidden=false;status.textContent='Текст подготовлен. Сохраните или скопируйте описание.';result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
});
document.getElementById('copy-brief').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text.value);status.textContent='Описание скопировано.'}catch{ text.focus();text.select();status.textContent='Выделили текст. Скопируйте его вручную.'}});
document.getElementById('download-brief').addEventListener('click',()=>download(text.value,'TerraTectra-game-brief.txt'));
