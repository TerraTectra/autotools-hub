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
 text.value=['Задача для игровой мастерской TerraTectra','Формат: '+value('service'),'Игра / проект: '+value('game'),'Версия и платформа: '+value('version'),'Ограничения: '+(value('constraints')||'нужно уточнить'),'','Сейчас → желаемый результат и проверка:',value('goal'),'','Нужна первичная оценка возможности, объёма, допустимости работ, цены и срока.'].join('\n');
 document.getElementById('email-brief').href='mailto:nikidom123@gmail.com?subject='+encodeURIComponent('Игровая мастерская: '+value('game'))+'&body='+encodeURIComponent(text.value);
 result.hidden=false;status.textContent='Текст подготовлен. Выберите способ отправки.';result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
});
document.getElementById('copy-brief').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text.value);status.textContent='Описание скопировано.'}catch{ text.focus();text.select();status.textContent='Выделили текст. Скопируйте его вручную.'}});
document.getElementById('download-brief').addEventListener('click',()=>download(text.value,'TerraTectra-game-brief.txt'));
