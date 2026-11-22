"use strict";
/* dashboard/dashboard.js — داشبورد مدیریتی
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("dashboard/dashboard");
/* ---------- داشبورد پرسنل ---------- */
// گزارش تغییرات (اکسل) بعد از بارگذاری هر فایل: فیش شاغلین، کسور شاغلین، فیش بازنشستگان، کارگزینی
const RPT_KIND={active:"فیش حقوقی شاغلین",loan:"کسور/اقساط شاغلین",retiree:"فیش حقوقی بازنشستگان",kargozini:"فایل کارگزینی"};
const rptLab=c=>({ledger:"دفتر کل",advance_account:"حساب مساعده",shaba:"شمارهٔ شبا",bank_account:"شمارهٔ حساب",covered_children:"اولاد مشمول",workplace_code:"کد محل خدمت",job_role:"شغل",job_rank:"رتبه شغلی",job_group:"گروه کاری",insurance_code:"کد بیمه",advance_owner:"نام صاحب حساب مساعده",status:"وضعیت"}[c]||UPD_LABELS[c]||c);
async function exportUploadReport(kind,fileName,o){
  o=o||{};
  const per=curPeriodRec(),pl=per?`${per.year}/${per.month}`:"";
  const sl=o.slip||{created:[],removed:[],changed:[]},sy=o.sync||{},ln=o.loan||{};
  const pch=[].concat(sy.changes||[],o.kg&&o.kg.changes||[]),pnew=[].concat(sy.createdList||[],o.kg&&o.kg.createdList||[]);
  const L=(a)=>(a||[]);
  const sum=[["نوع فایل",RPT_KIND[kind]||kind],["نام فایل",fileName||""],["دوره",kind==="kargozini"?"—":pl],["تاریخ",todayJalali()]];
  if(kind==="active"||kind==="retiree")sum.push(["فیش جدید",L(sl.created).length],["فیش تغییرکرده",L(sl.changed).length],["حذف‌شده از فایل",L(sl.removed).length]);
  if(o.count!=null)sum.push(["افراد در فایل",o.count]);
  sum.push(["تغییر اطلاعات پرسنل (فیلد)",pch.length],["پرسنل جدید",pnew.length],["وام: دریافت‌شده شدند",L(ln.receivedNow).length],["وام: ثبت‌شده با وضعیت دریافت (بدون نوبت قبلی)",L(ln.registeredNew).length],["وام: نوبت لغو/حذف‌شده (قطع رابطه و وظیفه‌بگیر ← لغو شده؛ بدون کسر سهم صندوق ← حذف)",L(ln.queueRemoved).length],["وام: برگشت به «در انتظار نوبت» (وضعیت فرد درست شد)",L(ln.queueRevived).length],["وام: پایان اقساط به‌روز شد",L(ln.endDateUpdated).length],["وام: وارد نوبت شدند",L(ln.activeCreated).length+L(ln.retireeCreated).length]);
  const sheets=[{name:"خلاصه",H:["شرح","مقدار"],rows:sum,widths:[34,50]}];
  if(L(sl.created).length)sheets.push({name:"فیش جدید",H:["کد","نام"],rows:sl.created.map(x=>[String(x.code),x.name||""]),widths:[16,30]});
  if(L(sl.changed).length)sheets.push({name:"فیش تغییرکرده",H:["کد","نام","خالص قبلی","خالص جدید"],rows:sl.changed.map(x=>[String(x.code),x.name||"",x.oldNet===""?"":Number(x.oldNet)||0,x.newNet===""?"":Number(x.newNet)||0]),widths:[16,30,16,16]});
  if(L(sl.removed).length)sheets.push({name:"حذف‌شده از فایل",H:["کد","نام"],rows:sl.removed.map(x=>[String(x.code),x.name||""]),widths:[16,30]});
  if(pch.length)sheets.push({name:"تغییرات پرسنل",H:["کد پرسنلی","نام و نام خانوادگی","فیلد","مقدار قبلی","مقدار جدید"],rows:pch.map(x=>[String(x.code),x.name||"",rptLab(x.field),x.old==null?"":String(x.old),x.new==null?"":String(x.new)]),widths:[14,26,22,30,30]});
  if(pnew.length)sheets.push({name:"پرسنل جدید",H:["کد پرسنلی","نام و نام خانوادگی","وضعیت"],rows:pnew.map(x=>[String(x.code),x.name||"",x.status||""]),widths:[14,28,14]});
  if(L(ln.receivedNow).length)sheets.push({name:"وام دریافت‌شده",H:["کد","تاریخ دریافت وام","پایان اقساط","قسط","مبلغ وام دریافتی"],rows:ln.receivedNow.map(x=>[String(x.code),x.start||"",x.end||"",x.amount||0,x.paid||0]),widths:[14,16,16,16,18]});
  if(L(ln.registeredNew).length)sheets.push({name:"وام ثبت‌شده بدون نوبت",H:["کد","تاریخ دریافت وام","پایان اقساط","قسط","مبلغ وام دریافتی"],rows:ln.registeredNew.map(x=>[String(x.code),x.start||"",x.end||"",x.amount||0,x.paid||0]),widths:[12,18,18,16,20]});
  if(L(ln.queueRemoved).length)sheets.push({name:"نوبت لغو یا حذف‌شده",H:["کد","علت","اقدام"],rows:ln.queueRemoved.map(x=>[String(x.code),x.reason,x.action==="cancelled"?"لغو شد":"حذف شد"]),widths:[14,30,12]});
  if(L(ln.queueRevived).length)sheets.push({name:"برگشت به نوبت",H:["کد"],rows:ln.queueRevived.map(x=>[String(x.code)]),widths:[14]});
  if(L(ln.endDateUpdated).length)sheets.push({name:"تغییر پایان اقساط",H:["کد","پایان قبلی","پایان جدید","قسط جاری"],rows:ln.endDateUpdated.map(x=>[String(x.code),x.old||"",x.end||"",x.amount||0]),widths:[14,16,16,16]});
  const nq=[].concat(L(ln.activeCreated),L(ln.retireeCreated));
  if(nq.length)sheets.push({name:"ورود به نوبت وام",H:["کد"],rows:nq.map(x=>[String(x&&x.code!=null?x.code:x)]),widths:[18]});
  await xlsxMulti(`upload-report-${kind}-${todayJalali().replace(/\//g,"-")}.xlsx`,sheets);
}
function personnelSyncNote(sync){
  if(!sync)return"";
  let extra=` (کارگزینی: ${fa(sync.activeSynced)} شاغل و ${fa(sync.retiredSynced)} بازنشسته بررسی شد`;
  if(sync.terminationChecked)extra+=`، ${fa(sync.terminatedNow)} نفر به قطع‌رابطه تغییر کرد`;
  else extra+=`؛ بررسی قطع‌رابطه هنوز انجام نشد چون فایل دیگر (شاغلین/بازنشستگان) این دوره وارد نشده`;
  extra+=")";
  const ch=[sync.nameSynced?fa(sync.nameSynced)+" نام":"",sync.nidSynced?fa(sync.nidSynced)+" کد ملی":"",sync.ledgerSynced?fa(sync.ledgerSynced)+" دفتر کل":"",sync.shabaSynced?fa(sync.shabaSynced)+" شبا":"",sync.bankSet?fa(sync.bankSet)+" نام بانک (صادرات)":""].filter(Boolean);
  if(sync.retiredSynced&&ch.length)extra+="\nاطلاعات بازنشستگان ثبت/به‌روز شد: "+ch.join("، ");
  return extra;
}
// نتیجهٔ ثبت خودکار دریافت وام (کد ۷۱۰) و به‌روزرسانی تاریخ پایان اقساط
function loanSyncNote(ls){
  if(!ls)return"";
  let t="";
  if(ls.receivedNow&&ls.receivedNow.length)t+=`\n${fa(ls.receivedNow.length)} نفر از نوبت وام «دریافت‌شده» شدند (تاریخ شروع و پایان اقساط ثبت شد).`;
  if(ls.registeredNew&&ls.registeredNew.length)t+=`\n${fa(ls.registeredNew.length)} نفر که وام گرفته بودند ولی در نوبت نبودند، با وضعیت «دریافت‌شده» ثبت شدند.`;
  if(ls.queueRemoved&&ls.queueRemoved.length){const c=ls.queueRemoved.filter(x=>x.action==="cancelled").length,d=ls.queueRemoved.length-c;t+=(c?`\n${fa(c)} نوبت وام «لغو شد» (قطع رابطه یا وظیفه‌بگیر).`:"")+(d?`\n${fa(d)} نوبت وام حذف شد (کسر نشدن سهم صندوق).`:"")}
  if(ls.queueRevived&&ls.queueRevived.length)t+=`\n${fa(ls.queueRevived.length)} نوبت وام (وضعیت فرد شاغل/بازنشسته شد) دوباره «در انتظار نوبت» شد.`;
  if(ls.endDateUpdated&&ls.endDateUpdated.length)t+=`\nتاریخ پایان اقساط ${fa(ls.endDateUpdated.length)} نفر (تغییر مبلغ قسط) به‌روز شد.`;
  if(ls.ruleNotes&&ls.ruleNotes.length)t+=ls.ruleNotes.map(x=>"\nℹ "+x).join("");
  return t;
}
function niceMax(v){
  if(v<=5)return 5;
  const p=Math.pow(10,Math.floor(Math.log10(v)));
  return Math.ceil(v/p)*p;
}
function donutSVG(parts){
  const total=parts.reduce((a,p)=>a+p.v,0);
  if(!total)return `<div class="chart-empty">هنوز فایل کارگزینی وارد نشده است.</div>`;
  const R=76,C=2*Math.PI*R;
  let off=0,s=`<svg viewBox="0 0 260 230" role="img" aria-label="تفکیک وضعیت پرسنل"><g transform="translate(130 112) rotate(-90)">`;
  parts.forEach(p=>{
    if(!p.v)return;
    const len=p.v/total*C;
    s+=`<circle r="${R}" fill="none" stroke="${p.color}" stroke-width="34" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}"/>`;
    off+=len;
  });
  s+=`</g><text x="130" y="108" text-anchor="middle" font-size="26" font-weight="700" fill="#0f172a">${fa(total)}</text><text x="130" y="130" text-anchor="middle" font-size="12" fill="#64748b">کل پرسنل</text></svg>`;
  s+=`<div class="legend">`+parts.map(p=>`<span><i style="background:${p.color}"></i>${p.label}: ${fa(p.v)} (${faId(Math.round(p.v/total*100))}٪)</span>`).join("")+`</div>`;
  return s;
}
// «از ← به» بدون وابستگی به جهت متن (اول مبدأ سمت راست، بعد فلش، بعد مقصد)
function stFlow(from,to){return `<span class="stc"><span>${esc(from||"ورود به سیستم")}</span><i>←</i><b>${esc(to)}</b></span>`}
function stClass(st,dead){return dead?"st-dead":st==="شاغل"?"st-active":st==="بازنشسته"?"st-ret":st==="وظیفه بگیر"?"st-heir":st==="قطع رابطه"?"st-off":""}
function statusBadge(st){
  const c=st==="شاغل"?"b-green":st==="بازنشسته"?"b-amber":st==="قطع رابطه"?"b-red":"b-blue";
  return `<span class="badge ${c}">${esc(st||"—")}</span>`;
}
function barChart2(data){
  const W=620,H=250,L=36,R=12,T=18,B=44;
  const max=niceMax(Math.max(1,...data.map(d=>d.count)));
  const cw=W-L-R,ch=H-T-B,slot=cw/data.length,bw=Math.min(54,slot*.58);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="پیش‌بینی نوبت وام"><defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#2563eb"/></linearGradient><linearGradient id="gb0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>`;
  for(let i=0;i<=4;i++){const v=max/4*i,y=T+ch-(v/max)*ch;s+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#eef2f7"/><text x="${L-6}" y="${y+4}" text-anchor="end" font-size="10.5" fill="#94a3b8">${faId(Math.round(v))}</text>`}
  data.forEach((d,i)=>{
    const cx=W-R-slot*(i+.5),h=(d.count/max)*ch,x=cx-bw/2,y=T+ch-h;
    s+=`<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h,d.count?3:0)}" rx="8" fill="url(#${i===0?"gb0":"gb"})"/>`;
    s+=`<text x="${cx}" y="${y-6}" text-anchor="middle" font-size="12" font-weight="700" fill="${d.count?"#1e3a8a":"#cbd5e1"}">${faId(d.count)}</text>`;
    s+=`<text x="${cx}" y="${H-22}" text-anchor="middle" font-size="11.5" fill="${i===0?"#7c3aed":"#64748b"}" font-weight="${i===0?700:400}">${MONTHS[d.month-1]}</text><text x="${cx}" y="${H-8}" text-anchor="middle" font-size="10" fill="#94a3b8">${faId(d.year)}</text>`;
  });
  return s+"</svg>";
}
/* مبلغ فشرده: میلیارد/میلیون (برای کارت‌ها و نمودار)؛ مقدار دقیق در توضیح زیرش می‌آید */
function faBig(n){
  const a=Math.abs(n),f=x=>faId(String(+x.toFixed(2)));
  return a>=1e9?f(n/1e9)+" میلیارد":a>=1e6?f(n/1e6)+" میلیون":fa(n);
}
function trendSVG(data){
  const W=620,H=260,L=44,R=12,T=18,B=46,mx=Math.max(1,...data.flatMap(d=>[d.net,d.deductions]));
  const unit=mx>=1e9?1e9:mx>=1e6?1e6:1,uname=unit===1e9?"میلیارد ریال":unit===1e6?"میلیون ریال":"ریال";
  const max=niceMax(mx/unit),cw=W-L-R,ch=H-T-B,slot=cw/data.length,bw=Math.min(22,slot*.32);
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="روند حقوق"><text x="${L-6}" y="10" text-anchor="end" font-size="10" fill="#94a3b8">${uname}</text>`;
  for(let i=0;i<=4;i++){const v=max/4*i,y=T+ch-(v/max)*ch;s+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#eef2f7"/><text x="${L-6}" y="${y+4}" text-anchor="end" font-size="10.5" fill="#94a3b8">${faId(String(+v.toFixed(1)))}</text>`}
  data.forEach((d,i)=>{
    const cx=W-R-slot*(i+.5),last=i===data.length-1;
    [[d.net,"#2563eb",-bw/2-1],[d.deductions,"#f59e0b",bw/2+1]].forEach(([v,c,dx])=>{
      const h=(v/unit/max)*ch;s+=`<rect x="${cx+dx-bw/2}" y="${T+ch-h}" width="${bw}" height="${Math.max(h,v?2:0)}" rx="5" fill="${c}"${last?"":' opacity=".85"'}/>`});
    s+=`<text x="${cx}" y="${H-28}" text-anchor="middle" font-size="11" fill="#64748b">${MONTHS[d.month-1]}</text><text x="${cx}" y="${H-14}" text-anchor="middle" font-size="9.5" fill="#94a3b8">${faId(d.year)}</text>`;
  });
  s+=`</svg><div class="legend"><span><i style="background:#2563eb"></i>خالص پرداختی</span><span><i style="background:#f59e0b"></i>جمع کسورات</span></div>`;
  return s;
}
document.addEventListener("click",e=>{if(e.target.closest("[data-dash-refresh]"))refreshDashboard()});
setInterval(()=>{if(app.page==="dashboard"&&!document.hidden)refreshDashboard()},300000);   // هر ۵ دقیقه، فقط وقتی داشبورد باز و تب فعال است
function kcSpark(series,cur){
  if(!series.length)return "";
  const W=200,H=46,mx=Math.max(1,...series.map(x=>x.total)),bw=Math.min(22,W/series.length-6),slot=W/series.length;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`+series.map((x,i)=>{
    const h=Math.max(2,x.total/mx*(H-14)),cx=W-slot*(i+.5),on=cur&&x.year===cur.year&&x.month===cur.month;
    return `<rect x="${cx-bw/2}" y="${H-12-h}" width="${bw}" height="${h}" rx="3" fill="${on?"#4f46e5":"#c7d2fe"}"/><text x="${cx}" y="${H-1}" text-anchor="middle" font-size="8.5" fill="#94a3b8">${faId(x.month)}</text>`}).join("")+`</svg>`;
}
function kcCard(x,cur){
  if(!x.code)return `<div class="kc kc-off"><div class="kc-h"><span>${esc(x.label)}</span></div><div class="sub u-m-8-0">در تنظیمات تعریف نشده است.</div>${can("settings")?`<button class="btn sm" data-go="settings">تنظیمات ${ico("chev-r","fwd")}</button>`:""}</div>`;
  const s=x.series||[],ym=r=>r.year*12+r.month,curYm=cur?ym(cur):0;
  const row=s.find(r=>ym(r)===curYm)||s[s.length-1],pv=row?s.filter(r=>ym(r)<ym(row)).pop():null;
  const d=row&&pv&&pv.total?Math.round((row.total-pv.total)/pv.total*100):null;
  const dTxt=d===null?"":`<span class="${d>0?"up":d<0?"dn":""}">${d>0?"▲":d<0?"▼":"="} ${faId(Math.abs(d))}٪</span> نسبت به ماه قبل`;
  const rep=can("reports");
  return `<div class="kc${rep?" clk":""}"${rep?' data-go="reports" data-rtab="ded"':""}><div class="kc-h"><span>${esc(x.label.replace(/^کد /,""))}</span><span class="code">${faId(esc(x.code))}</span></div>
    ${row?`<b class="v">${faBig(row.total)}</b><div class="sub">${faId(row.count)} نفر • ${MONTHS[row.month-1]} ${faId(row.year)}</div>${row.remaining!=null?`<div class="sub">مانده: <b>${faBig(row.remaining)}</b></div>`:""}<div class="sub">${dTxt||"&nbsp;"}</div>${kcSpark(s,row)}`:`<div class="sub u-m-10-0">برای این کد هنوز دادهٔ کسورات ثبت نشده است.</div>`}</div>`;
}
function dKpi(o){
  return `<div class="kpi k-${o.tone}${o.go?" clk":""}"${o.go?` data-go="${o.go}"`:""}${o.rtab?` data-rtab="${o.rtab}"`:""}><div class="kpi-t"><span class="tile t-${o.tone}"><svg class="i"><use href="#i-${o.icon}"/></svg></span><small>${o.label}</small></div><b>${o.value}</b><span class="kpi-sub">${o.sub||"&nbsp;"}</span></div>`;
}
// درخواست‌های هم‌زمان داشبورد یکی می‌شوند: اگر یک بارگذاری در جریان است، فقط یک بارگذاری دیگر بعد از آن انجام می‌شود
let _dashP=null,_dashAgain=false;
function refreshDashboard(){
  if(_dashP){_dashAgain=true;return _dashP}
  _dashP=(async()=>{try{do{_dashAgain=false;await loadDashboard()}while(_dashAgain)}finally{_dashP=null}})();
  return _dashP;
}
async function loadDashboard(){
  if(!app.connected)return;
  try{
    const cur=app.periods.find(p=>p.id===app.currentPeriodId);
    const q=cur?`&year=${cur.year}&month=${cur.month}`:"";
    const d=await api("GET","/api/dashboard?limit=50"+q);
    const F=d.finance||{},tot=d.counts.total||0,pct=x=>tot?faId(Math.round(x/tot*100))+"٪ از کل":"";
    // سربرگ
    const nm=app.user?(app.user.fullName||app.user.username):"";
    $("#dGreet").textContent=nm?`سلام ${nm}، خوش آمدید`:"داشبورد مدیریتی";
    let dt="";try{dt=new Date().toLocaleDateString("fa-IR",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}catch(e){}
    $("#dDate").textContent=dt;
    const chips=[];
    if(cur)chips.push(`<span class="dh-chip">دورهٔ فعال: ${MONTHS[cur.month-1]} ${faId(cur.year)}</span>`);
    chips.push(F.lastClosing?`<span class="dh-chip">آخرین بستن حقوق: ${MONTHS[F.lastClosing.month-1]} ${faId(F.lastClosing.year)} — ${faId(F.lastClosing.date)}</span>`:`<span class="dh-chip warn">تاریخ بستن حقوق ثبت نشده است</span>`);
    chips.push(`<button class="dh-chip" data-dash-refresh title="به‌روزرسانی داشبورد">↻ به‌روزرسانی</button>`);
    $("#dChips").innerHTML=chips.join("");
    const acts=[["loanform","ثبت وام","F8"],["advance","مساعده","F6"],["goods","درخواست کالا","F7"],["services","درخواست خدمات","F9"],["emdad","وام امداد",""],["mehr","وام بانک مهر","⇧F8"],["cheque","صدور دسته چک",""],["life","بیمه عمر",""],["insurance","بیمه تکمیلی","F11"],["changes","تغییرات ماهانه","F10"]].filter(x=>can(x[0])).map(x=>`<button class="btn btn-hero" data-wk="${x[0]}">${x[1]}<span class="kbd">${x[2]}</span></button>`);
    if(can("personnel"))acts.push(`<button class="btn btn-hero" data-go="personnel">جست‌وجوی پرسنل<span class="kbd">F2</span></button>`);
    if(can("closing"))acts.push(`<button class="btn btn-hero" data-go="closing">بستن حقوق</button>`);
    if(can("reports"))acts.push(`<button class="btn btn-hero" data-go="reports" data-rtab="ded">گزارش تجمیعی کسورات</button>`);
    if(can("statushistory"))acts.push(`<button class="btn btn-hero" data-go="statushistory">تاریخچهٔ تغییر وضعیت</button>`);
    $("#dActs").innerHTML=acts.join("");
    // کارت‌های شاخص
    const pa=F.pendingAdvances||{count:0,amount:0};
    const k=[
      dKpi({label:"کل پرسنل",value:fa(tot),sub:`${fa(d.counts.terminated)} نفر قطع رابطه`,icon:"users",tone:"blue",go:can("personnel")?"personnel":""}),
      dKpi({label:"شاغلین فعال",value:fa(d.counts.active),sub:pct(d.counts.active),icon:"usercheck",tone:"green"}),
      dKpi({label:"بازنشستگان",value:fa(d.counts.retired),sub:pct(d.counts.retired)+(d.counts.heirs?` — ${fa(d.counts.heirs)} وظیفه‌بگیر`:""),icon:"userclock",tone:"amber"}),
      dKpi({label:"نوبت وام این ماه",value:fa(d.loanDueThisMonth||0)+" نفر",sub:"بر اساس دورهٔ فعال",icon:"coins",tone:"violet",go:can("loans")?"loans":""}),
    ];
    const MH=d.mehr;
    if(can("mehr")&&MH){
      k.push(dKpi({label:"وام بانک مهر",value:faId(MH.pending.count)+" نفر در نوبت",sub:`دریافت‌شده ${faId(MH.paid.count)} • دریافت‌نشده ${faId(MH.failed.count)}`,icon:"coins",tone:"teal",go:"mehr"}));
      const ch=MH.charge;
      if(ch)k.push(dKpi({label:`شارژ بانک مهر — ${MONTHS[+ch.ym.slice(5)-1]}`,value:ch.notSet?"تعیین نشده":faBig(ch.remaining),sub:ch.notSet?`مصرف ${fa(ch.used)} ریال`:`باقی‌مانده از ${fa(ch.amount)} • مصرف ${fa(ch.used)}`,icon:"wallet",tone:ch.remaining<0?"red":"green",go:"mehr"}));
    }
    if(can("advance"))k.push(dKpi({label:"مساعدهٔ در انتظار پرداخت",value:faId(pa.count)+" مورد",sub:fa(pa.amount)+" ریال",icon:"wallet",tone:pa.count?"red":"green",go:"advance"}));
    $("#dKpis").innerHTML=k.join("");
    // مالی دورهٔ فعال
    const PY=d.payroll||{},PC=PY.current,A=PC&&PC.active,Rt=PC&&PC.retiree;
    const sum=k=>(A?A[k]:0)+(Rt?Rt[k]:0);
    if(A||Rt){
      const ym=PC.year*12+PC.month,pv=(PY.trend||[]).filter(x=>x.year*12+x.month<ym).pop();
      const chg=pv&&pv.deductions?Math.round((sum("deductions")-pv.deductions)/pv.deductions*100):null;
      const chgTxt=chg===null?"":` — ${chg>0?"▲":chg<0?"▼":"="} ${faId(Math.abs(chg))}٪ نسبت به ماه قبل`;
      $("#dPayKpis").innerHTML=[
        dKpi({label:`خالص پرداختی ${MONTHS[PC.month-1]}`,value:faBig(sum("net")),sub:`شاغلین ${A?faBig(A.net):"—"} • بازنشستگان ${Rt?faBig(Rt.net):"—"}`,icon:"wallet",tone:"teal",go:can("reports")?"reports":""}),
        dKpi({label:"جمع کسورات ماه",value:faBig(sum("deductions")),sub:fa(sum("deductions"))+" ریال"+chgTxt,icon:"coins",tone:"amber",go:can("reports")?"reports":"",rtab:"ded"}),
        dKpi({label:"جمع حقوق و مزایا",value:faBig(sum("gross")),sub:`${fa((A?A.people:0)+(Rt?Rt.people:0))} نفر دارای فیش`,icon:"users",tone:"blue",go:can("slips")?"slips":""}),
      ].join("");
    }else $("#dPayKpis").innerHTML="";
    $("#dKeyCodes").innerHTML=(d.keyCodeStats||[]).map(x=>kcCard(x,cur)).join("")||`<div class="chart-empty">کدی تعریف نشده است.</div>`;
    $("#dKcMonth").textContent=cur?`دورهٔ فعال: ${MONTHS[cur.month-1]} ${faId(cur.year)}`:"";
    $("#dChartTrend").innerHTML=(PY.trend&&PY.trend.length)?trendSVG(PY.trend):`<div class="chart-empty">پس از وارد کردن فایل حقوق دوره‌ها، روند ماهانه اینجا نمایش داده می‌شود.</div>`;
    const topMax=Math.max(1,...(PY.topDeductions||[]).map(x=>x.total));
    $("#dTopDed").innerHTML=(PY.topDeductions&&PY.topDeductions.length)
      ?PY.topDeductions.map(x=>`<div class="hb-row"><div class="nm" title="${esc(x.label)}">${esc(x.label||"—")} ${x.code?`<small>(${faId(x.code)})</small>`:""}</div><div class="hb-bar"><i style="width:${Math.max(2,Math.round(x.total/topMax*100))}%"></i></div><b>${faBig(x.total)}</b></div>`).join("")
        +(can("reports")?`<div class="u-ta-left u-mt8"><button class="btn" data-go="reports" data-rtab="ded">گزارش کامل کسورات ${ico("chev-r","fwd")}</button></div>`:"")
      :`<div class="chart-empty">فایل حقوق این دوره هنوز وارد نشده است.</div>`;
    // وضعیت داده‌ها و تغییر وضعیت‌های دوره
    const ck=(ok,text,go,goTxt)=>`<div class="al-row${go?" clk":""}"${go?` data-go="${go}"`:""}><i class="dot2 ${ok?"g":"a"}"></i><div>${text}</div>${go?`<span class="go">${goTxt} ${ico("chev-r","fwd")}</span>`:""}</div>`;
    if(PC){
      const f=PC.files;
      $("#dChecklist").innerHTML=ck(!!f.active,f.active?`فایل حقوق شاغلین: <b>${esc(f.active)}</b>`:"فایل حقوق شاغلین وارد نشده","import","تغذیه")
        +ck(!!f.retiree,f.retiree?`فایل بازنشستگان: <b>${esc(f.retiree)}</b>`:"فایل بازنشستگان وارد نشده","import","تغذیه")
        +ck(!!f.loan,f.loan?`فایل اقساط وام: <b>${esc(f.loan)}</b>`:"فایل اقساط وام وارد نشده (کسورات وام شاغلین جدا نمی‌شود)","import","تغذیه")
        +ck(PC.closed,PC.closed?"فایل حقوق این ماه بسته شده است":"فایل حقوق این ماه هنوز بسته نشده",can("closing")?"closing":"","بستن حقوق");
    }else $("#dChecklist").innerHTML=`<div class="chart-empty">دورهٔ فعالی انتخاب نشده یا برای این ماه دوره ساخته نشده است.</div>`;
    const sch=PY.statusChanges||[];
    $("#dStatusMonth").innerHTML=sch.length
      ?`<div class="u-mb8">${sch.slice(0,8).map(x=>`<span class="badge b-blue u-m2">${stFlow(x.from||"ثبت جدید",x.to)} <span>: ${faId(x.count)}</span></span>`).join(" ")}</div>`+(can("statushistory")?`<div class="u-ta-left"><button class="btn" data-go="statushistory">گزارش کامل با خروجی اکسل ${ico("chev-r","fwd")}</button></div>`:"")
      :`<div class="chart-empty u-p-20-0">در این دوره تغییر وضعیتی ثبت نشده است.</div>`;
    // نمودارها
    $("#dChartDonut").innerHTML=donutSVG([
      {label:"شاغلین فعال",v:d.counts.active,color:"#10b981"},
      {label:"بازنشستگان",v:d.counts.retired,color:"#f59e0b"},
      {label:"وظیفه بگیران",v:d.counts.heirs||0,color:"#8b5cf6"},
      {label:"قطع رابطه",v:d.counts.terminated,color:"#ef4444"}]);
    $("#dChartBars").innerHTML=(d.forecast&&d.forecast.length)?barChart2(d.forecast):`<div class="chart-empty">برای دیدن پیش‌بینی، یک دوره انتخاب کنید.</div>`;
    // نیازمند توجه
    const al=[];
    if(pa.count&&can("advance"))al.push(`<div class="al-row clk" data-go="advance"><i class="dot2 a"></i><div><b>${faId(pa.count)}</b> مساعدهٔ در انتظار پرداخت — ${fa(pa.amount)} ریال</div><span class="go">مشاهده ${ico("chev-r","fwd")}</span></div>`);
    if(can("mehr")&&MH&&MH.charge){const c=MH.charge;
      if(!c.notSet&&c.remaining<0)al.push(`<div class="al-row clk" data-go="mehr"><i class="dot2 r"></i><div>مصرف شارژ بانک مهر ${MONTHS[+c.ym.slice(5)-1]} از شارژ ماه <b>${fa(-c.remaining)}</b> ریال بیشتر شده است</div><span class="go">بانک مهر ${ico("chev-r","fwd")}</span></div>`);
      else if(c.notSet&&c.used>0)al.push(`<div class="al-row clk" data-go="mehr"><i class="dot2 a"></i><div>برای ماه ${MONTHS[+c.ym.slice(5)-1]} شارژ بانک مهر تعیین نشده است</div><span class="go">تعیین ${ico("chev-r","fwd")}</span></div>`)}
    if(d.loanDueThisMonth&&can("loans"))al.push(`<div class="al-row clk" data-go="loans"><i class="dot2 b"></i><div>نوبت وام <b>${faId(d.loanDueThisMonth)}</b> نفر در این ماه است</div><span class="go">مشاهده ${ico("chev-r","fwd")}</span></div>`);
    if(F.outOfStock&&can("inventory"))al.push(`<div class="al-row clk" data-go="inventory"><i class="dot2 r"></i><div><b>${faId(F.outOfStock)}</b> کالا در انبار ناموجود است${(F.lowStock||[]).filter(x=>x.quantity<=0).slice(0,3).map(x=>" — "+esc(x.name)).join("")}</div><span class="go">انبار ${ico("chev-r","fwd")}</span></div>`);
    else if((F.lowStock||[]).length&&F.lowStock[0].quantity>0&&F.lowStock[0].quantity<=3&&can("inventory"))al.push(`<div class="al-row clk" data-go="inventory"><i class="dot2 a"></i><div>موجودی «${esc(F.lowStock[0].name)}» کم است (${faId(F.lowStock[0].quantity)} ${esc(F.lowStock[0].unit)})</div><span class="go">انبار ${ico("chev-r","fwd")}</span></div>`);
    const Q=(d.payroll||{}).quality;
    if(Q&&Q.badAccount&&can("personnel"))al.push(`<div class="al-row clk" data-go="personnel"><i class="dot2 r"></i><div><b>${faId(Q.badAccount)}</b> نفر شمارهٔ حساب ۱۳ رقمی ندارند</div><span class="go">پرسنل ${ico("chev-r","fwd")}</span></div>`);
    if(Q&&Q.noShaba&&Q.total&&can("import"))al.push(`<div class="al-row clk" data-go="import"><i class="dot2 a"></i><div><b>${faId(Q.noShaba)}</b> نفر شمارهٔ شبا ثبت‌شده ندارند (فایل حساب/شبا را در تغذیه بدهید)</div><span class="go">تغذیه ${ico("chev-r","fwd")}</span></div>`);
    if(!F.lastClosing&&can("closing"))al.push(`<div class="al-row clk" data-go="closing"><i class="dot2 a"></i><div>تاریخ بستن فایل حقوق ثبت نشده؛ گزارش‌های مالی بر اساس ماه تقویمی هستند</div><span class="go">ثبت ${ico("chev-r","fwd")}</span></div>`);
    $("#dAlerts").innerHTML=al.length?al.join(""):`<div class="al-row"><i class="dot2 g"></i><div>موردی برای پیگیری نیست.</div></div>`;
    // از آخرین بستن حقوق
    const st=F.sinceStats;
    $("#dSince").innerHTML=st?`<p class="hint u-m0b10">ثبت‌شده‌ها از ${faId(F.since)} (روز بعد از بستن حقوق ${MONTHS[F.lastClosing.month-1]} ${faId(F.lastClosing.year)})</p>
      <div class="since-grid"><div>مساعده<b>${faId(st.advances.count)} مورد</b>${fa(st.advances.amount)}</div><div>درخواست کالا<b>${faId(st.goods.count)} مورد</b>${fa(st.goods.amount)}</div><div>وام<b>${faId(st.loans.count)} مورد</b>${fa(st.loans.amount)}</div></div>`
      :`<div class="chart-empty u-p-24-0">پس از ثبت اولین «بستن فایل حقوق»، خلاصهٔ ثبت‌های دورهٔ جاری اینجا نمایش داده می‌شود.</div>`;
    // واجدین وام
    $("#dEligibleBody").innerHTML=d.eligible&&d.eligible.length
      ?`<table class="tbl"><thead><tr><th>پرسنل</th><th>وضعیت</th><th>سرمایه (مانده کد ${kcBoth("capital")})</th><th>مبلغ وام</th><th>قسط ماهانه</th><th>نوبت دریافت</th></tr></thead><tbody>`+
        d.eligible.map(x=>`<tr><td><div class="who"><div class="av" data-photo="${esc(x.code)}">${esc(initials({firstName:(x.name||"").split(" ")[0],lastName:(x.name||"").split(" ").slice(1).join("")}))}</div><div><b>${esc(x.name||"بی‌نام")}</b><div class="hint">${faId(x.code)}</div></div></div></td><td>${statusBadge(x.status)}</td><td>${fa(x.capital)} ${esc(app.settings.unit)}</td><td class="money">${fa(x.loanAmount)} ${esc(app.settings.unit)}</td><td>${fa(x.installmentAmount)} ${esc(app.settings.unit)}</td><td><span class="badge b-blue">${faId(x.dueYear)}/${faId(String(x.dueMonth).padStart(2,"0"))}</span></td></tr>`).join("")+`</tbody></table>`
      :`<div class="chart-empty">هنوز کسی به پایان اقساط کد ۷۱۰ نرسیده است. پس از وارد کردن فایل اقساط/بازنشستگان، اینجا نمایش داده می‌شود.</div>`;
    applyPhotos($("#dEligibleBody"));
    const fmtList=(arr)=>arr.length?arr.slice(0,8).map(x=>
      `<div class="dashItem"><b>${esc(x.name||"بی‌نام")}</b> — ${faId(x.code)}${x.period?` <span class="u-c-muted">(${MONTHS[x.period.month-1]} ${faId(x.period.year)})</span>`:""}</div>`
    ).join(""):`<div class="dashEmpty">موردی نیست.</div>`;
    $("#dListActive").innerHTML=fmtList(d.recentActive);
    $("#dListRetired").innerHTML=fmtList(d.recentRetired);
    $("#dListTerminated").innerHTML=fmtList(d.recentTerminated);
  }catch(e){/* خطای موقت شبکه؛ آمار قبلی روی صفحه می‌ماند */}
}
document.addEventListener("click",e=>{
  const g=e.target.closest("[data-go]");if(!g)return;
  const pg=g.dataset.go;if(g.dataset.rtab&&app.rep)app.rep.tab=g.dataset.rtab;
  if(PAGE_PERM[pg]&&can(PAGE_PERM[pg])){showPage(pg);if(pg==="personnel")setTimeout(()=>{const i=$("#personnelSearch");if(i){i.focus();i.select()}},0)}
});

app.personnelStatus="";
app.pfCode=null;
function initials(p){
  const f=(p.firstName||"").trim(),l=(p.lastName||"").trim();
  return ((f[0]||"")+(l[0]||"")).trim()||"؟";
}
function avClass(g){return /زن|خانم|female/i.test(g||"")?"av f":"av"}
let _plSeq=0;
async function refreshPersonnelList(selectFirst){
  if(!app.connected)return;
  const q=$("#personnelSearch").value.trim();
  const seq=++_plSeq;
  try{
    const res=await api("GET",`/api/personnel?q=${encodeURIComponent(q)}&by=${encodeURIComponent($("#personnelBy").value)}&status=${encodeURIComponent(app.personnelStatus||"")}&page=${app.personnelPage}&pageSize=30`);
    if(seq!==_plSeq)return;   // پاسخ قدیمی‌تر از جست‌وجوی جدیدتر: نادیده گرفته می‌شود
    app.personnelTotal=res.total;
    $("#personnelList").innerHTML=res.items.length?res.items.map(p=>
      `<div class="r ${stClass(p.status,p.deceased)}${p.code===app.pfCode?" sel":""}" data-code="${esc(p.code)}" tabindex="0" role="button">
         <div class="${avClass(p.gender)}" data-photo="${esc(p.code)}">${esc(initials(p))}</div>
         <div class="nm"><b>${esc(p.firstName+" "+p.lastName)}</b><span>${faId(p.code)}${p.workplace?" — "+esc(p.workplace):""}${(()=>{const by=$("#personnelBy").value,v=by==="mobile"?p.mobile:by==="account"?(p.bankAccount||p.shaba):"";return v?" — "+faId(esc(v)):""})()}</span></div>
         ${p.deceased?'<span class="badge b-dark">فوت شده</span>':statusBadge(p.status)}
       </div>`).join(""):`<div class="sec-empty u-ta-center u-p18">موردی پیدا نشد.</div>`;
    applyPhotos($("#personnelList"));
    const pages=Math.max(1,Math.ceil(res.total/res.pageSize));
    $("#personnelPageInfo").textContent=`صفحهٔ ${fa(app.personnelPage)} از ${fa(pages)} — ${fa(res.total)} نفر`;
    $("#personnelPrev").disabled=app.personnelPage<=1;
    $("#personnelNext").disabled=app.personnelPage>=pages;
    if(selectFirst===true){if(res.items.length)loadProfile(res.items[0].code)}
    else if(!app.pfCode&&res.items.length)loadProfile(res.items[0].code,false,true);
  }catch(err){/* در صورت خطای شبکهٔ موقت، فهرست قبلی روی صفحه می‌ماند */}
}
$("#personnelList").addEventListener("click",e=>{
  const r=e.target.closest(".r");if(!r)return;
  loadProfile(r.dataset.code);
});
// نسخهٔ ۱۲۰: ردیف‌های فهرست پرسنل با صفحه‌کلید هم باز می‌شوند (Tab تا ردیف، سپس Enter یا Space)
$("#personnelList").addEventListener("keydown",e=>{
  if(e.key!=="Enter"&&e.key!==" ")return;
  const r=e.target.closest(".r[data-code]");if(!r||r!==e.target)return;
  e.preventDefault();loadProfile(r.dataset.code);
});
$("#pfChips").addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  app.personnelStatus=b.dataset.st;app.personnelPage=1;
  document.querySelectorAll("#pfChips button").forEach(x=>x.classList.toggle("on",x===b));
  refreshPersonnelList();
});

