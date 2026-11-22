"use strict";
/* ui/appearance.js — ظاهر برنامه (رنگ، چگالی، حالت تیره)
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("ui/appearance");
// ===== ظاهر برنامه (تنظیمات ← ظاهر برنامه): فقط CSS صفحه (@media screen)، ذخیره در مرورگر (localStorage) =====
const AP_ACCENTS={
  teal:{n:"سبزآبی (پیش‌فرض)",c:"#23928d",soft:"#dcf7f4",ink:"#005a59",sb:"#44b2aa",rgb:"35,146,141"},
  blue:{n:"آبی",c:"#2f6fd6",soft:"#e3ecff",ink:"#123f8f",sb:"#6aa0ff",rgb:"47,111,214"},
  violet:{n:"بنفش",c:"#7c4dd6",soft:"#eee6fd",ink:"#4b2a99",sb:"#a98cf0",rgb:"124,77,214"},
  green:{n:"سبز",c:"#1f9a5b",soft:"#def8e7",ink:"#085634",sb:"#4cc283",rgb:"31,154,91"},
  orange:{n:"نارنجی",c:"#d9761a",soft:"#fff0d4",ink:"#7a4702",sb:"#f0a050",rgb:"217,118,26"},
  rose:{n:"سرخابی",c:"#d1435b",soft:"#ffe3e8",ink:"#8f1f33",sb:"#f08aa0",rgb:"209,67,91"},
  slate:{n:"خاکستری",c:"#4a5a73",soft:"#e6ebf2",ink:"#243044",sb:"#8da2c4",rgb:"74,90,115"}};
const AP_SIDEBARS={navy:{n:"سرمه‌ای (پیش‌فرض)",a:"#101d38",b:"#1c2a49",c:"#26324c"},charcoal:{n:"زغالی",a:"#171a21",b:"#242933",c:"#323946"},forest:{n:"سبز تیره",a:"#0f2a24",b:"#183a32",c:"#244b41"},plum:{n:"آلویی",a:"#25163a",b:"#33204f",c:"#432b66"}};
const AP_DEF={accent:"teal",sidebar:"navy",font:"normal",density:"normal",radius:"normal",dark:false};
const AP_FONT={small:"13px",normal:"",large:"16px",xlarge:"17.5px"};
const AP_RADIUS={sharp:["4px","3px"],normal:["","" ],round:["18px","14px"]};
function apLoad(){try{return Object.assign({},AP_DEF,JSON.parse(localStorage.getItem("psAppearance")||"{}"))}catch(e){return Object.assign({},AP_DEF)}}
function apSave(a){try{localStorage.setItem("psAppearance",JSON.stringify(a))}catch(e){}}
function apCss(a){
  const ac=AP_ACCENTS[a.accent]||AP_ACCENTS.teal,sb=AP_SIDEBARS[a.sidebar]||AP_SIDEBARS.navy,r=AP_RADIUS[a.radius]||AP_RADIUS.normal;
  let c=":root{";
  if(a.accent!=="teal")c+=`--ui-teal:${ac.c};--ui-teal-soft:${ac.soft};--ui-teal-ink:${ac.ink};--ui-sb-primary:${ac.sb};--focus:${ac.c};--ui-ring:0 0 0 3px rgba(${ac.rgb},.22);`;
  if(a.sidebar!=="navy")c+=`--navy:${sb.a};--navy-2:${sb.b};--navy-3:${sb.c};`;
  if(r[0])c+=`--ui-radius:${r[0]};--ui-radius-sm:${r[1]};`;
  c+="}";
  if(AP_FONT[a.font])c+=`html body{font-size:${AP_FONT[a.font]}}`;
  if(a.density==="compact")c+="html .card{padding:10px 12px}html table.tbl th,html table.tbl td{padding:5px 8px}html .btn{padding:5px 11px}html .inp{padding:5px 9px}";
  if(a.density==="comfy")c+="html .card{padding:20px 22px}html table.tbl th,html table.tbl td{padding:11px 14px}html .btn{padding:9px 18px}html .inp{padding:10px 14px}";
  // نسخهٔ ۱۱۱: حالت تیره دیگر با filter:invert ساخته نمی‌شود؛ رنگ‌ها در css/theme.css بخش [19] darkV111 با متغیرها تعریف شده‌اند
  return c;
}
// dark: false (خاموش) | true (روشن) | "auto" (هماهنگ با تنظیم سیستم‌عامل/مرورگر)
const AP_DARK_MQ=window.matchMedia?window.matchMedia("(prefers-color-scheme: dark)"):null;
const apIsDark=a=>a.dark===true||a.dark==="1"||(a.dark==="auto"&&!!(AP_DARK_MQ&&AP_DARK_MQ.matches));
if(AP_DARK_MQ){const f=()=>{const a=apLoad();if(a.dark==="auto")applyAppearance(a)};if(AP_DARK_MQ.addEventListener)AP_DARK_MQ.addEventListener("change",f);else if(AP_DARK_MQ.addListener)AP_DARK_MQ.addListener(f)}
function applyAppearance(a){
  a=a||apLoad();
  let st=document.getElementById("appearanceCss");
  if(!st){st=document.createElement("style");st.id="appearanceCss";document.head.appendChild(st)}
  st.textContent="@media screen{"+apCss(a)+"}";   // فقط روی صفحه؛ چاپ و پنجره‌های چاپ بدون تغییر
  document.documentElement.classList.toggle("ui-dark",apIsDark(a));
}
function renderLookCard(){
  const box=$("#lookBody");if(!box)return;
  const a=apLoad();
  const sel=(id,opts)=>`<select id="lk-${id}">${opts.map(([v,t])=>`<option value="${v}"${String(a[id])===v?" selected":""}>${t}</option>`).join("")}</select>`;
  box.innerHTML=`<div class="stack u-gap14">
    <div><div class="sub u-mb6"><b>رنگ اصلی</b></div><div class="wk-acts" id="lk-accents">${Object.entries(AP_ACCENTS).map(([k,v])=>`<button type="button" class="btn${a.accent===k?" btn-main":""} u-iflex u-ai-center u-gap8" data-lkacc="${k}"><span style="width:16px;height:16px;border-radius:50%;background:${v.c};display:inline-block;border:2px solid #fff;box-shadow:0 0 0 1px ${v.c}"></span>${v.n}</button>`).join("")}</div></div>
    <div class="fgrid">
      <label class="f">رنگ منوی کناری${sel("sidebar",Object.entries(AP_SIDEBARS).map(([k,v])=>[k,v.n]))}</label>
      <label class="f">اندازهٔ نوشته${sel("font",[["small","کوچک"],["normal","متوسط (پیش‌فرض)"],["large","بزرگ"],["xlarge","بزرگ‌تر"]])}</label>
      <label class="f">فشردگی صفحه${sel("density",[["compact","فشرده"],["normal","معمولی (پیش‌فرض)"],["comfy","راحت"]])}</label>
      <label class="f">گوشه‌ها${sel("radius",[["sharp","تیز"],["normal","معمولی (پیش‌فرض)"],["round","گرد"]])}</label>
      <label class="f">حالت تیره<select id="lk-dark"><option value="0"${!a.dark?" selected":""}>خاموش</option><option value="1"${a.dark===true?" selected":""}>روشن</option><option value="auto"${a.dark==="auto"?" selected":""}>هماهنگ با سیستم</option></select></label>
    </div>
    <div class="wk-acts"><button class="btn" type="button" id="lk-reset">بازگشت به ظاهر پیش‌فرض</button></div></div>`;
}
function lookChange(patch){const a=Object.assign(apLoad(),patch);apSave(a);applyAppearance(a);renderLookCard()}
$("#lookCard").addEventListener("click",e=>{const b=e.target.closest("[data-lkacc]");if(b)lookChange({accent:b.dataset.lkacc});if(e.target.id==="lk-reset"){try{localStorage.removeItem("psAppearance")}catch(x){}applyAppearance(Object.assign({},AP_DEF));renderLookCard()}});
$("#lookCard").addEventListener("change",e=>{const id=e.target.id||"";if(!id.startsWith("lk-")||id==="lk-reset")return;const k=id.slice(3);lookChange({[k]:k==="dark"?(e.target.value==="auto"?"auto":e.target.value==="1"):e.target.value})});
applyAppearance();renderLookCard();
