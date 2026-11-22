"use strict";
/* core/person-picker.js — نوار انتخاب فرد، کدهای مهم، ورود به هر صفحه
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("core/person-picker");
/* ---------- نوار انتخاب فرد (مشترک سه صفحه) ---------- */
const HEIR_PAGES=["loanform","vefagh","advance","goods","services","emdad"];
const HEIR_MSG="وظیفه‌بگیر اجازهٔ دریافت خدمات (مساعده، کالا، وام، امداد، خدمات موسسات و ...) را ندارد.";
const isHeir=p=>!!p&&/وظیفه.?بگیر/.test(String(p.status||""));
// «قطع رابطه»: ثبت وام، مساعده، کالا و وام امداد مجاز نیست (سرور هم رد می‌کند)
const CUT_PAGES=["loanform","vefagh","advance","goods","emdad"];
const CUT_MSG="فرد «قطع رابطه» است و اجازهٔ دریافت و ثبت وام، مساعده و کالا را ندارد.";
const isCut=p=>!!p&&/قطع.?رابطه/.test(String(p.status||""));
const wkBlock=(p,pg)=>isHeir(p)&&HEIR_PAGES.includes(pg)?{msg:HEIR_MSG,banner:`«وظیفه بگیر» است. ${HEIR_MSG}`}:isCut(p)&&CUT_PAGES.includes(pg)?{msg:CUT_MSG,banner:CUT_MSG}:null;
// کدهای مهم (تنظیمات ← تعریف کدهای مهم): هر جا کد وام/سرمایه/مساعده لازم است از اینجا خوانده می‌شود
// تب‌های صفحه‌های ثبت: «ثبت» و «گزارش همهٔ افراد»
const wkTab=pg=>(app.wk.ptab&&app.wk.ptab[pg])||"form";
const setWkTab=(pg,t)=>{(app.wk.ptab=app.wk.ptab||{})[pg]=t};
const PAGE_TABS={advance:["ثبت مساعده","مساعدهٔ همهٔ افراد"],goods:["درخواست کالا","کالای همهٔ افراد"],emdad:["ثبت وام امداد","وام امدادِ همهٔ افراد"],mehr:["ثبت وام بانک مهر","وام بانک مهرِ همهٔ افراد","ثبت دریافت / عدم دریافت","گزارش و نمودار","شارژ ماهانه"],cheque:["صدور دسته چک","دسته چک‌های همهٔ افراد"],changes:["ثبت تغییرات","تغییرات ماهانهٔ همهٔ افراد"],insurance:["افراد تحت تکفل","گزارش تجمیعی و خروجی","مغایرت‌گیری با حسابداری"]};
function pageTabs(pg){const t=wkTab(pg),L=PAGE_TABS[pg],K=["form","rep","rec","stat","chg"];return `<div class="rp-tabs">${L.map((x,i)=>`<button data-wktab="${pg}:${K[i]}"${t===K[i]?' class="on"':""}>${x}</button>`).join("")}</div>`}
document.addEventListener("click",e=>{const b=e.target.closest("[data-wktab]");if(!b)return;const [pg,t]=b.dataset.wktab.split(":");setWkTab(pg,t);renderWk(pg)});
// کپی عدد از صفحه (کد پرسنلی، کد ملی، حساب، شبا، تاریخ، مبلغ): ارقام فارسی/عربی هنگام کپی به لاتین تبدیل می‌شود
// تا جست‌وجو در اکسل و برنامه‌های دیگر کار کند. فقط وقتی اجرا می‌شود که متن انتخاب‌شده همه‌اش عدد/جداکننده باشد.
document.addEventListener("copy",e=>{
  try{
    const a=document.activeElement;let t="";
    if(a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")&&typeof a.selectionStart==="number")t=a.value.slice(a.selectionStart,a.selectionEnd);
    else t=String(window.getSelection());
    if(!/[۰-۹٠-٩]/.test(t)||!/^[\sA-Za-z\d۰-۹٠-٩,٬،.\/\-:]+$/.test(t))return;
    e.clipboardData.setData("text/plain",lat(t).replace(/[٬،]/g,","));e.preventDefault();
  }catch(_){}
});
function KC(){return Object.assign({loan1:"710",loan2:"",capital:"796",advance:"733",vcapital:"",vloan:"",emdad:"",rloan1:"",rloan2:"",rcapital:"",radvance:"",rvcapital:"",rvloan:"",remdad:""},(app.fs&&app.fs.keyCodes)||{})}
/* کدهای مهم شاغلین و بازنشستگان جدا هستند. کدِ بازنشسته‌ای که خالی بماند، همان کد شاغلین است (کدهای مشترک). */
const KC_RET={loan1:"rloan1",loan2:"rloan2",capital:"rcapital",advance:"radvance",vcapital:"rvcapital",vloan:"rvloan",emdad:"remdad"};
const isRetireeP=(p,last)=>last&&last.kind?last.kind==="retiree":(!!p&&/بازنشسته|وظیفه.?بگیر/.test(String(p.status||"")));
function KCP(p,last){
  const k=KC();if(!isRetireeP(p,last))return k;
  const o=Object.assign({},k);Object.keys(KC_RET).forEach(x=>{if(k[KC_RET[x]])o[x]=k[KC_RET[x]]});return o;
}
const kcBoth=key=>{const k=KC(),r=k[KC_RET[key]];return r&&r!==k[key]?`${faId(k[key])} شاغل / ${faId(r)} بازنشسته`:faId(k[key])};
function pbar(pg){
  const p=app.wk.person;
  const B=wkBlock(p,pg);
  return pbarCard(pg,p)+(B?`<div class="pf-msg u-bg-red-soft u-c-red-ink u-mb12">⛔ ${esc(pname(p))}: ${B.banner}</div>`:"");
}
function pbarCard(pg,p){
  return `<div class="card pbar"><div class="pb-who">${p?`<div class="${avClass(p.gender)} lg" data-photo="${esc(p.code)}">${esc(initials(p))}</div><div><b>${esc(pname(p))}</b><span>کد پرسنلی ${faId(esc(p.code))}${p.nationalId?" — کد ملی "+faId(esc(p.nationalId)):""} ${statusBadge(p.status)}</span></div>`:`<div class="hint">فردی انتخاب نشده است؛ از کادر جست‌وجو (یا از صفحهٔ پرسنل) یک نفر را انتخاب کنید.</div>`}</div>
    <div class="pb-find"><input class="inp" id="${pg}-find" type="search" placeholder="جست‌وجوی فرد (نام / کد پرسنلی / کد ملی)" autocomplete="off"><div class="pb-res" id="${pg}-res" hidden></div></div>
    <button class="btn btn-quiet" data-wkback>بازگشت به پرسنل <span class="kbd">F2</span></button></div>`;
}
function bindPbar(pg,root){
  applyPhotos(root);
  const inp=root.querySelector(`#${pg}-find`),res=root.querySelector(`#${pg}-res`);let t=null;
  const pick=async code=>{app.wk.code=code;app.wk.person=null;app.wk.loan=null;app.wk.adv=null;app.wk.cart=[];await renderWk(pg)};
  inp.addEventListener("input",()=>{
    clearTimeout(t);
    t=setTimeout(async()=>{
      const q=inp.value.trim();if(!q){res.hidden=true;return}
      try{
        const r=await api("GET",`/api/personnel?q=${enc(q)}&pageSize=8`);
        res.innerHTML=r.items.length?r.items.map(x=>`<button data-code="${esc(x.code)}">${esc(x.firstName+" "+x.lastName)}<small>${faId(esc(x.code))}${x.workplace?" — "+esc(x.workplace):""}</small></button>`).join(""):`<div class="hint u-p10">موردی پیدا نشد.</div>`;
        res.hidden=false;
        if(r.items.length===1&&inp.value.trim()===q)pick(r.items[0].code);   // فقط یک نتیجه: بدون Enter انتخاب می‌شود
      }catch(e){}
    },250);
  });
  inp.addEventListener("keydown",e=>{if(e.key==="Enter"){const b=res.querySelector("button");if(b){e.preventDefault();pick(b.dataset.code)}}});
  res.addEventListener("click",e=>{const b=e.target.closest("button[data-code]");if(b)pick(b.dataset.code)});
  if(!app.wk.person)setTimeout(()=>inp.focus(),0);
}

/* ---------- ورود به هر صفحه ---------- */
const lat=s=>String(s==null?"":s).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
const val=id=>$("#"+id).value;
async function renderWk(page){
  if(!app.connected)return;
  const c=app.wk.code;
  // مشخصات فرد هر بار از سرور خوانده می‌شود تا تغییرِ فیلدها (موبایل، شبا، حساب مساعده، …) در صفحهٔ دیگر بدون رفرش دیده شود
  if(c){
    try{app.wk.person=await api("GET","/api/personnel/"+enc(c))}catch(e){app.wk.person=null;app.wk.code="";showAlert(e.message)}
  }
  if(!c)app.wk.person=null;
  if(app.wk.person)app.pickCode=String(app.wk.person.code);
  if(app.page!==page)return;
  const R={loanform:renderLoan,vefagh:renderVefagh,advance:renderAdvance,goods:renderGoods,services:renderServices,emdad:renderEmdad,mehr:renderMehr,cheque:renderCheque,changes:renderChanges,life:renderLife,insurance:renderInsurance}[page];
  if(!R)return;
  await R();
  const p=app.wk.person;
  const B=wkBlock(p,page);
  if(B){const k=page+":"+p.code;if(app.wk.heirAlerted!==k){app.wk.heirAlerted=k;showAlert(`${pname(p)}: ${B.msg}`)}}
}
// وظیفه‌بگیر: دکمه‌های ثبت/چاپِ کارت اصلیِ صفحه کار نمی‌کنند (سرور هم ثبت را رد می‌کند)
document.addEventListener("click",e=>{
  const B=wkBlock(app.wk.person,app.page);if(!B||wkTab(app.page)==="rep")return;
  const b=e.target.closest("button.btn-main,button.btn-blue,button.btn-amber");if(!b)return;
  const root=b.closest("#page-"+app.page);if(!root)return;
  const first=[...root.querySelectorAll(".card")].find(c=>!c.classList.contains("pbar"));
  if(first&&first.contains(b)){e.stopImmediatePropagation();e.preventDefault();showAlert(B.msg)}
},true);
function openWk(page){
  if(!app.connected){showAlert("ابتدا به سرور وصل شوید.");return}
  if(!can(PAGE_PERM[page])){showAlert("شما به این بخش دسترسی ندارید.");return}
  const c=curCode();if(c)app.wk.code=c;
  const fid={vefagh:"vf-amt",advance:"ad-amt",goods:"gd-code",services:"sv-code",emdad:"em-amt",mehr:"mh-amt",cheque:"cq-date",changes:"ch-code",life:"li-chq"}[page];
  // اگر همین صفحه برای همین فرد باز است، فقط فیلد پیش‌فرض را فعال کن (فهرست کالای نیمه‌کاره پاک نشود)
  if(app.page===page&&app.wk.person&&app.wk.person.code===app.wk.code){wkFocus(fid);return}
  app.wk.focusId=fid||"";
  showPage(page);
}
const emptyMsg=t=>`<div class="empty">${t}</div>`;

