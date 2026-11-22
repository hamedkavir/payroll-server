"use strict";
/* personnel/profile.js — فرم پرسنلی و ویرایش بخش‌ها
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("personnel/profile");
/* ---------- فرم پرسنلی (نمایش کامل اطلاعات یک نفر) ---------- */
function fld(label,val,extra){
  return `<div class="fld ${extra||""}"><small>${label}</small><b>${val?esc(val):"—"}</b></div>`;
}
function fmtDate8(v){
  const t=String(v||"").replace(/\D/g,"");
  if(t.length===8)return t.slice(0,4)+"/"+t.slice(4,6)+"/"+t.slice(6);
  return v||"";
}
function seg(options,value,colors){
  const nv=norm(value);
  const known=options.some(o=>norm(o)===nv);
  return `<div class="seg">`+options.map((o,i)=>{
    const on=norm(o)===nv;
    return `<span class="${on?"on "+((colors&&colors[i])||""):""}">${o}</span>`;
  }).join("")+(!known&&value?`<span class="on blue">${esc(value)}</span>`:"")+`</div>`;
}
function fundItem(p,code){
  if(p.kind==="active"){
    const it=(p.loans||[]).find(x=>String(x.code)===code);
    return it?{v:it.v,remaining:it.remaining,principal:it.principal,label:it.label}:null;
  }
  const it=((p.data&&p.data.items)||[]).find(x=>String(x.code)===code);
  return it?{v:Math.abs(it.v),remaining:it.remaining,principal:it.loanAmt,label:it.label}:null;
}
function recOf(p){
  return p.kind==="retiree"
    ?computeRetireeRecord(p.data,app.settings.showZero)
    :finalizeActive(p.data,p.loans||[],app.settings.showZero);
}
function loanItemsOf(p){
  if(p.kind==="active")return (p.loans||[]).filter(x=>Math.round(x.remaining||0)>0||Math.round(x.principal||0)>0||Math.round(x.v)>0)
    .map(x=>({code:x.code,ref:x.seq,label:x.label,v:x.v,remaining:x.remaining,principal:x.principal}));
  return ((p.data&&p.data.items)||[]).filter(x=>x.v<0&&(Math.round(x.remaining)!==0||Math.round(x.loanAmt)!==0))
    .map(x=>({code:x.code,ref:x.series,label:x.label,v:Math.abs(x.v),remaining:x.remaining,principal:x.loanAmt}));
}

/* --- تعریف بخش‌های قابل ویرایش فرم پرسنلی --- */
const STATUS_REASONS=["انتقالی","مرخصی زایمان","مرخصی بدون حقوق","بازنشسته تامین اجتماعی","مامور","اخراج","سایر"];
const PF_FIELDS={
  ident:[
    {k:"code",label:"شمارهٔ پرسنلی",ro:true,num:true},{k:"nationalId",label:"کد ملی",num:true},
    {k:"firstName",label:"نام"},{k:"lastName",label:"نام خانوادگی"},{k:"fatherName",label:"نام پدر"},
    {k:"birthDate",label:"تاریخ تولد",ph:"مثلاً 1362/01/28",fmt:fmtDate8},{k:"birthPlace",label:"محل تولد"},
    {k:"idNumber",num:true,label:"شمارهٔ شناسنامه"},{k:"coveredChildren",num:true,label:"اولاد مشمول"},{k:"ledger",num:true,label:"دفتر کل"},
    {k:"gender",label:"جنسیت",opts:["مرد","زن"]},{k:"maritalStatus",label:"وضعیت تأهل",opts:["متاهل","مجرد","معیل"]}
  ],
  job:[
    {k:"status",label:"وضعیت",opts:["شاغل","بازنشسته","وظیفه بگیر","قطع رابطه"]},{k:"currentStatus",label:"وضعیت جاری"},
    {k:"employmentType",label:"نوع استخدام"},{k:"jobTitle",label:"پست اصلی",w2:true},
    {k:"workplace",label:"محل خدمت",w2:true},{k:"workplaceCode",num:true,label:"کد محل خدمت"},
    {k:"insuranceType",label:"نوع بیمه"},{k:"education",label:"مدرک تحصیلی"},{k:"fieldOfStudy",label:"رشته تحصیلی",w2:true},
    {k:"veteranType",label:"نوع ایثارگری"},{k:"govtServiceYears",num:true,label:"سابقهٔ دولتی (سال)"},
    {k:"jobRole",label:"شغل"},{k:"jobRank",num:true,label:"رتبهٔ شغلی"},{k:"jobGroup",num:true,label:"گروه کاری"},{k:"insuranceCode",num:true,label:"کد بیمه"},
    {k:"membershipCancelDate",label:"تاریخ لغو عضویت (صندوق وام ضروری)",ph:"مثلاً 1405/07/21 — خالی = عضو",fmt:fmtDate8,w2:true}
  ],
  bank:[
    {k:"mobile",label:"تلفن همراه",num:true},{k:"bankAccount",label:"شمارهٔ حساب",num:true,w2:true},
    {k:"advanceAccount",label:"حساب مساعده",num:true,w2:true},
    {k:"advanceOwner",label:"نام صاحب حساب مساعده",w2:true},
    {k:"mehrAccount",label:"شمارهٔ حساب بانک مهر",num:true,w2:true},
    {k:"bankName",label:"نام بانک"},
    {k:"shaba",label:"شمارهٔ شبا",w2:true,ltr:true,ph:"IR + ۲۴ رقم؛ ۱۳ رقم آخر = شمارهٔ حساب"}
  ]
};
function secHead(key,title,icon){
  const ed=app.pfEdit===key;
  return `<h3><svg class="i"><use href="#${icon}"/></svg>${title}<span class="sp"></span>`+
    (ed?`<button class="btn btn-green sm" data-pf="save" data-sec="${key}">ذخیره</button><button class="btn sm" data-pf="cancel">انصراف</button>`
       :`<button class="btn sm" data-pf="edit" data-sec="${key}">ویرایش</button>`)+`</h3>`;
}
/* --- ظاهر صفحه (تنظیمات ← ظاهر صفحه‌ها): ترتیب/پنهان‌بودن بخش‌ها و فیلدها + فیلدهای دلخواه --- */
const PF_SECS=[["ident","مشخصات هویتی"],["job","اطلاعات استخدامی"],["bank","تماس و حساب بانکی"],["notes","توضیحات"],["money","وضعیت مالی (آخرین فیش)"],["queue","نوبت وام"],["hist","سابقهٔ فیش‌ها"],["log","تاریخچهٔ تغییر وضعیت"]];
const PL=()=>((FS().pageLayout||{}).personnel)||null;
function plBuild(){
  const L={sections:{order:pl.secs.map(x=>x.id),hide:pl.secs.filter(x=>!x.on).map(x=>x.id)},fields:{},custom:[]};
  for(const [sec] of PL_FSECS){
    const a=pl.fields[sec];L.fields[sec]={order:a.map(f=>f.k),hide:a.filter(f=>!f.on).map(f=>f.k),wide:a.filter(f=>f.wide).map(f=>f.k)};
    a.filter(f=>f.custom).forEach(f=>L.custom.push({id:f.k,label:f.label,sec}));
  }
  return L;
}
function pfAllFields(){
  const m={};["ident","job","bank"].forEach(sc=>PF_FIELDS[sc].forEach(f=>{m[f.k]={...f,sec:sc}}));
  ((PL()||{}).custom||[]).forEach(c=>{m[c.id]={k:c.id,label:c.label,custom:true,sec:c.sec}});
  return m;
}
// فیلدهای یک بخش به ترتیب ذخیره‌شده (همه، حتی پنهان‌ها) — برای نمایش و برای ویرایشگر
function pfFieldDefs(sec){
  const L=PL(),all=pfAllFields(),cust=(L&&L.custom)||[];
  const base=PF_FIELDS[sec].map(f=>f.k).concat(cust.filter(c=>c.sec===sec).map(c=>c.id));
  const fl=(L&&L.fields)||{},has=Object.keys(fl).length>0,claim={};
  Object.entries(fl).forEach(([sc,o])=>(o.order||[]).forEach(k=>{claim[k]=sc}));
  const mine=(fl[sec]&&fl[sec].order)||[];
  const keys=[...new Set(mine.filter(k=>all[k]&&claim[k]===sec).concat(base.filter(k=>!claim[k])))];
  const hide=new Set(Object.values(fl).flatMap(o=>o.hide||[])),wide=new Set(Object.values(fl).flatMap(o=>o.wide||[]));
  return keys.map(k=>({def:all[k],hidden:hide.has(k),wide:has?wide.has(k):!!all[k].w2}));
}
const pfFieldList=sec=>pfFieldDefs(sec).filter(x=>!x.hidden).map(x=>({...x.def,w2:x.wide}));
function pfOrderSections(map){
  const L=PL(),def=PF_SECS.map(x=>x[0]);let order=def;
  if(L&&L.sections){const o=(L.sections.order||[]).filter(k=>def.includes(k));order=o.concat(def.filter(k=>!o.includes(k)));const hide=L.sections.hide||[];order=order.filter(k=>!hide.includes(k)||app.pfEdit===k)}
  return order.map(k=>map[k]||"").join("");
}
function fieldTile(f,p,editing){
  const cls=(f.w2?"w2":"")+(f.num?" num":"");
  const val=f.custom?String((p.extra||{})[f.k]||""):(p[f.k]==null?"":String(p[f.k]));
  if(!editing||f.ro){
    const shown=f.fmt?f.fmt(val):val;
    return `<div class="fld ${cls}${f.ro&&editing?" ro":""}"><small>${f.label}</small><b class="${f.num?"num":""}${f.ltr?" u-ta-right":""}"${f.ltr?' dir="ltr"':""}>${shown?esc(f.num||f.fmt||f.ltr?faId(shown):shown):"—"}</b></div>`;
  }
  if(f.opts){
    const opts=f.opts.slice();
    if(val&&!opts.some(o=>norm(o)===norm(val)))opts.push(val);
    return `<label class="fld ef ${cls}"><small>${f.label}</small><select class="inp" data-k="${f.k}"><option value=""></option>`+
      opts.map(o=>`<option value="${esc(o)}"${norm(o)===norm(val)?" selected":""}>${esc(o)}</option>`).join("")+`</select></label>`;
  }
  return `<label class="fld ef ${cls}"><small>${f.label}</small><input class="inp" data-k="${f.custom?"x:"+f.k:f.k}" value="${esc(val)}"${f.ph?` placeholder="${f.ph}"`:""}${f.ltr?' dir="ltr"':""}${f.k==="bankAccount"||f.k==="advanceAccount"||f.k==="mehrAccount"?' inputmode="numeric"':""}></label>`;
}
function renderProfile(pf){
  app.pfData=pf;
  const p=pf.person,pay=pf.payroll||[];
  const last=pay[0];
  const rec=last?recOf(last):null;
  const full=((p.firstName||"")+" "+(p.lastName||"")).trim()||"بی‌نام";
  const E=k=>app.pfEdit===k;
  const msg=app.pfMsg?`<div class="pf-msg">${esc(app.pfMsg)}</div>`:"";
  app.pfMsg="";
  const member=last?!!fundItem(last,KCP(p,last).capital):null;   // سرمایهٔ صندوق تعاون (کد ۷۹۶) در آخرین فیش
  const dead=pf.deceased,deadTxt=dead?(dead.deathDate?"فوت شده در تاریخ "+faId(fmtDate8(dead.deathDate)):"فوت شده (تاریخ فوت ثبت نشده است)"):"";
  const hero=`<div class="pf-hero ${stClass(p.status,!!dead)}${member===true?" member":member===false?" nonmember":""}">
    <div class="${avClass(p.gender)} lg" data-photo="${esc(p.code)}">${esc(initials(p))}</div>
    <div class="who"><h2>${esc(full)}</h2>
      <div class="sub"><span>شمارهٔ پرسنلی: <b class="u-c-fff">${faId(p.code)}</b></span>${p.nationalId?`<span>کد ملی: ${faId(p.nationalId)}</span>`:""}${p.mobile?`<span>موبایل: ${faId(p.mobile)}</span>`:""}</div>
      <div class="u-mt8">${p.membershipCancelDate?`<span class="badge b-red">عضویت لغو شده — ${faId(esc(fmtDate8(p.membershipCancelDate)))}</span> `:member===true?'<span class="badge b-member">عضو صندوق تعاون</span> ':""}${dead?`<span class="badge b-dark">فوت شده${dead.deathDate?" — "+faId(esc(fmtDate8(dead.deathDate))):""}</span> `:""}${statusBadge(p.status)}${p.currentStatus?` <span class="badge b-blue">${esc(p.currentStatus)}</span>`:""}</div></div>
    ${rec?`<div class="net"><small>خالص دریافتی (${MONTHS[last.month-1]} ${faId(last.year)})</small><b>${fa(rec.net)}</b> <small class="u-inline">${esc(app.settings.unit)}</small></div>`:""}
    <div class="pf-acts">${[["loanform","ثبت وام و چاپ فرم","F8"],["advance","مساعده","F6"],["goods","درخواست کالا","F7"],["services","درخواست خدمات","F9"]].filter(x=>can(x[0])).map(x=>`<button class="btn btn-hero" data-wk="${x[0]}">${x[1]}${x[2]?`<span class="kbd">${x[2]}</span>`:""}</button>`).join("")}</div>
  </div>`;

  const ident=`<div class="pf-sec${E("ident")?" editing":""}">${secHead("ident","مشخصات هویتی","i-id")}
    ${E("ident")?"":`<div class="segrow"><div><label>جنسیت</label>${seg(["مرد","زن"],p.gender,["blue","blue"])}</div>
      <div><label>وضعیت تأهل</label>${seg(["متاهل","مجرد","معیل"],p.maritalStatus,["blue","blue","blue"])}</div></div>`}
    <div class="pf-grid">${pfFieldList("ident").filter(f=>E("ident")||(f.k!=="gender"&&f.k!=="maritalStatus")).map(f=>fieldTile(f,p,E("ident"))).join("")}</div></div>`;

  const job=`<div class="pf-sec${E("job")?" editing":""}">${secHead("job","اطلاعات استخدامی","i-users")}
    ${E("job")?"":`<div class="segrow"><div><label>وضعیت</label>${seg(["شاغل","بازنشسته","وظیفه بگیر","قطع رابطه"],p.status,["green","amber","blue","red"])}</div></div>`}
    ${E("job")?`<p class="sec-empty u-m0b8">توجه: وضعیت (شاغل/بازنشسته/وظیفه بگیر/قطع رابطه) با وارد کردن فایل‌های حقوق دورهٔ بعد دوباره به‌طور خودکار همگام می‌شود.</p>
      <div id="stReasonBox" class="pf-grid u-mb10 u-bg-amber-soft u-p10 u-r12" hidden><label class="fld ef"><small>علت تغییر وضعیت</small><select class="inp" data-k="statusReason"><option value=""></option>${STATUS_REASONS.map(r=>`<option>${r}</option>`).join("")}</select></label><label class="fld ef w2"><small>شرح (اختیاری)</small><input class="inp" data-k="statusNote" maxlength="500"></label></div>`:""}
    <div class="pf-grid">${pfFieldList("job").filter(f=>E("job")||f.k!=="status").map(f=>fieldTile(f,p,E("job"))).join("")}</div></div>`;

  const bank=`<div class="pf-sec${E("bank")?" editing":""}">${secHead("bank","تماس و حساب بانکی","i-wallet")}
    <div class="pf-grid">${pfFieldList("bank").map(f=>fieldTile(f,p,E("bank"))).join("")}</div></div>`;

  const notes=`<div class="pf-sec${E("notes")?" editing":""}">${secHead("notes","توضیحات","i-file")}
    ${dead?`<div class="pf-dead">${esc(deadTxt)}</div>`:""}
    ${E("notes")?`<textarea class="inp" data-k="notes" placeholder="هر اطلاعاتی دربارهٔ این فرد که لازم است ثبت شود…">${esc(p.notes||"")}</textarea>`
      :`<div class="notes">${p.notes?esc(p.notes):"<span style=\"color:var(--muted)\">توضیحی ثبت نشده است. با دکمهٔ «ویرایش» می‌توانید بنویسید.</span>"}</div>`}</div>`;

  let money=`<div class="pf-sec"><h3><svg class="i"><use href="#i-coins"/></svg>وضعیت مالی (آخرین فیش)</h3>`;
  if(!last)money+=`<div class="sec-empty">هنوز فیش حقوقی برای این فرد ثبت نشده است.</div>`;
  else{
    const kcp=KCP(p,last),cap=fundItem(last,kcp.capital),inst=fundItem(last,kcp.loan1);
    const U=" "+esc(app.settings.unit);
    money+=`<div class="mgrid">
      <div class="mcard hl"><small>خالص دریافتی</small><b>${fa(rec.net)}</b>${U}</div>
      <div class="mcard"><small>جمع مزایا</small><b>${fa(rec.gross)}</b></div>
      <div class="mcard"><small>جمع کسور</small><b>${fa(rec.ded_)}</b></div>
      <div class="mcard vi"><small>سرمایه صندوق وام ضروری (${faId(kcp.capital)})</small><b>${pf.capitalPending!=null?fa(pf.capitalPending):cap?fa(cap.remaining):"—"}</b>${pf.capitalPending!=null?`<small class="u-block u-c-emerald-ink">سرمایهٔ جدید (افزایش سرمایهٔ ثبت‌شده؛ هنوز در فیش نیامده)</small>`:""}</div>
      <div class="mcard"><small>قسط وام ضروری (${faId(kcp.loan1)})</small><b>${inst?fa(inst.v):"—"}</b></div>
      <div class="mcard"><small>مانده وام ضروری (${faId(kcp.loan1)})</small><b>${inst?fa(inst.remaining):"—"}</b></div>
    </div>`;
    const li=loanItemsOf(last);
    if(li.length)money+=`<div class="tbl-wrap u-mt12"><table class="tbl"><thead><tr><th>وام / صندوق</th><th>قسط</th><th>مانده</th><th>مبلغ وام</th></tr></thead><tbody>`+
      li.map(x=>`<tr><td>${esc(x.label)} <span class="u-c-muted u-fs11-5 u-ltr u-bidi-iso u-iblock">(${faId(x.code)}${x.ref?"-"+faId(x.ref):""})</span></td><td>${fa(x.v)}</td><td>${fa(x.remaining)}</td><td>${fa(x.principal)}</td></tr>`).join("")+`</tbody></table></div>`;
  }
  money+=`</div>`;

  const q=(pf.loanQueue||[]);
  const qRecv=q.filter(x=>x.status==="received"),qWait=q.filter(x=>x.status!=="received");
  const kcq=KCP(p,last),capNow=last?fundItem(last,kcq.capital):null,instNow=last?loanItemsOf(last).find(l=>String(l.code)===kcq.loan1):null;
  const stBadge=x=>`<span class="badge ${x.status==="received"?"b-green":x.status==="cancelled"?"b-red":"b-amber"}">${x.status==="received"?"دریافت‌شده":x.status==="cancelled"?"لغوشده":"در انتظار"}</span>`;
  const queue=`<div class="pf-sec"><h3 data-wk="loanform" title="باز کردن صفحهٔ ثبت وام" class="u-pointer"><svg class="i"><use href="#i-coins"/></svg>نوبت وام <span class="hint u-fw400 u-ms8">ثبت وام ${ico("chev-r","fwd")}</span></h3>`+(q.length?(
    (qRecv.length?`<div class="hint u-mb4"><b>وام دریافت‌شده</b></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>تاریخ درخواست<br><small>(پایان اقساط وام قبلی)</small></th><th>تاریخ دریافت وام</th><th>سرمایه فعلی</th><th>مبلغ وام دریافتی</th><th>قسط جاری</th><th>پایان اقساط</th><th>وضعیت</th></tr></thead><tbody>`+
      qRecv.map(x=>`<tr class="clk" data-lqopen="${x.id}" title="باز کردن در صفحهٔ ثبت وام"><td>${lqYm(x.registrationYear,x.registrationMonth)||"—"}</td><td>${x.instStartYear?"<b>"+lqYm(x.instStartYear,x.instStartMonth)+"</b>":"—"}</td><td class="money">${capNow?fa(capNow.remaining):"—"}</td><td class="money">${x.instLoanPaid?fa(x.instLoanPaid):"—"}</td><td class="money">${instNow?fa(Math.abs(instNow.v)):(x.instCurrentAmount?fa(x.instCurrentAmount):"—")}</td><td>${pfInstEnd(x,last,p)}</td><td>${stBadge(x)}</td></tr>`).join("")+`</tbody></table></div>`:"")+
    (qWait.length?`<div class="hint u-m-10-0-4"><b>در انتظار نوبت</b></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>تاریخ درخواست<br><small>(پایان اقساط وام قبلی)</small></th><th>تاریخ نوبت</th><th>سرمایه</th><th>مبلغ وام محاسبه‌شده</th><th>قسط</th><th>وضعیت</th></tr></thead><tbody>`+
      qWait.map(x=>`<tr class="clk" data-lqopen="${x.id}" title="باز کردن در صفحهٔ ثبت وام"><td>${lqYm(x.registrationYear,x.registrationMonth)||"—"}</td><td><span class="badge b-blue">${lqYm(x.dueYear,x.dueMonth)}</span></td><td class="money">${fa(x.capital)}</td><td class="money">${fa(x.loanAmount)}</td><td>${fa(x.installmentAmount)} <small class="u-c-muted">(${fa(x.installmentMonths)} ماهه)</small></td><td>${stBadge(x)}</td></tr>`).join("")+`</tbody></table></div>`:"")
    ):`<div class="sec-empty">برای این فرد نوبت وامی ثبت نشده است.</div>`)+`</div>`;

  const hist=`<div class="pf-sec"><h3><svg class="i"><use href="#i-receipt"/></svg>سابقهٔ فیش‌ها <small class="u-c-muted u-fw400 u-fs12">— روی هر ردیف کلیک کنید تا فیش در پنجرهٔ جدید باز شود</small></h3>`+(pay.length?
    `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>دوره</th><th>نوع</th><th>جمع مزایا</th><th>جمع کسور</th><th>خالص پرداختی</th><th></th></tr></thead><tbody>`+
    pay.map((x,i)=>{const r=recOf(x);return `<tr class="clk" data-slip="${i}" title="نمایش فیش در پنجرهٔ جدید"><td>${MONTHS[x.month-1]} ${faId(x.year)}</td><td><span class="badge ${x.kind==="retiree"?(p.status==="وظیفه بگیر"?"b-blue":"b-amber"):"b-green"}">${x.kind==="retiree"?(p.status==="وظیفه بگیر"?"وظیفه بگیر":"بازنشسته"):"شاغل"}</span></td><td>${fa(r.gross)}</td><td>${fa(r.ded_)}</td><td class="money">${fa(r.net)}</td><td><span class="badge b-blue">نمایش فیش ↗</span></td></tr>`}).join("")+`</tbody></table></div>`
    :`<div class="sec-empty">فیشی ثبت نشده است.</div>`)+`</div>`;

  const lg=(pf.statusLog||[]);
  const log=`<div class="pf-sec"><h3><svg class="i"><use href="#i-list"/></svg>تاریخچهٔ تغییر وضعیت</h3>`+(lg.length?
    `<ul class="tl">`+lg.map(x=>`<li>${stFlow(x.oldStatus,x.newStatus)}<span>${x.period?MONTHS[x.period.month-1]+" "+faId(x.period.year)+" — ":""}${esc(new Date(x.changedAt).toLocaleDateString("fa-IR"))}</span>
      ${x.reason?` <span class="badge b-amber">${esc(x.reason)}</span>`:""} <button class="btn sm" data-pf="reason" data-id="${x.id}">${x.reason||x.note?"ویرایش علت":"ثبت علت"}</button>${x.note?`<div class="hint u-mt2">${esc(x.note)}</div>`:""}</li>`).join("")+`</ul>`
    :`<div class="sec-empty">تغییر وضعیتی ثبت نشده است.</div>`)+`</div>`;

  $("#pfMain").innerHTML=msg+hero+pfOrderSections({ident,job,bank,notes,money,queue,hist,log});
  applyPhotos($("#pfMain"));
}
// پایان اقساط بر پایهٔ آخرین فیش: دورهٔ فیش + ceil(مانده ÷ قسط کد ۷۱۰)؛ اگر فیش ردیف ۷۱۰ نداشت از مقدار ذخیره‌شده
function pfInstEnd(x,last,p){
  if(x.status!=="received")return"—";
  const it=last?loanItemsOf(last).find(l=>String(l.code)===KCP(p,last).loan1):null,v=it?Math.abs(+it.v||0):0,rem=it?Math.round(+it.remaining||0):0;
  if(it&&v>0){const e=addMonthsJ(last.year,last.month,rem>0?Math.ceil(rem/v):0);return faId(e.year)+"/"+faId(String(e.month).padStart(2,"0"))+(rem>0?"":" <small style='color:var(--muted)'>(تسویه)</small>")}
  return x.instEndYear?faId(x.instEndYear)+"/"+faId(String(x.instEndMonth).padStart(2,"0")):"—";
}
async function loadProfile(code,keepEdit,auto){
  if(!keepEdit)app.pfEdit=null;
  app.pfCode=code;
  if(!auto)app.pickCode=String(code);   // انتخاب خودکار اولین فرد فهرست «انتخاب کاربر» حساب نمی‌شود
  document.querySelectorAll("#personnelList .r").forEach(r=>r.classList.toggle("sel",r.dataset.code===code));
  if(!keepEdit)$("#pfMain").innerHTML=`<div class="empty" role="status">در حال بارگذاری…</div>`;
  try{
    const pf=await api("GET",`/api/personnel/${encodeURIComponent(code)}/profile?slips=${Math.max(1,Math.min(120,parseInt(FS().recentSlips,10)||12))}`);
    if(app.pfCode!==code)return; // کاربر در این فاصله فرد دیگری را انتخاب کرده
    renderProfile(pf);
  }catch(err){$("#pfMain").innerHTML=`<div class="empty">خطا در گرفتن اطلاعات: ${esc(err.message)}</div>`}
}

/* --- ویرایش هر بخش --- */
app.pfEdit=null;
async function saveSection(sec){
  const box=document.querySelector("#pfMain .pf-sec.editing");
  const p=app.pfData.person;
  if(!box)return;
  const changes={};
  box.querySelectorAll("[data-k]").forEach(el=>{
    const k=el.dataset.k,v=el.value.trim?el.value.trim():el.value;
    if(k.startsWith("x:")){const id=k.slice(2);if(v!==String((p.extra||{})[id]||"").trim())(changes.extra=changes.extra||{})[id]=v;return}
    const old=p[k]==null?"":String(p[k]).trim();
    if(sec==="notes"?(el.value!==(p.notes||"")):(v!==old))changes[k]=sec==="notes"?el.value:v;
  });
  // شمارهٔ حساب‌ها باید دقیقاً ۱۳ رقم باشند (خالی مجاز است)
  for(const [k,lb] of [["bankAccount","شمارهٔ حساب"],["advanceAccount","حساب مساعده"]]){
    if(!(k in changes))continue;
    const d=toEnDigits(changes[k]).replace(/\D/g,"");
    if(d&&d.length!==13){showAlert(`${lb} باید دقیقاً ۱۳ رقم باشد (الان ${fa(d.length)} رقم وارد شده است).`);return}
    changes[k]=d;
  }
  if("shaba" in changes){
    const sh=toEnDigits(changes.shaba).replace(/[\s\-_.]/g,"").toUpperCase();
    if(sh&&!/^IR\d{24}$/.test(sh)){showAlert("شمارهٔ شبا باید به‌صورت IR و ۲۴ رقم باشد.");return}
    changes.shaba=sh;
  }
  if(!("status" in changes)){delete changes.statusReason;delete changes.statusNote}
  if(!Object.keys(changes).length){app.pfEdit=null;renderProfile(app.pfData);return}
  try{
    await api("PUT",`/api/personnel/${encodeURIComponent(p.code)}`,changes);
    app.pfEdit=null;
    app.pfMsg="تغییرات ذخیره شد.";
    logLine("اطلاعات پرسنل "+p.code+" ویرایش شد: "+Object.keys(changes).join("، "));
    await loadProfile(p.code,true);
    refreshPersonnelList();
    if("status" in changes)refreshDashboard();
  }catch(err){showAlert("ذخیره نشد: "+err.message)}
}

/* --- نمایش فیش یک دوره در پنجرهٔ جدید --- */
function openSlipWindow(i){
  const x=app.pfData&&app.pfData.payroll[i];if(!x)return;
  const rec=recOf(x);
  const ctx={co:{name:app.settings.companyName,sub:app.settings.companySub},unit:app.settings.unit,showEmployer:app.settings.showEmployer,
    period:{y:x.year,m:x.month,issue:x.issueDate||""}};
  const fontsHTML='';
  const styleHTML=appStyleHTML();
  const doc=`<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
    <title>فیش ${esc(rec.name)} — ${MONTHS[x.month-1]} ${faId(x.year)}</title>${fontsHTML}${styleHTML}
    <style>body{background:#eef2f7;padding:14px}.bar{max-width:1100px;margin:0 auto 10px;display:flex;gap:8px;align-items:center}.bar span{font-size:12px;color:#64748b}
    @media print{.bar{display:none}body{background:#fff;padding:0}}${SLIP_PAGE_CSS}
    @media screen{#preview{max-width:1100px;margin:0 auto}#preview .sheet{width:100%!important;max-width:860px!important;padding:16px 22px 12px!important;border-radius:16px!important;border:1px solid #dbe3ee!important;outline:0!important;box-shadow:0 10px 30px rgba(15,23,42,.10)!important;background:linear-gradient(#fff,#fcfdff)!important}
    #preview table.cl th{background:linear-gradient(#f3f6fa,#e3e9f1)}#preview table.cl tbody tr:nth-child(even) td{background:#fafbfd}#preview .gbox{background:#e6edf7;border-radius:5px}}</style>
    </head><body><div class="bar"><button class="btn btn-main" onclick="window.print()">چاپ فیش</button><span>چاپ خودکار: A5 افقی؛ اگر فیش بلندتر بود A4 عمودی</span></div><div id="preview"><div class="sheet-wrap">${renderSheet(rec,ctx)}</div></div><script>${SLIP_FIT_JS}
(function(){function z(){var sh=document.querySelector('#preview .sheet'),w=document.querySelector('.sheet-wrap');if(!sh||!w)return;sh.style.zoom='';var k=Math.max(1,Math.min(1.7,(w.clientWidth-8)/860));if(k>1.02)sh.style.zoom=k.toFixed(3)}
window.addEventListener('load',function(){setTimeout(z,60)});window.addEventListener('resize',z);window.addEventListener('beforeprint',function(){var s=document.querySelector('#preview .sheet');if(s)s.style.zoom=''});window.addEventListener('afterprint',z)})();<\/script></body></html>`;
  const w=window.open("","_blank");
  if(!w){showAlert("مرورگر بازشدن پنجرهٔ جدید را مسدود کرد. اجازهٔ پاپ‌آپ را برای این صفحه بدهید.");return}
  w.document.open();w.document.write(printFontFix(doc));w.document.close();
}

$("#pfMain").addEventListener("click",e=>{
  const slip=e.target.closest("[data-slip]");
  if(slip){openSlipWindow(+slip.dataset.slip);return}
  const b=e.target.closest("[data-pf]");
  if(!b||!app.pfData)return;
  if(b.dataset.pf==="edit"){app.pfEdit=b.dataset.sec;renderProfile(app.pfData)}
  else if(b.dataset.pf==="cancel"){app.pfEdit=null;renderProfile(app.pfData)}
  else if(b.dataset.pf==="save")saveSection(b.dataset.sec);
  else if(b.dataset.pf==="reason"){
    const x=(app.pfData.statusLog||[]).find(l=>l.id===+b.dataset.id);if(!x)return;
    const p=app.pfData.person;
    openDlg({title:"علت تغییر وضعیت: از «"+(x.oldStatus||"ورود به سیستم")+"» به «"+x.newStatus+"»",
      html:`<label class="f u-mb10">علت<select name="reason"><option value=""></option>${STATUS_REASONS.map(r=>`<option${x.reason===r?" selected":""}>${r}</option>`).join("")}${x.reason&&!STATUS_REASONS.includes(x.reason)?`<option selected>${esc(x.reason)}</option>`:""}</select></label>${dlgField("شرح","note",x.note||"",'maxlength="500"')}`,
      onOk:async d=>{await api("PATCH",`/api/personnel/${encodeURIComponent(p.code)}/status-log/${x.id}`,{reason:dv(d,"reason"),note:dv(d,"note")});await loadProfile(p.code,true)}});
  }
});
// با تغییر وضعیت در حالت ویرایش، کادر «علت تغییر وضعیت» نمایش داده می‌شود
$("#pfMain").addEventListener("change",e=>{
  const t=e.target;if(!t.dataset||t.dataset.k!=="status"||!app.pfData)return;
  const box=$("#stReasonBox");if(box)box.hidden=(t.value.trim()===String(app.pfData.person.status||"").trim());
});
let _personnelSearchTimer=null;
$("#personnelSearch").addEventListener("input",()=>{
  clearTimeout(_personnelSearchTimer);
  _personnelSearchTimer=setTimeout(()=>{app.personnelPage=1;refreshPersonnelList(!!$("#personnelSearch").value.trim())},350);
});
// Enter: فوراً (بدون انتظار برای تأخیر تایپ) نتیجه را می‌گیرد و اولین فرد فهرست را انتخاب می‌کند
$("#personnelSearch").addEventListener("keydown",e=>{
  if(e.key!=="Enter")return;
  e.preventDefault();clearTimeout(_personnelSearchTimer);
  app.personnelPage=1;refreshPersonnelList(true);
});
$("#personnelBy").addEventListener("change",()=>{const i=$("#personnelSearch");i.placeholder={"":"جست‌وجوی کد پرسنلی، نام یا کد ملی",account:"شمارهٔ حساب یا شبا",mobile:"تلفن همراه (با یا بدون صفر اول)",workplace:"نام یا کد محل خدمت",all:"جست‌وجو در همهٔ فیلدها"}[$("#personnelBy").value];app.personnelPage=1;refreshPersonnelList();i.focus()});
$("#personnelPrev").addEventListener("click",()=>{if(app.personnelPage>1){app.personnelPage--;refreshPersonnelList()}});
$("#personnelNext").addEventListener("click",()=>{app.personnelPage++;refreshPersonnelList()});

