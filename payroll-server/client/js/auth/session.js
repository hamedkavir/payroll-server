"use strict";
/* auth/session.js — ورود، خروج، تغییر رمز، نوار موبایل
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("auth/session");
// ---- موبایل: باز/بسته‌شدن کشوی منو و عنوان صفحه در نوار بالا
(function(){
  const close=()=>{document.body.classList.remove("menu-open");$("#mMenu").setAttribute("aria-expanded","false")};
  $("#mMenu").addEventListener("click",()=>{const o=document.body.classList.toggle("menu-open");$("#mMenu").setAttribute("aria-expanded",String(o))});
  $("#mScrim").addEventListener("click",close);
  $(".nav").addEventListener("click",e=>{if(e.target.closest("button[data-page]"))close()});
  // نسخهٔ ۱۲۰: اگر Focus داخل کشوی منو بود، با Escape به دکمهٔ منو برمی‌گردد (در کشوی بسته و بیرون از صفحه نمی‌ماند)
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.body.classList.contains("menu-open")){const a=document.activeElement,inMenu=!!(a&&a.closest&&a.closest(".side"));close();if(inMenu)$("#mMenu").focus()}});
  window.addEventListener("resize",()=>{if(window.innerWidth>900)close()});
  // عنوان صفحهٔ جاری (بدون کلید میانبر) در نوار موبایل، سربرگ و عنوان تب مرورگر
  const label=b=>[...b.childNodes].filter(n=>!(n.classList&&n.classList.contains("kbd"))).map(n=>n.textContent).join("").trim();
  // نام برنامه فقط یک جا (برند سایدبار) تعریف شده؛ عنوان تب = «عنوان صفحهٔ فعال — نام برنامه»
  const brandName=()=>{const b=document.querySelector(".brand b");return b&&b.textContent.trim()||"سامانهٔ پرسنلی و وام"};
  const sync=()=>{const b=document.querySelector(".nav button.on");if(!b)return;const t=label(b);$("#mTitle").textContent=t;const h=$("#pageTitle");if(h)h.textContent=t;document.title=t+" — "+brandName()};
  new MutationObserver(sync).observe($(".nav"),{attributes:true,attributeFilter:["class"],subtree:true,characterData:true,childList:true});sync();
  const dot=document.querySelector(".conn .dot");
  if(dot)new MutationObserver(()=>$("#mDot").classList.toggle("on",dot.classList.contains("on"))).observe(dot,{attributes:true,attributeFilter:["class"]});
})();
function applyUser(){
  const u=app.user;if(!u)return;
  loadSigImg();
  navApplyOrder();
  document.querySelectorAll(".nav button").forEach(b=>{const pg=b.dataset.page;b.hidden=!(pg==="settings"?(can("settings")||!app.connected):can(PAGE_PERM[pg]))});
  $("#ubName").textContent=u.fullName||u.username;
  $("#ubRole").textContent=u.isAdmin?"مدیر سیستم":"کاربر";
  $("#userBox").hidden=false;
}
// پنجرهٔ ورود: آدرس سرور و کلید دسترسی فقط وقتی نشان داده می‌شود که اتصال برقرار نباشد، کلید رد شود یا آدرس هنوز ذخیره نشده باشد
// نسخهٔ ۱۲۰: پنجرهٔ ورود هم با dlgOpen ثبت می‌شود (role/aria-modal/عنوان، Tab داخل پنجره، بازگشت Focus پس از ورود)؛
// Escape عمداً آن را نمی‌بندد چون ورود الزامی است.
let _loginRelease=null;
function showLogin(o){
  o=o||{};const w=$("#loginWrap"),cn=$("#loginConn");
  if(w.hidden){w.hidden=false;$("#loginErr").textContent="";cn.hidden=!(o.conn||!apiBase());$("#loginBase").value=apiBase();$("#loginKey").value=apiKey();
    if(_loginRelease)_loginRelease();
    _loginRelease=dlgOpen(w,{labelledBy:"loginTitle",initial:$("#loginUser")});
    setTimeout(()=>{if(!w.hidden&&!w.contains(document.activeElement))$("#loginUser").focus()},0)}
  else if(o.conn)cn.hidden=false;
  if(o.err)$("#loginErr").textContent=o.err;
}
$("#loginConnToggle").addEventListener("click",e=>{e.preventDefault();const cn=$("#loginConn");cn.hidden=!cn.hidden});
function pwDlg(forced){
  return new Promise(resolve=>{
    openDlg({title:forced?"تغییر رمز عبور (الزامی)":"تغییر رمز عبور",noCancel:forced,
      html:(forced?`<p class="hint">رمز شما توسط مدیر تعیین شده است؛ برای ادامه رمز جدید انتخاب کنید.</p>`:"")+dlgField("رمز فعلی","old","","type=password autocomplete=current-password")+dlgField("رمز جدید (حداقل ۶ نویسه)","n1","","type=password autocomplete=new-password")+dlgField("تکرار رمز جدید","n2","","type=password autocomplete=new-password"),
      onOk:async d=>{
        if(dv(d,"n1")!==dv(d,"n2"))throw new Error("تکرار رمز جدید یکسان نیست.");
        await api("PUT","/api/auth/password",{oldPassword:dv(d,"old"),newPassword:dv(d,"n1")});
        if(app.user)app.user.mustChange=false;resolve(true);if(!forced)showAlert("رمز عبور تغییر کرد.");
      }});
  });
}
async function doLogin(){
  try{
    if(!$("#loginConn").hidden){const b=$("#loginBase").value.trim();if(b)$("#apiBase").value=b;$("#apiKeyInput").value=$("#loginKey").value.trim()}   // فقط وقتی بخش اتصال باز است
    const r=await api("POST","/api/auth/login",{username:$("#loginUser").value.trim(),password:$("#loginPass").value});
    try{sessionStorage.setItem("psToken",r.token);localStorage.setItem("psApiBase",apiBase())}catch(e){}   // دفعهٔ بعد آدرس خودکار پر می‌شود
    storeApiKey(apiKey(),$("#loginConn").hidden?undefined:$("#loginKeyRemember").checked);   // کلید: sessionStorage؛ localStorage فقط با «به‌خاطر سپردن» (core/api.js)
    app.user=r.user;PHOTO_CACHE.clear();
    $("#loginPass").value="";$("#loginWrap").hidden=true;
    if(_loginRelease){const rel=_loginRelease;_loginRelease=null;rel()}
    if(r.mustChange)await pwDlg(true);
    const cb=app.loginResolve;app.loginResolve=null;
    if(cb)cb();
    else if(app.connected){applyUser();showPage(app.page)}   // نشست وسط کار منقضی شده بود
    else $("#btnConnect").click();                           // ورود قبل از برقراری اتصال (آدرس/کلید از همین پنجره)
  }catch(e){
    const m=String(e.message||"");$("#loginErr").textContent=m;
    if(/کلید دسترسی|Failed to fetch|NetworkError|Load failed|سرور/i.test(m)){const cn=$("#loginConn");cn.hidden=false;$("#loginBase").value=apiBase();$("#loginKey").value=apiKey()}
  }
}
async function ensureLogin(){
  if(authToken()){try{app.user=await api("GET","/api/auth/me");if(app.user&&app.user.mustChange)await pwDlg(true);return}catch(e){try{sessionStorage.removeItem("psToken")}catch(_){}}}
  await new Promise(res=>{app.loginResolve=res;showLogin()});
}
async function doLogout(){
  try{await api("POST","/api/auth/logout",{})}catch(e){}
  try{sessionStorage.removeItem("psToken")}catch(e){}
  location.reload();
}

