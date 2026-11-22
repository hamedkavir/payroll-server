"use strict";
/* payslip/import.js — وارد کردن فایل‌های اکسل حقوق/اقساط
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("payslip/import");
/* ---------- وارد کردن فایل‌ها ---------- */
// کتابخانهٔ اکسل ممکن است هنوز در حال بارگذاری باشد (چه از فایل محلی، چه از اینترنت)
// وقتی کاربر خیلی سریع روی «وارد کردن» کلیک می‌کند. به‌جای شکست فوری، تا ۸ ثانیه
// صبر می‌کنیم شاید در همین حین بارگذاری کامل شود؛ فقط اگر واقعاً بعد از آن هم
// آماده نشد (مثلاً به‌خاطر نبود اینترنت و نبود فایل محلی) خطای واقعی می‌دهیم.
// ensureXLSX از نسخهٔ ۱۱۱ در core/xlsx-loader.js است (بارگذاری تنبل و یک‌باره)
async function readWorkbookRows(f){
  await ensureXLSX();
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onerror=()=>reject(new Error("فایل خوانده نشد."));
    fr.onload=()=>{
      try{
        const wb=XLSX.read(new Uint8Array(fr.result),{type:"array"});
        const ws=wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:""}));
      }catch(err){reject(err)}
    };
    fr.readAsArrayBuffer(f);
  });
}
function wireDrop(dropId,fileId,handler){
  const drop=$(dropId),input=$(fileId);
  drop.addEventListener("click",()=>input.click());
  input.addEventListener("change",e=>{const f=e.target.files[0];e.target.value="";if(f)handler(f)});
  ["dragenter","dragover"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add("over")}));
  ["dragleave","drop"].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove("over")}));
  drop.addEventListener("drop",e=>{const f=e.dataTransfer.files[0];if(f)handler(f)});
}

// فایل‌های قبلاً بارگذاری‌شدهٔ دورهٔ جاری (از جزئیات دوره؛ در صورت نبود از فهرست دوره‌ها)
function curPeriodRec(){const d=app.periodDetail&&app.periodDetail.id===app.currentPeriodId?app.periodDetail:null;return d||app.periods.find(x=>x.id===app.currentPeriodId)||null}
// ---- کنترل نام فایل با دورهٔ فعال: نام باید شمارهٔ دوره را به‌صورت سالماه (مثلاً «140506 - FishSh.xlsx» = شهریور ۱۴۰۵) داشته باشد
function fileNamePeriod(name){
  const n=toEnDigits(String(name||"")).replace(/\.[^.\\\/]+$/,"");
  const m=n.match(/(?:^|\D)(1[34]\d{2})(0[1-9]|1[0-2])(?!\d)/);
  return m?{year:+m[1],month:+m[2]}:null;
}
// true = ادامه؛ اگر شمارهٔ دورهٔ نام فایل با دورهٔ فعال فرق کند، یا اصلاً شمارهٔ دورهٔ معتبر (سالماه با ماه ۰۱ تا ۱۲) نداشته باشد، رد می‌شود
async function checkFilePeriod(files,label){
  const per=curPeriodRec();if(!per)return true;
  const want=`${per.year}${pad2(per.month)}`,bad=[],none=[];
  for(const f of files){const fp=fileNamePeriod(f.name);if(!fp)none.push(f.name);else if(fp.year!==per.year||fp.month!==per.month)bad.push(`${f.name} (دورهٔ ${faId(fp.year)}/${faId(pad2(fp.month))})`)}
  if(bad.length||none.length){
    showAlert(`مغایرت دوره: نام فایل «${label}» با دورهٔ فعال یکی نیست.\nدورهٔ فعال: ${MONTHS[per.month-1]} ${faId(per.year)} (${faId(want)})`
      +(bad.length?`\nفایل‌های مغایر:\n${bad.join("\n")}`:"")
      +(none.length?`\nفایل‌هایی که نامشان شمارهٔ دورهٔ معتبر ندارد (باید مثل ${want} - ... باشد، ماه ۰۱ تا ۱۲):\n${none.join("\n")}`:"")
      +"\nدورهٔ درست را انتخاب کنید یا نام فایل را اصلاح کنید.");
    logLine("بارگذاری رد شد (نام فایل با دوره نمی‌خواند): "+bad.concat(none).join("، "));return false;
  }
  return true;
}
async function confirmReplaceFile(label,existingName){
  if(!existingName)return true;
  const ok=await confirmAsync(`برای این دوره «${label}» از قبل بارگذاری شده است (${existingName}).\nاگر فایل جدید را انتخاب کنید، اطلاعات قبلی این فایل حذف و اطلاعات فایل جدید جایگزین می‌شود.\nادامه می‌دهید؟`);
  if(!ok)logLine("بارگذاری فایل لغو شد (فایل قبلی دوره حفظ شد).");
  return ok;
}
// فایل بازنشستگان: دو ستون اول سال و ماه‌اند؛ باید با دورهٔ انتخاب‌شده یکی باشند (مثلاً فیش شهریور برای مهر بارگذاری نشود)
function retireeYearMonth(rows,hi,meta,per){
  const yc=meta.year!==undefined?meta.year:0,mc=meta.month!==undefined?meta.month:1,cnt={};let bad=0,valid=0;
  rows.slice(hi+1).forEach(r=>{
    let y=parseInt(toEnDigits(txt(r[yc])),10);const m=parseInt(toEnDigits(txt(r[mc])),10);
    if(!(y>=0)||!(m>=1&&m<=12))return;
    if(y<100)y+=1400;if(y<1300||y>1500)return;
    valid++;const k=y+"/"+m;cnt[k]=(cnt[k]||0)+1;if(y!==per.year||m!==per.month)bad++;
  });
  if(!valid){logLine("ستون سال/ماه در فایل بازنشستگان شناسایی نشد؛ کنترل دوره انجام نشد.");return null}
  if(bad){const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0][0].split("/");
    throw new Error(`مغایرت دوره: سال و ماه داخل فایل ${faId(top[0])}/${faId(pad2(top[1]))} است ولی دورهٔ انتخاب‌شده ${faId(per.year)}/${faId(pad2(per.month))} (${MONTHS[per.month-1]}) است (${faId(bad)} ردیف مغایر). دورهٔ درست را انتخاب کنید یا فایل صحیح را بدهید. فایل بارگذاری نشد.`)}
  return [per.year,per.month];
}
// فایل کسور/اقساط شاغلین: اگر ستون «تاریخ کسر اقساط» دارد، سال و ماهِ غالب آن باید با دوره یکی باشد
function loanDateCheck(rows,hi,per){
  const hd=rows[hi].map(h=>norm(txt(h)));
  const c=hd.findIndex(h=>h.includes("تاریخ")&&h.includes("کسر"));   // «تاریخ کسر اقساط»
  if(c<0)return;
  const cnt={};let valid=0;
  rows.slice(hi+1).forEach(r=>{
    const t=toEnDigits(txt(r[c]));
    const m=t.match(/(\d{4})\s*[\/\-.]\s*(\d{1,2})/)||t.replace(/\D/g,"").match(/^(\d{4})(\d{2})\d{2}$/);
    if(!m)return;const y=+m[1],mo=+m[2];if(y<1300||y>1500||mo<1||mo>12)return;
    valid++;const k=y+"/"+mo;cnt[k]=(cnt[k]||0)+1;
  });
  if(!valid)return;
  const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0][0].split("/");
  if(+top[0]!==per.year||+top[1]!==per.month)
    throw new Error(`مغایرت دوره: بیشتر ردیف‌های ستون «تاریخ کسر اقساط» فایل مربوط به ${faId(top[0])}/${faId(pad2(top[1]))} است ولی دورهٔ انتخاب‌شده ${faId(per.year)}/${faId(pad2(per.month))} (${MONTHS[per.month-1]}) است. دورهٔ درست را انتخاب کنید یا فایل صحیح را بدهید. فایل بارگذاری نشد.`);
}
async function importActiveHandler(f){
  logLine("شروع پردازش فایل: "+f.name);
  if(!app.currentPeriodId){showAlert("ابتدا یک دوره بسازید یا انتخاب کنید.");return}
  if(!await checkFilePeriod([f],"فیش حقوقی شاغلین"))return;
  if(!await confirmReplaceFile("فایل حقوق شاغلین",(curPeriodRec()||{}).activeFile))return;
  app.busy=true;
  try{
    const rows=await readWorkbookRows(f);
    const hi=headerRowIndex(rows);
    if(hi<0)throw new Error("ردیف عنوان ستون‌ها پیدا نشد.");
    const cols=analyze(rows[hi]);
    const data=rows.slice(hi+1).filter(r=>r.some(c=>txt(c)!==""));
    if(!data.length)throw new Error("هیچ ردیف داده‌ای پیدا نشد.");
    const people=data.map((r,i)=>{
      const base=computeActiveBase(r,cols);
      return{code:base.info.code||("row"+i),name:base.name,nationalId:padNidC(base.info.nid),data:base};
    });
    const result=await api("POST",`/api/periods/${app.currentPeriodId}/people/import`,{kind:"active",people,fileName:f.name});
    await selectPeriod(app.currentPeriodId);
    await refreshDashboard();
    showAlert(`وارد شد: ${fa(result.inserted)} نفر جدید، ${fa(result.updated)} نفر به‌روزرسانی، ${fa(result.deleted)} نفر حذف‌شده (چون در فایل جدید نبودند).`+personnelSyncNote(result.personnelSync)+loanSyncNote(result.loanQueueSync));
    try{await exportUploadReport("active",f.name,{slip:result.slipChanges,sync:result.personnelSync,loan:result.loanQueueSync,count:people.length})}catch(ex){logLine("ساخت گزارش اکسل ممکن نشد: "+ex.message)}
  }catch(err){showAlert("خطا در وارد کردن فایل: "+err.message)}
  app.busy=false;
}
async function importRetireeHandler(f){
  logLine("شروع پردازش فایل: "+f.name);
  if(!app.currentPeriodId){showAlert("ابتدا یک دوره بسازید یا انتخاب کنید.");return}
  if(!await checkFilePeriod([f],"فیش بازنشستگان"))return;
  if(!await confirmReplaceFile("فایل حقوق بازنشستگان",(curPeriodRec()||{}).retireeFile))return;
  app.busy=true;
  try{
    const rows=await readWorkbookRows(f);
    const hi=retireeHeaderRowIndex(rows);
    if(hi<0)throw new Error("ستون‌های لازم (پرسنلی، عنوان کسر، مبلغ قسط) پیدا نشد.");
    const meta=analyzeRetiree(rows[hi]);
    const per=app.periods.find(x=>x.id===app.currentPeriodId);
    const fileYm=per?retireeYearMonth(rows,hi,meta,per):null;
    const data=rows.slice(hi+1).filter(r=>r.some(c=>txt(c)!==""));
    if(!data.length)throw new Error("هیچ ردیف داده‌ای پیدا نشد.");
    const order=[],groups={};
    // وارثان هم‌کد: اگر یک کد پرسنلی برای چند کد ملیِ متفاوت آمده باشد، کلید فیش «کد-کدملی» می‌شود تا ادغام نشوند
    const nidsOf={};
    data.forEach(r=>{const c=txt(r[meta.code]);if(!c)return;const n=meta.nid!==undefined?padNidC(txt(r[meta.nid])):"";(nidsOf[c]=nidsOf[c]||new Set()).add(n)});
    data.forEach(r=>{
      const realCode=txt(r[meta.code]);if(!realCode)return;
      const rn=meta.nid!==undefined?padNidC(txt(r[meta.nid])):"";
      const code=(nidsOf[realCode].size>1&&rn)?realCode+"-"+rn:realCode;
      if(!groups[code]){
        groups[code]={code,dispCode:realCode,nid:meta.nid!==undefined?padNidC(txt(r[meta.nid])):"",firstName:meta.first!==undefined?txt(r[meta.first]):"",lastName:meta.last!==undefined?txt(r[meta.last]):"",
          name:[meta.first!==undefined?txt(r[meta.first]):"",meta.last!==undefined?txt(r[meta.last]):""].filter(Boolean).join(" "),
          account:meta.account!==undefined?txt(r[meta.account]):"",shaba:meta.shaba!==undefined?txt(r[meta.shaba]):"",
          region:meta.region!==undefined?txt(r[meta.region]):"",ledger:meta.ledger!==undefined?txt(r[meta.ledger]):"",heir:meta.heir!==undefined?txt(r[meta.heir]):"",items:[]};
        order.push(code);
      }
      groups[code].items.push({
        code:meta.itemCode!==undefined?txt(r[meta.itemCode]):"",
        label:meta.itemTitle!==undefined?txt(r[meta.itemTitle]).replace(/\s+/g," ").trim():"",
        v:meta.installment!==undefined?toNum(r[meta.installment]):0,
        loanAmt:meta.loanAmt!==undefined?toNum(r[meta.loanAmt]):0,
        remaining:meta.remaining!==undefined?toNum(r[meta.remaining]):0,
        seq:meta.fundRow!==undefined?txt(r[meta.fundRow]):"",
        series:meta.series!==undefined?txt(r[meta.series]):""
      });
    });
    const people=order.map(c=>{const g=groups[c];return{code:g.code,name:g.name,nationalId:g.nid,data:g}});
    const result=await api("POST",`/api/periods/${app.currentPeriodId}/people/import`,{kind:"retiree",people,fileName:f.name,fileYm:fileYm||undefined});
    await selectPeriod(app.currentPeriodId);
    await refreshDashboard();
    showAlert(`وارد شد: ${fa(result.inserted)} نفر جدید، ${fa(result.updated)} نفر به‌روزرسانی، ${fa(result.deleted)} نفر حذف‌شده.`+personnelSyncNote(result.personnelSync)+loanSyncNote(result.loanQueueSync));
    try{await exportUploadReport("retiree",f.name,{slip:result.slipChanges,sync:result.personnelSync,loan:result.loanQueueSync,count:people.length})}catch(ex){logLine("ساخت گزارش اکسل ممکن نشد: "+ex.message)}
  }catch(err){showAlert("خطا در وارد کردن فایل: "+err.message)}
  app.busy=false;
}
async function importLoanHandler(f){
  logLine("شروع پردازش فایل: "+f.name);
  if(!app.currentPeriodId){showAlert("ابتدا یک دوره بسازید یا انتخاب کنید.");return}
  if(!await checkFilePeriod([f],"اقساط/کسور شاغلین"))return;
  if(!await confirmReplaceFile("فایل اقساط/کسور شاغلین",(curPeriodRec()||{}).loanFile))return;
  app.busy=true;
  try{
    const rows=await readWorkbookRows(f);
    const hi=loanHeaderRowIndex(rows);
    if(hi<0)throw new Error("ستون «کد پرسنلی» یا «مبلغ هر قسط» پیدا نشد.");
    const meta=analyzeLoan(rows[hi]);
    const per=app.periods.find(x=>x.id===app.currentPeriodId);
    if(per)loanDateCheck(rows,hi,per);
    const data=rows.slice(hi+1).filter(r=>r.some(c=>txt(c)!==""));
    if(!data.length)throw new Error("هیچ ردیف داده‌ای پیدا نشد.");
    const loans={};
    data.forEach(r=>{
      const code=txt(r[meta.code]);if(!code)return;
      const item={
        label:meta.title!==undefined?((txt(r[meta.title]).replace(/\/n\s*$/i,"").replace(/\s+/g," ").trim())||"قسط وام"):"قسط وام",
        code:meta.lcode!==undefined?txt(r[meta.lcode]):"",
        seq:meta.seq!==undefined?txt(r[meta.seq]):"",
        v:toNum(r[meta.installment]),
        remaining:meta.remaining!==undefined?toNum(r[meta.remaining]):null,
        principal:meta.principal!==undefined?toNum(r[meta.principal]):null
      };
      (loans[code]=loans[code]||[]).push(item);
    });
    const lr=await api("PUT",`/api/periods/${app.currentPeriodId}`,{loans,loanFile:f.name});
    await selectPeriod(app.currentPeriodId);
    showAlert(`فایل اقساط برای ${fa(Object.keys(loans).length)} نفر وارد و به‌روزرسانی شد.`+loanSyncNote(lr&&lr.loanQueueSync));
    try{await exportUploadReport("loan",f.name,{loan:lr&&lr.loanQueueSync,count:Object.keys(loans).length})}catch(ex){logLine("ساخت گزارش اکسل ممکن نشد: "+ex.message)}
  }catch(err){showAlert("خطا در وارد کردن فایل: "+err.message)}
  app.busy=false;
}
wireDrop("#dropActive","#activeFile",importActiveHandler);
wireDrop("#dropRet","#retFile",importRetireeHandler);
wireDrop("#dropLoan","#loanFile",importLoanHandler);

