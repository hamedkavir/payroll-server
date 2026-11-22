"use strict";
/* core/util.js — کمک‌کارهای عمومی: انتخابگر $، گزارش زنده، هشدار/تأیید، اعداد و تاریخ فارسی، esc
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("core/util");
const MONTHS=["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
const $=s=>document.querySelector(s);

function logLine(msg){
  const el=$("#liveLog");if(!el)return;
  const e=el.querySelector(".logEmpty");if(e)e.remove();
  const d=document.createElement("div");d.className="logLine";
  d.textContent="["+new Date().toLocaleTimeString("fa-IR")+"] "+msg;
  el.appendChild(d);el.scrollTop=el.scrollHeight;
}
// showAlert / showConfirm / confirmAsync از نسخهٔ ۱۱۱ در core/dialogs.js تعریف می‌شوند (مدیریت Focus، کلید Escape و ARIA)

/* ---------- کمک‌کارهای فارسی/عددی (بدون نیاز به شبکه) ---------- */
const fa=n=>Math.round(n||0).toLocaleString("fa-IR");
const toEnDigits=v=>String(v==null?"":v).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
const faId=v=>String(v).replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d]);
// Escape برای HTML (متن و مقدار ویژگی‌ها، با کوتیشن دوتایی یا تکی): & < > " ' ← موجودیت HTML (unesc در print/forms.js عکس همین است)
const ESC_MAP={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>ESC_MAP[c]);
// آیکون SVG کنترل از sprite صفحه (v119: جایگزین گلیف‌های متنی ☰ « ✎ ▾ ‹ › ▲ ▼). cls اختیاری: "fwd" = جلو، "back" = عقب، "edge" = سمت لبهٔ منو؛ جهت‌شان با dir صفحه در theme.css برعکس می‌شود
const ico=(n,cls)=>`<svg class="i ci${cls?" "+cls:""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
function toNum(v){
  if(typeof v==="number")return isFinite(v)?v:0;
  const s=String(v==null?"":v).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[,٬\s]/g,"").replace(/٫/g,".").replace(/[^\d.\-]/g,"");
  const n=parseFloat(s);return isFinite(n)?n:0;
}
const txt=v=>v==null?"":String(v).trim();
function norm(s){
  return String(s==null?"":s).replace(/[\u200c\u200f\u200e\s_.\-()]/g,"")
    .replace(/[يیۍ]/g,"ی").replace(/[كک]/g,"ک").replace(/[أإآا]/g,"ا")
    .replace(/[ؤو]/g,"و").replace(/ئ/g,"ی").replace(/ة/g,"ه")
    .replace(/[ًٌٍَُِّْ]/g,"").toLowerCase();
}
const YEK=["","یک","دو","سه","چهار","پنج","شش","هفت","هشت","نه"];
const DAH=["","","بیست","سی","چهل","پنجاه","شصت","هفتاد","هشتاد","نود"];
const DH=["ده","یازده","دوازده","سیزده","چهارده","پانزده","شانزده","هفده","هجده","نوزده"];
const SAD=["","صد","دویست","سیصد","چهارصد","پانصد","ششصد","هفتصد","هشتصد","نهصد"];
const SCALE=["","هزار","میلیون","میلیارد","هزار میلیارد"];
const u100=n=>n<10?YEK[n]:n<20?DH[n-10]:(n%10?DAH[(n/10)|0]+" و "+YEK[n%10]:DAH[(n/10)|0]);
const u1000=n=>{const s=(n/100)|0,r=n%100;return !s?u100(r):(r?SAD[s]+" و "+u100(r):SAD[s])};
function toWords(n){
  n=Math.round(Math.abs(n||0));if(n===0)return "صفر";
  const p=[];let i=0;
  while(n>0&&i<SCALE.length){const g=n%1000;if(g)p.unshift(u1000(g)+(SCALE[i]?" "+SCALE[i]:""));n=(n/1000)|0;i++}
  return p.join(" و ");
}
function todayJalali(){
  try{return new Intl.DateTimeFormat("fa-IR-u-ca-persian-nu-latn",{year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replace(/\u200f/g,"")}catch(e){return ""}
}
const curY=()=>{const y=parseInt(todayJalali().split("/")[0],10);return isFinite(y)?y:1405};
const curM=()=>{const m=parseInt(todayJalali().split("/")[1],10);return isFinite(m)?m-1:0};

