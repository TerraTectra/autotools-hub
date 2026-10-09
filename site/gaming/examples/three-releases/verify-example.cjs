'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const localCore=path.join(__dirname,'checker-core.js');
const {compare,compareUpdate}=require(fs.existsSync(localCore)?localCore:path.join(__dirname,'../../localization-check/checker-core.js'));
const started=performance.now();
const read=filename=>fs.readFileSync(path.join(__dirname,filename),'utf8');
const docs={};for(const version of [1,2,3])for(const lang of ['en','ru'])docs['v'+version+'/'+lang+'.json']=read('v'+version+'/'+lang+'.json');
const decisions=JSON.parse(read('decisions.json'));
for(const version of [1,2,3]){
 const result=compare(docs['v'+version+'/en.json'],docs['v'+version+'/ru.json']);assert.equal(result.errors,0);assert.equal(result.warnings,0);
}
const expected={
 'v1-to-v2':{added:['/ui/autosave','/settings/textSize','/save/slot'],changed:['/ui/greeting','/ui/inspect','/quests/objective','/save/overwrite'],removed:['/ui/help'],unchanged:18,source:25,errors:4,warnings:1},
 'v2-to-v3':{added:['/ui/refund','/quests/deadline'],changed:['/menu/continue','/ui/coins','/ui/capacity','/quests/complete'],removed:['/quests/progress','/settings/fullscreen'],unchanged:19,source:25,errors:2,warnings:2}
};
const reports={},summary={};
for(const [from,to]of [[1,2],[2,3]]){
 const key='v'+from+'-to-v'+to;
 const before=compareUpdate(docs['v'+from+'/en.json'],docs['v'+to+'/en.json'],docs['v'+from+'/ru.json']);
 const after=compareUpdate(docs['v'+from+'/en.json'],docs['v'+to+'/en.json'],docs['v'+to+'/ru.json']);
 for(const kind of ['added','changed','removed'])assert.deepEqual(before[kind].map(x=>x.path).sort(),expected[key][kind].slice().sort());
 assert.equal(before.unchangedStrings,expected[key].unchanged);assert.equal(before.sourceStrings,expected[key].source);assert.equal(before.errors,expected[key].errors);assert.equal(before.warnings,expected[key].warnings);
 assert.equal(after.errors,0);assert.equal(after.warnings,0);assert.equal(after.reviewRequired,before.reviewRequired);
 for(const item of [...after.added,...after.changed,...after.removed])assert.ok(decisions.decisions[key][item.path],'Missing contextual decision for '+key+item.path);
 // A matching placeholder set must not hide a changed input action or currency name.
 assert.ok(before.changed.some(x=>x.path===(from===1?'/ui/inspect':'/ui/coins')));
 reports[key+'.before.json']=before;reports[key+'.after.json']=after;
 summary[key]={previousStrings:before.previousStrings,currentStrings:before.sourceStrings,added:before.added.length,changed:before.changed.length,removed:before.removed.length,unchanged:before.unchangedStrings,reviewRequired:before.reviewRequired,beforeErrors:before.errors,beforeWarnings:before.warnings,afterErrors:after.errors,afterWarnings:after.warnings};
}
const elapsed=Number((performance.now()-started).toFixed(3));
if(process.argv.includes('--write')){
 fs.mkdirSync(path.join(__dirname,'reports'),{recursive:true});
 for(const [filename,report]of Object.entries(reports))fs.writeFileSync(path.join(__dirname,'reports',filename),JSON.stringify({...report,example:'Own synthetic fixture; no game runtime, customer delivery or professional editorial certification.'},null,2)+'\n');
 fs.writeFileSync(path.join(__dirname,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 fs.writeFileSync(path.join(__dirname,'benchmark.json'),JSON.stringify({measuredAt:new Date().toISOString(),node:process.version,platform:process.platform,architecture:process.arch,elapsedMs:elapsed,scope:'One process: read six small JSON files; run three structural checks and four release comparisons; assert expected paths and recorded decisions. Excludes process startup, writing reports, human translation/editorial work, packaging, browser QA and in-game verification.',singleSample:true},null,2)+'\n');
}else{
 assert.deepEqual(JSON.parse(read('summary.json')),summary);
 for(const [filename,report]of Object.entries(reports))for(const [key,value]of Object.entries(report))assert.deepEqual(JSON.parse(read('reports/'+filename))[key],value);
}
console.log(JSON.stringify({status:'PASS',summary,thisRunElapsedMs:elapsed,inGameTested:false,professionalEditorReviewed:false},null,2));
