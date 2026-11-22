"use strict";
/* settings/admin-tools.js — راه‌اندازی اولیه، ویرایشگر ظاهر صفحه‌ها، امضاکنندگان
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("settings/admin-tools");
/* ---------- راه‌اندازی اولیه (پاک‌سازی کامل؛ فقط مدیر) ---------- */
function askPassword(){
  return new Promise(res=>{
    // نسخهٔ ۱۲۰: ثبت در dlgOpen (core/dialogs.js) ← role/aria-modal، Focus اولیه روی رمز، نگه‌داشتن Tab داخل پنجره،
    // Escape از هر جای پنجره (نه فقط داخل فیلد) و بازگشت Focus به دکمهٔ «راه‌اندازی اولیه»
    const d=$("#pwDlg"),i=$("#pwInput");i.value="";d.hidden=false;
    let closed=false,release=null;
    const done=v=>{if(closed)return;closed=true;d.hidden=true;$("#pwYes").onclick=null;$("#pwNo").onclick=null;i.onkeydown=null;i.value="";if(release)release();res(v)};
    release=dlgOpen(d,{role:"alertdialog",labelledBy:"pwDlgT",initial:i,onEscape:()=>done(null)});
    $("#pwYes").onclick=()=>done(i.value);$("#pwNo").onclick=()=>done(null);i.onkeydown=e=>{if(e.key==="Enter")done(i.value);if(e.key==="Escape")done(null)};
  });
}
(function(){
  const b=$("#btnInit");if(!b)return;
  b.addEventListener("click",async()=>{
    if(!app.user||!app.user.isAdmin){showAlert("فقط مدیر می‌تواند راه‌اندازی اولیه را انجام دهد.");return}
    if(!await confirmAsync("هشدار ۱ از ۲:\nبا راه‌اندازی اولیه «همهٔ اطلاعات برنامه» (دوره‌ها، فیش‌ها، پرسنل، وام‌ها، مساعده‌ها، انبار و …) پاک می‌شود و برگشت‌پذیر نیست مگر با بازیابی پشتیبان. ادامه می‌دهید؟"))return;
    if(!await confirmAsync("هشدار ۲ از ۲ (آخرین فرصت):\nآیا مطمئنید که می‌خواهید کل اطلاعات پاک شود و برنامه برای نصب جدید آماده شود؟"))return;
    const pw=await askPassword();if(pw==null||pw==="")return;
    try{
      const r=await api("POST","/api/admin/factory-reset",{confirm:true,password:pw,keepSettings:!$("#initSettings").checked});
      $("#alertOk").addEventListener("click",()=>location.reload(),{once:true});
      showAlert(`راه‌اندازی اولیه انجام شد (${faId(r.cleared.length)} جدول پاک شد).\nپشتیبان پیش از پاک‌سازی: ${r.backup}\nبرنامه دوباره بارگذاری می‌شود.`);
    }catch(e){showAlert(e.message)}
  });
})();
/* ---------- ویرایشگر ظاهر صفحه‌ها (فعلاً: فرم پرسنلی) ---------- */
let pl=null;
function plLoad(){
  const L=PL(),def=PF_SECS.map(x=>x[0]);let order=def;const hide=new Set();
  if(L&&L.sections){const o=(L.sections.order||[]).filter(k=>def.includes(k));order=o.concat(def.filter(k=>!o.includes(k)));(L.sections.hide||[]).forEach(k=>hide.add(k))}
  const fl=sc=>pfFieldDefs(sc).map(x=>({k:x.def.k,label:x.def.label,custom:!!x.def.custom,on:!x.hidden,wide:x.wide}));
  pl={secs:order.map(id=>({id,title:PF_SECS.find(x=>x[0]===id)[1],on:!hide.has(id)})),fields:{ident:fl("ident"),job:fl("job"),bank:fl("bank")}};
}
const PL_FSECS=[["ident","مشخصات هویتی"],["job","اطلاعات استخدامی"],["bank","تماس و حساب بانکی"]];
function plDraw(){
  const box=$("#plBody");if(!box||!pl)return;
  box.innerHTML=pl.secs.map((sc,i)=>`<div class="pl-row u-bg-line-2 u-r8 u-p-5-8 u-mt6"><label class="u-f1 u-fw700"><input type="checkbox" data-pl="sec-on" data-i="${i}"${sc.on?" checked":""}> ${esc(sc.title)}</label><button class="btn sm" data-pl="sec-up" data-i="${i}" title="بالا" aria-label="بالا">${ico("up")}</button><button class="btn sm" data-pl="sec-dn" data-i="${i}" title="پایین" aria-label="پایین">${ico("chev-d")}</button></div>`
    +(pl.fields[sc.id]?`<div class="pl-sub">${pl.fields[sc.id].map((f,j)=>`<div class="pl-row"><label class="u-f1"><input type="checkbox" data-pl="f-on" data-s="${sc.id}" data-i="${j}"${f.on?" checked":""}> ${esc(f.label)}${f.custom?' <span class="badge b-blue">دلخواه</span>':""}</label><label><input type="checkbox" data-pl="f-wide" data-s="${sc.id}" data-i="${j}"${f.wide?" checked":""}> دو ستونی</label><select data-pl="f-sec" data-s="${sc.id}" data-i="${j}">${PL_FSECS.map(([k,t])=>`<option value="${k}"${k===sc.id?" selected":""}>${esc(t)}</option>`).join("")}</select><button class="btn sm" data-pl="f-up" data-s="${sc.id}" data-i="${j}" title="بالا" aria-label="بالا">${ico("up")}</button><button class="btn sm" data-pl="f-dn" data-s="${sc.id}" data-i="${j}" title="پایین" aria-label="پایین">${ico("chev-d")}</button>${f.custom?`<button class="btn sm btn-del" data-pl="f-del" data-s="${sc.id}" data-i="${j}">حذف</button>`:""}</div>`).join("")}</div>`:"")).join("")
    +`<div class="dz-sec"><h3>فیلد دلخواه جدید (متنی)</h3><div class="wk-acts"><input id="plNewLabel" placeholder="عنوان فیلد، مثلاً «نام همسر»" maxlength="60" class="u-maxw260"><select id="plNewSec">${PL_FSECS.map(([k,t])=>`<option value="${k}">${esc(t)}</option>`).join("")}</select><button class="btn" data-pl="add">+ افزودن فیلد</button></div></div>
    <div class="wk-acts u-mt12"><button class="btn btn-main" data-pl="save">ذخیرهٔ ظاهر صفحه</button><button class="btn btn-blue" data-pl="savedef" title="چیدمان فعلی به‌عنوان پیش‌فرض شما ذخیره می‌شود">ذخیره به‌عنوان پیش‌فرض</button><button class="btn" data-pl="usedef" title="چیدمان ذخیره‌شده به‌عنوان پیش‌فرض را اعمال می‌کند">اعمال پیش‌فرض ذخیره‌شده</button><span class="sp"></span><button class="btn btn-del" data-pl="reset">حالت اولیهٔ برنامه</button></div>`;
}
function renderPageEditor(){if(!$("#plCard"))return;plLoad();plDraw()}
(function(){
  const C=$("#plCard");if(!C)return;
  const mv=(a,i,d)=>{const j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]]};
  C.addEventListener("change",e=>{
    const t=e.target,k=t.dataset.pl;if(!k)return;const i=+t.dataset.i,sc=t.dataset.s;
    if(k==="sec-on")pl.secs[i].on=t.checked;
    else if(k==="f-on")pl.fields[sc][i].on=t.checked;
    else if(k==="f-wide")pl.fields[sc][i].wide=t.checked;
    else if(k==="f-sec"&&t.value!==sc){const f=pl.fields[sc].splice(i,1)[0];pl.fields[t.value].push(f);plDraw()}
  });
  C.addEventListener("click",async e=>{
    const b=e.target.closest("[data-pl]");if(!b)return;const k=b.dataset.pl,i=+b.dataset.i,sc=b.dataset.s;
    if(k==="sec-up"){mv(pl.secs,i,-1);plDraw()}else if(k==="sec-dn"){mv(pl.secs,i,1);plDraw()}
    else if(k==="f-up"){mv(pl.fields[sc],i,-1);plDraw()}else if(k==="f-dn"){mv(pl.fields[sc],i,1);plDraw()}
    else if(k==="f-del"){pl.fields[sc].splice(i,1);plDraw()}
    else if(k==="add"){
      const label=$("#plNewLabel").value.trim();if(!label){showAlert("عنوان فیلد را بنویسید.");return}
      pl.fields[$("#plNewSec").value].push({k:"cx"+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36),label,custom:true,on:true,wide:false});plDraw();
    }
    else if(k==="savedef"){
      const L=plBuild();
      if(await dzPut({pageLayoutSaved:{...(FS().pageLayoutSaved||{}),personnel:L},pageLayout:{...(FS().pageLayout||{}),personnel:L}},"ظاهر فعلی به‌عنوان پیش‌فرض ذخیره شد.")){plLoad();plDraw();if(app.pfData)renderProfile(app.pfData)}
    }
    else if(k==="usedef"){
      const D=(FS().pageLayoutSaved||{}).personnel;
      if(!D){showAlert("هنوز پیش‌فرضی ذخیره نکرده‌اید. ابتدا ظاهر را تنظیم و «ذخیره به‌عنوان پیش‌فرض» را بزنید.");return}
      if(await dzPut({pageLayout:{...(FS().pageLayout||{}),personnel:D}},"پیش‌فرض ذخیره‌شده اعمال شد.")){plLoad();plDraw();if(app.pfData)renderProfile(app.pfData)}
    }
    else if(k==="save"){
      const L=plBuild();
      if(await dzPut({pageLayout:{...(FS().pageLayout||{}),personnel:L}},"ظاهر صفحهٔ پرسنل ذخیره شد.")){plLoad();plDraw();if(app.pfData)renderProfile(app.pfData)}
    }
    else if(k==="reset"){
      showConfirm("ترتیب و نمایش بخش‌ها و فیلدهای صفحهٔ پرسنل به حالت پیش‌فرض برگردد؟ (فیلدهای دلخواه از نمایش برداشته می‌شوند؛ مقدارهای واردشده در دیتابیس می‌ماند)",async()=>{
        const o={...(FS().pageLayout||{})};delete o.personnel;
        if(await dzPut({pageLayout:o},"به حالت پیش‌فرض برگشت.")){plLoad();plDraw();if(app.pfData)renderProfile(app.pfData)}
      });
    }
  });
})();
/* ====================== امضاکنندگان و طراح فرم‌های چاپی ====================== */
// فهرست امضاکنندگان (تنظیمات ← فرم‌های چاپی). «mgr» همان مدیر سربرگ است و از managerTitle / managerName می‌آید.
const SG_DEFAULT=[{id:"mgr",title:"",name:""},{id:"coopHead",title:"کارشناس مسئول تعاون",name:""},{id:"acctHead",title:"کارشناس مسئول حسابداری",name:""},{id:"coop",title:"کارشناس تعاون",name:"حامد علیخانی"},{id:"acct",title:"کارشناس حسابداری",name:""}];
function sgList(){const f=FS();let l=Array.isArray(f.signatories)&&f.signatories.length?f.signatories.slice():SG_DEFAULT.slice();if(!l.some(g=>g.id==="mgr"))l.unshift({id:"mgr"});return l.map(g=>g.id==="mgr"?{id:"mgr",title:f.managerTitle||"مدیر آموزش و پرورش",name:f.managerName||""}:g)}
const sgFind=id=>sgList().find(g=>g.id===id);
const sgCell=g=>`<div class="d-sig">${esc(g.title)}${g.name?`<br><b>${esc(g.name)}</b>`:""}</div>`;
// منبع دادهٔ فیلدهای اضافه: فرد (همهٔ فرم‌ها) یا آموزشگاه/ردیف تغییر امضاء (نامهٔ تغییر امضاء)
const XF_PERSON=[["code","کد پرسنلی"],["nationalId","کد ملی"],["firstName","نام"],["lastName","نام خانوادگی"],["fatherName","نام پدر"],["idNumber","شمارهٔ شناسنامه"],["birthDate","تاریخ تولد"],["birthPlace","محل تولد"],["mobile","تلفن همراه"],["workplace","محل خدمت"],["jobTitle","پست / عنوان شغلی"],["employmentType","نوع استخدام"],["status","وضعیت"],["bankName","نام بانک"],["bankAccount","شمارهٔ حساب"],["shaba","شمارهٔ شبا"],["mehrAccount","شمارهٔ حساب بانک مهر"]];
const XF_SCHOOL=[["code","کد آموزشگاه"],["name","نام آموزشگاه"],["area","موقعیت"],["gender","جنسیت"],["level","دوره تحصیلی"],["schoolType","نوع آموزشگاه"],["address","آدرس"],["phone","تلفن"],["postalCode","کدپستی"],["shift","شیفت"],["managerCode","کد پرسنلی مدیر"],["managerMobile","همراه مدیر"],["account","شمارهٔ حساب"],["regNo","شمارهٔ ثبت"],["letterNo","شمارهٔ نامه"],["reqDate","تاریخ درخواست"],["bankName","بانک"],["branch","شعبه"]];
const xfSources=F=>F==="sigchange"?XF_SCHOOL:XF_PERSON;
function xfVal(ctx,src,text){
  if(!src)return esc(text||"");
  let v=ctx?ctx[src]:"";if(v==null)v="";
  if(src==="birthDate")v=fmtDate8(String(v));
  return faId(esc(v));
}
// سطرهای اضافه (متنی) قبل از امضاها
function dExtras(F){
  if(app.probe)return "";
  return ((FS().formExtras||{})[F]||[]).map(x=>`<div class="d-note" style="list-style:none;padding:4px 10px;margin-top:6px">${x.label?`<b>${esc(x.label)}:</b> `:""}${esc(x.text).replace(/\n/g,"<br>")}</div>`).join("");
}
// فیلدهای اضافهٔ تعریف‌شده در طراح فرم (مثلاً «کد ملی» برای مساعده)؛ با «چیدمان آزاد» به هر جای فرم می‌روند
function dXFields(F){
  if(app.probe)return "";
  const a=(FS().formFields||{})[F]||[];if(!a.length)return "";
  return `<div class="d-fg c3" style="margin-top:6px">${a.map(x=>`<div class="d-fl"><small>${esc(x.label)}</small><b>${xfVal(app.docCtx,x.src,x.text)||"&nbsp;"}</b></div>`).join("")}</div>`;
}
// بلوک امضاها: defs = خانه‌های پیش‌فرض همان فرم (HTML)؛ اگر در طراح فرم چیدمان دیگری ذخیره شده باشد، همان اعمال می‌شود
function dSigs(F,defs,style=""){
  app.sigSeen=app.sigSeen||{};
  app.sigSeen[F]=defs.map(h=>h.replace(/<br\s*\/?>/g," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());
  const sel=app.probe?null:(FS().formSigs||{})[F];
  const cells=Array.isArray(sel)?sel.map(k=>k.startsWith("def:")?(defs[+k.slice(4)]||""):(sgFind(k.slice(4))?sgCell(sgFind(k.slice(4))):"")).filter(Boolean):defs;
  const n=cells.length;
  return dXFields(F)+dExtras(F)+dSigImg(F)+(n?`<div class="d-sigs${n===3?"":" c"+Math.min(n,6)}"${style?` style="${style}"`:""}>${cells.join("")}</div>`:"");
}
