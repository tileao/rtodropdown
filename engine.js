
function interp1(x, xs, ys){
  if(xs.length===0) return NaN;
  if(x<=xs[0]) return ys[0];
  if(x>=xs[xs.length-1]) return ys[ys.length-1];
  for(let i=1;i<xs.length;i++){
    if(x<=xs[i]){
      const x0=xs[i-1], x1=xs[i], y0=ys[i-1], y1=ys[i];
      return y0 + (y1-y0)*(x-x0)/(x1-x0);
    }
  } return NaN;
}
function interp2(oat, alt, oats, alts, grid){
  const colVals = alts.map((a,ri)=>interp1(oat, oats, grid[ri]));
  return interp1(alt, alts, colVals);
}
const S97 = {
  20: {10:[10,2],20:[9,3],30:[9,5],40:[8,6],50:[6,8],60:[5,9],70:[3,9],80:[2,10],90:[0,10]},
  25: {10:[15,3],20:[14,5],30:[13,8],40:[11,10],50:[10,11],55:[14,20]},
  30: {10:[20,3],20:[19,7],30:[17,10],40:[15,13],50:[13,15],60:[10,17],70:[7,19],80:[3,20],90:[0,20]},
  35: {10:[25,4],20:[23,9],30:[22,13],40:[19,16],50:[16,19]},
  40: {10:[30,5],20:[28,10],30:[26,15],40:[23,19],43:[22,20]}
};
function headFrom(wind, wra, mode){
  if(mode==="s97"){
    const speeds = Object.keys(S97).map(k=>+k);
    let nearest = speeds[0], dmin=1e9;
    speeds.forEach(s=>{ const d=Math.abs(s-wind); if(d<dmin){dmin=d; nearest=s;} });
    const table = S97[nearest];
    const angles = Object.keys(table).map(k=>+k);
    let best=angles[0], ad=1e9;
    angles.forEach(a=>{ const d=Math.abs(a-wra); if(d<ad){ad=d; best=a;} });
    return table[best][0];
  } else {
    return wind*Math.cos(wra*Math.PI/180);
  }
}
function nearestWeightTable(map, gw){
  const ks = Object.keys(map).map(k=>+k).sort((a,b)=>a-b);
  if(ks.length===0) return null;
  let best=ks[0], md=1e9;
  ks.forEach(k=>{ const d=Math.abs(k-gw); if(d<md){md=d; best=k;} });
  return map[best];
}
let DB=null;
async function loadDB(){ if(DB) return DB; try{ DB = await fetch("./db.json").then(r=>r.json()); } catch(e){ DB = {"conv":{},"enh":{},"rto":{}}; } return DB; }
function $(id){ return document.getElementById(id); }
function setSegActive(segId, btnId){
  const seg = $(segId);
  Array.from(seg.querySelectorAll("button")).forEach(b=>b.classList.remove("active"));
  $(btnId).classList.add("active");
}
function updatePressureAltitude(){
  const auto = $("altAuto").classList.contains("active");
  if(auto){
    const elev = +$("elev").value || 0;
    const qnh  = +$("qnh").value || 1013;
    const altp = elev + (1013 - qnh) * 30;
    $("alt").value = Math.round(altp);
    $("altDisplay").value = Math.round(altp);
  } else {
    const manual = +$("altManualInput").value || 0;
    $("alt").value = Math.round(manual);
    $("altDisplay").value = Math.round(manual);
  }
}
function show(val, unit, note){ $("result").textContent=val; $("unit").textContent=unit||""; $("note").textContent=note||""; }
async function calculate(){
  updatePressureAltitude();
  const mode = $("mode").value;
  const gw   = +$("gw").value;
  const oat  = +$("oat").value;
  const alt  = +$("alt").value;
  const wind = +$("wind").value;
  const wra  = +$("wra").value;
  const windMode = $("windTrig").classList.contains("active") ? "trig" : "s97";
  const descending = $("descToggle").checked;
  const filter  = +$("filter").value;
  const db = await loadDB();
  const head = headFrom(wind, wra, windMode);
  const FT_PER_KT = -1; // DropDown fixo
  if(mode==="conv" || mode==="enh"){
    const map = mode==="conv" ? db.conv : db.enh;
    const tbl = nearestWeightTable(map, gw);
    if(!tbl){ return show("—","Base não carregada"); }
    const base = interp2(oat, alt, tbl.oats, tbl.alts, tbl.grid);
    let dd = base + head*FT_PER_KT;
    if(mode==="conv" && descending) dd += 15;
    show(Math.round(dd)+" ft", mode==="conv" ? "Drop Down Convencional" : "Drop Down Enhanced",
         "Headwind: "+Math.round(head)+" kt  •  Alt pressão: "+Math.round(alt)+" ft");
  } else {
    const tbl = nearestWeightTable(db.rto, gw);
    if(!tbl){ return show("—","Base não carregada"); }
    const dist = interp2(oat, alt, tbl.oats, tbl.alts, tbl.dist);
    const fac  = interp2(oat, alt, tbl.oats, tbl.alts, tbl.fac);
    const windBenefit = head * fac;
    const total = dist + windBenefit + filter;
    show(Math.round(total)+" m", "RTO Clear Area",
         "Benefício vento: "+Math.round(windBenefit)+" m  •  EAPS/IBF: "+filter+" m  •  Alt pressão: "+Math.round(alt)+" ft");
  }
}

// --- UX Enhancements v2: auto-select, clear-on-zero, auto-advance by length, clear-all ---
function enhanceInputs(){
  const config = { gw:4, oat:2, wind:2, wra:2, elev:4, qnh:4, altManualInput:4 };
  const order = ["gw","oat","qnh","elev","altManualInput","wind","wra"];
  const els = order.map(id => document.getElementById(id)).filter(Boolean);

  // prevent wheel change on number inputs (desktop)
  els.forEach(el => { el.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); }, {passive:false}); });

  function cleanLen(v){ return (v||"").replace(/[^0-9]/g,"").length; }

  els.forEach((el, idx) => {
    el.addEventListener('focus', () => {
      if(el.hasAttribute('data-autoselect')){ setTimeout(() => { try{ el.select(); }catch{} }, 0); }
      if(el.value === "0"){ el.value = ""; }
    });
    el.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); const next = els[idx+1]; if(next){ next.focus(); } else { const btn = document.getElementById('calcBtn'); if(btn) btn.click(); } }
    });
    el.addEventListener('input', () => {
      const maxL = config[el.id];
      if(maxL && cleanLen(el.value) >= maxL){
        const next = els[idx+1]; if(next){ next.focus(); }
      }
      calculate(); // live update
    });
  });

  const clearBtn = document.getElementById('clearBtn');
  if(clearBtn){
    clearBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      const ids=["gw","oat","wind","wra","elev","altManualInput"]; ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      const q=document.getElementById('qnh'); if(q) q.value="1013";
      const filter=document.getElementById('filter'); if(filter) filter.value="0";
      // toggles padrão
      const setSegActive = (segId, btnId) => {
        const seg = document.getElementById(segId); if(!seg) return;
        Array.from(seg.querySelectorAll("button")).forEach(b=>b.classList.remove("active"));
        const b = document.getElementById(btnId); if(b) b.classList.add("active");
      };
      setSegActive("windSeg","windTrig");
      setSegActive("altSeg","altAuto");
      document.getElementById('altAutoRow').style.display="flex";
      document.getElementById('altManualRow').style.display="none";
      const desc=document.getElementById('descToggle'); if(desc) desc.checked=false;
      calculate();
      const first=document.getElementById('gw'); if(first) first.focus();
    });
  }
}

window.addEventListener("DOMContentLoaded", ()=>{
  // Wind toggle
  document.getElementById("windTrig").addEventListener("click", ()=>{ setSegActive("windSeg","windTrig"); calculate(); });
  document.getElementById("windS97").addEventListener("click", ()=>{ setSegActive("windSeg","windS97"); calculate(); });
  // Altitude toggle
  document.getElementById("altAuto").addEventListener("click", ()=>{
    setSegActive("altSeg","altAuto"); document.getElementById("altAutoRow").style.display="flex"; document.getElementById("altManualRow").style.display="none"; calculate();
  });
  document.getElementById("altManual").addEventListener("click", ()=>{
    setSegActive("altSeg","altManual"); document.getElementById("altAutoRow").style.display="none"; document.getElementById("altManualRow").style.display="flex"; calculate();
  });
  // Inputs that aren't in the auto-enhance list
  ["mode","filter","descToggle"].forEach(id=>{
    const el=document.getElementById(id); if(el){ el.addEventListener("input", calculate); el.addEventListener("change", calculate); }
  });
  document.getElementById("calcBtn").addEventListener("click", e=>{ e.preventDefault(); calculate(); });
  document.getElementById("exportBtn").addEventListener("click", e=>{
    e.preventDefault();
    const payload = JSON.stringify(DB||{"conv":{},"enh":{},"rto":{}}, null, 2);
    const blob = new Blob([payload], {type:"application/json"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="db.json"; a.click();
  });
  document.getElementById("fileInput").addEventListener("change", async e=>{
    const file=e.target.files[0]; if(!file) return;
    const text=await file.text();
    try{ DB = JSON.parse(text); alert("Base de dados carregada!"); calculate(); }catch(err){ alert("JSON inválido."); }
  });
  enhanceInputs();
  calculate();
});
