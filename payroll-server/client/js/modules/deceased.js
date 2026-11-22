"use strict";
/* modules/deceased.js — امور متوفیان
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("modules/deceased");
/* ====================== درگذشتگان ====================== */
const DC_KINDS=[["approved","بیمه عمر مصوب"],["supplementary","بیمه عمر مکمل"],["fund","سرمایه صندوق وام ضروری"],["debtor","بیمه عمر مانده بدهکار"]];
const DC_DIV=["approved","supplementary","fund"];   // مبلغ قابل تقسیم بین وراث («مانده بدهکار» تقسیم نمی‌شود)
const DC_REL=["همسر","پسر","دختر","مادر","پدر","خواهر","برادر","سایر"];
const dcKindName=k=>(DC_KINDS.find(x=>x[0]===k)||[0,k])[1];
app.dc={list:[],openId:null,cur:null,q:"",timer:null};
mkMoney($("#wk-deceased"));
const dcBase=W=>W.items.filter(x=>DC_DIV.includes(x.kind)).reduce((a,x)=>a+(+x.amount||0),0);
const dcHeirAmt=(W,h)=>Math.round(dcBase(W)*(+h.sharePercent||0)/100);
async function renderDeceased(){app.dc.openId?dcOpen(app.dc.openId):dcList()}
async function dcList(){
  const root=$("#wk-deceased");app.dc.openId=null;app.dc.cur=null;
  let items=[];try{items=(await api("GET","/api/deceased")).items}catch(e){root.innerHTML=emptyMsg(esc(e.message));return}
  app.dc.list=items;
  root.innerHTML=`<div class="card"><h2><svg class="i"><use href="#i-users"/></svg>ثبت فرد درگذشته</h2>
    <p class="hint u-m0b8">فرد را جست‌وجو و «ثبت درگذشته» را بزنید. مشخصات او در همین لحظه در جدولی جدا ذخیره می‌شود و بعداً حتی اگر وارث وظیفه‌بگیر با همان کد پرسنلی نامش را در «پرسنل» عوض کند، تغییر نمی‌کند.</p>
    <input id="dc-find" class="inp" placeholder="جست‌وجوی پرسنل: کد پرسنلی، نام یا کد ملی…" autocomplete="off"><div id="dc-found" class="u-mt8"></div></div>
    <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>فهرست درگذشتگان (${faId(items.length)} نفر)</h2>
      <div class="wk-acts u-mb10"><input id="dc-q" class="inp u-maxw320" placeholder="جست‌وجو در فهرست…" value="${esc(app.dc.q)}"><span class="sp"></span><button class="btn btn-green" data-dc="xls">خروجی اکسل (گزارش کامل)</button></div>
      <div id="dc-table"></div></div>`;
  dcTable();
}
function dcTable(){
  const q=normFa(app.dc.q),rows=app.dc.list.filter(x=>!q||normFa([x.code,x.firstName,x.lastName,x.nationalId].join(" ")).includes(q));
  $("#dc-table").innerHTML=rows.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>نام و نام خانوادگی</th><th>کد ملی</th><th>تاریخ فوت</th><th>مبلغ قابل تقسیم</th><th>مانده بدهکار</th><th>وراث</th><th>جمع سهم</th><th>وراث واریز شده</th><th>مبلغ واریز شده</th><th>مبلغ واریز نشده</th><th></th></tr></thead><tbody>${
    rows.map(x=>`<tr class="clk" data-dcid="${x.id}"><td>${faId(esc(x.code))}</td><td>${esc((x.firstName+" "+x.lastName).trim())}</td><td>${faId(esc(x.nationalId))}</td><td>${faId(esc(x.deathDate||"—"))}</td><td class="money">${fa(x.divisible)}</td><td class="money">${x.debtor?fa(x.debtor):"—"}</td><td>${faId(x.heirCount)}</td><td>${faId(x.sharePercent)}٪</td><td>${faId(x.paidCount)} از ${faId(x.heirCount)}</td><td class="money u-c-047857">${fa(x.paidAmount)}</td><td class="money u-c-b91c1c">${fa(x.unpaidAmount)}</td><td><button class="btn" data-dc="open" data-id="${x.id}">باز کردن</button></td></tr>`).join("")}</tbody><tfoot><tr><td colspan="4"><b>سرجمع (${faId(rows.length)} نفر)</b></td><td class="money"><b>${fa(rows.reduce((a,x)=>a+x.divisible,0))}</b></td><td class="money">${fa(rows.reduce((a,x)=>a+x.debtor,0))}</td><td>${faId(rows.reduce((a,x)=>a+x.heirCount,0))}</td><td></td><td>${faId(rows.reduce((a,x)=>a+x.paidCount,0))}</td><td class="money u-c-047857"><b>${fa(rows.reduce((a,x)=>a+x.paidAmount,0))}</b></td><td class="money u-c-b91c1c"><b>${fa(rows.reduce((a,x)=>a+x.unpaidAmount,0))}</b></td><td></td></tr></tfoot></table></div>`:`<div class="hint">موردی ثبت نشده است.</div>`;
}
async function dcSearch(){
  const q=$("#dc-find").value.trim(),box=$("#dc-found");
  if(q.length<2){box.innerHTML="";return}
  try{
    const r=await api("GET","/api/personnel?q="+enc(q)+"&pageSize=8");
    const have=new Map(app.dc.list.map(x=>[String(x.code),x.id]));
    box.innerHTML=r.items.length?`<div class="tbl-wrap"><table class="tbl"><tbody>${r.items.map(x=>`<tr><td>${faId(esc(x.code))}</td><td>${esc(((x.firstName||"")+" "+(x.lastName||"")).trim())}</td><td>${faId(esc(x.nationalId||""))}</td><td>${x.status?statusBadge(x.status):""}</td><td>${have.has(String(x.code))?`<button class="btn" data-dc="open" data-id="${have.get(String(x.code))}">قبلاً ثبت شده — باز کردن</button>`:`<button class="btn btn-del" data-dc="mark" data-code="${esc(x.code)}" data-name="${esc(((x.firstName||"")+" "+(x.lastName||"")).trim())}">ثبت درگذشته</button>`}</td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">موردی پیدا نشد.</div>`;
  }catch(e){box.innerHTML=emptyMsg(esc(e.message))}
}
function dcMark(code,name){
  openDlg({title:"ثبت به‌عنوان درگذشته",okText:"ثبت درگذشته",html:`<p class="u-m0b10 u-lh1-9"><b>${esc(name)}</b> (کد پرسنلی ${faId(esc(code))}) به‌عنوان درگذشته ثبت می‌شود و مشخصاتش در جدول جدا ذخیرهٔ ثابت می‌گردد.</p>${dlgField("تاریخ فوت (مثل ۱۴۰۵/۰۷/۲۰)","death","","class=\"ltr\" placeholder=\"1405/07/20\"")}`,
    onOk:async w=>{const r=await api("POST","/api/deceased",{code,deathDate:lat(dv(w,"death")).trim()});app.dc.openId=r.id;await dcOpen(r.id)}});
}
async function dcOpen(id){
  const root=$("#wk-deceased");
  try{app.dc.cur=await api("GET","/api/deceased/"+id);app.dc.openId=id}catch(e){showAlert(e.message);app.dc.openId=null;return dcList()}
  dcRender();
}
function dcRender(){
  const root=$("#wk-deceased"),W=app.dc.cur;
  const inp=(s,i,k,v,extra="")=>`<input data-s="${s}" data-i="${i}" data-k="${k}" value="${esc(v==null?"":String(v))}" ${extra}>`;
  const item=(x,i)=>`<tr><td><select data-s="items" data-i="${i}" data-k="kind">${DC_KINDS.map(([k,t])=>`<option value="${k}"${x.kind===k?" selected":""}>${t}</option>`).join("")}</select></td>
    <td>${inp("items",i,"amount",x.amount?mnum(x.amount):"","data-money class=\"ltr\" inputmode=\"numeric\"")}</td><td>${inp("items",i,"officeDate",x.officeDate,"class=\"ltr\" placeholder=\"1405/07/20\"")}</td><td>${inp("items",i,"heirsDate",x.heirsDate,"class=\"ltr\" placeholder=\"1405/07/20\"")}</td>
    <td>${inp("items",i,"refNo",x.refNo,"class=\"ltr\"")}</td><td>${inp("items",i,"notes",x.notes)}</td><td><button class="btn btn-del" data-dc="item-del" data-i="${i}">حذف</button></td></tr>`;
  const heir=(h,i)=>`<div class="card u-m-10-0 u-bg-f8fafc"><div class="wk-acts u-mb6"><b>وارث شمارهٔ ${faId(i+1)}</b><span class="sp"></span><button class="btn btn-del" data-dc="heir-del" data-i="${i}">حذف وارث</button></div>
    <div class="fgrid">
      <label class="f">نام *${inp("heirs",i,"firstName",h.firstName)}</label>
      <label class="f">نام خانوادگی *${inp("heirs",i,"lastName",h.lastName)}</label>
      <label class="f">کد ملی (۱۰ رقم)${inp("heirs",i,"nationalId",h.nationalId,"class=\"ltr\" inputmode=\"numeric\"")}</label>
      <label class="f">نسبت با متوفی<select data-s="heirs" data-i="${i}" data-k="relation">${DC_REL.map(r=>`<option${h.relation===r?" selected":""}>${r}</option>`).join("")}</select></label>
      <label class="f">درصد سهم (٪)${inp("heirs",i,"sharePercent",h.sharePercent||"","class=\"ltr\" inputmode=\"decimal\"")}</label>
      <label class="f">مبلغ سهم (ریال) — محاسبه‌شده<input class="ltr dc-hamt" data-i="${i}" readonly value="${mnum(dcHeirAmt(W,h))}"></label>
      <label class="f">بانک مقصد${inp("heirs",i,"bankName",h.bankName,"placeholder=\"ملی، صادرات، سپه…\"")}</label>
      <label class="f">شمارهٔ حساب${inp("heirs",i,"account",h.account,"class=\"ltr\" inputmode=\"numeric\"")}</label>
      <label class="f">شمارهٔ شبا (IR…)${inp("heirs",i,"shaba",h.shaba,"class=\"ltr\" placeholder=\"IR000000000000000000000000\"")}</label>
      <label class="f">تاریخ واریز${inp("heirs",i,"payDate",h.payDate,"class=\"ltr\" placeholder=\"1405/07/20\"")}</label>
      <label class="f u-jc-end"><span class="u-flex u-gap6 u-ai-center u-pointer u-mt22 u-fw700"><input type="checkbox" data-s="heirs" data-i="${i}" data-k="paid"${h.paid?" checked":""}>مبلغ واریز شده</span></label>
      <label class="f span2">توضیحات${inp("heirs",i,"notes",h.notes)}</label>
    </div></div>`;
  root.innerHTML=`<div class="card"><div class="wk-acts"><button class="btn" data-dc="back">${ico("chev-r","back")} بازگشت به فهرست</button><b class="u-fs16">پروندهٔ ${esc((W.firstName+" "+W.lastName).trim())} — کد پرسنلی ${faId(esc(W.code))}</b><span class="sp"></span>
      <button class="btn btn-main" data-dc="save">ذخیره</button><button class="btn btn-blue" data-dc="print"><svg class="i"><use href="#i-print"/></svg>چاپ فرم (A4)</button><button class="btn btn-del" data-dc="del">حذف پرونده</button></div></div>
    <div class="card u-mt14"><h2><svg class="i"><use href="#i-users"/></svg>۱. مشخصات متوفی <span class="badge b-blue">ثابت — در زمان ثبت ذخیره شده</span></h2>
      <div class="fgrid">${[["کد پرسنلی",W.code],["نام",W.firstName],["نام خانوادگی",W.lastName],["نام پدر",W.fatherName],["کد ملی",W.nationalId],["شمارهٔ شناسنامه",W.idNumber],["تاریخ تولد",W.birthDate],["آخرین وضعیت در پرسنل",W.lastStatus],["پست",W.jobTitle],["محل خدمت",W.workplace],["نوع استخدام",W.employmentType],["نام بانک",W.bankName]].map(([l,v])=>`<label class="f">${l}<input class="ltr u-bg-f1f5f9" readonly value="${esc(String(v||""))}"></label>`).join("")}</div>
      <div class="fgrid u-mt10">
        <label class="f">تاریخ فوت<input data-s="head" data-k="deathDate" class="ltr" value="${esc(W.deathDate)}" placeholder="1405/07/20"></label>
        <label class="f">تاریخ دریافت نامه<input data-s="head" data-k="letterDate" class="ltr" value="${esc(W.letterDate)}" placeholder="1405/07/20"></label>
        <label class="f">تاریخ ارائهٔ مدارک<input data-s="head" data-k="docsDate" class="ltr" value="${esc(W.docsDate)}" placeholder="1405/07/20"></label></div></div>
    <div class="card u-mt14"><h2><svg class="i"><use href="#i-coins"/></svg>۲. پوشش‌های بیمه‌ای و سرمایه صندوق</h2>
      <div class="wk-acts u-mb8">${DC_KINDS.map(([k,t])=>`<button class="btn" data-dc="item-add" data-kind="${k}">+ ${t}</button>`).join("")}</div>
      ${W.items.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>نوع</th><th>مبلغ (ریال)</th><th>تاریخ واریز به حساب اداره</th><th>تاریخ واریز به حساب ورثه</th><th>شمارهٔ حواله / پیگیری</th><th>توضیحات</th><th></th></tr></thead><tbody>${W.items.map(item).join("")}</tbody></table></div>`:`<div class="hint">هنوز ردیفی ثبت نشده؛ از دکمه‌های بالا یک ردیف اضافه کنید. برای هر نوع می‌توانید چند ردیف داشته باشید.</div>`}
      <div class="wk-sum u-mt10"><span>قابل تقسیم بین وراث (مصوب + مکمل + سرمایه صندوق): <b id="dc-base"></b></span><span>مانده بدهکار (تقسیم نمی‌شود): <b id="dc-debtor"></b></span><small class="hint">ریال</small></div></div>
    <div class="card u-mt14"><h2><svg class="i"><use href="#i-users"/></svg>۳. وراث و تقسیم سرمایه</h2>
      <div class="wk-acts u-mb8"><button class="btn btn-main" data-dc="heir-add">+ افزودن وارث</button><button class="btn" data-dc="heir-eq" title="درصد سهم همهٔ وراث مساوی می‌شود">تقسیم مساوی</button><span class="sp"></span><span class="hint">جمع درصد سهم: <b id="dc-sharesum"></b> — باقی‌مانده: <b id="dc-sharerest"></b></span></div>
      <div class="wk-sum u-mb8"><span>واریز شده: <b id="dc-paid" class="u-c-047857"></b></span><span>واریز نشده: <b id="dc-unpaid" class="u-c-b91c1c"></b></span><small class="hint">ریال</small></div>
      ${W.heirs.length?W.heirs.map(heir).join(""):`<div class="hint">وارثی ثبت نشده است.</div>`}</div>
    <div class="card u-mt14"><h2><svg class="i"><use href="#i-file"/></svg>توضیحات و یادداشت‌ها</h2><textarea data-s="head" data-k="notes" class="inp u-w100p u-minh90">${esc(W.notes)}</textarea></div>`;
  dcRecalc();
}
function dcRecalc(){
  const W=app.dc.cur;if(!W)return;
  const base=dcBase(W),deb=W.items.filter(x=>x.kind==="debtor").reduce((a,x)=>a+(+x.amount||0),0),sh=W.heirs.reduce((a,h)=>a+(+h.sharePercent||0),0);
  const set=(id,t)=>{const e=$("#"+id);if(e)e.textContent=t};
  set("dc-base",fa(base));set("dc-debtor",fa(deb));
  const paidA=W.heirs.filter(h=>h.paid).reduce((a,h)=>a+dcHeirAmt(W,h),0),allA=W.heirs.reduce((a,h)=>a+dcHeirAmt(W,h),0);
  set("dc-paid",fa(paidA));set("dc-unpaid",fa(allA-paidA));
  set("dc-sharesum",faId(Math.round(sh*1000)/1000)+"٪");set("dc-sharerest",faId(Math.round((100-sh)*1000)/1000)+"٪");
  document.querySelectorAll("#wk-deceased .dc-hamt").forEach(e=>{const h=W.heirs[+e.dataset.i];if(h)e.value=mnum(dcHeirAmt(W,h))});
}
async function dcSave(){
  const W=app.dc.cur;
  try{
    const body={deathDate:lat(W.deathDate||"").trim(),letterDate:lat(W.letterDate||"").trim(),docsDate:lat(W.docsDate||"").trim(),notes:W.notes||"",
      items:W.items.map(x=>({kind:x.kind,amount:x.amount||0,officeDate:lat(x.officeDate||"").trim(),heirsDate:lat(x.heirsDate||"").trim(),refNo:x.refNo||"",notes:x.notes||""})),
      heirs:W.heirs.map(h=>({firstName:h.firstName||"",lastName:h.lastName||"",nationalId:lat(h.nationalId||"").trim(),relation:h.relation||"سایر",sharePercent:lat(String(h.sharePercent||"")).trim(),account:lat(h.account||"").trim(),shaba:h.shaba||"",bankName:h.bankName||"",payDate:lat(h.payDate||"").trim(),paid:!!h.paid,notes:h.notes||""}))};
    await api("PUT","/api/deceased/"+W.id,body);
    await dcOpen(W.id);showAlert("پرونده ذخیره شد.");
  }catch(e){showAlert(e.message)}
}
// فرم چاپی پروندهٔ درگذشته (A4 افقی)
function docDeceased(W){ app.docCtx=W;
  const F="deceased",d=(v)=>faId(esc(v||"")),base=dcBase(W);
  const rowsI=W.items.map(x=>`<tr><td>${dcKindName(x.kind)}</td><td class="money">${fa(x.amount)}</td><td>${d(x.officeDate)}</td><td>${d(x.heirsDate)}</td><td>${d(x.refNo)}</td><td>${esc(x.notes||"")}</td></tr>`).join("");
  const totShare=W.heirs.reduce((a,h)=>a+(+h.sharePercent||0),0),totAmt=W.heirs.reduce((a,h)=>a+dcHeirAmt(W,h),0);
  const paidA=W.heirs.filter(h=>h.paid).reduce((a,h)=>a+dcHeirAmt(W,h),0);
  const rowsH=W.heirs.map((h,i)=>`<tr><td>${faId(i+1)}</td><td>${esc((h.firstName+" "+h.lastName).trim())}</td><td>${d(h.nationalId)}</td><td>${esc(h.relation)}</td><td>${faId(Math.round((+h.sharePercent||0)*1000)/1000)}٪</td><td class="money"><b>${fa(dcHeirAmt(W,h))}</b></td><td>${esc(h.bankName||"")}</td><td>${d(h.account)}</td><td dir="ltr">${d(h.shaba)}</td><td>${d(h.payDate)}</td><td>${h.paid?"واریز شده":"واریز نشده"}</td><td>${esc(h.notes||"")}</td></tr>`).join("");
  const V={name:esc((W.firstName+" "+W.lastName).trim()),code:faId(esc(W.code)),death:faId(esc(W.deathDate||""))};
  return `<div class="doc a4l">${dHead(ftx(F,"bismillah","بسمه تعالی"),"",todayJalali())}
    <h1 class="d-title">${ftx(F,"title","پروندهٔ پرداخت بیمه عمر و سرمایهٔ صندوق وام ضروری — متوفی")}</h1>
    <div class="d-sec"><h3>${ftx(F,"t1","۱ : مشخصات متوفی")}</h3>
      <div class="d-fg c5">${dFl("نام و نام خانوادگی",V.name,"w2")}${dFl("نام پدر",esc(W.fatherName))}${dFl("کد پرسنلی",V.code)}${dFl("کد ملی",d(W.nationalId))}</div>
      <div class="d-fg c5">${dFl("شمارهٔ شناسنامه",d(W.idNumber))}${dFl("تاریخ تولد",d(fmtDate8(W.birthDate||"")))}${dFl("تاریخ فوت",V.death)}${dFl("تاریخ دریافت نامه",d(W.letterDate))}${dFl("تاریخ ارائهٔ مدارک",d(W.docsDate))}</div></div>
    <div class="d-sec"><h3>${ftx(F,"t2","۲ : پوشش‌های بیمه‌ای و سرمایه صندوق")}</h3><table class="d-tbl"><tr><th>نوع</th><th>مبلغ (ریال)</th><th>تاریخ واریز به حساب اداره</th><th>تاریخ واریز به حساب ورثه</th><th>شمارهٔ حواله</th><th>توضیحات</th></tr>
      ${rowsI||`<tr><td colspan="6">—</td></tr>`}
      <tr><td><b>جمع قابل تقسیم (مصوب + مکمل + سرمایه صندوق)</b></td><td class="money"><b>${fa(base)}</b></td><td colspan="4">مانده بدهکار (تقسیم نمی‌شود): <b>${fa(W.items.filter(x=>x.kind==="debtor").reduce((a,x)=>a+(+x.amount||0),0))}</b> ریال</td></tr></table></div>
    <div class="d-sec"><h3>${ftx(F,"t3","۳ : وراث و تقسیم سرمایه")}</h3><table class="d-tbl"><tr><th>ردیف</th><th>نام و نام خانوادگی</th><th>کد ملی</th><th>نسبت</th><th>درصد سهم</th><th>مبلغ سهم (ریال)</th><th>بانک</th><th>شمارهٔ حساب</th><th>شمارهٔ شبا</th><th>تاریخ واریز</th><th>وضعیت واریز</th><th>توضیحات</th></tr>
      ${rowsH||`<tr><td colspan="12">—</td></tr>`}
      <tr><td colspan="4"><b>جمع</b></td><td><b>${faId(Math.round(totShare*1000)/1000)}٪</b></td><td class="money"><b>${fa(totAmt)}</b></td><td colspan="6">واریز شده: <b>${fa(paidA)}</b> ریال — واریز نشده: <b>${fa(totAmt-paidA)}</b> ریال</td></tr></table></div>
    ${W.notes?`<div class="d-sec"><h3>${ftx(F,"t4","توضیحات")}</h3><div>${esc(W.notes).replace(/\n/g,"<br>")}</div></div>`:""}
    ${dSigs(F,[`<div class="d-sig">${ftx(F,"s1","کارشناس")}</div>`,`<div class="d-sig">${ftx(F,"s2","رئیس اداره")}</div>`,`<div class="d-sig">${ftx(F,"s3","مدیر امور مالی")}</div>`,`<div class="d-sig">${esc(FS().managerTitle||"")}<br><b>${esc(FS().managerName||"")}</b></div>`],"margin-top:8px")}${dFoot()}</div>`;
}
(function(){
  const R=$("#wk-deceased");
  R.addEventListener("input",e=>{
    const t=e.target;if(t.id==="dc-find"){clearTimeout(app.dc.timer);app.dc.timer=setTimeout(dcSearch,250);return}
    if(t.id==="dc-q"){app.dc.q=t.value;dcTable();return}
    const W=app.dc.cur;if(!W||!t.dataset||!t.dataset.k)return;
    const s=t.dataset.s,k=t.dataset.k;
    if(s==="head"){W[k]=t.value;return}
    const row=(s==="items"?W.items:W.heirs)[+t.dataset.i];if(!row)return;
    row[k]=(k==="amount")?toNum(t.value):t.value;
    if(k==="kind"||k==="amount"||k==="sharePercent")dcRecalc();
  });
  R.addEventListener("change",e=>{const t=e.target;if(t.type==="checkbox"&&t.dataset&&t.dataset.k==="paid"&&app.dc.cur){const row=app.dc.cur.heirs[+t.dataset.i];if(row){row.paid=t.checked;dcRecalc()}return}
  if(t.tagName==="SELECT"&&t.dataset&&t.dataset.k&&app.dc.cur){const row=(t.dataset.s==="items"?app.dc.cur.items:app.dc.cur.heirs)[+t.dataset.i];if(row){row[t.dataset.k]=t.value;dcRecalc()}}});
  R.addEventListener("click",async e=>{
    const row=e.target.closest("tr[data-dcid]");
    const b=e.target.closest("[data-dc]");
    if(!b){if(row)dcOpen(+row.dataset.dcid);return}
    const W=app.dc.cur,a=b.dataset.dc;
    if(a==="open"){dcOpen(+b.dataset.id);return}
    if(a==="mark"){dcMark(b.dataset.code,b.dataset.name);return}
    if(a==="back"){dcList();return}
    if(a==="xls"){dcExport();return}
    if(!W)return;
    if(a==="item-add"){W.items.push({kind:b.dataset.kind,amount:0,officeDate:"",heirsDate:"",refNo:"",notes:""});dcRender();return}
    if(a==="item-del"){W.items.splice(+b.dataset.i,1);dcRender();return}
    if(a==="heir-add"){W.heirs.push({firstName:"",lastName:"",nationalId:"",relation:"همسر",sharePercent:0,account:"",shaba:"",bankName:"",payDate:"",paid:false,notes:""});dcRender();return}
    if(a==="heir-del"){W.heirs.splice(+b.dataset.i,1);dcRender();return}
    if(a==="heir-eq"){
      const n=W.heirs.length;if(!n){showAlert("ابتدا وراث را اضافه کنید.");return}
      const each=Math.floor(100/n*1000)/1000;
      W.heirs.forEach((h,i)=>{h.sharePercent=i===n-1?Math.round((100-each*(n-1))*1000)/1000:each});
      dcRender();return;
    }
    if(a==="save"){dcSave();return}
    if(a==="print"){printDoc("پروندهٔ درگذشته — "+(W.firstName+" "+W.lastName).trim(),()=>docDeceased(W),"deceased",true,"a4l");return}
    if(a==="del"){showConfirm("پروندهٔ این فرد با همهٔ ردیف‌ها و وراث برای همیشه حذف شود؟ (مشخصات پرسنل دست نمی‌خورد)",async()=>{try{await api("DELETE","/api/deceased/"+W.id);showAlert("پرونده حذف شد.");dcList()}catch(err){showAlert(err.message)}});return}
  });
})();
async function dcExport(){
  try{
    const r=await api("GET","/api/deceased/report"),L=r.items;
    if(!L.length){showAlert("موردی برای خروجی نیست.");return}
    const base=d=>d.items.filter(x=>DC_DIV.includes(x.kind)).reduce((a,x)=>a+x.amount,0),sumK=(d,k)=>d.items.filter(x=>x.kind===k).reduce((a,x)=>a+x.amount,0);
    const H1=["ردیف","کد پرسنلی","نام","نام خانوادگی","نام پدر","کد ملی","تاریخ فوت","تاریخ دریافت نامه","تاریخ ارائه مدارک","بیمه عمر مصوب (مبلغ)","بیمه عمر مکمل (مبلغ)","سرمایه صندوق وام ضروری (مبلغ)","جمع قابل تقسیم (مبلغ)","بیمه عمر مانده بدهکار (مبلغ)","تعداد وراث","مجموع درصد سهم","مبلغ واریز شده به وراث (مبلغ)","مبلغ واریز نشده به وراث (مبلغ)","توضیحات"];
    const paidOf=d=>d.heirs.filter(h=>h.paid).reduce((a,h)=>a+h.amount,0),allOf=d=>d.heirs.reduce((a,h)=>a+h.amount,0);
    const R1=L.map((d,i)=>[i+1,String(d.code),d.firstName,d.lastName,d.fatherName,String(d.nationalId||""),d.deathDate,d.letterDate,d.docsDate,sumK(d,"approved"),sumK(d,"supplementary"),sumK(d,"fund"),base(d),sumK(d,"debtor"),d.heirs.length,Math.round(d.heirs.reduce((a,h)=>a+h.sharePercent,0)*1000)/1000,paidOf(d),allOf(d)-paidOf(d),d.notes]);
    R1.push(["","","سرجمع","","","","","","",L.reduce((a,d)=>a+sumK(d,"approved"),0),L.reduce((a,d)=>a+sumK(d,"supplementary"),0),L.reduce((a,d)=>a+sumK(d,"fund"),0),L.reduce((a,d)=>a+base(d),0),L.reduce((a,d)=>a+sumK(d,"debtor"),0),L.reduce((a,d)=>a+d.heirs.length,0),"",L.reduce((a,d)=>a+paidOf(d),0),L.reduce((a,d)=>a+allOf(d)-paidOf(d),0),""]);
    const H2=["ردیف","کد پرسنلی","متوفی","نوع","مبلغ","تاریخ واریز به حساب اداره","تاریخ واریز به حساب ورثه","شمارهٔ حواله","توضیحات"],R2=[];
    const H3=["ردیف","کد پرسنلی","متوفی","نام وارث","نام خانوادگی وارث","کد ملی","نسبت","درصد سهم","مبلغ سهم","بانک","شمارهٔ حساب","شمارهٔ شبا","تاریخ واریز","وضعیت واریز","توضیحات"],R3=[];
    L.forEach(d=>{const nm=(d.firstName+" "+d.lastName).trim();
      d.items.forEach(x=>R2.push([R2.length+1,String(d.code),nm,dcKindName(x.kind),x.amount,x.officeDate,x.heirsDate,x.refNo,x.notes]));
      d.heirs.forEach(h=>R3.push([R3.length+1,String(d.code),nm,h.firstName,h.lastName,String(h.nationalId||""),h.relation,h.sharePercent,h.amount,h.bankName,String(h.account||""),h.shaba,h.payDate,h.paid?"واریز شده":"واریز نشده",h.notes]))});
    const allH=L.flatMap(d=>d.heirs),sumH=a=>a.reduce((x,h)=>x+h.amount,0);
    R3.push(["","","","جمع واریز شده","","","","",sumH(allH.filter(h=>h.paid)),"","","","","",""]);
    R3.push(["","","","جمع واریز نشده","","","","",sumH(allH.filter(h=>!h.paid)),"","","","","",""]);
    R3.push(["","","","سرجمع کل","","","","",sumH(allH),"","","","","",""]);
    await xlsxMulti("deceased-report.xlsx",[
      {name:"درگذشتگان",H:H1,rows:R1,widths:[7,12,14,16,14,14,12,14,14,18,18,22,18,20,10,12,22,22,28]},
      {name:"ردیف‌های بیمه",H:H2,rows:R2,widths:[7,12,22,24,18,18,18,16,28]},
      {name:"وراث",H:H3,rows:R3,widths:[7,12,22,14,18,14,10,10,18,14,18,28,14,14,28]}]);
  }catch(e){showAlert(e.message)}
}

