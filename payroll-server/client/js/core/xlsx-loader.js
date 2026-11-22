"use strict";
/* core/xlsx-loader.js — بارگذاری تنبل (Lazy) کتابخانهٔ SheetJS (نسخهٔ ۱۱۱)
   تا نسخهٔ ۱۱۰ فایل ۹۰۰ کیلوبایتی xlsx.full.min.js در <head> و به‌صورت مسدودکننده بارگذاری می‌شد.
   حالا فقط وقتی لازم است (یا در زمان بیکاری بعد از اتصال) یک‌بار تزریق می‌شود:
   - چند فراخوانی هم‌زمان همگی یک Promise مشترک می‌گیرند (فقط یک <script>)
   - اگر بارگذاری ناموفق شود، Promise رد می‌شود و تلاش بعدی دوباره امتحان می‌کند
   - قبل از resolve بررسی می‌شود که XLSX.utils واقعاً تعریف شده باشد */
psModule("core/xlsx-loader");
const XLSX_SRC="./libs/xlsx.full.min.js?v=0.20.3";   // نسخه در نشانی ← Cache بلندمدت امن (server/httpHeaders.js)
const XLSX_FAIL_MSG="کتابخانهٔ خواندن اکسل بارگذاری نشد. اتصال به سرور را بررسی کنید و اطمینان حاصل کنید فایل libs/xlsx.full.min.js کنار صفحهٔ برنامه وجود دارد.";
let _xlsxP=null;
const xlsxReady=()=>typeof XLSX!=="undefined"&&!!XLSX&&!!XLSX.utils&&typeof XLSX.read==="function";
function ensureXLSX(timeoutMs){
  if(xlsxReady())return Promise.resolve(XLSX);
  if(_xlsxP)return _xlsxP;
  timeoutMs=Math.max(1000,timeoutMs||20000);
  _xlsxP=new Promise((resolve,reject)=>{
    let s=document.querySelector("script[data-ps-xlsx]");
    if(!s){s=document.createElement("script");s.src=XLSX_SRC;s.async=true;s.dataset.psXlsx="1";document.head.appendChild(s)}
    let settled=false;
    const fail=()=>{if(settled)return;settled=true;clearTimeout(t);if(s.parentNode)s.parentNode.removeChild(s);_xlsxP=null;reject(new Error(XLSX_FAIL_MSG))};
    const done=()=>{if(settled)return;if(!xlsxReady())return fail();settled=true;clearTimeout(t);resolve(XLSX)};
    const t=setTimeout(fail,timeoutMs);
    s.addEventListener("load",done,{once:true});
    s.addEventListener("error",fail,{once:true});
  });
  return _xlsxP;
}
// پیش‌بارگذاری در زمان بیکاری مرورگر (بعد از اتصال)؛ خطا بی‌صدا است و هنگام استفادهٔ واقعی دوباره امتحان می‌شود
function preloadXLSX(){
  if(xlsxReady()||_xlsxP)return;
  const go=()=>{ensureXLSX().catch(()=>{})};
  if(typeof window.requestIdleCallback==="function")window.requestIdleCallback(go,{timeout:10000});else setTimeout(go,3000);
}
