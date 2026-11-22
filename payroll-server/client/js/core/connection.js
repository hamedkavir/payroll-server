"use strict";
/* core/connection.js — اتصال به سرور، تنظیمات عمومی فیش
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("core/connection");
try{
  $("#apiBase").value=localStorage.getItem("psApiBase")||(/^https?:$/.test(location.protocol)?location.origin:"");
  $("#apiKeyInput").value=loadApiKey();   // sessionStorage (یا localStorage فقط با «به‌خاطر سپردن کلید») — core/api.js
}catch(e){}
syncRememberBoxes();
// برداشتن تیک ← کلید بلافاصله از localStorage پاک می‌شود؛ زدن تیک ← کلید فعلی به‌خاطر سپرده می‌شود
document.addEventListener("change",e=>{
  const t=e.target;if(!t||(t.id!=="apiKeyRemember"&&t.id!=="loginKeyRemember"))return;
  const k=t.id==="loginKeyRemember"?($("#loginKey").value.trim()||apiKey()):apiKey();
  storeApiKey(k,t.checked);
});

$("#perMonth").innerHTML=MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join("");
$("#newMonth").innerHTML=MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join("");

function setConn(on,text){
  $("#connDot").classList.toggle("on",on);
  $("#connText").textContent=text;
  document.body.classList.toggle("offline",!on);
  if(!on)showPage("settings");
  else{applyUser();showPage("dashboard")}
}

$("#btnConnect").addEventListener("click",async()=>{
  const base=apiBase();
  if(!base){showAlert("آدرس سرور را وارد کنید.");return}
  try{localStorage.setItem("psApiBase",base)}catch(e){}
  storeApiKey(apiKey(),$("#apiKeyRemember").checked);
  $("#connStatus").textContent="در حال اتصال...";
  try{
    await fetch(base+"/api/health").then(r=>{if(!r.ok)throw new Error("سرور در دسترس نیست")});   // اتصال برقرار نیست ← پنجرهٔ ورود با بخش تنظیمات اتصال باز می‌شود
    await ensureLogin();
    app.settings=await api("GET","/api/settings");if(!app.settings.unit||/^[?؟]+$/.test(app.settings.unit))app.settings.unit="ریال";
    fillSettingsForm();
    await loadFs();
    app.connected=true;
    setConn(true,"متصل");
    $("#connStatus").textContent="اتصال برقرار است.";
    await refreshPeriods();
    await refreshPersonnelList();
    $("#lqYear").value=curY();$("#lqMonth").value=curM()+1;
    await loadLqReport();
    await refreshDashboard();
    resetSync();      // نسخهٔ همگام‌سازی از صفر (payslip/periods.js)
    startSync();      // همگام‌سازی پس‌زمینه (payslip/periods.js)؛ در تب پنهان متوقف می‌شود
    preloadXLSX();    // کتابخانهٔ اکسل در زمان بیکاری مرورگر (core/xlsx-loader.js)
  }catch(err){
    app.connected=false;setConn(false,"متصل نیست");
    $("#connStatus").textContent="اتصال ناموفق: "+err.message;
    if(!authToken()||/در دسترس|Failed to fetch|NetworkError|Load failed/i.test(String(err.message)))showLogin({conn:true,err:"اتصال به سرور برقرار نشد: "+err.message});
  }
});

function fillSettingsForm(){
  $("#unit").value=app.settings.unit;
  $("#optEmployer").checked=app.settings.showEmployer;
  $("#optZero").checked=app.settings.showZero;
}
let _settingsTimer=null;
function saveSettingsDebounced(){
  app.settings.unit=$("#unit").value;
  app.settings.showEmployer=$("#optEmployer").checked;
  app.settings.showZero=$("#optZero").checked;
  clearTimeout(_settingsTimer);
  _settingsTimer=setTimeout(async()=>{
    try{await api("PUT","/api/settings",app.settings)}catch(err){showAlert("ذخیرهٔ تنظیمات ناموفق بود: "+err.message)}
    render();
  },500);
}
["unit"].forEach(id=>$("#"+id).addEventListener("input",saveSettingsDebounced));
$("#unit").addEventListener("change",saveSettingsDebounced);
$("#optEmployer").addEventListener("change",saveSettingsDebounced);
$("#optZero").addEventListener("change",saveSettingsDebounced);
$("#optShowCodes").addEventListener("change",async()=>{
  try{app.fs=await api("PUT","/api/form-settings",{slipShowCodes:$("#optShowCodes").checked?1:0});render()}
  catch(err){showAlert("ذخیرهٔ تنظیم ناموفق بود: "+err.message);fillFsForm()}
});
$("#optRecentSlips").addEventListener("change",async()=>{
  const n=Math.max(1,Math.min(120,parseInt($("#optRecentSlips").value,10)||12));$("#optRecentSlips").value=n;
  try{app.fs=await api("PUT","/api/form-settings",{recentSlips:n});if(app.pfCode)loadProfile(app.pfCode,true,true)}catch(err){showAlert(err.message)}
});
$("#optMetaLine").addEventListener("change",async()=>{
  try{app.fs=await api("PUT","/api/form-settings",{slipMetaLine:$("#optMetaLine").checked?1:0});render()}
  catch(err){showAlert("ذخیرهٔ تنظیم ناموفق بود: "+err.message);fillFsForm()}
});

