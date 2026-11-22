"use strict";
/* personnel/photos.js — عکس پرسنل
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("personnel/photos");
/* ====================== عکس پرسنل (پوشهٔ pic روی سرور) ====================== */
const PHOTO_CACHE=new Map(),PHOTO_PEND=new Map();
function fetchPhoto(code){
  code=String(code==null?"":code).trim();if(!code)return Promise.resolve(null);
  if(PHOTO_CACHE.has(code))return Promise.resolve(PHOTO_CACHE.get(code));
  if(PHOTO_PEND.has(code))return PHOTO_PEND.get(code);
  const pr=(async()=>{
    let url=null,keep=true;
    try{
      const h={};if(apiKey())h["X-API-Key"]=apiKey();if(authToken())h["X-Auth-Token"]=authToken();
      const r=await fetch(apiBase()+"/api/photos/"+enc(code),{headers:h});
      if(r.ok){const bl=await r.blob();if(bl.size>0)url=URL.createObjectURL(bl)}
      else if(r.status!==404)keep=false;      // خطای موقت (مثلاً نشست منقضی) برای همیشه کش نشود
    }catch(e){keep=false}
    if(keep)PHOTO_CACHE.set(code,url);
    PHOTO_PEND.delete(code);
    return url;
  })();
  PHOTO_PEND.set(code,pr);return pr;
}
async function applyPhotos(root){
  if(!root)return;
  await Promise.all([...root.querySelectorAll("[data-photo]")].map(async el=>{
    const u=await fetchPhoto(el.dataset.photo);
    if(u&&el.isConnected){el.classList.add("has-photo");el.innerHTML=`<img src="${u}" alt="">`}
  }));
}
async function photoCheck(){
  const out=$("#photoStatus");out.textContent="در حال بررسی…";
  try{
    const r=await api("GET","/api/photos");
    out.innerHTML=r.found?(r.count?`پوشهٔ عکس: <b dir="ltr">${esc(r.dir)}</b> — ${faId(r.count)} عکس (نمونه: <span dir="ltr">${esc(r.sample.join("، "))}</span>)`
      :`پوشهٔ <b dir="ltr">${esc(r.dir)}</b> پیدا شد ولی عکسی (jpg/png/webp) در آن نیست.`)
      :`پوشهٔ pic روی سرور پیدا نشد. مسیرهای بررسی‌شده: <span dir="ltr">${esc(r.searched.join(" | "))}</span> — پوشه را بسازید یا PIC_DIR را در فایل .env بگذارید.`;
  }catch(e){out.textContent=e.message}
}


