"use strict";
/* ui/shortcuts.js — کلیدهای میانبر
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("ui/shortcuts");
/* ===== کلیدهای میانبر قابل تنظیم =====
   ذخیره در همین مرورگر (localStorage: psShortcuts) = { map:{شناسه:ترکیب}, custom:[{id,page,combo}] }
   ترکیب: مثل F2 یا Shift+F8 یا Ctrl+Alt+1 (حرف و رقم با کدِ کلید، پس با کیبورد فارسی هم کار می‌کند). */
const SC_DEFS=[
  {id:"personnel",label:"پرسنل (جست‌وجو)",def:"F2"},
  {id:"slips",label:"فیش حقوقی (جست‌وجو)",def:"F3"},
  {id:"loanform",label:"ثبت وام و چاپ فرم‌ها",def:"F8"},
  {id:"advance",label:"مساعده",def:"F6"},
  {id:"goods",label:"درخواست کالا",def:"F7"},
  {id:"services",label:"درخواست خدمات",def:"F9"},
  {id:"changes",label:"تغییرات ماهانهٔ کسورات",def:"F10"},
  {id:"insurance",label:"بیمه تکمیلی",def:"F11"},
  {id:"mehr",label:"وام بانک مهر",def:"Shift+F8"},
  {id:"save",label:"ذخیره (در صفحه‌های ثبت)",def:"F4"},
  {id:"saveprint",label:"ذخیره و چاپ (در صفحه‌های ثبت)",def:"F5"},
];
const SC_KBD_OLD={"F2":"personnel","F3":"slips","F4":"save","F5":"saveprint","F6":"advance","F7":"goods","F8":"loanform","⇧F8":"mehr","F9":"services","F10":"changes","F11":"insurance"};
const SC_RESERVED=new Set(["Ctrl+K","Ctrl+C","Ctrl+V","Ctrl+X","Ctrl+A","Ctrl+Z","Ctrl+Y","Ctrl+F","Ctrl+P","Ctrl+R","Ctrl+W","Ctrl+T","Ctrl+N","Ctrl+L","Ctrl+Q","Ctrl+S","Ctrl+O","Ctrl+H","Ctrl+J","Ctrl+D","Ctrl+U","F1","F12"]);
let scCfg={map:{},custom:[]};
try{const j=JSON.parse(localStorage.getItem("psShortcuts")||"null");if(j&&typeof j==="object")scCfg={map:j.map||{},custom:Array.isArray(j.custom)?j.custom:[]}}catch(_){}
const scSaveCfg=()=>{try{localStorage.setItem("psShortcuts",JSON.stringify(scCfg))}catch(_){}};
const scDef=id=>SC_DEFS.find(d=>d.id===id);
const scCombo=id=>{
  if(id.startsWith("c:")){const c=scCfg.custom.find(x=>x.id===id.slice(2));return c?c.combo:""}
  return Object.prototype.hasOwnProperty.call(scCfg.map,id)?scCfg.map[id]:(scDef(id)?scDef(id).def:"");
};
function scFmt(c){if(!c)return "—";const p=c.split("+");return p[0]==="Shift"&&p.length===2?"⇧"+p[1]:p.join("+")}
function comboOf(e){
  const k=e.key;if(k==="Shift"||k==="Control"||k==="Alt"||k==="Meta"||k==="Dead"||k==="Process")return null;
  let key;
  if(/^Key[A-Z]$/.test(e.code))key=e.code.slice(3);
  else if(/^Digit\d$/.test(e.code))key=e.code.slice(5);
  else if(/^F\d{1,2}$/.test(k))key=k;
  else if(e.code==="Space")key="Space";
  else if(k.length===1)key=k.toUpperCase();
  else key=k;
  const m=[];if(e.ctrlKey)m.push("Ctrl");if(e.altKey)m.push("Alt");if(e.shiftKey)m.push("Shift");if(e.metaKey)m.push("Meta");
  return m.concat(key).join("+");
}
// همهٔ شناسه‌هایی که ترکیب مشخصی دارند: [{id,label,combo}]
function scAll(){
  const a=SC_DEFS.map(d=>({id:d.id,label:d.label,combo:scCombo(d.id)}));
  scCfg.custom.forEach(c=>a.push({id:"c:"+c.id,label:"باز کردن «"+scPageLabel(c.page)+"»",combo:c.combo,custom:true}));
  return a;
}
function scPageLabel(pg){const b=document.querySelector(`.nav button[data-page="${pg}"]`);return b?[...b.childNodes].filter(n=>n.nodeType===3||!n.classList||!n.classList.contains("kbd")).map(n=>n.textContent).join("").replace(/\s+/g," ").trim():pg}
function scGo(pg){
  if(pg==="slips"){
    if(!can("slips")){showAlert("شما به بخش فیش حقوقی دسترسی ندارید.");return}
    showPage("slips");setTimeout(()=>{const i=$("#search");if(i){i.focus();i.select()}},0);return;
  }
  if(pg==="personnel"){
    if(!can("personnel")){showAlert("شما به بخش پرسنل دسترسی ندارید.");return}
    showPage("personnel");setTimeout(()=>{const i=$("#personnelSearch");if(i){i.focus();i.select()}},0);return;
  }
  if(WK_PAGES.includes(pg)){setWkTab(pg,"form");if(pg==="loanform")app.wk.loanTab="loan";openWk(pg);return}   // همیشه تب «فرد»، نه گزارش همهٔ افراد
  if(PAGE_PERM[pg]&&!can(PAGE_PERM[pg])){showAlert("شما به این بخش دسترسی ندارید.");return}
  showPage(pg);
}
// ذخیره (save) و ذخیره و چاپ (saveprint) در صفحه‌های ثبت؛ اگر صفحهٔ فعلی از این‌ها نباشد false برمی‌گرداند (رفتار پیش‌فرض مرورگر می‌ماند)
function scSave(kind){
  const P=app.page,has=()=>!!app.wk.person;
  const A={
    loanform:()=>loanAction(kind==="save"?(app.wk.loanTab==="cap"?"cap-save":"notice"):(app.wk.loanTab==="cap"?"cap-print":"receipt")),
    goods:()=>goodsAction({dataset:{act:kind==="save"?"gd-save":"gd-saveprint"}}),
    advance:()=>advAction({dataset:{act:kind==="save"?"adv-save":"adv-saveprint"}}),
    services:()=>svAction({dataset:{act:kind==="save"?"sv-save":"sv-saveprint"}}),
    emdad:()=>emAction({dataset:{act:kind==="save"?"em-save":"em-saveprint"}}),
    mehr:()=>mhAction({dataset:{act:kind==="save"?"mh-save":"mh-saveprint"}}),
    cheque:()=>cqAction({dataset:{act:kind==="save"?"cq-save":"cq-saveprint"}}),
    changes:kind==="save"?()=>chAction({dataset:{act:"ch-save"}}):null,
  };
  if(!A[P])return false;
  if(has())A[P]();
  return true;
}
let scCapture=null;   // وقتی کاربر در تنظیمات در حال گرفتن ترکیب کلید است
document.addEventListener("keydown",e=>{
  if(scCapture){scCapture(e);return}
  if(!app.connected||!app.user)return;
  if(document.querySelector(".modalWrap:not([hidden])"))return;
  const c=comboOf(e);if(!c)return;
  const hit=scAll().find(x=>x.combo&&x.combo===c);if(!hit)return;
  if(hit.id==="save"||hit.id==="saveprint"){if(scSave(hit.id)){e.preventDefault()}return}
  e.preventDefault();
  if(hit.custom){const cu=scCfg.custom.find(x=>"c:"+x.id===hit.id);if(cu)scGo(cu.page);return}
  scGo(hit.id);
},true);
// برچسب‌های .kbd (منو، دکمه‌ها، راهنمای صفحهٔ پرسنل) با ترکیب فعلی هم‌خوان می‌شوند
let scSyncBusy=false;
function kbdSync(){
  if(scSyncBusy)return;scSyncBusy=true;
  try{
    document.querySelectorAll(".kbd").forEach(el=>{
      let id=el.dataset.sc;
      if(id==="-")return;
      if(!id){const o=SC_KBD_OLD[el.textContent.trim()];if(!o)return;id=el.dataset.sc=o}
      if(id.startsWith("c:")&&!scCfg.custom.some(x=>"c:"+x.id===id)){el.remove();return}
      const c=scCombo(id),t=c?scFmt(c):"";
      if(el.textContent!==t)el.textContent=t;
      if(el.hidden!==!c)el.hidden=!c;
    });
    // میانبرهای تازه: نشان کنار دکمهٔ منوی همان صفحه
    scCfg.custom.forEach(cu=>{
      const b=document.querySelector(`.nav button[data-page="${cu.page}"]`);if(!b)return;
      const sid="c:"+cu.id;if(b.querySelector(".kbd"))return;
      const sp=document.createElement("span");sp.className="kbd";sp.dataset.sc=sid;sp.textContent=scFmt(cu.combo);b.appendChild(sp);
    });
  }finally{scSyncBusy=false}
}
let scRaf=0;
new MutationObserver(()=>{if(scRaf)return;scRaf=requestAnimationFrame(()=>{scRaf=0;kbdSync()})}).observe(document.body,{childList:true,subtree:true});
// ---- بخش «کلیدهای میانبر» در تنظیمات ----
app.scNew={page:"",combo:""};
function renderShortcuts(){
  const box=$("#keysBody");if(!box)return;
  const pages=[...document.querySelectorAll(".nav button[data-page]")].map(b=>[b.dataset.page,scPageLabel(b.dataset.page)]);
  const row=(x,extra)=>`<tr><td>${esc(x.label)}</td><td><button class="btn u-minw150" data-sc-cap="${esc(x.id)}" type="button">${x.combo?`<span class="kbd" data-sc="-">${esc(scFmt(x.combo))}</span>`:"بدون میانبر"}</button></td><td>${extra}</td></tr>`;
  const def=x=>{const d=scDef(x.id);return d&&d.def!==x.combo?`<button class="btn btn-quiet" data-sc-reset="${esc(x.id)}" type="button">پیش‌فرض (${esc(scFmt(d.def))})</button>`:""};
  box.innerHTML=`<div class="hint u-mb8">روی دکمهٔ هر ردیف کلیک کنید و ترکیب کلید دلخواه را بزنید (Esc = انصراف). ترکیب باید کلید F یا حداقل یکی از Ctrl / Alt همراه باشد. این تنظیم فقط برای همین مرورگر ذخیره می‌شود.</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>عملیات</th><th>کلید</th><th></th></tr></thead><tbody>
    ${scAll().map(x=>row(x,x.custom?`<button class="btn btn-del" data-sc-del="${esc(x.id.slice(2))}" type="button">حذف</button>`:def(x)+(x.combo?` <button class="btn btn-quiet" data-sc-clear="${esc(x.id)}" type="button">برداشتن</button>`:""))).join("")}
    </tbody></table></div>
    <h3 class="u-m-16-0-8">افزودن میانبر برای یک بخش</h3>
    <div class="toolbar"><select class="inp u-maxw260" id="scNewPage"><option value="">انتخاب بخش…</option>${pages.map(([k,l])=>`<option value="${esc(k)}"${app.scNew.page===k?" selected":""}>${esc(l)}</option>`).join("")}</select>
      <button class="btn u-minw150" data-sc-cap="__new" type="button">${app.scNew.combo?`<span class="kbd" data-sc="-">${esc(scFmt(app.scNew.combo))}</span>`:"گرفتن کلید…"}</button>
      <button class="btn btn-main" data-sc-add type="button">افزودن</button></div>
    <div class="dlg-err u-c-red-ink u-fs12-5 u-minh18 u-mt6" id="scMsg"></div>
    <div class="u-mt8"><button class="btn btn-quiet" data-sc-resetall type="button">بازنشانی همهٔ میانبرها به پیش‌فرض</button></div>`;
  kbdSync();
}
function scCheck(combo,exceptId){
  if(!combo)return"";
  const p=combo.split("+"),key=p[p.length-1],mods=p.slice(0,-1);
  if(!/^F\d{1,2}$/.test(key)&&!mods.some(m=>m==="Ctrl"||m==="Alt"||m==="Meta"))return"ترکیب باید کلید F یا همراه با Ctrl / Alt باشد.";
  if(SC_RESERVED.has(combo))return"این ترکیب برای مرورگر یا برنامه رزرو است؛ ترکیب دیگری انتخاب کنید.";
  const o=scAll().find(x=>x.combo===combo&&x.id!==exceptId);
  if(o)return`این ترکیب قبلاً برای «${o.label}» استفاده شده است.`;
  return"";
}
document.addEventListener("click",e=>{
  const K=e.target.closest("#keysBody");if(!K)return;
  const msg=$("#scMsg"),say=t=>{const m=$("#scMsg");if(m)m.textContent=t||""};
  const cap=e.target.closest("[data-sc-cap]");
  if(cap){
    const id=cap.dataset.scCap;cap.textContent="کلید را بزنید… (Esc = انصراف)";say("");
    scCapture=ev=>{
      ev.preventDefault();ev.stopPropagation();
      const c=comboOf(ev);if(!c)return;
      scCapture=null;
      if(ev.key==="Escape"&&c==="Escape"){renderShortcuts();return}
      const err=scCheck(c,id==="__new"?"":id);
      if(err){renderShortcuts();say(err);return}
      if(id==="__new")app.scNew.combo=c;
      else if(id.startsWith("c:")){const cu=scCfg.custom.find(x=>"c:"+x.id===id);if(cu)cu.combo=c;scSaveCfg()}
      else{scCfg.map[id]=c;scSaveCfg()}
      renderShortcuts();
    };
    return;
  }
  const rs=e.target.closest("[data-sc-reset]");if(rs){delete scCfg.map[rs.dataset.scReset];scSaveCfg();renderShortcuts();return}
  const cl=e.target.closest("[data-sc-clear]");if(cl){scCfg.map[cl.dataset.scClear]="";scSaveCfg();renderShortcuts();return}
  const dl=e.target.closest("[data-sc-del]");if(dl){scCfg.custom=scCfg.custom.filter(x=>x.id!==dl.dataset.scDel);scSaveCfg();renderShortcuts();return}
  if(e.target.closest("[data-sc-resetall]")){showConfirm("همهٔ میانبرها به حالت پیش‌فرض برگردد و میانبرهای تازه حذف شوند؟",()=>{scCfg={map:{},custom:[]};scSaveCfg();renderShortcuts()});return}
  if(e.target.closest("[data-sc-add]")){
    const pg=val("scNewPage"),c=app.scNew.combo;
    if(!pg){say("بخش را انتخاب کنید.");return}
    if(!c){say("ابتدا کلید را بگیرید.");return}
    const err=scCheck(c,"");if(err){say(err);return}
    scCfg.custom.push({id:String(Date.now()),page:pg,combo:c});scSaveCfg();app.scNew={page:"",combo:""};renderShortcuts();
  }
});
document.addEventListener("change",e=>{if(e.target.id==="scNewPage")app.scNew.page=e.target.value});
kbdSync();

function showPage(name){
  if(app.connected&&app.user&&PAGE_PERM[name]&&!can(PAGE_PERM[name])){
    const f=Object.keys(PAGE_PERM).find(k=>can(PAGE_PERM[k]));
    if(!f){showAlert("هیچ بخشی برای شما فعال نشده است؛ با مدیر سیستم تماس بگیرید.");return}
    if(f!==name)return showPage(f);
  }
  app.page=name;
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("on",p.id==="page-"+name));
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("on",b.dataset.page===name));
  if(name==="dashboard")refreshDashboard();
  if(name==="personnel"){if(app.pickCode&&app.pickCode!==app.pfCode)loadProfile(app.pickCode);else if(app.pickCode&&app.pickCode===app.pfCode&&!app.pfEdit)loadProfile(app.pickCode,true,true);refreshPersonnelList()}
  if(name==="loans")loadLqReport();
  if(WK_PAGES.includes(name)){const c=curCode();if(c)app.wk.code=c;renderWk(name)}   // فردِ آخرین انتخاب، نه فردِ قبلیِ همین صفحه
  if(name==="slips")slipsFollowPick();
  if(name==="inventory")renderInventory();
  if(name==="settings"){applySettingsPerms();loadBackups();renderDesigner();renderPageEditor();renderShortcuts()}
  if(name==="institutions")renderInstitutions();
  if(name==="banks")bnInit();
  if(name==="dcodes")renderDcodes();
  if(name==="statushistory")renderStatusHistory();
  if(name==="deceased")renderDeceased();
  if(name==="schools")renderSchools();
  if(name==="users")renderUsers();
  if(name==="reports")renderReports();
  if(name==="closing")renderClosing();
  window.scrollTo(0,0);
}
document.querySelectorAll(".nav button").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));

showPage("settings");document.body.classList.add("offline");
render();
if($("#apiBase").value.trim())setTimeout(()=>$("#btnConnect").click(),50);
else showLogin({conn:true});

