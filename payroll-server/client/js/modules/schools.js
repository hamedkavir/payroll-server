"use strict";
/* modules/schools.js — مدارس و آموزشگاه‌ها
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("modules/schools");
/* ====================== مدارس و آموزشگاه‌ها (+ تغییر امضاء حساب) ====================== */
const SC_FIELDS=[["code","کد آموزشگاه"],["name","نام آموزشگاه"],["area","موقعیت آموزشگاه"],["gender","جنسیت آموزشگاه"],["level","دوره تحصیلی"],["schoolType","نوع آموزشگاه"],["address","آدرس آموزشگاه"],["managerCode","کد پرسنلی مدیر"],["managerFirst","نام مدیر"],["managerLast","نام خانوادگی مدیر"],["managerMobile","شماره همراه مدیر"],["managerType","نوع مدیریت"],["phone","تلفن آموزشگاه"],["postalCode","کدپستی"],["shift","شیفت"],["oppositeShift","شیفت مخالف"],["classes","تعداد کلاس‌های موجود"],["students","تعداد کل دانش‌آموزان"],["account","شماره حساب"],["notes","توضیحات"]];
// عنوان‌های جایگزین ستون در اکسل (فایل مدارس): کلید پس از scNorm
const SC_ALIAS={code:["کدمدرسه","شمارهمدرسه","کدآموزشگاه"],name:["ناممدرسه"],area:["موقعیتجغرافیایی","موقعیتمدرسه"],gender:["جنسیت"],schoolType:["نوعمدرسه","نوعآموزشگاه"],address:["آدرس","آدرسمدرسه"],managerCode:["کدپرسنلیمدیر","کدپرسنلی"],managerFirst:["نام"],managerLast:["نامخانوادگی"],managerMobile:["شمارههمراهمدیر","همراهمدیر","موبایلمدیر"],phone:["تلفن","تلفنمدرسه"],classes:["تعدادکلاسهایموجود","تعدادکلاسها","تعدادکلاس"],students:["تعدادکلدانشآموزان","تعدادکلدانشاموزان","تعدادکلدانشآموز"],account:["حساب","شمارهحسابآموزشگاه","شمارهحسابمدرسه"],level:["دوره","نوعدوره"]};
const SC_TXT=new Set(["code","managerCode","managerMobile","phone","postalCode","account"]);
const SC_BANKS=["بانک ملی","بانک صادرات","بانک ملت","بانک سپه","بانک کشاورزی","بانک مسکن","بانک تجارت","بانک پاسارگاد","بانک رفاه"];
const scNorm=s=>normFa(String(s==null?"":s)).replace(/[^\u0600-\u06FFa-z0-9]/gi,"");
app.sc={tab:"list",items:[],sigs:[],q:"",sq:"",cur:null,sigSchool:null,sigCur:null};
const scFull=s=>(s.managerFirst+" "+s.managerLast).trim();
const scOpts=(k)=>[...new Set(app.sc.items.map(x=>x[k]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fa"));
const scDl=(id,arr)=>`<datalist id="${id}">${arr.map(v=>`<option value="${esc(v)}">`).join("")}</datalist>`;
async function renderSchools(){
  const root=$("#wk-schools");
  try{const [a,b]=await Promise.all([api("GET","/api/schools"),api("GET","/api/schools/sig-changes")]);app.sc.items=a.items;app.sc.sigs=b.items}catch(e){root.innerHTML=emptyMsg(esc(e.message));return}
  scDraw();
}
function scDraw(){const S=app.sc;if(S.cur)scDrawForm();else if(S.sigSchool)scDrawSig();else scDrawList()}
function scTabs(){return `<div class="chips u-mb12"><button data-sc="tab" data-t="list" class="${app.sc.tab==="list"?"on":""}">فهرست آموزشگاه‌ها (${faId(app.sc.items.length)})</button><button data-sc="tab" data-t="sig" class="${app.sc.tab==="sig"?"on":""}">سوابق تغییر امضاء (${faId(app.sc.sigs.length)})</button></div>`}
function scRows(){
  const q=scNorm(app.sc.q),rows=app.sc.items.filter(x=>!q||scNorm([x.code,x.name,x.area,x.gender,x.level,scFull(x),x.managerCode,x.managerMobile,x.account,x.phone,x.address].join(" ")).includes(q));
  $("#sc-cnt").textContent=faId(rows.length)+" مورد";
  $("#sc-tbody").innerHTML=rows.map(x=>`<tr class="clk" data-scid="${x.id}"><td>${faId(esc(x.code))}</td><td>${esc(x.name)}</td><td>${esc(x.area)}</td><td>${esc(x.gender)}</td><td>${esc(x.level)}</td><td>${esc(scFull(x))}</td><td>${faId(esc(x.managerMobile))}</td><td class="ltr">${faId(esc(x.account))}</td><td class="u-nowrap"><button class="btn" data-sc="edit" data-id="${x.id}">ویرایش</button> <button class="btn" data-sc="sig" data-id="${x.id}">تغییر امضاء</button></td></tr>`).join("")||`<tr><td colspan="9" class="hint">موردی پیدا نشد.</td></tr>`;
}
function scDrawList(){
  $("#wk-schools").innerHTML=`${scTabs()}<div class="card"><h2><svg class="i"><use href="#i-list"/></svg>مدارس و آموزشگاه‌ها <span class="badge b-blue" id="sc-cnt"></span></h2>
    <div class="wk-acts u-mb10"><input id="sc-q" class="inp u-maxw360" placeholder="جست‌وجو: کد، نام، منطقه، مدیر، موبایل، حساب…" value="${esc(app.sc.q)}"><span class="sp"></span>
      <button class="btn btn-main" data-sc="new">آموزشگاه جدید</button>
      <label class="btn u-pointer">ورود از اکسل<input type="file" id="scFile" accept=".xlsx,.xlsm,.xls,.csv" hidden></label>
      <button class="btn btn-green" data-sc="xls">ارسال به اکسل</button><a href="#" class="sample u-m-0-6" data-sample="schools">⬇ فایل نمونه</a></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد</th><th>نام آموزشگاه</th><th>موقعیت</th><th>جنسیت</th><th>دوره</th><th>مدیر</th><th>همراه مدیر</th><th>شمارهٔ حساب</th><th></th></tr></thead><tbody id="sc-tbody"></tbody></table></div></div>`;
  scRows();
}
function scSigRows(){
  const q=scNorm(app.sc.sq),rows=app.sc.sigs.filter(x=>!q||scNorm([x.regNo,x.letterNo,x.reqDate,x.schoolName,x.schoolCode,x.bankName,x.branch,x.managerName,x.teacherName,x.parentsName].join(" ")).includes(q));
  $("#sc-stbody").innerHTML=rows.map(x=>`<tr class="clk" data-sgid="${x.id}"><td>${faId(esc(x.regNo))}</td><td>${faId(esc(x.reqDate))}</td><td>${esc(x.schoolName)}</td><td>${esc(x.bankName)} ${esc(x.branch)}</td><td>${esc(x.managerName)}</td><td>${esc(x.teacherName)}</td><td>${esc(x.parentsName)}</td><td class="u-nowrap"><button class="btn" data-sc="sg-open" data-id="${x.id}">ویرایش</button> <button class="btn" data-sc="sg-print" data-id="${x.id}">چاپ نامه</button></td></tr>`).join("")||`<tr><td colspan="8" class="hint">موردی ثبت نشده است. از فهرست آموزشگاه‌ها «تغییر امضاء» را بزنید.</td></tr>`;
}
function scDrawSigTab(){
  $("#wk-schools").innerHTML=`${scTabs()}<div class="card"><h2><svg class="i"><use href="#i-list"/></svg>سوابق تغییر امضاء</h2>
    <div class="wk-acts u-mb10"><input id="sc-sq" class="inp u-maxw360" placeholder="جست‌وجو: شماره، تاریخ، آموزشگاه، نام…" value="${esc(app.sc.sq)}"></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>شماره</th><th>تاریخ درخواست</th><th>آموزشگاه</th><th>بانک و شعبه</th><th>مدیر</th><th>نمایندهٔ معلمان</th><th>نمایندهٔ انجمن اولیاء</th><th></th></tr></thead><tbody id="sc-stbody"></tbody></table></div></div>`;
  scSigRows();
}
function scFormHtml(S){
  return `<div class="card"><h2><svg class="i"><use href="#i-list"/></svg>${S.id?"ویرایش آموزشگاه":"آموزشگاه جدید"}</h2><div class="fgrid">${
    SC_FIELDS.map(([k,t])=>{
      const ws=k==="address"||k==="notes"?" span2":"",ltr=SC_TXT.has(k)?' class="ltr"':"",num=k==="classes"||k==="students"?' inputmode="numeric"':"";
      const dl={area:"sc-dl-area",gender:"sc-dl-gender",level:"sc-dl-level",schoolType:"sc-dl-type",shift:"sc-dl-shift",oppositeShift:"sc-dl-shift",managerType:"sc-dl-mt"}[k];
      return `<label class="f${ws}">${t}<input id="scf-${k}"${ltr}${num}${dl?` list="${dl}"`:""} maxlength="${k==="address"||k==="notes"?500:100}" value="${esc(S[k]==null?"":S[k])}"></label>`}).join("")}</div>
    ${scDl("sc-dl-area",scOpts("area"))}${scDl("sc-dl-gender",["پسرانه","دخترانه","مختلط"])}${scDl("sc-dl-level",scOpts("level"))}${scDl("sc-dl-type",scOpts("schoolType").concat(["دولتی عادی","هیات امنایی"]).filter((v,i,a)=>a.indexOf(v)===i))}${scDl("sc-dl-shift",scOpts("shift"))}${scDl("sc-dl-mt",["مستقل","غیر مستقل"])}
    <div class="wk-acts"><button class="btn btn-main" data-sc="save">ذخیره</button><button class="btn" data-sc="fill-mgr">پر کردن مدیر از «پرسنل» (با کد پرسنلی)</button>${S.id?`<button class="btn" data-sc="sig" data-id="${S.id}">تغییر امضاء</button><button class="btn btn-del" data-sc="del">حذف</button>`:""}<button class="btn" data-sc="cancel">انصراف</button></div></div>`;
}
function scDrawForm(){$("#wk-schools").innerHTML=scTabs()+scFormHtml(app.sc.cur)}
const scSigDefault=S=>{const last=app.sc.sigs.find(x=>x.schoolId===S.id)||app.sc.sigs[0]||{};return{id:0,schoolId:S.id,regNo:"",letterNo:"",reqDate:todayJalali(),bankCode:last.bankCode||"",bankName:last.bankName||"",branch:last.branch||"",account:S.account||"",managerCode:S.managerCode||"",managerName:scFull(S),teacherCode:"",teacherName:"",parentsName:"",notes:""}};
function scDrawSig(){
  const S=app.sc.sigSchool,R=app.sc.sigCur||scSigDefault(S),hist=app.sc.sigs.filter(x=>x.schoolId===S.id);
  const bank=app.sc.sigs.map(x=>x.bankName).concat(SC_BANKS).filter((v,i,a)=>v&&a.indexOf(v)===i),br=[...new Set(app.sc.sigs.map(x=>x.branch).filter(Boolean))];
  const f=(id,t,v,ex="",cls="")=>`<label class="f ${cls}">${t}<input id="sg-${id}" value="${esc(v==null?"":v)}" ${ex}></label>`;
  $("#wk-schools").innerHTML=`${scTabs()}<div class="card"><h2><svg class="i"><use href="#i-list"/></svg>تغییر امضاء — ${esc(S.name)} <span class="badge b-blue">${R.id?"ویرایش":"ثبت جدید"}</span></h2>
    <p class="hint u-m0b8">کد آموزشگاه: ${faId(esc(S.code))} — جنسیت/دوره: ${esc(S.gender)} ${esc(S.level)}</p>
    <div class="fgrid">${f("regNo","شمارهٔ ثبت (خودکار اگر خالی)",R.regNo,'inputmode="numeric" class="ltr"')}${f("letterNo","شمارهٔ نامه (چاپی؛ اگر خالی، شمارهٔ ثبت)",R.letterNo,'class="ltr"',"span2")}${f("reqDate","تاریخ درخواست (۱۴۰۴/۱۱/۰۶)",R.reqDate,'class="ltr" maxlength="10"')}
      ${f("bankName","نام بانک",R.bankName,'list="sg-dl-bank"')}${f("bankCode","کد بانک",R.bankCode,'class="ltr"')}${f("branch","شعبه",R.branch,'list="sg-dl-br"')}${f("account","شمارهٔ حساب (۱۳ رقم)",R.account,'class="ltr" maxlength="13" inputmode="numeric"')}
      ${f("managerCode","کد پرسنلی مدیر",R.managerCode,'class="ltr"')}${f("managerName","نام مدیر (امضاء ثابت)",R.managerName,"","span2")}
      ${f("teacherCode","کد پرسنلی نمایندهٔ معلمان",R.teacherCode,'class="ltr"')}${f("teacherName","نمایندهٔ معلمان (امضاء متغیر)",R.teacherName,"","span2")}
      ${f("parentsName","نمایندهٔ انجمن اولیاء (امضاء متغیر)",R.parentsName,"","span2")}${f("notes","توضیحات",R.notes,"","span2")}</div>
    ${scDl("sg-dl-bank",bank)}${scDl("sg-dl-br",br)}
    <div class="wk-acts"><button class="btn btn-main" data-sc="sg-save">ذخیره</button><button class="btn btn-green" data-sc="sg-save-print">ذخیره و چاپ نامه</button><button class="btn" data-sc="sg-fill" data-w="manager">نام مدیر از کد</button><button class="btn" data-sc="sg-fill" data-w="teacher">نام نمایندهٔ معلمان از کد</button>${R.id?`<button class="btn btn-del" data-sc="sg-del">حذف</button>`:`<button class="btn" data-sc="sg-new">فرم خالی</button>`}<button class="btn" data-sc="back">بازگشت</button></div></div>
    <div class="card u-mt14"><h2>سوابق این آموزشگاه (${faId(hist.length)})</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>شماره</th><th>تاریخ</th><th>بانک و شعبه</th><th>مدیر</th><th>نمایندهٔ معلمان</th><th>نمایندهٔ انجمن اولیاء</th><th></th></tr></thead><tbody>${hist.map(x=>`<tr class="clk" data-sgid="${x.id}"><td>${faId(esc(x.regNo))}</td><td>${faId(esc(x.reqDate))}</td><td>${esc(x.bankName)} ${esc(x.branch)}</td><td>${esc(x.managerName)}</td><td>${esc(x.teacherName)}</td><td>${esc(x.parentsName)}</td><td><button class="btn" data-sc="sg-print" data-id="${x.id}">چاپ نامه</button></td></tr>`).join("")||`<tr><td colspan="7" class="hint">هنوز سابقه‌ای نیست.</td></tr>`}</tbody></table></div></div>`;
}
const scVal=id=>{const e=$("#"+id);return e?e.value.trim():""};
function scReadForm(){const o={id:app.sc.cur.id||0};SC_FIELDS.forEach(([k])=>{o[k]=lat(scVal("scf-"+k))});["name","area","gender","level","schoolType","address","managerFirst","managerLast","managerType","shift","oppositeShift","notes"].forEach(k=>o[k]=scVal("scf-"+k));return o}
function scReadSig(){const S=app.sc.sigSchool,o={schoolId:S.id};["regNo","letterNo","reqDate","bankName","bankCode","branch","account","managerCode","managerName","teacherCode","teacherName","parentsName","notes"].forEach(k=>{const v=scVal("sg-"+k);o[k]=["regNo","letterNo","reqDate","bankCode","account","managerCode","teacherCode"].includes(k)?lat(v):v});return o}
async function scPerson(code){
  const c=lat(code).trim();if(!c){showAlert("ابتدا کد پرسنلی را وارد کنید.");return null}
  try{return await api("GET","/api/personnel/"+enc(c))}catch(e){showAlert(/not_found|404/.test(e.message)?"فردی با این کد پرسنلی پیدا نشد.":e.message);return null}
}
// فرم نامهٔ تغییر امضاء (A4 عمودی)؛ R = ردیف تغییر امضاء، S = آموزشگاه. امضاها از «طراح فرم‌های چاپی» قابل تغییرند.
function docSigChange(R,S){ app.docCtx={...S,...R};
  const F="sigchange",f=FS(),gw=S.gender&&S.gender!=="مختلط"?S.gender:"",full=["آموزشگاه",gw,S.name,S.level].filter(Boolean).join(" ");
  const V={school:esc(full),account:faId(esc(R.account||S.account||""))},num=R.letterNo||R.regNo||"";
  const rows=[["مدیر",R.managerName,"امضاء ثابت"],["نماینده معلمان",R.teacherName,"امضاء متغیر"],["نماینده انجمن اولیاء",R.parentsName,"امضاء متغیر"]];
  const coop=`<div class="d-sig">${ftx(F,"st","کارشناس تعاون")}<br><b>${ftx(F,"sn","حامد علیخانی")}</b></div>`,mgr=`<div class="d-sig">${esc(f.managerTitle)}<br><b>${esc(f.managerName)}</b></div>`;
  return `<div class="doc">${dHead(ftx(F,"bismillah","بسمه تعالی"),num,R.reqDate)}
    <h1 class="d-title">${ftx(F,"title","تغییر امضاء حساب آموزشگاه")}</h1>
    <div class="d-sec"><h3>${ftx(F,"t1","گیرندهٔ نامه")}</h3><div class="d-fg c3">${dFl("بانک",esc(R.bankName))}${dFl("شعبه",esc(R.branch))}${dFl("نوع حساب","دولتی (سیبا)")}</div></div>
    <div class="d-sec"><h3>${ftx(F,"t2","مشخصات آموزشگاه")}</h3><div class="d-fg c3">${dFl("نام آموزشگاه",esc(S.name),"w2")}${dFl("کد آموزشگاه",faId(esc(S.code||"")))}${dFl("جنسیت",esc(S.gender||""))}${dFl("دوره تحصیلی",esc(S.level||""),"w2")}${dFl("شمارهٔ حساب",faId(esc(R.account||S.account||"")))}</div></div>
    <p class="d-p" style="margin-top:12px"><b>${ftx(F,"greet","با سلام و احترام")}</b></p>
    <p class="d-p">${ftx(F,"p1","خواهشمند است نسبت به تغییر امضاء حساب دولتی سیبا به نام {school} به حساب شماره {account} به شرح ذیل اقدام فرمایید.",V)}</p>
    <div class="d-sec"><h3>${ftx(F,"t3","امضاکنندگان حساب")}</h3><table class="d-tbl"><tr><th>ردیف</th><th>سمت</th><th>نام و نام خانوادگی</th><th>نوع امضاء</th></tr>
      ${rows.map((r,i)=>`<tr><td>${faId(i+1)}</td><td>${ftx(F,"r"+(i+1),r[0])}</td><td><b>${esc(r[1])}</b></td><td>${ftx(F,i?"vx":"fx",r[2])}</td></tr>`).join("")}</table></div>
    <div style="margin-top:22px">${dSigs(F,[coop,mgr])}</div>${dFoot()}</div>`;
}
function scPrintSig(R){
  const S=app.sc.items.find(x=>x.id===R.schoolId);if(!S){showAlert("آموزشگاه پیدا نشد.");return}
  printDoc("نامهٔ تغییر امضاء — "+S.name,()=>docSigChange(R,S),"sigchange",true,true);
}
async function scImport(f){
  try{
    const rows=await readWorkbookRows(f);if(rows.length<2){showAlert("فایل خالی است.");return}
    const heads=rows[0].map(scNorm),col={};
    SC_FIELDS.forEach(([k,t])=>{const names=[scNorm(t)].concat((SC_ALIAS[k]||[]).map(scNorm));let i=heads.findIndex(h=>h&&names[0]===h);if(i<0)i=heads.findIndex(h=>h&&names.includes(h));if(i>=0)col[k]=i});
    const ign=rows[0].map((h,i)=>[String(h==null?"":h).trim(),i]).filter(([h,i])=>h&&!Object.values(col).includes(i)).map(x=>x[0]);
    if(col.code==null||col.name==null){showAlert("ستون‌های «کد مدرسه» و «نام مدرسه» در سطر اول فایل پیدا نشد.");return}
    const list=rows.slice(1).filter(r=>String(r[col.code]==null?"":r[col.code]).trim()!=="").map(r=>{const o={};Object.keys(col).forEach(k=>{const v=r[col[k]];o[k]=v==null?"":(typeof v==="number"?String(v):String(v))});return o});
    if(!list.length){showAlert("ردیف دارای کد آموزشگاه پیدا نشد.");return}
    showConfirm(`${faId(list.length)} آموزشگاه در فایل است. آموزشگاه‌های موجود (هم‌کد) به‌روز و بقیه اضافه شوند؟`+(ign.length?` (ستون‌های نادیده‌گرفته‌شده: ${ign.join("، ")})`:""),async()=>{
      let c=0,u=0,er=0;const msgs=[];
      try{for(let i=0;i<list.length;i+=100){const r=await api("POST","/api/schools/import",{schools:list.slice(i,i+100)});c+=r.created;u+=r.updated;er+=r.errorCount||0;(r.errors||[]).forEach(m=>msgs.length<8&&msgs.push(m))}}catch(e){showAlert(e.message);return}
      await renderSchools();showAlert(`ورود از اکسل: ${faId(c)} جدید، ${faId(u)} به‌روزرسانی${er?`، ${faId(er)} ردیف رد شد`:""}.${msgs.length?"\n"+msgs.join("\n"):""}`);
    });
  }catch(e){showAlert(e.message)}
}
async function scExport(){
  const q=scNorm(app.sc.q),rows=app.sc.items.filter(x=>!q||scNorm([x.code,x.name,x.area,x.gender,x.level,scFull(x),x.managerCode,x.managerMobile,x.account,x.phone,x.address].join(" ")).includes(q));
  if(!rows.length){showAlert("موردی برای خروجی نیست.");return}
  await xlsxExport(`schools-${todayJalali().replace(/\//g,"-")}.xlsx`,"مدارس",SC_FIELDS.map(c=>c[1]),rows.map(x=>SC_FIELDS.map(([k])=>{const v=x[k];return v==null?"":(SC_TXT.has(k)?String(v):v)})),SC_FIELDS.map(([k])=>["address","notes"].includes(k)?40:k==="name"?26:16));
}
(function(){
  const R=$("#wk-schools");
  R.addEventListener("input",e=>{const t=e.target;if(t.id==="sc-q"){app.sc.q=t.value;scRows()}else if(t.id==="sc-sq"){app.sc.sq=t.value;scSigRows()}});
  R.addEventListener("change",e=>{if(e.target.id==="scFile"){const f=e.target.files[0];e.target.value="";if(f)scImport(f)}});
  R.addEventListener("click",async e=>{
    const S=app.sc,b=e.target.closest("[data-sc]"),row=e.target.closest("tr[data-scid],tr[data-sgid]");
    if(!b){
      if(row&&row.dataset.scid){const x=S.items.find(v=>v.id===+row.dataset.scid);if(x){S.cur={...x};scDraw()}}
      else if(row&&row.dataset.sgid){const x=S.sigs.find(v=>v.id===+row.dataset.sgid);if(x){S.sigSchool=S.items.find(v=>v.id===x.schoolId);S.sigCur={...x};S.cur=null;scDraw()}}
      return;
    }
    const a=b.dataset.sc,id=+b.dataset.id;
    try{
      if(a==="tab"){S.tab=b.dataset.t;S.cur=null;S.sigSchool=null;S.sigCur=null;S.tab==="sig"?scDrawSigTab():scDrawList()}
      else if(a==="new"){S.cur={id:0,...Object.fromEntries(SC_FIELDS.map(([k])=>[k,""])),classes:"",students:""};scDraw()}
      else if(a==="edit"){S.cur={...S.items.find(v=>v.id===id)};scDraw()}
      else if(a==="cancel"||a==="back"){S.cur=null;S.sigSchool=null;S.sigCur=null;S.tab==="sig"?scDrawSigTab():scDrawList()}
      else if(a==="xls")await scExport();
      else if(a==="fill-mgr"){const p=await scPerson(scVal("scf-managerCode"));if(p){$("#scf-managerFirst").value=p.firstName||"";$("#scf-managerLast").value=p.lastName||"";if(p.mobile)$("#scf-managerMobile").value=p.mobile}}
      else if(a==="save"){
        const o=scReadForm();
        if(!o.code||!o.name){showAlert("کد و نام آموزشگاه را وارد کنید.");return}
        if(o.account&&!/^\d{13}$/.test(o.account)){showAlert("شمارهٔ حساب باید دقیقاً ۱۳ رقم باشد.");return}
        const r=o.id?await api("PUT","/api/schools/"+o.id,o):await api("POST","/api/schools",o);
        await renderSchoolsKeep();S.cur=null;S.tab="list";scDrawList();showAlert("آموزشگاه ذخیره شد: "+r.name);
      }
      else if(a==="del"){showConfirm("این آموزشگاه همراه با سوابق تغییر امضاء‌اش حذف شود؟",async()=>{try{await api("DELETE","/api/schools/"+S.cur.id);await renderSchoolsKeep();S.cur=null;scDrawList()}catch(er){showAlert(er.message)}})}
      else if(a==="sig"){S.sigSchool=S.items.find(v=>v.id===id);S.sigCur=null;S.cur=null;scDraw()}
      else if(a==="sg-open"){const x=S.sigs.find(v=>v.id===id);S.sigSchool=S.items.find(v=>v.id===x.schoolId);S.sigCur={...x};S.cur=null;scDraw()}
      else if(a==="sg-new"){S.sigCur=null;scDrawSig()}
      else if(a==="sg-print"){const x=S.sigs.find(v=>v.id===id);if(x)scPrintSig(x)}
      else if(a==="sg-fill"){const w=b.dataset.w,p=await scPerson(scVal("sg-"+w+"Code"));if(p)$("#sg-"+w+"Name").value=((p.firstName||"")+" "+(p.lastName||"")).trim()}
      else if(a==="sg-save"||a==="sg-save-print"){
        const o=scReadSig();
        if(o.account&&!/^\d{13}$/.test(o.account)){showAlert("شمارهٔ حساب باید دقیقاً ۱۳ رقم باشد.");return}
        const r=S.sigCur&&S.sigCur.id?await api("PUT","/api/schools/sig-changes/"+S.sigCur.id,o):await api("POST","/api/schools/sig-changes",o);
        await renderSchoolsKeep();S.sigCur=S.sigs.find(v=>v.id===r.id)||r;scDraw();
        if(a==="sg-save-print")scPrintSig(S.sigCur);else showAlert("تغییر امضاء ذخیره شد.");
      }
      else if(a==="sg-del"){showConfirm("این ردیف تغییر امضاء حذف شود؟",async()=>{try{await api("DELETE","/api/schools/sig-changes/"+S.sigCur.id);await renderSchoolsKeep();S.sigCur=null;scDraw()}catch(er){showAlert(er.message)}})}
    }catch(er){showAlert(er.message)}
  });
})();
async function renderSchoolsKeep(){const a=await api("GET","/api/schools"),b=await api("GET","/api/schools/sig-changes");app.sc.items=a.items;app.sc.sigs=b.items;if(app.sc.sigSchool)app.sc.sigSchool=a.items.find(v=>v.id===app.sc.sigSchool.id)||app.sc.sigSchool}
