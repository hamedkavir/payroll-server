"use strict";
/* settings/backup.js — پشتیبان‌گیری و بازیابی
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("settings/backup");
/* ---------- پشتیبان‌گیری و بازیابی (فقط مدیر) ---------- */
const BK_KIND={manual:"دستی",auto:"خودکار","pre-restore":"قبل از بازیابی",uploaded:"بارگذاری‌شده"};
const bkHeaders=()=>Object.assign({},apiKey()?{"X-API-Key":apiKey()}:{},authToken()?{"X-Auth-Token":authToken()}:{});
const bkSize=n=>n>=1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
async function loadBackups(){
  const card=$("#backupCard");if(!card)return;
  if(!(app.user&&app.user.isAdmin)){card.hidden=true;return}
  card.hidden=false;
  try{
    const r=await api("GET","/api/backup");
    $("#bkInfo").textContent=`پوشهٔ ذخیره: ${r.dir} — پشتیبان خودکار: ${r.auto?`فعال (هر ${faId(r.everyHours)} ساعت، نگهداری ${faId(r.keep)} نسخه)`:"غیرفعال"}`;
    $("#bkRows").innerHTML=r.files.length?r.files.map(f=>`<tr><td dir="ltr" class="u-ta-left">${esc(f.name)}</td><td>${BK_KIND[f.kind]||f.kind}</td><td>${faId(bkSize(f.size))}</td><td>${faId(new Date(f.mtime).toLocaleString("fa-IR"))}</td>
      <td class="u-nowrap"><button class="btn" data-bk="dl" data-name="${esc(f.name)}">دانلود</button> <button class="btn btn-danger" data-bk="restore" data-name="${esc(f.name)}">بازیابی</button> <button class="btn btn-quiet" data-bk="del" data-name="${esc(f.name)}">حذف</button></td></tr>`).join(""):`<tr><td colspan="5" class="hint">هنوز پشتیبانی گرفته نشده است.</td></tr>`;
  }catch(e){$("#bkRows").innerHTML=`<tr><td colspan="5" class="hint u-c-red-ink">${esc(e.message)}</td></tr>`}
}
async function bkDownload(name){
  const res=await fetch(apiBase()+"/api/backup/download/"+enc(name),{headers:bkHeaders()});
  if(!res.ok){showAlert("دانلود ممکن نشد (کد "+res.status+").");return}
  const url=URL.createObjectURL(await res.blob()),a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function bkRestore(name){
  showConfirm(`بازیابی از «${name}»: همهٔ داده‌های فعلی (پرسنل، فیش‌ها، وام، مساعده، کالا، کاربران، تنظیمات) با محتوای این فایل جایگزین می‌شود. قبل از آن خودکار یک پشتیبان «قبل از بازیابی» گرفته می‌شود. ادامه می‌دهید؟`,async()=>{
    $("#bkMsg").textContent="در حال بازیابی... (برای دادهٔ زیاد چند دقیقه طول می‌کشد؛ صفحه را نبندید)";
    try{
      const r=await api("POST","/api/backup/restore/"+enc(name),{confirm:true});
      showAlert(`بازیابی انجام شد (${faId(Object.values(r.tables).reduce((s,x)=>s+x,0))} ردیف). صفحه دوباره بارگیری می‌شود.`);
      setTimeout(()=>location.reload(),1500);
    }catch(e){$("#bkMsg").textContent="";showAlert("بازیابی انجام نشد (داده‌ها بدون تغییر ماند): "+e.message)}
  });
}
function bkInit(){
  $("#bkCreate").addEventListener("click",async()=>{
    $("#bkMsg").textContent="در حال ساخت پشتیبان...";
    try{const r=await api("POST","/api/backup/create");$("#bkMsg").textContent="ساخته شد: "+r.file.name;await loadBackups()}
    catch(e){$("#bkMsg").textContent="";showAlert(e.message)}
  });
  $("#bkFile").addEventListener("change",async e=>{
    const f=e.target.files[0];e.target.value="";if(!f)return;
    $("#bkMsg").textContent="در حال بارگذاری فایل...";
    try{
      const res=await fetch(apiBase()+"/api/backup/upload",{method:"POST",headers:Object.assign({"Content-Type":"application/octet-stream"},bkHeaders()),body:f});
      let d=null;try{d=await res.json()}catch(_){}
      if(!res.ok)throw new Error((d&&d.message)||("خطای سرور (کد "+res.status+")"));
      $("#bkMsg").textContent="بارگذاری شد: "+d.file.name;await loadBackups();bkRestore(d.file.name);
    }catch(err){$("#bkMsg").textContent="";showAlert(err.message)}
  });
  $("#bkRows").addEventListener("click",e=>{
    const b=e.target.closest("[data-bk]");if(!b)return;const n=b.dataset.name;
    if(b.dataset.bk==="dl")bkDownload(n);
    else if(b.dataset.bk==="restore")bkRestore(n);
    else showConfirm(`فایل «${n}» حذف شود؟`,async()=>{try{await api("DELETE","/api/backup/"+enc(n));loadBackups()}catch(err){showAlert(err.message)}});
  });
}
function fillFsForm(){FS_FIELDS.forEach(([k])=>{const el=$("#fs-"+k);if(el)el.value=el.hasAttribute("data-money")?mnum(FS()[k]):FS()[k]});fillRdForm();fillKcForm();fillInsForm();fillLpForm();const sc=$("#optShowCodes");if(sc)sc.checked=FS().slipShowCodes!=0&&FS().slipShowCodes!=="0";const rs=$("#optRecentSlips");if(rs)rs.value=FS().recentSlips||12;const mc=$("#optMetaLine");if(mc)mc.checked=FS().slipMetaLine!=0&&FS().slipMetaLine!=="0"}
async function loadFs(){try{app.fs=await api("GET","/api/form-settings")}catch(e){app.fs={}}fillFsForm();if(typeof navRender==="function")navRender()}
async function saveFs(){
  const body={};FS_FIELDS.forEach(([k])=>body[k]=$("#fs-"+k).value);
  try{app.fs=await api("PUT","/api/form-settings",body);fillFsForm();showAlert("تنظیمات فرم‌ها ذخیره شد.")}catch(e){showAlert(e.message)}
}

