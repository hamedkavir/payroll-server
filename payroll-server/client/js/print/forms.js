"use strict";
/* print/forms.js — چاپ فرم‌ها، فونت پنجرهٔ چاپ و قالب فرم‌ها
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("print/forms");
/* ---------- چاپ ---------- */
const FORM_LABELS={notice:"اطلاعیهٔ نوبت وام",receipt:"فرم دریافت وام",advance:"فرم مساعده",goods:"فرم درخواست کالا",service:"نامهٔ خدمات",emdad:"فرم وام امداد",cancel:"فرم انصراف و تسویه حساب",lifeA:"فرم بیمه عمر مصوب",lifeB:"فرم بیمه عمر مکمل",lifeClaim:"فرم پرداخت غرامت بیمه عمر",deceased:"فرم پروندهٔ درگذشته (بیمه عمر و وراث)",sigchange:"نامهٔ تغییر امضاء آموزشگاه",capital:"فرم افزایش سرمایه / تسویه وام",vcapital:"فرم وام وفاق (عضویت / افزایش سرمایه / تسویه وام)",vcancel:"فرم انصراف و تسویه حساب از وام وفاق",mehr:"فرم وام بانک مهر",cheque:"نامهٔ معرفی برای دریافت دسته چک",insDeps:"لیست افراد تحت تکفل (بیمه تکمیلی)"};
// نامهٔ خدمات: اگر در A5 جا شد A5 عمودی، وگرنه A4 عمودی (متن نامه‌ها بلند و متفاوت است)
const fitPageCss=()=>{const m=formMargins();return `@page a5p{size:A5 portrait;margin:7mm ${m.r}mm 7mm ${m.l}mm}@page a4p{size:A4 portrait;margin:10mm ${Math.max(12,m.r)}mm 10mm 12mm}.doc.pg-a5p{page:a5p}.doc.pg-a4p{page:a4p}`};
// پیش‌نمایش چاپ: builder تابعی است که HTML فرم را می‌سازد (برای بازسازی بعد از «بازگردانی متن پیش‌فرض»)
// متن‌های قابل‌ویرایش فرم با «ذخیره به‌عنوان قالب» برای همهٔ فرم‌های همان نوع ذخیره می‌شوند
// استایل برنامه برای پنجره‌های چاپ: از <style id="appCss"> یک‌بار در شروع خوانده می‌شود. (قبلاً «اولین <style> صفحه» برداشته می‌شد؛ افزونه‌های مرورگر که روی http:// یک <style> زودتر تزریق می‌کنند باعث چاپ بدون استایل می‌شدند.)
/* فونت در پنجرهٔ چاپ: فونت‌ها از قبل خوانده و داخل خود پنجره (data:) گذاشته می‌شوند؛ فایل‌های ثابت ۴۰۰ تا ۸۰۰ (نه فونت متغیر) تا وزن‌ها در ویندوز ۷ هم درست بماند */
const FONT_FILES=["Regular","Medium","SemiBold","Bold","ExtraBold"];
const FONT_DATA={};
const fontAbs=n=>new URL("./fonts/Vazirmatn-"+n+".woff2",location.href).href;
// نسخهٔ ۱۱۵: خواندن فونت‌ها برای چاپ به زمان بیکاری مرورگر منتقل شد تا با بارگذاری اولیهٔ صفحه رقابت نکند (تا آماده شدن، printFontFix از آدرس مطلق فایل استفاده می‌کند)
const loadPrintFonts=()=>FONT_FILES.forEach(n=>{(async()=>{try{const r=await fetch(fontAbs(n));if(!r.ok)return;const b=await r.blob();FONT_DATA[n]=await new Promise((ok,no)=>{const f=new FileReader();f.onload=()=>ok(f.result);f.onerror=no;f.readAsDataURL(b)})}catch(e){}})()});
if(window.requestIdleCallback)requestIdleCallback(loadPrintFonts,{timeout:4000});else setTimeout(loadPrintFonts,1500);
const printFontFix=doc=>FONT_FILES.reduce((d,n)=>d.split('url("./fonts/Vazirmatn-'+n+'.woff2")').join('url("'+(FONT_DATA[n]||fontAbs(n))+'")'),doc);
const APP_CSS_TEXT=(()=>{const el=document.getElementById("appCss");if(el)return el.textContent;let best="";document.querySelectorAll("style").forEach(x=>{if(x.textContent.length>best.length)best=x.textContent});return best})();
const appStyleHTML=()=>"<style>"+APP_CSS_TEXT+"</style>";
function printDoc(title,builder,formKey,auto=true,fit=false){
  const fonts='';
  const styleHTML=appStyleHTML();
  app.docBuilders=app.docBuilders||{};if(formKey)app.docBuilders[formKey]=builder;
  app.curForm=formKey||null;app.docData=null;let body;try{body=builder()}finally{app.curForm=null}
  if(formKey)body=layoutApply(formKey,body);
  const lbl=FORM_LABELS[formKey]||"";
  const tplBtns=formKey?`<button class="alt" onclick="saveTpl()">ذخیره متن به‌عنوان قالب همهٔ «${esc(lbl)}»‌ها</button><button class="alt2" onclick="resetTpl()">بازگردانی متن پیش‌فرض</button>`:"";
  const tplJs=formKey?String.raw`var FK=${JSON.stringify(formKey)},LBL=${JSON.stringify(lbl)};
function norm(s){return s.replace(/\u00a0/g," ")}
function ser(el){var c=el.cloneNode(true);c.querySelectorAll("[data-ph]").forEach(function(e){e.replaceWith(document.createTextNode("{"+e.getAttribute("data-ph")+"}"))});
var h=c.innerHTML.replace(/<br\s*\/?>/gi,"\n").replace(/<\/(div|p|li)>/gi,"\n").replace(/<[^>]+>/g,"");var ta=document.createElement("textarea");ta.innerHTML=h;return norm(ta.value).replace(/^\n+|\n+$/g,"")}
function msg(s){document.getElementById("pvMsg").textContent=s}
function saveTpl(){if(!window.opener||!window.opener.saveFormTpl){alert("ارتباط با پنجرهٔ اصلی قطع شده است؛ این پنجره را ببندید و دوباره باز کنید.");return}
var map={};document.querySelectorAll("#docRoot [data-slot]").forEach(function(e){var id=e.getAttribute("data-slot"),def=e.getAttribute("data-def")||"",tx=ser(e);map[id]=norm(tx)===norm(def)?null:tx});
window.opener.saveFormTpl(FK,map).then(function(){msg("ذخیره شد؛ از این به بعد همهٔ «"+LBL+"»‌ها با این متن چاپ می‌شوند.")}).catch(function(e){alert((e&&e.message)||e)})}
function resetTpl(){if(!confirm("متن این فرم به حالت پیش‌فرض برگردد؟ (برای همهٔ «"+LBL+"»‌ها)"))return;
window.opener.resetFormTpl(FK).then(function(){document.getElementById("docRoot").innerHTML=window.opener.rebuildDoc(FK);if(typeof fit==="function")fit();msg("متن پیش‌فرض بازگردانده شد.")}).catch(function(e){alert((e&&e.message)||e)})}`:"";
  // باز شدن خودکار پنجرهٔ چاپ مرورگر (با Enter چاپ می‌شود)؛ از همان پنجره قابل خاموش‌کردن است
  const autoJs=auto?String.raw`(function(){var AP=true;try{AP=localStorage.getItem("psAutoPrint")!=="0"}catch(e){}
document.addEventListener("DOMContentLoaded",function(){var c=document.getElementById("apChk");if(c){c.checked=AP;c.onchange=function(){try{localStorage.setItem("psAutoPrint",c.checked?"1":"0")}catch(e){}}}
if(!AP)return;var done=false,run=function(){if(done)return;done=true;setTimeout(function(){if(typeof fit==="function")fit();window.focus();window.print()},200)};(document.fonts?Promise.race([Promise.all([document.fonts.load("400 14px Vazirmatn"),document.fonts.load("600 14px Vazirmatn"),document.fonts.load("700 14px Vazirmatn"),document.fonts.load("800 14px Vazirmatn")]),new Promise(function(r){setTimeout(r,2500)})]).then(function(){return document.fonts.ready},function(){}):Promise.resolve()).then(run);setTimeout(run,1500)})})();`:"";
  // اندازه‌گیری نامه: ارتفاع در عرض A5 (۱۳۲×۱۹۶ میلی‌متر قابل‌چاپ) بیشتر شد → A4 عمودی
  const fitJs=fit===true?String.raw`function fit(){var d=document.querySelector("#docRoot .doc");if(!d)return;d.classList.remove("pg-a4p");d.classList.add("pg-a5p");var pd=d.style.padding;d.style.padding="0";var h=d.getBoundingClientRect().height;d.style.padding=pd;if(h>196*96/25.4-2){d.classList.remove("pg-a5p");d.classList.add("pg-a4p")}}
window.addEventListener("beforeprint",fit);document.addEventListener("DOMContentLoaded",function(){(document.fonts?Promise.race([Promise.all([document.fonts.load("400 14px Vazirmatn"),document.fonts.load("600 14px Vazirmatn"),document.fonts.load("700 14px Vazirmatn"),document.fonts.load("800 14px Vazirmatn")]),new Promise(function(r){setTimeout(r,2500)})]).then(function(){return document.fonts.ready},function(){}):Promise.resolve()).then(fit);var t=null,r=document.getElementById("docRoot");if(r)r.addEventListener("input",function(){clearTimeout(t);t=setTimeout(fit,300)})});`:fit==="a4l"?String.raw`function fit(){var d=document.querySelector("#docRoot .doc");if(!d)return;d.classList.remove("dd1","dd2");var lim=190*96/25.4-6,pd=d.style.padding;d.style.padding="0";if(d.getBoundingClientRect().height>lim){d.classList.add("dd1");if(d.getBoundingClientRect().height>lim)d.classList.add("dd2")}d.style.padding=pd}
window.addEventListener("beforeprint",fit);document.addEventListener("DOMContentLoaded",function(){(document.fonts?Promise.race([Promise.all([document.fonts.load("400 14px Vazirmatn"),document.fonts.load("600 14px Vazirmatn"),document.fonts.load("700 14px Vazirmatn"),document.fonts.load("800 14px Vazirmatn")]),new Promise(function(r){setTimeout(r,2500)})]).then(function(){return document.fonts.ready},function(){}):Promise.resolve()).then(fit);var t=null,r=document.getElementById("docRoot");if(r)r.addEventListener("input",function(){clearTimeout(t);t=setTimeout(fit,300)})});`:"";
  const apBox=auto?`<label style="display:flex;gap:4px;align-items:center;cursor:pointer"><input type="checkbox" id="apChk" checked>باز شدن خودکار پنجرهٔ چاپ</label>`:"";
  const doc=`<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><script>${tplJs}${fitJs}${autoJs}<\/script>${fonts}${styleHTML}
  <style>body{background:#fff;padding:0;margin:0}
  .pv-bar{position:sticky;top:0;z-index:50;background:#1e293b;color:#fff;padding:9px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font:13px Vazirmatn,Tahoma,sans-serif}
  .pv-bar button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:7px 16px;font:700 13px Vazirmatn,Tahoma,sans-serif;cursor:pointer}
  .pv-bar button.alt{background:#059669}.pv-bar button.alt2{background:#475569}
  .pv-bar span{color:#cbd5e1;font-size:12px}#pvMsg{color:#86efac;font-weight:700}
  @media screen{body{background:#cbd5e1}#docRoot .doc{background:#fff;margin:16px auto;box-shadow:0 2px 14px rgba(0,0,0,.25);padding:6mm;box-sizing:content-box}#docRoot:focus-within .doc{outline:2px dashed #93c5fd;outline-offset:-6px}}
  @media print{html,body{margin:0!important;padding:0!important;background:#fff!important}.pv-bar{display:none!important}#docRoot,#docRoot:focus-within{outline:none!important}#docRoot .doc{width:100%!important;max-width:none!important;padding:0!important;margin:0!important;box-shadow:none!important;outline:none!important}}
  #docRoot{outline:none}</style><style>${fit==="a4"?"@page{size:A4 portrait;margin:12mm 14mm}":fit==="a4l"?"@page{size:A4 landscape;margin:10mm}":formPageCss()}${fit===true?fitPageCss():""}@media screen{#docRoot .doc{width:${fit==="a4"?182:fit==="a4l"?277:148-formMargins().l-formMargins().r}mm}#docRoot .doc.pg-a4p{width:${210-12-Math.max(12,formMargins().r)}mm}}</style></head><body>
  <div class="pv-bar"><button onclick="if(typeof fit==='function')fit();window.focus();window.print()">چاپ</button>${apBox}${tplBtns}
  <span>چاپ روی A5 (عمودی). روی هر متن کلیک و ویرایش کنید: با «چاپ» فقط همین فرم تغییر می‌کند؛ با «ذخیره به‌عنوان قالب» تغییر برای همهٔ فرم‌های این نوع اعمال می‌شود.</span><span id="pvMsg" role="status"></span></div>
  <div id="docRoot" contenteditable="true" spellcheck="false">${body}</div>
  </body></html>`;
  const w=window.open("","_blank");
  if(!w){showAlert("مرورگر بازشدن پنجرهٔ چاپ را مسدود کرد. اجازهٔ پاپ‌آپ را برای این صفحه بدهید.");return}
  w.document.open();w.document.write(printFontFix(doc));w.document.close();
}
// قالب متن فرم‌ها (در تنظیمات سراسری ذخیره می‌شود؛ نیاز به دسترسی «تنظیمات»)
async function saveFormTpl(form,map){
  const ft=JSON.parse(JSON.stringify(FS().formTexts||{}));ft[form]=ft[form]||{};
  Object.entries(map).forEach(([k,v])=>{const id=k.split(".")[1];if(v===null)delete ft[form][id];else ft[form][id]=v});
  if(!Object.keys(ft[form]).length)delete ft[form];
  try{app.fs=await api("PUT","/api/form-settings",{formTexts:ft})}
  catch(e){throw new Error(/دسترسی/.test(e.message)?"ذخیرهٔ قالب نیاز به دسترسی «تنظیمات» دارد.":e.message)}
  return true;
}
async function resetFormTpl(form){
  const ft=JSON.parse(JSON.stringify(FS().formTexts||{}));delete ft[form];
  try{app.fs=await api("PUT","/api/form-settings",{formTexts:ft})}
  catch(e){throw new Error(/دسترسی/.test(e.message)?"بازگردانی قالب نیاز به دسترسی «تنظیمات» دارد.":e.message)}
  return true;
}
function rebuildDoc(form){if(!(app.docBuilders&&app.docBuilders[form]))return "";let h;app.curForm=form;try{h=app.docBuilders[form]()}finally{app.curForm=null}return layoutApply(form,h)}
// متن قابل‌ویرایش: متن پیش‌فرض با جای‌نگهدار {name}؛ اگر قالب ذخیره‌شده باشد جایگزین می‌شود. مقدارها (vars) HTML امن هستند.
/* =============================== اتصال به داده و فرمول در قالب‌ها و چیدمان آزاد =============================== */
// در هر متن (قالب متن فرم‌ها و متن‌های آزاد چیدمان): {کلید} = مقدار فیلد داده، {=فرمول} = محاسبه (مثلاً {=loanAmount*feePercent/100}، {=round(amount/installments)|words})
const DATA_LBL={name:"نام و نام خانوادگی",firstName:"نام",lastName:"نام خانوادگی",code:"کد پرسنلی",nationalId:"کد ملی",mobile:"شمارهٔ همراه",gender:"جنسیت",workplace:"محل خدمت",bankName:"نام بانک",bankAccount:"حساب بانکی",shaba:"شمارهٔ شبا",advanceAccount:"حساب مساعده",advanceOwner:"نام صاحب حساب مساعده",mehrAccount:"حساب بانک مهر",today:"تاریخ امروز",user:"کاربر جاری",
  loanAmount:"مبلغ وام",capital:"سرمایهٔ اولیه",curCapital:"آخرین سرمایه",installment:"مبلغ هر قسط",installmentAmount:"مبلغ هر قسط",lastInstallmentAmount:"مبلغ قسط آخر",months:"تعداد اقساط",installments:"تعداد اقساط",requestDate:"تاریخ درخواست",dueMonth:"ماه نوبت (عدد)",dueYear:"سال نوبت",loanNumber:"شمارهٔ وام",feePercent:"درصد کارمزد",amount:"مبلغ",serial:"شمارهٔ درخواست",reqDate:"تاریخ درخواست",branchName:"نام شعبه",branchCode:"کد شعبه",account:"شمارهٔ حساب",owner:"نام صاحب حساب",total:"جمع کل",downPayment:"پیش‌پرداخت",number:"شماره",date:"تاریخ",gName:"نام ضامن",gCode:"کد پرسنلی ضامن",gNationalId:"کد ملی ضامن",gMobile:"همراه ضامن",gWorkplace:"محل خدمت ضامن",description:"توضیحات",turnDate:"نوبت (ماه/سال)",receivedDate:"تاریخ دریافت"};
function pdata(p){p=p||{};return{name:pname(p),firstName:p.firstName||"",lastName:p.lastName||"",code:p.code||"",nationalId:p.nationalId||"",mobile:p.mobile||"",gender:p.gender||"",workplace:p.workplace||"",bankName:p.bankName||"",bankAccount:p.bankAccount||"",shaba:p.shaba||"",advanceAccount:p.advanceAccount||"",advanceOwner:p.advanceOwner||"",mehrAccount:p.mehrAccount||"",today:todayJalali(),user:(app.user&&(app.user.fullName||app.user.username))||""}}
function setDocData(p,rec,kind){const d=pdata(p);for(const [k,v] of Object.entries(rec||{}))if(v!=null&&typeof v!=="object"&&typeof v!=="function")d[k]=v;app.docData=d;app.docDataKind=kind}
const dataNow=()=>app.docData||pdata(app.docCtx||{});
const unesc=t=>String(t).replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&");
function dataFmt(v){
  if(typeof v==="number"&&Number.isFinite(v))return Number.isInteger(v)&&Math.abs(v)>=1000?fa(v):faId(String(Math.round(v*100)/100));
  return faId(String(v==null?"":v));
}
// ارزیاب امن عبارت (بدون eval): اعداد، شناسه‌های داده، + - * / % ( )، مقایسه، && || !، و توابع round floor ceil abs min max sum if pct
function lyCalc(src,D){
  const t=lat(String(src)).replace(/٫/g,".");const T=[],re=/\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|==|!=|&&|\|\||[-+*\/%(),<>!]))/y;
  let pos=0;while(pos<t.length){re.lastIndex=pos;const m=re.exec(t);if(!m){if(!t.slice(pos).trim())break;throw new Error("نویسهٔ نامعتبر")}pos=re.lastIndex;if(m[1]!==undefined)T.push({n:+m[1]});else if(m[2]!==undefined)T.push({id:m[2]});else T.push({op:m[3]})}
  let i=0;const peek=()=>T[i],eat=o=>{if(T[i]&&T[i].op===o){i++;return true}return false};
  const val=id=>{const v=D[id];if(typeof v==="number")return v;if(v==null||v==="")throw new Error("فیلد «"+id+"» مقدار ندارد");const n=Number(lat(String(v)).replace(/[,٬\s]/g,""));if(!Number.isFinite(n))throw new Error("فیلد «"+id+"» عدد نیست");return n};
  const F={round:(x,d=0)=>{const k=Math.pow(10,d);return Math.round(x*k)/k},floor:Math.floor,ceil:Math.ceil,abs:Math.abs,min:Math.min,max:Math.max,sum:(...a)=>a.reduce((p,c)=>p+c,0),if:(c,a,b)=>c?a:b,pct:(a,b)=>a*b/100};
  function prim(){const x=T[i++];if(!x)throw new Error("عبارت ناقص است");
    if(x.n!==undefined)return x.n;
    if(x.op==="("){const v=or();if(!eat(")"))throw new Error("پرانتز بسته نشده");return v}
    if(x.id!==undefined){if(eat("(")){const a=[];if(!eat(")")){do{a.push(or())}while(eat(","));if(!eat(")"))throw new Error("پرانتز بسته نشده")}if(!F[x.id])throw new Error("تابع «"+x.id+"» نیست");return F[x.id](...a)}return val(x.id)}
    throw new Error("عبارت نامعتبر")}
  function un(){if(eat("-"))return -un();if(eat("!"))return un()?0:1;return prim()}
  function mul(){let v=un();for(;;){if(eat("*"))v*=un();else if(eat("/")){const d=un();if(d===0)throw new Error("تقسیم بر صفر");v/=d}else if(eat("%"))v%=un();else return v}}
  function add(){let v=mul();for(;;){if(eat("+"))v+=mul();else if(eat("-"))v-=mul();else return v}}
  function cmp(){let v=add();const p=peek();if(p&&p.op&&[">","<",">=","<=","==","!="].includes(p.op)){i++;const w=add();return p.op===">"?+(v>w):p.op==="<"?+(v<w):p.op===">="?+(v>=w):p.op==="<="?+(v<=w):p.op==="=="?+(v===w):+(v!==w)}return v}
  function and(){let v=cmp();while(eat("&&"))v=(v&&cmp())?1:0;return v}
  function or(){let v=and();while(eat("||"))v=(v||and())?1:0;return v}
  const r=or();if(i<T.length)throw new Error("عبارت اضافی");return r;
}
// محاسبهٔ یک {=...|قالب}: قالب‌ها: words (به حروف)، raw (بدون جداکنندهٔ هزارگان)
function lyFormula(expr,D){
  const [e,f]=String(expr).split("|").map(x=>x.trim());
  try{const v=lyCalc(e,D||dataNow());if(!Number.isFinite(v))return "؟";return f==="words"?toWords(v):f==="raw"?faId(String(Math.round(v*100)/100)):dataFmt(Math.round(v*100)/100)}catch(er){return "⚠ "+er.message}
}
function lyEvalHtml(text,D){
  D=D||dataNow();
  return String(text).split(/(\{=[^}]*\}|\{\w+\})/).map(p=>{
    if(p.startsWith("{=")&&p.endsWith("}"))return esc(lyFormula(p.slice(2,-1),D));
    const m=/^\{(\w+)\}$/.exec(p);if(m&&Object.prototype.hasOwnProperty.call(D,m[1]))return esc(dataFmt(D[m[1]]));
    return esc(p);
  }).join("");
}
const ftx=(form,id,def,vars={})=>{
  const sv=(FS().formTexts||{})[form],src=sv&&typeof sv[id]==="string"?sv[id]:def;
  const DD=dataNow();
  const html=esc(src).replace(/\{=([^}]*)\}/g,(m,e)=>`<b data-ph="=${e}">${esc(lyFormula(unesc(e),DD))}</b>`).replace(/\{(\w+)\}/g,(m,k)=>Object.prototype.hasOwnProperty.call(vars,k)?`<b data-ph="${k}">${vars[k]}</b>`:(Object.prototype.hasOwnProperty.call(DD,k)?`<b data-ph="${k}">${esc(dataFmt(DD[k]))}</b>`:m)).replace(/\n/g,"<br>");
  return `<span data-slot="${form}.${id}" data-def="${esc(def)}">${html}</span>`;
};
const dHead=(bs,num,date)=>{const f=FS();return `<div class="d-head"><div class="d-r"><b>${esc(f.orgName)}</b><span>${esc(f.fundName)}</span></div><div class="d-c"><img src="${LOGO_SRC}" alt=""><div>${bs}</div></div><div class="d-l">${num?`<div>شماره: <b>${faId(esc(num))}</b></div>`:"<div>&nbsp;</div>"}<div>تاریخ: <b>${faId(esc(date||todayJalali()))}</b></div></div></div>`};
const dFoot=()=>`<div class="d-foot"><span>کاربر کامپیوتر: ${esc((app.user&&(app.user.fullName||app.user.username))||FS().operatorName)}</span><span>تاریخ چاپ: ${faId(todayJalali())}</span></div>`;
const dFl=(l,v,cls="")=>{const F=app.curForm;if(F){(app.fieldSeen=app.fieldSeen||{})[F]=(app.fieldSeen[F]||new Set()).add(l);if(!app.probe&&((FS().formHidden||{})[F]||[]).includes(l))return ""}return `<div class="d-fl ${cls}"><small>${l}</small><b>${v||"&nbsp;"}</b></div>`};
const rial=n=>`${fa(n)} ریال`;

/* فرم اطلاع‌رسانی نوبت وام (هنگام نوبت‌دادن به فرد داده می‌شود) — چیدمان مطابق نمونهٔ ارسالی */
function docNotice(p,L){ app.docCtx=p;setDocData(p,L,"loan");
  const F="notice",[py,pm]=addMonth(L.dueYear,L.dueMonth),pl=planOf(L.loanAmount,L.installment,L.months);
  const due=`${MONTHS[L.dueMonth-1]} ${faId(L.dueYear)}`,pay=`اواخر ${MONTHS[pm-1]} ${faId(py)}`;
  const V={due,pay,dueMonth:MONTHS[L.dueMonth-1],payMonth:MONTHS[pm-1],name:esc(pname(L.person)),code:faId(esc(L.code))};
  return `<div class="doc">${dHead(ftx(F,"bismillah","هو البصیر"),"",L.requestDate)}
    <h1 class="d-title">${ftx(F,"title","اطلاعیهٔ نوبت وام")}</h1>
    <div class="d-fg c3">${dFl("کد پرسنلی",faId(esc(L.code)))}${dFl("کد ملی",faId(esc(p.nationalId||"")))}${dFl("سرمایهٔ اولیه هنگام درخواست",rial(L.capital))}</div>
    <div class="d-fg c3">${dFl("نام و نام خانوادگی متقاضی",esc(pname(L.person)),"w2")}${dFl("مبلغ وام",rial(L.loanAmount))}</div>
    <div class="d-fg c3">${dFl("تعداد اقساط",faId(pl.k))}${dFl("مبلغ هر قسط",rial(L.installment))}${dFl("مبلغ قسط آخر",rial(pl.last))}</div>
    <div class="d-fg c3">${dFl("تاریخ نوبت",ftx(F,"turn_v","{due}",V))}${dFl("تاریخ مراجعه به تعاون",ftx(F,"visit","1 تا 10 {dueMonth}",V))}${dFl("تاریخ دریافت وام",ftx(F,"recv","15 الی 20 {payMonth}",V))}</div>
    <ol class="d-note"><li>${ftx(F,"n1","وام گیرنده موظف است در تاریخ مراجعه جهت تکمیل فرم پرداخت وام به همراه ضامن به کارشناسی تعاون مراجعه نماید.",V)}</li>
      <li>${ftx(F,"n2","در نگهداری این نسخه دقت فرمائید؛ در غیر این صورت مسئولیت به عهدهٔ خود همکار می‌باشد.",V)}</li>
      <li>${ftx(F,"n3","این فرم فقط جهت اطلاع‌رسانی از نوبت وام می‌باشد.",V)}</li></ol>
    <p class="d-p">${ftx(F,"p1","همکار محترم؛ بعد از تکمیل و تحویل فرم وام (امضاء توسط وام‌گیرنده و ضامن) به کارشناسی تعاون و امور رفاهی، وام شما به حساب حقوقی شما واریز خواهد شد. لطفاً از تماس تلفنی در این خصوص خودداری فرمایید.",V)}</p>
    <div style="display:flex;margin-top:10px"><div class="d-stamp">${ftx(F,"stamp","محل مهر تعاون")}</div></div>${dSigs(F,[],"margin-top:10px")}${dFoot()}</div>`;
}
/* فرم دریافت وام: کادر «مشخصات وام و وام‌گیرنده»، کادر «مشخصات ضامن» و کادر تعهد با امضاها؛ شبا، بانک و تاریخ واریز فیلد معمولی‌اند و در «چیدمان آزاد» عرضشان قابل تغییر است */
function dCard(F,id,title,inner){return `<div class="d-card"><div class="d-card-t">${ftx(F,id,title)}</div>${inner}</div>`}
function docReceipt(p,L){ app.docCtx=p;setDocData(p,L,"loan");
  const F="receipt",[py,pm]=addMonth(L.dueYear,L.dueMonth);
  const pay=`اواخر ${MONTHS[pm-1]} ${faId(py)}`;
  const pl=planOf(L.loanAmount,L.installment,L.months);
  const curCapLbl=L.curCapY&&L.curCapM?`آخرین سرمایه (${MONTHS[L.curCapM-1]} ${faId(L.curCapY)})`:"آخرین سرمایه (آخرین فیش)";
  const V={blank:`<span class="d-dots"></span>`,name:esc(pname(p)),code:faId(esc(L.code)),capital:rial(L.capital),loan:rial(L.loanAmount),pay,dueMonth:MONTHS[L.dueMonth-1],turn:`${MONTHS[L.dueMonth-1]} ${faId(L.dueYear)}`};
  const shaba=String(p.shaba||"").trim(),bank=String(p.bankName||"").trim();
  const z="\u200b",g=k=>esc(L[k]||""),gf=k=>faId(esc(L[k]||""));   // برچسب‌های ضامن با نویسهٔ نامرئی از برچسب‌های وام‌گیرنده جدا می‌شوند
  return `<div class="doc tight">${dHead(ftx(F,"bismillah","بسمه تعالی"),"",todayJalali())}
    <h1 class="d-title">${ftx(F,"title","فرم دریافت وام")}</h1>
    ${dCard(F,"c1_t","مشخصات وام و وام‌گیرنده:",`
      <div class="d-fg c4">${dFl("کد ملی",faId(esc(p.nationalId||"")))}${dFl("کد پرسنلی",faId(esc(L.code)))}${dFl("تاریخ درخواست",faId(esc(L.requestDate)))}${dFl("تلفن تماس",faId(esc(p.mobile||"")))}</div>
      <div class="d-fg c4">${dFl("نام و نام خانوادگی",esc(pname(p)),"w2")}${dFl("سرمایهٔ اولیه",rial(L.capital))}${dFl(curCapLbl,L.curCapital!=null?rial(L.curCapital):"—")}</div>
      <div class="d-fg c4">${dFl("مبلغ وام درخواستی",rial(L.loanAmount))}${dFl("تعداد اقساط",faId(pl.k))}${dFl("مبلغ هر قسط",rial(L.installment))}${dFl("مبلغ قسط آخر",rial(pl.last))}</div>
      <div class="d-fg c4">${dFl("شماره شبا",`<span dir="ltr">${esc(shaba)}</span>`,"w2")}${dFl("نام بانک",esc(bank))}</div>
      <div class="d-fg c4">${dFl("تاریخ نوبت",ftx(F,"turn_v","{turn}",V),"w2")}${dFl("تاریخ واریز وام",ftx(F,"pay_v","{pay}",V),"w2")}</div>
      <div class="d-fg c3">${dFl("امضاء وام‌گیرنده","","sl l")}</div>`)}
    ${dCard(F,"c2_t","مشخصات ضامن:",`
      <div class="d-fg c3">${dFl("نام و نام خانوادگی"+z,g("gName"))}${dFl("کد ملی"+z,gf("gNationalId"))}${dFl("کد پرسنلی"+z,gf("gCode"))}</div>
      <div class="d-fg c3">${dFl("تاریخ تولد"+z,gf("gBirthDate"))}${dFl("شماره همراه"+z,gf("gMobile"))}${dFl("محل خدمت"+z,g("gWorkplace"))}</div>
      <div class="d-fg c3">${dFl("امضاء"+z,"","sl l")}</div>`)}
    <div class="d-box"><p class="d-p" style="margin:0">${ftx(F,"g_cmt2","{name} با کد پرسنلی {code}؛ با اطلاع کامل از شرایط وام دایرهٔ تعاون وکالت تام و بلاعزل می‌دهم اقساط وام دریافتی مندرج در این برگه از حقوق اینجانب کسر گردد و در صورت انتقال وام‌گیرنده یا علل دیگری که کسر اقساط از حقوق وی میسر نباشد از حقوق ضامن کسر و به حساب صندوق وام ضروری واریز گردد.",V)}</p>
      <div class="d-fg c3">${dFl("امضاء وام گیرنده"+z,"","sl")}${dFl("امضاء ضامن"+z,"","sl")}${dFl("مهر و امضاء مسئول تعاون","","sl")}</div></div>
    ${dSigs(F,[],"margin-top:6px")}${dFoot()}</div>`;
}
/* فرم وام بانک مهر (A4): کادرهای مشخصات وام و وام‌گیرنده، مشخصات ضامن، تاییدیهٔ حسابداری و توضیحات؛ اقساط طبق روش کارمزد (مصوب ۱۳۸۸) */
const MH_ACC_TXT={pending:"در انتظار تأیید",approved:"تأیید شده",rejected:"رد شده"};
const mhFee=n=>Math.ceil(Math.max(1,n)/12);                  // تعداد اقساط کارمزد: یک قسط در هر سال (قسط ۱، ۱۳، ۲۵ ...)
const mhPc=n=>Math.max(1,n-mhFee(n));                        // تعداد اقساط اصل
const mhFeeNums=n=>Array.from({length:mhFee(n)},(_,k)=>1+12*k);
// مبلغ کارمزد هر سال = درصد × مانده اصل وام در ابتدای آن سال (پیش از قسط کارمزد: ۱۱ قسط اصل در هر سال گذشته)
const mhFeeAmts=(loan,inst,n,pct)=>mhFeeNums(n).map((no,k)=>({no,amount:Math.round(Math.max(0,loan-inst*11*k)*pct/100)}));
function docMehr(p,M){ app.docCtx=p;setDocData(p,M,"mehr");
  const F="mehr";
  const n=Math.max(1,M.installments||1),pc=mhPc(n),inst=M.installmentAmount>0?M.installmentAmount:Math.round((M.loanAmount||0)/pc);
  const last=M.lastInstallmentAmount>0?M.lastInstallmentAmount:Math.max(0,Math.round((M.loanAmount||0)-inst*(pc-1)));
  const V={name:esc(pname(p)),code:faId(esc(p.code)),loan:rial(M.loanAmount),inst:rial(inst)};
  const nid=v=>faId(esc(v||"")),z="\u200b",pct=M.feePercent!=null?M.feePercent:4;
  const notes="۱- همکار متقاضی می‌بایست چک برگشتی و اقساط معوق نداشته و در یکی از شعب بانک مهر دارای حساب باشد.\n۲- اقساط از حقوق وام‌گیرنده کسر نمی‌گردد. جهت پرداخت اقساط با شعبهٔ مربوطه هماهنگی نمایید.\n۳- در صورت عدم پرداخت اقساط، حسابداری این مدیریت بلافاصله بعد از اعلام بانک، اقساط معوقه را از حقوق وام‌گیرنده کسر و در صورتی که کسر اقساط از حقوق وی میسر نباشد از حقوق ضامن کسر می‌نماید.";
  return `<div class="doc">${dHead(ftx(F,"bismillah","بسمه تعالی"),"",M.requestDate||todayJalali())}
    <h1 class="d-title">${ftx(F,"title","فرم وام بانک مهر")}</h1>
    ${dCard(F,"h1","مشخصات وام و وام‌گیرنده:",`
      <div class="d-fg c4">${dFl("کد ملی",nid(p.nationalId))}${dFl("کد پرسنلی",faId(esc(p.code)))}${dFl("تاریخ درخواست",faId(esc(M.requestDate||"")))}${dFl("تلفن تماس",faId(esc(M.phone||p.mobile||"")))}</div>
      <div class="d-fg c4">${dFl("نام و نام خانوادگی",esc(pname(p)),"w2")}${dFl("محل خدمت",esc(p.workplace||""),"w2")}</div>
      <div class="d-fg c4">${dFl("مبلغ وام درخواستی",rial(M.loanAmount))}${dFl("تعداد کل اقساط",faId(n))}${dFl("مبلغ هر قسط اصل",rial(inst))}${dFl("مبلغ قسط آخر اصل",rial(last))}</div>
      <div class="d-fg c4">${dFl("تعداد اقساط اصل",faId(pc))}${dFl("درصد کارمزد",faId(pct)+"٪")}${dFl("اقساط کارمزد",mhFeeAmts(M.loanAmount||0,inst,n,pct).map(x=>"قسط "+faId(x.no)+": "+fa(x.amount)+" ریال").join(" ، "),"w2")}</div>
      <div class="d-fg c4">${dFl("شمارهٔ حساب بانک مهر",`<span dir="ltr">${faId(esc(M.mehrAccount||""))}</span>`,"w2")}</div>
      <div class="d-fg c3">${dFl("امضاء وام‌گیرنده","","sl l")}</div>`)}
    ${dCard(F,"h2","مشخصات ضامن:",`
      <div class="d-fg c3">${dFl("نام و نام خانوادگی"+z,esc(M.gName||""))}${dFl("کد ملی"+z,nid(M.gNationalId))}${dFl("کد پرسنلی"+z,faId(esc(M.gCode||"")))}</div>
      <div class="d-fg c3">${dFl("تاریخ تولد"+z,faId(esc(M.gBirthDate||"")))}${dFl("شماره همراه"+z,faId(esc(M.gMobile||"")))}${dFl("محل خدمت"+z,esc(M.gWorkplace||""))}</div>
      <div class="d-fg c3">${dFl("امضاء"+z,"","sl l")}</div>`)}
    ${dCard(F,"h3","تاییدیهٔ حسابداری:",`
      <div class="d-fg c4">${dFl("وضعیت تاییدیه",MH_ACC_TXT[M.accStatus]||MH_ACC_TXT.pending)}${dFl("تاریخ تاییدیه",faId(esc(M.accDate||"")))}${dFl("تأییدکننده",esc(M.accBy||""),"w2")}</div>
      <div style="margin-top:4px">${ftx(F,"a_p","گواهی می‌شود مشخصات و مبلغ وام فوق برای خانم/آقای {name} مورد تأیید حسابداری است و پرداخت مبلغ {loan} با اقساط ماهیانهٔ {inst} بلامانع می‌باشد.",V)}</div>
      <div class="d-fg c3">${dFl("مهر و امضاء مسئول حسابداری","","sl l")}</div>`)}
    ${dCard(F,"h4","توضیحات:",`<div style="line-height:1.9">${ftx(F,"notes",notes)}</div>${M.description||M.accNote?`<div style="margin-top:4px;line-height:1.9">${esc([M.description,M.accNote].filter(Boolean).join(" — "))}</div>`:""}`)}
    ${dSigs(F,[],"margin-top:8px")}${dFoot()}</div>`;
}
/* فرم مساعده */
function docAdvance(p,A,hist){ app.docCtx=p;setDocData(p,A,"advance");
  const F="advance",f=FS(),net=Math.round(A.amount*(1-(A.feePercent||0)/100));
  const rows=(hist||[]).concat([A]);
  const total=rows.reduce((s,x)=>s+x.amount,0);
  const from=rows[0].requestDate,to=A.requestDate;
  const emp=p.status==="بازنشسته"?"بازنشسته":"شاغل";
  const pl=planOf(A.amount,A.installmentAmount,A.installments),lastAmt=A.lastInstallmentAmount!=null?A.lastInstallmentAmount:pl.last;
  const V={org:esc(f.orgName),name:esc(pname(p)),emp,code:faId(esc(p.code)),account:`<span dir="ltr">${faId(esc(A.account||""))}</span>`,amount:rial(A.amount),fee:faId(A.feePercent||0),net:rial(net),payDay:faId(f.advancePayDay),from:faId(esc(from)),to:faId(esc(to))};
  return `<div class="doc">${dHead(ftx(F,"bismillah","بسمه تعالی"),"",A.requestDate)}
    <h1 class="d-title">${ftx(F,"title","فرم دریافت مساعده")}</h1>
    <div style="font-weight:700">${ftx(F,"to","مدیریت محترم {org}",V)}</div>
    <p class="d-p">${ftx(F,"p1","با سلام و احترام؛ اینجانب {name} از همکاران {emp} با کد پرسنلی {code} و شمارهٔ حساب {account}، مبلغ {amount} مساعده نیاز دارم و متعهد می‌شوم حسابداری از حقوق ماه جاری کسر نماید. خواهشمند است دستور اقدام لازم را صادر فرمایید.",V)}</p>
    <div class="d-fg c3" style="margin-top:6px">${dFl("مبلغ مساعده",rial(A.amount))}${dFl("تعداد اقساط",faId(pl.k))}${dFl("مبلغ هر قسط",rial(A.installmentAmount))}
      ${pl.k>1?dFl("مبلغ قسط آخر",rial(lastAmt)):""}${dFl("تاریخ درخواست",faId(esc(A.requestDate)))}${dFl("تلفن تماس",faId(esc(A.phone||"")))}${dFl("شمارهٔ حساب مساعده",`<span dir="ltr">${faId(esc(A.account||""))}</span>`,"w2")}${dFl("نام صاحب حساب",esc(A.owner||""),"w2")}${dFl("شرح مساعده",esc(A.description||""))}</div>
    <div class="d-note" style="list-style:none;padding:8px 12px">${ftx(F,"note","مبلغ فوق با احتساب کسر {fee} درصد (مبلغ قابل واریز: {net}) در روز {payDay} هر ماه به حساب شما واریز خواهد شد.",V)}</div>
    ${dSigs(F,[`<div class="d-sig">${esc(f.managerTitle)}<br><b>${esc(f.managerName)}</b></div>`,`<div class="d-sig">${ftx(F,"s2","کارشناس تعاون")}</div>`,`<div class="d-sig hl">${ftx(F,"s3","امضاء متقاضی")}</div>`])}
    <div class="d-sec"><h3>${ftx(F,"hist","سوابق دریافت مساعده از تاریخ {from} تا تاریخ {to}",V)}</h3>
      <table class="d-tbl"><tr><th>ردیف</th><th>تاریخ</th><th>شرح</th><th>مبلغ (ریال)</th></tr>
      ${rows.map((x,i)=>`<tr><td>${faId(i+1)}</td><td>${faId(esc(x.requestDate))}</td><td>${esc(x.description||"")}</td><td>${fa(x.amount)}</td></tr>`).join("")}
      <tr><th colspan="3">جمع کل</th><th>${fa(total)}</th></tr></table></div>${dFoot()}</div>`;
}
/* فرم درخواست کالا (فروش اقساطی) */
function docGoods(p,O){ app.docCtx=p;setDocData(p,O,"goods");
  const F="goods",f=FS(),rem=O.total-O.downPayment;
  const V={name:esc(pname(p)),inst:rial(O.installmentAmount),last:rial(O.lastInstallmentAmount),n:faId(O.installments),notes:esc(O.notes||""),plan:esc((O.items||[]).filter(x=>x.installments!=null).map(x=>x.name+": "+faId(x.installments)+" × "+fa(x.installmentAmount)).join("؛ "))};
  return `<div class="doc">${dHead(ftx(F,"bismillah","بسمه تعالی"),O.number,O.date)}
    <h1 class="d-title">${ftx(F,"title","فرم درخواست کالا (فروش اقساطی)")}</h1>
    <div class="d-fg c3">${dFl("شمارهٔ درخواست",faId(esc(O.number)))}${dFl("کد پرسنلی",faId(esc(p.code)))}${dFl("تلفن تماس",faId(esc(p.mobile||"")))}
      ${dFl("نام و نام خانوادگی",esc(pname(p)),"w2")}${dFl("تاریخ",faId(esc(O.date)))}</div>
    <table class="d-tbl" style="margin-top:6px"><tr><th>ردیف</th><th>شرح کالا</th>${O.items.some(x=>x.deductionCode)?"<th>کد کسر</th>":""}<th>واحد</th><th>تعداد</th><th>قیمت واحد</th><th>جمع (ریال)</th>${O.perItemInstallments?"<th>تعداد اقساط</th><th>مبلغ قسط</th>":""}</tr>
      ${O.items.map((x,i)=>`<tr><td>${faId(i+1)}</td><td style="text-align:start">${esc(x.name)}</td>${O.items.some(y=>y.deductionCode)?`<td>${faId(esc(x.deductionCode||""))}</td>`:""}<td>${esc(x.unit)}</td><td>${faId(x.qty)}</td><td>${fa(x.unitPrice)}</td><td>${fa(x.qty*x.unitPrice)}</td>${O.perItemInstallments?`<td>${faId(x.installments)}</td><td>${fa(x.installmentAmount)}${x.installments>1&&x.lastInstallmentAmount!=null&&Math.round(x.lastInstallmentAmount)!==Math.round(x.installmentAmount)?`<br><small>(آخر: ${fa(x.lastInstallmentAmount)})</small>`:""}</td>`:""}</tr>`).join("")}
      ${(()=>{const cs=O.items.some(x=>x.deductionCode)?6:5,sm=Math.round(O.items.reduce((s,x)=>s+x.qty*x.unitPrice,0));const ex=O.perItemInstallments?'<td colspan="2"></td>':"";return O.total!==sm?`<tr><td colspan="${cs}">جمع اقلام</td><td>${fa(sm)}</td>${ex}</tr><tr><td colspan="${cs}">رند</td><td>${fa(O.total-sm)}</td>${ex}</tr>`:""})()}
      <tr><th colspan="${O.items.some(x=>x.deductionCode)?6:5}">جمع کل</th><th>${fa(O.total)}</th>${O.perItemInstallments?'<th colspan="2"></th>':""}</tr></table>
    <div class="d-fg c5" style="margin-top:6px">${dFl("پیش‌پرداخت",fa(O.downPayment))}${dFl("مانده برای تقسیط",fa(rem))}${(()=>{const mx=O.perItemInstallments&&new Set(O.items.map(x=>x.installments)).size>1;return dFl(mx?"حداکثر تعداد اقساط":"تعداد اقساط",faId(O.installments))+dFl(mx?"جمع قسط ماهانه (ماه اول)":"مبلغ هر قسط",fa(O.installmentAmount))+dFl(mx?"قسط ماه آخر":"مبلغ قسط آخر",fa(O.lastInstallmentAmount))})()}</div>
    <div class="hint" style="font-size:9px;color:#555;margin:1px 0 0">مبالغ به ریال</div>
    ${O.notes?`<div class="d-note" style="list-style:none;padding:6px 12px">${ftx(F,"notes","توضیحات: {notes}",V)}</div>`:""}
    <p class="d-p">${ftx(F,"p1","اینجانب {name} کالاهای فوق را تحویل گرفتم و متعهد می‌شوم اقساط آن را به مبلغ {inst} (قسط آخر {last}) در {n} ماه از حقوق اینجانب کسر و به حساب صندوق واریز نمایند.",V)}</p>
    ${dSigs(F,[`<div class="d-sig">${ftx(F,"s1","امضاء متقاضی (تحویل‌گیرنده)")}</div>`,`<div class="d-sig">${ftx(F,"s2","انباردار")}</div>`,`<div class="d-sig">${ftx(F,"s3","کارشناس تعاون")}</div>`,`<div class="d-sig">${esc(f.managerTitle)}<br><b>${esc(f.managerName)}</b></div>`])}${dFoot()}</div>`;
}
// ویرایش قالب متن فرم‌ها با داده‌های نمونه (از تنظیمات)
function sampleBuilders(){
  const p={code:"12345",firstName:"نام",lastName:"نمونه",nationalId:"0012345678",mobile:"09120000000",status:"شاغل",workplace:"دبستان نمونه",shaba:"IR000000000000000000000000",bankName:"ملی",mehrAccount:"1234567890123"};
  const d=todayJalali();
  const L={code:p.code,person:p,loanNumber:"1",requestDate:d,capital:123000000,loanAmount:520000000,months:36,installment:15000000,dueMonth:7,dueYear:1405,curCapital:187000000,curCapY:1405,curCapM:6};
  const A={requestDate:d,amount:50000000,installments:2,installmentAmount:25000000,feePercent:FS().advanceFeePercent!=null?FS().advanceFeePercent:1,phone:p.mobile,account:"0000000000000000",owner:"نام صاحب حساب",description:"مساعده",lastInstallmentAmount:25000000};
  const O={number:"140507100",code:p.code,date:d,total:13000000,downPayment:2000000,installments:5,installmentAmount:3000000,lastInstallmentAmount:2000000,notes:"توضیحات نمونه",items:[{name:"کالای نمونه",unit:"عدد",qty:1,unitPrice:13000000,deductionCode:"501"}]};
  const R={letterNumber:"37852",requestDate:d,institutionName:"فروشگاه نمونه",letterText:"به استحضار می‌رساند همکار با مشخصات ذیل ... (متن نمونهٔ نامه)\nآدرس: ...\nشماره تماس: ...",footerText:"اینجانب با مشخصات فوق مبلغ ............ ریال از فروشگاه خریداری نموده‌ام.\n\nامضا همکار",showNet:true,netAmount:230164379,showAmount:true,amount:70000000,showVisit:true,visitDate:d};
  const E={requestDate:d,requestTime:"09:30",amount:1000000000,feeEnabled:true,feePercent:1,feeAmount:10000000,netAmount:990000000,installments:20,installmentAmount:50000000,account:"0000000000000",phone:p.mobile,description:"دستور معاونت مالی",lastInstallmentAmount:50000000};
  const C={date:d,capital:300000000,loanRemaining:59000000,payable:241000000};
  const CQ={serial:19647,reqDate:d,bankCode:"1",bankName:"بانک ملی",branchCode:"2768",branchName:"مینودر قزوین",account:"0000000000000"};
  const MH={requestDate:d,loanAmount:300000000,installments:24,installmentAmount:13000000,lastInstallmentAmount:1000000,mehrAccount:p.mehrAccount,feePercent:4,phone:p.mobile,gName:"ضامن نمونه",gNationalId:"0012345679",gCode:"54321",gBirthDate:"1360/01/01",gMobile:"09120000001",gWorkplace:"دبیرستان نمونه",accStatus:"approved",accDate:d,accBy:"حسابدار نمونه",accNote:"",description:""};
  const ID={head:{firstName:"نام",lastName:"نمونه",pcode:p.code,nid:p.nationalId,sex:"مرد",unit:"",plan:""},counts:{active:3,total:3,cancelled:0},note:"",members:[
    {rel:"سرپرست",firstName:"نام",lastName:"نمونه",sex:"مرد",birthYear:"1360",nid:"0012345678",start:"1405/01/01",end:"1405/12/29",cancelled:false,reason:"",premium:12000000},
    {rel:"همسر",firstName:"همسر",lastName:"نمونه",sex:"زن",birthYear:"1363",nid:"0012345679",start:"1405/01/01",end:"1405/12/29",cancelled:false,reason:"",premium:12000000},
    {rel:"فرزند",firstName:"فرزند",lastName:"نمونه",sex:"مرد",birthYear:"1390",nid:"0012345680",start:"1405/01/01",end:"1405/12/29",cancelled:false,reason:"",premium:12000000}]};
  const LP={number:4571,insType:"mosavab",regDate:d,description:"",beneficiaries:[{firstName:"نام",lastName:"نمونه",nationalId:"0012345678",idNumber:"146",issuePlace:"قزوین",relation:"همسر",sharePercent:100,active:true,amount:1000000000,account:"IR000000000000000000000000",bank:"ملی"}]};
  const DW={id:0,code:p.code,firstName:"نام",lastName:"نمونه",fatherName:"پدر",nationalId:"0012345678",idNumber:"123",birthDate:"13500101",deathDate:d,letterDate:d,docsDate:d,notes:"",
    items:[{kind:"approved",amount:10000000000,officeDate:d,heirsDate:d,refNo:"12345",notes:""},{kind:"supplementary",amount:5000000000,officeDate:d,heirsDate:d,refNo:"12346",notes:""},{kind:"fund",amount:3000000000,officeDate:d,heirsDate:"",refNo:"",notes:""},{kind:"debtor",amount:2000000000,officeDate:"",heirsDate:"",refNo:"",notes:""}],
    heirs:[{firstName:"همسر",lastName:"نمونه",nationalId:"0012345678",relation:"همسر",sharePercent:50,account:"0000000000000",shaba:"IR000000000000000000000000",bankName:"ملی",payDate:d,paid:true,notes:""},{firstName:"فرزند",lastName:"نمونه",nationalId:"0012345679",relation:"پسر",sharePercent:50,account:"",shaba:"",bankName:"",payDate:"",paid:false,notes:""}]};
  const SGS={name:"نمونه",gender:"دخترانه",level:"دوره دوم",account:"0000000000000"},SGR={regNo:"12227",letterNo:"",reqDate:d,bankName:"بانک ملی",branch:"شعبه نمونه",account:SGS.account,managerName:"مدیر نمونه",teacherName:"نمایندهٔ معلمان نمونه",parentsName:"نمایندهٔ اولیاء نمونه"};
  return {vcapital:()=>docVefagh(p,{date:d,kind:1,amount:10170000,slipNo:"541341",capital:240000000,newCapital:250170000,loan:0,installment:0,codes:{capital:"801",loan:"802"}}),vcancel:()=>docVefaghCancel(p,{date:d,capital:240000000,loanRemaining:40000000,payable:200000000,codes:{capital:"801",loan:"802"}}),capital:()=>docCapital(p,{date:d,kind:1,amount:10170000,slipNo:"541341",capital:240000000,newCapital:250170000,loan1:0,loan2:0}),sigchange:()=>docSigChange(SGR,SGS),deceased:()=>docDeceased(DW),notice:()=>docNotice(p,L),receipt:()=>docReceipt(p,L),advance:()=>docAdvance(p,A,[]),goods:()=>docGoods(p,O),service:()=>docService(p,R),emdad:()=>docEmdad(p,E,[{date:d,kind:"امداد",desc:"",amount:E.amount}]),cancel:()=>docCancel(p,C),lifeA:()=>docLife(p,LP),lifeB:()=>docLife(p,Object.assign({},LP,{insType:"mokammel"})),lifeClaim:()=>docLifeClaim(p,LP),mehr:()=>docMehr(p,MH),cheque:()=>docCheque(p,CQ),insDeps:()=>docInsDeps(p,ID)};
}
function openFormTemplate(form){
  const b=sampleBuilders()[form];
  if(b)printDoc("ویرایش قالب — "+FORM_LABELS[form],b,form,false,form==="deceased"||form==="insDeps"?"a4l":/^life/.test(form)||form==="mehr"||form==="cheque"?"a4":form==="service"||form==="sigchange");
}

