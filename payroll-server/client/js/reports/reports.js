"use strict";
/* reports/reports.js — گزارش‌های مالی و کسورات
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("reports/reports");
/* ====================== گزارش‌های مالی (بر اساس تاریخ بستن حقوق) ====================== */
app.rep={fy:0,fm:0,y:0,m:0,adv:0,goods:1,loan:2,data:null,init:false,tab:"fin",ded:{y:0,m:0,q:"",sort:"code",view:"active",data:null},dp:{fy:0,fm:0,ty:0,tm:0,code:"",data:null}};
async function renderReports(){
  const root=$("#wk-reports"),r=app.rep;
  if(!r.init){
    let cl=[];try{cl=(await api("GET","/api/closings")).items}catch(e){}
    if(cl.length){r.y=cl[0].year;r.m=cl[0].month}else{r.y=curY();r.m=curM()+1}   // پیش‌فرض: آخرین ماهِ بسته‌شده
    r.fy=r.y;r.fm=r.m;r.init=true;
  }
  const msel=(id,v)=>`<select id="${id}">${MONTHS.map((n,i)=>`<option value="${i+1}"${v===i+1?" selected":""}>${n}</option>`).join("")}</select>`;
  root.innerHTML=`<div class="rp-tabs"><button data-rptab="ded"${r.tab==="ded"?' class="on"':""}>گزارش تجمیعی کسورات</button><button data-rptab="dp"${r.tab==="dp"?' class="on"':""}>گزارش کسور اقساط</button><button data-rptab="fin"${r.tab!=="ded"&&r.tab!=="dp"?' class="on"':""}>مساعده، کالا و وام</button></div>
    <div id="rp-pane-fin"${r.tab==="ded"||r.tab==="dp"?" hidden":""}><div class="card"><h2><svg class="i"><use href="#i-dash"/></svg>گزارش‌های مالی: مساعده، کالا و وام</h2>
    <p class="hint u-m0b10">بازهٔ گزارش از روی «تاریخ بستن فایل حقوق» تعیین می‌شود: از روز بعد از بستن ماهِ قبلِ «از ماه» تا تاریخ بستن «تا ماه» (مثلاً حقوق مهر = ۱۴۰۵/۰۶/۱۶ تا ۱۴۰۵/۰۷/۱۵). مانده و پیش‌بینی بر اساس «برنامهٔ اقساط» برآورد می‌شود (به فیش حقوقی وصل نیست) و قسط‌های بعد از «تا ماه» «مانده» حساب می‌شوند.</p>
    <div class="fgrid">
      <label class="f">از ماه حقوقی${""}${msel("rp-fm",r.fm)}</label>
      <label class="f">سال<input id="rp-fy" type="number" value="${r.fy}"></label>
      <label class="f">تا ماه حقوقی${msel("rp-m",r.m)}</label>
      <label class="f">سال<input id="rp-y" type="number" value="${r.y}"></label>
      <label class="f">شروع کسر مساعده (ماه بعد از پرداخت)<input id="rp-adv" type="number" min="0" max="12" value="${r.adv}"></label>
      <label class="f">شروع کسر کالا (ماه بعد از درخواست)<input id="rp-goods" type="number" min="0" max="12" value="${r.goods}"></label>
      <label class="f">شروع کسر وام (ماه بعد از نوبت)<input id="rp-loan" type="number" min="0" max="12" value="${r.loan}"></label>
    </div>
    <div class="wk-acts"><button class="btn btn-main" id="rp-go">به‌روزرسانی گزارش</button><span class="sp"></span><button class="btn btn-blue" id="rp-xlsx">خروجی اکسل (همهٔ گزارش‌ها)</button></div></div>
    <div id="rp-body" class="u-mt14"><div class="hint" role="status">در حال بارگذاری…</div></div></div>
    <div id="rp-pane-ded"${r.tab==="ded"?"":" hidden"}></div><div id="rp-pane-dp"${r.tab==="dp"?"":" hidden"}></div>`;
  root.querySelectorAll("[data-rptab]").forEach(b=>b.onclick=()=>{
    r.tab=b.dataset.rptab;
    root.querySelectorAll("[data-rptab]").forEach(x=>x.classList.toggle("on",x===b));
    $("#rp-pane-fin").hidden=r.tab==="ded"||r.tab==="dp";$("#rp-pane-ded").hidden=r.tab!=="ded";$("#rp-pane-dp").hidden=r.tab!=="dp";
    if(r.tab==="ded")renderDedReport();
    if(r.tab==="dp")renderDpReport();
  });
  if(r.tab==="ded")renderDedReport();
  if(r.tab==="dp")renderDpReport();
  $("#rp-go").addEventListener("click",()=>{rpRead();rpLoad()});
  $("#rp-xlsx").addEventListener("click",async()=>{try{rpRead();await rpLoad();await rpExport()}catch(e){showAlert(e.message)}});
  rpLoad();
}
function rpRead(){
  const r=app.rep,gi=id=>parseInt(lat(val(id)),10);
  r.m=+val("rp-m");r.y=gi("rp-y")||r.y;r.fm=+val("rp-fm");r.fy=gi("rp-fy")||r.fy;
  if(r.fy*12+r.fm>r.y*12+r.m){r.fy=r.y;r.fm=r.m}                    // «از» نباید بعد از «تا» باشد
  r.adv=gi("rp-adv")||0;r.goods=gi("rp-goods")||0;r.loan=gi("rp-loan")||0;
}
async function rpLoad(){
  const r=app.rep,body=$("#rp-body");
  try{r.data=await api("GET",`/api/reports/summary?y=${r.y}&m=${r.m}&fy=${r.fy}&fm=${r.fm}&advOffset=${r.adv}&goodsOffset=${r.goods}&loanOffset=${r.loan}`)}catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  const d=r.data,rg=d.range,ymF=s=>{const [y,m]=s.split("/");return MONTHS[+m-1]+" "+faId(y)};
  let note="";
  if(!rg.hasClosings)note="هنوز تاریخ بستن حقوقی ثبت نشده است؛ گزارش بر اساس ماه تقویمی محاسبه شد. از بخش «بستن فایل حقوق» ثبت کنید.";
  else if(!rg.exactFrom||!rg.exactTo)note=`برای ${!rg.exactFrom?"ماه قبل از «از ماه»":""}${!rg.exactFrom&&!rg.exactTo?" و ":""}${!rg.exactTo?"ماه «تا ماه»":""} تاریخ بستن ثبت نشده؛ ${!rg.exactFrom?"ابتدای ماه تقویمی":""}${!rg.exactFrom&&!rg.exactTo?" و ":""}${!rg.exactTo?"پایان ماه تقویمی":""} در نظر گرفته شد.`;
  const rngCard=`<div class="card u-bds4-blue"><h2><svg class="i"><use href="#i-lock"/></svg>بازهٔ گزارش: از ${faId(rg.from)} تا ${faId(rg.to)}</h2>
    <p class="hint u-m0b10">ماه‌های حقوقی ${ymF(rg.fromYm)}${rg.fromYm!==rg.toYm?" تا "+ymF(rg.toYm):""}${note?` — <span class="u-c-amber-ink">${note}</span>`:""}</p>
    <div class="g2 u-gtc-fit260">${[["مساعده",d.advances],["فروش اقساطی کالا",d.goods],["وام",d.loans]].map(([t,x])=>`<div class="since-grid u-gtc-1"><div><b class="u-fs14">${t}</b>ثبت‌شده در بازه: <b class="u-inline">${faId(x.registered.count)} مورد — ${fa(x.registered.amount)}</b><br>کسر برآوردی از حقوق در بازه: <b class="u-inline">${fa(x.deducted)}</b></div></div>`).join("")}</div></div>`;
  const card=(t,x,extra="")=>`<div class="card"><h2>${t}</h2><div class="wk-sum u-m0b10"><div>بدهکار فعال<b>${faId(x.active)} نفر/مورد</b></div><div class="big">مانده اقساط (ریال)<b>${fa(x.remainingAmount)}</b></div><div>کسر ماه ${ymF(rg.toYm)}<b>${fa(x.dueNow)}</b></div>${extra}</div>
    <details><summary class="hint u-pointer">فهرست تفصیلی (${faId(x.items.length)} مورد)</summary>${x.items.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>نام</th><th>شاغل/بازنشسته</th><th>بدهی</th><th>اقساط</th><th>شروع کسر</th><th>اقساط باقی‌مانده</th><th>مانده (ریال)</th></tr></thead><tbody>${x.items.map(i=>`<tr><td>${faId(esc(i.code))}</td><td>${esc(i.name)}</td><td>${statusBadge(i.personStatus)}</td><td>${fa(i.total)}</td><td>${instTxt(i.installments,i.installmentAmount,i.lastInstallmentAmount)}</td><td>${ymF(i.startYm)}</td><td>${faId(i.remainingCount)}</td><td class="money">${fa(i.remainingAmount)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">موردی نیست.</div>`}</details></div>`;
  const mx=Math.max(1,...d.projection.map(p=>p.total));
  const mon=(t,x,lab)=>`<div class="card"><h2>${t}</h2>${x.monthly.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ماه حقوقی</th><th>تعداد</th><th>${lab}</th></tr></thead><tbody>${x.monthly.map(m=>`<tr><td>${ymF(m.ym)}</td><td>${faId(m.count)}</td><td class="money">${fa(m.amount)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">در ۱۲ ماه حقوقی منتهی به «تا ماه» موردی ثبت نشده است.</div>`}</div>`;
  body.innerHTML=rngCard+`<div class="card u-mt14"><h2><svg class="i"><use href="#i-coins"/></svg>پیش‌بینی کسر ماهانه از حقوق (ماه ${ymF(rg.toYm)} و ۱۱ ماه بعد)</h2>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ماه</th><th>مساعده</th><th>کالا</th><th>وام</th><th>جمع</th><th class="u-minw160"></th></tr></thead><tbody>
    ${d.projection.map(p=>`<tr><td>${ymF(p.ym)}</td><td>${fa(p.advance)}</td><td>${fa(p.goods)}</td><td>${fa(p.loan)}</td><td class="money">${fa(p.total)}</td><td><div style="height:10px;border-radius:5px;background:var(--blue,#3b82f6);width:${Math.round(p.total/mx*100)}%;min-width:2px"></div></td></tr>`).join("")}</tbody></table></div></div>
  <div class="g2 u-grid u-gtc-fit380 u-gap14 u-mt14">
    ${card("مساعده",d.advances,`<div>در انتظار پرداخت<b>${faId(d.advances.pendingCount)} مورد — ${fa(d.advances.pendingAmount)}</b></div>`)}
    ${card("فروش اقساطی کالا",d.goods)}
    ${card("وام (نوبت‌های دریافت‌شده)",d.loans)}
  </div>
  <div class="g2 u-grid u-gtc-fit300 u-gap14 u-mt14">
    ${mon("مساعده‌های ثبت‌شده — ۱۲ ماه حقوقی",d.advances,"جمع مبلغ")}${mon("درخواست‌های کالا — ۱۲ ماه حقوقی",d.goods,"جمع فروش")}${mon("وام‌های ثبت‌شده — ۱۲ ماه حقوقی",d.loans,"جمع وام")}
  </div>
  <div class="card u-mt14" id="rp-goodsagg"><h2><svg class="i"><use href="#i-list"/></svg>گزارش تجمیعی کالا — ${faId(rg.from)} تا ${faId(rg.to)}</h2><div id="rp-goodsagg-body"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
  rpGoodsAgg(rg);
}
/* گزارش تجمیعی کالا در گزارش‌های مالی: همان بازهٔ گزارش، درخواست‌های «فعال»، به تفکیک فرد و گروه کالا (با کد کسر) + اکسل */
async function rpGoodsAgg(rg){
  const box=$("#rp-goodsagg-body");if(!box)return;
  let r;
  try{r=await api("GET",`/api/inventory/orders?mode=agg&status=active&from=${enc(rg.from)}&to=${enc(rg.to)}&all=1`)}
  catch(e){box.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  app.rep.goodsAgg=r;
  if(!r.rows.length){box.innerHTML=`<div class="hint">در این بازه درخواست کالایی ثبت نشده است.</div>`;return}
  const LIM=300;
  box.innerHTML=`<div class="wk-sum u-m0b10"><div>تعداد افراد<b>${faId(r.sums.persons)}</b></div><div>تعداد درخواست<b>${faId(r.sums.count)}</b></div><div class="big">جمع مبلغ کالا<b>${fa(r.sums.total)}</b></div><div class="big">جمع قسط ماهانه<b>${fa(r.sums.inst)}</b></div></div>
    <div class="wk-acts u-m0b10"><button class="btn btn-blue" id="rp-ga-xls">خروجی اکسل (همهٔ ${faId(r.rows.length)} ردیف)</button></div>
    ${ggAggTable(r.rows.slice(0,LIM))}${r.rows.length>LIM?`<p class="hint u-m-8-0-0">فقط ${faId(LIM)} ردیف اول نمایش داده شده؛ فهرست کامل در خروجی اکسل است.</p>`:""}`;
  $("#rp-ga-xls").onclick=async()=>{try{await xlsxExport(`kala-tajmi-${rg.from.replace(/\//g,"")}-${rg.to.replace(/\//g,"")}.xlsx`,"تجمیعی کالا",GG_AGG_H,app.rep.goodsAgg.rows.map(ggAggRow),GG_AGG_W)}catch(e){showAlert(e.message)}};
}
/* ---------- گزارش کسور اقساط: چه کسانی در بازهٔ دوره‌های حقوقی، کد کسر مشخصی در فیش‌شان بوده (شاغلین و بازنشستگان جدا) ---------- */
function renderDpReport(){
  const P=app.rep.dp,pane=$("#rp-pane-dp");
  if(!P.ty){
    const cp=(app.periods||[]).find(x=>x.id===app.currentPeriodId)||(app.periods||[])[0];
    if(cp){P.ty=cp.year;P.tm=cp.month}else{P.ty=curY();P.tm=curM()+1}
    P.fy=P.ty;P.fm=P.tm;
  }
  const msel=(id,v)=>`<select id="${id}">${MONTHS.map((n,i)=>`<option value="${i+1}"${v===i+1?" selected":""}>${n}</option>`).join("")}</select>`;
  pane.innerHTML=`<div class="card"><h2><svg class="i"><use href="#i-coins"/></svg>گزارش کسور اقساط</h2>
    <p class="hint u-m0b10">فهرست کسانی که کد کسر واردشده در فیش‌شان بین دو دورهٔ حقوقی (با خودِ دو دوره) بوده است؛ شاغلین و بازنشستگان جدا. حداکثر ۳۶ ماه.</p>
    <div class="fgrid">
      <label class="f">از دورهٔ حقوقی (ماه)${msel("dp-fm",P.fm)}</label>
      <label class="f">سال<input id="dp-fy" type="number" min="1390" max="1450" value="${P.fy}"></label>
      <label class="f">تا دورهٔ حقوقی (ماه)${msel("dp-tm",P.tm)}</label>
      <label class="f">سال<input id="dp-ty" type="number" min="1390" max="1450" value="${P.ty}"></label>
      <label class="f">کد کسر<input id="dp-code" class="ltr" placeholder="مثلاً 733" value="${esc(P.code)}"></label>
    </div>
    <div class="wk-acts u-mt10"><button class="btn btn-main" id="dp-go">نمایش گزارش</button><button class="btn btn-green" id="dp-xls">خروجی اکسل</button></div>
    <div id="dp-body" class="u-mt14"></div></div>`;
  $("#dp-go").onclick=()=>dpLoad();
  $("#dp-xls").onclick=async()=>{try{if(!await dpLoad())return;await dpExport()}catch(e){showAlert(e.message)}};
  ["dp-fy","dp-ty","dp-code"].forEach(id=>$("#"+id).onkeydown=ev=>{if(ev.key==="Enter")dpLoad()});
  if(P.data)dpRender();
}
function dpRead(){
  const P=app.rep.dp,gi=id=>parseInt(toEnDigits($("#"+id).value),10);
  P.fm=+$("#dp-fm").value;P.tm=+$("#dp-tm").value;P.fy=gi("dp-fy")||P.fy;P.ty=gi("dp-ty")||P.ty;
  P.code=toEnDigits($("#dp-code").value).trim();
}
async function dpLoad(){
  const P=app.rep.dp,body=$("#dp-body");dpRead();
  if(!P.code){showAlert("کد کسر را وارد کنید.");return false}
  body.innerHTML=`<div class="hint" role="status">در حال دریافت…</div>`;
  try{P.data=await api("GET",`/api/reports/deduction-people?fy=${P.fy}&fm=${P.fm}&ty=${P.ty}&tm=${P.tm}&code=${encodeURIComponent(P.code)}`)}
  catch(e){P.data=null;body.innerHTML=emptyMsg(esc(e.message));return false}
  dpRender();return true;
}
const dpYm=s=>{const [y,m]=String(s).split("/");return MONTHS[+m-1]+" "+faId(y)};
function dpSection(title,g){
  if(!g.count)return `<div class="card u-mt14"><h2>${title}</h2><div class="chart-empty">در این بازه کسی با این کد کسر در فیش ${title} نیست.</div></div>`;
  const tr=g.people.map((p,i)=>`<tr><td>${faId(i+1)}</td><td>${faId(esc(p.code))}</td><td>${esc(p.name)}</td><td>${p.months.map(m=>`<span class="badge" title="${esc(m.label)}">${dpYm(m.ym)}: ${fa(m.amount)}</span>`).join(" ")}</td><td>${faId(p.months.length)}</td><td class="money"><b>${fa(p.total)}</b></td></tr>`).join("");
  return `<div class="card u-mt14"><h2>${title} — ${faId(g.count)} نفر</h2>
    <div class="wk-sum u-m0b10"><div>تعداد نفرات<b>${faId(g.count)}</b></div><div class="big">جمع مبلغ (ریال)<b>${fa(g.total)}</b></div></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ردیف</th><th>کد پرسنلی</th><th>نام</th><th>ماه‌های حقوقی و مبلغ</th><th>تعداد ماه</th><th>جمع مبلغ</th></tr></thead><tbody>${tr}</tbody><tfoot><tr><td colspan="4">جمع ${title}</td><td>${faId(g.rows)}</td><td class="money">${fa(g.total)}</td></tr></tfoot></table></div></div>`;
}
function dpRender(){
  const P=app.rep.dp,d=P.data,body=$("#dp-body");if(!d)return;
  const none=!d.periods.length?`<div class="hint u-c-amber-ink">برای این بازه هیچ دورهٔ حقوقی ساخته نشده است.</div>`:"";
  body.innerHTML=`<p class="hint u-m0b8">کد کسر ${faId(esc(d.code))} — دوره‌های حقوقی ${dpYm(d.fromYm)}${d.fromYm!==d.toYm?" تا "+dpYm(d.toYm):""} (${faId(d.periods.length)} دورهٔ موجود)</p>${none}`
    +dpSection("شاغلین",d.active)+dpSection("بازنشستگان",d.retiree);
}
async function dpExport(){
  const d=app.rep.dp.data;if(!d){showAlert("گزارشی برای خروجی نیست.");return}
  const H=["ردیف","کد ملی","کد پرسنلی","نام","نام خانوادگی","کد کسر","شرح کسر","ماه حقوقی","سری/ردیف وام","مبلغ"];
  const W=[7,14,14,18,22,10,26,13,14,16];
  const detail=(name,g)=>{
    const rows=[];let n=0;
    for(const p of g.people)for(const m of p.months)rows.push([++n,String(p.nationalId||""),String(p.code),p.firstName,p.lastName,String(d.code),m.label,m.ym,m.ref||"",m.amount]);
    rows.push(["","","","","","","جمع کل","","",g.total]);
    return{name,H,rows,widths:W};
  };
  // یک برگهٔ جدا: جمع هر نفر (شاغل و بازنشسته)
  const HT=["ردیف","گروه","کد ملی","کد پرسنلی","نام","نام خانوادگی","کد کسر","تعداد ماه","جمع مبلغ"];
  const tot=[];let n=0;
  [["شاغل",d.active],["بازنشسته",d.retiree]].forEach(([k,g])=>g.people.forEach(p=>tot.push([++n,k,String(p.nationalId||""),String(p.code),p.firstName,p.lastName,String(d.code),p.months.length,p.total])));
  tot.push(["","","","","","","جمع کل","",d.active.total+d.retiree.total]);
  const sum=[["شاغلین",d.active.count,d.active.rows,d.active.total],["بازنشستگان",d.retiree.count,d.retiree.rows,d.retiree.total]];
  // ریز اقساط: هر ردیف/سریِ تکراریِ یک کد در یک ماه، رکورد جدا (برگهٔ «شاغلین» و «بازنشستگان» جمعِ هر ماه را نگه می‌دارند)
  const records=(name,g)=>{
    const rows=[];let n=0,sum=0;
    for(const p of g.people)for(const x of (p.records||[])){rows.push([++n,String(p.nationalId||""),String(p.code),p.firstName,p.lastName,String(d.code),x.label,x.ym,x.ref||"",x.amount]);sum+=x.amount}
    rows.push(["","","","","","","جمع کل","","",sum]);
    return{name,H,rows,widths:W};
  };
  await xlsxMulti(`deduction-code-${String(d.code).replace(/[^\w-]/g,"")}-${d.fromYm.replace(/\//g,"")}-${d.toYm.replace(/\//g,"")}.xlsx`,[
    detail("شاغلین",d.active),detail("بازنشستگان",d.retiree),records("ریز اقساط شاغلین",d.active),records("ریز اقساط بازنشستگان",d.retiree),
    {name:"جمع هر نفر",H:HT,rows:tot,widths:[7,12,14,14,18,22,10,10,16]},
    {name:"خلاصه",H:["گروه","تعداد نفرات","تعداد ردیف ماهانه","جمع مبلغ"],rows:sum,widths:[16,14,18,20]}]);
}
/* ---------- گزارش تجمیعی کسورات (شاغلین + بازنشستگان) ---------- */
async function renderDedReport(){
  const D=app.rep.ded,pane=$("#rp-pane-ded");
  if(!D.y){
    const cp=(app.periods||[]).find(x=>x.id===app.currentPeriodId)||(app.periods||[])[0];
    if(cp){D.y=cp.year;D.m=cp.month}else{D.y=curY();D.m=curM()+1}
  }
  pane.innerHTML=`<div class="card"><h2><svg class="i"><use href="#i-coins"/></svg>گزارش تجمیعی کسورات</h2>
    <p class="hint u-m0b10">جمع هر کد کسر در فیش‌های شاغلین (همراه با اقساط فایل وام) و بازنشستگان در ماه انتخابی؛ هنگام وارد کردن فایل‌ها ساخته می‌شود و با ماه قبل مقایسه می‌شود.</p>
    <div class="fgrid">
      <label class="f">سال<input id="dr-y" type="number" min="1390" max="1450" value="${D.y}"></label>
      <label class="f">ماه<select id="dr-m">${MONTHS.map((n,i)=>`<option value="${i+1}"${D.m===i+1?" selected":""}>${n}</option>`).join("")}</select></label>
      <label class="f">گروه<select id="dr-view"><option value="active"${D.view==="active"?" selected":""}>شاغلین</option><option value="retiree"${D.view==="retiree"?" selected":""}>بازنشستگان</option><option value="both"${D.view==="both"?" selected":""}>مقایسهٔ هر دو</option></select></label>
      <label class="f">مرتب‌سازی<select id="dr-sort"><option value="code"${D.sort==="code"?" selected":""}>بر اساس کد کسر</option><option value="total"${D.sort==="total"?" selected":""}>بیشترین مبلغ</option><option value="count"${D.sort==="count"?" selected":""}>بیشترین تعداد نفر</option><option value="diff"${D.sort==="diff"?" selected":""}>بیشترین تغییر نسبت به ماه قبل</option></select></label>
      <label class="f">جست‌وجو (کد یا شرح)<input id="dr-q" value="${esc(D.q)}"></label>
    </div>
    <div class="wk-acts u-mt10"><button class="btn btn-main" id="dr-go">نمایش گزارش</button><button class="btn btn-green" id="dr-xls">خروجی اکسل</button><span class="sp"></span><button class="btn" id="dr-rebuild" title="اگر فایل‌ها قبل از این نسخه وارد شده‌اند یا دستی تغییر کرده‌اند">بازسازی از فیش‌ها</button></div></div>
    <div id="dr-body" class="u-mt14"></div>`;
  $("#dr-go").onclick=()=>{drRead();drLoad()};
  $("#dr-xls").onclick=async()=>{try{drRead();await drLoad();await drExport()}catch(e){showAlert(e.message)}};
  $("#dr-rebuild").onclick=async()=>{
    drRead();
    try{const r=await api("POST","/api/reports/deductions/rebuild",{year:D.y,month:D.m});showAlert(`گزارش از ${fa(r.people)} فیش بازسازی شد (${fa(r.items)} ردیف کسر).`);await drLoad()}catch(e){showAlert(e.message)}
  };
  ["dr-m","dr-sort","dr-view"].forEach(id=>$("#"+id).onchange=()=>{drRead();drLoad()});
  $("#dr-q").oninput=()=>{drRead();drRender()};
  $("#dr-y").onchange=()=>{drRead();drLoad()};
  drLoad();
}
function drRead(){
  const D=app.rep.ded;
  D.y=+toEnDigits($("#dr-y").value)||D.y;D.m=+$("#dr-m").value||D.m;D.sort=$("#dr-sort").value;D.view=$("#dr-view").value;D.q=$("#dr-q").value.trim();
}
async function drLoad(){
  const D=app.rep.ded,body=$("#dr-body");
  body.innerHTML=`<div class="hint" role="status">در حال دریافت…</div>`;
  try{D.data=await api("GET",`/api/reports/deductions?year=${D.y}&month=${D.m}`)}catch(e){D.data=null;body.innerHTML=emptyMsg(esc(e.message));return}
  drRender();
}
/* هر گروه جدا محاسبه می‌شود: view = active | retiree | both */
function drView(x,v){
  if(v==="active")return{count:x.activeCount,total:x.activeTotal,prev:x.prevActive||0};
  if(v==="retiree")return{count:x.retireeCount,total:x.retireeTotal,prev:x.prevRetiree||0};
  return{count:x.count,total:x.total,prev:x.prevTotal};
}
/* شرح کسر هر گروه جدا: شاغلین و بازنشستگان کدها و شرح‌های متفاوت دارند؛ در نمای «هر دو» اگر شرح‌ها فرق داشته باشد هر دو نوشته می‌شود */
function drLabel(x,v){
  const a=x.activeLabel||"",r=x.retireeLabel||"";
  if(v==="active")return a||r||x.label;
  if(v==="retiree")return r||a||x.label;
  return !a||!r||normFa(a)===normFa(r)?(a||r||x.label):`${a} (شاغل) / ${r} (بازنشسته)`;
}
function drRows(v){
  const D=app.rep.ded,d=D.data;if(!d||!d.items)return[];
  v=v||D.view;const q=normFa(D.q);
  let rows=d.items.map(x=>Object.assign({},x,{c:drView(x,v),label:drLabel(x,v)})).filter(x=>x.c.total||x.c.count||(v!=="both"&&x.c.prev));
  rows=rows.filter(x=>!q||normFa(x.code+" "+x.label).includes(q));
  const by={code:null,total:(a,b)=>b.c.total-a.c.total,count:(a,b)=>b.c.count-a.c.count,diff:(a,b)=>Math.abs(b.c.total-b.c.prev)-Math.abs(a.c.total-a.c.prev)}[D.sort];
  if(by)rows=rows.slice().sort(by);
  return rows;
}
function normFa(t){return String(t||"").replace(/[يى]/g,"ی").replace(/ك/g,"ک").replace(/[\u200c\s]/g,"").toLowerCase()}
const DR_NAMES={active:"شاغلین",retiree:"بازنشستگان",both:"شاغلین و بازنشستگان (مقایسه)"};
function drRender(){
  const D=app.rep.ded,d=D.data,body=$("#dr-body");if(!d)return;
  const ym=(y,m)=>MONTHS[m-1]+" "+faId(y);
  if(!d.found){body.innerHTML=emptyMsg(`برای ${ym(D.y,D.m)} دوره‌ای ساخته نشده است. از صفحهٔ «تغذیهٔ فایل‌ها» دوره را بسازید و فایل‌ها را وارد کنید.`);return}
  if(!d.hasData){body.innerHTML=emptyMsg(`برای ${ym(D.y,D.m)} هنوز فایل حقوق شاغلین یا بازنشستگان وارد نشده است.`);return}
  const v=D.view,T=d.totals,rows=drRows(v),pv=d.prevTotals;
  const cur=v==="both"?T.all:T[v],prv=pv?(v==="both"?pv:pv[v]):null;
  const sumT=rows.reduce((a,x)=>a+x.c.total,0),sumP=rows.reduce((a,x)=>a+x.c.prev,0);
  const grand=cur.deductions||1;
  const chg=prv&&prv.deductions?Math.round((cur.deductions-prv.deductions)/prv.deductions*1000)/10:null;
  const cls=n=>n>0?"up":n<0?"dn":"";
  const hasPrev=!!d.prev;
  let thead,tr,tfoot;
  if(v==="both"){
    thead=`<tr><th rowspan="2">ردیف</th><th rowspan="2">کد</th><th rowspan="2">شرح کسر</th><th colspan="2">شاغلین</th><th colspan="2">بازنشستگان</th><th colspan="2">جمع</th><th rowspan="2">سهم</th><th rowspan="2">ماه قبل</th><th rowspan="2">تغییر</th></tr><tr><th>نفر</th><th>مبلغ</th><th>نفر</th><th>مبلغ</th><th>نفر</th><th>مبلغ</th></tr>`;
    tr=rows.map((x,i)=>`<tr><td>${faId(i+1)}</td><td>${x.code?faId(esc(x.code)):"—"}</td><td>${esc(x.label)}</td><td>${x.activeCount?fa(x.activeCount):"—"}</td><td class="money">${x.activeTotal?fa(x.activeTotal):"—"}</td><td>${x.retireeCount?fa(x.retireeCount):"—"}</td><td class="money">${x.retireeTotal?fa(x.retireeTotal):"—"}</td><td>${fa(x.count)}</td><td class="money"><b>${fa(x.total)}</b></td><td><div class="shbar"><i style="width:${Math.min(100,Math.max(1,Math.round(x.total/grand*100)))}%"></i></div></td><td class="money">${hasPrev&&x.prevTotal?fa(x.prevTotal):"—"}</td><td class="money ${cls(x.diff)}">${hasPrev&&x.diff?(x.diff>0?"+":"")+fa(x.diff):"—"}</td></tr>`).join("");
    tfoot=`<tr><td colspan="3">جمع ${D.q?"(نتیجهٔ جست‌وجو)":"کل"}</td><td></td><td class="money">${fa(rows.reduce((a,x)=>a+x.activeTotal,0))}</td><td></td><td class="money">${fa(rows.reduce((a,x)=>a+x.retireeTotal,0))}</td><td></td><td class="money">${fa(sumT)}</td><td></td><td class="money">${hasPrev?fa(sumP):"—"}</td><td class="money">${hasPrev?fa(sumT-sumP):"—"}</td></tr>`;
  }else{
    thead=`<tr><th>ردیف</th><th>کد</th><th>شرح کسر</th><th>تعداد نفر</th><th>مبلغ کسر</th><th>سهم از کسورات</th><th>ماه قبل</th><th>تغییر</th></tr>`;
    tr=rows.map((x,i)=>{const df=x.c.total-x.c.prev;return `<tr><td>${faId(i+1)}</td><td>${x.code?faId(esc(x.code)):"—"}</td><td>${esc(x.label)}</td><td>${x.c.count?fa(x.c.count):"—"}</td><td class="money"><b>${x.c.total?fa(x.c.total):"—"}</b></td><td><div class="shbar" title="${faId(Math.round(x.c.total/grand*1000)/10)}٪"><i style="width:${Math.min(100,Math.max(1,Math.round(x.c.total/grand*100)))}%"></i></div></td><td class="money">${hasPrev&&x.c.prev?fa(x.c.prev):"—"}</td><td class="money ${cls(df)}">${hasPrev&&df?(df>0?"+":"")+fa(df):"—"}</td></tr>`}).join("");
    tfoot=`<tr><td colspan="3">جمع ${D.q?"(نتیجهٔ جست‌وجو)":"کسورات "+DR_NAMES[v]}</td><td></td><td class="money">${fa(sumT)}</td><td></td><td class="money">${hasPrev?fa(sumP):"—"}</td><td class="money">${hasPrev?fa(sumT-sumP):"—"}</td></tr>`;
  }
  const kp=v==="both"?[
    dKpi({label:"جمع کل کسورات",value:faBig(T.all.deductions),sub:fa(T.all.deductions)+" ریال"+(chg===null?"":` — ${chg>0?"▲":chg<0?"▼":"="} ${faId(Math.abs(chg))}٪ نسبت به ${ym(d.prev.year,d.prev.month)}`),icon:"coins",tone:"amber"}),
    dKpi({label:"کسورات شاغلین",value:faBig(T.active.deductions),sub:`${fa(T.active.people)} نفر`,icon:"usercheck",tone:"green"}),
    dKpi({label:"کسورات بازنشستگان",value:faBig(T.retiree.deductions),sub:`${fa(T.retiree.people)} نفر`,icon:"userclock",tone:"violet"}),
    dKpi({label:"خالص پرداختی",value:faBig(T.all.net),sub:`از ${faBig(T.all.gross)} حقوق و مزایا`,icon:"wallet",tone:"teal"})
  ]:[
    dKpi({label:`جمع کسورات ${DR_NAMES[v]}`,value:faBig(cur.deductions),sub:fa(cur.deductions)+" ریال"+(chg===null?"":` — ${chg>0?"▲":chg<0?"▼":"="} ${faId(Math.abs(chg))}٪ نسبت به ${ym(d.prev.year,d.prev.month)}`),icon:"coins",tone:"amber"}),
    dKpi({label:"تعداد فیش",value:fa(cur.people),sub:cur.people?`میانگین کسر هر نفر ${fa(Math.round(cur.deductions/cur.people))} ریال`:"",icon:v==="active"?"usercheck":"userclock",tone:v==="active"?"green":"violet"}),
    dKpi({label:"جمع حقوق و مزایا",value:faBig(cur.gross),sub:fa(cur.gross)+" ریال",icon:"users",tone:"blue"}),
    dKpi({label:"خالص پرداختی",value:faBig(cur.net),sub:cur.gross?`${faId(Math.round(cur.deductions/cur.gross*1000)/10)}٪ حقوق به کسورات رفته`:"",icon:"wallet",tone:"teal"})
  ];
  const p=d.period,file=v==="active"?p.activeFile:v==="retiree"?p.retireeFile:[p.activeFile&&"شاغلین: "+p.activeFile,p.retireeFile&&"بازنشستگان: "+p.retireeFile].filter(Boolean).join(" — ");
  const loanNote=v!=="retiree"&&!p.loanFile?" فایل اقساط وام این دوره وارد نشده؛ اقساط وام شاغلین در «سایر کسور» می‌آید.":"";
  const empty=!cur.people&&v!=="both";
  body.innerHTML=`<div class="kpi-grid">${kp.join("")}</div>
    <div class="card"><h2>${esc(DR_NAMES[v])} — ${ym(D.y,D.m)} — ${faId(rows.length)} کد کسر</h2>
      <p class="hint u-m0b8">${file?"فایل: "+esc(file)+". ":""}${hasPrev?"مقایسه با "+ym(d.prev.year,d.prev.month)+".":"ماه قبلی برای مقایسه موجود نیست."}${loanNote}</p>
      ${empty?`<div class="chart-empty">برای ${DR_NAMES[v]} در این ماه فیشی وارد نشده است.</div>`:`<div class="tbl-wrap"><table class="tbl ded-tbl"><thead>${thead}</thead>
        <tbody>${tr||`<tr><td colspan="12" class="hint">موردی پیدا نشد.</td></tr>`}</tbody><tfoot>${tfoot}</tfoot></table></div>`}</div>`;
}
async function drExport(){
  const D=app.rep.ded,d=D.data;
  if(!d||!d.found||!d.hasData){showAlert("گزارشی برای خروجی نیست.");return}
  const T=d.totals,hasPrev=!!d.prev;
  const single=v=>{
    const rows=drRows(v),g=(v==="active"?T.active:T.retiree).deductions||1;
    const H=["ردیف","کد کسر","شرح کسر","تعداد نفر","مبلغ کسر","درصد از کسورات","مبلغ ماه قبل","تغییر مبلغ نسبت به ماه قبل"];
    const body=rows.map((x,i)=>[i+1,x.code||"",x.label,x.c.count,x.c.total,Math.round(x.c.total/g*1000)/10,hasPrev?x.c.prev:"",hasPrev?x.c.total-x.c.prev:""]);
    body.push(["","","جمع کل","",rows.reduce((a,x)=>a+x.c.total,0),"",hasPrev?rows.reduce((a,x)=>a+x.c.prev,0):"",hasPrev?rows.reduce((a,x)=>a+x.c.total-x.c.prev,0):""]);
    return{name:DR_NAMES[v],H,rows:body,widths:[7,10,30,12,20,14,20,24]};
  };
  const both=drRows("both"),gb=T.all.deductions||1;
  const HB=["ردیف","کد کسر","شرح کسر","تعداد شاغلین","مبلغ شاغلین","تعداد بازنشستگان","مبلغ بازنشستگان","تعداد کل نفرات","جمع مبلغ","درصد از کل","مبلغ ماه قبل","تغییر مبلغ نسبت به ماه قبل"];
  const bb=both.map((x,i)=>[i+1,x.code||"",x.label,x.activeCount,x.activeTotal,x.retireeCount,x.retireeTotal,x.count,x.total,Math.round(x.total/gb*1000)/10,hasPrev?x.prevTotal:"",hasPrev?x.diff:""]);
  bb.push(["","","جمع کل","",both.reduce((a,x)=>a+x.activeTotal,0),"",both.reduce((a,x)=>a+x.retireeTotal,0),"",both.reduce((a,x)=>a+x.total,0),"",hasPrev?both.reduce((a,x)=>a+x.prevTotal,0):"",hasPrev?both.reduce((a,x)=>a+x.diff,0):""]);
  const fin=[["شاغلین",T.active],["بازنشستگان",T.retiree],["جمع کل",T.all]].map(([n,t])=>[n,t.people,t.gross,t.deductions,t.net,t.employer]);
  await xlsxMulti(`deductions-${D.y}-${String(D.m).padStart(2,"0")}.xlsx`,[
    single("active"),single("retiree"),
    {name:"مقایسه شاغلین و بازنشستگان",H:HB,rows:bb,widths:[7,10,30,12,18,14,18,14,18,12,18,22]},
    {name:"خلاصه مالی",H:["گروه","تعداد نفرات","جمع حقوق و مزایا","جمع کسورات","خالص پرداختی","سهم کارفرما"],rows:fin,widths:[16,14,22,22,22,20]}]);
}

async function rpExport(){
  const d=app.rep.data;if(!d){showAlert("گزارشی بارگذاری نشده است.");return}
  await ensureXLSX(8000);
  const wb=XLSX.utils.book_new();wb.Workbook={Views:[{RTL:true}]};
  const add=(name,H,rows)=>{const ws=XLSX.utils.aoa_to_sheet([H].concat(rows));ws["!cols"]=H.map(h=>({wch:Math.max(14,String(h).length+4)}));xlsMoney(ws,H);XLSX.utils.book_append_sheet(wb,ws,name)};
  const rg=d.range;
  add("بازهٔ گزارش",["از تاریخ","تا تاریخ","از ماه حقوقی","تا ماه حقوقی"],[[rg.from,rg.to,rg.fromYm,rg.toYm]]);
  add("پیش‌بینی ماهانه",["ماه","مساعده","کالا","وام","جمع"],d.projection.map(p=>[p.ym,p.advance,p.goods,p.loan,p.total]));
  // مساعده + کالا (تجمیعی هر فرد) + تغییرات ماهانه در بازه؛ ردیف وام مساعده/کالا = شمارهٔ ماه حقوقی، کد وضعیت مساعده/کالا = ۱
  const reg=(d.exportRows||[]).map(r=>[String(r.code),String(r.nationalId||""),r.firstName,r.lastName,r.status,r.type,r.dcode,r.loanRow,r.total,r.installment,r.remaining,r.statusCode]);
  add("ثبت‌شده در بازه",["کد پرسنلی","کد ملی","نام","نام خانوادگی","وضعیت (شاغل/بازنشسته)","نوع","کد کسر","ردیف وام","مبلغ کل","مبلغ قسط","مانده","کد وضعیت"],reg);
  const det=x=>x.items.map(i=>[String(i.code),i.name,i.personStatus||"",i.total,i.installments,i.installmentAmount,i.lastInstallmentAmount,i.startYm,i.remainingCount,i.remainingAmount,i.dueNow]);
  const H=["کد پرسنلی","نام","وضعیت (شاغل/بازنشسته)","بدهی","تعداد اقساط","مبلغ قسط","مبلغ قسط آخر","شروع کسر","اقساط باقی‌مانده","مانده","کسر ماه پایان بازه"];
  add("مانده مساعده",H,det(d.advances));add("مانده کالا",H,det(d.goods));add("مانده وام",H,det(d.loans));
  XLSX.writeFile(wb,`financial-report-${rg.fromYm.replace("/","-")}_${rg.toYm.replace("/","-")}.xlsx`);
}

/* ====================== اتصال رویدادها و میانبرها ====================== */
