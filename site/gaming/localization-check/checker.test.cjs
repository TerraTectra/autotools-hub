'use strict';
const assert=require('node:assert/strict');const {compare}=require('./checker-core.js');let passed=0;
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
console.log('Passed '+passed+' scenarios');
