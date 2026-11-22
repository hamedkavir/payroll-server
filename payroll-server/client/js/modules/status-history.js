"use strict";
/* modules/status-history.js — تاریخچهٔ تغییر وضعیت پرسنل
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("modules/status-history");
/* ====================== تاریخچهٔ تغییر وضعیت پرسنل (گزارش بر اساس سال و ماه) ====================== */
const SH_STATUSES=["شاغل","بازنشسته","وظیفه بگیر","قطع رابطه"];
function shState(){
  if(app.sh)return app.sh;
  const cp=(app.periods||[]).find(x=>x.id===app.currentPeriodId);
  let y,m;
  if(cp){y=cp.year;m=cp.month}else{const t=todayJalali().split("/").map(Number);y=t[0];m=t[1]}
  return app.sh={year:y,month:m,kind:"all",oldStatus:"",newStatus:"",q:"",data:null,months:[]};
}
async function renderStatusHistory(){
  const root=$("#wk-statushistory"),S=shState();
  try{const r=await api("GET","/api/status-history/months");S.months=(r.items||[]).sort((a,b)=>(b.year*100+b.month)-(a.year*100+a.month))}catch(e){S.months=[]}
  const stOpts=(sel)=>`<option value="">همه</option>`+SH_STATUSES.map(x=>`<option${sel===x?" selected":""}>${x}</option>`).join("");
  root.innerHTML=`<div class="card"><h2><svg class="i"><use href="#i-userclock"/></svg>تاریخچهٔ تغییر وضعیت پرسنل</h2>
    <p class="hint u-m0b10">سال و ماه (شمسی) را انتخاب کنید تا افرادی که در همان ماه وضعیتشان تغییر کرده فهرست شوند. تغییرهای ثبت‌شده هنگام وارد کردن فایل‌های حقوق به ماهِ همان دوره، و تغییرهای دستی/فایل پرسنل به ماهِ تاریخ ثبت نسبت داده می‌شوند.</p>
    <div class="fgrid">
      <label class="f">سال<input id="sh-year" type="number" min="1390" max="1450" value="${S.year}"></label>
      <label class="f">ماه<select id="sh-month">${MONTHS.map((m,i)=>`<option value="${i+1}"${S.month===i+1?" selected":""}>${m}</option>`).join("")}</select></label>
      <label class="f">نوع رویداد<select id="sh-kind"><option value="all"${S.kind==="all"?" selected":""}>همه</option><option value="changed"${S.kind==="changed"?" selected":""}>فقط تغییر وضعیت</option><option value="new"${S.kind==="new"?" selected":""}>فقط افرادِ تازه ثبت‌شده</option></select></label>
      <label class="f">وضعیت قبلی<select id="sh-old">${stOpts(S.oldStatus)}</select></label>
      <label class="f">وضعیت جدید<select id="sh-new">${stOpts(S.newStatus)}</select></label>
      <label class="f">جست‌وجو (کد، نام، کد ملی)<input id="sh-q" value="${esc(S.q)}"></label>
    </div>
    ${S.months.length?`<div class="hint u-mt8">ماه‌های دارای تغییر ثبت‌شده در فایل‌های حقوق: ${S.months.slice(0,12).map(x=>`<button class="btn sm" data-ym="${x.year}/${x.month}">${MONTHS[x.month-1]} ${faId(x.year)} (${faId(x.count)})</button>`).join(" ")}</div>`:""}
    <div class="wk-acts u-mt10"><button class="btn btn-main" data-act="sh-run">نمایش گزارش</button><button class="btn btn-green" data-act="sh-xls">خروجی اکسل</button></div></div>
    <div id="sh-result" class="u-mt14"></div>`;
  root.onclick=e=>{
    const ym=e.target.closest("[data-ym]");
    if(ym){const [y,m]=ym.dataset.ym.split("/");$("#sh-year").value=y;$("#sh-month").value=m;shRun();return}
    const b=e.target.closest("[data-act]");if(!b)return;
    if(b.dataset.act==="sh-run")shRun();
    if(b.dataset.act==="sh-xls")shExport();
  };
  $("#sh-q").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();shRun()}};
  ["sh-month","sh-kind","sh-old","sh-new"].forEach(id=>{$("#"+id).onchange=shRun});
  shRun();
}
function shRead(){
  const S=shState();
  S.year=+toEnDigits($("#sh-year").value)||S.year;S.month=+$("#sh-month").value||S.month;
  S.kind=$("#sh-kind").value;S.oldStatus=$("#sh-old").value;S.newStatus=$("#sh-new").value;S.q=$("#sh-q").value.trim();
  return S;
}
async function shRun(){
  const S=shRead(),box=$("#sh-result");
  box.innerHTML=`<div class="hint" role="status">در حال دریافت…</div>`;
  try{
    const qs=`year=${S.year}&month=${S.month}&kind=${enc(S.kind)}&oldStatus=${enc(S.oldStatus)}&newStatus=${enc(S.newStatus)}&q=${enc(S.q)}`;
    const r=await api("GET","/api/status-history?"+qs);
    S.data=r;
    const CAP=1000,list=r.items.slice(0,CAP);
    const st=x=>x?statusBadge(x):`<span class="badge b-blue">ثبت جدید</span>`;
    const chips=r.transitions.map(t=>`<span class="badge b-blue u-m2">${esc(t.from||"ثبت جدید")} ← ${esc(t.to)}: ${faId(t.count)}</span>`).join(" ");
    box.innerHTML=`<div class="card"><h2>${MONTHS[S.month-1]} ${faId(S.year)} — ${faId(r.total)} مورد</h2>
      ${r.hasPeriod?"":`<p class="hint">برای این ماه دورهٔ حقوقی ساخته نشده؛ فقط تغییرهای دستی/فایل پرسنل (بر اساس تاریخ ثبت) نمایش داده می‌شود.</p>`}
      ${chips?`<div class="u-mb10">${chips}</div>`:""}
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ردیف</th><th>کد پرسنلی</th><th>نام و نام خانوادگی</th><th>کد ملی</th><th>وضعیت قبلی</th><th>وضعیت جدید</th><th>وضعیت فعلی</th><th>علت</th><th>شرح</th><th>تاریخ ثبت</th><th>منبع</th></tr></thead><tbody>${
        list.map((x,i)=>`<tr><td>${faId(i+1)}</td><td>${faId(esc(x.code))}</td><td>${esc(x.name||"—")}</td><td>${faId(esc(x.nationalId))}</td><td>${st(x.oldStatus)}</td><td>${statusBadge(x.newStatus)}</td><td>${x.currentStatus?statusBadge(x.currentStatus):"—"}</td><td>${esc(x.reason)}</td><td>${esc(x.note)}</td><td><bdi dir="ltr">${faId(esc(x.changedAt))}</bdi></td><td>${esc(x.source)}</td></tr>`).join("")||`<tr><td colspan="11" class="hint">در این ماه تغییر وضعیتی ثبت نشده است.</td></tr>`}</tbody></table></div>
      ${r.total>CAP?`<p class="hint">${faId(CAP)} مورد اول نمایش داده شد؛ همهٔ ${faId(r.total)} مورد در خروجی اکسل هست.</p>`:""}</div>`;
  }catch(e){box.innerHTML=emptyMsg(esc(e.message))}
}
async function shExport(){
  try{
    if(!app.sh||!app.sh.data)await shRun();
    const S=shRead(),r=app.sh.data;
    if(!r||!r.items.length){showAlert("موردی برای خروجی نیست.");return}
    const H=["ردیف","کد پرسنلی","نام و نام خانوادگی","کد ملی","وضعیت قبلی","وضعیت جدید","وضعیت فعلی","علت","شرح","تاریخ ثبت","منبع"];
    const rows=r.items.map((x,i)=>[i+1,String(x.code),x.name,String(x.nationalId||""),x.oldStatus||"ثبت جدید",x.newStatus,x.currentStatus||"",x.reason,x.note,x.changedAt,x.source]);
    const sum=r.transitions.map(t=>[t.from||"ثبت جدید",t.to,t.count]);
    await xlsxMulti(`status-history-${S.year}-${String(S.month).padStart(2,"0")}.xlsx`,[
      {name:"تغییر وضعیت",H,rows,widths:[7,14,24,14,14,14,14,18,28,18,14]},
      {name:"خلاصه",H:["از وضعیت","به وضعیت","تعداد"],rows:sum,widths:[16,16,10]}]);
  }catch(e){showAlert(e.message)}
}

async function dcAction(b){
  const act=b.dataset.act,cur=app.dc.cur;
  try{
    if(act==="dc-new"){renderDcodes();return}
    if(act==="dc-save"){
      const body={code:lat(val("dc-code")).trim(),name:val("dc-name").trim(),empStatus:val("dc-emp"),kind:+val("dc-kind"),groupId:val("dc-grp")||null};
      let id;
      if(cur){await api("PATCH","/api/dcodes/"+cur.id,body);id=cur.id}else{const r=await api("POST","/api/dcodes",body);id=r.id}
      await renderDcodes(id);showAlert("کد کسر ذخیره شد.");return;
    }
    if(act==="dc-del"&&cur){showConfirm(`کد کسر «${cur.code} — ${cur.name}» حذف شود؟`,async()=>{try{await api("DELETE","/api/dcodes/"+cur.id);await renderDcodes()}catch(e){showAlert(e.message)}})}
  }catch(err){showAlert(err.message)}
}

