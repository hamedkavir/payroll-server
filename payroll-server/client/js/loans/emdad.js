"use strict";
/* loans/emdad.js — وام امداد
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("loans/emdad");
/* =============================== وام امداد =============================== */
app.wk.eall={from:"",to:"",status:"pending",items:[]};
const nowHM=()=>{const d=new Date();return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")};
const emNet=(a,on,pct)=>Math.round(a-(on?Math.round(a*(pct||0)/100):0));
async function renderEmdad(selId){
  if(!selId&&app.wk.emOpen)selId=app.wk.emOpen;if(selId)setWkTab("emdad","form");app.wk.emOpen=0;
  const root=$("#wk-emdad"),p=app.wk.person;
  if(wkTab("emdad")==="rep"){root.innerHTML=pageTabs("emdad")+emAllHTML();emAllLoad();return}
  if(!p){root.innerHTML=pageTabs("emdad")+pbar("emdad")+emptyMsg("برای ثبت وام امداد، ابتدا یک نفر را انتخاب کنید.");bindPbar("emdad",root);return}
  let list=[];
  try{list=(await api("GET","/api/emdad/by-person/"+enc(p.code))).items}catch(e){showAlert(e.message)}
  app.wk.emList=list;
  const cur=selId?list.find(x=>x.id===selId):null;app.wk.em=cur||null;
  const f=FS();
  const acc=cur?cur.account:String(p.advanceAccount||p.bankAccount||"").trim();
  // حساب‌های قابل انتخاب برای واریز: حساب مساعده (با نام صاحب حساب) و حساب حقوق (به نام خود فرد)
  const advA=String(p.advanceAccount||"").trim(),bankA=String(p.bankAccount||"").trim(),accOpts=[];
  if(advA)accOpts.push({k:"adv",acc:advA,owner:String(p.advanceOwner||"").trim()||pname(p),label:"حساب مساعده"});
  if(bankA&&bankA!==advA)accOpts.push({k:"bank",acc:bankA,owner:pname(p),label:"حساب حقوق"});
  app.wk.emAccOpts=accOpts;
  const E=cur||{requestDate:todayJalali(),requestTime:nowHM(),amount:+f.emdadDefaultAmount||1e9,feeEnabled:true,feePercent:f.emdadFeePercent!=null?f.emdadFeePercent:1,installments:f.emdadDefaultInstallments||20,installmentAmount:0,phone:p.mobile||"",account:acc,owner:((accOpts.find(o=>o.acc===acc)||{}).owner)||"",description:"",status:"pending"};
  const selKey=(accOpts.find(o=>o.acc===String(E.account||""))||{}).k||"custom";
  if(!cur)E.installmentAmount=planInst(E.amount,E.installments,RS().advInst).inst;
  const pendE=list.find(x=>x.status==="pending");
  root.innerHTML=pageTabs("emdad")+pbar("emdad")+(!cur&&pendE?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb12">⚠ برای ${esc(pname(p))} وام امداد در تاریخ ${faId(esc(pendE.requestDate))} به مبلغ ${fa(pendE.amount)} ریال ثبت شده و هنوز پرداخت نشده است؛ تا پرداخت یا لغو آن، وام امداد جدید ثبت نمی‌شود.</div>`:"")+(p.membershipCancelDate?`<div class="pf-msg u-bg-red-soft u-c-red-ink u-mb12">⚠ عضویت این فرد در صندوق وام ضروری در تاریخ ${faId(esc(p.membershipCancelDate))} لغو شده است.</div>`:"")+`
  <div class="card"><h2><svg class="i"><use href="#i-wallet"/></svg>${cur?"ویرایش وام امداد":"وام امداد"} ${cur?stB(ST_ADV,cur.status):""}</h2>
    <div class="fgrid">
      <label class="f">تاریخ<input id="em-date" class="ltr" value="${esc(E.requestDate)}" placeholder="1405/07/07"></label>
      <label class="f">ساعت<input id="em-time" class="ltr" value="${esc(E.requestTime||"")}" placeholder="09:30"></label>
      <label class="f span2">حساب واریز (انتخاب)<select id="em-accsel">${accOpts.map(o=>`<option value="${o.k}"${selKey===o.k?" selected":""}>${o.label} — ${faId(esc(o.acc))} — ${esc(o.owner)}</option>`).join("")}<option value="custom"${selKey==="custom"?" selected":""}>حساب دیگر (دستی)</option></select></label>
      <label class="f">شمارهٔ حساب<input id="em-acc" class="ltr" value="${esc(E.account||"")}"></label>
      <label class="f">نام صاحب حساب<input id="em-owner" value="${esc(E.owner||"")}" maxlength="100"></label>
      <label class="f">تاریخ پرداخت (برای دکمهٔ «پرداخت شد»)<input id="em-paid" class="ltr" placeholder="1405/07/21" value="${esc(cur&&cur.paidDate||"")}"></label>
      <label class="f">مبلغ وام امداد (ریال)<input id="em-amt" class="ltr" inputmode="numeric" autocomplete="off" data-money data-money-step="10000000" value="${mnum(E.amount)}"></label>
      <label class="f">وام بلاعوض (ریال)<input id="em-grant" class="ltr" inputmode="numeric" autocomplete="off" data-money data-money-step="10000000" placeholder="0" value="${E.grantAmount?mnum(E.grantAmount):""}" title="بخشی از مبلغ وام که بازپرداخت ندارد؛ قسط = (مبلغ وام − بلاعوض) ÷ تعداد اقساط"></label>
      <label class="f">تعداد اقساط<input id="em-n" type="number" min="1" max="120" value="${E.installments}"></label>
      <label class="f">مبلغ هر قسط (ریال)<input id="em-inst" data-money value="${E.installmentAmount?mnum(E.installmentAmount):""}"></label>
      <label class="f">درصد کارمزد<input id="em-fee" type="number" step="0.1" min="0" value="${E.feePercent}"></label>
      <label class="f">تلفن تماس<input id="em-phone" class="ltr" value="${esc(E.phone||"")}"></label>
      <label class="f u-jc-end"><span class="u-flex u-gap6 u-ai-center u-pointer u-mt22"><input type="checkbox" id="em-feeon"${E.feeEnabled?" checked":""}>کسر کارمزد</span></label>
      <label class="f span2">توضیحات<input id="em-desc" value="${esc(E.description||"")}" maxlength="255"></label>
    </div>
    <div class="wk-sum" id="em-sum"></div>
    <div class="wk-acts">
      <button class="btn btn-main" data-act="em-save"><svg class="i"><use href="#i-file"/></svg>ذخیره<span class="kbd">F4</span></button>
      <button class="btn" data-act="em-new">جدید</button>
      ${cur&&cur.status!=="paid"?`<button class="btn btn-del" data-act="em-del">حذف</button>`:""}
      <button class="btn" data-act="em-refresh" title="اطلاعات فرد و سوابق را دوباره از سرور می‌خواند">بهنگام</button>
      <span class="sp"></span>
      <button class="btn btn-blue" data-act="em-saveprint"><svg class="i"><use href="#i-print"/></svg>ذخیره و چاپ فرم<span class="kbd">F5</span></button>
    </div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>سوابق وام امداد ${esc(pname(p))}</h2>
    ${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>تاریخ</th><th>ساعت</th><th>مبلغ وام</th><th>بلاعوض</th><th>واریزی</th><th>اقساط</th><th>وضعیت</th><th>تاریخ پرداخت</th><th>حساب واریز</th><th></th></tr></thead><tbody>
    ${list.map(x=>`<tr class="clk${cur&&cur.id===x.id?" selrow":""}" data-eid="${x.id}"><td>${faId(esc(x.requestDate))}</td><td>${faId(esc(x.requestTime))}</td><td class="money">${fa(x.amount)}</td><td>${x.grantAmount?fa(x.grantAmount):"—"}</td><td>${fa(x.netAmount)}</td><td>${instTxt(x.installments,x.installmentAmount,x.lastInstallmentAmount)}</td><td>${stB(ST_ADV,x.status)}${x.closed?` <span class="badge b-dark" title="در «بستن مساعده و امداد» بسته شده؛ قابل تغییر نیست">بسته</span>`:""}</td><td>${x.paidDate?faId(esc(x.paidDate)):"—"}</td><td class="u-ws-normal"><span dir="ltr">${faId(esc(x.account||""))}</span>${x.owner?`<br><small class="hint">${esc(x.owner)}</small>`:""}</td>
      <td><div class="wk-tbl-act"><button class="btn" data-act="em-print" data-id="${x.id}">چاپ</button>${x.status==="pending"?`<button class="btn btn-amber" data-act="em-paid" data-id="${x.id}">پرداخت شد</button><button class="btn btn-del" data-act="em-cancel" data-id="${x.id}">لغو</button>`:""}</div></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">هنوز وام امدادی برای این فرد ثبت نشده است.</div>`}</div>`;
  bindPbar("emdad",root);emSummary();
  // انتخاب حساب واریز: شمارهٔ حساب و نام صاحب حساب پر می‌شود؛ با دست‌زدن به شمارهٔ حساب، انتخاب «حساب دیگر» می‌شود
  const emSel=$("#em-accsel");
  if(emSel){emSel.onchange=()=>{const o=(app.wk.emAccOpts||[]).find(x=>x.k===emSel.value);if(o){$("#em-acc").value=o.acc;$("#em-owner").value=o.owner}};
    $("#em-acc").addEventListener("input",()=>{const o=(app.wk.emAccOpts||[]).find(x=>x.acc===lat($("#em-acc").value).trim());emSel.value=o?o.k:"custom"})}
  if(app.wk.focusId){wkFocus(app.wk.focusId);app.wk.focusId=""}
}
function emSummary(){
  const el=$("#em-sum");if(!el)return;
  const a=toNum(val("em-amt")),g=toNum(val("em-grant")),n=parseInt(lat(val("em-n")),10)||0,pct=parseFloat(lat(val("em-fee")))||0,on=$("#em-feeon").checked,i=toNum(val("em-inst"));
  const fee=on?Math.round(a*pct/100):0,rep=Math.max(0,a-g);
  el.innerHTML=`<div>مبلغ وام<b>${fa(a)}</b></div>${g?`<div>وام بلاعوض<b>${fa(g)}</b></div><div>مبلغ بازپرداخت (وام − بلاعوض)<b>${fa(rep)}</b></div>`:""}<div>کارمزد${on?" ("+faId(pct)+"٪)":""}<b>${fee?fa(fee):"ندارد"}</b></div><div class="big">مبلغ قابل واریز<b>${fa(a-fee)}</b></div><div>قسط آخر<b>${fa(lastOfInst(rep,i,n))}</b></div>${g>=a&&a>0?`<div><span class="bad">وام بلاعوض باید کمتر از مبلغ وام باشد.</span></div>`:""}`;
}
function emInput(e){
  const id=e.target.id;
  if(id==="em-inst")e.target.dataset.touched="1";
  if(id==="em-amt"||id==="em-grant"||id==="em-n"){const inst=$("#em-inst");if(!inst.dataset.touched){const a=toNum(val("em-amt"))-toNum(val("em-grant")),n=parseInt(lat(val("em-n")),10)||0;inst.value=a>0&&n>0?mnum(planInst(a,n,RS().advInst).inst):""}}   // قسط = (مبلغ وام − بلاعوض) ÷ تعداد اقساط
  emSummary();
}
async function saveEmdad(){
  const p=app.wk.person,cur=app.wk.em;
  const body={requestDate:lat(val("em-date")).trim(),requestTime:lat(val("em-time")).trim(),account:lat(val("em-acc")).trim(),owner:val("em-owner").trim(),amount:toNum(val("em-amt")),grantAmount:toNum(val("em-grant")),
    installments:parseInt(lat(val("em-n")),10)||1,installmentAmount:toNum(val("em-inst")),feeEnabled:$("#em-feeon").checked,feePercent:parseFloat(lat(val("em-fee")))||0,
    phone:lat(val("em-phone")).trim(),description:val("em-desc").trim()};
  if(!body.account)throw new Error("شمارهٔ حساب را وارد کنید.");
  if(body.grantAmount>=body.amount)throw new Error("وام بلاعوض باید کمتر از مبلغ وام باشد.");
  if(cur){await api("PATCH","/api/emdad/"+cur.id,body);return cur.id}
  const r=await api("POST","/api/emdad",Object.assign({code:p.code},body));
  return r.id;
}
// سوابق وام امدادِ همان ماه (برای جدول پایین فرم؛ مساعده در آن نمی‌آید)
async function printEmdad(E){
  const p=app.wk.person;if(!p||!E)return;
  const ym=String(E.requestDate).slice(0,7);
  const hist=([]).concat(
    (app.wk.emList||[]).filter(x=>x.status!=="cancelled"&&String(x.requestDate).slice(0,7)===ym).map(x=>({date:x.requestDate,kind:"امداد",desc:x.description,amount:x.amount})));
  printDoc("فرم وام امداد — "+pname(p),()=>docEmdad(p,E,hist),"emdad");
}
function emAllHTML(){
  const a=app.wk.eall;
  return `<div class="card u-mt14"><h2><svg class="i"><use href="#i-users"/></svg>وام امدادِ همهٔ افراد (فیلتر و گزارش)</h2>
  <div class="fgrid">
    <label class="f">از تاریخ<input id="ea-from" class="ltr" placeholder="1405/07/01" value="${esc(a.from)}"></label>
    <label class="f">تا تاریخ<input id="ea-to" class="ltr" placeholder="1405/07/30" value="${esc(a.to)}"></label>
    <label class="f">وضعیت<select id="ea-st">${[["pending","در انتظار پرداخت"],["paid","پرداخت‌شده"],["cancelled","لغوشده"],["all","همه"]].map(([v,t])=>`<option value="${v}"${a.status===v?" selected":""}>${t}</option>`).join("")}</select></label>
    <label class="f">پرداخت از تاریخ<input id="ea-pfrom" class="ltr" placeholder="1405/07/01" value="${esc(a.pFrom||"")}"></label>
    <label class="f">پرداخت تا تاریخ<input id="ea-pto" class="ltr" placeholder="1405/07/30" value="${esc(a.pTo||"")}"></label>
    <label class="f">تاریخ پرداختِ ثبت‌شونده<input id="ea-paid" class="ltr" placeholder="1405/07/21" value="${esc(a.payDate||"")}" title="این تاریخ هنگام «پرداخت شد» و تغییر دسته‌جمعی به «پرداخت شده» به‌عنوان تاریخ پرداخت ثبت می‌شود؛ خالی بودن هشدار می‌دهد"></label>
  </div>
  <div class="wk-acts"><button class="btn btn-main" data-act="ea-filter">اعمال فیلتر</button>
    <label class="f u-m0 u-frow u-ai-center u-gap6">تغییر وضعیت فیلترشده‌ها به<select id="ea-bulkst">${[["paid","پرداخت شده"],["pending","در انتظار پرداخت"],["cancelled","لغو شده"]].map(([v,t])=>`<option value="${v}"${(a.bulkSt||"paid")===v?" selected":""}>${t}</option>`).join("")}</select></label>
    <button class="btn btn-amber" data-act="ea-bulkstatus">تغییر وضعیت</button><span class="sp"></span>
    <button class="btn btn-blue" data-act="ea-xlsx">خروجی اکسل</button></div>
  <div id="ea-body" class="u-mt12"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
}
const eaQs=a=>`status=${enc(a.status)}`+(a.from?`&from=${enc(a.from)}`:"")+(a.to?`&to=${enc(a.to)}`:"")+(a.pFrom?`&paidFrom=${enc(a.pFrom)}`:"")+(a.pTo?`&paidTo=${enc(a.pTo)}`:"");
async function emFetchAll(){return (await api("GET","/api/emdad?"+eaQs(app.wk.eall)+"&all=1")).items}
async function emAllLoad(){
  const a=app.wk.eall,body=$("#ea-body");if(!body)return;
  let r;
  try{r=await api("GET","/api/emdad?"+eaQs(a)+`&page=${a.page||1}&pageSize=${a.size||50}`)}catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  if(r.total&&r.page>r.pages){a.page=r.pages;return emAllLoad()}
  a.items=r.items;a.meta=r;
  const sum=r.sums.amount,sumNet=r.sums.net;
  body.innerHTML=r.total?`<div class="wk-sum u-m0b10"><div>تعداد<b>${faId(r.total)}</b></div><div>جمع مبلغ وام<b>${fa(sum)}</b></div><div class="big">جمع مبلغ واریزی<b>${fa(sumNet)}</b></div></div>
    ${pagerHTML("ea",a.meta)}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>نام و نام خانوادگی</th><th>تاریخ</th><th>مبلغ وام</th><th>بلاعوض</th><th>واریزی</th><th>اقساط</th><th>وضعیت</th><th>تاریخ پرداخت</th><th>ثبت‌کننده</th><th></th></tr></thead><tbody>
    ${a.items.map(x=>`<tr><td>${faId(esc(x.code))}</td><td>${esc(x.name)}</td><td>${faId(esc(x.requestDate))}</td><td class="money">${fa(x.amount)}</td><td>${x.grantAmount?fa(x.grantAmount):"—"}</td><td>${fa(x.netAmount)}</td><td>${instTxt(x.installments,x.installmentAmount,x.lastInstallmentAmount)}</td><td>${stB(ST_ADV,x.status)}${x.closed?` <span class="badge b-dark" title="در «بستن مساعده و امداد» بسته شده؛ قابل تغییر نیست">بسته</span>`:""}</td><td>${x.paidDate?faId(esc(x.paidDate)):"—"}</td><td>${esc(x.createdBy)}</td>
      <td><div class="wk-tbl-act">${x.status==="pending"?`<button class="btn btn-amber" data-act="em-paid" data-id="${x.id}">پرداخت شد</button>`:""}<button class="btn" data-act="em-open" data-code="${esc(x.code)}" data-id="${x.id}">باز کردن</button></div></td></tr>`).join("")}</tbody></table></div>${pagerHTML("ea",a.meta)}`
    :`<div class="hint">وام امدادی با این فیلتر پیدا نشد.</div>`;
}
function readEaFilter(){
  const a=app.wk.eall,re=/^\d{4}\/\d{2}\/\d{2}$/;
  const f=lat(val("ea-from")).trim(),t=lat(val("ea-to")).trim();
  if((f&&!re.test(f))||(t&&!re.test(t)))throw new Error("تاریخ‌ها را به‌صورت 1405/07/01 وارد کنید.");
  a.from=f;a.to=t;a.status=val("ea-st");a.page=1;
  a.payDate=lat(val("ea-paid")||"").trim();
  const pf=lat(val("ea-pfrom")||"").trim(),pt=lat(val("ea-pto")||"").trim(),re2=/^\d{4}\/\d{2}\/\d{2}$/;
  if((pf&&!re2.test(pf))||(pt&&!re2.test(pt)))throw new Error("تاریخ‌های پرداخت را به‌صورت 1405/07/01 وارد کنید.");
  a.pFrom=pf;a.pTo=pt;a.bulkSt=val("ea-bulkst")||"paid";
}
/* تاریخ پرداخت وام امداد: از فیلد «تاریخ پرداخت» همان تب (فهرست همه ← ea-paid، فرم فرد ← em-paid)؛ خالی یا نامعتبر = هشدار */
function emPayDate(){
  const el=$("#ea-paid")||$("#em-paid"),d=el?lat(el.value).trim():"";
  if(!d){if(el)el.focus();throw new Error("تاریخ پرداخت را وارد کنید.")}
  if(!/^\d{4}\/\d{2}\/\d{2}$/.test(d)){if(el)el.focus();throw new Error("تاریخ پرداخت را به‌صورت 1405/07/21 وارد کنید.")}
  return d;
}
async function emExport(){
  const items=await emFetchAll();
  if(!items.length){showAlert("وام امدادی برای خروجی در فهرست نیست.");return}
  const H=["پرسنلی","کد ملی","نام","نام خانوادگی","وضعیت (شاغل/بازنشسته)","شماره حساب","نام صاحب حساب","تاریخ","ساعت","مبلغ وام","وام بلاعوض","مبلغ بازپرداخت (وام − بلاعوض)","کارمزد","مبلغ واریزی","تعداد اقساط","مبلغ هر قسط","مبلغ قسط آخر","وضعیت","تاریخ پرداخت","توضیحات","نام کاربر"];
  const rows=items.map(x=>[String(x.code),String(x.nationalId||""),x.firstName,x.lastName,x.personStatus||"",String(x.account||""),x.owner||"",x.requestDate,x.requestTime,x.amount,x.grantAmount||0,x.repayAmount!=null?x.repayAmount:x.amount,x.feeAmount,x.netAmount,x.installments,x.installmentAmount,x.lastInstallmentAmount,(ST_ADV[x.status]||[x.status])[0],x.paidDate||"",x.description||"",x.createdBy||""]);
  await xlsxExport(`emdad-${todayJalali().replace(/\//g,"-")}.xlsx`,"وام امداد",H,rows,[12,14,14,18,16,22,20,12,8,18,16,22,14,18,12,16,16,14,14,28,16]);
}
async function emAction(b){
  const act=b.dataset.act,id=+b.dataset.id;
  try{
    if(act==="em-new"){renderEmdad();return}
    if(act==="em-refresh"){const c=app.wk.code;app.wk.person=null;app.wk.code=c;await renderWk("emdad");return}
    if(act==="em-open"){setWkTab("emdad","form");app.wk.code=b.dataset.code;app.wk.person=null;app.wk.emOpen=id;await renderWk("emdad");return}
    if(act==="em-save"||act==="em-saveprint"){
      const nid=await saveEmdad();await renderEmdad(nid);
      if(act==="em-saveprint")await printEmdad(app.wk.emList.find(x=>x.id===nid));else showAlert("وام امداد ذخیره شد.");
      return;
    }
    if(act==="em-print"){await printEmdad(app.wk.emList.find(x=>x.id===id));return}
    if(act==="em-paid"){await api("PATCH","/api/emdad/"+id,{status:"paid",paidDate:emPayDate()});await (app.wk.person?renderEmdad(app.wk.em?app.wk.em.id:undefined):emAllLoad());return}
    if(act==="em-cancel"){showConfirm("این وام امداد لغو شود؟",async()=>{try{await api("PATCH","/api/emdad/"+id,{status:"cancelled"});await renderEmdad()}catch(e){showAlert(e.message)}});return}
    if(act==="em-del"&&app.wk.em){const c=app.wk.em;showConfirm(`وام امداد ${fa(c.amount)} ریال (${c.requestDate}) حذف شود؟`,async()=>{try{await api("DELETE","/api/emdad/"+c.id);await renderEmdad()}catch(e){showAlert(e.message)}});return}
    if(act==="ea-filter"){readEaFilter();await emAllLoad();return}
    if(act==="ea-xlsx"){readEaFilter();await emAllLoad();await emExport();return}
    if(act==="ea-bulkstatus"){
      readEaFilter();const st=app.wk.eall.bulkSt,pdate=st==="paid"?emPayDate():null;await emAllLoad();
      const items=(await emFetchAll()).filter(x=>x.status!==st);
      const stName=(ST_ADV[st]||[st])[0];
      if(!items.length){showAlert(`در فهرست فیلترشده وام امدادی نیست که وضعیتش با «${stName}» فرق داشته باشد.`);return}
      const by={};items.forEach(x=>{by[x.status]=(by[x.status]||0)+1});
      const brk=Object.entries(by).map(([k,n])=>`${faId(n)} «${(ST_ADV[k]||[k])[0]}»`).join("، ");
      showConfirm(`${faId(items.length)} وام امداد (${brk}) به «${stName}» تغییر کند؟${st==="paid"?` تاریخ پرداخت: ${faId(pdate)}`:" تاریخ پرداخت ثبت‌شده پاک می‌شود."}`,async()=>{
        try{const r=await api("POST","/api/emdad/bulk-status",{ids:items.map(x=>x.id),status:st,paidDate:pdate});
          await emAllLoad();if(app.wk.person)await renderEmdad(app.wk.em?app.wk.em.id:undefined);showAlert(`${faId(r.changed)} وام امداد «${stName}» شد.`)}catch(e){showAlert(e.message)}
      });
    }
  }catch(err){showAlert(err.message)}
}

