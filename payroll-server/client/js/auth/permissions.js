"use strict";
/* auth/permissions.js — کاربر جاری، مجوزها و تب‌های تنظیمات
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("auth/permissions");
/* ====================== کاربران، ورود و سطح دسترسی ====================== */
const PERM_LIST=[["dashboard","داشبورد مدیریتی"],["import","تغذیهٔ فایل‌های اکسل"],["personnel","پرسنل (مشاهده و ویرایش)"],["slips","فیش حقوقی"],["loans","گزارش وام (نوبت‌دهی و سررسید)"],["loanform","ثبت وام و چاپ فرم‌ها"],["advance","مساعده"],["goods","درخواست کالا"],["services","درخواست خدمات (موسسات)"],["institutions","تعریف موسسات و نامه‌ها"],["emdad","وام امداد"],["changes","تغییرات ماهانهٔ کسورات (F10)"],["life","بیمه عمر"],["insurance","بیمه تکمیلی درمان"],["mehr","وام بانک مهر (Shift+F8)"],["cheque","صدور دسته چک"],["banks","تعریف بانک‌ها"],["statushistory","تاریخچهٔ تغییر وضعیت پرسنل (گزارش)"],["deceased","درگذشتگان (ثبت، بیمه عمر و وراث)"],["schools","مدارس و آموزشگاه‌ها (تغییر امضاء)"],["dcodes","تعریف کد کسر"],["inventory","انبارداری"],["reports","گزارش‌های مالی (مساعده، کالا، وام)"],["closing","بستن فایل حقوق"],["settings","اتصال و تنظیمات — همهٔ بخش‌ها"],["set_codes","تنظیمات: تعریف کدهای مهم"],["set_conn","تنظیمات: اتصال به سرور"],["set_slip","تنظیمات: سربرگ فیش و گزینه‌های فیش"],["set_forms","تنظیمات: فرم‌های چاپی و قالب متن‌ها"],["set_loan","تنظیمات: پارامترهای فرمول وام"],["set_round","تنظیمات: گرد کردن مبالغ"]];
const PAGE_PERM={dashboard:"dashboard",import:"import",personnel:"personnel",slips:"slips",loans:"loans",loanform:"loanform",vefagh:"loanform",advance:"advance",goods:"goods",services:"services",institutions:"institutions",emdad:"emdad",mehr:"mehr",cheque:"cheque",banks:"banks",changes:"changes",life:"life",insurance:"insurance",statushistory:"statushistory",deceased:"deceased",schools:"schools",dcodes:"dcodes",inventory:"inventory",reports:"reports",closing:"closing",settings:"settings",users:"@admin"};
app.user=null;
const authToken=()=>{try{return sessionStorage.getItem("psToken")||""}catch(e){return ""}};
const can=k=>{const u=app.user;if(!u)return false;if(u.isAdmin)return true;
  if(k==="settings")return (u.permissions||[]).some(p=>p==="settings"||p.startsWith("set_"));   // ورود به صفحهٔ «اتصال و تنظیمات» با هر یک از بخش‌ها
  return k==="@admin"?false:(u.permissions||[]).includes(k)};
// دسترسی به یک بخش از تنظیمات: «settings» همهٔ بخش‌ها را باز می‌کند
const canSet=k=>{const u=app.user;return !!u&&(u.isAdmin||(u.permissions||[]).includes("settings")||(u.permissions||[]).includes(k))};
function applySettingsPerms(){
  [["setConn","set_conn"],["setSlip","set_slip"],["setForms","set_forms"],["tplCard","set_forms"],["dzCard","set_forms"],["plCard","set_forms"],["sgCard","set_forms"],["setFin","set_forms"],["lpCard","set_loan"],["roundCard","set_round"],["kcCard","set_codes"],["sigImgCard","set_forms"],["insCard","set_forms"]].forEach(([id,k])=>{const el=$("#"+id);if(el)el.hidden=!canSet(k)});
  if(!app.user){const sc=$("#setConn");if(sc)sc.hidden=false}   // قبل از ورود (مرورگر تازه، بدون آدرس ذخیره‌شده) فقط کارت «اتصال به سرور» باید دیده شود
  const ic=$("#initCard");if(ic)ic.hidden=!(app.user&&app.user.isAdmin);   // فقط مدیر
  settingsTabs();
}
// تب‌بندی تنظیمات: هر کارت در یک گروه (data-sg)؛ تبی که همهٔ کارت‌هایش مخفی است (بدون دسترسی) نمایش داده نمی‌شود
let setTabCur="";
function settingsTabs(pick){
  const tabs=[...document.querySelectorAll("#setTabs button")],ok=t=>[...document.querySelectorAll('#setGrid [data-sg="'+t.dataset.stab+'"]')].some(c=>!c.hidden);
  tabs.forEach(t=>{t.style.display=ok(t)?"":"none"});
  const vis=tabs.filter(t=>t.style.display!=="none");
  if(pick)setTabCur=pick;if(!vis.some(t=>t.dataset.stab===setTabCur))setTabCur=vis[0]?vis[0].dataset.stab:"";
  tabs.forEach(t=>t.classList.toggle("on",t.dataset.stab===setTabCur));
  document.querySelectorAll("#setGrid>[data-sg]").forEach(c=>c.classList.toggle("sgHide",c.dataset.sg!==setTabCur));
}
$("#setTabs").addEventListener("click",e=>{const b=e.target.closest("[data-stab]");if(b){settingsTabs(b.dataset.stab);if(b.dataset.stab==="forms")sigInit()}});
