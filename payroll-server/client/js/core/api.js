"use strict";
/* core/api.js — ارتباط با API: آدرس سرور، کلید، توکن، نوار پیشرفت و apiCall
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("core/api");
/* ---------- اتصال به سرور ---------- */
function apiBase(){return ($("#apiBase").value||"").trim().replace(/\/+$/,"")}
function apiKey(){return $("#apiKeyInput").value||""}
/* ---------- نگهداری امن کلید API (نسخهٔ ۱۱۱) ----------
   تا نسخهٔ ۱۱۰ کلید بعد از هر ورود خودکار در localStorage (psApiKey) ذخیره می‌شد و برای همیشه روی دیسک مرورگر می‌ماند
   (هر اسکریپت/افزونه یا کاربر دیگرِ همان رایانه به آن دسترسی داشت). حالا:
   - پیش‌فرض: فقط sessionStorage همین زبانه (psApiKeySess) ← با بستن زبانه/مرورگر پاک می‌شود؛ بارگذاری دوبارهٔ صفحه آن را نگه می‌دارد
   - «به‌خاطر سپردن کلید در این مرورگر» (انتخاب آگاهانهٔ کاربر، psApiKeyRemember=1) ← مثل قبل در localStorage هم ذخیره می‌شود
   - کلیدی که نسخه‌های قبلی بدون انتخاب کاربر ذخیره کرده‌اند یک‌بار به sessionStorage منتقل و از localStorage پاک می‌شود */
const KEY_LS="psApiKey",KEY_SS="psApiKeySess",KEY_REM="psApiKeyRemember";
function apiKeyRemembered(){try{return localStorage.getItem(KEY_REM)==="1"}catch(e){return false}}
function loadApiKey(){
  try{
    const rem=apiKeyRemembered(),ls=localStorage.getItem(KEY_LS)||"";
    if(ls&&!rem){if(!sessionStorage.getItem(KEY_SS))sessionStorage.setItem(KEY_SS,ls);localStorage.removeItem(KEY_LS)}   // انتقال کلید قدیمی
    return sessionStorage.getItem(KEY_SS)||(rem?ls:"")||"";
  }catch(e){return ""}
}
function storeApiKey(k,remember){
  try{
    if(remember===undefined)remember=apiKeyRemembered();
    if(k)sessionStorage.setItem(KEY_SS,k);else sessionStorage.removeItem(KEY_SS);
    if(remember&&k){localStorage.setItem(KEY_LS,k);localStorage.setItem(KEY_REM,"1")}
    else{localStorage.removeItem(KEY_LS);localStorage.removeItem(KEY_REM)}
  }catch(e){}
  syncRememberBoxes();
}
// دو چک‌باکس «به‌خاطر سپردن کلید» (صفحهٔ اتصال و پنجرهٔ ورود) همیشه وضعیت واقعی را نشان می‌دهند
function syncRememberBoxes(){const r=apiKeyRemembered();["#apiKeyRemember","#loginKeyRemember"].forEach(s=>{const c=document.querySelector(s);if(c)c.checked=r})}
let _syncTick=0,_syncRunning=false;   // وضعیت همگام‌سازی پس‌زمینه (syncQuiet)
// نوار پیشرفت بالای صفحه برای درخواست‌های کاربر (همگام‌سازی پس‌زمینه نوار را نشان نمی‌دهد)
const netBar=(()=>{let n=0,t=null,el=null;const bar=()=>el||(el=document.body.appendChild(Object.assign(document.createElement("div"),{id:"netBar"})));
  return d=>{n=Math.max(0,n+d);clearTimeout(t);if(n)t=setTimeout(()=>bar().classList.add("on"),250);else bar().classList.remove("on")}})();
async function api(method,path,body){
  const vis=!_syncRunning;if(vis)netBar(1);
  try{return await apiCall(method,path,body)}finally{if(vis)netBar(-1)}
}
async function apiCall(method,path,body){
  const res=await fetch(apiBase()+path,{
    method,
    headers:Object.assign({"Content-Type":"application/json"},apiKey()?{"X-API-Key":apiKey()}:{},authToken()?{"X-Auth-Token":authToken()}:{}),
    body:body!==undefined?JSON.stringify(body):undefined
  });
  let data=null;
  try{data=await res.json()}catch(e){}
  if(!res.ok){
    if(res.status===401&&data&&data.error==="login_required"&&!path.startsWith("/api/auth/"))showLogin();
    // سرور تا تغییر رمز (رمز اولیه/بازنشانی‌شده) بقیهٔ API را می‌بندد؛ پنجرهٔ اجباری تغییر رمز را باز و درخواست را تکرار می‌کنیم
    if(res.status===403&&data&&data.error==="password_change_required"&&!path.startsWith("/api/auth/")&&!api._pw){api._pw=true;try{await pwDlg(true)}finally{api._pw=false}return api(method,path,body)}
    const msg=(data&&data.message)?data.message:("خطای سرور (کد "+res.status+")");
    const err=new Error(msg);err.status=res.status;err.code=data&&data.error||"";   // نسخهٔ ۱۱۱: کد وضعیت برای تشخیص سرور قدیمی (۴۰۴) و ...
    throw err;
  }
  return data;
}

