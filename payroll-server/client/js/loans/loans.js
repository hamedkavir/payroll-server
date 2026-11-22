"use strict";
/* loans/loans.js — ثبت وام و افزایش سرمایه/تسویه
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("loans/loans");
/* =============================== وام =============================== */
async function renderLoan(selId){
  if(selId===undefined&&app.wk.loanOpen)selId=app.wk.loanOpen;   // از صفحهٔ نوبت‌دهی با کلیک روی نوبت
  app.wk.loanOpen=null;
  if(selId)app.wk.loanTab="loan";
  const root=$("#wk-loanform"),p=app.wk.person;
  if(!p){root.innerHTML=pbar("loanform")+emptyMsg("برای ثبت یا مشاهدهٔ وام، ابتدا یک نفر را انتخاب کنید.");bindPbar("loanform",root);return}
  if(app.wk.loanTab==="cap"){await renderCapInc(root,p);return}
  root.oninput=null;root.onchange=null;
  let loans=[];
  try{loans=(await api("GET","/api/loan-queue/by-person/"+enc(p.code))).items}catch(e){showAlert(e.message)}
  app.wk.loans=loans;
  const cur=selId?loans.find(x=>x.id===selId):null;
  app.wk.loan=cur||null;
  const last=loans[0];
  // سرمایهٔ پیش‌فرض = آخرین «مانده» کد ۷۹۶ (صندوق وام ضروری) در آخرین فیش حقوقی فرد
  // «آخرین سرمایه (آخرین فیش)» همیشه خوانده می‌شود، حتی وقتی نوبتی انتخاب شده است
  let capR=null;try{capR=await api("GET","/api/loan-queue/capital/"+enc(p.code))}catch(e){}
  let sc=null;if(!cur){try{sc=await api("GET","/api/loan-queue/slip-codes/"+enc(p.code))}catch(e){}}
  app.wk.slip710=sc&&sc.found?sc:null;app.wk.ok710=false;
  const pendL=loans.find(x=>x.status==="pending");
  const L=cur||{loanNumber:"",requestDate:todayJalali(),capital:(capR&&capR.capital!=null)?capR.capital:(last?last.capital:0),loanAmount:0,installmentMonths:36,installmentAmount:0,dueMonth:dueFromRequest(todayJalali()).month,dueYear:dueFromRequest(todayJalali()).year,status:"pending",notes:""};
  if(!cur&&L.capital>0){const r0=calcLoan(L.capital,36);L.loanAmount=r0.loan;L.installmentAmount=r0.inst}
  const rd=(v,t)=>`<label><input type="radio" name="ln-st" value="${v}"${L.status===v?" checked":""}>${t}</label>`;
  const sp0=app.wk.slip710,r1=sp0&&sp0.cLoan&&sp0.cLoan.remaining>0?sp0.cLoan:null,r2=sp0&&sp0.cLoan2&&sp0.cLoan2.remaining>0?sp0.cLoan2:null;
  const kcx=(sp0&&sp0.codes)||KCP(p);
  root.innerHTML=loanTabsHtml()+pbar("loanform")+((r1||r2)?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb12">⚠ وام قبلی تسویه نشده است: در آخرین فیش (${MONTHS[app.wk.slip710.month-1]} ${faId(app.wk.slip710.year)}) ${[r1?`مانده وام ضروری (کد ${faId(kcx.loan1)}) ${fa(r1.remaining)} ریال (قسط ${fa(r1.installment)})`:"",r2?`مانده وام ضروری ۲ (کد ${faId(kcx.loan2)}) ${fa(r2.remaining)} ریال (قسط ${fa(r2.installment)})`:""].filter(Boolean).join(" و ")} است. در صورت نیاز می‌توانید وام جدید را ثبت کنید.</div>`:"")+(p.membershipCancelDate?`<div class="pf-msg u-bg-red-soft u-c-red-ink u-mb12">⚠ عضویت ${esc(pname(p))} در صندوق وام ضروری در تاریخ ${faId(esc(p.membershipCancelDate))} لغو شده است${p.membershipCancelAmount!=null?` (مبلغ تسویه: ${fa(p.membershipCancelAmount)} ریال)`:""}.</div>`:"")+(!cur&&pendL?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb12">⚠ برای ${esc(pname(p))} نوبت وام قبلاً ثبت شده است (نوبت دریافت: ${faId(pendL.dueYear)}/${faId(String(pendL.dueMonth).padStart(2,"0"))}). تا دریافت یا لغو آن، وام جدید ثبت نمی‌شود؛ برای تغییر، همان وام را از فهرست پایین انتخاب و ویرایش کنید.</div>`:"")+`
  <div class="card"><h2><svg class="i"><use href="#i-coins"/></svg>${cur?"ویرایش وام":"وام جدید"} <span class="badge b-blue">${cur?faId(esc(cur.loanNumber)):"شماره پس از ذخیره"}</span> ${cur&&cur.source==="auto"?'<span class="badge b-amber">ثبت‌شده از فایل اقساط</span>':""}</h2>
    <div class="fgrid">
      <label class="f">تاریخ درخواست<input id="ln-date" class="ltr" value="${esc(L.requestDate||"")}" placeholder="1405/07/07"></label>
      <label class="f">سرمایهٔ اولیه (ریال)<input id="ln-cap" data-money value="${mnum(L.capital)}"></label>
      <label class="f">آخرین سرمایه${capR&&capR.month?` (${MONTHS[capR.month-1]} ${faId(capR.year)})`:" (آخرین فیش)"}<input id="ln-lastcap" class="ltr" readonly value="${capR&&capR.capital!=null?mnum(capR.capital):"—"}"></label>
      <label class="f">مبلغ وام (ریال)<input id="ln-amt" data-money data-money-step="10000000" title="فلش بالا/پایین: ±۱۰٬۰۰۰٬۰۰۰ ریال" value="${L.loanAmount?mnum(L.loanAmount):""}"></label>
      <label class="f">تعداد اقساط<input id="ln-months" type="number" min="1" max="120" value="${L.installmentMonths}"></label>
      <label class="f">مبلغ هر قسط (ریال)<input id="ln-inst" data-money value="${L.installmentAmount?mnum(L.installmentAmount):""}"></label>
      <label class="f">ماه دریافت وام<select id="ln-dm">${MONTHS.map((m,i)=>`<option value="${i+1}"${L.dueMonth===i+1?" selected":""}>${m}</option>`).join("")}</select></label>
      <label class="f">سال دریافت وام<input id="ln-dy" type="number" value="${L.dueYear}"></label>
      <label class="f span2">توضیحات<input id="ln-notes" value="${esc(L.notes||"")}" maxlength="500"></label>
    </div>
    <h3 class="u-m-14-0-6 u-fs14">مشخصات ضامن (در فرم دریافت وام چاپ می‌شود)</h3>
    <div class="fgrid">
      <label class="f">کد پرسنلی ضامن<input id="ln-gcode" class="ltr" value="${esc(L.gCode||"")}"></label>
      <label class="f">نام و نام خانوادگی ضامن<input id="ln-gname" value="${esc(L.gName||"")}" maxlength="120"></label>
      <label class="f">کد ملی ضامن<input id="ln-gnid" class="ltr" inputmode="numeric" value="${esc(L.gNationalId||"")}"></label>
      <label class="f">تاریخ تولد ضامن<input id="ln-gbirth" class="ltr" value="${esc(L.gBirthDate||"")}" placeholder="1370/05/20"></label>
      <label class="f">شماره همراه ضامن<input id="ln-gmob" class="ltr" inputmode="numeric" value="${esc(L.gMobile||"")}"></label>
      <label class="f">محل خدمت ضامن<input id="ln-gwork" value="${esc(L.gWorkplace||"")}" maxlength="150"></label>
    </div>
    <div class="radios"><b>وضعیت وام:</b>${rd("pending","در انتظار نوبت")}${rd("received","دریافت کرده")}${rd("cancelled","انصراف")}</div>
    <div class="wk-sum" id="ln-sum"></div>
    <p class="hint u-m-10-0-0">مبلغ وام را می‌توانید دستی بنویسید یا با «محاسبه با فرمول» از روی سرمایه پر کنید (طبق «تنظیمات ← پارامترهای فرمول وام» و «گرد کردن مبالغ»)؛ ماه و سال دریافت وام هم با مدت انتظار تنظیم می‌شود. مبلغ قسط تا وقتی دستی عوض نکنید خودکار حساب می‌شود.</p>
    <div class="wk-acts">
      <button class="btn btn-main" data-act="save"><svg class="i"><use href="#i-file"/></svg>ذخیره</button>
      <button class="btn" data-act="new">وام جدید</button>
      <button class="btn" data-act="calc">محاسبه با فرمول</button>
      ${cur?`<button class="btn btn-del" data-act="del" data-lid="${cur.id}" title="حذف کامل این ردیف وام">حذف وام</button>`:""}

      <span class="sp"></span>
      <button class="btn btn-amber" data-act="notice"><svg class="i"><use href="#i-print"/></svg>ذخیره و چاپ اطلاعیهٔ نوبت<span class="kbd">F4</span></button>
      <button class="btn btn-blue" data-act="receipt"><svg class="i"><use href="#i-print"/></svg>ذخیره و چاپ فرم دریافت وام<span class="kbd">F5</span></button>
    </div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>وام‌های ${esc(pname(p))}</h2>
    ${loans.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>شمارهٔ وام</th><th>تاریخ درخواست</th><th>سرمایه</th><th>مبلغ وام</th><th>اقساط</th><th>قسط</th><th>نوبت دریافت</th><th>وضعیت</th><th></th></tr></thead><tbody>
    ${loans.map(x=>`<tr class="clk${cur&&cur.id===x.id?" selrow":""}" data-lid="${x.id}"><td>${faId(esc(x.loanNumber))}</td><td>${faId(esc(x.requestDate))}</td><td>${fa(x.capital)}</td><td class="money">${fa(x.loanAmount)}</td><td>${faId(x.installmentMonths)}</td><td>${fa(x.installmentAmount)}${x.installmentMonths>1&&lastOfInst(x.loanAmount,x.installmentAmount,x.installmentMonths)!==x.installmentAmount?` <small class="hint">(آخر: ${fa(lastOfInst(x.loanAmount,x.installmentAmount,x.installmentMonths))})</small>`:""}</td><td>${MONTHS[x.dueMonth-1]} ${faId(x.dueYear)}</td><td>${stB(ST_LOAN,x.status)}</td><td><button class="btn btn-del" data-act="del" data-lid="${x.id}">حذف</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">هنوز وامی برای این فرد ثبت نشده است.</div>`}</div>`;
  bindPbar("loanform",root);lnSummary();
}
function lnSummary(){
  const el=$("#ln-sum");if(!el)return;
  const a=toNum(val("ln-amt")),n=parseInt(lat(val("ln-months")),10)||0,i=toNum(val("ln-inst"));
  const k=i>0?Math.min(n,Math.ceil(a/i)):n;
  el.innerHTML=a>0&&n>0&&i>0?`<div>مبلغ هر قسط<b>${fa(i)}</b></div><div class="big">قسط آخر (قسط ${faId(k)}ام)<b>${fa(lastOfInst(a,i,n))}</b></div>`+(k<n?`<div class="u-bg-amber-soft u-c-amber-ink">با این قسط، وام در ${faId(k)} قسط تمام می‌شود</div>`:""):"";
}
function loanFromForm(){
  const p=app.wk.person;
  return{code:p.code,requestDate:lat(val("ln-date")).trim(),capital:toNum(val("ln-cap")),loanAmount:toNum(val("ln-amt")),
    installmentMonths:parseInt(lat(val("ln-months")),10)||0,installmentAmount:toNum(val("ln-inst")),
    dueMonth:parseInt(val("ln-dm"),10),dueYear:parseInt(lat(val("ln-dy")),10),notes:val("ln-notes").trim(),
    gCode:lat(val("ln-gcode")).trim(),gName:val("ln-gname").trim(),gNationalId:lat(val("ln-gnid")).replace(/\D/g,""),gBirthDate:lat(val("ln-gbirth")).trim(),gMobile:lat(val("ln-gmob")).replace(/\D/g,""),gWorkplace:val("ln-gwork").trim(),
    status:(document.querySelector('input[name="ln-st"]:checked')||{}).value||"pending"};
}
async function saveLoan(){
  const f=loanFromForm(),cur=app.wk.loan;
  if(cur){
    await api("PATCH","/api/loan-queue/"+cur.id,{requestDate:f.requestDate,capital:f.capital,loanAmount:f.loanAmount,installmentMonths:f.installmentMonths,installmentAmount:f.installmentAmount,dueMonth:f.dueMonth,dueYear:f.dueYear,notes:f.notes,status:f.status,gCode:f.gCode,gName:f.gName,gNationalId:f.gNationalId,gBirthDate:f.gBirthDate,gMobile:f.gMobile,gWorkplace:f.gWorkplace});
    return cur.id;
  }
  const r=await api("POST","/api/loan-queue",f);
  if(f.status!=="pending")await api("PATCH","/api/loan-queue/"+r.id,{status:f.status});
  return r.id;
}
async function loanApplyPending(){
  // اعمال پارامترهای فعلی روی نوبت‌های در انتظار (مبلغ، قسط و ماه نوبت). نوبت‌های دستی فقط با تیک جابه‌جا می‌شوند.
  const wait=FS().loanWaitMonths;
  const w=openDlg({title:"اعمال روی نوبت‌های در انتظار",okText:"اعمال",html:`<p class="u-m0b10 u-lh1-9">با پارامترهای فعلی (مدت انتظار <b>${faId(wait)}</b> ماه):<br>• مبلغ وام و قسط همهٔ نوبت‌های «در انتظار» دوباره حساب می‌شود.<br>• ماه نوبت = ماه اتمام قسط + ${faId(wait)} ماه (مثلاً شهریور ۱۴۰۵ با ۱۰ ماه ← تیر ۱۴۰۶).</p>
      <label class="u-flex u-gap6 u-ai-center"><input type="checkbox" id="lp-manual"> نوبت‌های ثبت‌شدهٔ دستی هم جابه‌جا شوند (ماه نوبت بر اساس تاریخ درخواستشان)</label>`,
    onOk:async()=>{
      const r=await api("POST","/api/loan-queue/recompute-pending",{includeManual:$("#lp-manual").checked});
      showAlert(`${faId(r.updated)} نوبت به‌روز شد؛ ماهِ نوبتِ ${faId(r.shifted)} نفر جابه‌جا شد.`);
      if(app.page==="loanform")await renderLoan(app.wk.loan?app.wk.loan.id:undefined);
    }});
  return w;
}
/* فرم افزایش سرمایه / تسویه وام (نامه به کارشناسی تعاون) */
function docCapital(p,C){ app.docCtx=p;
  const F="capital",emp=p.status==="بازنشسته"?"بازنشسته":"شاغل",kind=C.kind===2?"تسویه وام":C.kind===3?"عضویت":"افزایش سرمایه";
  const V={name:esc(pname(p)),code:faId(esc(p.code)),emp,amount:rial(C.amount),kind,slip:faId(esc(C.slipNo||""))};
  return `<div class="doc">${dHead(ftx(F,"bismillah","بسمه تعالی"),"",C.date)}
    <h1 class="d-title">${ftx(F,"title","فرم {kind}",V)}</h1>
    <div style="font-weight:700">${ftx(F,"to","به کارشناسی محترم تعاون آموزش و پرورش ناحیه یک قزوین")}</div>
    <p class="d-p">${ftx(F,"p1","با سلام و احترام؛ اینجانب {name} با کد پرسنلی {code} نیروی {emp} نسبت به مبلغ {amount} بابت {kind} با شمارهٔ فیش {slip} اقدام فرمایید.",V)}</p>
    <div class="d-fg c3" style="margin-top:8px">${dFl("تاریخ",faId(esc(C.date)))}${dFl(C.kind===2?"سرمایه":"سرمایهٔ قبلی",C.capital!=null?rial(C.capital):"—")}${C.kind===2?"":dFl("سرمایهٔ جدید",C.newCapital!=null?rial(C.newCapital):"—")}${dFl("مانده وام ۱",rial(C.loan1||0))}${dFl("مانده وام ۲",rial(C.loan2||0))}</div>
    ${dSigs(F,[`<div class="d-sig hl">${ftx(F,"s1","امضاء")}</div>`])}${dFoot()}</div>`;
}

/* ---------- تب «افزایش سرمایه / تسویه وام» در صفحهٔ ثبت وام ---------- */
const CAP_KIND={1:"افزایش سرمایه",2:"تسویه وام",3:"عضویت"};
function loanTabsHtml(){const t=app.wk.loanTab==="cap"?"cap":"loan";return `<div class="rp-tabs"><button data-act="tab-loan"${t==="loan"?' class="on"':""}>ثبت وام</button><button data-act="tab-cap"${t==="cap"?' class="on"':""}>عملیات وام</button></div>`}
async function renderCapInc(root,p,selId){
  let d={items:[],snapshot:null,current:null,codes:KC()};
  try{d=await api("GET","/api/capital-increase/by-person/"+enc(p.code))}catch(e){showAlert(e.message)}
  app.wk.cap=d;
  const sel=selId?d.items.find(x=>x.id===selId):null;app.wk.capSel=sel||null;
  const sn=d.snapshot,cd=d.codes||KC();
  const X=sel||{kind:1,date:todayJalali(),amount:"",slipNo:""};
  const pend=d.pending&&!(sel&&d.pending.id===sel.id)?d.pending:null;
  const sum=sn?`<div class="wk-sum"><span>سرمایه (کد ${faId(esc(cd.capital))}): <b>${fa(pend?pend.newCapital:sn.capital.remaining)}</b>${pend?' <span class="badge b-green">سرمایهٔ جدید</span>':""}</span><span>قسط سرمایه: <b>${fa(sn.capital.installment)}</b></span><span>مانده وام ۱: <b>${fa(sn.loan1.remaining)}</b></span>${cd.loan2?`<span>مانده وام ۲: <b>${fa(sn.loan2.remaining)}</b></span>`:""}<span class="badge b-blue">آخرین فیش: ${MONTHS[sn.month-1]} ${faId(sn.year)}</span></div>`:`<div class="hint u-mt10">برای این فرد فیش حقوقی پیدا نشد؛ افزایش سرمایه بدون فیش ثبت نمی‌شود (تسویه وام ممکن است).</div>`;
  const rows=d.items.map(x=>`<tr data-act="cap-pick" data-lid="${x.id}"${sel&&sel.id===x.id?' class="sel"':""}><td>${x.prevCapital!=null?fa(x.prevCapital):"—"}</td><td>${fa(x.amount)}</td><td>${x.kind!==2&&x.newCapital!=null?fa(x.newCapital):"—"}</td><td>${faId(esc(x.date))}</td><td>${faId(esc(x.slipNo))}</td><td>${CAP_KIND[x.kind]||""}</td><td>${x.changeId?(x.changeClosed?'<span class="badge b-green">بسته‌شده</span>':'<span class="badge b-amber">در تغییرات ماهانه</span>'):'<span class="badge b-red">بدون ردیف تغییر</span>'}</td></tr>`).join("");
  root.innerHTML=loanTabsHtml()+pbar("loanform")+`<div class="card"><h2><svg class="i"><use href="#i-coins"/></svg>عملیات وام ${sel?'<span class="badge b-blue">ویرایش ردیف</span>':""}</h2>${sum}
    <div class="cap-form">
      <label class="f">تاریخ<input id="cp-date" class="ltr" value="${esc(X.date||"")}" placeholder="1405/07/21"></label>
      <label class="f">نوع<select id="cp-kind"><option value="1"${X.kind===1?" selected":""}>افزایش سرمایه</option><option value="2"${X.kind===2?" selected":""}>تسویه وام</option><option value="3"${X.kind===3?" selected":""}>عضویت</option></select></label>
      <label class="f">مبلغ (ریال)<input id="cp-amt" class="ltr" data-money inputmode="numeric" value="${X.amount?mnum(X.amount):""}"></label>
      <label class="f">شمارهٔ فیش<input id="cp-slip" class="ltr" inputmode="numeric" maxlength="30" value="${esc(X.slipNo||"")}"></label>
    </div>
    <div class="cap-prev" id="cp-prev"></div>
    <div class="wk-acts">
      <button class="btn btn-main" data-act="cap-save"><svg class="i"><use href="#i-file"/></svg>ذخیره<span class="kbd">F4</span></button>
      <button class="btn" data-act="cap-new">جدید</button>
      <button class="btn btn-blue" data-act="cap-print"><svg class="i"><use href="#i-print"/></svg>چاپ فرم<span class="kbd">F5</span></button>
      <button class="btn btn-del" data-act="cancelmem" title="کسر آخرین مانده وام (${faId(esc(cd.loan1))}) از سرمایه (${faId(esc(cd.capital))})، ثبت تاریخ لغو عضویت، ایجاد دو ردیف «حذف» در تغییرات ماهانه و چاپ فرم انصراف و تسویه حساب">لغو عضویت${p.membershipCancelDate?` <small>(${faId(esc(p.membershipCancelDate))})</small>`:""}</button>
      ${sel?`<button class="btn btn-del" data-act="cap-del">حذف</button>`:""}
    </div></div>
    <div class="card"><h2><svg class="i"><use href="#i-file"/></svg>سوابق عملیات وام</h2>${d.items.length?`<div class="tbl-wrap"><table class="tbl cap-tbl"><thead><tr><th>سرمایهٔ قبلی</th><th>مبلغ پرداختی</th><th>سرمایهٔ جدید</th><th>تاریخ</th><th>شمارهٔ فیش</th><th>نوع</th><th>تغییرات ماهانه</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint u-m-8-0-0">برای ویرایش یا حذف، روی ردیف کلیک کنید. با ویرایش/حذف، ردیف مربوط در «تغییرات ماهانه» هم به‌روز/حذف می‌شود (تا وقتی «بسته» نشده باشد).</p>`:'<div class="hint">هنوز چیزی ثبت نشده است.</div>'}</div>`;
  bindPbar("loanform",root);
  root.oninput=capPreview;root.onchange=capChange;
  capPreview();
}
function capKindNow(){const e=$("#cp-kind");return e?(+e.value||1):1}
function capChange(e){
  if(e&&e.target&&e.target.id==="cp-kind"&&capKindNow()===2){
    const sn=(app.wk.cap||{}).snapshot,a=$("#cp-amt");
    if(a&&!toNum(a.value)&&sn&&sn.loan1.remaining>0)a.value=mnum(sn.loan1.remaining);   // تسویه: پیش‌فرض = مانده وام
  }
  capPreview();
}
function capPhase(date,ctx){
  const before=((ctx&&ctx.closings)||[]).filter(c=>c.closeDate<date),c=before[before.length-1]||null;
  if(!c)return{phase:"B",c:null};
  const per=((ctx&&ctx.periods)||[]).find(x=>x.year===c.year&&x.month===c.month);
  return{phase:!per||date<per.created?"A":"B",c,per};
}
function capPreview(){
  const el=$("#cp-prev");if(!el)return;
  const d=app.wk.cap||{},sn=d.snapshot,cd=d.codes||KC(),ctx=d.ctx||{},date=lat(val("cp-date")).trim(),amt=toNum(val("cp-amt")),k=capKindNow();
  let h;
  if(k===2)h=`در «تغییرات ماهانه» برای کد ${faId(esc(cd.loan1))} (وام ضروری ۱) یک ردیف <b>حذف</b> ثبت می‌شود.`;
  else if(k===3)h=`در «تغییرات ماهانه» برای کد ${faId(esc(cd.capital))} یک ردیف <b>ایجاد</b> ثبت می‌شود: کل و مانده <b>${fa(amt)}</b> (= مبلغ)، قسط = سهم صندوق <b>${fa(ctx.fundShare||0)}</b>.`;
  else if(!sn||!sn.capital.has)h=`<span class="bad">در آخرین فیش، کد سرمایه (${faId(esc(cd.capital))}) پیدا نشد؛ افزایش سرمایه ثبت نمی‌شود. برای عضو جدید «عضویت» را انتخاب کنید.</span>`;
  else{
    const pend=d.pending&&!(app.wk.capSel&&d.pending.id===app.wk.capSel.id)?d.pending:null,ph=capPhase(date,ctx);
    const base=pend?pend.newCapital:sn.capital.remaining,share=ph.phase==="A"&&!pend?(ctx.fundShare||0):0,v=base+amt+share;
    const M=ph.c?`${MONTHS[ph.c.month-1]} ${faId(ph.c.year)}`:"";
    h=`سرمایهٔ فعلی <b>${fa(base)}</b> + مبلغ پرداختی <b>${fa(amt)}</b>${share?` + سهم صندوق <b>${fa(share)}</b>`:""} = سرمایهٔ جدید <b>${fa(v)}</b> ریال. در «تغییرات ماهانه» برای کد ${faId(esc(cd.capital))} یک ردیف <b>اصلاح</b> ثبت می‌شود: قسط <b>${fa(sn.capital.installment)}</b>، کل و مانده <b>${fa(v)}</b> — `+(pend?"بعد از افزایش سرمایهٔ قبلی که هنوز در فیش نیامده.":ph.phase==="A"?`تاریخ بعد از بستن حقوق ${M} و قبل از ایجاد دورهٔ ${M} است (با سهم صندوق).`:ph.c?`تاریخ بعد از ایجاد دورهٔ ${M} است (بدون سهم صندوق).`:"بستنی قبل از این تاریخ ثبت نشده است (بدون سهم صندوق).");
  }
  el.innerHTML=h;
}
function capRead(){return{kind:capKindNow(),date:lat(val("cp-date")).trim(),amount:toNum(val("cp-amt")),slipNo:lat(val("cp-slip")).trim()}}
async function capAction(act,lid){
  const p=app.wk.person,root=$("#wk-loanform");if(!p)return;
  if(act==="cap-new"){await renderCapInc(root,p);return}
  if(act==="cap-pick"){await renderCapInc(root,p,+lid);return}
  if(act==="cap-del"){
    const s=app.wk.capSel;if(!s)return;
    showConfirm(`ردیف ${CAP_KIND[s.kind]} (فیش ${faId(s.slipNo)}) و ردیف مربوط در «تغییرات ماهانه» حذف شود؟`,async()=>{
      try{await api("DELETE","/api/capital-increase/"+s.id);await renderCapInc(root,p);showAlert("ردیف حذف شد.")}catch(e){showAlert(e.message)}
    });
    return;
  }
  try{
    const b=capRead(),s=app.wk.capSel,cd=(app.wk.cap&&app.wk.cap.codes)||KCP(p);
    const same=s&&s.kind===b.kind&&s.date===b.date&&s.amount===Math.round(b.amount)&&s.slipNo===b.slipNo;
    let rec=s&&same?s:null,msg="";
    if(!rec){
      const r=s?await api("PATCH","/api/capital-increase/"+s.id,b):await api("POST","/api/capital-increase",Object.assign({code:p.code},b));
      msg=b.kind===2?`ثبت شد. در «تغییرات ماهانه» برای کد ${faId(cd.loan1)} ردیف «حذف» ایجاد شد.`:b.kind===3?`عضویت ثبت شد. در «تغییرات ماهانه» برای کد ${faId(cd.capital)} ردیف «ایجاد» با کل و مانده ${fa(r.changeValue)} ریال ایجاد شد.`:`ثبت شد. سرمایهٔ جدید ${fa(r.newCapital)} ریال؛ در «تغییرات ماهانه» برای کد ${faId(cd.capital)} ردیف «اصلاح» با کل و مانده ${fa(r.changeValue)} ریال ایجاد شد.`;
      await renderCapInc(root,p,r.id);rec=app.wk.capSel;
    }
    if(act==="cap-save"){showAlert(msg||"این ردیف قبلاً ذخیره شده و تغییری نکرده است.");return}
    if(!rec)return;
    const C={date:rec.date,kind:rec.kind,amount:rec.amount,slipNo:rec.slipNo,capital:rec.prevCapital,newCapital:rec.newCapital,loan1:rec.loan1Remaining,loan2:rec.loan2Remaining};
    printDoc((CAP_KIND[rec.kind]||"فرم")+" — "+pname(p),()=>docCapital(p,C),"capital");
  }catch(err){showAlert(err.message)}
}
async function loanAction(act,lid){
  const p=app.wk.person;if(!p)return;
  if(act==="tab-loan"||act==="tab-cap"){app.wk.loanTab=act==="tab-cap"?"cap":"loan";renderLoan();return}
  if(act.startsWith("cap-")){await capAction(act,lid);return}
  if(act==="new"){renderLoan();return}
  if(act==="del"){
    const id=+lid||(app.wk.loan&&app.wk.loan.id);if(!id)return;
    const x=(app.wk.loans||[]).find(l=>l.id===id);
    showConfirm(`ردیف وام${x?" شمارهٔ "+faId(x.loanNumber||x.id):""} برای همیشه حذف شود؟ این کار قابل بازگشت نیست.`,async()=>{
      try{await api("DELETE","/api/loan-queue/"+id+"/permanent");app.wk.loan=null;await renderLoan();showAlert("ردیف وام حذف شد.")}catch(e){showAlert(e.message)}
    });
    return;
  }
  if(act==="cancelmem"){await cancelMembership();return}
  if(act==="calc"){
    const cap=toNum(val("ln-cap")),m=parseInt(lat(val("ln-months")),10)||36;
    if(cap<=0){showAlert("ابتدا سرمایهٔ اولیه را وارد کنید.");return}
    const r=calcLoan(cap,m);$("#ln-amt").value=mnum(r.loan);$("#ln-inst").value=mnum(r.inst);$("#ln-inst").dataset.touched="";
    const d=dueFromRequest(lat(val("ln-date")).trim());$("#ln-dm").value=d.month;$("#ln-dy").value=d.year;   // نوبت = تاریخ درخواست + مدت انتظار
    lnSummary();return;
  }
  if(!app.wk.loan&&app.wk.slip710&&app.wk.slip710.cLoan.remaining>0&&!app.wk.ok710){
    const s7=app.wk.slip710;
    showConfirm(`وام قبلی تسویه نشده است: مانده وام ضروری (کد ${faId((s7.codes||KCP(app.wk.person)).loan1)}) در آخرین فیش ${fa(s7.cLoan.remaining)} ریال است. با این حال وام جدید ثبت شود؟`,()=>{app.wk.ok710=true;loanAction(act)});
    return;
  }
  try{
    const id=await saveLoan();
    await renderLoan(id);
    if(act==="save"){app.pfMsg="";showAlert("وام ذخیره شد.");return}
    const x=app.wk.loans.find(l=>l.id===id);
    const L={code:p.code,person:p,loanNumber:x.loanNumber,requestDate:x.requestDate,capital:x.capital,loanAmount:x.loanAmount,months:x.installmentMonths,installment:x.installmentAmount,dueMonth:x.dueMonth,dueYear:x.dueYear,curCapital:null,gCode:x.gCode,gName:x.gName,gNationalId:x.gNationalId,gBirthDate:x.gBirthDate,gMobile:x.gMobile,gWorkplace:x.gWorkplace};
    if(act==="receipt"){try{const c=await api("GET","/api/loan-queue/capital/"+enc(p.code));if(c&&c.capital!=null){L.curCapital=c.capital;L.curCapY=c.year;L.curCapM=c.month}}catch(_){}}
    if(act==="notice")printDoc("اطلاعیهٔ نوبت وام — "+pname(p),()=>docNotice(p,L),"notice");
    else printDoc("فرم دریافت وام — "+pname(p),()=>docReceipt(p,L),"receipt");
  }catch(err){showAlert(err.message)}
}
function loanInput(e){
  if(app.wk.loanTab==="cap")return;
  const id=e.target.id;setTimeout(lnSummary,0);
  if(id==="ln-inst"){e.target.dataset.touched="1";return}
  if(id==="ln-amt"||id==="ln-months"){
    const inst=$("#ln-inst");if(inst.dataset.touched)return;
    const a=toNum(val("ln-amt")),m=parseInt(lat(val("ln-months")),10)||0;
    inst.value=a>0&&m>0?mnum(round6(a/m)):"";setTimeout(lnSummary,0);
  }
}

