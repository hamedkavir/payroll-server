"use strict";
/* personnel/personnel.js — کارگزینی پرسنل و به‌روزرسانی از اکسل
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("personnel/personnel");
/* ---------- کارگزینی پرسنل (مستقل از دورهٔ حقوقی) ---------- */
app.personnelPage=1;
app.personnelTotal=0;
// پاک‌سازی یک ردیف فایل کارگزینی: فاصله‌های اضافه، «ي/ك» عربی، موبایل بدون صفر اول، حساب مساعدهٔ ۱۲ رقمی (صفر اولِ افتاده)، وضعیت «فوتی»
// کد ملی ۱۰ رقمی: ۸ رقمی ← دو صفر، ۹ رقمی ← یک صفر
function padNidC(v){const t=toEnDigits(String(v==null?"":v)).trim();return /^\d{8,9}$/.test(t)?t.padStart(10,"0"):t}
function cleanKargozini(r,meta,NUM,cl){
  const rec={};
  const ct=x=>String(x==null?"":x).replace(/\u064A/g,"ی").replace(/\u0643/g,"ک").replace(/\s+/g," ").trim();
  for(const k in meta){const raw=txt(r[meta[k]]);rec[k]=NUM.has(k)?toEnDigits(String(raw)).trim():ct(raw)}
  rec.code=rec.code||"";
  if(rec.mobile!==undefined){const d=rec.mobile.replace(/\D/g,"");const was=rec.mobile;rec.mobile=d.length===10&&d[0]==="9"?"0"+d:(d.length===11&&d[0]==="0"?d:"");if(rec.mobile!==was)cl.mobile++}
  if(rec.advanceAccount){const d=rec.advanceAccount.replace(/\D/g,"");if(d.length===12){rec.advanceAccount="0"+d;cl.advancePad++}else rec.advanceAccount=d}
  if(rec.bankAccount)rec.bankAccount=rec.bankAccount.replace(/\D/g,"");
  if(rec.status!==undefined){
    const s=rec.status;
    rec.status=/وظیفه/.test(s)?"وظیفه بگیر":/بازنشسته/.test(s)?"بازنشسته":/شاغل/.test(s)?"شاغل":/قطع/.test(s)?"قطع رابطه":/فوت/.test(s)?(cl.dead++,"قطع رابطه"):s;
  }
  return rec;
}
async function importPersonnelHandler(f){
  logLine("شروع پردازش فایل: "+f.name);
  if(!await checkFilePeriod([f],"کارگزینی"))return;
  app.busy=true;
  try{
    const rows=await readWorkbookRows(f);
    const hi=personnelHeaderRowIndex(rows);
    if(hi<0)throw new Error("ستون «شماره پرسنلی» یا نام پیدا نشد. ردیف نخست فایل باید عنوان ستون‌ها باشد.");
    const meta=analyzePersonnel(rows[hi]);
    const data=rows.slice(hi+1).filter(r=>r.some(c=>txt(c)!==""));
    if(!data.length)throw new Error("هیچ ردیف داده‌ای پیدا نشد.");
    const KG_NUM=new Set(["code","nationalId","ledger","idNumber","insuranceCode","workplaceCode","mobile","bankAccount","shaba","advanceAccount","birthDate","coveredChildren","govtServiceYears","jobRank","jobGroup"]);
    const cl={mobile:0,advancePad:0,dead:0};
    const people=data.map(r=>{
      const rec=cleanKargozini(r,meta,KG_NUM,cl);
      return rec;
    }).filter(p=>p.code);
    // فایل‌های حجیم کارگزینی را به‌صورت دسته‌های ۵۰۰تایی می‌فرستیم تا یک درخواست غول‌پیکر نشود
    const CH=500;
    let inserted=0,updated=0,shabaSet=0,shabaInvalid=0;const shabaBad=[],kgCh=[],kgNew=[];
    for(let i=0;i<people.length;i+=CH){
      const chunk=people.slice(i,i+CH);
      const r=await api("POST","/api/personnel/import",{mode:"merge",people:chunk});
      inserted+=r.inserted;updated+=r.updated;shabaSet+=r.shabaSet||0;shabaInvalid+=r.shabaInvalid||0;(r.shabaBad||[]).forEach(x=>{if(shabaBad.length<15)shabaBad.push(x)});
      (r.changes||[]).forEach(x=>kgCh.push(x));(r.createdList||[]).forEach(x=>kgNew.push(x));
    }
    try{await exportUploadReport("kargozini",f.name,{kg:{changes:kgCh,createdList:kgNew},count:people.length})}catch(ex){logLine("ساخت گزارش اکسل ممکن نشد: "+ex.message)}
    const clNote=(cl.advancePad||cl.dead||cl.mobile?`<br>اصلاح خودکار: ${cl.mobile?fa(cl.mobile)+" موبایل (صفر اول/نامعتبر)":""}${cl.advancePad?(cl.mobile?"، ":"")+fa(cl.advancePad)+" حساب مساعدهٔ ۱۲ رقمی (صفر اول اضافه شد)":""}${cl.dead?((cl.mobile||cl.advancePad)?"، ":"")+fa(cl.dead)+" «فوتی» ← قطع رابطه":""}`:"");
    const shNote=clNote+(meta.shaba!==undefined?`<br>شمارهٔ شبا: ${fa(shabaSet)} مورد ذخیره شد (۱۳ رقم آخر = شمارهٔ حساب)${shabaInvalid?`، <b>${fa(shabaInvalid)}</b> شبای نامعتبر نادیده گرفته شد`+(shabaBad.length?" ("+shabaBad.slice(0,8).map(x=>esc(x.code)).join("، ")+(shabaInvalid>8?"، …":"")+")":""):""}`:"<br>ستون «شماره شبا» در فایل نبود.");
    $("#personnelMeta").innerHTML=`فایل: <b>${esc(f.name)}</b><br>${fa(inserted)} نفر جدید، ${fa(updated)} نفر به‌روزرسانی‌شده.${shNote}`;
    app.personnelPage=1;
    await refreshPersonnelList();
    await refreshDashboard();
    showAlert(`به‌روزرسانی کارگزینی انجام شد: ${fa(inserted)} نفر جدید، ${fa(updated)} نفر به‌روزرسانی شد.${meta.shaba!==undefined?`\nشبا: ${fa(shabaSet)} ذخیره${shabaInvalid?`، ${fa(shabaInvalid)} نامعتبر`:""}`:""}`);
  }catch(err){showAlert("خطا در وارد کردن فایل کارگزینی: "+err.message)}
  app.busy=false;
}
wireDrop("#dropPersonnel","#personnelFile",importPersonnelHandler);

/* ---------- به‌روزرسانی اطلاعات پرسنل از فایل‌های اکسل (کارگزینی / بیمه / حساب و شبا) ---------- */
const UPD_META={
  code:["کدپرسنلی","شمارهپرسنلی","پرسنلی"],
  firstName:["نام"],lastName:["نامخانوادگی"],fatherName:["نامپدر"],
  nationalId:["کدملی","شمارهملی"],idNumber:["شمارهشناسنامه"],
  birthDate:["تاریختولد"],birthPlace:["محلتولد"],gender:["جنسیت"],
  maritalStatus:["آخرینوضعیتتاهل","وضعیتتاهل"],
  employmentType:["نوعاستخدام"],education:["مدرکتحصیلی"],
  fieldOfStudy:["رشتهتحصیلی"],bankName:["نامبانک"],active:["وضعیتپرسنل","وضعیت"],
  jobTitle:["عنوانپست","پست","پستاصلی"],workplace:["واحدسازمانی"],
  insuranceType:["بیمه","نوعبیمه"],
  shaba:["شمارهحسابیاشبا","شمارهشبا","شبا"]
};
// عنوان‌های جایگزین ستون‌ها هم با همان norm() یکسان می‌شوند (مثلاً «آخرین وضعیت تاهل» که norm آ را به ا تبدیل می‌کند و قبلاً هرگز شناسایی نمی‌شد)
[META,RET_META,PERSONNEL_META,LOAN_META,UPD_META].forEach(o=>{for(const k in o)o[k]=o[k].map(norm)});
const UPD_LABELS={advance_account:"حساب مساعده",first_name:"نام",last_name:"نام خانوادگی",father_name:"نام پدر",national_id:"کد ملی",id_number:"شمارهٔ شناسنامه",
  birth_date:"تاریخ تولد",birth_place:"محل تولد",gender:"جنسیت",marital_status:"وضعیت تأهل",employment_type:"نوع استخدام",
  education:"مدرک تحصیلی",field_of_study:"رشته تحصیلی",bank_name:"نام بانک",job_title:"پست",workplace:"محل خدمت (واحد سازمانی)",insurance_type:"نوع بیمه",shaba:"شمارهٔ شبا",bank_account:"شمارهٔ حساب"};
function analyzeUpd(headers){
  const meta={};
  headers.forEach((h,i)=>{
    const raw=txt(h);if(!raw)return;const n=norm(raw);
    for(const k in UPD_META){if(UPD_META[k].includes(n)&&!(k in meta)){meta[k]=i;break}}
  });
  return meta;
}
function updHeaderRowIndex(rows){
  for(let i=0;i<Math.min(rows.length,20);i++){
    const m=analyzeUpd(rows[i]||[]);
    if(m.code!==undefined&&Object.keys(m).length>=2)return i;
  }
  return -1;
}
// خروجی اکسل تغییرات «به‌روزرسانی اطلاعات پرسنل» (خلاصه، تغییرات هر فیلد با مقدار قبل و بعد، افراد جدید، یافت‌نشده‌ها، شبای نامعتبر)
async function exportUpdateChanges(T,files){
  const lab=c=>c==="advance_account"?"حساب مساعده":c==="shaba"?"شمارهٔ شبا":c==="bank_account"?"شمارهٔ حساب":(UPD_LABELS[c]||c);
  const sum=[["فایل‌ها",files.join("، ")],["افراد در فایل‌ها",T.total],["از قبل در سیستم بود",T.matched],["تغییر کرد",T.changedPeople],["بدون تغییر",T.unchanged],["تعداد کل تغییرات فیلدها",T.changes.length],["شبا ذخیره/اصلاح شد",T.shabaUpdated],["شمارهٔ حساب با ۱۳ رقم آخر شبا اصلاح شد",T.accountUpdated],["افراد جدید اضافه‌شده",T.created],["بازنشسته/وظیفه‌بگیر در سیستم (حساب و شبا بروز نشد)",T.retiredSkipped],["حساب مساعدهٔ ثبت‌شده از فایل",T.advanceAccountSet],["در سیستم نبودند",T.notFoundCount],["شبای نامعتبر",T.shabaInvalidCount]];
  Object.entries(T.fields).sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>sum.push(["تعداد تغییر «"+lab(c)+"»",n]));
  const sheets=[{name:"خلاصه",H:["شرح","مقدار"],rows:sum,widths:[44,50]},
    {name:"تغییرات",H:["کد پرسنلی","نام و نام خانوادگی","فیلد","مقدار قبلی","مقدار جدید"],rows:T.changes.map(x=>[String(x.code),x.name||"",lab(x.field),x.old==null?"":String(x.old),x.new==null?"":String(x.new)]),widths:[14,26,24,30,30]}];
  if(T.createdList.length)sheets.push({name:"افراد جدید",H:["کد پرسنلی","نام و نام خانوادگی","وضعیت"],rows:T.createdList.map(x=>[String(x.code),x.name||"",x.status||""])});
  if(T.notFoundAll.length)sheets.push({name:"در سیستم نبودند",H:["کد پرسنلی"],rows:T.notFoundAll.map(c=>[String(c)])});
  if(T.shabaInvalidAll.length)sheets.push({name:"شبای نامعتبر",H:["کد پرسنلی","مقدار در فایل"],rows:T.shabaInvalidAll.map(x=>[String(x.code),String(x.value||"")]),widths:[14,36]});
  await xlsxMulti(`personnel-update-changes-${todayJalali().replace(/\//g,"-")}.xlsx`,sheets);
}
$("#updMeta").addEventListener("click",async e=>{if(e.target.closest("#btnUpdXlsx")&&app.lastUpd){try{await exportUpdateChanges(app.lastUpd.T,app.lastUpd.files)}catch(ex){showAlert(ex.message)}}});
async function importUpdateHandler(files){
  files=Array.from(files||[]);if(!files.length)return;
  if(app.busy)return;
  if(!await checkFilePeriod(files,"به‌روزرسانی اطلاعات پرسنل"))return;
  app.busy=true;
  const meta0=$("#updMeta");meta0.textContent="در حال خواندن فایل‌ها…";
  try{
    const merged=new Map();const info=[];
    for(const f of files){
      logLine("شروع پردازش فایل: "+f.name);
      const rows=await readWorkbookRows(f);
      const hi=updHeaderRowIndex(rows);
      if(hi<0){info.push(`<b>${esc(f.name)}</b>: ستون «کد پرسنلی» پیدا نشد؛ نادیده گرفته شد.`);logLine("ستون کد پرسنلی در "+f.name+" پیدا نشد.");continue}
      const meta=analyzeUpd(rows[hi]);
      const fields=Object.keys(meta).filter(k=>k!=="code");
      let n=0;
      for(const r of rows.slice(hi+1)){
        const code=txt(r[meta.code]);if(!code)continue;
        const rec=merged.get(code)||{code};
        for(const k of fields){const v=txt(r[meta[k]]);if(v)rec[k]=v}
        merged.set(code,rec);n++;
      }
      const names=fields.map(k=>k==="shaba"?"شبا":k==="active"?"وضعیت (فعال/غیرفعال)":(UPD_LABELS[k.replace(/[A-Z]/g,c=>"_"+c.toLowerCase())]||k));
      info.push(`<b>${esc(f.name)}</b>: ${fa(n)} ردیف — ستون‌ها: ${esc(names.join("، "))}`);
      logLine(`${f.name}: ${n} ردیف، ستون‌ها: ${names.join("، ")}`);
    }
    const people=[...merged.values()];
    if(!people.length)throw new Error("هیچ ردیف قابل استفاده‌ای پیدا نشد.");
    const T={total:people.length,matched:0,notFoundCount:0,notFound:[],changedPeople:0,unchanged:0,fields:{},accountUpdated:0,shabaUpdated:0,shabaInvalidCount:0,shabaInvalid:[],created:0,createdActive:0,createdTerminated:0,retiredSkipped:0,advanceAccountSet:0,changes:[],createdList:[],notFoundAll:[],shabaInvalidAll:[]};
    const createMissing=$("#updCreate").checked;
    const CH=500;
    for(let i=0;i<people.length;i+=CH){
      meta0.textContent=`در حال به‌روزرسانی… ${fa(Math.min(i+CH,people.length))} از ${fa(people.length)}`;
      const r=await api("POST","/api/personnel/bulk-update",{people:people.slice(i,i+CH),createMissing});
      for(const k of["matched","notFoundCount","changedPeople","unchanged","accountUpdated","shabaUpdated","shabaInvalidCount","created","createdActive","createdTerminated","retiredSkipped","advanceAccountSet"])T[k]+=r[k]||0;
      for(const c in r.fields)T.fields[c]=(T.fields[c]||0)+r.fields[c];
      T.notFound.push(...r.notFound);T.shabaInvalid.push(...r.shabaInvalid);
      for(const k of["changes","createdList","notFoundAll","shabaInvalidAll"])if(r[k])for(const x of r[k])T[k].push(x);
    }
    const fl=Object.entries(T.fields).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${esc(UPD_LABELS[c]||c)}: ${fa(n)}`).join(" • ");
    meta0.innerHTML=info.join("<br>")+`<br><br>افراد در فایل‌ها: <b>${fa(people.length)}</b> — از قبل در سیستم بود: <b>${fa(T.matched)}</b> — تغییر کرد: <b>${fa(T.changedPeople)}</b> — بدون تغییر: ${fa(T.unchanged)}`
      +(fl?`<br>تعداد تغییر هر فیلد — ${fl}`:"")
      +`<br>شبا ذخیره/اصلاح شد: <b>${fa(T.shabaUpdated)}</b> — شمارهٔ حساب با ۱۳ رقم آخر شبا اصلاح شد: <b>${fa(T.accountUpdated)}</b>`
      +(T.retiredSkipped?`<br>بازنشسته/وظیفه‌بگیر در سیستم (حساب و شبا بروز نشد): <b>${fa(T.retiredSkipped)}</b> نفر — حساب مساعده (از حساب ملی فایل، چون خالی بود) ثبت شد: <b>${fa(T.advanceAccountSet)}</b>`:"")
      +(T.created?`<br>افراد جدید اضافه شد: <b>${fa(T.created)}</b> نفر — شاغل: ${fa(T.createdActive)}، قطع رابطه (غیرفعال): ${fa(T.createdTerminated)}`:"")
      +(T.notFoundCount?`<br>در سیستم نبودند (اضافه نشد): <b>${fa(T.notFoundCount)}</b> نفر${T.notFound.length?" — نمونه: "+faId(esc(T.notFound.slice(0,8).join("، "))):""}`:"")
      +(T.shabaInvalidCount?`<br><span class="u-c-red">شبای نامعتبر (ذخیره نشد): <b>${fa(T.shabaInvalidCount)}</b> — نمونه: ${faId(esc(T.shabaInvalid.slice(0,5).map(x=>x.code+" ("+x.value+")").join("، ")))}</span>`:"");
    logLine(`به‌روزرسانی اطلاعات پرسنل: ${T.changedPeople} نفر تغییر کرد، ${T.shabaUpdated} شبا، ${T.accountUpdated} شمارهٔ حساب اصلاح شد، ${T.notFoundCount} نفر در سیستم نبودند.`);
    await refreshPersonnelList();
    app.lastUpd={T,files:files.map(f=>f.name)};
    meta0.innerHTML+=`<br><button class="btn btn-green u-mt8" id="btnUpdXlsx"><svg class="i"><use href="#i-file"/></svg>دانلود گزارش تغییرات (اکسل)</button>`;
    try{await exportUpdateChanges(T,app.lastUpd.files)}catch(ex){logLine("ساخت خروجی اکسل تغییرات ممکن نشد: "+ex.message)}
    showAlert(`به‌روزرسانی انجام شد: ${fa(T.changedPeople)} نفر تغییر کرد (از ${fa(T.matched)} نفرِ موجود)، ${fa(T.created)} نفر جدید اضافه شد؛ شبا: ${fa(T.shabaUpdated)}، اصلاح شمارهٔ حساب: ${fa(T.accountUpdated)}.`);
  }catch(err){meta0.textContent="خطا: "+err.message;showAlert("خطا در به‌روزرسانی اطلاعات پرسنل: "+err.message)}
  app.busy=false;
}
(function(){
  const drop=$("#dropUpd"),input=$("#updFiles");
  drop.addEventListener("click",()=>input.click());
  input.addEventListener("change",e=>{const fs=Array.from(e.target.files);e.target.value="";if(fs.length)importUpdateHandler(fs)});
  ["dragenter","dragover"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add("over")}));
  ["dragleave","drop"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove("over")}));
  drop.addEventListener("drop",e=>{const fs=Array.from(e.dataTransfer.files);if(fs.length)importUpdateHandler(fs)});
})();

