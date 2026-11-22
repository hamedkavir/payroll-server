"use strict";
/* auth/users-admin.js — مدیریت کاربران
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("auth/users-admin");
/* ---- صفحهٔ مدیریت کاربران (فقط مدیر) ---- */
async function renderUsers(){
  const root=$("#wk-users");
  root.innerHTML=`<div class="toolbar"><div class="u-f1"><b>مدیریت کاربران سیستم</b><div class="hint">هر کاربر با نام کاربری و رمز خودش وارد می‌شود و فقط به بخش‌هایی که شما تیک می‌زنید دسترسی دارد.</div></div><button class="btn btn-main" data-uact="new">کاربر جدید</button></div><div class="card"><div id="us-body"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
  try{
    const r=await api("GET","/api/users");app.usersList=r.items;
    const lab=Object.fromEntries(PERM_LIST);
    $("#us-body").innerHTML=`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>نام کاربری</th><th>نام و نام خانوادگی</th><th>نقش</th><th>وضعیت</th><th>دسترسی‌ها</th><th></th></tr></thead><tbody>
    ${r.items.map(u=>`<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.fullName)}</td><td>${u.isAdmin?'<span class="badge b-blue">مدیر</span>':"کاربر"}</td><td>${u.active?'<span class="badge b-green">فعال</span>':'<span class="badge b-red">غیرفعال</span>'}</td>
      <td class="u-ws-normal u-minw220">${u.isAdmin?"همهٔ بخش‌ها":(u.permissions.length?u.permissions.map(k=>esc(lab[k]||k)).join("، "):'<span class="hint">هیچ</span>')}</td>
      <td><div class="wk-tbl-act"><button class="btn" data-uact="edit" data-id="${u.id}">ویرایش</button>${app.user&&u.id===app.user.id?"":`<button class="btn btn-del" data-uact="del" data-id="${u.id}">حذف</button>`}</div></td></tr>`).join("")}</tbody></table></div>`;
  }catch(e){$("#us-body").innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`}
}
function userDlg(u){
  const perms=u?u.permissions:[];
  const w=openDlg({title:u?"ویرایش کاربر «"+u.username+"»":"کاربر جدید",wide:true,
    html:`<div class="fgrid">${dlgField("نام کاربری","username",u?u.username:"",u?"disabled":'class="ltr"')}${dlgField("نام و نام خانوادگی","fullName",u?u.fullName:"")}${dlgField(u?"رمز جدید (خالی = بدون تغییر)":"رمز عبور (حداقل ۶ نویسه)","password","","type=password autocomplete=new-password")}</div>
    <div class="radios"><label><input type="checkbox" name="isAdmin"${u&&u.isAdmin?" checked":""}> مدیر سیستم (دسترسی کامل + مدیریت کاربران)</label><label><input type="checkbox" name="active"${!u||u.active?" checked":""}> فعال</label></div>
    <div class="u-m-14-0-4 u-flex u-gap8 u-ai-center"><b>دسترسی به بخش‌ها</b><button type="button" class="btn u-p-2-10 u-fs12" data-permall>همه</button><button type="button" class="btn u-p-2-10 u-fs12" data-permnone>هیچ‌کدام</button></div>
    <div class="radios u-mt4">${PERM_LIST.map(([k,t])=>`<label class="u-minw230"><input type="checkbox" name="perm" value="${k}"${perms.includes(k)?" checked":""}>${t}</label>`).join("")}</div>
    <p class="hint">اگر کاربر جدید است، در اولین ورود باید رمز خودش را عوض کند.</p>`,
    onOk:async d=>{
      const body={fullName:dv(d,"fullName"),isAdmin:d.querySelector('[name="isAdmin"]').checked,active:d.querySelector('[name="active"]').checked,
        permissions:[...d.querySelectorAll('input[name="perm"]:checked')].map(c=>c.value)};
      const pw=dv(d,"password");
      if(u){if(pw)body.password=pw;await api("PUT","/api/users/"+u.id,body)}
      else{body.username=dv(d,"username");body.password=pw;await api("POST","/api/users",body)}
      await renderUsers();
    }});
  w.addEventListener("click",e=>{
    if(e.target.closest("[data-permall]"))w.querySelectorAll('input[name="perm"]').forEach(c=>c.checked=true);
    if(e.target.closest("[data-permnone]"))w.querySelectorAll('input[name="perm"]').forEach(c=>c.checked=false);
  });
}
function userAction(e){
  const b=e.target.closest("[data-uact]");if(!b)return;
  const u=(app.usersList||[]).find(x=>x.id===+b.dataset.id);
  if(b.dataset.uact==="new")return userDlg(null);
  if(b.dataset.uact==="edit"&&u)return userDlg(u);
  if(b.dataset.uact==="del"&&u)showConfirm(`کاربر «${u.username}» حذف شود؟`,async()=>{try{await api("DELETE","/api/users/"+u.id);await renderUsers()}catch(err){showAlert(err.message)}});
}

