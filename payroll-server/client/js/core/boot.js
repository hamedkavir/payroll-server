"use strict";
/* core/boot.js — نخستین اسکریپت برنامه (نسخهٔ ۱۱۱).
   هر ماژول با psModule("نام") خودش را ثبت می‌کند؛ اگر به اشتباه دوبار بارگذاری شود، همان ابتدای فایل خطا می‌دهد
   و بقیهٔ آن اجرا نمی‌شود (جلوی ثبت دوبارهٔ رویدادها و تعریف دوبارهٔ توابع را می‌گیرد). */
(function(){
  const loaded=new Set();
  function psModule(name){
    if(loaded.has(name))throw new Error("ماژول «"+name+"» دوبار بارگذاری شده است؛ تگ <script> تکراری را حذف کنید.");
    loaded.add(name);
  }
  psModule.loaded=()=>[...loaded];
  window.psModule=psModule;
  window.PS_VERSION="111";
})();
