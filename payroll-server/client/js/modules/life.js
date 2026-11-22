"use strict";
/* modules/life.js — بیمه عمر
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("modules/life");
/* =============================== بیمه عمر =============================== */
const LIFE_TYPES={mosavab:"بیمه عمر مصوب",mokammel:"بیمه عمر مکمل"};
const LIFE_REL=["همسر","فرزند","پدر","مادر","برادر","خواهر","سایر"];
app.wk.life={cur:null,list:[],ben:null};
async function renderLife(selId,benId){
  const root=$("#wk-life"),p=app.wk.person;
  if(!p){root.innerHTML=pbar("life")+emptyMsg("برای ثبت بیمه عمر، ابتدا یک نفر را انتخاب کنید.");bindPbar("life",root);return}
  let list=[];
  try{list=(await api("GET","/api/life/by-person/"+enc(p.code))).items}catch(e){showAlert(e.message)}
  app.wk.life.list=list;
  const cur=selId?list.find(x=>x.id===selId):null;app.wk.life.cur=cur||null;
  const ben=cur&&benId?cur.beneficiaries.find(x=>x.id===benId):null;app.wk.life.ben=ben||null;
  const P=cur||{insType:"mosavab",chequeSerial:"",chequeDate:"",description:""};
  const sumAct=cur?cur.beneficiaries.filter(x=>(!ben||x.id!==ben.id)).reduce((s,x)=>s+x.sharePercent,0):0;
  const B=ben||{firstName:"",lastName:"",nationalId:"",idNumber:"",issuePlace:"",relation:"همسر",sharePercent:Math.max(0,Math.round((100-sumAct)*100)/100)||"",description:"",active:true,amount:null,account:"",bank:""};
  const totalAct=cur?cur.beneficiaries.reduce((s,x)=>s+x.sharePercent,0):0;
  root.innerHTML=pbar("life")+`
  <div class="card"><h2><svg class="i"><use href="#i-file"/></svg>بیمه عمر ${cur?`<span class="badge b-blue">شمارهٔ ${faId(cur.number)}</span>`:`<span class="badge b-green">بیمه‌نامهٔ جدید</span>`}</h2>
    <div class="fgrid">
      <label class="f">نوع بیمه<select id="li-type">${Object.entries(LIFE_TYPES).map(([v,t])=>`<option value="${v}"${P.insType===v?" selected":""}>${t}</option>`).join("")}</select></label>
      <label class="f">شمارهٔ سریال چک<input id="li-chq" class="ltr" value="${esc(P.chequeSerial)}" maxlength="50"></label>
      <label class="f">تاریخ چک صادره<input id="li-chqd" class="ltr" placeholder="1402/03/11" value="${esc(P.chequeDate)}"></label>
      <label class="f" style="grid-column:1/-1">توضیحات (زیر فرم چاپ می‌شود)<input id="li-desc" value="${esc(P.description)}" maxlength="255"></label>
    </div>
    <div class="wk-acts"><button class="btn btn-main" data-act="li-save"><svg class="i"><use href="#i-file"/></svg>ذخیره</button>
      <button class="btn" data-act="li-new">جدید</button>${cur?`<button class="btn btn-del" data-act="li-del">حذف</button>`:""}</div>
    <div class="tbl-wrap u-mt12">${list.length?`<table class="tbl"><thead><tr><th>شمارهٔ بیمه عمر</th><th>نوع بیمه عمر</th><th>سریال چک</th><th>تاریخ چک</th><th>تاریخ ثبت</th><th>کاربر ثبت‌کننده</th><th>استفاده‌کنندگان</th></tr></thead><tbody>
      ${list.map(x=>`<tr class="clk${cur&&cur.id===x.id?" selrow":""}" data-lid="${x.id}"><td>${faId(x.number)}</td><td>${LIFE_TYPES[x.insType]||""}</td><td>${faId(esc(x.chequeSerial))}</td><td>${faId(esc(x.chequeDate))}</td><td>${faId(esc(x.regDate))}</td><td>${esc(x.createdBy)}</td><td>${faId(x.beneficiaries.length)}</td></tr>`).join("")}</tbody></table>`:`<div class="hint">هنوز بیمه عمری برای این فرد ثبت نشده است.</div>`}</div></div>
  ${cur?`<div class="card u-mt14"><h2><svg class="i"><use href="#i-users"/></svg>مشخصات استفاده‌کنندگان از سرمایه — بیمه شمارهٔ ${faId(cur.number)} ${ben?`<span class="badge b-blue">ویرایش</span>`:`<span class="badge b-green">استفاده‌کنندهٔ جدید</span>`}</h2>
    <div class="fgrid">
      <label class="f">نام<input id="bn-fn" value="${esc(B.firstName)}" maxlength="100"></label>
      <label class="f">نام خانوادگی<input id="bn-ln" value="${esc(B.lastName)}" maxlength="100"></label>
      <label class="f">کد ملی<input id="bn-nid" class="ltr" value="${esc(B.nationalId)}" maxlength="20"></label>
      <label class="f">شمارهٔ شناسنامه<input id="bn-idn" class="ltr" value="${esc(B.idNumber)}" maxlength="20"></label>
      <label class="f">محل صدور<input id="bn-place" value="${esc(B.issuePlace)}" maxlength="100"></label>
      <label class="f">نسبت با بیمه‌شده<select id="bn-rel">${LIFE_REL.concat(B.relation&&!LIFE_REL.includes(B.relation)?[B.relation]:[]).map(r=>`<option${B.relation===r?" selected":""}>${esc(r)}</option>`).join("")}</select></label>
      <label class="f">درصد سهم از سرمایه<input id="bn-share" class="ltr" inputmode="decimal" value="${B.sharePercent}"></label>
      <label class="f span2">توضیحات<input id="bn-desc" value="${esc(B.description)}" maxlength="255"></label>
      <label class="f">مبلغ (ریال)<input id="bn-amt" class="ltr" inputmode="numeric" data-money value="${B.amount==null?"":mnum(B.amount)}"></label>
      <label class="f">شمارهٔ حساب / شبا<input id="bn-acc" class="ltr" value="${esc(B.account)}" maxlength="50"></label>
      <label class="f">بانک مقصد<input id="bn-bank" value="${esc(B.bank)}" maxlength="100"></label>
    </div>
    <div class="hint u-m-6-0">جمع درصد سهم استفاده‌کنندگان: <b>${faId(Math.round(totalAct*100)/100)}٪</b>${cur.beneficiaries.length&&Math.abs(totalAct-100)>0.001?` <span class="u-c-red-ink">— جمع باید ۱۰۰٪ باشد</span>`:""}</div>
    <div class="wk-acts"><button class="btn btn-main" data-act="bn-save"><svg class="i"><use href="#i-file"/></svg>ذخیره</button>
      <button class="btn" data-act="bn-new">جدید</button>${ben?`<button class="btn btn-del" data-act="bn-del">حذف</button>`:""}<span class="sp"></span>
      <button class="btn btn-blue" data-act="bn-print"><svg class="i"><use href="#i-print"/></svg>فرم استفاده‌کنندگان</button>
      <button class="btn" data-act="bn-claim">پرداخت غرامت</button></div>
    <div class="tbl-wrap u-mt12">${cur.beneficiaries.length?`<table class="tbl"><thead><tr><th>نام</th><th>نام خانوادگی</th><th>کد ملی</th><th>محل صدور</th><th>درصد سهم</th><th>تاریخ</th></tr></thead><tbody>
      ${cur.beneficiaries.map(x=>`<tr class="clk${ben&&ben.id===x.id?" selrow":""}" data-bid="${x.id}"><td>${esc(x.firstName)}</td><td>${esc(x.lastName)}</td><td>${faId(esc(x.nationalId))}</td><td>${esc(x.issuePlace)}</td><td>${faId(x.sharePercent)}</td><td>${faId(esc(x.regDate))}</td></tr>`).join("")}</tbody></table>`:`<div class="hint">هنوز استفاده‌کننده‌ای ثبت نشده است (در این حالت وراث قانونی ذینفع‌اند).</div>`}</div></div>`:`<div class="hint u-mt12">برای ثبت استفاده‌کنندگان، یک بیمه‌نامه را از جدول بالا انتخاب (یا ذخیره) کنید.</div>`}`;
  bindPbar("life",root);
}
async function lifeAction(b){
  const act=b.dataset.act,L=app.wk.life,p=app.wk.person,cur=L.cur,ben=L.ben;
  try{
    if(act==="li-new"){renderLife();return}
    if(act==="li-save"){
      const body={insType:val("li-type"),chequeSerial:lat(val("li-chq")).trim(),chequeDate:lat(val("li-chqd")).trim(),description:val("li-desc").trim()};
      let id;
      if(cur){await api("PATCH","/api/life/"+cur.id,body);id=cur.id}
      else{const r=await api("POST","/api/life",Object.assign({code:p.code,regDate:todayJalali()},body));id=r.id}
      await renderLife(id);return;
    }
    if(act==="li-del"&&cur){showConfirm(`بیمه عمر شمارهٔ ${cur.number} و همهٔ استفاده‌کنندگانش حذف شود؟`,async()=>{try{await api("DELETE","/api/life/"+cur.id);await renderLife()}catch(e){showAlert(e.message)}});return}
    if(act==="bn-new"){renderLife(cur&&cur.id);return}
    if(act==="bn-save"&&cur){
      const body={firstName:val("bn-fn").trim(),lastName:val("bn-ln").trim(),nationalId:lat(val("bn-nid")).trim(),idNumber:lat(val("bn-idn")).trim(),issuePlace:val("bn-place").trim(),relation:val("bn-rel"),
        sharePercent:lat(val("bn-share")).trim(),description:val("bn-desc").trim(),amount:val("bn-amt").trim(),account:lat(val("bn-acc")).trim(),bank:val("bn-bank").trim()};
      let id;
      if(ben){await api("PATCH","/api/life/beneficiaries/"+ben.id,body);id=ben.id}
      else{const r=await api("POST","/api/life/"+cur.id+"/beneficiaries",Object.assign({regDate:todayJalali()},body));id=r.id}
      await renderLife(cur.id,id);return;
    }
    if(act==="bn-del"&&ben){showConfirm(`«${ben.firstName} ${ben.lastName}» از استفاده‌کنندگان حذف شود؟`,async()=>{try{await api("DELETE","/api/life/beneficiaries/"+ben.id);await renderLife(cur.id)}catch(e){showAlert(e.message)}});return}
    if(act==="bn-print"&&cur){printDoc("بیمه عمر "+cur.number+" — "+pname(p),()=>docLife(p,cur),cur.insType==="mokammel"?"lifeB":"lifeA",true,"a4");return}
    if(act==="bn-claim"&&cur){printDoc("پرداخت غرامت بیمه عمر "+cur.number+" — "+pname(p),()=>docLifeClaim(p,cur),"lifeClaim",true,"a4");return}
  }catch(err){showAlert(err.message)}
}
// فرم تعیین استفاده از سرمایه بیمه عمر (نمونهٔ ارسالی)
function docLife(p,pol){ app.docCtx=p;
  const mk=pol.insType==="mokammel",F=mk?"lifeB":"lifeA",f=FS();
  const bens=pol.beneficiaries;
  const blank=`<span class="d-dots"></span>`;
  return `<div class="doc a4">${dHead(ftx(F,"bismillah","بسمه تعالی"),String(pol.number),pol.regDate)}
    <h1 class="d-title">${ftx(F,"title",mk?"بیمه عمر مکمل":"بیمه عمر مصوب")}</h1>
    <div style="text-align:center;font-weight:700">${ftx(F,"org","سازمان امور اداری و استخدامی کشور")}</div>
    <div style="text-align:center;margin-top:2px">${ftx(F,"sub",mk?"فرم تعیین استفاده از سرمایه بیمه عمر مکمل":"فرم تعیین استفاده از سرمایه بیمه عمر موضوع مصوبه ۵۰۲۴ت۲۵۳ مورخ ۱۳۶۷/۴/۱۱ هیئت محترم وزیران")}</div>
    <div class="d-fg c3" style="margin-top:6px">${dFl("شمارهٔ قرارداد گروهی بیمه عمر","")}${dFl("بیمه‌گذار",ftx(F,"holder","اداره کل آموزش و پرورش استان قزوین"))}${dFl("بیمه‌گر",ftx(F,"insurer","شرکت بیمه"))}</div>
    <div class="d-sec"><h3>الف : ${ftx(F,"hA","مشخصات بیمه‌شده")}</h3>
      <div class="d-fg c3">${dFl("نام و نام خانوادگی",esc(pname(p)),"w2")}${dFl("شمارهٔ شناسنامه",faId(esc(p.idNumber||"")))}
        ${dFl("تاریخ تولد",faId(esc(fmtDate8(p.birthDate||""))))}${dFl("محل تولد",esc(p.birthPlace||""))}${dFl("کد ملی",faId(esc(p.nationalId||"")))}
        ${dFl("کد پرسنلی",faId(esc(p.code)))}${dFl("جنسیت",esc(p.gender||""))}${dFl("وضعیت تأهل",esc(p.maritalStatus||""))}
        ${dFl("شهر محل خدمت",ftx(F,"city","قزوین"))}${dFl("ناحیه یا منطقه",ftx(F,"zone","ناحیه یک"))}${dFl("تلفن همراه",faId(esc(p.mobile||"")))}</div></div>
    <div class="d-sec"><h3>ب : ${ftx(F,"hB","تعهدات قرارداد")}</h3><div>${ftx(F,"cB","فوت به هر علت با سرمایه {blank}",{blank})}</div></div>
    <div class="d-sec"><h3>ج : ${ftx(F,"hC","استفاده‌کنندگان از سرمایه در صورت فوت")}</h3>
      <table class="d-tbl"><tr><th>نام و نام خانوادگی</th><th>شمارهٔ شناسنامه</th><th>کد ملی</th><th>محل صدور</th><th>نسبت با بیمه‌شده</th><th>درصد سهم از سرمایه</th></tr>
      ${bens.map(x=>`<tr><td>${esc((x.firstName+" "+x.lastName).trim())}</td><td>${faId(esc(x.idNumber))}</td><td>${faId(esc(x.nationalId))}</td><td>${esc(x.issuePlace)}</td><td>${esc(x.relation)}</td><td>${faId(x.sharePercent)}</td></tr>`).join("")||`<tr><td colspan="6">&nbsp;</td></tr>`}</table></div>
    <div class="d-note">${ftx(F,"note","توجه: در صورتی‌که استفاده‌کننده معرفی نشده باشد، وراث قانونی ذینفع خواهند بود.")}</div>
    ${dSigs(F,[`<div class="d-sig hl">${ftx(F,"s1","امضاء بیمه‌شده")}</div>`,`<div class="d-sig">${ftx(F,"mgr","{mgrName}\n{mgrTitle}",{mgrName:`<b>${esc(f.managerName)}</b>`,mgrTitle:esc(f.managerTitle)})}</div>`],"margin-top:8px")}
    <div style="margin-top:6px">${ftx(F,"descL","توضیحات :")} ${esc(pol.description||"")}</div>${dFoot()}</div>`;
}
// فرم پرداخت غرامت (نمونه‌ای ساده: فهرست استفاده‌کنندگان فعال با مبلغ و حساب)
function docLifeClaim(p,pol){ app.docCtx=p;
  const F="lifeClaim",f=FS(),bens=pol.beneficiaries;
  const total=bens.reduce((s,x)=>s+(x.amount||0),0);
  return `<div class="doc tight">${dHead(ftx(F,"bismillah","بسمه تعالی"),String(pol.number),todayJalali())}
    <h1 class="d-title">${ftx(F,"title","فرم پرداخت غرامت بیمه عمر")}</h1>
    <p class="d-p">${ftx(F,"p1","غرامت بیمه عمر آقای/خانم {name} با کد پرسنلی {code} ({ins}، شمارهٔ {num}) به شرح جدول زیر به استفاده‌کنندگان از سرمایه پرداخت شود.",{name:esc(pname(p)),code:faId(esc(p.code)),ins:LIFE_TYPES[pol.insType]||"",num:faId(pol.number)})}</p>
    <table class="d-tbl"><tr><th>ردیف</th><th>نام و نام خانوادگی</th><th>کد ملی</th><th>سهم٪</th><th>مبلغ (ریال)</th><th>شمارهٔ حساب / شبا</th><th>بانک</th></tr>
    ${bens.map((x,i)=>`<tr><td>${faId(i+1)}</td><td>${esc((x.firstName+" "+x.lastName).trim())}</td><td>${faId(esc(x.nationalId))}</td><td>${faId(x.sharePercent)}</td><td>${x.amount==null?"":fa(x.amount)}</td><td><span dir="ltr">${faId(esc(x.account))}</span></td><td>${esc(x.bank)}</td></tr>`).join("")||`<tr><td colspan="7">&nbsp;</td></tr>`}
    <tr><th colspan="4">جمع کل</th><th>${fa(total)}</th><th colspan="2"></th></tr></table>
    ${dSigs(F,[`<div class="d-sig">${ftx(F,"s1","کارشناس تعاون")}</div>`,`<div class="d-sig">${ftx(F,"s2","حسابداری")}</div>`,`<div class="d-sig">${esc(f.managerTitle)}<br><b>${esc(f.managerName)}</b></div>`],"margin-top:12px")}${dFoot()}</div>`;
}

