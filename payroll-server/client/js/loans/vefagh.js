"use strict";
/* loans/vefagh.js — وام وفاق و لغو عضویت
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("loans/vefagh");
/* =============================== وام وفاق =============================== */
// عملیات عضویت، افزایش سرمایه، تسویه وام و لغو عضویت؛ مشابه «عملیات وام» صفحهٔ ثبت وام، با کدهای کسر («تنظیمات ← تعریف کدهای مهم») و سوابق جداگانه
const VF_KIND={1:"افزایش سرمایه",2:"تسویه وام",3:"عضویت",4:"لغو عضویت"};
/* فرم وام وفاق (نامه به کارشناسی تعاون): عضویت / افزایش سرمایه / تسویه وام */
function docVefagh(p,C){ app.docCtx=p;
  const F="vcapital",emp=p.status==="بازنشسته"?"بازنشسته":"شاغل",kind=VF_KIND[C.kind]||"افزایش سرمایه";
  const V={name:esc(pname(p)),code:faId(esc(p.code)),emp,amount:rial(C.amount),kind,slip:faId(esc(C.slipNo||""))};
  const cd=C.codes||{};
  return `<div class="doc">${dHead(ftx(F,"bismillah","بسمه تعالی"),"",C.date)}
    <h1 class="d-title">${ftx(F,"title","فرم {kind} — وام وفاق",V)}</h1>
    <div style="font-weight:700">${ftx(F,"to","به کارشناسی محترم تعاون آموزش و پرورش ناحیه یک قزوین")}</div>
    <p class="d-p">${ftx(F,"p1","با سلام و احترام؛ اینجانب {name} با کد پرسنلی {code} نیروی {emp} نسبت به مبلغ {amount} بابت {kind} وام وفاق با شمارهٔ فیش {slip} اقدام فرمایید.",V)}</p>
    <div class="d-fg c3" style="margin-top:8px">${dFl("تاریخ",faId(esc(C.date)))}${C.kind===3?dFl("سرمایهٔ وام وفاق"+(cd.capital?` (کد ${faId(esc(cd.capital))})`:""),rial(C.amount)):dFl(C.kind===2?"سرمایه":"سرمایهٔ قبلی",C.capital!=null?rial(C.capital):"—")}${C.kind===1?dFl("سرمایهٔ جدید",C.newCapital!=null?rial(C.newCapital):"—"):""}${C.kind===3?dFl("قسط ماهانه",rial(C.installment||0)):dFl("مانده وام وفاق"+(cd.loan?` (کد ${faId(esc(cd.loan))})`:""),rial(C.loan||0))}</div>
    ${dSigs(F,[`<div class="d-sig hl">${ftx(F,"s1","امضاء")}</div>`])}${dFoot()}</div>`;
}
/* فرم انصراف و تسویه حساب از وام وفاق (لغو عضویت) */
function docVefaghCancel(p,C){ app.docCtx=p;
  const F="vcancel",f=FS(),cd=C.codes||{};
  const emp=p.status==="بازنشسته"?"بازنشسته":"شاغل";
  const V={org:esc(f.orgName),name:esc(pname(p)),emp,code:faId(esc(p.code)),days:faId(90),amount:rial(C.payable)};
  return `<div class="doc">${dHead(ftx(F,"bismillah","بسمه تعالی"),"",C.date)}
    <h1 class="d-title">${ftx(F,"title","فرم انصراف و تسویه حساب از وام وفاق")}</h1>
    <div style="font-weight:700">${ftx(F,"to","به: کارشناسی تعاون و امور رفاهی\nمدیریت {org}",V)}</div>
    <p class="d-p">${ftx(F,"p1","با سلام و احترام؛ اینجانب {name} با کد پرسنلی {code} نیروی {emp}، درخواست انصراف و تسویه حساب از وام وفاق را دارم. در ضمن متعهد می‌گردم حداقل به مدت {days} روز تقاضای عضویت مجدد نداشته باشم.",V)}</p>
    <div class="d-fg c3" style="margin-top:8px">${dFl("سرمایهٔ وام وفاق"+(cd.capital?` (کد ${faId(esc(cd.capital))})`:""),C.capital!=null?rial(C.capital):"—")}${dFl("مانده وام وفاق"+(cd.loan?` (کد ${faId(esc(cd.loan))})`:""),rial(C.loanRemaining||0))}${dFl("مبلغ قابل پرداخت",rial(C.payable))}</div>
    <div class="d-amt"><span>${ftx(F,"amt","مبلغ قابل پرداخت:")}</span><b>${rial(C.payable)}</b></div>
    <p class="d-p">${ftx(F,"p2","مبلغ فوق چند روز بعد از پرداخت حقوق ماه آینده به حساب شما واریز خواهد شد.",V)}</p>
    ${dSigs(F,[`<div class="d-sig hl">${ftx(F,"s1","امضاء متقاضی")}</div>`,`<div class="d-sig">${ftx(F,"s2","کارشناسی تعاون و امور رفاهی")}</div>`],"margin-top:14px")}
    ${dFoot()}</div>`;
}
async function renderVefagh(selId){
  const root=$("#wk-vefagh"),p=app.wk.person;
  if(!p){root.oninput=null;root.innerHTML=pbar("vefagh")+emptyMsg("برای ثبت عملیات وام وفاق، ابتدا یک نفر را انتخاب کنید.");bindPbar("vefagh",root);return}
  let d={items:[],snapshot:null,codes:{capital:"",loan:""},cancelDate:""};
  try{d=await api("GET","/api/vefagh/by-person/"+enc(p.code))}catch(e){showAlert(e.message)}
  app.wk.vf=d;
  const sel=selId?d.items.find(x=>x.id===selId):null;app.wk.vfSel=sel||null;
  const sn=d.snapshot,cd=d.codes||{capital:"",loan:""};
  const X=sel&&sel.kind!==4?sel:{kind:1,date:todayJalali(),amount:"",slipNo:"",installment:""};
  const warn=!cd.capital?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb10">ℹ کد سرمایهٔ وام وفاق هنوز تعریف نشده است؛ ابتدا در «تنظیمات ← تعریف کدهای مهم» کد سرمایه (و کد وام) وام وفاق را وارد کنید.</div>`:"";
  const sum=sn?`<div class="wk-sum"><span>سرمایه${cd.capital?` (کد ${faId(esc(cd.capital))})`:""}: <b>${sn.capital.has?fa(sn.capital.remaining):"—"}</b></span><span>قسط سرمایه: <b>${fa(sn.capital.installment)}</b></span><span>مانده وام وفاق${cd.loan?` (کد ${faId(esc(cd.loan))})`:""}: <b>${fa(sn.loan.remaining)}</b></span><span class="badge b-blue">آخرین فیش: ${MONTHS[sn.month-1]} ${faId(sn.year)}</span>${d.cancelDate?`<span class="badge b-red">عضویت لغو شده: ${faId(esc(d.cancelDate))}</span>`:""}</div>`:`<div class="hint u-mt10">برای این فرد فیش حقوقی پیدا نشد؛ افزایش سرمایه بدون فیش ثبت نمی‌شود.${d.cancelDate?` <span class="badge b-red">عضویت لغو شده: ${faId(esc(d.cancelDate))}</span>`:""}</div>`;
  const rows=d.items.map(x=>`<tr data-act="vf-pick" data-lid="${x.id}"${sel&&sel.id===x.id?' class="sel"':""}><td>${x.kind===4||x.prevCapital==null?"—":fa(x.prevCapital)}</td><td>${fa(x.amount)}</td><td>${x.kind===1&&x.newCapital!=null?fa(x.newCapital):x.kind===3&&x.newCapital!=null?fa(x.newCapital):"—"}</td><td>${faId(esc(x.date))}</td><td>${faId(esc(x.slipNo))}</td><td>${VF_KIND[x.kind]||""}</td><td>${x.changeId?(x.changeClosed?'<span class="badge b-green">بسته‌شده</span>':'<span class="badge b-amber">در تغییرات ماهانه</span>'):(x.kind===4?'<span class="badge b-dark">—</span>':'<span class="badge b-red">بدون ردیف تغییر</span>')}</td></tr>`).join("");
  root.innerHTML=pbar("vefagh")+`<div class="card"><h2><svg class="i"><use href="#i-coins"/></svg>وام وفاق — عملیات وام ${sel?`<span class="badge b-blue">${sel.kind===4?"لغو عضویت":"ویرایش ردیف"}</span>`:""}</h2>${warn}${sum}
    <div class="cap-form">
      <label class="f">تاریخ<input id="vf-date" class="ltr" value="${esc(X.date||"")}" placeholder="1405/07/21"></label>
      <label class="f">نوع<select id="vf-kind"><option value="1"${X.kind===1?" selected":""}>افزایش سرمایه</option><option value="2"${X.kind===2?" selected":""}>تسویه وام</option><option value="3"${X.kind===3?" selected":""}>عضویت</option></select></label>
      <label class="f">مبلغ (ریال)<input id="vf-amt" class="ltr" data-money inputmode="numeric" value="${X.amount?mnum(X.amount):""}"></label>
      <label class="f">شمارهٔ فیش<input id="vf-slip" class="ltr" inputmode="numeric" maxlength="30" value="${esc(X.slipNo||"")}"></label>
      <label class="f" id="vf-instwrap">قسط ماهانهٔ سرمایه (ریال) — فقط عضویت؛ خالی = سهم صندوق (از فیش)<input id="vf-inst" class="ltr" data-money inputmode="numeric" value="${X.installment?mnum(X.installment):""}"></label>
    </div>
    <div class="cap-prev" id="vf-prev"></div>
    <div class="wk-acts">
      <button class="btn btn-main" data-act="vf-save"><svg class="i"><use href="#i-file"/></svg>ذخیره</button>
      <button class="btn" data-act="vf-new">جدید</button>
      <button class="btn btn-blue" data-act="vf-print"><svg class="i"><use href="#i-print"/></svg>چاپ فرم</button>
      <button class="btn btn-del" data-act="vf-cancelmem" title="کسر مانده وام از سرمایه، ایجاد ردیف «حذف» در تغییرات ماهانه و چاپ فرم انصراف و تسویه حساب از وام وفاق">لغو عضویت${d.cancelDate?` <small>(${faId(esc(d.cancelDate))})</small>`:""}</button>
      ${sel?`<button class="btn btn-del" data-act="vf-del">حذف</button>`:""}
    </div></div>
    <div class="card"><h2><svg class="i"><use href="#i-file"/></svg>سوابق وام وفاق</h2>${d.items.length?`<div class="tbl-wrap"><table class="tbl cap-tbl"><thead><tr><th>سرمایهٔ قبلی</th><th>مبلغ</th><th>سرمایهٔ جدید</th><th>تاریخ</th><th>شمارهٔ فیش</th><th>نوع</th><th>تغییرات ماهانه</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint u-m-8-0-0">برای ویرایش، چاپ مجدد یا حذف، روی ردیف کلیک کنید. با ویرایش/حذف، ردیف مربوط در «تغییرات ماهانه» هم به‌روز/حذف می‌شود (تا وقتی «بسته» نشده باشد).</p>`:'<div class="hint">هنوز چیزی ثبت نشده است.</div>'}</div>`;
  bindPbar("vefagh",root);
  root.oninput=vfPreview;root.onchange=vfPreview;
  vfPreview();
}
const vfKindNow=()=>{const e=$("#vf-kind");return e?(+e.value||1):1};
function vfPreview(){
  const el=$("#vf-prev");if(!el)return;
  const d=app.wk.vf||{},sn=d.snapshot,cd=d.codes||{capital:"",loan:""},ctx=d.ctx||{},amt=toNum(val("vf-amt")),k=vfKindNow(),iw=$("#vf-instwrap");
  if(iw)iw.style.display=k===3?"":"none";
  let h;
  if(!cd.capital&&k!==2)h=`<span class="bad">کد سرمایهٔ وام وفاق تعریف نشده است.</span>`;
  else if(k===2)h=cd.loan?`در «تغییرات ماهانه» برای کد ${faId(esc(cd.loan))} (وام وفاق) یک ردیف <b>حذف</b> ثبت می‌شود.`:`<span class="bad">کد وام وفاق در «تنظیمات ← تعریف کدهای مهم» تعریف نشده است.</span>`;
  else if(k===3){const inst=toNum(val("vf-inst"))||(ctx.fundShare||0);h=`در «تغییرات ماهانه» برای کد ${faId(esc(cd.capital))} یک ردیف <b>ایجاد</b> ثبت می‌شود: کل و مانده <b>${fa(amt)}</b> (= مبلغ)، قسط = ${toNum(val("vf-inst"))?"مبلغ واردشده":ctx.shareSource==="slip"?"سهم صندوق از آخرین فیش (کد "+faId(esc(cd.capital))+")":"سهم صندوق از تنظیمات"} <b>${fa(inst)}</b>.`}
  else if(!sn||!sn.capital.has)h=`<span class="bad">در آخرین فیش، کد سرمایه (${faId(esc(cd.capital))}) پیدا نشد؛ افزایش سرمایه ثبت نمی‌شود. برای عضو جدید «عضویت» را انتخاب کنید.</span>`;
  else{
    // همان فرمول «عملیات وام» صفحهٔ ثبت وام: بازهٔ الف (بعد از بستن حقوق تا ساخت دوره) با سهم صندوق، بازهٔ ب بدون آن
    const pend=d.pending&&!(app.wk.vfSel&&d.pending.id===app.wk.vfSel.id)?d.pending:null,ph=capPhase(lat(val("vf-date")).trim(),ctx);
    const base=pend?pend.newCapital:sn.capital.remaining,share=ph.phase==="A"&&!pend?(ctx.fundShare||0):0,v=base+amt+share;
    const M=ph.c?`${MONTHS[ph.c.month-1]} ${faId(ph.c.year)}`:"";
    h=`سرمایهٔ فعلی <b>${fa(base)}</b> + مبلغ پرداختی <b>${fa(amt)}</b>${share?` + سهم صندوق <b>${fa(share)}</b>${ctx.shareSource==="slip"?` (قسط کد ${faId(esc(cd.capital))} در آخرین فیش)`:" (از تنظیمات؛ این فرد کد وفاق در فیش ندارد)"}`:""} = سرمایهٔ جدید <b>${fa(v)}</b> ریال. در «تغییرات ماهانه» برای کد ${faId(esc(cd.capital))} یک ردیف <b>اصلاح</b> ثبت می‌شود: قسط <b>${fa(sn.capital.installment)}</b>، کل و مانده <b>${fa(v)}</b> — `+(pend?"بعد از افزایش سرمایهٔ قبلی که هنوز در فیش نیامده.":ph.phase==="A"?`تاریخ بعد از بستن حقوق ${M} و قبل از ایجاد دورهٔ ${M} است (با سهم صندوق).`:ph.c?`تاریخ بعد از ایجاد دورهٔ ${M} است (بدون سهم صندوق).`:"هنوز بستن حقوقی ثبت نشده است (بدون سهم صندوق).");
  }
  el.innerHTML=h;
}
const vfRead=()=>({kind:vfKindNow(),date:lat(val("vf-date")).trim(),amount:toNum(val("vf-amt")),slipNo:lat(val("vf-slip")).trim(),installment:toNum(val("vf-inst"))});
function vfPrintRec(p,rec,cd){
  if(rec.kind===4){printDoc("فرم انصراف و تسویه حساب (وام وفاق) — "+pname(p),()=>docVefaghCancel(p,{date:rec.date,capital:rec.prevCapital,loanRemaining:rec.loanRemaining,payable:rec.amount,codes:cd}),"vcancel");return}
  const C={date:rec.date,kind:rec.kind,amount:rec.amount,slipNo:rec.slipNo,capital:rec.prevCapital,newCapital:rec.newCapital,loan:rec.loanRemaining,installment:rec.installment,codes:cd};
  printDoc((VF_KIND[rec.kind]||"فرم")+" (وام وفاق) — "+pname(p),()=>docVefagh(p,C),"vcapital");
}
async function vfAction(act,lid){
  const p=app.wk.person;if(!p)return;
  if(act==="vf-new"){await renderVefagh();return}
  if(act==="vf-pick"){await renderVefagh(+lid);return}
  if(act==="vf-cancelmem"){await vfCancelMembership();return}
  const s=app.wk.vfSel,cd=(app.wk.vf&&app.wk.vf.codes)||{capital:"",loan:""};
  if(act==="vf-del"){
    if(!s)return;
    showConfirm(`ردیف ${VF_KIND[s.kind]}${s.slipNo?" (فیش "+faId(s.slipNo)+")":""} و ردیف مربوط در «تغییرات ماهانه» حذف شود؟`,async()=>{
      try{await api("DELETE","/api/vefagh/"+s.id);await renderVefagh();showAlert("ردیف حذف شد.")}catch(e){showAlert(e.message)}
    });
    return;
  }
  try{
    if(s&&s.kind===4){if(act==="vf-print")vfPrintRec(p,s,cd);else showAlert("ردیف «لغو عضویت» قابل ویرایش نیست؛ برای ثبت دوباره، آن را حذف کنید.");return}
    const b=vfRead(),same=s&&s.kind===b.kind&&s.date===b.date&&s.amount===Math.round(b.amount)&&s.slipNo===b.slipNo&&(b.kind!==3||(s.installment||0)===Math.round(b.installment));
    let rec=s&&same?s:null,msg="";
    if(!rec){
      const r=s?await api("PATCH","/api/vefagh/"+s.id,b):await api("POST","/api/vefagh",Object.assign({code:p.code},b));
      msg=b.kind===2?`ثبت شد. در «تغییرات ماهانه» برای کد ${faId(cd.loan)} ردیف «حذف» ایجاد شد.`:b.kind===3?`عضویت وام وفاق ثبت شد. در «تغییرات ماهانه» برای کد ${faId(cd.capital)} ردیف «ایجاد» با کل و مانده ${fa(r.changeValue)} ریال ایجاد شد.`:`ثبت شد. سرمایهٔ جدید ${fa(r.newCapital)} ریال${r.fundShare?` (با سهم صندوق ${fa(r.fundShare)})`:""}؛ در «تغییرات ماهانه» برای کد ${faId(cd.capital)} ردیف «اصلاح» با کل و مانده ${fa(r.changeValue)} ریال ایجاد شد.`;
      await renderVefagh(r.id);rec=app.wk.vfSel;
    }
    if(act==="vf-save"){showAlert(msg||"این ردیف قبلاً ذخیره شده و تغییری نکرده است.");return}
    if(!rec)return;
    vfPrintRec(p,rec,(app.wk.vf&&app.wk.vf.codes)||cd);
  }catch(err){showAlert(err.message)}
}
async function vfCancelMembership(){
  const p=app.wk.person;if(!p)return;
  let S;try{S=await api("GET","/api/vefagh/settlement/"+enc(p.code))}catch(e){showAlert(e.message);return}
  const cd=S.codes||{capital:"",loan:""};
  if(!cd.capital){showAlert("کد سرمایهٔ وام وفاق در «تنظیمات ← تعریف کدهای مهم» تعریف نشده است.");return}
  const already=(app.wk.vf&&app.wk.vf.cancelDate)||"";
  const warn=[];
  if(!S.hasPayslip)warn.push("برای این فرد هنوز فیشی ثبت نشده است؛ سرمایه و مانده وام را دستی وارد کنید.");
  else if(!S.member)warn.push(`در آخرین فیش، کد ${faId(cd.capital)} (سرمایهٔ وام وفاق) برای این فرد دیده نمی‌شود؛ مقدار را بررسی کنید.`);
  const html=`<p class="hint u-m0b10">مبلغ قابل پرداخت = سرمایهٔ وام وفاق (کد ${faId(cd.capital)}) − آخرین مانده وام وفاق${cd.loan?` (کد ${faId(cd.loan)})`:""}${S.year?` — از فیش ${MONTHS[S.month-1]} ${faId(S.year)}`:""}. با ثبت، در «تغییرات ماهانه» ردیف «حذف» برای ${cd.loan?`کد ${faId(cd.loan)} و `:""}کد ${faId(cd.capital)} ایجاد می‌شود.</p>
    ${already?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb10">عضویت این فرد قبلاً در تاریخ ${faId(esc(already))} لغو شده است؛ ثبت دوباره یک ردیف دیگر می‌سازد.</div>`:""}
    ${warn.map(x=>`<div class="pf-msg u-bg-red-soft u-c-red-ink u-mb10">⚠ ${esc(x)}</div>`).join("")}
    ${dlgField("تاریخ لغو عضویت","cm-date",todayJalali(),'class="ltr" placeholder="1405/07/21"')}
    ${dlgField(`سرمایهٔ وام وفاق — کد ${faId(cd.capital)} (ریال)`,"cm-cap",mnum(S.capital||0),'data-money inputmode="numeric"')}
    ${dlgField(`آخرین مانده وام وفاق${cd.loan?` — کد ${faId(cd.loan)}`:""} (ریال)`,"cm-rem",mnum(S.loanRemaining||0),'data-money inputmode="numeric"')}
    <div class="wk-sum" id="cm-sum"></div>`;
  const w=openDlg({title:"لغو عضویت وام وفاق — "+pname(p),html,okText:"ثبت لغو عضویت و چاپ فرم",wide:true,onOk:async w=>{
    const date=lat(dv(w,"cm-date")).trim();
    if(!/^\d{4}\/\d{2}\/\d{2}$/.test(date))throw new Error("تاریخ را به‌صورت 1405/07/21 وارد کنید.");
    const cap=toNum(dv(w,"cm-cap")),rem=toNum(dv(w,"cm-rem")),payable=Math.max(0,cap-rem);
    const r=await api("POST","/api/vefagh/cancel/"+enc(p.code),{date,capital:cap,loanRemaining:rem});
    await renderVefagh();
    printDoc("فرم انصراف و تسویه حساب (وام وفاق) — "+pname(p),()=>docVefaghCancel(p,{date,capital:cap,loanRemaining:rem,payable:r.payable!=null?r.payable:payable,codes:cd}),"vcancel");
    showAlert(`لغو عضویت وام وفاق ثبت شد؛ در «تغییرات ماهانه» ${faId(r.changeRows)} ردیف «حذف» ایجاد شد.`);
  }});
  mkMoney(w);
  const sum=()=>{const cap=toNum(dv(w,"cm-cap")),rem=toNum(dv(w,"cm-rem"));w.querySelector("#cm-sum").innerHTML=`<div>سرمایه<b>${fa(cap)}</b></div><div>مانده وام<b>${fa(rem)}</b></div><div class="big">مبلغ قابل پرداخت<b>${fa(Math.max(0,cap-rem))}</b></div>`};
  w.addEventListener("input",sum);sum();
}
$("#wk-vefagh").addEventListener("click",e=>{
  const b=e.target.closest("[data-act^='vf-']");if(!b)return;
  vfAction(b.dataset.act,b.dataset.lid);
});

/* =============================== لغو عضویت (صندوق وام ضروری) =============================== */
// مبلغ قابل پرداخت = سرمایه (کد ۷۹۶) − آخرین مانده وام (کد ۷۱۰) از آخرین فیش؛ با ثبت، تاریخ لغو عضویت در پرونده فرد ذخیره و فرم چاپ می‌شود
async function cancelMembership(){
  const p=app.wk.person;if(!p)return;
  let S;try{S=await api("GET","/api/loan-queue/settlement/"+enc(p.code))}catch(e){showAlert(e.message);return}
  const kcx=S.codes||KCP(p);   // کدهای گروهِ فرد (شاغل / بازنشسته)
  const already=S.cancelDate||p.membershipCancelDate||"";
  const warn=[];
  if(!S.hasPayslip)warn.push("برای این فرد هنوز فیشی ثبت نشده است؛ سرمایه و مانده وام را دستی وارد کنید.");
  else{
    if(!S.member)warn.push(`در آخرین فیش، کد ${faId(kcx.capital)} (سرمایهٔ صندوق) برای این فرد دیده نمی‌شود؛ مقدار را بررسی کنید.`);
    if(S.negative)warn.push(`مانده وام (${faId(kcx.loan1)}) از سرمایه بیشتر است؛ مبلغ قابل پرداخت صفر محاسبه می‌شود.`);
  }
  const html=`<p class="hint u-m0b10">مبلغ قابل پرداخت = سرمایهٔ صندوق (کد ${faId(kcx.capital)}) − آخرین مانده وام (کد ${faId(kcx.loan1)})${S.year?` — از فیش ${MONTHS[S.month-1]} ${faId(S.year)}`:""}. با ثبت، تاریخ لغو عضویت در پروندهٔ فرد ذخیره می‌شود و نوبت‌های وامِ «در انتظار» او (در صورت وجود) «انصراف» می‌شوند.</p>
    ${already?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb10">عضویت این فرد قبلاً در تاریخ ${faId(esc(already))} لغو شده است؛ ثبت دوباره، تاریخ و مبلغ را به‌روز می‌کند (و فرم دوباره چاپ می‌شود).</div>`:""}
    ${warn.map(x=>`<div class="pf-msg u-bg-red-soft u-c-red-ink u-mb10">⚠ ${esc(x)}</div>`).join("")}
    ${dlgField("تاریخ لغو عضویت","cm-date",already||todayJalali(),'class="ltr" placeholder="1405/07/21"')}
    ${dlgField(`سرمایهٔ صندوق — کد ${faId(kcx.capital)} (ریال)`,"cm-cap",mnum(S.capital||0),"data-money inputmode=\"numeric\"")}
    ${dlgField(`آخرین مانده وام — کد ${faId(kcx.loan1)} (ریال)`,"cm-rem",mnum(S.loanRemaining||0),"data-money inputmode=\"numeric\"")}
    <div class="wk-sum" id="cm-sum"></div>`;
  const w=openDlg({title:"لغو عضویت — "+pname(p),html,okText:"ثبت لغو عضویت و چاپ فرم",wide:true,onOk:async w=>{
    const date=lat(dv(w,"cm-date")).trim();
    if(!/^\d{4}\/\d{2}\/\d{2}$/.test(date))throw new Error("تاریخ را به‌صورت 1405/07/21 وارد کنید.");
    const cap=toNum(dv(w,"cm-cap")),rem=toNum(dv(w,"cm-rem")),payable=Math.max(0,cap-rem);
    const r=await api("POST","/api/loan-queue/cancel-membership/"+enc(p.code),{date,amount:payable});
    p.membershipCancelDate=date;p.membershipCancelAmount=payable;
    const C={date,capital:cap,loanRemaining:rem,payable,codes:kcx};
    await renderLoan();
    printDoc("فرم انصراف و تسویه حساب — "+pname(p),()=>docCancel(p,C),"cancel");
    showAlert(`لغو عضویت ثبت شد؛ در «تغییرات ماهانه» دو ردیف «حذف» (کد ${faId(kcx.loan1)} و کد ${faId(kcx.capital)}) ایجاد شد.`+(r.cancelledQueue?` ${faId(r.cancelledQueue)} نوبت وام «در انتظار» این فرد هم انصراف شد.`:""));
  }});
  mkMoney(w);
  const sum=()=>{const cap=toNum(dv(w,"cm-cap")),rem=toNum(dv(w,"cm-rem"));w.querySelector("#cm-sum").innerHTML=`<div>سرمایه (${faId(kcx.capital)})<b>${fa(cap)}</b></div><div>مانده وام (${faId(kcx.loan1)})<b>${fa(rem)}</b></div><div class="big">مبلغ قابل پرداخت<b>${fa(Math.max(0,cap-rem))}</b></div>`};
  w.addEventListener("input",sum);sum();
}

