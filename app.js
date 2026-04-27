/* DCH Clinical Chart PWA shared functions - database/server version */
const STORAGE_KEY = "dchClinicalChartRecords";
const EDIT_KEY = "dchClinicalChartEditIndex";
const ACTIVE_KEY = "dchActivePatientRecord";
const API_BASE = `${location.origin}/api`;

function getValue(id){ return (document.getElementById(id)?.value || "").trim(); }
function setValue(id,value){ const el=document.getElementById(id); if(el) el.value=value || ""; }
function getActiveIndex(){ const v=localStorage.getItem(ACTIVE_KEY); return v===null || v==="" ? null : Number(v); }
function setActiveIndex(i){ localStorage.setItem(ACTIVE_KEY, String(i)); }
function localRecords(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function writeLocal(records){ localStorage.setItem(STORAGE_KEY, JSON.stringify(records || [])); }
function apiAvailable(){ return location.protocol !== "file:" && location.origin && location.origin !== "null"; }

function syncRequest(method, path, body){
  if(!apiAvailable()) return null;
  try{
    const x=new XMLHttpRequest();
    x.open(method, API_BASE+path, false);
    x.setRequestHeader("Content-Type","application/json");
    x.setRequestHeader("Cache-Control","no-cache");
    x.send(body === undefined ? null : JSON.stringify(body));
    if(x.status>=200 && x.status<300){ return x.responseText ? JSON.parse(x.responseText) : {}; }
    console.error("DCH API error", method, path, x.status, x.responseText);
    return null;
  }catch(e){ console.error("DCH API unavailable", e); return null; }
}
function syncGET(path){ return syncRequest("GET", path); }
function syncPOST(path, body){ return syncRequest("POST", path, body); }
function syncDELETE(path){ return syncRequest("DELETE", path); }

function getAllRecords(){
  const server=syncGET('/records?_=' + Date.now());
  if(Array.isArray(server)){ writeLocal(server); return server; }
  return localRecords();
}

function saveAllRecords(records){
  const clean = Array.isArray(records) ? records : [];
  writeLocal(clean);
  const result = syncPOST('/records', {records: clean});
  if(result && Array.isArray(result.records)){ writeLocal(result.records); return result.records; }
  return clean;
}

function saveOneRecord(record){
  const result = syncPOST('/record', record || {});
  if(result && result.ok && result.record){
    const records = getAllRecords();
    const idx = records.findIndex(r => String(r.__id || r.id) === String(result.record.__id || result.record.id));
    if(idx >= 0) records[idx] = result.record; else records.push(result.record);
    writeLocal(records);
    setActiveIndex(Math.max(0, records.findIndex(r => String(r.__id || r.id) === String(result.record.__id || result.record.id))));
    return result.record;
  }
  return null;
}

function deleteServerRecord(record){
  const id = record?.__id || record?.id;
  if(id) return syncDELETE('/record/' + encodeURIComponent(id));
  return null;
}

function getActiveRecord(){ const records=getAllRecords(); const i=getActiveIndex(); return i!==null && records[i] ? records[i] : {}; }
function updateActiveRecord(data){
  const records=getAllRecords();
  let i=getActiveIndex();
  let old = (i!==null && records[i]) ? records[i] : {};
  const merged = {...old, ...data, savedAt: new Date().toLocaleString()};
  const saved = saveOneRecord(merged);
  if(saved) return saved;
  if(i===null || !records[i]){ records.push(merged); i=records.length-1; setActiveIndex(i); } else { records[i]=merged; }
  saveAllRecords(records);
  return records[i];
}
function savePatientHeader(){ updateActiveRecord(collectFields(["patientName","ageSex","roomBedNo","attendingPhysician","caseNo"])); }
function collectFields(fields){ const out={}; fields.forEach(id=>out[id]=getValue(id)); return out; }
function fillFields(fields, record){ fields.forEach(id=>setValue(id, record?.[id] || "")); }
function syncPatientHeader(){ const r=getActiveRecord(); ["patientName","ageSex","roomBedNo","attendingPhysician","caseNo"].forEach(id=>{ if(document.getElementById(id) && !getValue(id)) setValue(id, r[id] || ""); });
  if(document.getElementById('refPatientName') && !getValue('refPatientName')) setValue('refPatientName', r.patientName || '');
  if(document.getElementById('refPatientAge') && !getValue('refPatientAge')) setValue('refPatientAge', r.age || (r.ageSex||'').split('/')[0]?.trim() || '');
  if(document.getElementById('refPatientSex') && !getValue('refPatientSex')) setValue('refPatientSex', r.sex || (r.ageSex||'').split('/')[1]?.trim() || '');
}
function createRows(tableId, rows, cols, textareaCols=[]){ const tbody=document.querySelector(`#${tableId} tbody`); if(!tbody) return; tbody.innerHTML=''; for(let r=0;r<rows;r++){ const tr=document.createElement('tr'); for(let c=0;c<cols;c++){ const td=document.createElement('td'); const el=textareaCols.includes(c)?document.createElement('textarea'):document.createElement('input'); el.type='text'; td.appendChild(el); tr.appendChild(td);} tbody.appendChild(tr);} }
function getTableData(tableId){ return [...document.querySelectorAll(`#${tableId} tbody tr`)].map(tr=>[...tr.querySelectorAll('input,textarea,select')].map(el=>el.value)); }
function setTableData(tableId, data){ if(!Array.isArray(data)) return; const rows=[...document.querySelectorAll(`#${tableId} tbody tr`)]; data.forEach((row,i)=>{ const els=rows[i]?[...rows[i].querySelectorAll('input,textarea,select')]:[]; (row||[]).forEach((v,j)=>{ if(els[j]) els[j].value=v||''; }); }); }
function printPage(){ window.print(); }
function registerPWA(){ if('serviceWorker' in navigator && location.protocol !== 'file:'){ window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{})); } }
registerPWA();
window.DCHData={getAllRecords,saveAllRecords,saveOneRecord,deleteServerRecord};
