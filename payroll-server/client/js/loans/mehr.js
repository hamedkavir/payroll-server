"use strict";
/* loans/mehr.js — وام بانک مهر
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("loans/mehr");
/* =============================== وام بانک مهر =============================== */
// مشخصات وام و وام‌گیرنده، مشخصات ضامن، تاییدیهٔ حسابداری؛ مبلغ و اقساط دستی است و هیچ فرمول وام صندوق (سرمایه، نوبت، سقف) اعمال نمی‌شود.
app.wk.mall={from:"",to:"",status:"all",acc:"all",q:"",items:[],page:1,size:50};
const ST_ACC={pending:["در انتظار تأیید","b-amber"],approved:["تأیید شده","b-green"],rejected:["رد شده","b-red"]};
const ST_MH={pending:["در نوبت","b-amber"],paid:["دریافت شده","b-green"],failed:["دریافت نشده","b-red"],cancelled:["لغو شده","b-dark"]};
// روش کارمزد (مصوب ۱۳۸۸): قسط ۱، ۱۳، ۲۵ ... فقط کارمزد؛ مبلغ هر قسط اصل = وام ÷ (تعداد اقساط − اقساط کارمزد)
const mhInstOf=(a,n)=>a>0&&n>=1?Math.round(a/mhPc(n)):0;
const mhLast=(a,i,n)=>a>0&&i>0&&n>=1?Math.max(0,Math.round(a-i*(mhPc(n)-1))):0;
async function renderMehr(selId){
  if(!selId&&app.wk.mhOpen)selId=app.wk.mhOpen;if(selId)setWkTab("mehr","form");app.wk.mhOpen=0;
  const root=$("#wk-mehr"),p=app.wk.person;
  if(wkTab("mehr")==="rep"){root.innerHTML=pageTabs("mehr")+mhAllHTML();mhAllLoad();return}
  if(wkTab("mehr")==="rec"){root.innerHTML=pageTabs("mehr")+mhRecHTML();mhRecInit();return}
  if(wkTab("mehr")==="stat"){root.innerHTML=pageTabs("mehr")+mhStatHTML();mhStatLoad();return}
  if(wkTab("mehr")==="chg"){root.innerHTML=pageTabs("mehr")+mhChgHTML();mhChgLoad();return}
  if(!p){root.innerHTML=pageTabs("mehr")+pbar("mehr")+emptyMsg("برای ثبت وام بانک مهر، ابتدا یک نفر را انتخاب کنید.");bindPbar("mehr",root);return}
  let list=[];
  try{list=(await api("GET","/api/mehr-loans/by-person/"+enc(p.code))).items}catch(e){showAlert(e.message)}
  app.wk.mhList=list;
  const cur=selId?list.find(x=>x.id===selId):null;app.wk.mh=cur||null;
  const uname=(app.user&&(app.user.fullName||app.user.username))||"";
  const M=cur||{requestDate:todayJalali(),loanAmount:0,installments:12,installmentAmount:0,lastInstallmentAmount:0,mehrAccount:String(p.mehrAccount||"").trim(),phone:p.mobile||"",
    gName:"",gNationalId:"",gCode:"",gBirthDate:"",gMobile:"",gWorkplace:"",accStatus:"pending",accDate:"",accBy:"",accNote:"",description:"",status:"pending",turnDate:"",receivedDate:"",failReason:""};
  const pendM=list.find(x=>x.status==="pending");
  root.innerHTML=pageTabs("mehr")+pbar("mehr")+(!cur&&pendM?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb12">ℹ برای ${esc(pname(p))} وام بانک مهر در تاریخ ${faId(esc(pendM.requestDate))} به مبلغ ${fa(pendM.loanAmount)} ریال ثبت شده و هنوز «دریافت شده» نشده است.</div>`:"")+(!String(p.mehrAccount||"").trim()&&!cur?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb12">ℹ «شمارهٔ حساب بانک مهر» این فرد در فرم پرسنلی (بخش بانک) ثبت نشده است؛ می‌توانید همین‌جا وارد کنید.</div>`:"")+`
  <div class="card u-mb14"><h2><svg class="i"><use href="#i-coins"/></svg>شارژ ماهانهٔ بانک مهر — <span id="mh-chm">…</span></h2>
    <div class="wk-sum u-m0b8" id="mh-chsum"></div>
    <p class="hint u-m-6-0-0">ماه شارژ از «نوبت (ماه و سال)» تعیین می‌شود (اگر خالی بود از تاریخ درخواست)؛ هر وامِ «در نوبت» یا «دریافت‌شده» از شارژ همان ماه کم می‌شود. برای تعیین یا تغییر شارژ ماه‌ها به تب «شارژ ماهانه» بروید.</p></div>
  <div class="card"><h2><svg class="i"><use href="#i-wallet"/></svg>${cur?"ویرایش وام بانک مهر":"وام بانک مهر"} — مشخصات وام و وام‌گیرنده ${cur?stB(ST_MH,cur.status):""}</h2>
    <div class="wk-sum u-m0b10"><div>کد ملی<b>${faId(esc(p.nationalId||"—"))}</b></div><div>محل خدمت<b>${esc(p.workplace||"—")}</b></div><div>وضعیت<b>${esc(p.status||"—")}</b></div></div>
    <div class="fgrid">
      <label class="f">تاریخ درخواست<input id="mh-date" class="ltr" value="${esc(M.requestDate)}" placeholder="1405/07/07"></label>
      <label class="f">نوبت (ماه و سال)<span class="u-flex u-gap6"><select id="mh-turn-m" class="u-f1-4"><option value="">— ماه —</option>${MONTHS.map((n,i)=>{const v=String(i+1).padStart(2,"0");return `<option value="${v}"${String(M.turnDate||"").slice(5,7)===v?" selected":""}>${n}</option>`}).join("")}</select><input id="mh-turn-y" class="ltr u-f1" inputmode="numeric" maxlength="4" placeholder="1405" value="${esc(String(M.turnDate||"").slice(0,4))}"></span></label>
      <label class="f">تاریخ دریافت<input id="mh-recv" class="ltr" value="${esc(M.receivedDate||"")}" placeholder="1405/08/20"></label>
      <label class="f">شمارهٔ حساب بانک مهر<input id="mh-acc" class="ltr" inputmode="numeric" value="${esc(M.mehrAccount||"")}"></label>
      <label class="f">تلفن تماس<input id="mh-phone" class="ltr" value="${esc(M.phone||"")}"></label>
      <label class="f">مبلغ وام (ریال)<input id="mh-amt" class="ltr" inputmode="numeric" autocomplete="off" data-money value="${M.loanAmount?mnum(M.loanAmount):""}"></label>
      <label class="f">تعداد کل اقساط (با اقساط کارمزد)<input id="mh-n" type="number" min="1" max="240" value="${M.installments}"></label>
      <label class="f">مبلغ هر قسط اصل (ریال)<input id="mh-inst" class="ltr" data-money value="${M.installmentAmount?mnum(M.installmentAmount):""}"></label>
      <label class="f">مبلغ قسط آخر اصل (ریال)<input id="mh-last" class="ltr" data-money value="${M.lastInstallmentAmount?mnum(M.lastInstallmentAmount):""}" title="خودکار: مبلغ وام − قسط اصل × (تعداد اقساط اصل − ۱)"></label>
      <label class="f">درصد کارمزد<input id="mh-fee" type="number" step="0.1" min="0" max="100" value="${M.feePercent!=null?M.feePercent:4}" title="کارمزد هر سال = درصد × مانده اصل در ابتدای همان سال؛ در قسط ۱، ۱۳، ۲۵ ... گرفته می‌شود"></label>
      <label class="f span2">توضیحات<input id="mh-desc" value="${esc(M.description||"")}" maxlength="255"></label>
    </div>
    <div class="wk-sum" id="mh-sum"></div>
    <p class="hint u-m-8-0-0">روش کارمزد (مصوب ۱۳۸۸): هر سال ۱۱ ماه اصل وام و یک قسط (قسط ۱، ۱۳، ۲۵ و ...) فقط کارمزد است؛ مثلاً وام ۳۶ ماهه = ۳۳ قسط اصل + ۳ قسط کارمزد و مبلغ هر قسط اصل = کل وام ÷ ۳۳. کارمزد هر سال = درصد کارمزد (پیش‌فرض ۴٪) × مانده اصل در ابتدای همان سال. مبلغ قسط و قسط آخر تا وقتی دستی تغییر ندهید خودکار حساب می‌شود.</p></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-user"/></svg>مشخصات ضامن</h2>
    <div class="fgrid">
      <label class="f">کد پرسنلی ضامن<input id="mh-gcode" class="ltr" value="${esc(M.gCode||"")}"></label>
      <label class="f">نام و نام خانوادگی ضامن<input id="mh-gname" value="${esc(M.gName||"")}" maxlength="120"></label>
      <label class="f">کد ملی ضامن<input id="mh-gnid" class="ltr" inputmode="numeric" value="${esc(M.gNationalId||"")}"></label>
      <label class="f">تاریخ تولد ضامن<input id="mh-gbirth" class="ltr" value="${esc(M.gBirthDate||"")}" placeholder="1370/05/20"></label>
      <label class="f">شماره همراه ضامن<input id="mh-gmob" class="ltr" inputmode="numeric" value="${esc(M.gMobile||"")}"></label>
      <label class="f">محل خدمت ضامن<input id="mh-gwork" value="${esc(M.gWorkplace||"")}" maxlength="150"></label>
    </div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-file"/></svg>تاییدیهٔ حسابداری ${stB(ST_ACC,M.accStatus)}</h2>
    <div class="fgrid">
      <label class="f">وضعیت تاییدیه<select id="mh-accst">${Object.entries(ST_ACC).map(([k,v])=>`<option value="${k}"${M.accStatus===k?" selected":""}>${v[0]}</option>`).join("")}</select></label>
      <label class="f">تاریخ تاییدیه<input id="mh-accdate" class="ltr" value="${esc(M.accDate||"")}" placeholder="1405/07/07"></label>
      <label class="f">تأییدکننده (حسابدار)<input id="mh-accby" value="${esc(M.accBy||"")}" maxlength="100" data-uname="${esc(uname)}"></label>
      <label class="f span2">توضیح حسابداری<input id="mh-accnote" value="${esc(M.accNote||"")}" maxlength="255"></label>
    </div>
    <div class="wk-acts">
      <button class="btn btn-main" data-act="mh-save"><svg class="i"><use href="#i-file"/></svg>ذخیره<span class="kbd">F4</span></button>
      <button class="btn" data-act="mh-new">جدید</button>
      ${cur?`<button class="btn btn-del" data-act="mh-del">حذف</button>`:""}
      <button class="btn" data-act="mh-refresh" title="اطلاعات فرد و سوابق را دوباره از سرور می‌خواند">بهنگام</button>
      <span class="sp"></span>
      <button class="btn btn-blue" data-act="mh-saveprint"><svg class="i"><use href="#i-print"/></svg>ذخیره و چاپ فرم<span class="kbd">F5</span></button>
    </div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>سوابق وام بانک مهر ${esc(pname(p))}</h2>
    ${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>تاریخ درخواست</th><th>نوبت</th><th>دریافت</th><th>مبلغ وام</th><th>اقساط</th><th>ضامن</th><th>تاییدیه حسابداری</th><th>وضعیت</th><th></th></tr></thead><tbody>
    ${list.map(x=>`<tr class="clk${cur&&cur.id===x.id?" selrow":""}" data-mid="${x.id}"><td>${faId(esc(x.requestDate))}</td><td>${mhTurnTxt(x.turnDate)}</td><td>${faId(esc(x.receivedDate||"—"))}</td><td class="money">${fa(x.loanAmount)}</td><td>${instTxt(x.installments,x.installmentAmount,x.lastInstallmentAmount)}</td><td>${esc(x.gName||"—")}</td><td>${stB(ST_ACC,x.accStatus)}</td><td>${stB(ST_MH,x.status)}${x.failReason?` <small class="hint">${esc(x.failReason)}</small>`:""}</td>
      <td><div class="wk-tbl-act"><button class="btn" data-act="mh-print" data-id="${x.id}">چاپ</button>${mhStSel(x)}<button class="btn btn-del" data-act="mh-delrow" data-id="${x.id}">حذف</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">هنوز وام بانک مهری برای این فرد ثبت نشده است.</div>`}</div>`;
  bindPbar("mehr",root);mhSummary();mhChargeLoad();
  if(app.wk.focusId){wkFocus(app.wk.focusId);app.wk.focusId=""}
}
function mhSummary(){
  const el=$("#mh-sum");if(!el)return;
  const a=toNum(val("mh-amt")),n=parseInt(lat(val("mh-n")),10)||0,i=toNum(val("mh-inst")),l=toNum(val("mh-last"))||mhLast(a,i,n);
  const pc=n>0?mhPc(n):0,pf=parseFloat(lat(val("mh-fee"))),pct=Number.isFinite(pf)?pf:4;
  el.innerHTML=`<div>مبلغ وام<b>${a?fa(a):"—"}</b></div><div>تعداد کل اقساط<b>${n?faId(n):"—"}</b></div><div>اقساط اصل<b>${n&&i?faId(pc)+" × "+fa(i):"—"}</b></div><div>قسط آخر اصل<b>${l?fa(l):"—"}</b></div><div class="big">اقساط کارمزد (${faId(pct)}٪)<b>${n&&a&&i?mhFeeAmts(a,i,n,pct).map(x=>"قسط "+faId(x.no)+": "+fa(x.amount)).join(" ، "):"—"}</b></div>`;
}
function mhInput(e){
  const id=e.target.id;
  if(id==="mh-last")e.target.dataset.touched="1";
  if(id==="mh-inst")e.target.dataset.touched="1";
  if(id==="mh-amt"||id==="mh-n"){
    const inst=$("#mh-inst"),a=toNum(val("mh-amt")),n=parseInt(lat(val("mh-n")),10)||0;
    if(inst&&!inst.dataset.touched){const v=mhInstOf(a,n);inst.value=v?mnum(v):""}
  }
  if(id!=="mh-last"){
    const last=$("#mh-last");
    if(last&&!last.dataset.touched){const a=toNum(val("mh-amt")),n=parseInt(lat(val("mh-n")),10)||0,i=toNum(val("mh-inst")),v=mhLast(a,i,n);last.value=v?mnum(v):""}
  }
  mhSummary();if(id==="mh-amt")mhChargePreview();
}
function mhAccChange(){
  const st=val("mh-accst"),d=$("#mh-accdate"),by=$("#mh-accby");
  if(st!=="pending"){if(d&&!d.value.trim())d.value=todayJalali();if(by&&!by.value.trim())by.value=by.dataset.uname||""}
}
// با وارد کردن کد پرسنلی ضامن، مشخصاتش (در صورت وجود در کارگزینی و خالی‌بودن خانه‌ها) پر می‌شود؛ pre = پیشوند شناسه‌ها (mh یا ln)
async function fillGuarantor(pre){
  const c=lat(val(pre+"-gcode")).trim();if(!c)return;
  try{
    const g=await api("GET","/api/personnel/"+enc(c));
    const set=(id,v)=>{const el=$("#"+id);if(el&&!el.value.trim()&&v)el.value=v};
    set(pre+"-gname",[g.firstName,g.lastName].filter(Boolean).join(" "));set(pre+"-gnid",g.nationalId||"");set(pre+"-gbirth",fmtDate8(g.birthDate||""));set(pre+"-gmob",g.mobile||"");set(pre+"-gwork",g.workplace||"");
  }catch(_){/* ضامن لزوماً در کارگزینی نیست؛ دستی وارد شود */}
}
const mhGuarantorFill=()=>fillGuarantor("mh");
function mhBody(){
  return{requestDate:lat(val("mh-date")).trim(),mehrAccount:lat(val("mh-acc")).replace(/\D/g,""),phone:lat(val("mh-phone")).trim(),
    loanAmount:toNum(val("mh-amt")),installments:parseInt(lat(val("mh-n")),10)||1,installmentAmount:toNum(val("mh-inst")),lastInstallmentAmount:toNum(val("mh-last")),
    description:val("mh-desc").trim(),turnDate:mhTurnVal(),receivedDate:lat(val("mh-recv")).trim(),gName:val("mh-gname").trim(),gNationalId:lat(val("mh-gnid")).replace(/\D/g,""),gCode:lat(val("mh-gcode")).trim(),
    gBirthDate:lat(val("mh-gbirth")).trim(),gMobile:lat(val("mh-gmob")).replace(/\D/g,""),gWorkplace:val("mh-gwork").trim(),
    feePercent:(()=>{const f=parseFloat(lat(val("mh-fee")));return Number.isFinite(f)?f:4})(),accStatus:val("mh-accst"),accDate:lat(val("mh-accdate")).trim(),accBy:val("mh-accby").trim(),accNote:val("mh-accnote").trim()};
}
async function saveMehr(){
  const p=app.wk.person,cur=app.wk.mh,body=mhBody();
  if(!body.mehrAccount)throw new Error("شمارهٔ حساب بانک مهر را وارد کنید.");
  if(!(body.loanAmount>0))throw new Error("مبلغ وام را وارد کنید.");
  let id;
  if(cur){await api("PATCH","/api/mehr-loans/"+cur.id,body);id=cur.id}
  else id=(await api("POST","/api/mehr-loans",Object.assign({code:p.code},body))).id;
  p.mehrAccount=body.mehrAccount;   // سرور شمارهٔ حساب فرم پرسنلی را هم به‌روز کرده است
  return id;
}
async function printMehr(M){
  const p=app.wk.person;if(!p||!M)return;
  printDoc("فرم وام بانک مهر — "+pname(p),()=>docMehr(p,M),"mehr",true,"a4");
}
function mhTurnVal(){const m=val("mh-turn-m"),y=lat(val("mh-turn-y")).replace(/\D/g,"");return m&&/^\d{4}$/.test(y)?`${y}/${m}`:""}
function mhYm(){const t=mhTurnVal()||lat(val("mh-date")).trim();return /^\d{4}\/\d{2}/.test(t)?t.slice(0,7):""}
const mhTurnTxt=t=>t?mhYmLbl(String(t).slice(0,7)):"—";
const mhYmLbl=ym=>/^\d{4}\/\d{2}$/.test(ym)?`${MONTHS[+ym.slice(5)-1]} ${faId(ym.slice(0,4))}`:ym;
// شارژ ماهانه: هر وام ثبت‌شده (در نوبت/دریافت‌شده) از شارژ ماهِ تاریخ نوبتش کم می‌شود
async function mhChargeLoad(){
  const box=$("#mh-chsum");if(!box)return;
  const ym=mhYm();app.wk.mhCh=null;app.wk.mhAfter=null;
  if(!ym){box.innerHTML=`<div class="hint">برای نمایش شارژ، «تاریخ نوبت» (یا تاریخ درخواست) را به‌صورت 1405/08/15 وارد کنید.</div>`;return}
  try{app.wk.mhCh=await api("GET","/api/mehr-loans/charges?ym="+enc(ym))}catch(e){box.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  const inp=$("#mh-chamt");if(inp&&document.activeElement!==inp)inp.value=app.wk.mhCh.amount?mnum(app.wk.mhCh.amount):"";
  const m=$("#mh-chm");if(m)m.textContent=mhYmLbl(ym);
  mhChargePreview();
}
function mhChargePreview(){
  const c=app.wk.mhCh,box=$("#mh-chsum");if(!c||!box)return;
  const cur=app.wk.mh,amt=toNum(val("mh-amt")),counted=cur&&(cur.status==="pending"||cur.status==="paid")&&String(cur.turnDate||cur.requestDate).slice(0,7)===c.ym;
  const delta=counted?amt-cur.loanAmount:amt,after=c.remaining-delta;app.wk.mhAfter=amt>0?after:null;
  box.innerHTML=`<div>شارژ ماه<b>${c.set?fa(c.amount):"تعیین نشده"}</b></div><div>مصرف‌شده (${faId(c.count)} وام)<b>${fa(c.used)}</b></div><div>باقی‌مانده<b style="color:${c.remaining<0?"#dc2626":"inherit"}">${c.set?fa(c.remaining):"—"}</b></div>${amt>0?`<div class="big">پس از این وام<b style="color:${after<0?"#dc2626":"inherit"}">${c.set?fa(after):"—"}</b></div>`:""}`;
}
function mhAllHTML(){
  const a=app.wk.mall;
  const opt=(arr,v)=>arr.map(([x,t])=>`<option value="${x}"${v===x?" selected":""}>${t}</option>`).join("");
  return `<div class="card u-mt14"><h2><svg class="i"><use href="#i-users"/></svg>وام بانک مهرِ همهٔ افراد (فیلتر و گزارش)</h2>
  <div class="fgrid">
    <label class="f">تاریخ بر اساس<select id="ma-by">${opt([["request","تاریخ درخواست"],["turn","تاریخ نوبت"],["received","تاریخ دریافت"]],a.by||"request")}</select></label>
    <label class="f">از تاریخ<input id="ma-from" class="ltr" placeholder="1405/07/01" value="${esc(a.from)}"></label>
    <label class="f">تا تاریخ<input id="ma-to" class="ltr" placeholder="1405/07/30" value="${esc(a.to)}"></label>
    <label class="f">وضعیت<select id="ma-st">${opt([["all","همه"],["pending","در نوبت"],["paid","دریافت‌شده"],["failed","دریافت‌نشده"],["cancelled","لغوشده"]],a.status)}</select></label>
    <label class="f">تاییدیه حسابداری<select id="ma-acc">${opt([["all","همه"],["pending","در انتظار تأیید"],["approved","تأیید شده"],["rejected","رد شده"]],a.acc)}</select></label>
    <label class="f span2">جست‌وجو (نام یا کد پرسنلی)<input id="ma-q" value="${esc(a.q)}"></label>
  </div>
  <div class="wk-acts"><button class="btn btn-main" data-act="ma-filter">اعمال فیلتر</button>
    <button class="btn btn-amber" data-act="ma-bulkpaid">تغییر فیلترشده‌ها از «در نوبت» به «دریافت شده»</button><span class="sp"></span>
    <button class="btn btn-blue" data-act="ma-xlsx">خروجی اکسل</button></div>
  <div id="ma-body" class="u-mt12"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
}
const maQs=a=>`status=${enc(a.status)}&acc=${enc(a.acc)}&by=${enc(a.by||"request")}`+(a.from?`&from=${enc(a.from)}`:"")+(a.to?`&to=${enc(a.to)}`:"")+(a.q?`&q=${enc(a.q)}`:"");
async function mhFetchAll(){return (await api("GET","/api/mehr-loans?"+maQs(app.wk.mall)+"&all=1")).items}
async function mhAllLoad(){
  const a=app.wk.mall,body=$("#ma-body");if(!body)return;
  let r;
  try{r=await api("GET","/api/mehr-loans?"+maQs(a)+`&page=${a.page||1}&pageSize=${a.size||50}`)}catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  if(r.total&&r.page>r.pages){a.page=r.pages;return mhAllLoad()}
  a.items=r.items;a.meta=r;
  body.innerHTML=r.total?`<div class="wk-sum u-m0b10"><div>تعداد<b>${faId(r.total)}</b></div><div class="big">جمع مبلغ وام<b>${fa(r.sums.amount)}</b></div></div>
    ${pagerHTML("mh",a.meta)}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>نام و نام خانوادگی</th><th>درخواست</th><th>نوبت</th><th>دریافت</th><th>شماره حساب مهر</th><th>مبلغ وام</th><th>اقساط</th><th>ضامن</th><th>تاییدیه</th><th>وضعیت / علت</th><th></th></tr></thead><tbody>
    ${a.items.map(x=>`<tr><td>${faId(esc(x.code))}</td><td>${esc(x.name)}</td><td>${faId(esc(x.requestDate))}</td><td>${mhTurnTxt(x.turnDate)}</td><td>${faId(esc(x.receivedDate||"—"))}</td><td>${faId(esc(x.mehrAccount))}</td><td class="money">${fa(x.loanAmount)}</td><td>${instTxt(x.installments,x.installmentAmount,x.lastInstallmentAmount)}</td><td>${esc(x.gName||"—")}</td><td>${stB(ST_ACC,x.accStatus)}</td><td>${stB(ST_MH,x.status)}${x.failReason?` <small class="hint">${esc(x.failReason)}</small>`:""}</td>
      <td><div class="wk-tbl-act">${mhStSel(x)}<button class="btn" data-act="mh-open" data-code="${esc(x.code)}" data-id="${x.id}">باز کردن</button><button class="btn btn-del" data-act="mh-delrow" data-id="${x.id}">حذف</button></div></td></tr>`).join("")}</tbody></table></div>${pagerHTML("mh",a.meta)}`
    :`<div class="hint">وام بانک مهری با این فیلتر پیدا نشد.</div>`;
}
function readMaFilter(){
  const a=app.wk.mall,re=/^\d{4}\/\d{2}\/\d{2}$/;
  const f=lat(val("ma-from")).trim(),t=lat(val("ma-to")).trim();
  if((f&&!re.test(f))||(t&&!re.test(t)))throw new Error("تاریخ‌ها را به‌صورت 1405/07/01 وارد کنید.");
  a.from=f;a.to=t;a.by=val("ma-by");a.status=val("ma-st");a.acc=val("ma-acc");a.q=val("ma-q").trim();a.page=1;
}
async function mhExport(){
  const items=await mhFetchAll();
  if(!items.length){showAlert("وام بانک مهری برای خروجی در فهرست نیست.");return}
  const H=["پرسنلی","کد ملی","نام","نام خانوادگی","وضعیت (شاغل/بازنشسته)","محل خدمت","تاریخ درخواست","تاریخ نوبت","تاریخ دریافت","شماره حساب بانک مهر","تلفن تماس","مبلغ وام","تعداد اقساط","مبلغ هر قسط","مبلغ قسط آخر","درصد کارمزد","نام ضامن","کد ملی ضامن","کد پرسنلی ضامن","تاریخ تولد ضامن","همراه ضامن","محل خدمت ضامن","تاییدیه حسابداری","تاریخ تاییدیه","تأییدکننده","توضیح حسابداری","وضعیت","علت عدم دریافت","توضیحات","نام کاربر"];
  const rows=items.map(x=>[String(x.code),String(x.nationalId||""),x.firstName,x.lastName,x.personStatus||"",x.workplace||"",x.requestDate,x.turnDate||"",x.receivedDate||"",String(x.mehrAccount||""),String(x.phone||""),x.loanAmount,x.installments,x.installmentAmount,x.lastInstallmentAmount,x.feePercent,x.gName||"",String(x.gNationalId||""),String(x.gCode||""),x.gBirthDate||"",String(x.gMobile||""),x.gWorkplace||"",(ST_ACC[x.accStatus]||[x.accStatus])[0],x.accDate||"",x.accBy||"",x.accNote||"",(ST_MH[x.status]||[x.status])[0],x.failReason||"",x.description||"",x.createdBy||""]);
  await xlsxExport(`mehr-loans-${todayJalali().replace(/\//g,"-")}.xlsx`,"وام بانک مهر",H,rows,[12,14,14,18,16,22,12,12,12,20,14,16,10,14,14,10,20,14,12,12,14,22,14,12,16,24,14,28,24,16]);
}

/* ---- تب «ثبت دریافت / عدم دریافت»: با کد پرسنلی یا کد ملی ---- */
const MH_WHY=["عدم مراجعه به بانک","نداشتن حساب در بانک مهر","چک برگشتی یا اقساط معوق","عدم تکمیل مدارک","انصراف متقاضی","عدم اعلام بانک","سایر"];
function mhChgHTML(){
  const y=app.wk.mcYear||todayJalali().slice(0,4);app.wk.mcYear=y;
  return `<div class="card u-mt14"><h2><svg class="i"><use href="#i-coins"/></svg>شارژ ماهانهٔ بانک مهر</h2>
    <p class="hint u-m0b10">برای هر ماه مبلغ شارژ را وارد و ذخیره کنید؛ مصرف و باقی‌ماندهٔ همان ماه (بر اساس وام‌های «در نوبت» و «دریافت‌شده» با «نوبت» در همان ماه) همین‌جا دیده می‌شود.</p>
    <div class="fgrid"><label class="f">سال<input id="mc-year" class="ltr" inputmode="numeric" maxlength="4" value="${esc(y)}"></label>
      <label class="f">مبلغ یکسان برای همهٔ ماه‌ها (ریال)<input id="mc-fillv" class="ltr" data-money inputmode="numeric" autocomplete="off"></label></div>
    <div class="wk-acts"><button class="btn btn-main" data-act="mc-show">نمایش سال</button><button class="btn" data-act="mc-fill">قرار دادن مبلغ در همهٔ ماه‌ها</button><span class="sp"></span><button class="btn btn-blue" data-act="mc-saveall">ذخیرهٔ همهٔ ماه‌ها</button></div>
    <div id="mc-body" class="u-mt12"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
}
async function mhChgLoad(){
  const body=$("#mc-body");if(!body)return;
  let r;try{r=await api("GET","/api/mehr-loans/charges/year?year="+enc(app.wk.mcYear))}catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  const T=r.items.reduce((t,x)=>({amount:t.amount+x.amount,used:t.used+x.used,count:t.count+x.count}),{amount:0,used:0,count:0});
  const badge=x=>!x.set?(x.used>0?`<span class="badge b-amber">شارژ تعیین نشده</span>`:`<span class="badge b-blue">—</span>`):x.remaining<0?`<span class="badge b-red">منفی</span>`:x.used>0&&x.remaining<x.amount*.1?`<span class="badge b-amber">رو به اتمام</span>`:`<span class="badge b-green">دارای باقی‌مانده</span>`;
  body.innerHTML=`<div class="wk-sum u-m0b10"><div>جمع شارژ سال<b>${fa(T.amount)}</b></div><div>جمع مصرف (${faId(T.count)} وام)<b>${fa(T.used)}</b></div><div class="big">باقی‌ماندهٔ سال<b style="color:${T.amount-T.used<0?"#dc2626":"inherit"}">${fa(T.amount-T.used)}</b></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ماه</th><th>شارژ (ریال)</th><th>مصرف‌شده</th><th>تعداد وام</th><th>باقی‌مانده</th><th>مصرف</th><th>وضعیت</th><th></th></tr></thead><tbody>
    ${r.items.map(x=>{const pct=x.set&&x.amount>0?Math.min(100,Math.round(x.used/x.amount*100)):(x.used>0?100:0);
      return `<tr><td><b>${MONTHS[x.month-1]}</b> <small class="hint">${faId(x.ym)}</small></td><td><input class="ltr u-w150" data-money inputmode="numeric" data-mcym="${x.ym}" value="${x.set?mnum(x.amount):""}" placeholder="تعیین نشده"></td><td class="money">${fa(x.used)}</td><td>${faId(x.count)}</td><td style="color:${x.remaining<0?"#dc2626":"inherit"}">${x.set?fa(x.remaining):"—"}</td><td class="u-minw90"><div class="hb-bar"><i style="width:${pct}%;background:${x.remaining<0?"#ef4444":"#2563eb"}"></i></div></td><td>${badge(x)}</td><td><button class="btn" data-act="mc-save" data-ym="${x.ym}">ذخیره</button></td></tr>`}).join("")}</tbody></table></div>`;
}
function mhRecHTML(){
  return `<div class="card u-mt14"><h2><svg class="i"><use href="#i-usercheck"/></svg>ثبت دریافت / عدم دریافت وام بانک مهر</h2>
  <p class="hint u-m0b10">کد پرسنلی یا کد ملی را وارد و Enter بزنید؛ وام‌های «در نوبت» فرد نمایش داده می‌شود. سپس «ثبت دریافت» (با تاریخ دریافت) یا «ثبت عدم دریافت» (با ذکر علت) را بزنید. بعد از هر ثبت، کادر برای فرد بعدی آماده می‌شود.</p>
  <div class="fgrid">
    <label class="f span2">کد پرسنلی یا کد ملی<input id="mr-q" class="ltr" inputmode="numeric" autocomplete="off" value="${esc(app.wk.mrPre||"")}"></label>
    <label class="f">تاریخ دریافت<input id="mr-date" class="ltr" value="${todayJalali()}"></label>
    <label class="f">علت عدم دریافت<select id="mr-why">${MH_WHY.map(w=>`<option>${w}</option>`).join("")}</select></label>
    <label class="f span2">توضیح علت (برای «سایر» الزامی)<input id="mr-why2" maxlength="150"></label>
  </div>
  <div id="mr-found" class="u-m-10-0"></div>
  <div class="wk-acts"><button class="btn" data-act="mh-find">جست‌وجو</button><span class="sp"></span>
    <button class="btn btn-main" data-act="mh-recv-ok">✔ ثبت دریافت</button><button class="btn btn-del" data-act="mh-recv-fail">✖ ثبت عدم دریافت</button></div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-upload"/></svg>ثبت گروهی با فایل اکسل</h2>
    <p class="hint u-m0b10">ردیف اول فایل عنوان ستون‌ها باشد: «کد پرسنلی» و/یا «کد ملی»، «تاریخ دریافت» و «علت عدم دریافت». اگر علت پر باشد آن ردیف «دریافت نشده» و در غیر این صورت با «تاریخ دریافت» (مثل 1405/08/20) «دریافت شده» ثبت می‌شود. برای افرادی که چند وام در نوبت دارند قدیمی‌ترین وام ثبت می‌شود.</p>
    <div class="wk-acts"><input type="file" id="mr-file" accept=".xlsx,.xls,.csv"><button class="btn" data-act="mh-xl-tpl">دریافت فایل نمونه</button></div>
    <div id="mr-xres" class="u-mt10"></div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>ثبت‌های همین نشست</h2><div id="mr-log"></div></div>`;
}
function mhRecLogRender(){
  const el=$("#mr-log");if(!el)return;const l=app.wk.mrLog||[];
  el.innerHTML=l.length?l.map(x=>`<div class="al-row"><i class="dot2 ${x.ok?"g":"r"}"></i><div><b>${esc(x.name)}</b> (${faId(esc(x.code))}) — ${x.ok?`دریافت شد، ${faId(esc(x.date))}`:`دریافت نشد: ${esc(x.reason)}`}</div></div>`).join(""):`<div class="hint">هنوز موردی ثبت نشده است.</div>`;
}
function mhRecInit(){
  mhRecLogRender();
  const q=$("#mr-q");if(q){q.focus();if(app.wk.mrPre){app.wk.mrPre="";mhFind().catch(e=>showAlert(e.message))}}
}
function mhXlDate(v){
  let t=lat(String(v==null?"":v)).trim().replace(/[-.]/g,"/");
  if(/^\d{8}$/.test(t))t=t.slice(0,4)+"/"+t.slice(4,6)+"/"+t.slice(6);
  const m=/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
  return m?`${m[1]}/${m[2].padStart(2,"0")}/${m[3].padStart(2,"0")}`:"";
}
async function mhXlRead(f){
  const box=$("#mr-xres");if(!f||!box)return;
  const rows=await readWorkbookRows(f);if(!rows.length)throw new Error("فایل خالی است.");
  const hdr=rows[0].map(x=>String(x).trim()),ix=p=>hdr.findIndex(h=>p.test(h));
  const iNid=ix(/ملی/),iCode=ix(/پرسنل|^کد$/),iDate=ix(/تاریخ/),iWhy=ix(/علت|توضیح/);
  if(iNid<0&&iCode<0)throw new Error("ستون «کد پرسنلی» یا «کد ملی» در ردیف اول فایل پیدا نشد.");
  const ok=[],bad=[];
  rows.slice(1).forEach((r,k)=>{
    const code=iCode>=0?lat(String(r[iCode]==null?"":r[iCode])).trim():"",nid=iNid>=0?lat(String(r[iNid]==null?"":r[iNid])).trim():"",q=code||nid;
    if(!q&&!r.some(c=>String(c).trim()))return;
    const reason=iWhy>=0?String(r[iWhy]==null?"":r[iWhy]).trim():"",date=iDate>=0?mhXlDate(r[iDate]):"";
    if(!q)bad.push({row:k+2,msg:"کد پرسنلی/کد ملی خالی است"});
    else if(!reason&&!date)bad.push({row:k+2,q,msg:"نه علت عدم دریافت و نه تاریخ دریافت معتبر است"});
    else ok.push({row:k+2,query:q,date,reason});
  });
  app.wk.mxRows=ok;
  const nOk=ok.filter(x=>!x.reason).length,nBad=ok.length-nOk;
  box.innerHTML=`<div class="wk-sum u-m0b8"><div>دریافت<b>${faId(nOk)}</b></div><div>عدم دریافت<b>${faId(nBad)}</b></div><div>نامعتبر<b style="color:${bad.length?"#dc2626":"inherit"}">${faId(bad.length)}</b></div></div>`
    +(bad.length?`<div class="hint u-c-b91c1c u-mb6">ردیف‌های نامعتبر (ثبت نمی‌شوند): ${bad.slice(0,8).map(x=>`ردیف ${faId(x.row)}: ${esc(x.msg)}`).join(" ، ")}${bad.length>8?" …":""}</div>`:"")
    +(ok.length?`<button class="btn btn-main" data-act="mh-xl-go">ثبت ${faId(ok.length)} ردیف</button>`:`<div class="hint">ردیف معتبری برای ثبت نیست.</div>`);
}
async function mhXlGo(){
  const rows=app.wk.mxRows||[];if(!rows.length)throw new Error("ردیفی برای ثبت نیست.");
  const r=await api("POST","/api/mehr-loans/receive-bulk",{rows});app.wk.mxRes=r;
  const box=$("#mr-xres");
  box.innerHTML=`<div class="wk-sum u-m0b8"><div class="big">ثبت شد<b>${faId(r.done)}</b></div><div>ناموفق<b style="color:${r.failed?"#dc2626":"inherit"}">${faId(r.failed)}</b></div></div>
    <div class="wk-acts"><button class="btn btn-blue" data-act="mh-xl-res">خروجی اکسل نتیجه</button></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ردیف</th><th>کد</th><th>نام</th><th>نتیجه</th></tr></thead><tbody>${r.results.map(x=>`<tr><td>${faId(x.row)}</td><td>${faId(esc(x.query))}</td><td>${esc(x.name||"—")}</td><td>${x.ok?`<span class="badge ${x.outcome==="paid"?"b-green":"b-red"}">${x.outcome==="paid"?"دریافت شد":"دریافت نشد"}</span>${x.note?` <small class="hint">${esc(x.note)}</small>`:""}`:`<span class="badge b-red">خطا</span> <small>${esc(x.error)}</small>`}</td></tr>`).join("")}</tbody></table></div>`;
  app.wk.mxRows=[];
}
async function mhXlResExport(){
  const r=app.wk.mxRes;if(!r||!r.results.length){showAlert("نتیجه‌ای برای خروجی نیست.");return}
  await xlsxExport("mehr-receive-result.xlsx","نتیجه",["ردیف","کد/کد ملی","کد پرسنلی","نام","نتیجه","توضیح/خطا"],r.results.map(x=>[x.row,String(x.query),String(x.code||""),x.name||"",x.ok?(x.outcome==="paid"?"دریافت شد":"دریافت نشد"):"خطا",x.ok?(x.note||""):x.error]),[8,16,14,22,14,48]);
}
async function mhFind(){
  const q=lat(val("mr-q")).trim(),box=$("#mr-found");if(!box)return;
  if(!q){box.innerHTML="";app.wk.mrFound=null;return}
  const r=await api("GET","/api/mehr-loans/find?query="+enc(q));r.q=q;app.wk.mrFound=r;
  const warn=t=>`<div class="pf-msg u-bg-amber-soft u-c-amber-ink">${t}</div>`;
  if(!r.person){box.innerHTML=warn("فردی با این کد پرسنلی/کد ملی پیدا نشد.");return}
  if(!r.loans.length){box.innerHTML=warn(`«${esc(r.person.name)}» (${faId(esc(r.person.code))}) وام بانک مهرِ «در نوبت» ندارد.`);return}
  box.innerHTML=`<div class="u-mb6"><b>${esc(r.person.name)}</b> — کد پرسنلی ${faId(esc(r.person.code))} — کد ملی ${faId(esc(r.person.nationalId||"—"))}</div>`+r.loans.map((x,i)=>`<label class="u-block u-m-3-0"><input type="radio" name="mr-loan" value="${x.id}"${i===0?" checked":""}> مبلغ ${fa(x.loanAmount)} ریال — تاریخ نوبت ${mhTurnTxt(x.turnDate)} — درخواست ${faId(esc(x.requestDate))}</label>`).join("");
}
async function mhRecv(outcome){
  const q=lat(val("mr-q")).trim();if(!q)throw new Error("کد پرسنلی یا کد ملی را وارد کنید.");
  if(!app.wk.mrFound||app.wk.mrFound.q!==q)await mhFind();
  const f=app.wk.mrFound;if(!f||!f.person)throw new Error("فردی با این کد پیدا نشد.");if(!f.loans.length)throw new Error("این فرد وام «در نوبت» ندارد.");
  const sel=document.querySelector('input[name="mr-loan"]:checked'),loanId=sel?+sel.value:f.loans[0].id,body={query:q,outcome,loanId};
  const w=val("mr-why"),w2=val("mr-why2").trim();
  if(outcome==="paid")body.date=lat(val("mr-date")).trim();else body.reason=w==="سایر"?w2:(w+(w2?" — "+w2:""));
  const r=await api("POST","/api/mehr-loans/receive",body);
  (app.wk.mrLog=app.wk.mrLog||[]).unshift({ok:outcome==="paid",name:r.name,code:r.code,date:body.date,reason:body.reason});
  $("#mr-q").value="";$("#mr-why2").value="";$("#mr-found").innerHTML="";app.wk.mrFound=null;mhRecLogRender();$("#mr-q").focus();
}

/* ---- تب «گزارش و نمودار» ---- */
app.wk.mst={from:"",to:""};
function mhStatHTML(){
  const a=app.wk.mst;
  return `<div class="card u-mt14"><h2><svg class="i"><use href="#i-chart"/></svg>گزارش و نمودار وام بانک مهر (بر اساس ماهِ تاریخ نوبت)</h2>
  <div class="fgrid"><label class="f">از تاریخ نوبت<input id="ms-from" class="ltr" placeholder="1405/01/01" value="${esc(a.from)}"></label><label class="f">تا تاریخ نوبت<input id="ms-to" class="ltr" placeholder="1405/12/29" value="${esc(a.to)}"></label></div>
  <div class="wk-acts"><button class="btn btn-main" data-act="ms-apply">نمایش گزارش</button><span class="sp"></span><button class="btn btn-blue" data-act="ms-xlsx">خروجی اکسل</button></div>
  <div id="ms-body" class="u-mt12"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
}
const MH_COL={pending:"#f59e0b",paid:"#10b981",failed:"#ef4444",cancelled:"#94a3b8"};
function mhMonthLbl(ym){return /^\d{4}\/\d{2}$/.test(ym)?[MONTHS[+ym.slice(5)-1],faId(ym.slice(0,4))]:[ym,""]}
function mhGroupBars(ms){
  const W=620,H=250,L=36,R=12,T=18,B=44,S=["pending","paid","failed"];
  const max=niceMax(Math.max(1,...ms.flatMap(m=>S.map(k=>m[k].count))));
  const cw=W-L-R,ch=H-T-B,slot=cw/ms.length,bw=Math.min(18,slot/4.2);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="تعداد افراد به تفکیک وضعیت و ماه">`;
  for(let i=0;i<=4;i++){const v=max*i/4,y=T+ch-(v/max)*ch;s+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#eef2f7"/><text x="${L-6}" y="${y+4}" text-anchor="end" font-size="10.5" fill="#94a3b8">${faId(String(Math.round(v)))}</text>`}
  ms.forEach((m,i)=>{
    const cx=W-R-slot*(i+.5),[mn,yr]=mhMonthLbl(m.ym);
    S.forEach((k,j)=>{const v=m[k].count,h=(v/max)*ch,x=cx+(j-1)*(bw+2)-bw/2;s+=`<rect x="${x}" y="${T+ch-h}" width="${bw}" height="${Math.max(h,v?2:0)}" rx="4" fill="${MH_COL[k]}"/>`+(v?`<text x="${x+bw/2}" y="${T+ch-h-4}" text-anchor="middle" font-size="10" fill="#475569">${faId(v)}</text>`:"")});
    s+=`<text x="${cx}" y="${H-26}" text-anchor="middle" font-size="11" fill="#64748b">${mn}</text><text x="${cx}" y="${H-13}" text-anchor="middle" font-size="9.5" fill="#94a3b8">${yr}</text>`;
  });
  return s+`</svg><div class="legend"><span><i style="background:#f59e0b"></i>در نوبت</span><span><i style="background:#10b981"></i>دریافت‌شده</span><span><i style="background:#ef4444"></i>دریافت‌نشده</span></div>`;
}
function mhChargeChart(ms){
  const W=620,H=250,L=44,R=12,T=18,B=44,mx=Math.max(1,...ms.flatMap(m=>[m.used,m.charge||0])),unit=mx>=1e9?1e9:1e6,max=niceMax(mx/unit);
  const cw=W-L-R,ch=H-T-B,slot=cw/ms.length,bw=Math.min(40,slot*.5);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="مصرف شارژ و شارژ ماهانه">`;
  for(let i=0;i<=4;i++){const v=max*i/4,y=T+ch-(v/max)*ch;s+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#eef2f7"/><text x="${L-6}" y="${y+4}" text-anchor="end" font-size="10.5" fill="#94a3b8">${faId(String(+v.toFixed(1)))}</text>`}
  const pts=[];
  ms.forEach((m,i)=>{
    const cx=W-R-slot*(i+.5),h=(m.used/unit/max)*ch,[mn,yr]=mhMonthLbl(m.ym);
    s+=`<rect x="${cx-bw/2}" y="${T+ch-h}" width="${bw}" height="${Math.max(h,m.used?2:0)}" rx="5" fill="#2563eb" opacity=".88"/>`;
    if(m.charge!=null){const y=T+ch-(m.charge/unit/max)*ch;pts.push([cx,y])}
    s+=`<text x="${cx}" y="${H-26}" text-anchor="middle" font-size="11" fill="#64748b">${mn}</text><text x="${cx}" y="${H-13}" text-anchor="middle" font-size="9.5" fill="#94a3b8">${yr}</text>`;
  });
  if(pts.length){s+=`<polyline points="${pts.map(p=>p.join(",")).join(" ")}" fill="none" stroke="#8b5cf6" stroke-width="2.5"/>`+pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#8b5cf6"/>`).join("")}
  return s+`</svg><div class="legend"><span><i style="background:#2563eb"></i>مصرف شارژ (وام‌های ثبت‌شده)</span><span><i style="background:#8b5cf6"></i>شارژ ماهانه</span><span class="u-c-muted">واحد: ${unit>=1e9?"میلیارد":"میلیون"} ریال</span></div>`;
}
async function mhStatLoad(){
  const a=app.wk.mst,body=$("#ms-body");if(!body)return;
  let r;
  try{r=await api("GET","/api/mehr-loans/stats?"+(a.from?`from=${enc(a.from)}&`:"")+(a.to?`to=${enc(a.to)}`:""))}catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  app.wk.mstData=r;const T=r.totals,all=Object.values(T).reduce((t,x)=>t+x.count,0);
  if(!all){body.innerHTML=`<div class="hint">هنوز وام بانک مهری ثبت نشده است.</div>`;return}
  const kp=(k,l)=>`<div style="border-right:4px solid ${MH_COL[k]}">${l}<b>${faId(T[k].count)} نفر</b>${fa(T[k].amount)} ریال</div>`;
  const rmax=Math.max(1,...r.reasons.map(x=>x.count));
  body.innerHTML=`<div class="wk-sum u-m0b12">${kp("pending","در نوبت")}${kp("paid","دریافت‌کنندگان")}${kp("failed","دریافت‌نشده")}${kp("cancelled","لغوشده")}<div class="big">کل ثبت‌شده<b>${faId(all)} نفر</b>${fa(Object.values(T).reduce((t,x)=>t+x.amount,0))} ریال</div></div>
    <div class="g-chart u-mb14"><div class="card"><h2>تعداد افراد در هر ماه (به تفکیک وضعیت)</h2><div class="chart-box">${mhGroupBars(r.months)}</div></div>
      <div class="card"><h2>علل عدم دریافت</h2>${r.reasons.length?r.reasons.map(x=>`<div class="hb-row"><div class="nm" title="${esc(x.reason)}">${esc(x.reason)}</div><div class="hb-bar"><i style="width:${Math.max(4,Math.round(x.count/rmax*100))}%;background:#ef4444"></i></div><b>${faId(x.count)}</b></div>`).join(""):`<div class="chart-empty">موردی ثبت نشده است.</div>`}</div></div>
    <div class="card u-mb14"><h2>مصرف شارژ هر ماه در برابر شارژ ماهانه</h2><div class="chart-box">${mhChargeChart(r.months)}</div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ماه (نوبت)</th><th>شارژ</th><th>در نوبت</th><th>دریافت‌شده</th><th>دریافت‌نشده</th><th>لغوشده</th><th>مصرف شارژ</th><th>باقی‌مانده</th></tr></thead><tbody>
    ${r.months.map(m=>`<tr><td>${mhYmLbl(m.ym)}</td><td>${m.charge==null?"—":fa(m.charge)}</td><td>${faId(m.pending.count)} (${fa(m.pending.amount)})</td><td>${faId(m.paid.count)} (${fa(m.paid.amount)})</td><td>${faId(m.failed.count)}</td><td>${faId(m.cancelled.count)}</td><td class="money">${fa(m.used)}</td><td style="color:${m.remaining!=null&&m.remaining<0?"#dc2626":"inherit"}">${m.remaining==null?"—":fa(m.remaining)}</td></tr>`).join("")}</tbody></table></div>`;
}
async function mhStatExport(){
  await mhStatLoad();const r=app.wk.mstData;if(!r||!r.months.length){showAlert("دادهٔ گزارش خالی است.");return}
  const H=["ماه (تاریخ نوبت)","شارژ ماهانه","تعداد در نوبت","مبلغ در نوبت","تعداد دریافت‌شده","مبلغ دریافت‌شده","تعداد دریافت‌نشده","تعداد لغوشده","مصرف شارژ","باقی‌مانده شارژ"];
  const rows=r.months.map(m=>[m.ym,m.charge==null?"":m.charge,m.pending.count,m.pending.amount,m.paid.count,m.paid.amount,m.failed.count,m.cancelled.count,m.used,m.remaining==null?"":m.remaining]);
  await xlsxExport(`mehr-report-${todayJalali().replace(/\//g,"-")}.xlsx`,"گزارش بانک مهر",H,rows,[16,16,12,16,12,16,12,12,16,16]);
}
function mhStSel(x){return `<select class="sm" data-mhst="${x.id}" data-code="${esc(x.code)}" title="تغییر وضعیت">${Object.entries(ST_MH).map(([k,v])=>`<option value="${k}"${x.status===k?" selected":""}>${v[0]}</option>`).join("")}</select>`}
async function mhRefreshView(){
  if(wkTab("mehr")==="form"&&app.wk.person)await renderMehr();else if(wkTab("mehr")==="rep")await mhAllLoad();else await renderWk("mehr");
}
async function mhChangeStatus(sel){
  const id=+sel.dataset.mhst,v=sel.value;
  try{
    if(v==="failed"){setWkTab("mehr","rec");app.wk.mrPre=sel.dataset.code;await renderWk("mehr");return}   // علت عدم دریافت در تب ثبت دریافت گرفته می‌شود
    const body={status:v};if(v==="paid")body.paidDate=todayJalali();
    await api("PATCH","/api/mehr-loans/"+id,body);await mhRefreshView();
  }catch(e){showAlert(e.message);await mhRefreshView()}
}
async function mhAction(b){
  const act=b.dataset.act,id=+b.dataset.id;
  try{
    if(act==="mh-new"){renderMehr();return}
    if(act==="mh-refresh"){const c=app.wk.code;app.wk.person=null;app.wk.code=c;await renderWk("mehr");return}
    if(act==="mh-open"){setWkTab("mehr","form");app.wk.code=b.dataset.code;app.wk.person=null;app.wk.mhOpen=id;await renderWk("mehr");return}
    if(act==="mh-tofail"){setWkTab("mehr","rec");app.wk.mrPre=b.dataset.code;await renderWk("mehr");return}
    if(act==="mh-chsave"){
      const ym=mhYm();if(!ym)throw new Error("ابتدا «تاریخ نوبت» (یا تاریخ درخواست) را وارد کنید.");
      await api("PUT","/api/mehr-loans/charges",{ym,amount:toNum(val("mh-chamt"))});await mhChargeLoad();showAlert(`شارژ ${mhYmLbl(ym)} ذخیره شد.`);return;
    }
    if(act==="mh-save"||act==="mh-saveprint"){
      const doSave=async()=>{
        const nid=await saveMehr();await renderMehr(nid);
        if(act==="mh-saveprint")await printMehr(app.wk.mhList.find(x=>x.id===nid));else showAlert("وام بانک مهر ذخیره شد.");
      };
      const c=app.wk.mhCh,after=app.wk.mhAfter;
      if(c&&c.set&&after!=null&&after<0){
        showConfirm(`با ثبت این وام، شارژ ${mhYmLbl(c.ym)} به اندازهٔ ${fa(-after)} ریال منفی می‌شود. ادامه می‌دهید؟`,async()=>{try{await doSave()}catch(e){showAlert(e.message)}});
        return;
      }
      await doSave();return;
    }
    if(act==="mh-print"){await printMehr(app.wk.mhList.find(x=>x.id===id));return}
    if(act==="mh-paid"){await api("PATCH","/api/mehr-loans/"+id,{status:"paid",paidDate:todayJalali()});await (app.wk.person&&wkTab("mehr")==="form"?renderMehr(app.wk.mh?app.wk.mh.id:undefined):mhAllLoad());return}
    if(act==="mh-cancel"){showConfirm("این وام بانک مهر لغو شود؟",async()=>{try{await api("PATCH","/api/mehr-loans/"+id,{status:"cancelled"});await renderMehr()}catch(e){showAlert(e.message)}});return}
    if(act==="mh-del"&&app.wk.mh){const c=app.wk.mh;showConfirm(`وام بانک مهر ${fa(c.loanAmount)} ریال (${c.requestDate}) حذف شود؟`,async()=>{try{await api("DELETE","/api/mehr-loans/"+c.id);await renderMehr()}catch(e){showAlert(e.message)}});return}
    if(act==="mh-delrow"){
      showConfirm("این وام بانک مهر برای همیشه حذف شود؟ (اگر فقط نمی‌خواهید شمرده شود، وضعیت را «لغو شده» کنید.)",async()=>{
        try{await api("DELETE","/api/mehr-loans/"+id);await mhRefreshView()}catch(e){showAlert(e.message)}
      });return;
    }
    if(act==="mc-save"){const ym=b.dataset.ym,inp=document.querySelector(`input[data-mcym="${ym}"]`);await api("PUT","/api/mehr-loans/charges",{ym,amount:toNum(inp.value)});await mhChgLoad();showAlert(`شارژ ${mhYmLbl(ym)} ذخیره شد.`);return}
    if(act==="mc-saveall"){
      const items=[...document.querySelectorAll("input[data-mcym]")].filter(i=>i.value.trim()!=="").map(i=>({ym:i.dataset.mcym,amount:toNum(i.value)}));
      const r=await api("PUT","/api/mehr-loans/charges/bulk",{items});await mhChgLoad();showAlert(`شارژ ${faId(r.saved)} ماه ذخیره شد.`);return;
    }
    if(act==="mc-fill"){const v=toNum(val("mc-fillv"));if(!(v>0))throw new Error("مبلغ را وارد کنید.");document.querySelectorAll("input[data-mcym]").forEach(i=>{i.value=mnum(v)});showAlert("مبلغ در همهٔ ماه‌ها قرار گرفت؛ برای اعمال «ذخیرهٔ همهٔ ماه‌ها» را بزنید.");return}
    if(act==="mc-show"){app.wk.mcYear=lat(val("mc-year")).replace(/\D/g,"")||app.wk.mcYear;await mhChgLoad();return}
    if(act==="mh-xl-tpl"){await xlsxExport("mehr-receive-template.xlsx","دریافت",["کد پرسنلی","کد ملی","تاریخ دریافت","علت عدم دریافت"],[["12345","","1405/08/20",""],["","0012345678","","نداشتن حساب در بانک مهر"]],[14,14,16,32]);return}
    if(act==="mh-xl-go"){await mhXlGo();return}
    if(act==="mh-xl-res"){await mhXlResExport();return}
    if(act==="mh-find"){await mhFind();return}
    if(act==="mh-recv-ok"){await mhRecv("paid");return}
    if(act==="mh-recv-fail"){await mhRecv("failed");return}
    if(act==="ms-apply"||act==="ms-xlsx"){
      const re=/^\d{4}\/\d{2}\/\d{2}$/,f=lat(val("ms-from")).trim(),t=lat(val("ms-to")).trim();
      if((f&&!re.test(f))||(t&&!re.test(t)))throw new Error("تاریخ‌ها را به‌صورت 1405/01/01 وارد کنید.");
      app.wk.mst={from:f,to:t};if(act==="ms-xlsx")await mhStatExport();else await mhStatLoad();return;
    }
    if(act==="ma-filter"){readMaFilter();await mhAllLoad();return}
    if(act==="ma-xlsx"){readMaFilter();await mhAllLoad();await mhExport();return}
    if(act==="ma-bulkpaid"){
      readMaFilter();await mhAllLoad();
      const pend=(await mhFetchAll()).filter(x=>x.status==="pending");
      if(!pend.length){showAlert("در فهرست فیلترشده وام بانک مهرِ «در نوبت» وجود ندارد.");return}
      const sum=pend.reduce((t,x)=>t+x.loanAmount,0);
      showConfirm(`${faId(pend.length)} وام بانک مهر (جمع مبلغ ${fa(sum)} ریال) از «در نوبت» به «دریافت شده» تغییر کند (تاریخ دریافت: امروز)؟`,async()=>{
        try{const r=await api("POST","/api/mehr-loans/bulk-paid",{ids:pend.map(x=>x.id),paidDate:todayJalali()});
          await mhAllLoad();if(app.wk.person&&wkTab("mehr")==="form")await renderMehr(app.wk.mh?app.wk.mh.id:undefined);showAlert(`${faId(r.changed)} وام بانک مهر «دریافت شده» شد.`)}catch(e){showAlert(e.message)}
      });
    }
  }catch(err){showAlert(err.message)}
}

