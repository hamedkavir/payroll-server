"use strict";
/* modules/monthly-changes.js — تغییرات ماهانهٔ کسورات و تعریف کد کسر
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("modules/monthly-changes");
/* =============================== تغییرات ماهانهٔ کسورات تعاون (F10) =============================== */
app.wk.chg={cur:null,list:[],codes:[]};
app.wk.call={from:"",to:"",closed:"0",action:"all",dcode:"",items:[]};
const ST_CH={1:["ایجاد","b-green"],2:["اصلاح","b-amber"],3:["حذف","b-red"]};
const chB=a=>{const x=ST_CH[a]||[a,"b-blue"];return `<span class="badge ${x[1]}">${x[0]}</span>`};
const chNameOf=c=>{const all=app.wk.chg.codes.filter(x=>String(x.code)===String(c));const st0=app.wk.person&&app.wk.person.status;const st=isHeir(app.wk.person)?"وظیفه بگیر":st0;const k=all.find(x=>x.empStatus===st)||(st==="وظیفه بگیر"&&all.find(x=>x.empStatus==="بازنشسته"))||all.find(x=>!x.empStatus)||all[0];return k?k.name:""};
async function loadDeductionCodes(){try{app.wk.chg.codes=(await api("GET","/api/changes/codes")).items}catch(e){app.wk.chg.codes=app.wk.chg.codes||[]}}
async function renderChanges(selId){
  if(!selId&&app.wk.chgOpen)selId=app.wk.chgOpen;if(selId)setWkTab("changes","form");app.wk.chgOpen=0;
  const root=$("#wk-changes"),p=app.wk.person;
  await loadDeductionCodes();
  if(wkTab("changes")==="rep"){root.innerHTML=pageTabs("changes")+chAllHTML();chAllLoad();return}
  if(!p){root.innerHTML=pageTabs("changes")+pbar("changes")+emptyMsg("برای ثبت تغییر کسورات، ابتدا یک نفر را انتخاب کنید.");bindPbar("changes",root);return}
  let list=[];
  try{list=(await api("GET","/api/changes/by-person/"+enc(p.code))).items}catch(e){showAlert(e.message)}
  app.wk.chg.list=list;
  const cur=selId?list.find(x=>x.id===selId):null;app.wk.chg.cur=cur||null;
  const C=cur||{changeDate:todayJalali(),deductionCode:"",deductionName:"",loanRow:"",totalAmount:null,installmentAmount:null,remaining:null,action:1,closed:false,notes:""};
  const mv=v=>v==null?"":mnum(v);
  const lock=cur&&cur.closed;
  root.innerHTML=pageTabs("changes")+pbar("changes")+(lock?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb12">این ردیف «بسته شده» است و قابل ویرایش نیست؛ برای ویرایش، تیک «بسته شدن» را در جدول بردارید.</div>`:"")+`
  <div class="card"><h2><svg class="i"><use href="#i-list"/></svg>تغییرات ماهانهٔ کسورات تعاون ${cur?chB(cur.action):""} ${cur&&cur.closed?'<span class="badge b-blue">بسته شده</span>':""}</h2>
    <div class="fgrid">
      <label class="f">تاریخ<input id="ch-date" class="ltr" value="${esc(C.changeDate)}" placeholder="1405/07/21"></label>
      <label class="f">کد کسر<span class="u-flex u-gap6"><input id="ch-code" class="ltr u-f1 u-minw0" list="ch-codes" autocomplete="off" value="${esc(C.deductionCode)}"><button type="button" class="btn" data-act="ch-codes" title="فهرست و تعریف کدهای کسر">…</button></span><datalist id="ch-codes">${app.wk.chg.codes.map(k=>`<option value="${esc(k.code)}">${esc(k.name)}</option>`).join("")}</datalist></label>
      <label class="f span2">شرح کد کسر<input id="ch-name" value="${esc(C.deductionName)}" maxlength="150"></label>
      <label class="f">ردیف وام<input id="ch-row" class="ltr" value="${esc(C.loanRow)}"></label>
      <label class="f">مبلغ کل (ریال)<input id="ch-total" class="ltr" inputmode="numeric" data-money value="${mv(C.totalAmount)}"></label>
      <label class="f">مبلغ قسط (ریال)<input id="ch-inst" class="ltr" inputmode="numeric" data-money value="${mv(C.installmentAmount)}"></label>
      <label class="f">مانده (ریال)<input id="ch-rem" class="ltr" inputmode="numeric" data-money value="${mv(C.remaining)}"></label>
      <label class="f">وضعیت<select id="ch-act">${[[1,"۱ - ایجاد"],[2,"۲ - اصلاح"],[3,"۳ - حذف"]].map(([v,t])=>`<option value="${v}"${C.action===v?" selected":""}>${t}</option>`).join("")}</select></label>
      <label class="f span2">توضیحات<input id="ch-notes" value="${esc(C.notes)}" maxlength="500"></label>
    </div>
    <div class="wk-acts">
      <button class="btn btn-main" data-act="ch-save"${lock?" disabled":""}><svg class="i"><use href="#i-file"/></svg>ذخیره<span class="kbd">F4</span></button>
      <button class="btn" data-act="ch-new">جدید</button>
      ${cur&&!cur.closed?`<button class="btn btn-del" data-act="ch-del">حذف ردیف</button>`:""}
      <span class="sp"></span>
      <button class="btn btn-blue" data-act="ch-xlsx-person">خروجی اکسل این فرد</button>
    </div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>تغییرات ثبت‌شدهٔ ${esc(pname(p))}</h2>
    ${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>تاریخ ثبت</th><th>کد کسر</th><th>شرح کد کسر</th><th>ردیف وام</th><th>مبلغ کل</th><th>قسط</th><th>مانده</th><th>وضعیت</th><th>بسته شدن</th></tr></thead><tbody>
    ${list.map(x=>`<tr class="clk${cur&&cur.id===x.id?" selrow":""}" data-cid="${x.id}"><td>${faId(esc(x.changeDate))}</td><td>${faId(esc(x.deductionCode))}</td><td>${esc(x.deductionName)}</td><td>${x.loanRow?faId(esc(x.loanRow)):"—"}</td><td>${x.totalAmount==null?"—":fa(x.totalAmount)}</td><td>${x.installmentAmount==null?"—":fa(x.installmentAmount)}</td><td>${x.remaining==null?"—":fa(x.remaining)}</td><td>${chB(x.action)}</td><td><input type="checkbox" data-chclose="${x.id}"${x.closed?" checked":""}></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">هنوز تغییری برای این فرد ثبت نشده است.</div>`}</div>`;
  bindPbar("changes",root);chLockAmounts();
  if(app.wk.focusId){wkFocus(app.wk.focusId);app.wk.focusId=""}
}
// وضعیت «حذف»: مبلغ‌ها لازم نیست
function chLockAmounts(){
  const a=parseInt(($("#ch-act")||{}).value,10)||1;
  ["ch-total","ch-inst","ch-rem"].forEach(id=>{const el=$("#"+id);if(!el)return;el.disabled=a===3;if(a===3)el.value=""});
}
function chSyncName(){
  const c=lat(val("ch-code")).trim(),nm=$("#ch-name");
  const n=chNameOf(c);
  if(n&&(!nm.value.trim()||nm.dataset.auto==="1")){nm.value=n;nm.dataset.auto="1"}
}
async function saveChange(){
  const p=app.wk.person,cur=app.wk.chg.cur;
  const act=parseInt(($("#ch-act")||{}).value,10)||1;
  const body={changeDate:lat(val("ch-date")).trim(),deductionCode:lat(val("ch-code")).trim(),deductionName:val("ch-name").trim(),loanRow:lat(val("ch-row")).trim(),
    totalAmount:val("ch-total").trim()===""?null:toNum(val("ch-total")),installmentAmount:val("ch-inst").trim()===""?null:toNum(val("ch-inst")),remaining:val("ch-rem").trim()===""?null:toNum(val("ch-rem")),
    action:act,notes:val("ch-notes").trim()};
  if(!body.deductionCode)throw new Error("کد کسر را وارد کنید.");
  if(!body.deductionName&&!chNameOf(body.deductionCode))throw new Error("شرح این کد کسر را هم بنویسید (برای دفعات بعد ذخیره می‌شود).");
  if(cur){await api("PATCH","/api/changes/"+cur.id,body);return cur.id}
  const r=await api("POST","/api/changes",Object.assign({code:p.code},body));
  return r.id;
}
// پنجرهٔ فهرست کدهای کسر: فقط انتخاب (تعریف و ویرایش در صفحهٔ «تعریف کد کسر»)
function codesDlg(){
  const rows=app.wk.chg.codes.map(k=>`<tr class="clk" data-pick="${esc(k.code)}" data-emp="${esc(k.empStatus||"")}"><td>${faId(esc(k.code))}</td><td>${esc(k.name)}</td><td>${esc(k.empStatus||"هر دو")}</td></tr>`).join("")||`<tr><td colspan="3" class="hint">کدی تعریف نشده است.</td></tr>`;
  const w=openDlg({title:"کدهای کسر",wide:true,okText:"بستن",onOk:()=>true,html:`<div class="tbl-wrap u-maxh320 u-ovf-auto"><table class="tbl"><thead><tr><th>کد</th><th>شرح</th><th>وضعیت</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="hint u-mt8">روی یک ردیف کلیک کنید تا در فرم انتخاب شود. برای تعریف یا ویرایش کدها از منوی «تعریف کد کسر» استفاده کنید.</div>`});
  w.addEventListener("click",e=>{
    const r=e.target.closest("tr[data-pick]");if(!r)return;
    const k=app.wk.chg.codes.find(x=>String(x.code)===r.dataset.pick&&(x.empStatus||"")===r.dataset.emp);
    if(k&&$("#ch-code")){$("#ch-code").value=k.code;$("#ch-name").value=k.name;$("#ch-name").dataset.auto="1"}
    w.remove();
  });
}
function chAllHTML(){
  const a=app.wk.call;
  const sel=(id,opts,v)=>`<select id="${id}">${opts.map(([x,t])=>`<option value="${x}"${String(v)===String(x)?" selected":""}>${t}</option>`).join("")}</select>`;
  return `<div class="card u-mt14"><h2><svg class="i"><use href="#i-users"/></svg>تغییرات ماهانهٔ همهٔ افراد (فیلتر، بستن و خروجی اکسل)</h2>
  <div class="fgrid">
    <label class="f">از تاریخ ثبت<input id="ca-from" class="ltr" placeholder="1405/07/01" value="${esc(a.from)}"></label>
    <label class="f">تا تاریخ ثبت<input id="ca-to" class="ltr" placeholder="1405/07/30" value="${esc(a.to)}"></label>
    <label class="f">بسته شدن<select id="ca-closed">${[["0","باز (هنوز اعمال نشده)"],["1","بسته‌شده"],["all","همه"]].map(([v,t])=>`<option value="${v}"${a.closed===v?" selected":""}>${t}</option>`).join("")}</select></label>
    <label class="f">وضعیت<select id="ca-act">${[["all","همه"],["1","ایجاد"],["2","اصلاح"],["3","حذف"]].map(([v,t])=>`<option value="${v}"${a.action===v?" selected":""}>${t}</option>`).join("")}</select></label>
    <label class="f">کد کسر<input id="ca-dcode" class="ltr" value="${esc(a.dcode)}" placeholder="همه"></label>
  </div>
  <div class="wk-acts"><button class="btn btn-main" data-act="ca-filter">اعمال فیلتر</button>
    <button class="btn btn-amber" data-act="ca-bulkclose">بستن همهٔ فیلترشده‌های باز</button><span class="sp"></span>
    <button class="btn btn-blue" data-act="ca-xlsx">خروجی اکسل</button></div>
  <div id="ca-body" class="u-mt12"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
}
function readCaFilter(){
  const a=app.wk.call,re=/^\d{4}\/\d{2}\/\d{2}$/;
  const f=lat(val("ca-from")).trim(),t=lat(val("ca-to")).trim();
  if((f&&!re.test(f))||(t&&!re.test(t)))throw new Error("تاریخ‌ها را به‌صورت 1405/07/01 وارد کنید.");
  a.from=f;a.to=t;a.closed=val("ca-closed");a.action=val("ca-act");a.dcode=lat(val("ca-dcode")).trim();a.page=1;
}
const caQs=a=>`closed=${enc(a.closed)}&action=${enc(a.action)}`+(a.from?`&from=${enc(a.from)}`:"")+(a.to?`&to=${enc(a.to)}`:"")+(a.dcode?`&dcode=${enc(a.dcode)}`:"");
async function chFetchAll(){return (await api("GET","/api/changes?"+caQs(app.wk.call)+"&all=1")).items}
async function chAllLoad(){
  const a=app.wk.call,body=$("#ca-body");if(!body)return;
  let r;
  try{r=await api("GET","/api/changes?"+caQs(a)+`&page=${a.page||1}&pageSize=${a.size||50}`)}catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  if(r.total&&r.page>r.pages){a.page=r.pages;return chAllLoad()}
  a.items=r.items;a.meta=r;
  body.innerHTML=r.total?`<div class="wk-sum u-m0b10"><div>تعداد ردیف<b>${faId(r.total)}</b></div><div>ایجاد<b>${faId(r.counts[1])}</b></div><div>اصلاح<b>${faId(r.counts[2])}</b></div><div>حذف<b>${faId(r.counts[3])}</b></div></div>${pagerHTML("ca",a.meta)}
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>نام و نام خانوادگی</th><th>تاریخ ثبت</th><th>کد کسر</th><th>شرح</th><th>ردیف وام</th><th>مبلغ کل</th><th>قسط</th><th>مانده</th><th>وضعیت</th><th>بسته شدن</th><th></th></tr></thead><tbody>
    ${a.items.map(x=>`<tr><td>${faId(esc(x.code))}</td><td>${esc(x.name)}</td><td>${faId(esc(x.changeDate))}</td><td>${faId(esc(x.deductionCode))}</td><td>${esc(x.deductionName)}</td><td>${x.loanRow?faId(esc(x.loanRow)):"—"}</td><td>${x.totalAmount==null?"—":fa(x.totalAmount)}</td><td>${x.installmentAmount==null?"—":fa(x.installmentAmount)}</td><td>${x.remaining==null?"—":fa(x.remaining)}</td><td>${chB(x.action)}</td><td><input type="checkbox" data-chclose="${x.id}"${x.closed?" checked":""}></td>
      <td><button class="btn" data-act="ch-open" data-code="${esc(x.code)}" data-id="${x.id}">باز کردن</button></td></tr>`).join("")}</tbody></table></div>`
    :`<div class="hint">تغییری با این فیلتر پیدا نشد.</div>`;
}
async function chExport(items,tag){
  if(!items.length){showAlert("ردیفی برای خروجی در فهرست نیست.");return}
  const H=["پرسنلی","کد ملی","نام","نام خانوادگی","وضعیت (شاغل/بازنشسته)","تاریخ ثبت","کد کسر","شرح کد کسر","ردیف وام","مبلغ کل","مبلغ قسط","مانده","وضعیت","کد وضعیت (۱ ایجاد، ۲ اصلاح، ۳ حذف)","بسته شده","توضیحات","نام کاربر"];
  const rows=items.map(x=>[String(x.code),String(x.nationalId||""),x.firstName||"",x.lastName||"",x.personStatus||"",x.changeDate,String(x.deductionCode),x.deductionName,x.loanRow,x.totalAmount==null?"":x.totalAmount,x.installmentAmount==null?"":x.installmentAmount,x.remaining==null?"":x.remaining,x.actionText,x.action,x.closed?"بله":"خیر",x.notes||"",x.createdBy||""]);
  await xlsxExport(`tagheerat-${tag}-${todayJalali().replace(/\//g,"-")}.xlsx`,"تغییرات ماهانه",H,rows,[12,14,14,18,16,14,10,26,10,16,16,16,10,18,10,28,16]);
}
async function chAction(b){
  const act=b.dataset.act;
  try{
    if(act==="ch-new"){renderChanges();return}
    if(act==="ch-codes"){codesDlg();return}
    if(act==="ch-open"){setWkTab("changes","form");app.wk.code=b.dataset.code;app.wk.person=null;app.wk.chgOpen=+b.dataset.id;await renderWk("changes");return}
    if(act==="ch-save"){const id=await saveChange();await renderChanges(id);showAlert("تغییر ثبت شد.");return}
    if(act==="ch-del"&&app.wk.chg.cur){const c=app.wk.chg.cur;showConfirm(`ردیف «${c.deductionCode} — ${c.deductionName}» حذف شود؟`,async()=>{try{await api("DELETE","/api/changes/"+c.id);await renderChanges()}catch(e){showAlert(e.message)}});return}
    if(act==="ch-xlsx-person"){await chExport((app.wk.chg.list||[]).map(x=>Object.assign({firstName:app.wk.person.firstName,lastName:app.wk.person.lastName,nationalId:app.wk.person.nationalId,personStatus:app.wk.person.status},x)),"person");return}
    if(act==="ca-filter"){readCaFilter();await chAllLoad();return}
    if(act==="ca-xlsx"){readCaFilter();await chAllLoad();await chExport(await chFetchAll(),"all");return}
    if(act==="ca-bulkclose"){
      readCaFilter();await chAllLoad();
      const open=(await chFetchAll()).filter(x=>!x.closed);
      if(!open.length){showAlert("در فهرست فیلترشده ردیفِ باز وجود ندارد.");return}
      showConfirm(`${faId(open.length)} ردیف فیلترشده «بسته» شود؟ (ردیف بسته‌شده قابل ویرایش نیست)`,async()=>{
        try{const r=await api("POST","/api/changes/bulk-close",{ids:open.map(x=>x.id),closed:true});await chAllLoad();if(app.wk.person)await renderChanges(app.wk.chg.cur?app.wk.chg.cur.id:undefined);showAlert(`${faId(r.changed)} ردیف بسته شد.`)}catch(e){showAlert(e.message)}
      });
    }
  }catch(err){showAlert(err.message)}
}

/* =============================== تعریف کد کسر =============================== */
app.dc={items:[],groups:[],cur:null,q:""};
const dcFilter=()=>{const q=lat(app.dc.q||"").trim().toLowerCase();return q?app.dc.items.filter(x=>(String(x.code)+" "+x.name+" "+(x.groupName||"")+" "+(x.empStatus||"")).toLowerCase().includes(q)):app.dc.items};
const dcRows=()=>dcFilter().map(x=>`<tr class="clk${app.dc.cur&&app.dc.cur.id===x.id?" selrow":""}" data-did="${x.id}"><td>${esc(x.empStatus||"هر دو")}</td><td>${faId(x.kind)}</td><td>${esc(x.name)}</td><td>${esc(x.groupName||"—")}</td><td>${faId(esc(x.code))}</td></tr>`).join("")||`<tr><td colspan="5" class="hint">کدی پیدا نشد.</td></tr>`;
async function renderDcodes(selId){
  const root=$("#wk-dcodes");
  try{const r=await api("GET","/api/dcodes");app.dc.items=r.items;app.dc.groups=r.groups||[]}catch(e){root.innerHTML=emptyMsg(esc(e.message));return}
  const cur=selId!=null?app.dc.items.find(x=>x.id===selId):null;app.dc.cur=cur||null;
  const D=cur||{code:"",name:"",empStatus:"شاغل",kind:0,groupId:null};
  root.innerHTML=`<div class="card"><h2><svg class="i"><use href="#i-list"/></svg>تعریف کد کسر <span class="badge b-blue">${cur?"ویرایش":"کد جدید"}</span></h2>
    <div class="fgrid">
      <label class="f">کد کسر<input id="dc-code" class="ltr" maxlength="20" value="${esc(D.code)}"></label>
      <label class="f span2">عنوان<input id="dc-name" maxlength="150" value="${esc(D.name)}"></label>
      <label class="f">وضعیت شغلی<select id="dc-emp">${[["شاغل","شاغل"],["بازنشسته","بازنشسته"],["وظیفه بگیر","وظیفه بگیر"],["","هر دو"]].map(([v,t])=>`<option value="${v}"${D.empStatus===v?" selected":""}>${t}</option>`).join("")}</select></label>
      <label class="f">قسط ۰ / سهم ۱<select id="dc-kind"><option value="0"${D.kind===0?" selected":""}>۰ - قسط</option><option value="1"${D.kind===1?" selected":""}>۱ - سهم</option></select></label>
      <label class="f">گروه کد کسر<select id="dc-grp"><option value="">— بدون گروه —</option>${app.dc.groups.map(g=>`<option value="${g.id}"${D.groupId===g.id?" selected":""}>${esc(g.name)}</option>`).join("")}</select></label>
    </div>
    <div class="wk-acts"><button class="btn btn-main" data-act="dc-save"><svg class="i"><use href="#i-file"/></svg>ذخیره</button>
      <button class="btn" data-act="dc-new">جدید</button>${cur?`<button class="btn btn-del" data-act="dc-del">حذف</button>`:""}<button class="btn" data-act="dc-new">انصراف</button></div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>کدهای کسر تعریف‌شده (${faId(app.dc.items.length)})</h2>
    <input id="dc-q" placeholder="جست‌وجو (کد، عنوان، گروه)…" value="${esc(app.dc.q)}" class="u-mb10">
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>وضعیت</th><th>قسط / سهم</th><th>عنوان کد کسر</th><th>گروه</th><th>کد کسر</th></tr></thead><tbody id="dc-tbody">${dcRows()}</tbody></table></div></div>`;
}
