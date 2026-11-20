// ==UserScript==
// @name         CA Legislative Target V11.15.0 — Full Registry + Core Priority
// @namespace    ca.legislative.target
// @version      11.16.0
// @description  Page-local targeting, metadata, syntax trees, baseline verification and ZIP exports
// @match        https://leginfo.legislature.ca.gov/faces/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
'use strict';
if (!/\/(codes|codesTOCSelected|codedisplayexpand|codes_displayexpandedbranch|codes_displayText|codes_displaySection|codeBillCrossRef|displayCodeAndBill|asAmendsTheBill|billNavClient|billTextClient|billVotesClient|billHistoryClient|billAnalysisClient|billCompareClient|billVersionsCompareClient|billStatusClient|billSearchClient|billCommentsClient|billUserInfoGather)\.xhtml$/.test(location.pathname)) return;
if(/\/(billCommentsClient|billUserInfoGather)\.xhtml$/.test(location.pathname)){
 const forms=[...document.forms].map(f=>({id:f.id,method:f.method,action:new URL(f.action).pathname,controls:[...f.elements].map(e=>({id:e.id,tag:e.tagName,type:e.type,disabled:!!e.disabled,readOnly:!!e.readOnly,sessionField:e.name==='javax.faces.ViewState'}))}));
 const report={classification:'INTERACTIVE_RESTRICTED',billId:document.querySelector('#bid')?.value??null,forms,autoExecute:false,sessionStateExported:false};
 window.CA_ACTIONS=report;
 const panel=document.createElement('div');panel.style.cssText='position:fixed;right:12px;bottom:12px;background:white;color:black;border:1px solid #888;padding:12px;z-index:2147483647';
 const button=document.createElement('button');button.type='button';button.textContent='Export restricted action metadata';button.onclick=()=>{const a=document.createElement('a');const u=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.href=u;a.download='CA_ACTIONS.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};panel.append(button);document.body.append(panel);return;
}

(() => {
'use strict';
const BASE='https://leginfo.legislature.ca.gov/faces/';
const codes={'California Constitution':'CONS','Business and Professions Code':'BPC','Civil Code':'CIV','Code of Civil Procedure':'CCP','Commercial Code':'COM','Corporations Code':'CORP','Education Code':'EDC','Elections Code':'ELEC','Evidence Code':'EVID','Family Code':'FAM','Financial Code':'FIN','Fish and Game Code':'FGC','Food and Agricultural Code':'FAC','Government Code':'GOV','Harbors and Navigation Code':'HNC','Health and Safety Code':'HSC','Insurance Code':'INS','Labor Code':'LAB','Military and Veterans Code':'MVC','Penal Code':'PEN','Probate Code':'PROB','Public Contract Code':'PCC','Public Resources Code':'PRC','Public Utilities Code':'PUC','Revenue and Taxation Code':'RTC','Streets and Highways Code':'SHC','Unemployment Insurance Code':'UIC','Vehicle Code':'VEH','Water Code':'WAT','Welfare and Institutions Code':'WIC'};
const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
const text=e=>norm(e?.textContent); const q=(s,r=document)=>r.querySelector(s); const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const url=(p,params)=>{const u=new URL(p,BASE);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));return u.href;};
const secURL=(code,n)=>url('codes_displaySection.xhtml',{lawCode:code,sectionNum:n.replace(/\.$/,'')+'.'});
function xpath(e){let a=[];for(;e&&e.nodeType===1;e=e.parentElement){let n=1;for(let p=e.previousElementSibling;p;p=p.previousElementSibling)if(p.localName===e.localName)n++;a.unshift(e.localName+'['+n+']');}return '/'+a.join('/');}
function decode(h,code){let m=(h||'').match(/^javascript:\s*submitCodesValues\((.*)\)\s*;?$/s);if(!m)return null;let args=m[1].match(/'[^']*'|"[^"]*"/g)?.map(x=>x.slice(1,-1));if(args?.length!==6||!code)return null;return {function:'submitCodesValues',arguments:args,resolvedURL:secURL(code,args[0]),urlVerification:'DERIVED_NOT_LIVE_VERIFIED'};}
function links(doc,source,code){return qa('a[href]',doc).map(a=>{let rawHref=a.getAttribute('href'),onclick=a.getAttribute('onclick'),navigation=decode(rawHref,code),resolvedURL=navigation?.resolvedURL||null;let status=navigation?'DERIVED_NOT_LIVE_VERIFIED':'UNRESOLVED';if(!navigation&&!rawHref.startsWith('javascript:')){try{let u=new URL(rawHref,source);if(/^https?:$/.test(u.protocol)){resolvedURL=u.href;status=onclick?'HREF_WITH_JS_HANDLER':'OBSERVED_HREF';}}catch{}}return {label:text(a),rawHref,onclick,resolvedURL,status,navigation,xpath:xpath(a)};});}
function codeOf(doc,source){let u=new URL(source);return u.searchParams.get('lawCode')||u.searchParams.get('tocCode')||text(q('#manylawsections h3, #codeLawSectionNoHead h4',doc)).match(/ - ([A-Z]{2,4})$/)?.[1]||null;}
function targetFrom(action){let m=action.match(/\bSection\s+([0-9][\w.]*)\s+(?:of|is (?:added|amended|repealed) (?:to|in))\s+(?:the\s+)?(Code of Civil Procedure|California Constitution|.+? Code)\b/i);if(!m)return null;let name=Object.keys(codes).find(k=>k.toLowerCase()===m[2].toLowerCase());if(!name)return null;let code=codes[name],section=m[1].replace(/\.$/,'');return {canonicalId:`CA:CODE:${code}:SECTION:${section}`,code,section,sectionURL:secURL(code,section),urlVerification:'DERIVED_NOT_LIVE_VERIFIED'};}
function subdivisions(paras,root){
 const out=[],stack=[],seen=new Set(),levels={0:1,1:2,2.5:3,4:4,5.5:5};
 const markersOf=p=>[...(p.text.match(/^\s*(?:\(([A-Za-z0-9]+)\)\s*)+/)?.[0]||'').matchAll(/\(([^)]+)\)/g)].map(m=>m[1]);
 const first=paras.find(p=>markersOf(p).length),firstMarker=first?markersOf(first)[0]:null;
 // A statute beginning with (1) has a numbered root, not an implicit (a).
 const numberedRoot=firstMarker!==null&&/^\d+$/.test(firstMarker);
 const rootIndent=numberedRoot?(levels[first.indent]??2):1;
 for(const p of paras){const markers=markersOf(p);let preceding=null;
  for(let j=0;j<markers.length;j++){const marker=markers[j],indent=p.indent;
   let depth=/^\d+$/.test(marker)?2:/^[A-Z]+$/.test(marker)?3:1;
   if(j===0&&indent!==null&&levels[indent]!==undefined)depth=levels[indent]-rootIndent+1;
   else if(j>0)depth=preceding+1;
   else {if(/^[ivxlcdm]+$/.test(marker)&&marker.length>1&&stack.length>=3)depth=4;depth=depth-(numberedRoot?1:0);}
   const intendedDepth=depth;depth=Math.max(1,Math.min(depth,stack.length+1));stack.length=depth-1;
   const parentId=stack.at(-1)?.canonicalId||root,legalPath=stack.map(x=>`(${x.marker})`).join('')+`(${marker})`,key=root+':PATH:'+legalPath;
   const collision=seen.has(key);seen.add(key);const canonicalId=collision?key+':OBS:'+out.length:key;
   const node={canonicalId,parentId,marker,legalPath,textExact:p.text,xpath:p.xpath,indentEm:indent??null,intendedDepth,depth,rootMode:numberedRoot?'NUMBERED_ROOT':'STANDARD_ROOT',rootIndentLevel:rootIndent,verification:collision?'COLLISION_REVIEW':depth!==intendedDepth?'PARENT_REVIEW':'HEURISTIC_REVIEW'};
   out.push(node);stack.push(node);preceding=depth;
  }
 }return out;
}
async function extractVotes(work,report,id,version){
 const root='CA:BILL:'+id, events=[], seen=new Set();
 for(const el of qa('.status',work).filter(e=>q('[id$=":voteDate"]',e))){
  const fields={},fieldIds={}; for(const key of ['voteDate','result','location','motion','ayes','noes','nvr','ayesLeg','noesLeg','nvrLeg']){const e=q('[id$=":'+key+'"]',el);fields[key]=e?text(e):null;fieldIds[key]=e?.id??null;}
  const m=fields.voteDate?.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);const session=String(id).match(/^\d{4}/)?.[0];let date=null;if(m){const y=m[3].length===4?+m[3]:session?Math.floor(+session/100)*100+ +m[3]:null;if(y!==null){const candidate=`${y}-${m[1]}-${m[2]}`;const dt=new Date(candidate+'T00:00:00Z');if(!isNaN(dt)&&dt.toISOString().slice(0,10)===candidate)date=candidate;}}
  const eventKey=await sha(JSON.stringify([fields.voteDate,fields.location,fields.motion]));const base=root+':VOTE:'+(date||'UNKNOWN')+':'+eventKey;const duplicate=seen.has(base);seen.add(base);const canonicalId=duplicate?base+':OBS:'+events.length:base;
  const counts={},legislators={},checks={},detectors=[];const flag=(id,details)=>detectors.push({id,canonicalId,...details});
  for(const k of ['ayes','noes','nvr']){counts[k]=/^\d+$/.test(fields[k]??'')?Number(fields[k]):null;legislators[k]=fields[k+'Leg']===null?null:fields[k+'Leg'].split(',').map(norm).filter(Boolean);checks[k]=counts[k]!==null&&legislators[k]!==null&&counts[k]===legislators[k].length;if(!checks[k])flag('DET-VOTE-001',{category:k,reported:counts[k],observed:legislators[k]?.length??null});}
  const names=new Map();for(const [category,list] of Object.entries(legislators))for(const name of list||[]){const key=name.toLocaleLowerCase('en-US');if(names.has(key))flag('DET-VOTE-003',{name,category,previousCategory:names.get(key)});names.set(key,category);}
  if(duplicate)flag('DET-VOTE-002',{});if(!date)flag('DET-VOTE-DATE-001',{});const chamber=/^(senate|sen)\b/i.test(fields.location||'')?'SENATE':/^(assembly|asm)\b/i.test(fields.location||'')?'ASSEMBLY':null;if(!chamber)flag('DET-VOTE-004',{location:fields.location});
  const observations=Object.entries(legislators).flatMap(([category,list])=>(list||[]).map((name,i)=>({canonicalId:canonicalId+':BALLOT:'+category+':'+(i+1),parentId:canonicalId,nameRaw:name,category:category.toUpperCase(),legislatorId:null})));
  const event={canonicalId,parentId:root,entityType:'VOTE_EVENT',documentOrder:events.length+1,date,location:fields.location,chamber,motion:fields.motion,result:fields.result?.replace(/^\(|\)$/g,'')??null,counts,legislators,observations,checks,detectors,versionAtVote:null,displayedVersion:version,versionVerification:'UNRESOLVED',sourceURL:report.sourceURL,captureSHA256:report.captureSHA256,capturedAt:report.capturedAt,rawFields:fields,fieldIds,xpath:xpath(el),htmlFragment:el.outerHTML,textSHA256:await sha(text(el))};events.push(event);report.detectors.push(...detectors);
 }
 if(!events.length)report.detectors.push({id:'DET-VOTE-NO-RECORDS',sourceURL:report.sourceURL});return events;
}
async function navigationIntelligence(doc,source,id,version){
 const base=new URL(source), findings=[], observations=[], jobs=new Map(), evidence=new Map();
 const workers={billNavClient:'BillNavigationWorker',billTextClient:'BillTextWorker',billVotesClient:'BillVotesWorker',billHistoryClient:'BillHistoryWorker',billAnalysisClient:'BillAnalysisWorker',billCompareClient:'BillCompareWorker',billVersionsCompareClient:'BillVersionCompareWorker',billStatusClient:'BillStatusWorker',billPdf:'BillPDFWorker',billSearchClient:'BillSearchWorker',codes:'CodeRootWorker',codesTOCSelected:'CodeTOCWorker',codedisplayexpand:'CodeExpandWorker',codes_displayexpandedbranch:'CodeBranchWorker',codes_displayText:'StatuteGroupWorker',codes_displaySection:'StatuteWorker',codeBillCrossRef:'CrossReferenceWorker',displayCodeAndBill:'StatuteCompareWorker',asAmendsTheBill:'AmendmentWorker'};
 const safeURL=raw=>{try{const u=new URL(raw,source);return u.protocol==='https:'&&u.origin==='https://leginfo.legislature.ca.gov'&&!u.username&&!u.password?u:null;}catch{return null;}};
 const addFinding=(code,detail)=>findings.push({id:code,...detail});
 const declared=base.searchParams.get('bill_id');if(id&&declared&&id!==declared)addFinding('DET-NAV-003',{idFromPage:id,idFromURL:declared});
 const opts=qa('#version option',doc).map(o=>({versionId:o.value,label:text(o)}));
 if(version&&opts.length&&!opts.some(o=>o.versionId===version))addFinding('DET-NAV-004',{version});
 for(const el of qa('a[href],input[type="submit"],button,select',doc)){
  const raw=el.getAttribute('href'),handler=el.getAttribute('onclick')||el.getAttribute('onchange')||'',form=el.closest('form'),elementId=el.id||null,label=text(el)||el.getAttribute('value')||el.getAttribute('title')||elementId||'',ordinal=observations.length+1;
  const jsf=handler.match(/mojarra\.jsfcljs\(document\.getElementById\(['"]([^'"]+)['"]\),\s*\{([^{}]*)\}/);
  const pairs=jsf?[...jsf[2].matchAll(/'([^'\\]+)'\s*:\s*'([^'\\]*)'/g)].map(m=>[m[1],m[2]]):[];
  const u=raw&&!raw.startsWith('#')?safeURL(raw):null, endpoint=u?.pathname.split('/').pop().replace(/\.xhtml$/,'')||null;
  let classification='REVIEW',method=null,worker=null;
  if(/favorit|myfavs|comment|login|logout|feedback|subscription/i.test((elementId||'')+' '+label+' '+handler)){classification='BLOCKED_INTERACTIVE';}
  else if(elementId==='version'){classification='VERSION_SELECTOR';}
  else if(elementId==='ddbill_version'&&jsf){classification='CONTROLLED_VERSION_POST';method='POST';worker='BillVersionWorker';}
  else if(/window\.print|history\.back|asAmendsPopup/.test(handler)){classification='LOCAL_BROWSER_ACTION';}
  else if(jsf&&jsf[1]==='billanalysisform'&&pairs.some(([k,v])=>k==='analysisId'&&/^\d+$/.test(v))){classification='CONTROLLED_ANALYSIS_POST';method='POST';worker='AnalysisDocumentWorker';}
  else if(jsf||/jsfcljs|jsf\.util\.chain/.test(handler)){classification='JSF_REVIEW';method='POST';}
  else if(u&&workers[endpoint]&&(!handler||/^\s*document\.body\.style\.cursor\s*=\s*['"]wait['"];?\s*$/.test(handler)||(/^downLoadPDF\(\);\s*return false;?\s*$/.test(handler)&&endpoint==='billPdf'))){classification='GET_CANDIDATE';method='GET';worker=workers[endpoint];}
  else if(raw?.startsWith('#'))classification='FRAGMENT';
  else if(raw?.startsWith('javascript:'))classification='JS_NAVIGATION_REVIEW';
  else if(raw&&!u)classification='EXTERNAL_OR_UNSUPPORTED';
  const params=u?[...u.searchParams.entries()]:[];
  const targetBill=u?.searchParams.get('bill_id');
  if(id&&((targetBill&&targetBill!==id)||pairs.some(([k,v])=>k==='bill_id'&&v!==id))){addFinding('DET-NAV-005',{ordinal,elementId,targetBill});classification='IDENTITY_CONFLICT';worker=null;}
  if(jsf&&!doc.getElementById(jsf[1]))addFinding('DET-JSF-008',{ordinal,formId:jsf[1]});
  if(jsf&&pairs.length===0)addFinding('DET-JSF-007',{ordinal});
  const row={observationId:'NAV:'+ordinal,elementId,label,rawHref:raw,handler:handler||null,xpath:xpath(el),classification,method,worker,endpoint,resolvedURL:u?.href||null,decodedParameters:params,formId:jsf?.[1]||form?.id||null,formAction:form?.getAttribute('action')||null,staticJSFParameters:pairs,verification:'CAPTURED_NOT_LIVE_TESTED'};observations.push(row);

  if(classification==='GET_CANDIDATE'&&u&&workers[endpoint]&&u.pathname.startsWith('/faces/')&&!(id&&declared&&id!==declared)){
   u.hash='';const key=u.href;let j=jobs.get(key);if(!j){j={jobId:'CA:JOB:'+await sha('GET\n'+key),worker,method:'GET',url:key,billId:targetBill||null,versionId:u.searchParams.get('version')||null,status:'DISCOVERED_NOT_EXECUTED',evidence:[]};jobs.set(key,j);}j.evidence.push(row.observationId);
  }
 }
 const versionTasks=opts.filter(o=>o.versionId!==version).map(o=>({worker:'BillVersionWorker',method:'POST',billId:id,targetVersionId:o.versionId,formId:'billDetailTopNavBarId',submitElementId:'ddbill_version',selectElementId:'version',status:'MANUAL_REVIEW_REQUIRED',autoExecute:false}));
 return {format:'CA-NAVIGATION-V11.15.0',billId:id,displayedVersion:version,sourceURL:source,observations,jobs:[...jobs.values()],versionTasks,findings,summary:{observations:observations.length,uniqueGETJobs:jobs.size,duplicateGETObservations:[...jobs.values()].reduce((n,j)=>n+j.evidence.length-1,0),versionTasks:versionTasks.length,findings:findings.length,classifications:observations.reduce((a,r)=>(a[r.classification]=(a[r.classification]||0)+1,a),{})}};
}

async function extractHistory(work,report,id,version){
 const events=[],findings=[],seen=new Map(),root=id?'CA:BILL:'+id:null,year=Number(String(id||'').slice(0,4));
 const dateOf=s=>{const m=s.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);if(!m)return null;const y=m[3].length===4?+m[3]:year?Math.floor(year/100)*100+ +m[3]:null;if(!y)return null;const d=`${y}-${m[1]}-${m[2]}`,t=new Date(d+'T00:00:00Z');return !isNaN(t)&&t.toISOString().slice(0,10)===d?d:null;};
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const headers=qa('#billhistory thead th',work).map(text);
 if(headers.join('|')!=='Date|Action')findings.push({id:'DET-HIST-001',headers});
 for(const [i,el] of qa('#billhistory tbody tr',work).entries()){
  const cells=Array.from(el.cells),dateRaw=cells[0]?.textContent.trim()??'',actionRaw=cells[1]?.textContent.trim()??'',date=dateOf(dateRaw),actionNormalized=norm(actionRaw),key=await sha(JSON.stringify([dateRaw,actionNormalized])),canonicalBase=(root||'CA:UNRESOLVED:BILL')+':HISTORY:'+key,duplicate=seen.has(key),canonicalId=duplicate?canonicalBase+':OBS:'+(i+1):canonicalBase;seen.set(key,true);
  const flag=(id,detail={})=>findings.push({id,canonicalId,...detail});if(cells.length!==2||!actionRaw)flag('DET-HIST-001');if(!date)flag('DET-HIST-003');if(duplicate)flag('DET-HIST-002');if(date&&events.at(-1)?.date&&date>events.at(-1).date)flag('DET-HIST-004');
  const num=re=>{const m=actionNormalized.match(re);return m?Number(m[1]):null;},ayes=num(/\bAyes\s+(\d+)/i),noes=num(/\bNoes\s+(\d+)/i),journalPage=num(/\bPage\s+(\d+)/i);
  const dm=actionNormalized.match(/\((January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\)\.?/i);let reportedVoteDate=null;if(dm&&date&&(ayes!==null||noes!==null)){const month=months.findIndex(x=>x.toLowerCase()===dm[1].toLowerCase())+1;reportedVoteDate=dateOf(`${String(month).padStart(2,'0')}/${dm[2].padStart(2,'0')}/${date.slice(0,4)}`);}
  const tags=[];for(const [tag,re] of Object.entries({CHAPTERED:/^Chaptered/i,APPROVED:/Approved by the Governor/i,ENROLLED:/Enrolled and presented/i,CONCURRENCE:/concurred in/i,AMENDED:/author's amendments|and amended/i,COMMITTEE:/committee|\bCom\./i,READING:/Read (first|second|third) time/i,PASSED:/\bPassed\b|Do pass/i,INTRODUCED:/^Introduced/i,HEARING:/Set for hearing/i,PRINT:/printer|To print/i}))if(re.test(actionNormalized))tags.push(tag);
  const versionCandidates=qa('#version option',work).filter(o=>dateOf(text(o).split(' - ')[0])===date).map(o=>({versionId:o.value,label:text(o),verification:'DATE_MATCH_CANDIDATE_ONLY'}));
  events.push({canonicalId,parentId:root,entityType:'BILL_HISTORY_EVENT',sourceOrder:i+1,dateRaw,date,actionRaw,actionNormalized,reportedVoteDate,voteDateCandidate:ayes!==null&&noes!==null?(reportedVoteDate||date):null,ayes,noes,journalPage,tags,versionCandidates,displayedVersion:version,versionAtEvent:null,sourceSelector:`#billhistory tbody tr:nth-child(${i+1})`,xpath:xpath(el),sourceURL:report.sourceURL,captureSHA256:report.captureSHA256,capturedAt:report.capturedAt,verification:'CAPTURED_HISTORY_NOT_LIVE_VERIFIED'});
 }
 if(!events.length)findings.push({id:'DET-HIST-NO-RECORDS'});if(!id)findings.push({id:'DET-HIST-BILL-UNRESOLVED'});
 return {events,findings,summary:{events:events.length,uniqueIdentities:seen.size,distinctDates:new Set(events.map(e=>e.date).filter(Boolean)).size,explicitVoteCounts:events.filter(e=>e.ayes!==null&&e.noes!==null).length,journalReferences:events.filter(e=>e.journalPage!==null).length,findings:findings.length}};
}


async function extractAnalysis(work,report,id,version){
 const records=[],jobs=[],findings=[],seen=new Set();
 const form=q('#billanalysisform',work), source=new URL(report.sourceURL), root=id?'CA:BILL:'+id:null;
 let endpoint=null;try{const u=new URL(form?.getAttribute('action')||'',source);if(u.origin==='https://leginfo.legislature.ca.gov'&&u.pathname==='/faces/billAnalysisClient.xhtml'&&form?.method.toLowerCase()==='post')endpoint=u.href;}catch{}
 for(const [i,row] of qa('#billanalysis tbody tr',work).entries()){
  const a=q('a',row), rawOnclick=a?.getAttribute('onclick')||'', labelRaw=text(a), m=rawOnclick.match(/^\s*mojarra\.jsfcljs\(document\.getElementById\('([^']+)'\),\{([^{}]*)\},''\);\s*return false\s*;?\s*$/), pairs=m?[...m[2].matchAll(/'([^'\\]+)'\s*:\s*'([^'\\]*)'/g)].map(x=>[x[1],x[2]]):[], params=Object.fromEntries(pairs);
  const analysisId=params.analysisId||null, base=(root||'CA:UNRESOLVED:BILL')+':ANALYSIS:'+(analysisId||'UNKNOWN'), duplicate=seen.has(base), canonicalId=duplicate?base+':OBS:'+(i+1):base; seen.add(base);
  const local=[];const flag=(code,detail={})=>local.push({id:code,canonicalId,...detail});
  const label=labelRaw.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})\s*-\s*(.+)$/), session=Number(String(id||'').slice(0,4));let date=null;
  if(label&&(label[3].length===4||session)){const year=label[3].length===4?+label[3]:Math.floor(session/100)*100+ +label[3],d=`${year}-${label[1]}-${label[2]}`,dt=new Date(d+'T00:00:00Z');if(!isNaN(dt)&&dt.toISOString().slice(0,10)===d)date=d;}
  if(!/^\d+$/.test(analysisId||''))flag('DET-ANL-001');if(duplicate)flag('DET-ANL-002');if(!id||params.bill_id!==id||(source.searchParams.has('bill_id')&&source.searchParams.get('bill_id')!==id))flag('DET-ANL-003');if(!label||norm(label[4])!==norm(params.analyzingOffice))flag('DET-ANL-004');
  const components=pairs.filter(([k,v])=>/^billanalysis:\d+:[\w]+$/.test(k)&&k===v);if(!m||m[1]!=='billanalysisform'||!endpoint||components.length!==1||pairs.length!==5||new Set(pairs.map(x=>x[0])).size!==5||!params.version||!params.analyzingOffice)flag('DET-ANL-005');if(!date)flag('DET-ANL-DATE-001');
  const retrievalVersion=params.version||null, option=qa('#version option',work).find(o=>o.value===retrievalVersion), versionLabel=text(option), vm=versionLabel.match(/^(\d{2})\/(\d{2})\/(\d{2})/), versionDate=vm&&session?`${Math.floor(session/100)*100+ +vm[3]}-${vm[1]}-${vm[2]}`:null;
  const temporalWarnings=[];if(date&&versionDate&&date<versionDate)temporalWarnings.push({id:'DET-ANL-006',canonicalId,date,retrievalVersionDate:versionDate,meaning:'RETRIEVAL_VERSION_IS_NOT_VERSION_ANALYZED'});
  const record={canonicalId,parentId:root,entityType:'ANALYSIS_DOCUMENT_REFERENCE',analysisId,labelRaw,date,analyzingOffice:params.analyzingOffice||null,retrievalVersion,displayedVersion:version,versionAnalyzed:null,documentURL:null,documentText:null,sourceOrder:i+1,selector:`#billanalysis tbody tr:nth-child(${i+1}) a`,xpath:a?xpath(a):null,rawHref:a?.getAttribute('href')??null,rawOnclick,navigation:{method:'POST',formId:m?.[1]||null,actionURL:endpoint,parameters:params,executionStatus:'REVIEW_REQUIRED_NOT_EXECUTED'},sourceURL:report.sourceURL,captureSHA256:report.captureSHA256,capturedAt:report.capturedAt,temporalWarnings,findings:local,verification:'DOCUMENT_REFERENCE_ONLY'};
  records.push(record);findings.push(...local,...temporalWarnings);
  if(!local.length)jobs.push({jobId:'CA:JOB:'+await sha(JSON.stringify(['ANALYSIS',id,analysisId,retrievalVersion])),worker:'AnalysisDocumentWorker',method:'POST',billId:id,analysisId,retrievalVersion,formId:'billanalysisform',actionURL:endpoint,parameters:params,sourceSelector:record.selector,sourceId:canonicalId,status:'MANUAL_REVIEW_REQUIRED',autoExecute:false,requiresFreshFormState:true});
 }
 if(!records.length)findings.push({id:'DET-ANL-NO-RECORDS'});
 return {records,jobs,findings,summary:{records:records.length,uniqueIdentities:seen.size,offices:new Set(records.map(r=>r.analyzingOffice).filter(Boolean)).size,jobs:jobs.length,structuralFindings:findings.filter(f=>f.id!=='DET-ANL-006').length,temporalWarnings:findings.filter(f=>f.id==='DET-ANL-006').length,documentsRetrieved:0}};
}


async function extractComparison(work,report,id,version){
 const records=[],findings=[],jobs=[],seen=new Set(),u=new URL(report.sourceURL),mode=u.searchParams.get('showamends'),form=q('#billcompareform',work),root='CA:BILL:'+(id||'UNKNOWN')+':COMPARISON:'+(version||'UNKNOWN')+':MODE:'+(mode??'UNKNOWN');
 const selector='font[color="red"],font[color="blue"],.deltaxml-old,.deltaxml-new,strike';
 const side=e=>{const old=e.matches('font[color="red"],.deltaxml-old,strike'),newer=e.matches('font[color="blue"],.deltaxml-new');return old&&newer?'CONFLICT':old?'OLD':newer?'NEW':null;};
 if(!id||!version||!['true','false'].includes(mode))findings.push({id:'DET-CMP-009',mode,billId:id,version});
 if(u.searchParams.has('bill_id')&&u.searchParams.get('bill_id')!==id)findings.push({id:'DET-CMP-006'});
 for(const [i,el] of qa('#bill_all > div[id]',work).entries()){
  const heading=text(el.firstElementChild),m=heading.match(/^(?:SECTION|SEC\.)\s*(\d+)\./i),n=m?.[1]||null,base=root+':SECTION:'+(n||'UNKNOWN'),duplicate=seen.has(base),canonicalId=duplicate?base+':OBS:'+(i+1):base;seen.add(base);
  if(!n)findings.push({id:'DET-CMP-001',canonicalId});if(duplicate)findings.push({id:'DET-CMP-002',canonicalId});
  const markupObservations=qa(selector,el).map(e=>({tag:e.localName,color:e.getAttribute('color'),classes:[...e.classList],text:text(e),side:side(e),nested:!!e.parentElement.closest(selector),xpath:xpath(e)}));
  const walker=work.createTreeWalker(el,4),segments=[];let node;while(node=walker.nextNode()){let sides=new Set(),parent=node.parentElement;while(parent&&parent!==el){const k=side(parent);if(k)sides.add(k);parent=parent.parentElement;}const classification=sides.has('CONFLICT')||sides.size>1?'CONFLICT':sides.size?[...sides][0]:'UNMARKED';segments.push({classification,text:node.nodeValue});}
  const conflicts=segments.filter(x=>x.classification==='CONFLICT').length;if(conflicts)findings.push({id:'DET-CMP-004',canonicalId,conflicts});
  const comparisonText=text(el),oldSideCandidate=segments.filter(x=>['OLD','UNMARKED'].includes(x.classification)).map(x=>x.text).join(''),newSideCandidate=segments.filter(x=>['NEW','UNMARKED'].includes(x.classification)).map(x=>x.text).join('');
  records.push({canonicalId,parentId:root,entityType:'COMPARISON_SECTION',billId:id,displayedVersion:version,comparisonMode:mode,baselineDate:null,sourceOrder:i+1,billSection:n,sourceElementId:el.id,heading,affectedStatute:targetFrom(heading),comparisonText,htmlFragment:el.outerHTML,markupObservations,segments,oldSideCandidate,newSideCandidate,textSHA256:await sha(comparisonText),sourceURL:report.sourceURL,captureSHA256:report.captureSHA256,capturedAt:report.capturedAt,xpath:xpath(el),verification:'COMPARISON_MARKUP_CAPTURED_SIDE_CANDIDATES_NOT_VERIFIED'});
 }
 if(!records.length)findings.push({id:'DET-CMP-NO-RECORDS'});
 const controls=qa('#billcompareform [onclick]',work).filter(e=>/submitAsAmendsAction[12]\(\)/.test(e.getAttribute('onclick')||''));
 for(const e of controls){const rawOnclick=e.getAttribute('onclick'),targetMode=rawOnclick.includes('submitAsAmendsAction1()')?'true':'false';if(!id||!form||u.origin!=='https://leginfo.legislature.ca.gov'||u.pathname!=='/faces/billCompareClient.xhtml')continue;const dest=new URL('/faces/billCompareClient.xhtml',u);dest.searchParams.set('bill_id',id);dest.searchParams.set('showamends',targetMode);jobs.push({jobId:'CA:JOB:'+await sha(JSON.stringify([id,version,targetMode])),worker:'BillCompareWorker',method:'POST',actionURL:dest.href,billId:id,displayedVersion:version,comparisonMode:targetMode,label:text(e),rawOnclick,formId:form.id,sourceXPath:xpath(e),autoExecute:false,requiresFreshFormState:true,status:'MANUAL_REVIEW_REQUIRED'});}
 return {records,jobs,findings,mode,summary:{records:records.length,uniqueIdentities:new Set(records.map(x=>x.canonicalId)).size,markupObservations:records.reduce((n,r)=>n+r.markupObservations.length,0),markedSections:records.filter(r=>r.markupObservations.length).length,conflictingSegments:records.reduce((n,r)=>n+r.segments.filter(s=>s.classification==='CONFLICT').length,0),jobs:jobs.length,findings:findings.length}};
}


async function extractVersionCompare(work,report,id,version){
 const u=new URL(report.sourceURL),form=q('#myForm',work),targetSelect=q('#selectedversion',work),oid=q('#bill_oid',work)?.value,control=q('#compareversions',work),findings=[],records=[],jobs=[];
 const versions=qa('#version option',work).map(o=>({versionId:o.value,label:text(o)})).reverse();
 const options=qa('#selectedversion option',work).map(o=>({versionId:o.value,label:text(o)}));
 const rawTarget=u.searchParams.get('cversion'),target=rawTarget&&options.some(o=>o.versionId===rawTarget)?rawTarget:null;
 const valid=!!id&&id===oid&&u.origin==='https://leginfo.legislature.ca.gov'&&u.pathname==='/faces/billVersionsCompareClient.xhtml'&&(!u.searchParams.has('bill_id')||u.searchParams.get('bill_id')===id)&&versions.some(o=>o.versionId===version);
 if(!valid)findings.push({id:'DET-VER-004',severity:'ERROR'});
 if(!target)findings.push({id:'DET-VER-002',severity:'REVIEW',reason:'No verified comparison target; selector default is not evidence of submission'});
 if(target===version)findings.push({id:'DET-VER-003',severity:'REVIEW'});
 const root='CA:BILL:'+(id||'UNKNOWN')+':VERSION_COMPARE_CAPTURE:'+(version||'UNKNOWN')+':TARGET:'+(target||'UNRESOLVED')+':CAPTURE:'+report.captureSHA256;
 const selector='font[color="red"],font[color="blue"],.deltaxml-old,.deltaxml-new,strike';
 for(const [i,e] of qa('#bill > div[id]',work).entries()){
  const w=work.createTreeWalker(e,4),parts=[];let node;while(node=w.nextNode()){if(node.nodeValue.trim())parts.push(node.nodeValue.trim());}const t=parts.join(' ').replace(/\s+/g,' ').trim(),n=t.match(/^(?:SECTION|SEC\.)\s*(\d+)\./i)?.[1]||null,heading=text(q('.ActionLine',e)),markupObservations=qa(selector,e).map(x=>({tag:x.localName,classes:[...x.classList],color:x.getAttribute('color'),text:text(x),xpath:xpath(x)}));
  records.push({canonicalId:root+':SECTION_OBSERVATION:'+(i+1),parentId:root,entityType:'VERSION_COMPARE_CAPTURE',billId:id,displayedVersion:version,requestedComparisonVersion:target,comparisonVersion:null,documentOrder:i+1,billSection:n,sourceElementId:e.id,heading,affectedStatute:targetFrom(heading),text:t,textSHA256:await sha(t),htmlFragment:e.outerHTML,markupObservations,xpath:xpath(e),sourceURL:report.sourceURL,captureSHA256:report.captureSHA256,capturedAt:report.capturedAt,verification:'CAPTURED_TEXT_PAIR_NOT_VERIFIED'});
 }
 if(!records.length)findings.push({id:'DET-VER-006',severity:'REVIEW',reason:'No recognized section containers'});
 const matrix=versions.flatMap(a=>versions.filter(b=>b.versionId!==a.versionId).map(b=>({primaryVersion:a.versionId,targetVersion:b.versionId,status:'POTENTIAL_PAIR_NOT_EXECUTED'})));
 const lineage=versions.slice(1).map((v,i)=>({earlierVersion:versions[i].versionId,laterVersion:v.versionId,relationship:'DISPLAY_ORDER_CANDIDATE'}));
 if(valid&&form&&targetSelect&&control&&/submitcver\(\)/.test(control.getAttribute('onclick')||''))for(const o of options.filter(x=>x.versionId!==version&&versions.some(v=>v.versionId===x.versionId))){const dest=new URL('/faces/billVersionsCompareClient.xhtml',u);dest.searchParams.set('bill_id',id);dest.searchParams.set('cversion',o.versionId);jobs.push({jobId:'CA:JOB:'+await sha(JSON.stringify(['VERSION_COMPARE',id,version,o.versionId])),worker:'BillVersionCompareWorker',method:'POST',actionURL:dest.href,billId:id,primaryVersion:version,targetVersion:o.versionId,formId:form.id,selector:'#selectedversion',submitSelector:'#compareversions',requiresFreshFormState:true,autoExecute:false,status:'MANUAL_REVIEW_REQUIRED'});}
 return {records,findings,jobs,versions,matrix,lineage,requestedComparisonVersion:target,comparisonVersion:null,summary:{records:records.length,uniqueIdentities:new Set(records.map(r=>r.canonicalId)).size,versions:versions.length,directionalPairs:matrix.length,adjacentPairs:lineage.length,jobs:jobs.length,markupObservations:records.reduce((a,r)=>a+r.markupObservations.length,0),findings:findings.length,verifiedPairs:0}};
}


async function extractStatus(work,report,id,version){
 const root='CA:BILL:'+(id||'UNKNOWN'),capture=root+':STATUS:CAPTURE:'+report.captureSHA256,findings=[],fields=[],flags=[],recentHistory=[];
 const u=new URL(report.sourceURL);if(!id||(u.searchParams.has('bill_id')&&u.searchParams.get('bill_id')!==id))findings.push({id:'DET-STATUS-003',severity:'ERROR'});
 for(const [i,e] of qa('#billdiv .statusRow',work).entries()){
  const l=q('.statusCell label',e),v=q('.statusCellData',e),key=l?.getAttribute('for')||e.id||'ROW:'+i;
  fields.push({key,label:text(l),value:text(v),xpath:xpath(e),htmlFragment:e.outerHTML});if(!l||!v)findings.push({id:'DET-STATUS-001',key});
 }
 if(!fields.length)findings.push({id:'DET-STATUS-001',reason:'No status rows'});
 if(new Set(fields.map(x=>x.key)).size!==fields.length)findings.push({id:'DET-STATUS-002'});
 for(const e of qa('#flags tbody td',work))flags.push({label:text(e),xpath:xpath(e)});
 for(const e of qa('#billhistory tbody tr',work)){const c=qa('td',e);if(c.length===2)recentHistory.push({dateRaw:text(c[0]),action:text(c[1]),xpath:xpath(e),verification:'STATUS_HISTORY_OBSERVATION'});}
 const get=k=>fields.find(x=>x.key===k)?.value??null;
 const desktop=[],mobile=[];
 for(const [name,out] of [['desktop',desktop],['mobile',mobile]])for(const [i,e] of qa('#status_'+name+'_div .status-wrap > div',work).entries()){
  const cls=[...e.classList].find(c=>/^status-line/.test(c))||null,chamber=/^(status-line2?)-sen$/.test(cls)?'SENATE':/^(status-line2?)-other$/.test(cls)?'OTHER':/^status-line2?$/.test(cls)?'ASSEMBLY':'UNKNOWN';
  out.push({observationId:capture+':'+name.toUpperCase()+':'+(i+1),order:i+1,labelRaw:text(e),cssClass:cls,chamber,xpath:xpath(e),htmlFragment:e.outerHTML});
 }
 const signature=a=>a.map(x=>[x.labelRaw,x.chamber]);const match=desktop.length>0&&JSON.stringify(signature(desktop))===JSON.stringify(signature(mobile));
 if(!match)findings.push({id:'DET-STATUS-011',severity:'REVIEW',reason:'Responsive sequences absent or unequal'});
 const stages=match?desktop.map((x,i)=>({canonicalId:capture+':STAGE:'+(i+1),parentId:capture,entityType:'LEGISLATIVE_LIFECYCLE_STAGE',documentOrder:i+1,labelRaw:x.labelRaw,chamber:x.chamber,stage:({'1st':'FIRST_READING','Cmt':'COMMITTEE','2nd':'SECOND_READING','3rd':'THIRD_READING','Pass':'PASS','Chp':'CHAPTERED'})[x.labelRaw]||null,eventDateRaw:x.labelRaw==='Chp'&&fields.find(f=>f.key==='lastAction')?.label==='Chaptered Date:'?get('lastAction'):null,observationIds:[x.observationId,mobile[i].observationId],verification:'DISPLAY_SEQUENCE_INTERPRETATION'})):[];
 const css=qa('style',work).flatMap(e=>[...e.textContent.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>m[1].includes('.status-')).map(m=>({selector:m[1].trim(),declarations:m[2].trim()})));
 const conditions=[],walker=work.createTreeWalker(work.documentElement,128);let n;while(n=walker.nextNode())if(/displays ONLY when/i.test(n.nodeValue))conditions.push({text:n.nodeValue.trim(),verification:'SOURCE_COMMENT_NOT_SERVER_RULE'});
 const titleMatch=!!q('#title',work)&&!!q('#statusTitle',work)&&text(q('#title',work))===text(q('#statusTitle',work));if(!titleMatch)findings.push({id:'DET-STATUS-007',severity:'REVIEW'});
 const lifecycle={displayedVersion:version,statusRaw:flags.find(x=>/Bill\s*-/i.test(x.label))?.label??null,lastActionLabel:fields.find(x=>x.key==='lastAction')?.label??null,lastActionDateRaw:get('lastAction'),lastAmendedDateRaw:get('lastAmendChpEnr'),houseLocation:get('houseLoc')};
 const record={canonicalId:capture,parentId:root,entityType:'LEGISLATIVE_STATUS_CAPTURE',billId:id,sourceURL:report.sourceURL,captureSHA256:report.captureSHA256,capturedAt:report.capturedAt,fields,flags,recentHistory,lifecycle,authors:{lead:get('leadAuthors'),principal:get('principalAuthors'),coauthors:get('coAuthors')},scope:{title:get('title'),verification:'TITLE_ONLY_SCOPE_NOT_RECONCILED'},desktop,mobile,stages,css,conditions,reconciliation:{responsiveMatch:match,titleMatch,history:'CROSS_CAPTURE_RECONCILIATION_REQUIRED',votes:'CROSS_CAPTURE_RECONCILIATION_REQUIRED'},findings};
 return {...record,summary:{fields:fields.length,flags:flags.length,recentHistory:recentHistory.length,desktop:desktop.length,mobile:mobile.length,stages:stages.length,cssRules:css.length,conditions:conditions.length,findings:findings.length,responsiveMatch:match,titleMatch}};
}


async function extractCoreChain(work,report,u){
 const page=report.pageType, records=[],jobs=[],findings=[];
 const selectors={'codes_displaySection.xhtml':'#codeLawSectionNoHead','codeBillCrossRef.xhtml':'#code_bill_crossref','displayCodeAndBill.xhtml':'#code_section_display_code_and_bill','asAmendsTheBill.xhtml':'#code_sec_as_amends_the_bill'};
 const root=q(selectors[page]||'#ca-nonexistent',work);
 const section=text(root?.querySelector('h6')).replace(/\.$/,'')||u.searchParams.get('sectionNum')?.replace(/\.$/,'')||null;
 const code=report.code||text(root?.querySelector('h4')).match(/ - ([A-Z]{2,4})/)?.[1]||null;
 const parent=code&&section?`CA:CODE:${code}:SECTION:${section}`:null;
 const capture=async(el,kind,t,extra={})=>{if(!el)return;records.push({canonicalId:`${parent||'CA:UNRESOLVED'}:CAPTURE:${report.captureSHA256}:${kind}:${records.length+1}`,parentId:parent,entityType:kind,textExact:t,textSHA256:await sha(t),htmlFragment:el.outerHTML,xpath:xpath(el),sourceURL:report.sourceURL,captureSHA256:report.captureSHA256,...extra});};
 if(root){let h=root.querySelector('h6');let container=h?.closest('font')||h?.parentElement;let paras=container?qa('p',container).filter(x=>!x.querySelector('p')):[];let note=text(container?.querySelector('i'));let copy=container?.cloneNode(true);if(copy){qa('h6,i',copy).forEach(x=>x.remove());}let t=norm(copy?.textContent);await capture(root,'STATUTE_SIDE',t,{section,code,legislativeNote:note,effectiveDateRaw:note.match(/Effective ([^.]+)/i)?.[1]||null,operativeDateRaw:note.match(/Operative ([^,]+,\s*\d{4})/i)?.[1]||null});if(!parent||!t)findings.push({id:'DET-CHAIN-001',message:'Missing statutory identity or text'});}
 const allowed={crossRef:'codeBillCrossRef.xhtml',displayCRSection:'displayCodeAndBill.xhtml',displayAsAmend:'asAmendsTheBill.xhtml'};
 for(const a of qa('[onclick]',work)){const raw=a.getAttribute('onclick');const m=raw.match(/mojarra\.jsfcljs\(document\.getElementById\('([^']+)'\),\{([^}]+)\},''\)/);if(!m)continue;const pairs=[...m[2].matchAll(/'([^']+)':'([^']*)'/g)];if(pairs.map(x=>x[0]).join(',')!==m[2])continue;const params=Object.fromEntries(pairs.map(x=>[x[1],x[2]]));const action=Object.keys(params).find(k=>Object.keys(allowed).includes(k.split(':').at(-1)));if(!action)continue;const form=work.getElementById(m[1]);if(!form||!parent||params.lawCode&&params.lawCode!==code||params.sectionNum&&params.sectionNum.replace(/\.$/,'')!==section){findings.push({id:'DET-CHAIN-002',message:'Unresolved or mismatched action identity'});continue;}const key=action.split(':').at(-1);jobs.push({jobId:'CA:JOB:'+await sha(JSON.stringify([report.sourceURL,m[1],params])),parentId:parent,worker:'StatuteChainWorker',method:'POST',sourceURL:report.sourceURL,expectedEndpoint:allowed[key],formId:m[1],parameters:params,autoExecute:false,requiresFreshFormState:true,status:'MANUAL_REVIEW_REQUIRED'});if(key==='displayCRSection')await capture(a,'LEGISLATIVE_CROSS_REFERENCE',text(a),{parameters:params,billVersionSectionId:params.billVersionSectionId||null});}
 const bill=q('#billsectionxsl',work);if(bill){const h=bill.querySelector('h6');let t=h?norm(text(h.parentElement).slice(text(h).length)):'';await capture(bill,'BILL_SECTION_FRAGMENT',t,{actionLine:text(bill.querySelector('.ActionLine')),scope:'CAPTURED_FRAGMENT_NOT_FULL_BILL_SECTION'});}
 const amended=q('#code_sec_as_amends_the_bill2',work);if(amended)await capture(amended,'LAW_AS_AMENDED_FRAGMENT',text(amended),{baselineDate:null});
 const sides=records.filter(x=>['STATUTE_SIDE','BILL_SECTION_FRAGMENT','LAW_AS_AMENDED_FRAGMENT'].includes(x.entityType));
 return {records,jobs,findings,summary:{records:records.length,jobs:jobs.length,textMatch:sides.length>1?sides.every(x=>x.textExact&&x.textExact===sides[0].textExact):null}};
}

async function extract(doc=document,source=location.href){let started=performance.now();let clone=doc.documentElement.cloneNode(true);clone.querySelector('#ca-registry-v10')?.remove();clone.querySelector('#ca-v8-command-panel')?.remove();let html='<!DOCTYPE html>\n'+clone.outerHTML;let work=new DOMParser().parseFromString(html,'text/html');let code=codeOf(work,source),nav=links(work,source,code),u=new URL(source),id=q('#bid',work)?.value||u.searchParams.get('bill_id'),version=q('#vid',work)?.value||u.searchParams.get('version')||null;let page=u.pathname.split('/').pop();let report={format:'CA-LEGISLATIVE-V10',sourceURL:source,capturedAt:new Date().toISOString(),captureKind:'SERIALIZED_DOM',captureSHA256:await sha(html),pageType:page,code,links:nav,statutoryRecords:[],bill:null,detectors:[],html};
if(id){let root='CA:BILL:'+id,vr=root+':VERSION:'+(version||'UNKNOWN');let b={canonicalId:root,versionId:version,versionCanonicalId:vr,sourceURL:source,title:text(q('#title',work))||work.title,chapter:text(q('#chap_num_title_chap',work)),digest:text(q('#digesttext',work)),versions:qa('#version option',work).map(o=>({versionId:o.value,label:text(o),candidateURL:url('billTextClient.xhtml',{bill_id:id,bill_version:o.value}),verification:'DERIVED_NOT_LIVE_VERIFIED'})),navigation:nav.filter(x=>x.resolvedURL&&/bill(?:Text|Votes|History|Analysis|Compare|VersionsCompare|Status|Pdf|Nav)Client?\.xhtml|billPdf\.xhtml/.test(x.resolvedURL)),sections:[]};
for(let el of (['billNavClient.xhtml','billTextClient.xhtml'].includes(page)?qa('#bill > div[id]',work):[])){let action=text(q('.ActionLine',el)),all=text(el),m=all.match(/^(?:SECTION|SEC\.)\s*(\d+)\./i);if(!m){report.detectors.push({id:'BILL_SECTION_UNRESOLVED',xpath:xpath(el)});continue;}let n=m[1],canonicalId=vr+':SECTION:'+n,target=targetFrom(action);let operation=action.match(/\bis (amended and renumbered|repealed and added|amended|added|repealed)\b/i)?.[1]?.toUpperCase()||'OTHER';let r={canonicalId,parentId:vr,billSection:n,documentOrder:b.sections.length+1,actionLine:action,operation,affectedStatute:target,subdivisions:subdivisions(qa('div[style*="margin:0 0 1em"], p',el).filter(x=>!x.matches('.ActionLine')&&!x.querySelector('div,p')&&text(x)).map(x=>({text:text(x).replace(target?new RegExp('^'+target.section.replace(/\./g,'\\.')+'\\.\\s*'):/^$^/,''),xpath:xpath(x),indent:x.style.marginLeft.endsWith("em")?parseFloat(x.style.marginLeft):x.style.marginLeft?null:0})),canonicalId),textExact:all,htmlFragment:el.outerHTML,xpath:xpath(el),textSHA256:await sha(all),verification:'CAPTURED_BILL_VERSION_NOT_CURRENT_LAW'};if(action&&!target)report.detectors.push({id:'AMENDMENT_TARGET_REVIEW',canonicalId,action});b.sections.push(r);}report.bill=b;if(page==='billVotesClient.xhtml'){b.votes=await extractVotes(work,report,id,version);b.voteSummary={events:b.votes.length,observations:b.votes.reduce((n,e)=>n+e.observations.length,0),checksPassed:b.votes.reduce((n,e)=>n+Object.values(e.checks).filter(Boolean).length,0),detectors:b.votes.reduce((n,e)=>n+e.detectors.length,0)};}}
let groups=qa('#manylawsections h6 a',work);let single=q('#codeLawSectionNoHead h6',work);let entries=['codes_displayText.xhtml','codes_displaySection.xhtml'].includes(page)?(groups.length?groups:single?[single]:[]):[];for(let a of entries){let h=a.closest('h6')||a,section=text(a).replace(/\.$/,'');if(!code||!section)continue;let el=groups.length?h.parentElement.closest('div'):h.closest('font')||h.parentElement;let paras=qa('p',el).filter(p=>text(p)&&!p.querySelector('p,h6')&&!p.matches('[style*="font-size:0.9em"]')).map(p=>({text:text(p),xpath:xpath(p),indent:p.style.marginLeft.endsWith("em")?parseFloat(p.style.marginLeft):p.style.marginLeft?null:0}));let root=`CA:CODE:${code}:SECTION:${section}`;let heading=text(q('#manylawsections h5',work)),ancestry=qa('#codeLawSectionNoHead h4',work).map(text).filter(Boolean);let r={canonicalId:root,section,sourceHeading:heading||ancestry.at(-1)||null,sourceURL:source,sectionURL:secURL(code,section),rawHref:a.getAttribute('href'),navigation:decode(a.getAttribute('href'),code),hierarchy:{jurisdiction:'US-CA',code,heading,observedHeadings:ancestry},xpath:xpath(el),headingXPath:xpath(h),paragraphs:paras.map(p=>p.text),legislativeNote:text(q('p[style*="font-size:0.9em"], font > i',el)),subdivisions:subdivisions(paras,root),captureSHA256:report.captureSHA256,capturedAt:report.capturedAt,verification:/^(codes_displayText|codes_displaySection)\.xhtml$/.test(page)?'CAPTURED_NOT_LIVE_VERIFIED':'CONTEXT_REVIEW_NOT_CURRENT_LAW'};r.textSHA256=await sha(r.paragraphs.join('\n'));report.statutoryRecords.push(r);}
if(page==='billHistoryClient.xhtml'){report.history=await extractHistory(work,report,id,version);if(report.bill){report.bill.history=report.history.events;report.bill.historySummary=report.history.summary;}report.detectors.push(...report.history.findings);}
if(page==='billAnalysisClient.xhtml'){report.analysis=await extractAnalysis(work,report,id,version);if(report.bill){report.bill.analysis=report.analysis.records;report.bill.analysisSummary=report.analysis.summary;}report.detectors.push(...report.analysis.findings);}
if(page==='billCompareClient.xhtml'){report.comparison=await extractComparison(work,report,id,version);report.detectors.push(...report.comparison.findings);}
if(page==='billVersionsCompareClient.xhtml'){report.versionComparison=await extractVersionCompare(work,report,id,version);report.detectors.push(...report.versionComparison.findings);}
if(page==='billStatusClient.xhtml'){report.status=await extractStatus(work,report,id,version);report.detectors.push(...report.status.findings);}
report.navigationIntelligence=await navigationIntelligence(work,source,id,version);
if(report.versionComparison)report.navigationIntelligence.versionComparisonTasks=report.versionComparison.jobs;
if(report.comparison)report.navigationIntelligence.comparisonTasks=report.comparison.jobs;
if(report.analysis){report.navigationIntelligence.analysisTasks=report.analysis.jobs;report.navigationIntelligence.summary.analysisTasks=report.analysis.jobs.length;}
const corePages=/\/(codes|codesTOCSelected|codedisplayexpand|codes_displayexpandedbranch|codes_displayText|codes_displaySection|codeBillCrossRef|displayCodeAndBill|asAmendsTheBill|billNavClient|billTextClient|billCompareClient)\.xhtml$/;
const coreURL=raw=>{try{const v=new URL(raw,source);return v.origin==='https://leginfo.legislature.ca.gov'&&corePages.test(v.pathname)&&!v.username&&!v.password?v.href:null;}catch{return null;}};
report.focused={scope:'STATUTE_CROSS_REFERENCE_BILL_SECTIONS_LAW_AMENDS',crossReferenceLinks:nav.filter(x=>x.resolvedURL&&/\/(codeBillCrossRef|displayCodeAndBill|asAmendsTheBill)\.xhtml(?:\?|$)/.test(x.resolvedURL)),observedCoreLinks:nav.filter(x=>x.resolvedURL&&coreURL(x.resolvedURL)),findings:[]};
if(['codeBillCrossRef.xhtml','displayCodeAndBill.xhtml','asAmendsTheBill.xhtml'].includes(page)){const body=q('#content_main',work)||q('#centercolumn',work);report.focused.endpointEvidence={entityType:'CROSS_REFERENCE_ENDPOINT_CAPTURE',page,sourceURL:source,code,section:u.searchParams.get('sectionNum'),parameters:[...u.searchParams],textExact:body?text(body):null,xpath:body?xpath(body):null,verification:'GENERIC_CAPTURE_SPECIALIZED_PARSER_PENDING'};}
const seenJobs=new Set(report.navigationIntelligence.jobs.map(j=>j.url));
for(const candidate of [...report.statutoryRecords.map(r=>({url:r.sectionURL,worker:'StatuteWorker',id:r.canonicalId})),...(report.bill?.sections||[]).filter(r=>r.affectedStatute?.sectionURL).map(r=>({url:r.affectedStatute.sectionURL,worker:'StatuteWorker',id:r.canonicalId}))]){const v=coreURL(candidate.url);if(!v||seenJobs.has(v)||code==='CONS'&&candidate.url.includes('lawCode=CONS'))continue;seenJobs.add(v);report.navigationIntelligence.jobs.push({jobId:'CA:JOB:'+await sha('GET\n'+v),worker:candidate.worker,method:'GET',url:v,status:'DERIVED_REVIEW_REQUIRED',autoExecute:false,evidence:[candidate.id]});}
report.navigationIntelligence.jobs.forEach(j=>{j.priority=coreURL(j.url)?'CORE':'STANDARD';});
report.navigationIntelligence.summary.focusedJobs=report.navigationIntelligence.jobs.filter(j=>j.priority==='CORE').length;
report.navigationIntelligence.summary.totalJobs=report.navigationIntelligence.jobs.length;
report.statuteChain=await extractCoreChain(work,report,u);report.detectors.push(...report.statuteChain.findings);report.navigationIntelligence.statuteChainTasks=report.statuteChain.jobs;
if(page==='codedisplayexpand.xhtml')report.expandedHierarchy=nav.filter(x=>x.resolvedURL&&/\/(codes_displayText|codes_displayexpandedbranch)\.xhtml(?:\?|$)/.test(x.resolvedURL));
report.jsfProtocol={forms:qa('form',work).map(f=>({id:f.id,method:f.getAttribute('method'),stateFieldPresent:!!f.querySelector('[name*="javax.faces.ViewState"]')})),runtimeResources:qa('script[src]',work).map(x=>x.getAttribute('src')).filter(x=>x.includes('jsf.js')),mode:'STATIC_METADATA_ONLY'};
for(const r of report.statutoryRecords){const a=r.navigation?.arguments;if(a?.length===6)r.legislativeIdentity={nodeTreePath:a[1],yearRaw:a[2],chapterRaw:a[3],actSectionRaw:a[4],sourceDocumentId:a[5]};}
report.metrics={elements:qa('*',work).length,links:nav.length,billSections:report.bill?.sections.length||0,statutorySections:report.statutoryRecords.length,elapsedMs:performance.now()-started};return report;}
function save(name,content,type='text/plain'){let a=document.createElement('a'),u=URL.createObjectURL(new Blob([content],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}
const api={extract,decode,targetFrom,subdivisions,navigationIntelligence};window.CARegistryV10=api;

})();

/* V8: restricted locator syntax trees. No eval, network or external libraries. */
(function(g){'use strict';
const text=x=>JSON.stringify(x), enc=new TextEncoder();
const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(x))),b=>b.toString(16).padStart(2,'0')).join('');
function tokenize(s,mode){const out=[];let i=0;while(i<s.length){const start=i,c=s[i];let type='symbol';if(/\s/.test(c)){type='space';while(i<s.length&&/\s/.test(s[i]))i++;}else if(c==='"'||c==="'"){type='string';i++;while(i<s.length&&s[i]!==c){if(mode==='css'&&s[i]==='\\')i++;i++;}if(i>=s.length)throw Error('unterminated string');i++;}else if(mode==='css'&&c==='\\'){type='escape';i++;if(i===s.length)throw Error('trailing escape');if(/[0-9a-f]/i.test(s[i])){let j=0;while(i<s.length&&/[0-9a-f]/i.test(s[i])&&j++<6)i++;if(/\s/.test(s[i]||''))i++;}else i++;}else if(/[\w-]/.test(c)){type='word';while(i<s.length&&/[\w-]/.test(s[i]))i++;}else{i++;if(mode==='xpath'&&c==='/'&&s[i]==='/')i++;}out.push({type,raw:s.slice(start,i),start,end:i});}return out;}
function groups(tokens){const root=[],stack=[{children:root,close:null}];for(const t of tokens){const top=stack.at(-1);if(t.type==='symbol'&&['[','('].includes(t.raw)){const n={type:t.raw==='['?'predicate':'arguments',open:t,children:[],close:null};top.children.push(n);stack.push(n);}else if(t.type==='symbol'&&[']',')'].includes(t.raw)){if(stack.length===1||({'[':']','(':')'}[top.open.raw]!==t.raw))throw Error('unbalanced delimiters');top.close=t;stack.pop();}else top.children.push(t);}if(stack.length!==1)throw Error('unclosed group');return root;}
function render(nodes){return nodes.map(n=>n.children?n.open.raw+render(n.children)+n.close.raw:n.raw).join('');}
function locator(s,mode){const children=groups(tokenize(s,mode));const parts=[];let current=[];for(const n of children){const split=mode==='xpath'?n.raw==='/'||n.raw==='//':n.type==='space'||['>', '+','~',','].includes(n.raw);if(split){if(current.length)parts.push({type:mode==='xpath'?'step':'compound',children:current});current=[];parts.push({type:mode==='xpath'?'axisSeparator':'combinatorOrWhitespace',token:n});}else current.push(n);}if(current.length)parts.push({type:mode==='xpath'?'step':'compound',children:current});return {type:mode==='css'?'CSSLocator':'XPathLocator',coverage:'restricted structural syntax; not complete grammar validation',parts};}
const emitLocator=t=>t.parts.map(p=>p.token?p.token.raw:render(p.children)).join('');
function js(source){const m=/^document\.(querySelector|evaluate)\(("(?:\\.|[^"\\])*")(.*)\)$/s.exec(source); // evaluate has a trailing property, handled separately below
 const q=/^document\.querySelector\(("(?:\\.|[^"\\])*")\)$/s.exec(source);const x=/^document\.evaluate\(("(?:\\.|[^"\\])*"),document,null,XPathResult\.FIRST_ORDERED_NODE_TYPE,null\)\.singleNodeValue$/s.exec(source);const a=q||x;if(!a)throw Error('unsupported JS locator expression');return {type:'CallExpression',receiver:'document',method:q?'querySelector':'evaluate',argument:{type:'StringLiteral',raw:a[1],value:JSON.parse(a[1])},otherArguments:q?[]:['document','null','XPathResult.FIRST_ORDERED_NODE_TYPE','null'],member:x?'singleNodeValue':null};}
function emitJS(t){return t.receiver+'.'+t.method+'('+[t.argument.raw,...t.otherArguments].join(',')+')'+(t.member?'.'+t.member:'');}
function html(s){const template=document.createElement('template');template.innerHTML=s;function tree(n){return n.nodeType===1?{type:'element',tag:n.localName,namespace:n.namespaceURI,attributes:[...n.attributes].map(a=>({name:a.name,namespace:a.namespaceURI,value:a.value})),children:[...n.childNodes].map(tree),templateContent:n.localName==='template'?[...n.content.childNodes].map(tree):null}:{type:n.nodeType===3?'text':n.nodeType===8?'comment':'other',nodeType:n.nodeType,value:n.nodeValue};}return {type:'fragment',children:[...template.content.childNodes].map(tree)};}
function emitHTML(t){const template=document.createElement('template');function make(n){if(n.type==='text')return document.createTextNode(n.value);if(n.type==='comment')return document.createComment(n.value);if(n.type!=='element')throw Error('unsupported HTML node');const e=document.createElementNS(n.namespace,n.tag);for(const a of n.attributes)e.setAttributeNS(a.namespace,a.name,a.value);for(const c of n.children)e.append(make(c));if(n.templateContent)for(const c of n.templateContent)e.content.append(make(c));return e;}for(const n of t.children)template.content.append(make(n));return template.innerHTML;}
async function build(records){const entries=[],rows=[],lookup=new Map();for(const r of records){const refs={};for(const [field,mode] of Object.entries({css:'css',fullCSS:'css',xpath:'xpath',fullXPath:'xpath',jsSelector:'js',jsXPath:'js',element:'html'})){const source=r[field];if(typeof source!=='string')continue;const key=text([mode,source]);let id=lookup.get(key);if(id===undefined){id=entries.length;lookup.set(key,id);let ast=null,serialized=null,status,error=null;try{ast=mode==='html'?html(source):mode==='js'?js(source):locator(source,mode);serialized=mode==='html'?emitHTML(ast):mode==='js'?emitJS(ast):emitLocator(ast);status=serialized===source?'EXACT':mode==='html'&&text(html(serialized))===text(ast)?'STRUCTURAL':'FAIL';}catch(e){status='UNSUPPORTED';error=String(e.message);}entries.push({id,mode,source,ast,serialized,status,error,sha256:await hash(source)});}refs[field]=id;}rows.push({code:r.code,key:r.metadata?.identity?.key??null,refs});}const counts={};for(const e of entries){const c=counts[e.mode]??={total:0,exact:0,structural:0,failed:0,unsupported:0};c.total++;c[{EXACT:'exact',STRUCTURAL:'structural',FAIL:'failed',UNSUPPORTED:'unsupported'}[e.status]]++;}return {format:'CA-SYNTAX-V8',summary:{records:rows.length,uniqueExpressions:entries.length,relationships:rows.reduce((s,r)=>s+Object.keys(r.refs).length,0),counts},rows,entries};}
g.CA_SYNTAX_ENGINE={build,locator,emitLocator,js,emitJS,html,emitHTML};})(globalThis);

/* V7 lossless metadata dictionary + semantic indexes. No dependencies. */
(function(g){
'use strict';
const enc=new TextEncoder(), size=x=>enc.encode(JSON.stringify(x)).length;
const canon=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
async function sha(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))),b=>b.toString(16).padStart(2,'0')).join('')}
function dictionary(){const values=[],map=new Map();return {values,add(x){let k=JSON.stringify(x);if(!map.has(k)){map.set(k,values.length);values.push(x)}return map.get(k)}}}
function pack(records){const strings=dictionary(),objects=dictionary();function encode(v){if(typeof v==='string')return ['s',strings.add(v)];if(Array.isArray(v))return ['a',objects.add(v.map(encode))];if(v!==null&&typeof v==='object')return ['o',objects.add(Object.entries(v).map(([k,x])=>[strings.add(k),encode(x)]))];return ['p',v]};const roots=records.map(encode);return {strings:strings.values,objects:objects.values,roots}}
function unpack(p){function decode([t,v]){if(t==='s')return p.strings[v];if(t==='p')return v;if(t==='a')return p.objects[v].map(decode);if(t==='o')return Object.fromEntries(p.objects[v].map(([k,x])=>[p.strings[k],decode(x)]));throw Error('Invalid encoding')};return p.roots.map(decode)}
async function build(records){records=JSON.parse(JSON.stringify(records));const keys=new Set();const pools=Object.fromEntries(['identity','dom','css','xpath','ancestor','attribute','comment','url','js','token','style','hash','temporal','jsf','pathStep'].map(k=>[k,dictionary()]));const rows=[],edges=new Map(),checks=[];for(const r of records){const m=r.metadata;if(!m)throw Error('Missing V6 metadata');const key=m.identity.key;if(keys.has(key))throw Error('Duplicate identity '+key);keys.add(key);const add=(k,v)=>pools[k].add(v);const dom=m.dom;const ancestors=dom.ancestors.map(a=>add('ancestor',a.xpath));const chain=[...ancestors].reverse();const node=add('ancestor',r.fullXPath);chain.push(node);for(let i=1;i<chain.length;i++)edges.set(chain[i-1]+':'+chain[i],[chain[i-1],chain[i]]);const tokens=r.heading.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];const hashes={};for(const [k,v] of Object.entries({legal:[key,r.heading],structural:[r.fullXPath,dom.pathSteps,dom.ancestors,dom.tag,dom.namespace],navigation:[r.url,m.navigation],presentation:m.presentation,raw:r.element})){hashes[k]=await sha(k==='raw'?v:'CA-V7:'+k+':'+canon(v))}const validation=[r.cssValid,r.xpathValid,r.fullXPathValid,r.fullCSSValid];checks.push({code:r.code,rawHash:hashes.raw===m.integrity.elementSHA256,bytes:enc.encode(r.element).length===m.integrity.elementUTF8Bytes,locators:validation,urlIdentity:new URL(r.url).searchParams.get('tocCode')===r.code});rows.push({code:r.code,identity:add('identity',m.identity),dom:add('dom',r.nodeId),css:[add('css',r.css),add('css',r.fullCSS)],xpath:[add('xpath',r.xpath),add('xpath',r.fullXPath)],ancestors,attributes:Object.entries(dom.attributes).map(a=>add('attribute',a)),comments:dom.comments.map(c=>add('comment',c)),jsf:dom.comments.flatMap(c=>(c.match(/code_BackinBean\.[\w.]+|beans\.CodeBean@[\da-f]+/g)||[]).map(t=>add('jsf',t))),url:add('url',m.navigation),js:[add('js',r.jsSelector),add('js',r.jsXPath)],tokens:tokens.map(t=>add('token',t)),bigrams:tokens.slice(1).map((t,i)=>add('token',tokens[i]+' '+t)),style:add('style',m.presentation),hashes:Object.fromEntries(Object.entries(hashes).map(([k,v])=>[k,add('hash',v)])),temporal:add('temporal',m.provenance.capturedAt),path:dom.pathSteps.map(s=>add('pathStep',s)),validation});}const compact=pack(records),restored=unpack(compact);const roundTrip=JSON.stringify(records)===JSON.stringify(restored);if(!roundTrip)throw Error('Round-trip failed');const indexes=Object.fromEntries(Object.entries(pools).map(([k,v])=>[k,v.values]));const sparse={shape:[rows.length,indexes.token.length],coordinates:rows.flatMap((r,i)=>[...new Set([...r.tokens,...r.bigrams])].map(j=>[i,j]))};const summary={records:rows.length,originalCompactBytes:size(records),packedBytes:size(compact),roundTrip,hashesPassed:checks.filter(x=>x.rawHash).length,bytesPassed:checks.filter(x=>x.bytes).length,locatorFlagsPassed:checks.flatMap(x=>x.locators).filter(x=>x===true).length,urlIdentityPassed:checks.filter(x=>x.urlIdentity).length,indexSizes:Object.fromEntries(Object.entries(indexes).map(([k,v])=>[k,v.length])),ancestorObservations:rows.reduce((n,r)=>n+r.ancestors.length,0),edges:edges.size,sparseNonzeros:sparse.coordinates.length};return {format:'CA-METADATA-V7',summary,compact,indexes,rows,edges:[...edges.values()],sparse,checks}}
function compare(a,b){const old=new Map(a.rows.map(r=>[r.code,r]));return b.rows.map(r=>{const prev=old.get(r.code);old.delete(r.code);return {code:r.code,status:prev?'EXISTING':'ADDED',changes:prev?Object.keys(r.hashes).filter(k=>a.indexes.hash[prev.hashes[k]]!==b.indexes.hash[r.hashes[k]]):[]}}).concat([...old.keys()].map(code=>({code,status:'REMOVED',changes:[]})))}
g.CA_INDEX_ENGINE={build,pack,unpack,compare};
})(globalThis);

(()=>{
"use strict";
const enc=new TextEncoder();
const profiles=[
  {
    "url": "https://leginfo.legislature.ca.gov/faces/codes.xhtml",
    "summary": [
      {
        "count": 30,
        "error": "",
        "selector": "#codestocheader a[href*='tocCode=']",
        "truncated": false
      },
      {
        "count": 1,
        "error": "",
        "selector": ".codes_const a[href]",
        "truncated": false
      },
      {
        "count": 9,
        "error": "",
        "selector": ".codesIndexTblLeftdiv a[href]",
        "truncated": false
      },
      {
        "count": 10,
        "error": "",
        "selector": ".codesIndexTblMiddiv a[href]",
        "truncated": false
      },
      {
        "count": 10,
        "error": "",
        "selector": ".codesIndexTblRightdiv a[href]",
        "truncated": false
      },
      {
        "count": 19,
        "error": "",
        "selector": "a[onclick]",
        "truncated": false
      },
      {
        "count": 51,
        "error": "",
        "selector": "form a[href]",
        "truncated": false
      }
    ],
    "targets": [
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(1) > div:nth-of-type(1) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[1]/div[1]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[1]/div[1]/a[1]",
        "text": "California Constitution - CONS",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codes_const a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=CONS&tocTitle=+California+Constitution+-+CONS"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[1]/div[1]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[1]/a[1]",
        "text": "Business and Professions Code - BPC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblLeftdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=BPC&tocTitle=+Business+and+Professions+Code+-+BPC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[1]/div[2]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[2]/a[1]",
        "text": "Civil Code - CIV",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblLeftdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=CIV&tocTitle=+Civil+Code+-+CIV"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[1]/div[3]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[3]/a[1]",
        "text": "Code of Civil Procedure - CCP",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblLeftdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=CCP&tocTitle=+Code+of+Civil+Procedure+-+CCP"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(4) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[1]/div[4]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[4]/a[1]",
        "text": "Commercial Code - COM",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblLeftdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=COM&tocTitle=+Commercial+Code+-+COM"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(5) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[1]/div[5]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[5]/a[1]",
        "text": "Corporations Code - CORP",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblLeftdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=CORP&tocTitle=+Corporations+Code+-+CORP"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(6) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[1]/div[6]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[6]/a[1]",
        "text": "Education Code - EDC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblLeftdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=EDC&tocTitle=+Education+Code+-+EDC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(7) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[1]/div[7]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[7]/a[1]",
        "text": "Elections Code - ELEC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblLeftdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=ELEC&tocTitle=+Elections+Code+-+ELEC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(8) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[1]/div[8]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[8]/a[1]",
        "text": "Evidence Code - EVID",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblLeftdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=EVID&tocTitle=+Evidence+Code+-+EVID"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(9) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[1]/div[9]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[9]/a[1]",
        "text": "Family Code - FAM",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblLeftdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=FAM&tocTitle=+Family+Code+-+FAM"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[2]/div[1]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[1]/a[1]",
        "text": "Financial Code - FIN",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblMiddiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=FIN&tocTitle=+Financial+Code+-+FIN"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[2]/div[2]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[2]/a[1]",
        "text": "Fish and Game Code - FGC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblMiddiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=FGC&tocTitle=+Fish+and+Game+Code+-+FGC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(3) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[2]/div[3]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[3]/a[1]",
        "text": "Food and Agricultural Code - FAC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblMiddiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=FAC&tocTitle=+Food+and+Agricultural+Code+-+FAC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(4) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[2]/div[4]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[4]/a[1]",
        "text": "Government Code - GOV",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblMiddiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=GOV&tocTitle=+Government+Code+-+GOV"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(5) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[2]/div[5]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[5]/a[1]",
        "text": "Harbors and Navigation Code - HNC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblMiddiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=HNC&tocTitle=+Harbors+and+Navigation+Code+-+HNC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(6) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[2]/div[6]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[6]/a[1]",
        "text": "Health and Safety Code - HSC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblMiddiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=HSC&tocTitle=+Health+and+Safety+Code+-+HSC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(7) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[2]/div[7]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[7]/a[1]",
        "text": "Insurance Code - INS",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblMiddiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=INS&tocTitle=+Insurance+Code+-+INS"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(8) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[2]/div[8]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[8]/a[1]",
        "text": "Labor Code - LAB",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblMiddiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=LAB&tocTitle=+Labor+Code+-+LAB"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(9) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[2]/div[9]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[9]/a[1]",
        "text": "Military and Veterans Code - MVC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblMiddiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=MVC&tocTitle=+Military+and+Veterans+Code+-+MVC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(10) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[2]/div[10]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[10]/a[1]",
        "text": "Penal Code - PEN",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblMiddiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=PEN&tocTitle=+Penal+Code+-+PEN"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(1) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[3]/div[1]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[1]/a[1]",
        "text": "Probate Code - PROB",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblRightdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=PROB&tocTitle=+Probate+Code+-+PROB"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(2) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[3]/div[2]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[2]/a[1]",
        "text": "Public Contract Code - PCC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblRightdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=PCC&tocTitle=+Public+Contract+Code+-+PCC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(3) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[3]/div[3]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[3]/a[1]",
        "text": "Public Resources Code - PRC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblRightdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=PRC&tocTitle=+Public+Resources+Code+-+PRC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(4) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[3]/div[4]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[4]/a[1]",
        "text": "Public Utilities Code - PUC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblRightdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=PUC&tocTitle=+Public+Utilities+Code+-+PUC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(5) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[3]/div[5]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[5]/a[1]",
        "text": "Revenue and Taxation Code - RTC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblRightdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=RTC&tocTitle=+Revenue+and+Taxation+Code+-+RTC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(6) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[3]/div[6]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[6]/a[1]",
        "text": "Streets and Highways Code - SHC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblRightdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=SHC&tocTitle=+Streets+and+Highways+Code+-+SHC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(7) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[3]/div[7]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[7]/a[1]",
        "text": "Unemployment Insurance Code - UIC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblRightdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=UIC&tocTitle=+Unemployment+Insurance+Code+-+UIC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(8) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[3]/div[8]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[8]/a[1]",
        "text": "Vehicle Code - VEH",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblRightdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=VEH&tocTitle=+Vehicle+Code+-+VEH"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(9) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[3]/div[9]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[9]/a[1]",
        "text": "Water Code - WAT",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblRightdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=WAT&tocTitle=+Water+Code+-+WAT"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codetocfrm2 > div#codestocheader > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(10) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestocheader']/div[2]/div[3]/div[10]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[10]/a[1]",
        "text": "Welfare and Institutions Code - WIC",
        "selectors": [
          "#codestocheader a[href*='tocCode=']",
          ".codesIndexTblRightdiv a[href]",
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codesTOCSelected.xhtml?tocCode=WIC&tocTitle=+Welfare+and+Institutions+Code+-+WIC"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(2) > a#billheaderinit_form\\:nav_bar_link_home",
        "xpath": "//*[@id='billheaderinit_form:nav_bar_link_home']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[2]/a[1]",
        "text": "home",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:nav_bar_link_home",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:nav_bar_link_home':'billheaderinit_form:nav_bar_link_home'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(3) > a#billheaderinit_form\\:nav_bar_link_accessibility",
        "xpath": "//*[@id='billheaderinit_form:nav_bar_link_accessibility']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[3]/a[1]",
        "text": "accessibility",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:nav_bar_link_accessibility",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:nav_bar_link_accessibility':'billheaderinit_form:nav_bar_link_accessibility'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(4) > a#billheaderinit_form\\:nav_bar_link_faq",
        "xpath": "//*[@id='billheaderinit_form:nav_bar_link_faq']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[4]/a[1]",
        "text": "FAQ",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:nav_bar_link_faq",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:nav_bar_link_faq':'billheaderinit_form:nav_bar_link_faq'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(5) > a:nth-of-type(1)",
        "xpath": "//*[@id='system']/ul[1]/li[5]/a[1]",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[5]/a[1]",
        "text": "feedback",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:j_idt35':'billheaderinit_form:j_idt35','destPage':'feedbackNewidea.xhtml'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(6) > a#billheaderinit_form\\:nav_bar_link_sitemap",
        "xpath": "//*[@id='billheaderinit_form:nav_bar_link_sitemap']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[6]/a[1]",
        "text": "sitemap",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:nav_bar_link_sitemap",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:nav_bar_link_sitemap':'billheaderinit_form:nav_bar_link_sitemap'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(7) > a:nth-of-type(1)",
        "xpath": "//*[@id='system']/ul[1]/li[7]/a[1]",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[7]/a[1]",
        "text": "login",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:j_idt41':'billheaderinit_form:j_idt41','destPage':'home.xhtml'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#logo > a#billheaderinit_form\\:header_img",
        "xpath": "//*[@id='billheaderinit_form:header_img']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[2]/a[1]",
        "text": "",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:header_img",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:header_img':'billheaderinit_form:header_img'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#logo_mobile > div#header_img_links > a#billheaderinit_form\\:header_img_mobile2",
        "xpath": "//*[@id='billheaderinit_form:header_img_mobile2']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[3]/div[1]/a[1]",
        "text": "",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:header_img_mobile2",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:header_img_mobile2':'billheaderinit_form:header_img_mobile2'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#logo_mobile > div#header_img_links > a#billheaderinit_form\\:header_img_mobile25",
        "xpath": "//*[@id='billheaderinit_form:header_img_mobile25']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[3]/div[1]/a[2]",
        "text": "",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:header_img_mobile25",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:header_img_mobile25':'billheaderinit_form:header_img_mobile25'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#logo_mobile > div#header_img_links > a:nth-of-type(3)",
        "xpath": "//*[@id='header_img_links']/a[3]",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[3]/div[1]/a[3]",
        "text": "",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "",
          "onclick": "history.back();                                 return false;"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(1) > a#billheaderinit_form\\:home_link",
        "xpath": "//*[@id='billheaderinit_form:home_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[1]/a[1]",
        "text": "Home",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:home_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:home_link':'billheaderinit_form:home_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(2) > a#billheaderinit_form\\:bill_info_link",
        "xpath": "//*[@id='billheaderinit_form:bill_info_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[2]/a[1]",
        "text": "Bill Information",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:bill_info_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:bill_info_link':'billheaderinit_form:bill_info_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(3) > a#billheaderinit_form\\:codes_info_link",
        "xpath": "//*[@id='billheaderinit_form:codes_info_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[3]/a[1]",
        "text": "California Law",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_selected",
          "href": "#",
          "id": "billheaderinit_form:codes_info_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:codes_info_link':'billheaderinit_form:codes_info_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(4) > a#billheaderinit_form\\:pubs_info_link",
        "xpath": "//*[@id='billheaderinit_form:pubs_info_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[4]/a[1]",
        "text": "Publications",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:pubs_info_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:pubs_info_link':'billheaderinit_form:pubs_info_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(5) > a#billheaderinit_form\\:resources_link",
        "xpath": "//*[@id='billheaderinit_form:resources_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[5]/a[1]",
        "text": "Other Resources",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:resources_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:resources_link':'billheaderinit_form:resources_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(6) > a#billheaderinit_form\\:my_bills_link",
        "xpath": "//*[@id='billheaderinit_form:my_bills_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[6]/a[1]",
        "text": "My Subscriptions",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:my_bills_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:my_bills_link':'billheaderinit_form:my_bills_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(7) > a#billheaderinit_form\\:my_favs_link",
        "xpath": "//*[@id='billheaderinit_form:my_favs_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[7]/a[1]",
        "text": "My Favorites",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:my_favs_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:my_favs_link':'billheaderinit_form:my_favs_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(2) > form#j_idt121 > div#tab_panel > span:nth-of-type(1) > a#j_idt121\\:codesearchtab",
        "xpath": "//*[@id='j_idt121:codesearchtab']",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[2]/form[1]/div[1]/span[1]/a[1]",
        "text": "Code Search",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "tab_link",
          "href": "#",
          "id": "j_idt121:codesearchtab",
          "onclick": "mojarra.jsfcljs(document.getElementById('j_idt121'),{'j_idt121:codesearchtab':'j_idt121:codesearchtab'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(2) > form#j_idt121 > div#tab_panel > span:nth-of-type(2) > a#j_idt121\\:textsearchtab",
        "xpath": "//*[@id='j_idt121:textsearchtab']",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[2]/form[1]/div[1]/span[2]/a[1]",
        "text": "Text Search",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "tab_link",
          "href": "#",
          "id": "j_idt121:textsearchtab",
          "onclick": "mojarra.jsfcljs(document.getElementById('j_idt121'),{'j_idt121:textsearchtab':'j_idt121:textsearchtab'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(1) > a:nth-of-type(1)",
        "xpath": "//*[@id='system']/ul[1]/li[1]/a[1]",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[1]/a[1]",
        "text": "skip to content",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "href": "#content_anchor"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > form#codesfrm > div#breadcrumbs > ul:nth-of-type(1) > li:nth-of-type(1) > a:nth-of-type(1)",
        "xpath": "//*[@id='breadcrumbs']/ul[1]/li[1]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/form[1]/div[1]/ul[1]/li[1]/a[1]",
        "text": "California Law",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codes.xhtml"
        }
      }
    ]
  },
  {
    "url": "https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=CIV&tocTitle=+Civil+Code+-+CIV",
    "summary": [
      {
        "selector": "#codestocheader a[href*='tocCode=']",
        "count": 0
      },
      {
        "selector": ".codes_const a[href]",
        "count": 0
      },
      {
        "selector": ".codesIndexTblLeftdiv a[href]",
        "count": 0
      },
      {
        "selector": ".codesIndexTblMiddiv a[href]",
        "count": 0
      },
      {
        "selector": ".codesIndexTblRightdiv a[href]",
        "count": 0
      },
      {
        "selector": "a[onclick]",
        "count": 20
      },
      {
        "selector": "form a[href]",
        "count": 33
      }
    ],
    "targets": [
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(2) > a#billheaderinit_form\\:nav_bar_link_home",
        "xpath": "//*[@id='billheaderinit_form:nav_bar_link_home']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[2]/a[1]",
        "text": "home",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:nav_bar_link_home",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:nav_bar_link_home':'billheaderinit_form:nav_bar_link_home'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(3) > a#billheaderinit_form\\:nav_bar_link_accessibility",
        "xpath": "//*[@id='billheaderinit_form:nav_bar_link_accessibility']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[3]/a[1]",
        "text": "accessibility",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:nav_bar_link_accessibility",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:nav_bar_link_accessibility':'billheaderinit_form:nav_bar_link_accessibility'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(4) > a#billheaderinit_form\\:nav_bar_link_faq",
        "xpath": "//*[@id='billheaderinit_form:nav_bar_link_faq']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[4]/a[1]",
        "text": "FAQ",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:nav_bar_link_faq",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:nav_bar_link_faq':'billheaderinit_form:nav_bar_link_faq'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(5) > a:nth-of-type(1)",
        "xpath": "//*[@id='system']/ul[1]/li[5]/a[1]",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[5]/a[1]",
        "text": "feedback",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:j_idt36':'billheaderinit_form:j_idt36','destPage':'feedbackNewidea.xhtml'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(6) > a#billheaderinit_form\\:nav_bar_link_sitemap",
        "xpath": "//*[@id='billheaderinit_form:nav_bar_link_sitemap']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[6]/a[1]",
        "text": "sitemap",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:nav_bar_link_sitemap",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:nav_bar_link_sitemap':'billheaderinit_form:nav_bar_link_sitemap'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(7) > a:nth-of-type(1)",
        "xpath": "//*[@id='system']/ul[1]/li[7]/a[1]",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[7]/a[1]",
        "text": "login",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:j_idt42':'billheaderinit_form:j_idt42','destPage':'home.xhtml'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#logo > a#billheaderinit_form\\:header_img",
        "xpath": "//*[@id='billheaderinit_form:header_img']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[2]/a[1]",
        "text": "",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:header_img",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:header_img':'billheaderinit_form:header_img'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#logo_mobile > div#header_img_links > a#billheaderinit_form\\:header_img_mobile2",
        "xpath": "//*[@id='billheaderinit_form:header_img_mobile2']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[3]/div[1]/a[1]",
        "text": "",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:header_img_mobile2",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:header_img_mobile2':'billheaderinit_form:header_img_mobile2'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#logo_mobile > div#header_img_links > a#billheaderinit_form\\:header_img_mobile25",
        "xpath": "//*[@id='billheaderinit_form:header_img_mobile25']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[3]/div[1]/a[2]",
        "text": "",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "id": "billheaderinit_form:header_img_mobile25",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:header_img_mobile25':'billheaderinit_form:header_img_mobile25'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#logo_mobile > div#header_img_links > a:nth-of-type(3)",
        "xpath": "//*[@id='header_img_links']/a[3]",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[3]/div[1]/a[3]",
        "text": "",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "",
          "onclick": "history.back();                                 return false;"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(1) > a#billheaderinit_form\\:home_link",
        "xpath": "//*[@id='billheaderinit_form:home_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[1]/a[1]",
        "text": "Home",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:home_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:home_link':'billheaderinit_form:home_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(2) > a#billheaderinit_form\\:bill_info_link",
        "xpath": "//*[@id='billheaderinit_form:bill_info_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[2]/a[1]",
        "text": "Bill Information",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:bill_info_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:bill_info_link':'billheaderinit_form:bill_info_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(3) > a#billheaderinit_form\\:codes_info_link",
        "xpath": "//*[@id='billheaderinit_form:codes_info_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[3]/a[1]",
        "text": "California Law",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_selected",
          "href": "#",
          "id": "billheaderinit_form:codes_info_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:codes_info_link':'billheaderinit_form:codes_info_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(4) > a#billheaderinit_form\\:pubs_info_link",
        "xpath": "//*[@id='billheaderinit_form:pubs_info_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[4]/a[1]",
        "text": "Publications",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:pubs_info_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:pubs_info_link':'billheaderinit_form:pubs_info_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(5) > a#billheaderinit_form\\:resources_link",
        "xpath": "//*[@id='billheaderinit_form:resources_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[5]/a[1]",
        "text": "Other Resources",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:resources_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:resources_link':'billheaderinit_form:resources_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(6) > a#billheaderinit_form\\:my_bills_link",
        "xpath": "//*[@id='billheaderinit_form:my_bills_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[6]/a[1]",
        "text": "My Subscriptions",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:my_bills_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:my_bills_link':'billheaderinit_form:my_bills_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#tabs > ul:nth-of-type(1) > li:nth-of-type(7) > a#billheaderinit_form\\:my_favs_link",
        "xpath": "//*[@id='billheaderinit_form:my_favs_link']",
        "fullXPath": "/html[1]/body[1]/form[1]/div[2]/ul[1]/li[7]/a[1]",
        "text": "My Favorites",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "nav_not_selected",
          "href": "#",
          "id": "billheaderinit_form:my_favs_link",
          "onclick": "mojarra.jsfcljs(document.getElementById('billheaderinit_form'),{'billheaderinit_form:my_favs_link':'billheaderinit_form:my_favs_link'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(2) > form#j_idt122 > div#tab_panel > span:nth-of-type(1) > a#j_idt122\\:codesearchtab",
        "xpath": "//*[@id='j_idt122:codesearchtab']",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[2]/form[1]/div[1]/span[1]/a[1]",
        "text": "Code Search",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "tab_link",
          "href": "#",
          "id": "j_idt122:codesearchtab",
          "onclick": "mojarra.jsfcljs(document.getElementById('j_idt122'),{'j_idt122:codesearchtab':'j_idt122:codesearchtab'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(2) > form#j_idt122 > div#tab_panel > span:nth-of-type(2) > a#j_idt122\\:textsearchtab",
        "xpath": "//*[@id='j_idt122:textsearchtab']",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[2]/form[1]/div[1]/span[2]/a[1]",
        "text": "Text Search",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "class": "tab_link",
          "href": "#",
          "id": "j_idt122:textsearchtab",
          "onclick": "mojarra.jsfcljs(document.getElementById('j_idt122'),{'j_idt122:textsearchtab':'j_idt122:textsearchtab'},'');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div#codes_print > a:nth-of-type(1)",
        "xpath": "//*[@id='codes_print']/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[2]/a[1]",
        "text": "",
        "selectors": [
          "a[onclick]",
          "form a[href]"
        ],
        "attributes": {
          "href": "#",
          "onclick": "jsf.util.chain(this,event,'javascript:window.print();                                     return false;','mojarra.jsfcljs(document.getElementById(\\'codestreeForm2\\'),{\\'codestreeForm2:j_idt134\\':\\'codestreeForm2:j_idt134\\'},\\'\\')');return false"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > form#billheaderinit_form > div#banner > div#system > ul:nth-of-type(1) > li:nth-of-type(1) > a:nth-of-type(1)",
        "xpath": "//*[@id='system']/ul[1]/li[1]/a[1]",
        "fullXPath": "/html[1]/body[1]/form[1]/div[1]/div[1]/ul[1]/li[1]/a[1]",
        "text": "skip to content",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "href": "#content_anchor"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > form#codesTreeForm > div#breadcrumbs > ul:nth-of-type(1) > li:nth-of-type(1) > a:nth-of-type(1)",
        "xpath": "//*[@id='breadcrumbs']/ul[1]/li[1]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/form[1]/div[1]/ul[1]/li[1]/a[1]",
        "text": "California Law",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codes.xhtml"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > form#codesTreeForm > div#breadcrumbs > ul:nth-of-type(1) > li:nth-of-type(2) > a:nth-of-type(1)",
        "xpath": "//*[@id='breadcrumbs']/ul[1]/li[2]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/form[1]/div[1]/ul[1]/li[2]/a[1]",
        "text": "Code Search",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "href": "/faces/codes.xhtml"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div#displaytextheader > a:nth-of-type(1)",
        "xpath": "//*[@id='displaytextheader']/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/a[1]",
        "text": "Expand all",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "class": "treefont",
          "href": "/faces/codedisplayexpand.xhtml?tocCode=CIV"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div:nth-of-type(4) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestreeForm2']/div[4]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[4]/a[1]",
        "text": "TITLE OF THE ACT",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "class": "portletNav",
          "href": "/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&heading2=TITLE+OF+THE+ACT&nodetreepath=1"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div:nth-of-type(5) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestreeForm2']/div[5]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[5]/a[1]",
        "text": "THE CIVIL CODE OF THE STATE OF CALIFORNIA",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "class": "portletNav",
          "href": "/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&heading2=THE+CIVIL+CODE+OF+THE+STATE+OF+CALIFORNIA&nodetreepath=2"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div:nth-of-type(6) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestreeForm2']/div[6]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[6]/a[1]",
        "text": "PRELIMINARY PROVISIONS",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "class": "portletNav",
          "href": "/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&heading2=PRELIMINARY+PROVISIONS&nodetreepath=3"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div:nth-of-type(7) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestreeForm2']/div[7]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[7]/a[1]",
        "text": "DEFINITIONS AND SOURCES OF LAW",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "class": "portletNav",
          "href": "/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&heading2=DEFINITIONS+AND+SOURCES+OF+LAW&nodetreepath=4"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div:nth-of-type(8) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestreeForm2']/div[8]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[8]/a[1]",
        "text": "EFFECT OF THE 1872 CODES",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "class": "portletNav",
          "href": "/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&heading2=EFFECT+OF+THE+1872+CODES&nodetreepath=5"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div:nth-of-type(9) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestreeForm2']/div[9]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[9]/a[1]",
        "text": "DIVISION 1. PERSONS [38 - 86]",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "class": "portletNav",
          "href": "/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&division=1.&title=&part=&chapter=&article=&nodetreepath=6"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div:nth-of-type(10) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestreeForm2']/div[10]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[10]/a[1]",
        "text": "DIVISION 2. PROPERTY [654 - 1422]",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "class": "portletNav",
          "href": "/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&division=2.&title=&part=&chapter=&article=&nodetreepath=7"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div:nth-of-type(11) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestreeForm2']/div[11]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[11]/a[1]",
        "text": "DIVISION 3. OBLIGATIONS [1427 - 3273.91]",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "class": "portletNav",
          "href": "/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&division=3.&title=&part=&chapter=&article=&nodetreepath=8"
        }
      },
      {
        "tag": "a",
        "path": "html:nth-of-type(1) > body:nth-of-type(1) > div:nth-of-type(1) > div#codes_mobile > div:nth-of-type(4) > form#codestreeForm2 > div:nth-of-type(12) > a:nth-of-type(1)",
        "xpath": "//*[@id='codestreeForm2']/div[12]/a[1]",
        "fullXPath": "/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[12]/a[1]",
        "text": "DIVISION 4. GENERAL PROVISIONS [3274 - 9566]",
        "selectors": [
          "form a[href]"
        ],
        "attributes": {
          "class": "portletNav",
          "href": "/faces/codes_displayexpandedbranch.xhtml?tocCode=CIV&division=4.&title=&part=&chapter=&article=&nodetreepath=9"
        }
      }
    ]
  }
];
function captureUnified(selectors = []) {
  const nodes=[], ids=new Map(), scripts=[], handlers=[], resources=[], categories={};
  const names=['SCRIPTS','HEADERS','SVG','CANVAS','CLASS_ATTRIBUTES','EMPTY_NON_VOID_ELEMENTS','STYLES','STYLESHEET_LINKS','FOOTERS','HIDDEN_ARIA_HIDDEN_ELEMENTS','ID_ATTRIBUTES','HTML_COMMENTS','FORMS','INLINE_EVENT_HANDLERS','INLINE_STYLE_ATTRIBUTES','NAV','IFRAMES','OBJECTS','DATA_ATTRIBUTES','ANCHORS'];
  for(const n of names) categories[n]=[];
  const add=(name,id,attribute=null)=>categories[name].push({id,attribute});
  const tags={script:'SCRIPTS',header:'HEADERS',svg:'SVG',canvas:'CANVAS',style:'STYLES',footer:'FOOTERS',form:'FORMS',nav:'NAV',iframe:'IFRAMES',object:'OBJECTS',a:'ANCHORS'};
  const voids=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const stack=[[document,null,0,'']];
  while(stack.length){
    const [n,parent,ordinal,base]=stack.pop(), id=nodes.length; ids.set(n,id);
    const element=n.nodeType===1, tag=element?n.localName:null;
    const xpath=element?base+'/'+tag+'['+(1+Array.from(n.parentNode.children||[]).slice(0,Array.from(n.parentNode.children||[]).indexOf(n)).filter(x=>x.localName===tag&&x.namespaceURI===n.namespaceURI).length)+']':null;
    const attrs=element?Array.from(n.attributes,a=>[a.name,a.value]):[];
    nodes.push({id,parent,ordinal,type:n.nodeType,tag,namespace:n.namespaceURI||null,name:n.nodeName,xpath,attributes:attrs,text:element||n.nodeType===9?null:n.nodeValue,doctype:n.nodeType===10?{name:n.name,publicId:n.publicId,systemId:n.systemId}:null});
    if(n.nodeType===8)add('HTML_COMMENTS',id);
    if(element){
      if(tags[tag]) add(tags[tag],id);
      if(!voids.has(tag)&&!n.childNodes.length)add('EMPTY_NON_VOID_ELEMENTS',id);
      if(n.hasAttribute('hidden')||n.getAttribute('aria-hidden')==='true')add('HIDDEN_ARIA_HIDDEN_ELEMENTS',id);
      if(tag==='link'&&n.relList.contains('stylesheet'))add('STYLESHEET_LINKS',id);
      for(const [key,value] of attrs){
        if(key==='class')add('CLASS_ATTRIBUTES',id,key);
        if(key==='id')add('ID_ATTRIBUTES',id,key);
        if(key==='style')add('INLINE_STYLE_ATTRIBUTES',id,key);
        if(key.startsWith('data-'))add('DATA_ATTRIBUTES',id,key);
        if(key.startsWith('on')){add('INLINE_EVENT_HANDLERS',id,key);handlers.push({id,event:key,source:value});}
      }
      if(tag==='script')scripts.push({id,order:scripts.length,src:n.getAttribute('src'),resolved:n.hasAttribute('src')?n.src:null,type:n.getAttribute('type'),async:n.hasAttribute('async'),defer:n.hasAttribute('defer'),inline:n.textContent});
      const key=tag==='object'?'data':tag==='link'||tag==='a'?'href':'src';
      if(n.hasAttribute(key)){const raw=n.getAttribute(key);let resolved=null;try{resolved=new URL(raw,document.baseURI).href}catch{} resources.push({id,tag,key,raw,resolved});}
    }
    for(let i=n.childNodes.length-1;i>=0;i--)stack.push([n.childNodes[i],id,i,xpath||base]);
  }
  const matches=Array.from(new Set(selectors),selector=>{try{return {selector,ids:Array.from(document.querySelectorAll(selector),n=>ids.get(n))}}catch(e){return {selector,ids:[],error:String(e)}}});
  const stylesheets=Array.from(document.styleSheets,s=>{try{return {href:s.href,owner:ids.get(s.ownerNode)??null,rules:Array.from(s.cssRules,r=>r.cssText)}}catch(e){return {href:s.href,owner:ids.get(s.ownerNode)??null,error:String(e)}}});
  return {format:'ca-unified-browser-v1',url:location.href,title:document.title,html:document.documentElement.outerHTML,doctype:document.doctype?new XMLSerializer().serializeToString(document.doctype):'',nodes,categories,matches,scripts,handlers,resources,stylesheets,limitations:['Top document only; excludes shadow roots and iframe documents','Scripts listed in DOM order, not execution order','External script bodies not fetched','CSSOM inaccessible sheets recorded as errors']};
}

const json=x=>JSON.stringify(x,null,2);const bytes=s=>enc.encode(s);const hash=async b=>{if(crypto.subtle)return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');const K=Uint32Array.from([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);let H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),p=new Uint8Array(Math.ceil((b.length+9)/64)*64);p.set(b);p[b.length]=128;let dv=new DataView(p.buffer);dv.setBigUint64(p.length-8,BigInt(b.length)*8n);let w=new Uint32Array(64),r=(x,n)=>(x>>>n)|(x<<(32-n));for(let o=0;o<p.length;o+=64){for(let i=0;i<16;i++)w[i]=dv.getUint32(o+4*i);for(let i=16;i<64;i++){let x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(r(x,7)^r(x,18)^(x>>>3))+w[i-7]+(r(y,17)^r(y,19)^(y>>>10)))>>>0}let [a,c,d,e,f,g,h,j]=H;for(let i=0;i<64;i++){let t=(j+(r(f,6)^r(f,11)^r(f,25))+((f&g)^(~f&h))+K[i]+w[i])>>>0,u=((r(a,2)^r(a,13)^r(a,22))+((a&c)^(a&d)^(c&d)))>>>0;j=h;h=g;g=f;f=(e+t)>>>0;e=d;d=c;c=a;a=(t+u)>>>0}let v=[a,c,d,e,f,g,h,j];for(let i=0;i<8;i++)H[i]=(H[i]+v[i])>>>0}return Array.from(H,x=>x.toString(16).padStart(8,'0')).join('')};
const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=(i&1)?0xedb88320^(i>>>1):i>>>1;return i>>>0});
function crc(b){let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function view(b){return new DataView(b.buffer,b.byteOffset,b.byteLength)}
function zip(files){let parts=[],central=[],offset=0,cs=0;for(const [name,b] of files){let n=bytes(name),h=new Uint8Array(30),d=view(h),c=crc(b);d.setUint32(0,0x04034b50,true);d.setUint16(4,20,true);d.setUint16(6,2048,true);d.setUint32(14,c,true);d.setUint32(18,b.length,true);d.setUint32(22,b.length,true);d.setUint16(26,n.length,true);parts.push(h,n,b);let a=new Uint8Array(46),v=view(a);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,2048,true);v.setUint32(16,c,true);v.setUint32(20,b.length,true);v.setUint32(24,b.length,true);v.setUint16(28,n.length,true);v.setUint32(42,offset,true);central.push(a,n);cs+=46+n.length;offset+=30+n.length+b.length}let end=new Uint8Array(22),d=view(end);d.setUint32(0,0x06054b50,true);d.setUint16(8,files.size,true);d.setUint16(10,files.size,true);d.setUint32(12,cs,true);d.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'})}
// Expanded live-page targeting. No automatic navigation or execution of captured handlers.
const codes = new Set('CONS BPC CIV CCP COM CORP EDC ELEC EVID FAM FIN FGC FAC GOV HNC HSC INS LAB MVC PEN PROB PCC PRC PUC RTC SHC UIC VEH WAT WIC'.split(' '));
const pageTypes = { 'codes.xhtml':'registry','codesTOCSelected.xhtml':'toc','codedisplayexpand.xhtml':'expanded','codes_displayexpandedbranch.xhtml':'branch','codes_displayText.xhtml':'sections','codes_displaySection.xhtml':'statute','codeBillCrossRef.xhtml':'history','displayCodeAndBill.xhtml':'comparison','asAmendsTheBill.xhtml':'amendment','billNavClient.xhtml':'billNav','billTextClient.xhtml':'billText','billVotesClient.xhtml':'billVotes','billHistoryClient.xhtml':'billHistory','billAnalysisClient.xhtml':'billAnalysis','billCompareClient.xhtml':'billCompare','billVersionsCompareClient.xhtml':'billVersionsCompare','billStatusClient.xhtml':'billStatus','billSearchClient.xhtml':'billSearch' };
const here=new URL(location.href), endpoint=here.pathname.split('/').pop(), type=pageTypes[endpoint];
if(here.hostname!=='leginfo.legislature.ca.gov'||!type) throw Error('Not a recognized California legislative code page.');
const code=here.searchParams.get('tocCode')||here.searchParams.get('lawCode')||null;
const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
const css=s=>{try{return [...document.querySelectorAll(s)]}catch{return []}};
const xp=s=>{try{const r=document.evaluate(s,document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);return Array.from({length:r.snapshotLength},(_,i)=>r.snapshotItem(i))}catch{return []}};
const parse=a=>{try{return new URL(a.getAttribute('href'),document.baseURI)}catch{return null}};
const urlType=u=>u?.origin===here.origin?pageTypes[u.pathname.split('/').pop()]||null:null;
const absolute=e=>{let parts=[];for(let n=e;n?.nodeType===1;n=n.parentElement){let i=1;for(let s=n.previousElementSibling;s;s=s.previousElementSibling)if(s.localName===n.localName)i++;parts.unshift(n.localName+'['+i+']')}return '/'+parts.join('/')};
const root=document.querySelector('#codestocheader');
const registrySelector='#codestocheader a[href*="codesTOCSelected.xhtml"]';
const registryXPath='//*[@id="codestocheader"]//a[contains(@href,"codesTOCSelected.xhtml")]';
const profile=profiles.find(p=>{let u=new URL(p.url);return u.origin===here.origin&&u.pathname===here.pathname&&(u.searchParams.get('tocCode')||u.searchParams.get('lawCode')||null)===code});
const selectors=[...new Set([...(profile?.summary||[]).map(s=>s.selector),registrySelector,'.codes_const a[href]','.codesIndexTblLeftdiv a[href]','.codesIndexTblMiddiv a[href]','.codesIndexTblRightdiv a[href]','a[href*="codes_displayexpandedbranch.xhtml"]','a[href*="codedisplayexpand.xhtml"]','a[href*="codes_displayText.xhtml"]','a[href*="codes_displaySection.xhtml"]','a[href*="codeBillCrossRef.xhtml"]','a[href*="displayCodeAndBill.xhtml"]','a[href*="asAmendsTheBill.xhtml"]','a[onclick]','a[href^="javascript:"]','form a[href]','a[href]','script','style','form','link[rel~="stylesheet"]'])];
// Individual matches: independent CSS and XPath identity, including non-element nodes.
function matchEach(capture){
 const live=new Map(), reverse=new Map(), stack=[document];
 while(stack.length){const n=stack.pop(); const id=live.size;live.set(id,n);reverse.set(n,id);for(let i=n.childNodes.length-1;i>=0;i--)stack.push(n.childNodes[i]);}
 const paths=new Map([[document,'']]), cssPaths=new Map();
 function loc(n){if(paths.has(n))return paths.get(n);const p=loc(n.parentNode);let i=1;for(let s=n.previousSibling;s;s=s.previousSibling)if(s.nodeType===n.nodeType&&(n.nodeType!==1||(s.localName===n.localName&&s.namespaceURI===n.namespaceURI)))i++;
 const step=n.nodeType===1?`*[local-name()=${literal(n.localName)} and namespace-uri()=${literal(n.namespaceURI||'')}][${i}]`:n.nodeType===3?'text()['+i+']':n.nodeType===8?'comment()['+i+']':'node()['+(Array.from(n.parentNode.childNodes).indexOf(n)+1)+']';const path=p+'/'+step;paths.set(n,path);return path;}
 function literal(s){return !s.includes("'")?"'"+s+"'":!s.includes('"')?'"'+s+'"':'concat('+s.split("'").map(x=>"'"+x+"'").join(',"\'",')+')';}
 function cpath(n){if(cssPaths.has(n))return cssPaths.get(n);const index=Array.from(n.parentNode.children).indexOf(n)+1;const s=n.parentElement?cpath(n.parentElement)+' > *:nth-child('+index+')':':root';cssPaths.set(n,s);return s;}
 const rows=[];
 function inspect(id,category,attribute=null){const n=live.get(id),el=n.nodeType===1?n:n.parentElement;const selector=el?cpath(el):null;const x=loc(n)+(attribute!==null?'/@*[name()='+literal(attribute)+']':'');const expected=attribute!==null?n.getAttributeNode(attribute):n;const cc=selector?css(selector):[];const xx=n===document?[document]:xp(x);let cssValid=null;if(el){if(n.nodeType===1)cssValid=cc.length===1&&cc[0]===n&&(attribute===null||cc[0].getAttributeNode(attribute)===expected);else cssValid=cc.length===1&&cc[0].childNodes[Array.from(el.childNodes).indexOf(n)]===n;}
 const xpathValid=xx.length===1&&xx[0]===expected;const value=attribute!==null?n.getAttribute(attribute):n.nodeType===1?null:n.nodeValue;
 return {id:rows.length+1,nodeId:id,category,tag:n.localName||null,nodeType:n.nodeType,attribute,value,cssSelector:selector,cssMode:attribute!==null?'OWNER_PLUS_ATTRIBUTE':n.nodeType===1?'DIRECT':el?'PARENT_PLUS_CHILD_ORDINAL':'NOT_APPLICABLE',xpath:x||'/',cssMatches:selector?cc.length:null,xpathMatches:xx.length,cssValid,xpathValid,status:xpathValid&&cssValid!==false?'MATCH': 'FAIL',parentId:reverse.get(n.parentNode)??null};}
 for(const [id,n] of live)if(n.nodeType!==9&&n.nodeType!==10){rows.push(inspect(id,'DOM_NODE'));if(n.nodeType===1)for(const a of n.attributes)rows.push(inspect(id,'ALL_ATTRIBUTES',a.name));}
 for(const [category,items] of Object.entries(capture.categories))for(const item of items)rows.push(inspect(item.id,category,item.attribute));
 const groups={};for(const r of rows){const g=groups[r.category]??={total:0,matched:0,failed:0,cssApplicable:0};g.total++;g[r.status==='MATCH'?'matched':'failed']++;if(r.cssValid!==null)g.cssApplicable++;}
 return {rows,groups,live,summary:{total:rows.length,matched:rows.filter(r=>r.status==='MATCH').length,failed:rows.filter(r=>r.status==='FAIL').length,mode:'current snapshot locator round-trip; not historical verification'}};
}

// Metadata V6: synchronous capture, asynchronous optional SHA-256/ZIP export.
function enrichMetadata(r,a,i){
 const u=new URL(a.href), path=r.fullXPath, parent=a.parentElement, box=a.getBoundingClientRect(), style=getComputedStyle(a);
 const walker=document.createTreeWalker(a,NodeFilter.SHOW_COMMENT),comments=[];while(walker.nextNode())comments.push(walker.currentNode.nodeValue);
 const ancestors=[];for(let n=parent;n;n=n.parentElement)ancestors.push({tag:n.localName,id:n.id||null,classes:[...n.classList],xpath:absolute(n)});
 return {identity:{key:'CA:CODE:'+r.code,parentKey:'CA:ROOT',order:i+1,columnOrder:r.location.columnOrder},navigation:{rawHref:a.getAttribute('href'),scheme:u.protocol.slice(0,-1),host:u.host,path:u.pathname,queryRaw:u.search.slice(1),parameters:[...u.searchParams],fragment:u.hash.slice(1),destinationType:'toc',target:a.target,rel:a.rel},dom:{tag:a.localName,namespace:a.namespaceURI,attributes:Object.fromEntries([...a.attributes].map(x=>[x.name,x.value])),text:a.textContent,visibleText:a.innerText,innerHTML:a.innerHTML,comments,pathSteps:[...path.matchAll(/\/([^/\[]+)\[(\d+)\]/g)].map(m=>({tag:m[1],index:Number(m[2])})),depth:ancestors.length,parentXPath:parent?absolute(parent):null,ancestors,childNodes:a.childNodes.length,childElements:a.children.length,previousSibling: a.previousElementSibling?absolute(a.previousElementSibling):null,nextSibling:a.nextElementSibling?absolute(a.nextElementSibling):null},presentation:{viewport:box.toJSON(),display:style.display,visibility:style.visibility,opacity:style.opacity,color:style.color,fontSize:style.fontSize,tabIndex:a.tabIndex,ariaLabel:a.getAttribute('aria-label')},integrity:{elementUTF8Bytes:bytes(r.element).length,elementSHA256:null,validationOrigin:'current browser locator checks'},provenance:{sourceURL:location.href,pageTitle:document.title,baseURI:document.baseURI,characterSet:document.characterSet,capturedAt:new Date().toISOString(),viewport:{width:innerWidth,height:innerHeight},engine:'V6'}};
}

function run(){
 const start=performance.now();
 const capture=captureUnified(selectors);
 const each=matchEach(capture);
 const records=type==='registry'&&root?css(registrySelector).map((a,i)=>{
  const u=parse(a),c=u?.searchParams.get('tocCode'),raw=a.getAttribute('href');
  const literal=v=>!v.includes("'")?"'"+v+"'":!v.includes('"')?'"'+v+'"':'concat('+v.split("'").map(x=>"'"+x+"'").join(',"\'",')+')';
  const cssSelector='#codestocheader a[href='+CSS.escape(raw)+']';
  const xpath='//*[@id="codestocheader"]//a[@href='+literal(raw)+']';
  const fullXPath=absolute(a), cs=css(cssSelector),xs=xp(xpath),fs=xp(fullXPath);
  const column=a.closest('.codes_const,.codesIndexTblLeftdiv,.codesIndexTblMiddiv,.codesIndexTblRightdiv');
  const structural=each.rows.find(r=>r.category==='DOM_NODE'&&each.live.get(r.nodeId)===a);
  const fullCSS=structural?.cssSelector??null;
  const box=a.getBoundingClientRect();const headingElement=a.closest('h1,h2,h3,h4,h5,h6,[role="heading"]');
  const parent=a.parentElement; const containerClass=column?.className||'';
  return {id:i+1,code:c,title:norm(a.textContent),heading:norm(a.textContent),headingTag:headingElement?.localName??null,headingType:headingElement?'heading element':'code link label',
   css:cssSelector,cssSelector,fullCSS,xpath,fullXPath,location:{page:here.href,containerId:root.id,containerClass,columnXPath:column?absolute(column):null,parentXPath:parent?absolute(parent):null,documentOrder:i+1,columnOrder:column?[...column.querySelectorAll('a[href*="codesTOCSelected.xhtml"]')].indexOf(a)+1:null,viewport:{x:box.x,y:box.y,width:box.width,height:box.height},documentPosition:{x:box.x+scrollX,y:box.y+scrollY}},containerClass,
   element:a.outerHTML,tag:a.localName,attributes:Object.fromEntries([...a.attributes].map(x=>[x.name,x.value])),nodeId:structural?.nodeId??null,
   jsSelector:'document.querySelector('+JSON.stringify(cssSelector)+')',jsXPath:'document.evaluate('+JSON.stringify(xpath)+',document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null).singleNodeValue',
   cssMatches:cs.length,xpathMatches:xs.length,fullXPathMatches:fs.length,cssValid:cs.length===1&&cs[0]===a,xpathValid:xs.length===1&&xs[0]===a,fullXPathValid:fs.length===1&&fs[0]===a,fullCSSValid:fullCSS?css(fullCSS).length===1&&css(fullCSS)[0]===a:false,
   rawHref:raw,url:u?.href,tocURL:u?.href,expandedURL:codes.has(c)?new URL('/faces/codedisplayexpand.xhtml?tocCode='+c,here.origin).href:null,validCode:codes.has(c)&&urlType(u)==='toc'};
 }):[];
 for(const [i,r] of records.entries()){const a=each.live.get(r.nodeId);if(a)r.metadata=enrichMetadata(r,a,i);}
 const seen=new Set(records.map(r=>r.code));const summary={total:records.length,cssPassed:records.filter(r=>r.cssValid).length,xpathPassed:records.filter(r=>r.xpathValid).length,failed:records.filter(r=>!r.cssValid||!r.xpathValid||!r.fullXPathValid||!r.fullCSSValid||!r.validCode).map(r=>r.code),missing:[...codes].filter(c=>!seen.has(c)),unexpected:[...seen].filter(c=>!codes.has(c)),duplicates:records.filter((r,i)=>records.findIndex(x=>x.code===r.code)!==i).map(r=>r.code)};
 summary.pass=type==='registry'?records.length===30&&!summary.failed.length&&!summary.missing.length&&!summary.unexpected.length&&!summary.duplicates.length:null;
 const live=css('a');const links=live.map((a,i)=>{const u=parse(a),dest=urlType(u),c=u?.searchParams.get('tocCode')||u?.searchParams.get('lawCode')||null;const path=absolute(a);return {id:i+1,text:norm(a.textContent),xpath:path,xpathValid:xp(path).length===1&&xp(path)[0]===a,raw:a.getAttribute('href'),url:u?.href||null,destination:dest,code:c,parameters:u?Array.from(u.searchParams.entries()):[],nodeTreePath:u?[...u.searchParams].find(([k])=>k.toLowerCase()==='nodetreepath')?.[1]||null:null,onclick:a.getAttribute('onclick'),status:dest?(code&&c&&code!==c?'CROSS_CODE_REVIEW':c&&!codes.has(c)?'UNKNOWN_CODE':'DISCOVERED'):'OTHER'}});
 const targets=(profile?.targets||[]).map((t,i)=>{const found=new Map();for(const [m,els] of [['CSS',css(t.path)],['XPath',xp(t.xpath)],['Full XPath',xp(t.fullXPath)],['Selector',(t.selectors||[]).flatMap(css)]])for(const e of els)if(e.localName===t.tag&&norm(e.textContent)===norm(t.text)&&Object.entries(t.attributes).every(([k,v])=>e.getAttribute(k)===v)){if(!found.has(e))found.set(e,[]);found.get(e).push(m)}const candidates=[...found.keys()];return{id:i+1,text:t.text,status:candidates.length===1?'MATCH':candidates.length?'AMBIGUOUS':'MISSING',element:candidates.length===1?candidates[0]:null,methods:candidates.length===1?found.get(candidates[0]):[],expected:t}});
 const counts=new Map();for(const r of targets)if(r.element)counts.set(r.element,(counts.get(r.element)||0)+1);for(const r of targets)if(counts.get(r.element)>1){r.status='COLLISION';r.element=null}
 const comparisons=capture.matches.map(m=>{const old=profile?.summary.find(s=>s.selector===m.selector);return {selector:m.selector,expected:old?.count??null,actual:m.ids.length,error:m.error||null,agreement:old&&!old.error&&!old.truncated&&!m.error?old.count===m.ids.length:null}});
 const report={format:'CA-LIVE-TARGET-V8',each:{rows:each.rows,groups:each.groups,summary:each.summary},url:here.href,type,code,capturedAt:new Date().toISOString(),historicalProfile:profile?.url||null,validationMode:profile?'historical signatures + live discovery':'live discovery only',summary,records,links,targets:targets.map(({element,...r})=>r),comparisons,capture,elapsedMs:performance.now()-start};
 window.CA_EACH={records:each.rows,summary:each.summary,groups:each.groups,find:q=>each.rows.filter(r=>r.category===q),get:id=>each.live.get(id),failed:()=>each.rows.filter(r=>r.status!=='MATCH'),download:()=>download('CA_MATCH_EACH.txt',json({rows:each.rows,groups:each.groups,summary:each.summary}))};
 console.table(each.groups);
 window.CA_MATCH_ALL={summary,records,get:c=>records.find(r=>r.code===c),download:()=>download('CA_PAGE01_MATCH_ALL.txt',json({summary,records}))};window.CA_CAPTURE=capture;
 const metadataReady=Promise.all(records.filter(r=>r.metadata).map(async r=>{r.metadata.integrity.elementSHA256=await hash(bytes(r.element));}));
 window.CA_METADATA={records,ready:metadataReady,get:c=>records.find(r=>r.code===c),download:async()=>{await metadataReady;download('CA_METADATA_30_CODES.txt',json(records));}};
 const indexReady=metadataReady.then(()=>CA_INDEX_ENGINE.build(records)).then(data=>{report.indexV7=data;return data});
 window.CA_INDEX={ready:indexReady,get:async c=>(await indexReady).rows.find(r=>r.code===c),restore:async()=>CA_INDEX_ENGINE.unpack((await indexReady).compact),download:async()=>download('CA_INDEX_V7.txt',json(await indexReady)),compare:async old=>CA_INDEX_ENGINE.compare(old,await indexReady)};
 const syntaxReady=indexReady.then(()=>CA_SYNTAX_ENGINE.build(records)).then(data=>{report.syntaxV8=data;return data});
 const legalReady=CARegistryV10.extract().then(data=>{report.legalV11=data;return data});
 window.CA_LEGAL={ready:legalReady};
 window.CA_AST={ready:syntaxReady,get:async c=>{const d=await syntaxReady;const r=d.rows.find(x=>x.code===c);return r?Object.fromEntries(Object.entries(r.refs).map(([k,id])=>[k,d.entries[id]])):null},download:async()=>download("CA_AST_V8.txt",json(await syntaxReady))};
 window.CA_TARGET={report,results:targets,selectors:comparisons,anchors:links,get:id=>targets.find(r=>r.id===id)?.element||null,find:q=>links.filter(r=>r.text.toLowerCase().includes(String(q).toLowerCase())),query:s=>css(s),xpath:s=>xp(s),refresh:()=>{const open=!!document.getElementById('ca-v8-command-panel');document.getElementById('ca-v8-command-panel')?.remove();run();if(open)window.CA_MENU?.();},download:()=>download('CA_FULL_ANALYSIS.txt',json(report)),zip:async()=>{await Promise.all([syntaxReady,legalReady]);return exportZip(report)}};
 console.table(records.length?records.map(({code,heading,css,xpath,fullXPath,location,element,jsSelector,url,cssValid,xpathValid,fullXPathValid})=>({code,heading,css,xpath,fullXPath,location:location.containerClass,element,jsSelector,url,cssValid,xpathValid,fullXPathValid})):links.filter(r=>r.destination));console.table(comparisons);console.info('CA_TARGET ready', {type,code,summary,matched:targets.filter(r=>r.status==='MATCH').length,elapsedMs:report.elapsedMs});return report;
}
function download(name,content){const u=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000)}
async function exportZip(r){const files=new Map();const put=(name,v)=>files.set(name,bytes(typeof v==='string'?v:json(v)));put('CA_FULL_ANALYSIS.txt',r);if(r.legalV11){put('legal/statute_chain.json',r.legalV11.statuteChain);put('legal/jsf_protocol.json',r.legalV11.jsfProtocol);put('legal/expanded_hierarchy.json',r.legalV11.expandedHierarchy??[]);put('legal/registry.jsonl',[...r.legalV11.statutoryRecords,...(r.legalV11.bill?[r.legalV11.bill]:[])].map(x=>JSON.stringify(x)).join('\n'));put('legal/decoded_urls.txt',legalURLs(r.legalV11).join('\n'));if(r.legalV11.focused)put('legal/focused.json',r.legalV11.focused);if(r.legalV11.status){const t=r.legalV11.status;put('legal/status.jsonl',JSON.stringify(t));put('legal/status_summary.json',t.summary);put('legal/status_stages.jsonl',t.stages.map(x=>JSON.stringify(x)).join('\n'));put('legal/status_findings.json',t.findings);}if(r.legalV11.versionComparison){const c=r.legalV11.versionComparison;put('legal/version_comparison.jsonl',c.records.map(x=>JSON.stringify(x)).join('\n'));put('legal/version_comparison_summary.json',c.summary);put('legal/version_comparison_jobs.json',c.jobs);put('legal/version_comparison_findings.json',c.findings);put('legal/version_matrix.json',c.matrix);put('legal/version_lineage.json',c.lineage);}if(r.legalV11.comparison){const c=r.legalV11.comparison;put('legal/comparison.jsonl',c.records.map(x=>JSON.stringify(x)).join('\n'));put('legal/comparison_summary.json',c.summary);put('legal/comparison_jobs.json',c.jobs);put('legal/comparison_findings.json',c.findings);}if(r.legalV11.analysis){const a=r.legalV11.analysis;put('legal/analysis.jsonl',a.records.map(x=>JSON.stringify(x)).join('\n'));put('legal/analysis_summary.json',a.summary);put('legal/analysis_jobs.jsonl',a.jobs.map(x=>JSON.stringify(x)).join('\n'));put('legal/analysis_findings.json',a.findings);}if(r.legalV11.history){put('legal/history.jsonl',r.legalV11.history.events.map(x=>JSON.stringify(x)).join('\n'));put('legal/history_summary.json',r.legalV11.history.summary);put('legal/history_findings.json',r.legalV11.history.findings);}if(r.legalV11.navigationIntelligence){const n=r.legalV11.navigationIntelligence;put('legal/navigation.json',n);put('legal/worker_jobs.jsonl',n.jobs.map(x=>JSON.stringify(x)).join('\n'));put('legal/version_jobs.json',n.versionTasks);}if(r.legalV11.bill?.votes){put('legal/votes.jsonl',r.legalV11.bill.votes.map(x=>JSON.stringify(x)).join('\n'));put('legal/vote_summary.json',r.legalV11.bill.voteSummary);put('legal/ballots.jsonl',r.legalV11.bill.votes.flatMap(x=>x.observations).map(x=>JSON.stringify(x)).join('\n'));}}put('CA_METADATA_30_CODES.txt',r.records);for(const row of r.records)if(row.metadata)put('metadata/'+row.code+'.txt',row);put('matching/CA_MATCH_EACH.txt',r.each);for(const k of Object.keys(r.each.groups))put('matching/CA_MATCH_'+k+'.txt',r.each.rows.filter(x=>x.category===k));put('CA_PAGE01_MATCH_ALL.txt',{summary:r.summary,records:r.records});put('CA_CSS_MATCH_MATRIX.txt',r.comparisons);put('CA_DOM_MATCHES.txt',r.capture.nodes);put('CA_ANCHOR_MATCHES.txt',r.links);put('CA_UNIQUE_URLS.txt',[...new Set(r.links.map(x=>x.url).filter(Boolean))]);put('CA_FULL_CSS_DOM_XPATH_ANCHORS.txt',r);put('original.html.txt',r.capture.doctype+'\n'+r.capture.html);put('javascript/CA_JAVASCRIPT_STITCHED.txt',{scripts:r.capture.scripts,handlers:r.capture.handlers});put('javascript/CA_CSSOM.txt',r.capture.stylesheets);for(const [k,v] of Object.entries(r.capture.categories))put('components/CA_'+k+'.txt',v.map(x=>({...x,node:r.capture.nodes[x.id]})));put('components/CA_ALL_COMPONENTS.txt',r.capture.categories);put('components/CA_COMPONENT_SUMMARY.txt',Object.fromEntries(Object.entries(r.capture.categories).map(([k,v])=>[k,v.length])));if(r.indexV7){put('indexes/CA_INDEX_V7.txt',r.indexV7);put('indexes/CA_COMPACT.txt',JSON.stringify(r.indexV7.compact));put('indexes/CA_BENCHMARK.txt',r.indexV7.summary);for(const [k,v] of Object.entries(r.indexV7.indexes))put('indexes/'+k+'.txt',v);put('indexes/CA_RELATIONS.txt',r.indexV7.edges);put('indexes/CA_SPARSE.txt',r.indexV7.sparse);}if(r.syntaxV8){put("syntax/CA_AST_V8.txt",r.syntaxV8);put("syntax/CA_AST_SUMMARY.txt",r.syntaxV8.summary);for(const mode of ["css","xpath","js","html"])put("syntax/"+mode+".txt",r.syntaxV8.entries.filter(e=>e.mode===mode));}if(window.CA_COMMANDS)put('CA_BASELINE_AUDIT.txt',window.CA_COMMANDS.baseline());const manifest={url:r.url,capturedAt:r.capturedAt,files:{}};for(const [k,b] of files)manifest.files[k]={bytes:b.length,sha256:await hash(b)};put('manifest.json',manifest);const blob=zip(files);download('CA_'+(r.code||'ROOT')+'_'+r.type+'_'+Date.now()+'.zip',blob);return blob}
run();
})();


const baseline = [{"code":"CONS","heading":"California Constitution - CONS","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=CONS\\&tocTitle\\=\\+California\\+Constitution\\+-\\+CONS]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=CONS&tocTitle=+California+Constitution+-+CONS']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[1]/div[1]/a[1]","location":"codes_const","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=CONS&amp;tocTitle=+California+Constitution+-+CONS\">  <!--value=\"{code_BackinBean.con}\"--> California Constitution - CONS\n                                <!--&lt;h:outputText value=\"{code_BackinBean.codeBean.code}\" /&gt;-->\n                                <!--&lt;f:param name=\"code\" value=\"{code_BackinBean.codeBean.code}\"&gt;&lt;/f:param&gt;-->\n                                 <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@1c8aadca\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=CONS\\\\&tocTitle\\\\=\\\\+California\\\\+Constitution\\\\+-\\\\+CONS]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=CONS&tocTitle=+California+Constitution+-+CONS","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"BPC","heading":"Business and Professions Code - BPC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=BPC\\&tocTitle\\=\\+Business\\+and\\+Professions\\+Code\\+-\\+BPC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=BPC&tocTitle=+Business+and+Professions+Code+-+BPC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[1]/a[1]","location":"codesIndexTblLeftdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=BPC&amp;tocTitle=+Business+and+Professions+Code+-+BPC\"> <!--value=\"{code_BackinBean.fcol}\"--> Business and Professions Code - BPC\n\n<!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@121cabe3\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=BPC\\\\&tocTitle\\\\=\\\\+Business\\\\+and\\\\+Professions\\\\+Code\\\\+-\\\\+BPC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=BPC&tocTitle=+Business+and+Professions+Code+-+BPC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"CIV","heading":"Civil Code - CIV","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=CIV\\&tocTitle\\=\\+Civil\\+Code\\+-\\+CIV]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=CIV&tocTitle=+Civil+Code+-+CIV']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[2]/a[1]","location":"codesIndexTblLeftdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=CIV&amp;tocTitle=+Civil+Code+-+CIV\"> <!--value=\"{code_BackinBean.fcol}\"--> Civil Code - CIV\n\n<!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@61e3526d\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=CIV\\\\&tocTitle\\\\=\\\\+Civil\\\\+Code\\\\+-\\\\+CIV]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=CIV&tocTitle=+Civil+Code+-+CIV","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"CCP","heading":"Code of Civil Procedure - CCP","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=CCP\\&tocTitle\\=\\+Code\\+of\\+Civil\\+Procedure\\+-\\+CCP]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=CCP&tocTitle=+Code+of+Civil+Procedure+-+CCP']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[3]/a[1]","location":"codesIndexTblLeftdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=CCP&amp;tocTitle=+Code+of+Civil+Procedure+-+CCP\"> <!--value=\"{code_BackinBean.fcol}\"--> Code of Civil Procedure - CCP\n\n<!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@62a6af74\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=CCP\\\\&tocTitle\\\\=\\\\+Code\\\\+of\\\\+Civil\\\\+Procedure\\\\+-\\\\+CCP]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=CCP&tocTitle=+Code+of+Civil+Procedure+-+CCP","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"COM","heading":"Commercial Code - COM","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=COM\\&tocTitle\\=\\+Commercial\\+Code\\+-\\+COM]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=COM&tocTitle=+Commercial+Code+-+COM']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[4]/a[1]","location":"codesIndexTblLeftdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=COM&amp;tocTitle=+Commercial+Code+-+COM\"> <!--value=\"{code_BackinBean.fcol}\"--> Commercial Code - COM\n\n<!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@2b8baa17\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=COM\\\\&tocTitle\\\\=\\\\+Commercial\\\\+Code\\\\+-\\\\+COM]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=COM&tocTitle=+Commercial+Code+-+COM","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"CORP","heading":"Corporations Code - CORP","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=CORP\\&tocTitle\\=\\+Corporations\\+Code\\+-\\+CORP]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=CORP&tocTitle=+Corporations+Code+-+CORP']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[5]/a[1]","location":"codesIndexTblLeftdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=CORP&amp;tocTitle=+Corporations+Code+-+CORP\"> <!--value=\"{code_BackinBean.fcol}\"--> Corporations Code - CORP\n\n<!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@5c3f5f36\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=CORP\\\\&tocTitle\\\\=\\\\+Corporations\\\\+Code\\\\+-\\\\+CORP]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=CORP&tocTitle=+Corporations+Code+-+CORP","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"EDC","heading":"Education Code - EDC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=EDC\\&tocTitle\\=\\+Education\\+Code\\+-\\+EDC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=EDC&tocTitle=+Education+Code+-+EDC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[6]/a[1]","location":"codesIndexTblLeftdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=EDC&amp;tocTitle=+Education+Code+-+EDC\"> <!--value=\"{code_BackinBean.fcol}\"--> Education Code - EDC\n\n<!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@27340ee6\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=EDC\\\\&tocTitle\\\\=\\\\+Education\\\\+Code\\\\+-\\\\+EDC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=EDC&tocTitle=+Education+Code+-+EDC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"ELEC","heading":"Elections Code - ELEC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=ELEC\\&tocTitle\\=\\+Elections\\+Code\\+-\\+ELEC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=ELEC&tocTitle=+Elections+Code+-+ELEC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[7]/a[1]","location":"codesIndexTblLeftdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=ELEC&amp;tocTitle=+Elections+Code+-+ELEC\"> <!--value=\"{code_BackinBean.fcol}\"--> Elections Code - ELEC\n\n<!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@703ec87b\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=ELEC\\\\&tocTitle\\\\=\\\\+Elections\\\\+Code\\\\+-\\\\+ELEC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=ELEC&tocTitle=+Elections+Code+-+ELEC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"EVID","heading":"Evidence Code - EVID","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=EVID\\&tocTitle\\=\\+Evidence\\+Code\\+-\\+EVID]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=EVID&tocTitle=+Evidence+Code+-+EVID']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[8]/a[1]","location":"codesIndexTblLeftdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=EVID&amp;tocTitle=+Evidence+Code+-+EVID\"> <!--value=\"{code_BackinBean.fcol}\"--> Evidence Code - EVID\n\n<!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@6930f79\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=EVID\\\\&tocTitle\\\\=\\\\+Evidence\\\\+Code\\\\+-\\\\+EVID]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=EVID&tocTitle=+Evidence+Code+-+EVID","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"FAM","heading":"Family Code - FAM","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=FAM\\&tocTitle\\=\\+Family\\+Code\\+-\\+FAM]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=FAM&tocTitle=+Family+Code+-+FAM']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[1]/div[9]/a[1]","location":"codesIndexTblLeftdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=FAM&amp;tocTitle=+Family+Code+-+FAM\"> <!--value=\"{code_BackinBean.fcol}\"--> Family Code - FAM\n\n<!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@20732672\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=FAM\\\\&tocTitle\\\\=\\\\+Family\\\\+Code\\\\+-\\\\+FAM]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=FAM&tocTitle=+Family+Code+-+FAM","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"FIN","heading":"Financial Code - FIN","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=FIN\\&tocTitle\\=\\+Financial\\+Code\\+-\\+FIN]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=FIN&tocTitle=+Financial+Code+-+FIN']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[1]/a[1]","location":"codesIndexTblMiddiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=FIN&amp;tocTitle=+Financial+Code+-+FIN\"> <!--value=\"{code_BackinBean.scol}\"--> Financial Code - FIN\n                                     <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@1b557962\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=FIN\\\\&tocTitle\\\\=\\\\+Financial\\\\+Code\\\\+-\\\\+FIN]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=FIN&tocTitle=+Financial+Code+-+FIN","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"FGC","heading":"Fish and Game Code - FGC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=FGC\\&tocTitle\\=\\+Fish\\+and\\+Game\\+Code\\+-\\+FGC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=FGC&tocTitle=+Fish+and+Game+Code+-+FGC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[2]/a[1]","location":"codesIndexTblMiddiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=FGC&amp;tocTitle=+Fish+and+Game+Code+-+FGC\"> <!--value=\"{code_BackinBean.scol}\"--> Fish and Game Code - FGC\n                                     <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@31fe832f\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=FGC\\\\&tocTitle\\\\=\\\\+Fish\\\\+and\\\\+Game\\\\+Code\\\\+-\\\\+FGC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=FGC&tocTitle=+Fish+and+Game+Code+-+FGC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"FAC","heading":"Food and Agricultural Code - FAC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=FAC\\&tocTitle\\=\\+Food\\+and\\+Agricultural\\+Code\\+-\\+FAC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=FAC&tocTitle=+Food+and+Agricultural+Code+-+FAC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[3]/a[1]","location":"codesIndexTblMiddiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=FAC&amp;tocTitle=+Food+and+Agricultural+Code+-+FAC\"> <!--value=\"{code_BackinBean.scol}\"--> Food and Agricultural Code - FAC\n                                     <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@2c9147ec\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=FAC\\\\&tocTitle\\\\=\\\\+Food\\\\+and\\\\+Agricultural\\\\+Code\\\\+-\\\\+FAC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=FAC&tocTitle=+Food+and+Agricultural+Code+-+FAC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"GOV","heading":"Government Code - GOV","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=GOV\\&tocTitle\\=\\+Government\\+Code\\+-\\+GOV]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=GOV&tocTitle=+Government+Code+-+GOV']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[4]/a[1]","location":"codesIndexTblMiddiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=GOV&amp;tocTitle=+Government+Code+-+GOV\"> <!--value=\"{code_BackinBean.scol}\"--> Government Code - GOV\n                                     <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@6a8e056c\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=GOV\\\\&tocTitle\\\\=\\\\+Government\\\\+Code\\\\+-\\\\+GOV]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=GOV&tocTitle=+Government+Code+-+GOV","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"HNC","heading":"Harbors and Navigation Code - HNC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=HNC\\&tocTitle\\=\\+Harbors\\+and\\+Navigation\\+Code\\+-\\+HNC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=HNC&tocTitle=+Harbors+and+Navigation+Code+-+HNC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[5]/a[1]","location":"codesIndexTblMiddiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=HNC&amp;tocTitle=+Harbors+and+Navigation+Code+-+HNC\"> <!--value=\"{code_BackinBean.scol}\"--> Harbors and Navigation Code - HNC\n                                     <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@5a20ef36\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=HNC\\\\&tocTitle\\\\=\\\\+Harbors\\\\+and\\\\+Navigation\\\\+Code\\\\+-\\\\+HNC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=HNC&tocTitle=+Harbors+and+Navigation+Code+-+HNC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"HSC","heading":"Health and Safety Code - HSC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=HSC\\&tocTitle\\=\\+Health\\+and\\+Safety\\+Code\\+-\\+HSC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=HSC&tocTitle=+Health+and+Safety+Code+-+HSC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[6]/a[1]","location":"codesIndexTblMiddiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=HSC&amp;tocTitle=+Health+and+Safety+Code+-+HSC\"> <!--value=\"{code_BackinBean.scol}\"--> Health and Safety Code - HSC\n                                     <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@1f82e8a6\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=HSC\\\\&tocTitle\\\\=\\\\+Health\\\\+and\\\\+Safety\\\\+Code\\\\+-\\\\+HSC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=HSC&tocTitle=+Health+and+Safety+Code+-+HSC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"INS","heading":"Insurance Code - INS","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=INS\\&tocTitle\\=\\+Insurance\\+Code\\+-\\+INS]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=INS&tocTitle=+Insurance+Code+-+INS']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[7]/a[1]","location":"codesIndexTblMiddiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=INS&amp;tocTitle=+Insurance+Code+-+INS\"> <!--value=\"{code_BackinBean.scol}\"--> Insurance Code - INS\n                                     <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@390a729d\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=INS\\\\&tocTitle\\\\=\\\\+Insurance\\\\+Code\\\\+-\\\\+INS]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=INS&tocTitle=+Insurance+Code+-+INS","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"LAB","heading":"Labor Code - LAB","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=LAB\\&tocTitle\\=\\+Labor\\+Code\\+-\\+LAB]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=LAB&tocTitle=+Labor+Code+-+LAB']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[8]/a[1]","location":"codesIndexTblMiddiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=LAB&amp;tocTitle=+Labor+Code+-+LAB\"> <!--value=\"{code_BackinBean.scol}\"--> Labor Code - LAB\n                                     <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@2335a5b5\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=LAB\\\\&tocTitle\\\\=\\\\+Labor\\\\+Code\\\\+-\\\\+LAB]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=LAB&tocTitle=+Labor+Code+-+LAB","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"MVC","heading":"Military and Veterans Code - MVC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=MVC\\&tocTitle\\=\\+Military\\+and\\+Veterans\\+Code\\+-\\+MVC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=MVC&tocTitle=+Military+and+Veterans+Code+-+MVC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[9]/a[1]","location":"codesIndexTblMiddiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=MVC&amp;tocTitle=+Military+and+Veterans+Code+-+MVC\"> <!--value=\"{code_BackinBean.scol}\"--> Military and Veterans Code - MVC\n                                     <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@7eb1a7ba\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=MVC\\\\&tocTitle\\\\=\\\\+Military\\\\+and\\\\+Veterans\\\\+Code\\\\+-\\\\+MVC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=MVC&tocTitle=+Military+and+Veterans+Code+-+MVC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"PEN","heading":"Penal Code - PEN","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=PEN\\&tocTitle\\=\\+Penal\\+Code\\+-\\+PEN]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=PEN&tocTitle=+Penal+Code+-+PEN']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[2]/div[10]/a[1]","location":"codesIndexTblMiddiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=PEN&amp;tocTitle=+Penal+Code+-+PEN\"> <!--value=\"{code_BackinBean.scol}\"--> Penal Code - PEN\n                                     <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@76fea712\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=PEN\\\\&tocTitle\\\\=\\\\+Penal\\\\+Code\\\\+-\\\\+PEN]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=PEN&tocTitle=+Penal+Code+-+PEN","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"PROB","heading":"Probate Code - PROB","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=PROB\\&tocTitle\\=\\+Probate\\+Code\\+-\\+PROB]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=PROB&tocTitle=+Probate+Code+-+PROB']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[1]/a[1]","location":"codesIndexTblRightdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=PROB&amp;tocTitle=+Probate+Code+-+PROB\"> <!--value=\"true\"--> Probate Code - PROB\n\n <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@535bf509\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=PROB\\\\&tocTitle\\\\=\\\\+Probate\\\\+Code\\\\+-\\\\+PROB]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=PROB&tocTitle=+Probate+Code+-+PROB","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"PCC","heading":"Public Contract Code - PCC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=PCC\\&tocTitle\\=\\+Public\\+Contract\\+Code\\+-\\+PCC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=PCC&tocTitle=+Public+Contract+Code+-+PCC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[2]/a[1]","location":"codesIndexTblRightdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=PCC&amp;tocTitle=+Public+Contract+Code+-+PCC\"> <!--value=\"true\"--> Public Contract Code - PCC\n\n <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@572c4317\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=PCC\\\\&tocTitle\\\\=\\\\+Public\\\\+Contract\\\\+Code\\\\+-\\\\+PCC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=PCC&tocTitle=+Public+Contract+Code+-+PCC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"PRC","heading":"Public Resources Code - PRC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=PRC\\&tocTitle\\=\\+Public\\+Resources\\+Code\\+-\\+PRC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=PRC&tocTitle=+Public+Resources+Code+-+PRC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[3]/a[1]","location":"codesIndexTblRightdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=PRC&amp;tocTitle=+Public+Resources+Code+-+PRC\"> <!--value=\"true\"--> Public Resources Code - PRC\n\n <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@ee7bc48\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=PRC\\\\&tocTitle\\\\=\\\\+Public\\\\+Resources\\\\+Code\\\\+-\\\\+PRC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=PRC&tocTitle=+Public+Resources+Code+-+PRC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"PUC","heading":"Public Utilities Code - PUC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=PUC\\&tocTitle\\=\\+Public\\+Utilities\\+Code\\+-\\+PUC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=PUC&tocTitle=+Public+Utilities+Code+-+PUC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[4]/a[1]","location":"codesIndexTblRightdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=PUC&amp;tocTitle=+Public+Utilities+Code+-+PUC\"> <!--value=\"true\"--> Public Utilities Code - PUC\n\n <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@6327020b\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=PUC\\\\&tocTitle\\\\=\\\\+Public\\\\+Utilities\\\\+Code\\\\+-\\\\+PUC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=PUC&tocTitle=+Public+Utilities+Code+-+PUC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"RTC","heading":"Revenue and Taxation Code - RTC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=RTC\\&tocTitle\\=\\+Revenue\\+and\\+Taxation\\+Code\\+-\\+RTC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=RTC&tocTitle=+Revenue+and+Taxation+Code+-+RTC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[5]/a[1]","location":"codesIndexTblRightdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=RTC&amp;tocTitle=+Revenue+and+Taxation+Code+-+RTC\"> <!--value=\"true\"--> Revenue and Taxation Code - RTC\n\n <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@6f5850db\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=RTC\\\\&tocTitle\\\\=\\\\+Revenue\\\\+and\\\\+Taxation\\\\+Code\\\\+-\\\\+RTC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=RTC&tocTitle=+Revenue+and+Taxation+Code+-+RTC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"SHC","heading":"Streets and Highways Code - SHC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=SHC\\&tocTitle\\=\\+Streets\\+and\\+Highways\\+Code\\+-\\+SHC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=SHC&tocTitle=+Streets+and+Highways+Code+-+SHC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[6]/a[1]","location":"codesIndexTblRightdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=SHC&amp;tocTitle=+Streets+and+Highways+Code+-+SHC\"> <!--value=\"true\"--> Streets and Highways Code - SHC\n\n <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@5a5992dc\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=SHC\\\\&tocTitle\\\\=\\\\+Streets\\\\+and\\\\+Highways\\\\+Code\\\\+-\\\\+SHC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=SHC&tocTitle=+Streets+and+Highways+Code+-+SHC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"UIC","heading":"Unemployment Insurance Code - UIC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=UIC\\&tocTitle\\=\\+Unemployment\\+Insurance\\+Code\\+-\\+UIC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=UIC&tocTitle=+Unemployment+Insurance+Code+-+UIC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[7]/a[1]","location":"codesIndexTblRightdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=UIC&amp;tocTitle=+Unemployment+Insurance+Code+-+UIC\"> <!--value=\"true\"--> Unemployment Insurance Code - UIC\n\n <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@69ef6023\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=UIC\\\\&tocTitle\\\\=\\\\+Unemployment\\\\+Insurance\\\\+Code\\\\+-\\\\+UIC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=UIC&tocTitle=+Unemployment+Insurance+Code+-+UIC","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"VEH","heading":"Vehicle Code - VEH","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=VEH\\&tocTitle\\=\\+Vehicle\\+Code\\+-\\+VEH]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=VEH&tocTitle=+Vehicle+Code+-+VEH']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[8]/a[1]","location":"codesIndexTblRightdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=VEH&amp;tocTitle=+Vehicle+Code+-+VEH\"> <!--value=\"true\"--> Vehicle Code - VEH\n\n <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@3203104f\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=VEH\\\\&tocTitle\\\\=\\\\+Vehicle\\\\+Code\\\\+-\\\\+VEH]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=VEH&tocTitle=+Vehicle+Code+-+VEH","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"WAT","heading":"Water Code - WAT","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=WAT\\&tocTitle\\=\\+Water\\+Code\\+-\\+WAT]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=WAT&tocTitle=+Water+Code+-+WAT']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[9]/a[1]","location":"codesIndexTblRightdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=WAT&amp;tocTitle=+Water+Code+-+WAT\"> <!--value=\"true\"--> Water Code - WAT\n\n <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@1f70405c\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=WAT\\\\&tocTitle\\\\=\\\\+Water\\\\+Code\\\\+-\\\\+WAT]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=WAT&tocTitle=+Water+Code+-+WAT","cssValid":true,"xpathValid":true,"fullXPathValid":true},{"code":"WIC","heading":"Welfare and Institutions Code - WIC","css":"#codestocheader a[href=\\/faces\\/codesTOCSelected\\.xhtml\\?tocCode\\=WIC\\&tocTitle\\=\\+Welfare\\+and\\+Institutions\\+Code\\+-\\+WIC]","xpath":"//*[@id=\"codestocheader\"]//a[@href='/faces/codesTOCSelected.xhtml?tocCode=WIC&tocTitle=+Welfare+and+Institutions+Code+-+WIC']","fullXPath":"/html[1]/body[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[2]/div[3]/div[10]/a[1]","location":"codesIndexTblRightdiv","element":"<a href=\"/faces/codesTOCSelected.xhtml?tocCode=WIC&amp;tocTitle=+Welfare+and+Institutions+Code+-+WIC\"> <!--value=\"true\"--> Welfare and Institutions Code - WIC\n\n <!--&lt;f:attribute name=\"codeBean\" value=\"beans.CodeBean@929ee1c\" /&gt;--></a>","jsSelector":"document.querySelector(\"#codestocheader a[href=\\\\/faces\\\\/codesTOCSelected\\\\.xhtml\\\\?tocCode\\\\=WIC\\\\&tocTitle\\\\=\\\\+Welfare\\\\+and\\\\+Institutions\\\\+Code\\\\+-\\\\+WIC]\")","url":"https://leginfo.legislature.ca.gov/faces/codesTOCSelected.xhtml?tocCode=WIC&tocTitle=+Welfare+and+Institutions+Code+-+WIC","cssValid":true,"xpathValid":true,"fullXPathValid":true}];
function legalURLs(r){return [...new Set((r.navigationIntelligence?.jobs||[]).map(j=>j.url))];}
const commands = {
 'analysis': ['analysis', async () => (await CA_LEGAL.ready).analysis?.records??[]],
 'analysis-summary': ['analysis-summary', async () => (await CA_LEGAL.ready).analysis?.summary??null],
 'analysis-offices': ['analysis-offices', async () => [...new Set(((await CA_LEGAL.ready).analysis?.records??[]).map(x=>x.analyzingOffice))]],
 'analysis-ids': ['analysis-ids', async () => ((await CA_LEGAL.ready).analysis?.records??[]).map(x=>x.analysisId)],
 'analysis-jobs': ['analysis-jobs', async () => (await CA_LEGAL.ready).analysis?.jobs??[]],
 'analysis-failed': ['analysis-failed', async () => (await CA_LEGAL.ready).analysis?.findings??[]],
 'export-analysis': ['Export analysis JSONL', async () => download('CA_BILL_ANALYSIS.jsonl',((await CA_LEGAL.ready).analysis?.records??[]).map(x=>JSON.stringify(x)).join('\n'))],
 'history': ['history', async () => {const h=(await CA_LEGAL.ready).history;return h?.events??[];}],
 'history-summary': ['history-summary', async () => {const h=(await CA_LEGAL.ready).history;return h?.summary??null;}],
 'timeline': ['timeline', async () => {const h=(await CA_LEGAL.ready).history;return [...(h?.events??[])].sort((a,b)=>(a.date||'').localeCompare(b.date||'')||a.sourceOrder-b.sourceOrder);}],
 'journal-refs': ['journal-refs', async () => {const h=(await CA_LEGAL.ready).history;return (h?.events??[]).filter(e=>e.journalPage!==null);}],
 'history-votes': ['history-votes', async () => {const h=(await CA_LEGAL.ready).history;return (h?.events??[]).filter(e=>e.ayes!==null&&e.noes!==null);}],
 'history-versions': ['history-versions', async () => {const h=(await CA_LEGAL.ready).history;return (h?.events??[]).filter(e=>e.versionCandidates.length);}],
 'history-failed': ['history-failed', async () => {const h=(await CA_LEGAL.ready).history;return h?.findings??[];}],
 'export-history': ['Export history JSONL', async () => download('CA_BILL_HISTORY.jsonl',((await CA_LEGAL.ready).history?.events??[]).map(x=>JSON.stringify(x)).join('\n'))],
 'votes': ['Bill voting events', async () => (await CA_LEGAL.ready).bill?.votes??[]],
 'vote-summary': ['Vote reconciliation summary', async () => (await CA_LEGAL.ready).bill?.voteSummary??null],
 'ballots': ['Individual voting observations', async () => ((await CA_LEGAL.ready).bill?.votes??[]).flatMap(e=>e.observations)],
 'vote-failed': ['Vote detector findings', async () => ((await CA_LEGAL.ready).bill?.votes??[]).flatMap(e=>e.detectors)],
 'export-votes': ['Export voting JSONL', async () => {const r=await CA_LEGAL.ready;const events=r.bill?.votes??[];if(!events.length)throw Error('No voting events on this page');const a=document.createElement('a'),u=URL.createObjectURL(new Blob([events.map(x=>JSON.stringify(x)).join('\n')],{type:'text/plain'}));a.href=u;a.download='CA_BILL_VOTES.jsonl';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}],
 'status': ['status', async () => (await CA_LEGAL.ready).status??null],
 'status-summary': ['status-summary', async () => (await CA_LEGAL.ready).status?.summary??null],
 'status-flags': ['status-flags', async () => (await CA_LEGAL.ready).status?.flags??null],
 'status-authors': ['status-authors', async () => (await CA_LEGAL.ready).status?.authors??null],
 'status-lifecycle': ['status-lifecycle', async () => (await CA_LEGAL.ready).status?.lifecycle??null],
 'status-history': ['status-history', async () => (await CA_LEGAL.ready).status?.recentHistory??null],
 'status-scope': ['status-scope', async () => (await CA_LEGAL.ready).status?.scope??null],
 'status-failed': ['status-failed', async () => (await CA_LEGAL.ready).status?.findings??null],
 'status-stages': ['status-stages', async () => (await CA_LEGAL.ready).status?.stages??null],
 'status-desktop': ['status-desktop', async () => (await CA_LEGAL.ready).status?.desktop??null],
 'status-mobile': ['status-mobile', async () => (await CA_LEGAL.ready).status?.mobile??null],
 'status-css': ['status-css', async () => (await CA_LEGAL.ready).status?.css??null],
 'status-conditions': ['status-conditions', async () => (await CA_LEGAL.ready).status?.conditions??null],
 'status-reconcile': ['status-reconcile', async () => (await CA_LEGAL.ready).status?.reconciliation??null],
 'export-status': ['Export status JSONL', async () => download('CA_STATUS.jsonl',JSON.stringify((await CA_LEGAL.ready).status??null))],
 'version-compare': ['version-compare', async () => (await CA_LEGAL.ready).versionComparison?.records??null],
 'version-compare-summary': ['version-compare-summary', async () => (await CA_LEGAL.ready).versionComparison?.summary??null],
 'version-pairs': ['version-pairs', async () => (await CA_LEGAL.ready).versionComparison?.matrix??null],
 'version-matrix': ['version-matrix', async () => (await CA_LEGAL.ready).versionComparison?.matrix??null],
 'version-lineage': ['version-lineage', async () => (await CA_LEGAL.ready).versionComparison?.lineage??null],
 'version-compare-jobs': ['version-compare-jobs', async () => (await CA_LEGAL.ready).versionComparison?.jobs??null],
 'version-compare-failed': ['version-compare-failed', async () => (await CA_LEGAL.ready).versionComparison?.findings??null],
 'version-deltas': ['Unverified difference markup', async () => ((await CA_LEGAL.ready).versionComparison?.records??[]).map(x=>({canonicalId:x.canonicalId,markupObservations:x.markupObservations}))],
 'export-version-compare': ['Export version comparison JSONL', async () => download('CA_VERSION_COMPARE.jsonl',((await CA_LEGAL.ready).versionComparison?.records??[]).map(x=>JSON.stringify(x)).join('\n'))],
 'export-worker-queue': ['Export all discovered worker plans', async () => {const r=await CA_LEGAL.ready,n=r.navigationIntelligence||{};const jobs=['jobs','versionTasks','analysisTasks','comparisonTasks','versionComparisonTasks','statuteChainTasks'].flatMap(k=>Array.isArray(n[k])?n[k]:[]);download('CA_WORKER_QUEUE.jsonl',jobs.map(j=>JSON.stringify(j)).join('\n'));return {plans:jobs.length};}],
 'statute-chain': ['statute-chain', async () => (await CA_LEGAL.ready).statuteChain??null],
 'statute-chain-jobs': ['statute-chain-jobs', async () => (await CA_LEGAL.ready).statuteChain?.jobs??null],
 'statute-chain-failed': ['statute-chain-failed', async () => (await CA_LEGAL.ready).statuteChain?.findings??null],
 'statute-equivalence': ['statute-equivalence', async () => (await CA_LEGAL.ready).statuteChain?.summary??null],
 'expanded-hierarchy': ['expanded-hierarchy', async () => (await CA_LEGAL.ready).expandedHierarchy??null],
 'jsf-runtime': ['jsf-runtime', async () => (await CA_LEGAL.ready).jsfProtocol??null],
 'export-statute-chain': ['Export statute chain', async () => download('CA_STATUTE_CHAIN.json',json((await CA_LEGAL.ready).statuteChain))],
 'focused': ['Focused legal capture', async () => (await CA_LEGAL.ready).focused],
 'cross-references': ['Observed legislative cross-reference links', async () => (await CA_LEGAL.ready).focused.crossReferenceLinks],
 'bill-sections': ['Historical bill sections', async () => (await CA_LEGAL.ready).bill?.sections??[]],
 'law-amends': ['Law comparison observations', async () => (await CA_LEGAL.ready).comparison??(await CA_LEGAL.ready).focused.endpointEvidence??null],
 'export-focused': ['Export focused JSON', async () => {const r=await CA_LEGAL.ready;download('CA_FOCUSED.json',json({focused:r.focused,statutes:r.statutoryRecords,bill:r.bill,comparison:r.comparison,jobs:r.navigationIntelligence.jobs.filter(j=>j.priority==='CORE')}));}],
 'comparison': ['comparison', async () => (await CA_LEGAL.ready).comparison?.records??null],
 'comparison-summary': ['comparison-summary', async () => (await CA_LEGAL.ready).comparison?.summary??null],
 'comparison-modes': ['comparison-modes', async () => (await CA_LEGAL.ready).comparison?.mode??null],
 'comparison-jobs': ['comparison-jobs', async () => (await CA_LEGAL.ready).comparison?.jobs??null],
 'comparison-failed': ['comparison-failed', async () => (await CA_LEGAL.ready).comparison?.findings??null],
 'comparison-old': ['comparison-old', async () => ((await CA_LEGAL.ready).comparison?.records??[]).map(x=>({canonicalId:x.canonicalId,oldSideCandidate:x.oldSideCandidate}))],
 'comparison-new': ['comparison-new', async () => ((await CA_LEGAL.ready).comparison?.records??[]).map(x=>({canonicalId:x.canonicalId,newSideCandidate:x.newSideCandidate}))],
 'comparison-changes': ['comparison-changes', async () => ((await CA_LEGAL.ready).comparison?.records??[]).map(x=>({canonicalId:x.canonicalId,markupObservations:x.markupObservations}))],
 'export-comparison': ['Export comparison JSONL', async () => download('CA_COMPARISON.jsonl',((await CA_LEGAL.ready).comparison?.records??[]).map(x=>JSON.stringify(x)).join('\n'))],

 'navigation': ['Classified navigation evidence', async () => (await CA_LEGAL.ready).navigationIntelligence],
 'nav-summary': ['Navigation metrics', async () => (await CA_LEGAL.ready).navigationIntelligence.summary],
 'worker-jobs': ['Read-only GET job queue', async () => (await CA_LEGAL.ready).navigationIntelligence.jobs],
 'version-jobs': ['Controlled version navigation plans', async () => (await CA_LEGAL.ready).navigationIntelligence.versionTasks],
 'nav-failed': ['Navigation detector findings', async () => (await CA_LEGAL.ready).navigationIntelligence.findings],
 'export-navigation': ['Export navigation JSON', async () => download('CA_NAVIGATION_V11.10.json',json((await CA_LEGAL.ready).navigationIntelligence))],
 'export-jobs': ['Export worker jobs JSONL', async () => download('CA_WORKER_JOBS.jsonl',(await CA_LEGAL.ready).navigationIntelligence.jobs.map(x=>JSON.stringify(x)).join('\n'))],
 'legal': ['Unified legal records', () => CA_LEGAL.ready],
 'bill': ['Bill and version records', async () => (await CA_LEGAL.ready).bill],
 'statutes': ['Statutory records', async () => (await CA_LEGAL.ready).statutoryRecords],
 'decoded-urls': ['Decoded navigation URLs', async () => legalURLs(await CA_LEGAL.ready)],
 'export-legal': ['Legal registry JSONL', async () => {const r=await CA_LEGAL.ready; const a=document.createElement('a');const u=URL.createObjectURL(new Blob([[...r.statutoryRecords,...(r.bill?[r.bill]:[])].map(x=>JSON.stringify(x)).join('\n')],{type:'text/plain'}));a.href=u;a.download='CA_LEGAL_V11.jsonl';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}],
 'export-urls': ['Decoded URLs TXT', async () => {const a=document.createElement('a');const u=URL.createObjectURL(new Blob([legalURLs(await CA_LEGAL.ready).join('\n')],{type:'text/plain'}));a.href=u;a.download='CA_DECODED_URLS.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}],
 'help': ['List all commands', () => CA_COMMANDS.help()],
 'summary': ['Registry summary', () => CA_MATCH_ALL.summary],
 'codes': ['Full code records', () => CA_MATCH_ALL.records],
 'code': ['Code by identifier', c => CA_MATCH_ALL.get(String(c).toUpperCase())],
 'targets': ['Historical matches', () => CA_TARGET.results],
 'target': ['Historical live element by ID', id => CA_TARGET.get(Number(id))],
 'find': ['Find anchor text', q => CA_TARGET.find(q)],
 'css': ['CSS query', s => CA_TARGET.query(s)],
 'xpath': ['XPath query', s => CA_TARGET.xpath(s)],
 'selectors': ['Historical selector counts', () => CA_TARGET.selectors],
 'anchors': ['All anchor records', () => CA_TARGET.anchors],
 'urls': ['Unique resolved URLs', () => [...new Set(CA_TARGET.anchors.map(a=>a.url).filter(Boolean))]],
 'nodes': ['Unified DOM nodes', () => CA_CAPTURE.nodes],
 'node': ['Live node by matching ID', id => CA_EACH.get(Number(id))],
 'matches': ['All individual matches', () => CA_EACH.records],
 'groups': ['Individual category statistics', () => CA_EACH.groups],
 'category': ['Individual matches by category', c => CA_EACH.find(String(c).toUpperCase())],
 'components': ['All component categories', () => CA_CAPTURE.categories],
 'component': ['Component category', c => CA_CAPTURE.categories[String(c).toUpperCase()]],
 'failed': ['Failed individual matches', () => CA_EACH.failed()],
 'scripts': ['Scripts', () => CA_CAPTURE.scripts],
 'handlers': ['Inline event handlers', () => CA_CAPTURE.handlers],
 'stylesheets': ['CSSOM', () => CA_CAPTURE.stylesheets],
 'resources': ['Resource references', () => CA_CAPTURE.resources],
 'metadata': ['Metadata records', async () => {await CA_METADATA.ready;return CA_METADATA.records}],
 'meta': ['Metadata for code', async c => {await CA_METADATA.ready;return CA_METADATA.get(String(c).toUpperCase())}],
 'indexes': ['All V7 indexes', async () => (await CA_INDEX.ready).indexes],
 'index': ['Single index by name', async n => (await CA_INDEX.ready).indexes[n]],
 'index-code': ['V7 index for code', c => CA_INDEX.get(String(c).toUpperCase())],
 'compact': ['Compact representation', async () => (await CA_INDEX.ready).compact],
 'restore': ['Reconstruct metadata', () => CA_INDEX.restore()],
 'sparse': ['Sparse token matrix', async () => (await CA_INDEX.ready).sparse],
 'edges': ['Structural edges', async () => (await CA_INDEX.ready).edges],
 'ast': ['All syntax records', () => CA_AST.ready],
 'ast-code': ['AST for code', c => CA_AST.get(String(c).toUpperCase())],
 'ast-css': ['Parse CSS locator', s => CA_SYNTAX_ENGINE.locator(s,'css')],
 'ast-xpath': ['Parse XPath locator', s => CA_SYNTAX_ENGINE.locator(s,'xpath')],
 'ast-js': ['Parse supported JS locator', s => CA_SYNTAX_ENGINE.js(s)],
 'ast-html': ['Parse HTML fragment', s => CA_SYNTAX_ENGINE.html(s)],
 'benchmark': ['Match, index and syntax summaries', async () => ({registry:CA_MATCH_ALL.summary,each:CA_EACH.summary,index:(await CA_INDEX.ready).summary,syntax:(await CA_AST.ready).summary})],
 'baseline': ['Compare 30 supplied signatures against current DOM', () => verifyBaseline()],
 'baseline-data': ['Original supplied signatures', () => structuredClone(baseline)],
 'refresh': ['Recompute current page', async () => {document.getElementById('ca-v8-command-panel')?.remove();CA_TARGET.refresh();window.CA_MENU();await Promise.all([CA_AST.ready,CA_LEGAL.ready]);return CA_MATCH_ALL.summary}],
 'report': ['Unified report after async processing', async () => {await Promise.all([CA_AST.ready,CA_LEGAL.ready]);return CA_TARGET.report}],
 'export-codes': ['Download code TXT', () => CA_MATCH_ALL.download()],
 'export-matches': ['Download matching TXT', () => CA_EACH.download()],
 'export-metadata': ['Download metadata TXT', () => CA_METADATA.download()],
 'export-index': ['Download index TXT', () => CA_INDEX.download()],
 'export-ast': ['Download syntax TXT', () => CA_AST.download()],
 'export-all': ['Download unified TXT', async () => {await Promise.all([CA_AST.ready,CA_LEGAL.ready]);return CA_TARGET.download()}],
 'export-baseline': ['Download baseline audit TXT', () => save('CA_BASELINE_AUDIT.txt',verifyBaseline())],
 'export-category': ['Download selected category TXT', c => save('CA_MATCH_'+String(c).replace(/[^a-z0-9_]/gi,'_')+'.txt',CA_EACH.find(String(c).toUpperCase()))],
 'zip': ['Download all reports in one ZIP', async () => {await Promise.all([CA_AST.ready,CA_LEGAL.ready]);return CA_TARGET.zip()}],
 'compare': ['Compare prior V7 parsed index object', old => CA_INDEX.compare(old)]
};
function verifyBaseline(){
 if(!location.pathname.endsWith('/codes.xhtml'))return {status:'NOT_APPLICABLE',reason:'Root registry only'};
 const rows=baseline.map(r=>{
 const c=CA_MATCH_ALL.records.filter(x=>x.code===r.code);
 const css=CA_TARGET.query(r.css),xp=CA_TARGET.xpath(r.xpath),full=CA_TARGET.xpath(r.fullXPath);
 const live=css.length===1?css[0]:null;
 const identity=!!live&&c.length===1&&live.localName==='a'&&live.href===r.url&&live.textContent.replace(/\s+/g,' ').trim()===r.heading;
 return {code:r.code,heading:r.heading,css:r.css,xpath:r.xpath,fullXPath:r.fullXPath,location:r.location,url:r.url,cssMatches:css.length,xpathMatches:xp.length,fullXPathMatches:full.length,identity,cssValid:identity,xpathValid:identity&&xp.length===1&&xp[0]===live,fullXPathValid:identity&&full.length===1&&full[0]===live,locationValid:identity&&c[0].containerClass===r.location};
 });
 return {total:rows.length,matched:rows.filter(r=>r.cssValid&&r.xpathValid&&r.fullXPathValid&&r.locationValid).length,rows};
}
function save(name,data){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}
window.CA_COMMANDS={help:()=>Object.entries(commands).map(([command,[description]])=>({command,description})),run:async(name,...args)=>{if(!Object.hasOwn(commands,name))throw Error('Unknown command: '+name);const out=await commands[name][1](...args);if(Array.isArray(out))console.table(out);else console.log(out);return out},baseline:verifyBaseline};
window.CA = (...args)=>CA_COMMANDS.run(...args);
// Automatically open after initial capture; remove before refreshing telemetry.
window.CA_MENU=()=>{
 const old=document.getElementById('ca-v8-command-panel');if(old){old.remove();return;}
 const host=document.createElement('div');host.id='ca-v8-command-panel';host.style.cssText='position:fixed;top:12px;right:12px;z-index:2147483647';
 const shadow=host.attachShadow({mode:'open'});const box=document.createElement('div');box.style.cssText='background:#172333;color:white;padding:16px;width:340px;max-height:80vh;overflow:auto;font:14px system-ui;border:1px solid #789;border-radius:8px';
 const title=document.createElement('h3');title.textContent='CA V11.10 — Commands';box.append(title);
 const select=document.createElement('select');select.style.width='100%';for(const [name,[desc]] of Object.entries(commands)){const opt=document.createElement('option');opt.value=name;opt.textContent=name+' — '+desc;select.append(opt)}box.append(select);
 const input=document.createElement('input');input.placeholder='Optional argument (code, selector, JSON)';input.style.cssText='width:95%;margin:10px 0';box.append(input);
 const out=document.createElement('pre');out.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:45vh;overflow:auto';
 const run=document.createElement('button');run.textContent='Run';run.onclick=async()=>{try{let arg=input.value; if(select.value==='compare')arg=JSON.parse(arg); if(select.value==='refresh'){await CA_COMMANDS.run('refresh');return;} const r=await CA_COMMANDS.run(select.value,...(arg===''?[]:[arg]));const t=JSON.stringify(r,(k,v)=>v instanceof Node?`[DOM ${v.nodeName}]`:v,2);out.textContent=(t||'Done').slice(0,30000);}catch(e){out.textContent=String(e)}};box.append(run);
 const close=document.createElement('button');close.textContent='Close';close.onclick=()=>host.remove();box.append(close,out);shadow.append(box);document.body.append(host);
};
window.CA_MENU();
console.info('CA V11.10 Tampermonkey ready. GUI opened automatically. CA_MENU() toggles it.');

})();
