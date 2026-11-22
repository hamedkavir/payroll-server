"use strict";
/* core/state.js — وضعیت سراسری برنامه (app)
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("core/state");
let app={
  connected:false,
  settings:{companyName:"",companySub:"",unit:"ریال",showEmployer:true,showZero:false},
  periods:[],currentPeriodId:null,periodDetail:null,
  people:[],curSel:null,
  pollTimer:null,busy:false
};

