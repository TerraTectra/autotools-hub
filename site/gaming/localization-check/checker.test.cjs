'use strict';
const assert=require('node:assert/strict');const {compare,compareUpdate}=require('./checker-core.js');let passed=0;
function check(name,test){test();passed++;console.log('PASS '+name)}
const doc=JSON.stringify;
check('valid translation and retained placeholders',()=>assert.equal(compare(doc({a:'Hi {player}, %d coins'}),doc({a:'Привет {player}, монет: %d'})).errors,0));
check('missing key, empty string and wrong type',()=>{const r=compare(doc({a:'Hello',b:'World',c:'Name'}),doc({b:'',c:5}));assert.deepEqual(r.issues.map(i=>i.type),['missing-key','empty','value-type'])});
check('tokens counted, printf type and rich text changed',()=>{const r=compare(doc({a:'{x} {x} %d <b>Hi</b>'}),doc({a:'{x} %s <i>Привет</i>'}));assert.deepEqual(r.issues.map(i=>i.type),['brace','printf','tag'])});
check('escaped braces and percent are literals',()=>assert.equal(compare(doc({a:'Use {{name}}, 50%%'}),doc({a:'Пример {{other}}, 50%%'})).errors,0));
check('nonpositional printf order and positional reordering',()=>{assert.equal(compare(doc({a:'%s: %d'}),doc({a:'%d: %s'})).errors,1);assert.equal(compare(doc({a:'%1$s: %2$d'}),doc({a:'%2$d: %1$s'})).errors,0)});
check('ICU syntax explicitly marked unsupported',()=>assert.equal(compare(doc({a:'{n, plural, one {item} other {items}}'}),doc({a:'{n, plural, one {предмет} other {предметы}}'})).issues[0].type,'unsupported-icu'));
check('distinct paths for dots, slashes and nesting',()=>{const r=compare(doc({'a.b':'one',a:{b:'two'},'x/y':'three','z~q':'four'}),doc({'a.b':'один',a:{b:'два'}}));assert.deepEqual(r.issues.map(i=>i.path),['/x~1y','/z~0q'])});
check('arrays and extra keys',()=>{const r=compare(doc({a:['One','Two']}),doc({a:['Один','Два'],b:'Три'}));assert.equal(r.errors,0);assert.equal(r.issues[0].type,'extra-key')});
check('prototype-like keys retained without pollution',()=>{const r=compare('{"__proto__":"Hello","constructor":"Bye"}','{"__proto__":"Привет","constructor":"Пока"}');assert.equal(r.sourceStrings,2);assert.equal(r.errors,0);assert.equal({}.polluted,undefined)});
check('untranslated text is warning',()=>{const r=compare(doc({a:'Name'}),doc({a:'Name'}));assert.equal(r.warnings,1);assert.equal(r.errors,0)});
check('invalid and oversized JSON rejected',()=>{assert.throws(()=>compare('{','{}'),/некорректный/);assert.throws(()=>compare('[]','null'),/объект или массив/);assert.throws(()=>compare(doc({a:'x'.repeat(1048576)}),'{}'),/больше 1 МБ/)});
check('deep and huge objects bounded',()=>{let x='value';for(let i=0;i<43;i++)x={x};assert.throws(()=>compare(doc(x),'{}'),/вложенность/);assert.throws(()=>compare(doc(Array(20001).fill(0)),'[]'),/слишком много/)});
check('release update separates new, changed, removed and unchanged strings',()=>{
 const r=compareUpdate(doc({ui:{greeting:'Hello, {player}',coins:'Coins: %d',exit:'Exit'}}),doc({ui:{greeting:'Welcome back, {player}',coins:'Coins: %d',save:'Save game'}}),doc({ui:{greeting:'Привет, {player}',coins:'Монеты: %d',exit:'Выход'}}));
 assert.equal(r.mode,'release-update');assert.equal(r.previousStrings,3);assert.equal(r.unchangedStrings,1);assert.equal(r.reviewRequired,2);
 assert.deepEqual(r.added,[{path:'/ui/save',after:'Save game',translation:null}]);
 assert.deepEqual(r.changed,[{path:'/ui/greeting',before:'Hello, {player}',after:'Welcome back, {player}',translation:'Привет, {player}'}]);
 assert.deepEqual(r.removed,[{path:'/ui/exit',before:'Exit',translation:'Выход'}]);
 assert.equal(r.errors,1);assert.equal(r.warnings,1);
});
check('semantic source change still needs review with matching placeholders',()=>{
 const r=compareUpdate(doc({a:'Hold {key} to move'}),doc({a:'Press {key} to move'}),doc({a:'Удерживайте {key} для движения'}));assert.equal(r.errors,0);assert.equal(r.changed.length,1);assert.equal(r.reviewRequired,1);
});
check('corrected translation does not automatically certify source changes',()=>{
 const r=compareUpdate(doc({a:'Exit'}),doc({a:'Exit to desktop'}),doc({a:'Выйти на рабочий стол'}));assert.equal(r.errors,0);assert.equal(r.reviewRequired,1);assert.equal(r.changed[0].translation,'Выйти на рабочий стол');
});
check('already translated new keys stay in new-string review list',()=>{
 const r=compareUpdate('{}',doc({a:'Save'}),doc({a:'Сохранить'}));assert.equal(r.errors,0);assert.equal(r.added.length,1);assert.equal(r.reviewRequired,1);
});
check('renames are delete and add, not guessed migrations',()=>{
 const r=compareUpdate(doc({old:'Title'}),doc({new:'Title'}),doc({old:'Заголовок'}));assert.equal(r.added[0].path,'/new');assert.equal(r.removed[0].path,'/old');assert.equal(r.changed.length,0);
});
check('text becoming a number is removed; number becoming text is added',()=>{
 const r=compareUpdate(doc({a:'Old',b:7,c:true}),doc({a:7,b:'New',c:false}),doc({a:'Старый',b:8}));assert.equal(r.removed[0].path,'/a');assert.equal(r.added[0].path,'/b');assert.equal(r.added[0].translation,null);assert.equal(r.sourceStrings,1);assert.equal(r.errors,1);
});
check('release paths support arrays, slash escaping and prototype-like keys',()=>{
 const r=compareUpdate('{"__proto__":"Before","x/y":["A","B"],"z~q":"Same"}','{"__proto__":"After","x/y":["B","A"],"z~q":"Same"}','{"__proto__":"После","x/y":["Б","А"],"z~q":"То же"}');
 assert.deepEqual(r.changed.map(x=>x.path),['/__proto__','/x~1y/0','/x~1y/1']);assert.equal(r.unchangedStrings,1);assert.equal({}.polluted,undefined);
});
check('whitespace changes are reviewed; JSON property order is irrelevant',()=>{
 const r=compareUpdate(doc({a:'Text',b:'Same'}),doc({b:'Same',a:'Text '}),doc({a:'Текст',b:'То же'}));assert.equal(r.changed[0].path,'/a');assert.equal(r.changed.length,1);assert.equal(r.unchangedStrings,1);
});
check('all source strings removed can still produce a review report',()=>{
 const r=compareUpdate(doc({a:'Old'}),'{}',doc({a:'Старый'}));assert.equal(r.sourceStrings,0);assert.equal(r.removed.length,1);assert.equal(r.warnings,1);
});
check('release mode retains structural checks against current original',()=>{
 const r=compareUpdate(doc({a:'Count: %d'}),doc({a:'Total: %d {n}'}),doc({a:'Всего: %s'}));assert.equal(r.errors,2);assert.equal(r.changed.length,1);assert.deepEqual(r.issues.map(x=>x.type),['brace','printf']);
});
check('previous source is validated and bounded like other documents',()=>{
 assert.throws(()=>compareUpdate('{','{}','{}'),/Предыдущий оригинал: некорректный/);
 assert.throws(()=>compareUpdate(doc({a:'я'.repeat(524288)}),'{}','{}'),/больше 1 МБ/);
 let x='v';for(let i=0;i<43;i++)x={x};assert.throws(()=>compareUpdate(doc(x),'{}','{}'),/вложенность/);
});
console.log('Passed '+passed+' scenarios');
