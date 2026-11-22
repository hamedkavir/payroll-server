"use strict";
/* payslip/periods.js — دوره‌ها، افراد، پیش‌نمایش فیش و همگام‌سازی پس‌زمینه
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("payslip/periods");
/* ---------- دوره‌ها ---------- */
function periodLabel(p){return MONTHS[p.month-1]+" "+faId(p.year)}
// امضای هر دوره: اگر هیچ‌کدام از این‌ها عوض نشده باشد، جزئیات دوره و فهرست افراد دوباره بارگذاری نمی‌شود
// (updatedAt از نسخهٔ ۱۰۹ سرور می‌آید؛ با سرور قدیمی‌تر خالی است و تعداد افراد/نام فایل‌ها ملاک است)
const periodSig=p=>p?[p.id,p.year,p.month,p.issueDate,p.activeFile,p.retireeFile,p.loanFile,p.peopleCount,p.updatedAt||""].join("|"):"";
// opts.quiet: همگام‌سازی پس‌زمینه (فقط در صورت تغییر چیزی را بازسازی می‌کند)؛ opts.force: بارگذاری کامل حتی بدون تغییر
// خروجی: true اگر چیزی تغییر کرده بود
// نسخهٔ ۱۱۱: opts.list = فهرست دوره‌ها که همین الان از /api/sync آمده (درخواست دوباره لازم نیست).
// شمارندهٔ _periodsGen جلوی Race Condition را می‌گیرد: اگر در حین انتظار، بارگذاری تازه‌تری شروع شده باشد پاسخ کهنه دور ریخته می‌شود.
let _periodsGen=0;
async function refreshPeriods(opts){
  opts=opts||{};
  const gen=++_periodsGen;
  const prevList=app.periods||[],prevCur=prevList.find(p=>p.id===app.currentPeriodId);
  const list=opts.list||await api("GET","/api/periods");
  if(gen!==_periodsGen)return false;
  app.periods=list;
  if(opts.quiet&&!opts.force){
    const cur=app.periods.find(p=>p.id===app.currentPeriodId);
    const listSame=prevList.length===app.periods.length&&prevList.every((p,i)=>periodSig(p)===periodSig(app.periods[i]));
    if(listSame&&cur)return false;                                                    // هیچ تغییری: فرم‌ها و فهرست دست نمی‌خورند
    if(cur&&prevCur&&periodSig(cur)===periodSig(prevCur)){fillPeriodSelect();return true}   // فقط فهرست دوره‌ها عوض شده
  }
  // دورهٔ فعال پیش‌فرض: آخرین دوره (بزرگ‌ترین سال/ماه)؛ اگر دورهٔ انتخاب‌شده دیگر وجود ندارد هم به آخرین دوره برمی‌گردد
  if(!app.periods.some(x=>x.id===app.currentPeriodId))app.currentPeriodId=null;
  if(!app.currentPeriodId&&app.periods.length)app.currentPeriodId=app.periods.reduce((a,b)=>(b.year*100+b.month)>(a.year*100+a.month)?b:a).id;
  fillPeriodSelect();
  if(app.currentPeriodId)await selectPeriod(app.currentPeriodId,true,!!opts.quiet);
  else{$("#preview").innerHTML=`<div class="empty">هنوز دوره‌ای ساخته نشده. ماه و سال را انتخاب و «رفتن به این دوره» را بزنید.</div>`}
  return true;
}
function fillPeriodSelect(){
  const sel=$("#periodSelect");
  sel.innerHTML=app.periods.map(p=>
    `<option value="${p.id}"${p.id===app.currentPeriodId?" selected":""}>${esc(periodLabel(p))}${p.peopleCount?" — "+fa(p.peopleCount)+" نفر":""}</option>`
  ).join("");
  fillSlipPickers();
  const cur=app.periods.find(p=>p.id===app.currentPeriodId);
  if(cur){$("#newMonth").value=cur.month;$("#newYear").value=cur.year;$("#perMonth").value=cur.month;$("#perYear").value=cur.year;$("#issueDate").value=cur.issueDate||todayJalali()}
}
let _selSeq=0;
async function selectPeriod(id,skipReload,quiet){
  app.currentPeriodId=id;
  const seq=++_selSeq;
  const detail=await api("GET",`/api/periods/${id}`);
  if(seq!==_selSeq)return;   // در این فاصله دورهٔ دیگری انتخاب شده؛ پاسخ کهنه نمایش داده نمی‌شود
  app.periodDetail=detail;
  fillPeriodSelect();
  $("#activeMeta").innerHTML=app.periodDetail.activeFile?`فایل: <b>${esc(app.periodDetail.activeFile)}</b>`:"فایلی افزوده نشده است.";
  $("#retMeta").innerHTML=app.periodDetail.retireeFile?`فایل: <b>${esc(app.periodDetail.retireeFile)}</b>`:"فایلی افزوده نشده است.";
  $("#loanMeta").innerHTML=app.periodDetail.loanFile?`فایل: <b>${esc(app.periodDetail.loanFile)}</b>`:"فایلی افزوده نشده است.";
  await refreshPeople();
  if(!quiet&&app.page==="dashboard")refreshDashboard();   // داشبورد پنهان بازسازی نمی‌شود؛ با ورود به داشبورد (showPage) تازه می‌شود
}
$("#periodSelect").addEventListener("change",e=>selectPeriod(+e.target.value));
$("#perMonth").addEventListener("change",()=>updateCurrentPeriodMeta());
$("#perYear").addEventListener("input",()=>updateCurrentPeriodMeta());
$("#issueDate").addEventListener("input",()=>updateCurrentPeriodMeta());
let _periodMetaTimer=null;
function updateCurrentPeriodMeta(){
  if(!app.currentPeriodId)return;
  clearTimeout(_periodMetaTimer);
  _periodMetaTimer=setTimeout(async()=>{
    try{
      await api("PUT",`/api/periods/${app.currentPeriodId}`,{issueDate:$("#issueDate").value});
      // تغییر ماه/سال یک دورهٔ موجود پشتیبانی نمی‌شود (چون کلید یکتا همان ماه/سال است)؛
      // این دو فیلد را فقط برای دوره‌های تازه (پیش از ساخت) به‌کار می‌بریم
      render();
    }catch(err){showAlert(err.message)}
  },500);
}
$("#btnNewPeriod").addEventListener("click",async()=>{
  const y=toNum($("#newYear").value),m=+$("#newMonth").value;
  if(!y||y<1390||y>1450){showAlert("سال را به‌درستی وارد کنید (مثلاً ۱۴۰۵).");return}
  try{
    const p=await api("POST","/api/periods",{year:y,month:m});
    await refreshPeriods();
    await selectPeriod(p.id);
    $("#periodHint").textContent=`دورهٔ «${periodLabel(p)}» آماده است.`;
  }catch(err){showAlert(err.message)}
});
$("#btnDelPeriod").addEventListener("click",()=>{
  if(app.periods.length<=1){showAlert("حداقل یک دوره باید در پایگاه‌داده بماند.");return}
  const p=app.periods.find(x=>x.id===app.currentPeriodId);
  showConfirm(`دورهٔ «${periodLabel(p)}» و همهٔ افراد آن برای همهٔ کاربران حذف شود؟ این کار قابل بازگشت نیست.`,async()=>{
    try{
      await api("DELETE",`/api/periods/${app.currentPeriodId}`);
      app.currentPeriodId=null;
      await refreshPeriods();
    }catch(err){showAlert(err.message)}
  });
});

/* ---------- افراد ---------- */
let _peopleSeq=0;
async function refreshPeople(){
  const seq=++_peopleSeq;
  if(!app.currentPeriodId){app.people=[];render();return}
  const pid=app.currentPeriodId;
  const people=await api("GET",`/api/periods/${pid}/people`);
  if(seq!==_peopleSeq||pid!==app.currentPeriodId)return;   // پاسخ دورهٔ قبلی دیر رسیده است
  app.people=people;
  slipsFollowPick(true);
  fillList();render();
}
/* ---- سال و ماهِ فیش: فیشِ فردِ انتخاب‌شده در هر ماه/سالِ دلخواه ---- */
function fillSlipPickers(){
  const ys=$("#slipYear"),ms=$("#slipMonth");if(!ys||!ms)return;
  const cur=app.periods.find(p=>p.id===app.currentPeriodId);
  const years=[...new Set(app.periods.map(p=>p.year))].sort((a,b)=>b-a);
  ys.innerHTML=years.map(y=>`<option value="${y}"${cur&&cur.year===y?" selected":""}>${faId(y)}</option>`).join("");
  const y=cur?cur.year:years[0];
  ms.innerHTML=MONTHS.map((n,i)=>{const has=app.periods.some(p=>p.year===y&&p.month===i+1);return `<option value="${i+1}"${cur&&cur.month===i+1?" selected":""}${has?"":" disabled"}>${n}${has?"":" (بدون فیش)"}</option>`}).join("");
}
function slipsGoto(year,month){
  const per=app.periods.find(p=>p.year===year&&p.month===month);
  if(per&&per.id!==app.currentPeriodId)selectPeriod(per.id);
  else fillSlipPickers();
}
$("#slipYear").addEventListener("change",e=>{
  const y=+e.target.value,cur=app.periods.find(p=>p.id===app.currentPeriodId);
  const inYear=app.periods.filter(p=>p.year===y).sort((a,b)=>b.month-a.month);
  if(!inYear.length)return;
  const m=cur&&inYear.some(p=>p.month===cur.month)?cur.month:inYear[0].month;   // همان ماه اگر موجود باشد، وگرنه آخرین ماهِ آن سال
  slipsGoto(y,m);
});
$("#slipMonth").addEventListener("change",e=>slipsGoto(+$("#slipYear").value,+e.target.value));
// فردِ آخرین انتخاب را در فهرست این دوره انتخاب می‌کند؛ اگر در این دوره فیشی ندارد، پیام می‌دهد
function slipsFollowPick(noRender){
  app.slipMissing=false;
  if(app.pickCode&&app.people&&app.people.length){
    const hit=app.people.find(x=>String(x.code)===String(app.pickCode));
    if(hit)app.curSel=hit.id;else app.slipMissing=true;
  }
  if(!noRender){fillList();render()}
}
function recordFor(person){
  if(person.kind==="retiree")return computeRetireeRecord(person.data,app.settings.showZero);
  const loans=(app.periodDetail&&app.periodDetail.loans)||{};
  return finalizeActive(person.data,loans[person.data.info.code]||[],app.settings.showZero);
}
function fillList(){
  const q=norm($("#search").value);
  const opts=app.people.map(p=>{
    const label=(p.name||"بی‌نام")+(p.code?" — "+p.code:"")+(p.kind==="retiree"?" — بازنشسته":"");
    return{id:p.id,label,key:norm(label)};
  }).filter(o=>!q||o.key.includes(q));
  $("#empList").innerHTML=opts.map(o=>`<option value="${o.id}"${o.id===app.curSel?" selected":""}>${esc(o.label)}</option>`).join("")
    ||`<option disabled>موردی پیدا نشد</option>`;
}
$("#search").addEventListener("input",()=>{
  fillList();
  // فقط یک نتیجه: بدون Enter همان فرد انتخاب می‌شود
  const q=norm($("#search").value);if(!q)return;
  const hit=app.people.filter(p=>norm((p.name||"بی‌نام")+(p.code?" — "+p.code:"")+(p.kind==="retiree"?" — بازنشسته":"")).includes(q));
  if(hit.length===1&&app.curSel!==hit[0].id){const f=hit[0];app.curSel=f.id;if(f.code)app.pickCode=String(f.code);app.slipMissing=false;fillList();render()}
});
$("#search").addEventListener("keydown",e=>{
  if(e.key!=="Enter")return;e.preventDefault();
  const q=norm($("#search").value);
  const first=app.people.find(p=>!q||norm((p.name||"بی‌نام")+(p.code?" — "+p.code:"")+(p.kind==="retiree"?" — بازنشسته":"")).includes(q));
  if(!first)return;
  app.curSel=first.id;if(first.code)app.pickCode=String(first.code);app.slipMissing=false;fillList();render();
});
$("#empList").addEventListener("change",e=>{app.curSel=+e.target.value;const pp=app.people.find(x=>x.id===app.curSel);if(pp&&pp.code)app.pickCode=String(pp.code);app.slipMissing=false;render()});

function currentCtx(){
  const p=app.periods.find(x=>x.id===app.currentPeriodId)||{year:curY(),month:curM()+1,issueDate:todayJalali()};
  return{co:{name:app.settings.companyName,sub:app.settings.companySub},unit:app.settings.unit,
    showEmployer:app.settings.showEmployer,
    period:{y:p.year,m:p.month,issue:$("#issueDate").value||p.issueDate||todayJalali()}};
}
function render(){
  $("#btnPrint").disabled=$("#btnPrintAll").disabled=!(app.connected&&app.people.length);$("#btnPrintRange").disabled=!(app.connected&&app.people.length&&app.curSel&&!app.slipMissing);
  $("#peoplePanel").hidden=$("#sumPanel").hidden=!app.connected;
  if(!app.connected){$("#preview").innerHTML=`<div class="empty">ابتدا به سرور وصل شوید.</div>`;return}
  if(!app.people.length){$("#preview").innerHTML=`<div class="empty">برای دیدن فیش، فایل حقوق این دوره را وارد کنید.</div>`;return}
  if(app.slipMissing&&app.pickCode){
    $("#btnPrint").disabled=true;["sGross","sDed","sEmp","sNet"].forEach(i=>$("#"+i).textContent="—");
    $("#preview").innerHTML=`<div class="empty">فردِ انتخاب‌شده (کد ${faId(esc(app.pickCode))}) در این دوره فیشی ندارد. ماه یا سال دیگری را انتخاب کنید یا از فهرست «افراد این دوره» فرد دیگری را بزنید.</div>`;return;
  }
  if(!app.curSel||!app.people.some(p=>p.id===app.curSel))app.curSel=app.people[0].id;
  const person=app.people.find(p=>p.id===app.curSel);
  const d=recordFor(person);
  $("#sGross").textContent=fa(d.gross);
  $("#sDed").textContent=fa(d.ded_);
  $("#sEmp").textContent=fa(d.emp_);
  $("#sNet").textContent=fa(d.net)+" "+app.settings.unit;
  $("#preview").innerHTML=renderSheet(d,currentCtx());fitSheet();
}
// همگام‌سازی پس‌زمینه (نسخهٔ ۱۱۱)
// - هر ۱۲ ثانیه فقط GET /api/sync?since=<نسخه>: اگر هیچ دوره/فرد/تنظیمی عوض نشده باشد پاسخ چند بایت است ({changed:false}).
// - اگر چیزی عوض شده باشد، تنظیمات و فهرست دوره‌ها در همان پاسخ می‌آیند (دو درخواست جدا لازم نیست).
// - سرور قدیمی (بدون /api/sync ← ۴۰۴): همان روش نسخهٔ ۱۱۰ (تنظیمات + فهرست دوره‌ها).
// - بارگذاری کامل برای اطمینان (نسخهٔ ۱۲۰): نوبتِ بعد از هر تغییرِ نسخه، و در حالت بی‌تغییر فقط هر ۵۰ نوبت (۱۰ دقیقه).
//   دلیل نوبتِ بعد از تغییر: updated_at دقت یک‌ثانیه‌ای دارد؛ تغییر دوم در همان ثانیه ممکن است نسخه را عوض نکند.
//   پیش‌تر هر ۱۰ نوبت (۲ دقیقه) کل جزئیات دوره و فهرست افراد دوباره گرفته و صفحه بازسازی می‌شد، حتی بدون هیچ تغییری.
//   سرور قدیمی (بدون نسخه) همان روش قبلی (هر ۱۰ نوبت) را دارد.
// - داشبورد فقط وقتی باز است و چیزی عوض شده (یا هر ۵ نوبت) تازه می‌شود.
// - وقتی تب پنهان است زمان‌سنج کاملاً متوقف می‌شود و با بازگشت به تب بلافاصله یک همگام‌سازی انجام و زمان‌سنج از سر گرفته می‌شود.
const SYNC_MS=12000,SYNC_FULL_EVERY=50,SYNC_LEGACY_FULL_EVERY=10;
let _syncVersion="",_syncLegacy=false,_syncForceNext=false;
function applyServerSettings(s){
  if(!s||typeof s!=="object")return;
  app.settings=s;
  if(!app.settings.unit||/^[?؟]+$/.test(app.settings.unit))app.settings.unit="ریال";
  else fillSettingsForm();
}
async function syncQuiet(){
  if(!app.connected||app.busy||document.hidden||_syncRunning)return;
  _syncRunning=true;
  try{
    const tick=++_syncTick,force=_syncLegacy?tick%SYNC_LEGACY_FULL_EVERY===0:(_syncForceNext||tick%SYNC_FULL_EVERY===0);
    let changed=true;
    const gen=_periodsGen;
    let data=null;
    if(!_syncLegacy){
      try{data=await api("GET","/api/sync"+(_syncVersion&&!force?"?since="+encodeURIComponent(_syncVersion):""))}
      catch(e){
        if(e&&e.status===404)_syncLegacy=true;                 // سرور قدیمی (بدون /api/sync)
        else if(e&&e.status===400){_syncVersion="";return}     // نسخهٔ ذخیره‌شده نامعتبر ← نوبت بعد بارگذاری کامل
        else throw e}
    }
    if(data){
      if(gen!==_periodsGen)return;            // کاربر در این فاصله خودش دوره‌ها را تازه کرده؛ نوبت بعد دوباره بررسی می‌شود
      changed=!!data.changed;
      const moved=(data.version||"")!==_syncVersion;   // در نوبت کامل (بدون since) changed همیشه true است؛ ملاکِ تغییر واقعی، نسخه است
      if(changed){
        applyServerSettings(data.settings);
        await refreshPeriods({quiet:true,force,list:Array.isArray(data.periods)?data.periods:undefined});
      }
      _syncVersion=data.version||"";
      _syncForceNext=moved;                  // نوبت بعد یک بارگذاری کامل (تغییر هم‌ثانیه‌ای از چشم نسخه پنهان نمی‌ماند)؛
                                             // اگر همین نوبت با خطای شبکه تمام شود، درخواست بارگذاری کامل برای نوبت بعد می‌ماند
    }else{
      applyServerSettings(await api("GET","/api/settings"));
      changed=await refreshPeriods({quiet:true,force});
    }
    if(app.page==="dashboard"&&(changed||force||tick%5===0))await refreshDashboard();
  }catch(e){/* بی‌صدا نادیده گرفته می‌شود تا تجربهٔ کاربر با خطای شبکهٔ موقت خراب نشود */}
  finally{_syncRunning=false}
}
// اتصال/ورود تازه: نسخهٔ قبلی و حالت «سرور قدیمی» فراموش می‌شود (سرور ممکن است در این فاصله ارتقا یافته باشد)
function resetSync(){_syncVersion="";_syncLegacy=false;_syncTick=0;_syncForceNext=false}
function stopSync(){if(app.pollTimer){clearInterval(app.pollTimer);app.pollTimer=null}}
function startSync(){stopSync();if(!document.hidden)app.pollTimer=setInterval(syncQuiet,SYNC_MS)}
// تب پنهان ← توقف کامل؛ برگشت به تب ← همگام‌سازی فوری و ادامهٔ زمان‌سنج
document.addEventListener("visibilitychange",()=>{
  if(!app.connected)return;
  if(document.hidden){stopSync();return}
  startSync();syncQuiet();
});

