"use strict";
/* core/dialogs.js — هشدار، تأیید و زیرساخت دسترس‌پذیری پنجره‌ها (نسخهٔ ۱۱۱)
   - هر پنجره با dlgOpen ثبت می‌شود: role/aria-modal، Focus روی اولین کنترل، نگه‌داشتن Tab داخل پنجره،
     کلید Escape برای بالاترین پنجره و بازگرداندن Focus به عنصری که پنجره را باز کرده بود.
   - showConfirm: بستن با «انصراف»، کلیک روی فضای بیرونی یا Escape همیشه onNo را صدا می‌زند؛
     پس Promise ساخته‌شده با confirmAsync هرگز معلق نمی‌ماند (اشکال نسخهٔ ۱۱۰).
   - اگر پیش از پاسخ به یک تأیید، تأیید دیگری باز شود، قبلی «انصراف» حساب می‌شود (نه معلق). */
psModule("core/dialogs");

const DLG_FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const _dlgStack=[];
let _dlgSeq=0;
const dlgFocusables=root=>[...root.querySelectorAll(DLG_FOCUSABLE)].filter(el=>!el.closest("[hidden]")&&el.style.display!=="none");
function _dlgPrune(){for(let i=_dlgStack.length-1;i>=0;i--)if(!_dlgStack[i].el.isConnected||_dlgStack[i].el.hidden)_dlgStack.splice(i,1)}
// el: ریشهٔ پنجره (.modalWrap)؛ opts: {onEscape, initial, role, labelledBy, describedBy, label, box}
// نسخهٔ ۱۲۰: opts.box = جعبهٔ پنجره وقتی کلاس .modalBox ندارد (مثل جست‌وجوی سریع Ctrl+K)؛ opts.label = aria-label وقتی عنوان دیداری ندارد
// خروجی: تابع release که Focus را برمی‌گرداند (چندبار صدا زدنش بی‌خطر است)
function dlgOpen(el,opts){
  opts=opts||{};_dlgPrune();
  const box=opts.box||el.querySelector(".modalBox")||el;
  box.setAttribute("role",opts.role||"dialog");box.setAttribute("aria-modal","true");
  if(opts.labelledBy)box.setAttribute("aria-labelledby",opts.labelledBy);
  else if(opts.label)box.setAttribute("aria-label",opts.label);
  if(opts.describedBy)box.setAttribute("aria-describedby",opts.describedBy);
  if(!box.hasAttribute("tabindex"))box.setAttribute("tabindex","-1");
  const prev=document.activeElement;
  const entry={el,box,onEscape:opts.onEscape||null,prev,released:false};
  _dlgStack.push(entry);
  const target=opts.initial||dlgFocusables(box)[0]||box;
  try{target.focus()}catch(_){}
  return function release(){
    if(entry.released)return;entry.released=true;
    const i=_dlgStack.indexOf(entry);if(i>=0)_dlgStack.splice(i,1);
    // Focus فقط وقتی برمی‌گردد که هنوز داخل همین پنجره (یا بدون صاحب) باشد و عنصر قبلی هنوز در صفحه باشد
    const a=document.activeElement;
    if(prev&&prev.isConnected&&typeof prev.focus==="function"&&(!a||a===document.body||box.contains(a)||!a.isConnected)){try{prev.focus()}catch(_){}}
  };
}
const dlgTop=()=>{_dlgPrune();return _dlgStack[_dlgStack.length-1]||null};
// یک شنوندهٔ سراسری (فاز capture) برای Escape و Tab؛ فقط بالاترین پنجره را مدیریت می‌کند
document.addEventListener("keydown",e=>{
  const top=dlgTop();if(!top)return;
  if(e.key==="Escape"||e.key==="Esc"){
    if(top.onEscape){e.preventDefault();e.stopPropagation();top.onEscape()}
    return;
  }
  if(e.key!=="Tab")return;
  const f=dlgFocusables(top.box);
  if(!f.length){e.preventDefault();try{top.box.focus()}catch(_){}return}
  const first=f[0],last=f[f.length-1],a=document.activeElement;
  if(!top.box.contains(a)){e.preventDefault();first.focus();return}
  if(e.shiftKey&&a===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&a===last){e.preventDefault();first.focus()}
},true);

/* ---------- هشدار ---------- */
let _alertRelease=null;
function closeAlert(){const el=$("#alertDlg");if(!el||el.hidden)return;el.hidden=true;const r=_alertRelease;_alertRelease=null;if(r)r()}
function showAlert(msg){
  logLine(msg);$("#alertMsg").textContent=msg;
  const el=$("#alertDlg");
  if(!el.hidden&&_alertRelease)return;            // همان پنجره باز است؛ فقط متن عوض می‌شود
  el.hidden=false;
  _alertRelease=dlgOpen(el,{role:"alertdialog",labelledBy:"alertMsg",initial:$("#alertOk"),onEscape:closeAlert});
}

/* ---------- تأیید ---------- */
let _confirm=null;   // {onYes,onNo,release}
// ok=true ← onYes، در غیر این صورت onNo (انصراف، کلیک بیرون، Escape، یا جایگزین‌شدن با تأیید دیگر)
function closeConfirm(ok){
  const c=_confirm;_confirm=null;
  const el=$("#confirmDlg");if(el)el.hidden=true;
  if(!c)return;
  c.release();
  const cb=ok?c.onYes:c.onNo;
  if(typeof cb==="function"){try{cb()}catch(err){console.error(err)}}
}
function showConfirm(msg,onYes,onNo){
  if(_confirm)closeConfirm(false);
  $("#confirmMsg").textContent=msg;
  const el=$("#confirmDlg");el.hidden=false;
  // Focus پیش‌فرض روی «انصراف» تا زدن تصادفی Enter عملیات حذف/تغییر را تأیید نکند
  const release=dlgOpen(el,{role:"alertdialog",labelledBy:"confirmMsg",initial:$("#confirmNo"),onEscape:()=>closeConfirm(false)});
  _confirm={onYes:onYes||null,onNo:onNo||null,release};
}
const confirmAsync=msg=>new Promise(res=>showConfirm(msg,()=>res(true),()=>res(false)));

$("#alertOk").addEventListener("click",closeAlert);
$("#confirmYes").addEventListener("click",()=>closeConfirm(true));
$("#confirmNo").addEventListener("click",()=>closeConfirm(false));
$("#alertDlg").addEventListener("click",e=>{if(e.target===e.currentTarget)closeAlert()});
$("#confirmDlg").addEventListener("click",e=>{if(e.target===e.currentTarget)closeConfirm(false)});

/* ---------- حالت‌های استاندارد بخش‌ها: در حال بارگذاری، خالی، خطا ----------
   uiState(el,"loading"|"empty"|"error", متن, {retry}) — متن با textContent گذاشته می‌شود (بدون XSS) */
function uiState(el,kind,msg,opts){
  if(typeof el==="string")el=$(el);if(!el)return;
  opts=opts||{};
  const box=document.createElement("div");
  box.className="ui-state ui-state-"+kind+(kind==="empty"?" empty":"");
  box.setAttribute("role",kind==="error"?"alert":"status");
  if(kind==="loading"){box.setAttribute("aria-busy","true");const sp=document.createElement("span");sp.className="ui-spinner";sp.setAttribute("aria-hidden","true");box.appendChild(sp)}
  const t=document.createElement("span");t.className="ui-state-msg";
  t.textContent=msg||(kind==="loading"?"در حال بارگذاری…":kind==="empty"?"موردی برای نمایش وجود ندارد.":"خطا در دریافت اطلاعات.");
  box.appendChild(t);
  if(kind==="error"&&typeof opts.retry==="function"){const b=document.createElement("button");b.type="button";b.className="btn btn-quiet";b.textContent="تلاش دوباره";b.addEventListener("click",opts.retry);box.appendChild(b)}
  el.replaceChildren(box);
}
