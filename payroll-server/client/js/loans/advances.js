"use strict";
/* loans/advances.js — مساعده
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("loans/advances");
/* =============================== مساعده =============================== */
const round6=x=>ceilStep(x,RS().loanInst);   // رند قسط وام طبق تنظیمات گرد کردن
app.wk.aall={from:"",to:"",status:"pending",items:[]};
async function renderAdvance(selId){
  const root=$("#wk-advance"),p=app.wk.person;
  if(wkTab("advance")==="rep"){root.innerHTML=pageTabs("advance")+advAllHTML();advAllLoad();return}
  if(!p){root.innerHTML=pageTabs("advance")+pbar("advance")+emptyMsg("برای ثبت مساعده، ابتدا یک نفر را انتخاب کنید.");bindPbar("advance",root);return}
  let list=[];
  try{list=(await api("GET","/api/advances/by-person/"+enc(p.code))).items}catch(e){showAlert(e.message)}
  app.wk.advList=list;
  const cur=selId?list.find(x=>x.id===selId):null;app.wk.adv=cur||null;
  const f=FS();
  const acc=cur?cur.account:String(p.advanceAccount||"").trim();
  const dAmt=+f.advanceDefaultAmount||50000000,dN=Math.max(1,Math.round(+f.advanceDefaultInstallments)||2);
  const A=cur||{requestDate:todayJalali(),amount:dAmt,installments:dN,installmentAmount:Math.round(dAmt/dN),feePercent:f.advanceFeePercent,phone:p.mobile||"",account:acc,description:"",status:"pending"};
  const pendA=list.find(x=>x.status==="pending");
  let s733=null;try{s733=await api("GET","/api/loan-queue/slip-codes/"+enc(p.code))}catch(e){}
  const c7=s733&&s733.found?s733.cAdvance:null;
  const info733=`<div class="card u-mb12"><h2><svg class="i"><use href="#i-wallet"/></svg>مساعدهٔ جاری در آخرین فیش (کد ${faId(((s733&&s733.codes)||KCP(p)).advance)})${s733&&s733.found?` <span class="badge b-blue">${MONTHS[s733.month-1]} ${faId(s733.year)}</span>`:""}</h2>`+(c7&&c7.has
    ?`<div class="wk-sum"><span>کل مساعده: <b>${fa(c7.total)}</b></span><span>قسط: <b>${fa(c7.installment)}</b></span><span>مانده: <b>${fa(c7.remaining)}</b></span> <small class="hint">ریال</small></div>`
    :`<div class="hint">${s733&&s733.found?"در آخرین فیش، مساعده‌ای ثبت نشده است.":"فیش حقوقی برای این فرد پیدا نشد."}</div>`)+`</div>`;
  root.innerHTML=pageTabs("advance")+pbar("advance")+info733+(!cur&&pendA?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb12">⚠ برای ${esc(pname(p))} مساعده‌ای در تاریخ ${faId(esc(pendA.requestDate))} به مبلغ ${fa(pendA.amount)} ریال ثبت شده و هنوز پرداخت نشده است؛ تا پرداخت یا لغو آن، مساعدهٔ جدید ثبت نمی‌شود.</div>`:"")+(!acc?`<div class="pf-msg u-bg-red-soft u-c-red-ink u-mb12">⚠ ${esc(pname(p))} هنوز حساب مساعده ثبت نشده؛ شمارهٔ ۱۳ رقمی را در کادر «شمارهٔ حساب مساعده» وارد و ذخیره کنید (در فرم پرسنلی هم ثبت می‌شود).</div>`:"")+`
  <div class="card"><h2><svg class="i"><use href="#i-wallet"/></svg>${cur?"ویرایش مساعده":"درخواست مساعده (وام کوتاه‌مدت)"} ${cur?stB(ST_ADV,cur.status):""}</h2>
    <div class="fgrid">
      <label class="f">مبلغ مساعده (ریال)<input id="ad-amt" class="ltr" inputmode="numeric" autocomplete="off" data-money data-money-step="10000000" value="${mnum(A.amount)}"></label>
      <label class="f">تعداد اقساط<input id="ad-n" type="number" min="1" max="24" value="${A.installments}"></label>
      <label class="f">مبلغ هر قسط (ریال)<input id="ad-inst" data-money value="${A.installmentAmount?mnum(A.installmentAmount):""}"></label>
      <label class="f">تاریخ درخواست<input id="ad-date" class="ltr" value="${esc(A.requestDate)}" placeholder="1405/07/07"></label>
      <label class="f">درصد کسر<input id="ad-fee" type="number" step="0.1" min="0" value="${A.feePercent}"></label>
      <label class="f">تلفن تماس<input id="ad-phone" class="ltr" value="${esc(A.phone)}"></label>
      <label class="f">شمارهٔ حساب مساعده (۱۳ رقم؛ با ذخیره در فرم پرسنلی هم به‌روز می‌شود)<input id="ad-acc" class="ltr" inputmode="numeric" maxlength="13" value="${esc(acc)}"></label>
      <label class="f">نام صاحب حساب مساعده<input id="ad-owner" value="${esc(cur?(cur.owner||p.advanceOwner||""):(p.advanceOwner||""))}" maxlength="100"></label>
      <label class="f">تاریخ پرداخت (برای دکمهٔ «پرداخت شد»)<input id="ad-paid" class="ltr" placeholder="1405/07/21" value="${esc(cur&&cur.paidDate||"")}"></label>
      <label class="f span2">شرح مساعده / توضیحات<input id="ad-desc" value="${esc(A.description)}" maxlength="255"></label>
    </div>
    <div class="wk-sum" id="ad-sum"></div>
    <div class="wk-acts">
      <button class="btn btn-main" data-act="adv-save"><svg class="i"><use href="#i-file"/></svg>ذخیره<span class="kbd">F4</span></button>
      <button class="btn" data-act="adv-new">مساعدهٔ جدید</button>
      <span class="sp"></span>
      <button class="btn btn-blue" data-act="adv-saveprint"><svg class="i"><use href="#i-print"/></svg>ذخیره و چاپ فرم<span class="kbd">F5</span></button>
    </div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>سوابق مساعدهٔ ${esc(pname(p))}</h2>
    ${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>تاریخ</th><th>مبلغ</th><th>اقساط</th><th>قسط</th><th>وضعیت</th><th></th></tr></thead><tbody>
    ${list.map(x=>`<tr class="clk${cur&&cur.id===x.id?" selrow":""}" data-aid="${x.id}"><td>${faId(esc(x.requestDate))}</td><td class="money">${fa(x.amount)}</td><td>${faId(x.installments)}</td><td>${fa(x.installmentAmount)}${x.installments>1&&x.lastInstallmentAmount&&x.lastInstallmentAmount!==x.installmentAmount?` <small class="hint">(آخر: ${fa(x.lastInstallmentAmount)})</small>`:""}</td><td>${stB(ST_ADV,x.status)}${x.paidDate?` <small class="hint">${faId(esc(x.paidDate))}</small>`:""}</td>
      <td><div class="wk-tbl-act"><button class="btn" data-act="adv-print" data-id="${x.id}">چاپ</button>${x.status==="pending"?`<button class="btn btn-amber" data-act="adv-paid" data-id="${x.id}">پرداخت شد</button><button class="btn btn-del" data-act="adv-cancel" data-id="${x.id}">لغو</button>`:""}${x.closed?`<span class="badge b-dark" title="در «بستن مساعده» بسته شده؛ قابل تغییر نیست">بسته</span>`:""}${x.status==="paid"&&!x.closed?`<button class="btn" data-act="adv-unpaid" data-id="${x.id}" title="برگشت از «پرداخت شده» به «در انتظار پرداخت» (تاریخ پرداخت پاک می‌شود)">برگشت به در انتظار</button>`:""}<button class="btn btn-del" data-act="adv-del" data-id="${x.id}">حذف</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">هنوز مساعده‌ای برای این فرد ثبت نشده است.</div>`}</div>`;
  bindPbar("advance",root);advSummary();
  if(!acc&&app.wk.accWarned!==p.code){app.wk.accWarned=p.code;showAlert(`«${pname(p)}» حساب مساعده ندارد. ابتدا حساب مساعده را در فرم پرسنلی ثبت کنید.`)}
  if(app.wk.focusId){wkFocus(app.wk.focusId);app.wk.focusId=""}
}
/* ---- مساعدهٔ همهٔ افراد: فیلتر بین دو تاریخ، تبدیل گروهی به «پرداخت‌شده»، خروجی اکسل ---- */
// ---- صفحه‌بندی سمت سرور فهرست‌های «همهٔ افراد» (مساعده aa، وام امداد ea، تغییرات ماهانه ca)
const PG_SIZES=[25,50,100,200,500];
function pagerHTML(key,m){
  if(!m||!m.total)return "";
  const from=(m.page-1)*m.pageSize+1,to=Math.min(m.total,m.page*m.pageSize);
  if(m.pages<=1&&m.total<=25)return `<div class="pager"><span>${faId(m.total)} ردیف</span></div>`;
  const b=(d,t,dis,lab)=>`<button class="btn sm" data-pg="${key}:${d}"${dis?" disabled":""}${lab?` title="${lab}" aria-label="${lab}"`:""}>${t}</button>`;
  return `<div class="pager">${b("first",ico("chevs-r","back"),m.page<=1,"صفحهٔ اول")}${b("prev",ico("chev-r","back")+" قبلی",m.page<=1)}<span>${faId(from)}–${faId(to)} از ${faId(m.total)} · صفحهٔ ${faId(m.page)} از ${faId(m.pages)}</span>${b("next","بعدی "+ico("chev-r","fwd"),m.page>=m.pages)}${b("last",ico("chevs-r","fwd"),m.page>=m.pages,"صفحهٔ آخر")}<span class="sp2"></span><label>تعداد در صفحه <select data-pgsize="${key}">${PG_SIZES.map(n=>`<option value="${n}"${n===m.pageSize?" selected":""}>${faId(n)}</option>`).join("")}</select></label></div>`;
}
const PG_STATE={cq:()=>app.wk.cqall,mh:()=>app.wk.mall,aa:()=>app.wk.aall,ea:()=>app.wk.eall,ca:()=>app.wk.call,gg:()=>app.wk.grep,ins:()=>(app.wk.ins||{}).rep,insl:()=>(app.wk.ins||{}).lst,insr:()=>(app.wk.ins||{}).rec};
const PG_RELOAD={cq:()=>cqAllLoad(),mh:()=>mhAllLoad(),aa:()=>advAllLoad(),ea:()=>emAllLoad(),ca:()=>chAllLoad(),gg:()=>gdReportLoad(),ins:()=>insRepLoad("rep"),insl:()=>insRepLoad("lst"),insr:()=>insRecShow()};
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-pg]");if(!b||b.disabled)return;
  const [k,d]=b.dataset.pg.split(":"),a=PG_STATE[k]&&PG_STATE[k]();if(!a||!a.meta)return;
  const p=d==="first"?1:d==="prev"?a.meta.page-1:d==="next"?a.meta.page+1:a.meta.pages;
  a.page=Math.min(Math.max(1,p),a.meta.pages);PG_RELOAD[k]();
});
document.addEventListener("change",e=>{
  const sel=e.target.closest("[data-pgsize]");if(!sel)return;
  const k=sel.dataset.pgsize,a=PG_STATE[k]&&PG_STATE[k]();if(!a)return;a.size=+sel.value;a.page=1;PG_RELOAD[k]();
});
function advAllHTML(){
  const a=app.wk.aall;
  return `<div class="card u-mt14"><h2><svg class="i"><use href="#i-users"/></svg>مساعدهٔ همهٔ افراد (فیلتر و گزارش)</h2>
  <div class="fgrid">
    <label class="f">از تاریخ درخواست<input id="aa-from" class="ltr" placeholder="1405/07/01" value="${esc(a.from)}"></label>
    <label class="f">تا تاریخ درخواست<input id="aa-to" class="ltr" placeholder="1405/07/30" value="${esc(a.to)}"></label>
    <label class="f">وضعیت<select id="aa-st">${[["pending","در انتظار پرداخت"],["paid","پرداخت‌شده"],["cancelled","لغوشده"],["all","همه"]].map(([v,t])=>`<option value="${v}"${a.status===v?" selected":""}>${t}</option>`).join("")}</select></label>
    <label class="f">پرداخت از تاریخ<input id="aa-pfrom" class="ltr" placeholder="1405/07/01" value="${esc(a.pFrom||"")}"></label>
    <label class="f">پرداخت تا تاریخ<input id="aa-pto" class="ltr" placeholder="1405/07/30" value="${esc(a.pTo||"")}"></label>
    <label class="f">تاریخ پرداختِ ثبت‌شونده<input id="aa-paydate" class="ltr" placeholder="1405/07/21" value="${esc(a.payDate||"")}" title="این تاریخ هنگام «پرداخت شد» و تغییر دسته‌جمعی به «پرداخت شده» به‌عنوان تاریخ پرداخت ثبت می‌شود؛ خالی بودن هشدار می‌دهد"></label>
  </div>
  <div class="wk-acts"><button class="btn btn-main" data-act="aa-filter">اعمال فیلتر</button>
    <label class="f u-m0 u-frow u-ai-center u-gap6">تغییر وضعیت فیلترشده‌ها به<select id="aa-bulkst">${[["paid","پرداخت شده"],["pending","در انتظار پرداخت"],["cancelled","لغو شده"]].map(([v,t])=>`<option value="${v}"${(a.bulkSt||"paid")===v?" selected":""}>${t}</option>`).join("")}</select></label>
    <button class="btn btn-amber" data-act="aa-bulkstatus">تغییر وضعیت</button><span class="sp"></span>
    <button class="btn btn-blue" data-act="aa-xlsx">خروجی اکسل</button></div>
  <div id="aa-body" class="u-mt12"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
}
const advPay=x=>Math.round(x.amount*(1-(x.feePercent||0)/100));
// تاریخ پرداخت: اگر در گزارش «همهٔ افراد» تاریخ بستن (پرداخت) وارد شده همان، وگرنه امروز
/* تاریخ پرداخت مساعده: از فیلد «تاریخ پرداخت» همان تب (فهرست همه ← aa-paydate، فرم فرد ← ad-paid)؛ خالی یا نامعتبر = هشدار (دیگر امروز جایگزین نمی‌شود) */
function advPayDate(){
  const el=$("#aa-paydate")||$("#ad-paid"),v=el?lat(el.value).trim():"";
  if(!v){if(el)el.focus();throw new Error("تاریخ پرداخت را وارد کنید.")}
  if(!/^\d{4}\/\d{2}\/\d{2}$/.test(v)){if(el)el.focus();throw new Error("تاریخ پرداخت را به‌صورت 1405/07/21 وارد کنید.")}
  return v;
}
const aaQs=a=>`status=${enc(a.status)}`+(a.from?`&from=${enc(a.from)}`:"")+(a.to?`&to=${enc(a.to)}`:"")+(a.pFrom?`&paidFrom=${enc(a.pFrom)}`:"")+(a.pTo?`&paidTo=${enc(a.pTo)}`:"");
async function advFetchAll(){return (await api("GET","/api/advances?"+aaQs(app.wk.aall)+"&all=1")).items}   // همهٔ نتیجهٔ فیلترشده (برای اکسل و عملیات دسته‌جمعی)
async function advAllLoad(){
  const a=app.wk.aall,body=$("#aa-body");if(!body)return;
  let r;
  try{r=await api("GET","/api/advances?"+aaQs(a)+`&page=${a.page||1}&pageSize=${a.size||50}`)}catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  if(r.total&&r.page>r.pages){a.page=r.pages;return advAllLoad()}
  a.items=r.items;a.meta=r;
  const sum=r.sums.amount,sumPay=r.sums.pay;
  body.innerHTML=r.total?`<div class="wk-sum u-m0b10"><div>تعداد<b>${faId(r.total)}</b></div><div>جمع مبلغ مساعده<b>${fa(sum)}</b></div><div class="big">جمع مبلغ واریزی<b>${fa(sumPay)}</b></div></div>
    ${pagerHTML("aa",a.meta)}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>نام و نام خانوادگی</th><th>تاریخ درخواست</th><th>مبلغ</th><th>واریزی</th><th>اقساط</th><th>وضعیت</th><th>تاریخ پرداخت</th><th>ثبت‌کننده</th><th></th></tr></thead><tbody>
    ${a.items.map(x=>`<tr><td>${faId(esc(x.code))}</td><td>${esc((x.firstName+" "+x.lastName).trim()||x.name)}</td><td>${faId(esc(x.requestDate))}</td><td class="money">${fa(x.amount)}</td><td>${fa(advPay(x))}</td><td>${instTxt(x.installments,x.installmentAmount,x.lastInstallmentAmount)}</td><td>${stB(ST_ADV,x.status)}</td><td>${x.paidDate?faId(esc(x.paidDate)):"—"}</td><td>${esc(x.createdBy)}</td>
      <td><div class="wk-tbl-act">${x.status==="pending"?`<button class="btn btn-amber" data-act="adv-paid" data-id="${x.id}">پرداخت شد</button>`:""}${x.closed?`<span class="badge b-dark" title="در «بستن مساعده» بسته شده؛ قابل تغییر نیست">بسته</span>`:""}${x.status==="paid"&&!x.closed?`<button class="btn" data-act="adv-unpaid" data-id="${x.id}" title="برگشت از «پرداخت شده» به «در انتظار پرداخت» (تاریخ پرداخت پاک می‌شود)">برگشت به در انتظار</button>`:""}<button class="btn" data-act="adv-open" data-code="${esc(x.code)}" data-id="${x.id}">باز کردن</button><button class="btn btn-del" data-act="adv-del" data-id="${x.id}">حذف</button></div></td></tr>`).join("")}</tbody></table></div>${pagerHTML("aa",a.meta)}`
    :`<div class="hint">مساعده‌ای با این فیلتر پیدا نشد.</div>`;
}
function readAaFilter(){
  const a=app.wk.aall,re=/^\d{4}\/\d{2}\/\d{2}$/;
  const f=lat(val("aa-from")).trim(),t=lat(val("aa-to")).trim(),pd=lat(val("aa-paydate")).trim();
  if(pd&&!re.test(pd))throw new Error("تاریخ پرداخت را به‌صورت 1405/07/21 وارد کنید.");
  a.payDate=pd;
  const pf=lat(val("aa-pfrom")).trim(),pt=lat(val("aa-pto")).trim();
  if((pf&&!re.test(pf))||(pt&&!re.test(pt)))throw new Error("تاریخ‌های پرداخت را به‌صورت 1405/07/01 وارد کنید.");
  a.pFrom=pf;a.pTo=pt;a.bulkSt=val("aa-bulkst")||"paid";
  if((f&&!re.test(f))||(t&&!re.test(t)))throw new Error("تاریخ‌ها را به‌صورت 1405/07/01 وارد کنید.");
  a.from=f;a.to=t;a.status=val("aa-st");a.page=1;
}
async function advExport(){
  const items=await advFetchAll();
  if(!items.length){showAlert("مساعده‌ای برای خروجی در فهرست نیست.");return}
  const H=["پرسنلی","کد ملی","نام","نام خانوادگی","وضعیت (شاغل/بازنشسته)","شماره حساب مساعده","تاریخ درخواست","مبلغ مساعده","مبلغ واریزی","تعداد اقساط","مبلغ هر قسط","مبلغ قسط آخر","وضعیت مساعده","تاریخ پرداخت","توضیحات","نام کاربر"];
  const rows=items.map(x=>[String(x.code),String(x.nationalId||""),x.firstName,x.lastName,x.personStatus||"",String(x.account||""),x.requestDate,x.amount,advPay(x),x.installments,x.installmentAmount,x.lastInstallmentAmount,(ST_ADV[x.status]||[x.status])[0],x.paidDate||"",x.description||"",x.createdBy||""]);
  await xlsxExport(`mosaede-${todayJalali().replace(/\//g,"-")}.xlsx`,"مساعده",H,rows,[12,14,14,18,16,22,14,16,16,12,16,16,14,14,28,16]);
}
function advSummary(){
  const a=ceilStep(toNum(val("ad-amt")),RS().advance),n=parseInt(lat(val("ad-n")),10)||0,fee=parseFloat(lat(val("ad-fee")))||0;
  $("#ad-sum").innerHTML=`<div>مبلغ مساعده<b>${fa(a)}</b></div><div>کسر ${faId(fee)}٪<b>${fa(a*fee/100)}</b></div><div class="big">مبلغ قابل واریز (روز ${faId(FS().advancePayDay)} ماه)<b>${fa(a*(1-fee/100))}</b></div><div>قسط آخر<b>${fa(lastOfInst(a,toNum(val("ad-inst")),n))}</b></div>`;
}
function advInput(e){
  const id=e.target.id;
  if(id==="ad-inst"){e.target.dataset.touched="1"}
  if(id==="ad-amt"||id==="ad-n"){const inst=$("#ad-inst");if(!inst.dataset.touched){const a=toNum(val("ad-amt")),n=parseInt(lat(val("ad-n")),10)||0;inst.value=a>0&&n>0?mnum(planInst(a,n,RS().advInst).inst):""}}
  advSummary();
}
async function saveAdvance(){
  const p=app.wk.person,cur=app.wk.adv;
  const accIn=lat(val("ad-acc")).replace(/\D/g,"");
  if(!accIn)throw new Error("شمارهٔ حساب مساعده را وارد کنید (۱۳ رقم).");
  if(accIn.length!==13)throw new Error(`حساب مساعده باید دقیقاً ۱۳ رقم باشد (الان ${faId(accIn.length)} رقم است).`);
  const body={requestDate:lat(val("ad-date")).trim(),amount:ceilStep(toNum(val("ad-amt")),RS().advance),installments:parseInt(lat(val("ad-n")),10)||1,installmentAmount:toNum(val("ad-inst")),
    feePercent:parseFloat(lat(val("ad-fee")))||0,phone:lat(val("ad-phone")).trim(),description:val("ad-desc").trim(),account:accIn,owner:val("ad-owner").trim()};
  let id;
  if(cur){await api("PATCH","/api/advances/"+cur.id,body);id=cur.id}
  else id=(await api("POST","/api/advances",Object.assign({code:p.code},body))).id;
  p.advanceAccount=accIn;p.advanceOwner=val("ad-owner").trim();   // سرور حساب مساعدهٔ فرم پرسنلی را هم به‌روز کرده است
  return id;
}
function printAdvance(A){
  const p=app.wk.person;
  const hist=(app.wk.advList||[]).filter(x=>x.id!==A.id&&x.status!=="cancelled"&&x.requestDate<=A.requestDate).sort((a,b)=>a.requestDate.localeCompare(b.requestDate)||a.id-b.id);
  printDoc("فرم مساعده — "+pname(p),()=>docAdvance(p,A,hist),"advance");
}
async function advAction(b){
  const act=b.dataset.act,id=+b.dataset.id;
  try{
    if(act==="adv-new"){renderAdvance();return}
    if(act==="adv-open"){setWkTab("advance","form");app.wk.code=b.dataset.code;app.wk.person=null;await renderWk("advance");return}
    if(act==="adv-save"||act==="adv-saveprint"){
      const nid=await saveAdvance();await renderAdvance(nid);
      if(act==="adv-saveprint")printAdvance(app.wk.advList.find(x=>x.id===nid));else showAlert("مساعده ذخیره شد.");
      return;
    }
    if(act==="adv-print"){printAdvance(app.wk.advList.find(x=>x.id===id));return}
    if(act==="adv-paid"){await api("PATCH","/api/advances/"+id,{status:"paid",paidDate:advPayDate()});await (app.wk.person?renderAdvance(app.wk.adv?app.wk.adv.id:undefined):advAllLoad());return}
    if(act==="adv-unpaid"){
      showConfirm("این مساعده از «پرداخت شده» به «در انتظار پرداخت» برگردد؟ تاریخ پرداخت پاک می‌شود.",async()=>{
        try{await api("PATCH","/api/advances/"+id,{status:"pending"});await (app.wk.person?renderAdvance(app.wk.adv?app.wk.adv.id:undefined):advAllLoad());showAlert("مساعده به «در انتظار پرداخت» برگشت.")}catch(e){showAlert(e.message)}
      });
      return;
    }
    if(act==="adv-cancel"){showConfirm("این مساعده لغو شود؟",async()=>{try{await api("PATCH","/api/advances/"+id,{status:"cancelled"});await renderAdvance()}catch(e){showAlert(e.message)}});return}
    if(act==="adv-del"){
      showConfirm("این مساعده برای همیشه حذف شود؟ این کار قابل بازگشت نیست.",async()=>{
        try{await api("DELETE","/api/advances/"+id);
          if(app.wk.adv&&app.wk.adv.id===+id)app.wk.adv=null;
          if(app.wk.person)await renderAdvance();else await advAllLoad();
          showAlert("مساعده حذف شد.")}catch(e){showAlert(e.message)}});
      return;
    }
    if(act==="aa-filter"){readAaFilter();await advAllLoad();return}
    if(act==="aa-xlsx"){readAaFilter();await advAllLoad();await advExport();return}
    if(act==="aa-bulkstatus"){
      readAaFilter();const st=app.wk.aall.bulkSt,pdate=st==="paid"?advPayDate():null;await advAllLoad();
      const items=(await advFetchAll()).filter(x=>x.status!==st);
      const stName=(ST_ADV[st]||[st])[0];
      if(!items.length){showAlert(`در فهرست فیلترشده مساعده‌ای نیست که وضعیتش با «${stName}» فرق داشته باشد.`);return}
      const by={};items.forEach(x=>{by[x.status]=(by[x.status]||0)+1});
      const brk=Object.entries(by).map(([k,n])=>`${faId(n)} «${(ST_ADV[k]||[k])[0]}»`).join("، ");
      showConfirm(`${faId(items.length)} مساعده (${brk}) به «${stName}» تغییر کند؟${st==="paid"?` تاریخ پرداخت: ${faId(pdate)}`:" تاریخ پرداخت ثبت‌شده پاک می‌شود."}`,async()=>{
        try{const r=await api("POST","/api/advances/bulk-status",{ids:items.map(x=>x.id),status:st,paidDate:pdate});
          await advAllLoad();if(app.wk.person)await renderAdvance(app.wk.adv?app.wk.adv.id:undefined);showAlert(`${faId(r.changed)} مساعده «${stName}» شد.`)}catch(e){showAlert(e.message)}
      });
    }
  }catch(err){showAlert(err.message)}
}

