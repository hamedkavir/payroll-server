"use strict";
/* loans/loan-queue.js — نوبت وام صندوق ضروری و انتقال نوبت‌ها
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("loans/loan-queue");
/* ---------- نوبت وام صندوق ضروری ---------- */
$("#lqMonth").innerHTML=MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join("");
function lqRowHTML(item){
  const due=faId(item.dueYear)+"/"+faId(String(item.dueMonth).padStart(2,"0"));
  const acts=item.status==="pending"
    ?`<div class="lqActs">
        <button class="btn btn-green" data-act="receive" data-id="${item.id}">ثبت دریافت</button>
        <button class="btn btn-del" data-act="cancel" data-id="${item.id}">لغو</button>
      </div>`
    :`<span class="badge ${item.status==="received"?"b-green":"b-red"}">${item.status==="received"?"دریافت‌شده":"لغوشده"}</span>`;
  return `<div class="lqRow clk" data-code="${esc(item.code)}" data-id="${item.id}" title="باز کردن وام این فرد برای ویرایش">
    <div class="lqInfo"><b>${esc(item.name||"بی‌نام")} — ${faId(item.code)}</b>
      <span>سرمایه (کد ${kcBoth("capital")}): ${fa(item.capital)} ← مبلغ وام: <b class="money">${fa(item.loanAmount)}</b> ${esc(app.settings.unit)}
      | قسط ${fa(item.installmentMonths)} ماهه: ${fa(item.installmentAmount)}${item.installmentMonths>1&&lastOfInst(item.loanAmount,item.installmentAmount,item.installmentMonths)!==item.installmentAmount?` (قسط آخر: ${fa(lastOfInst(item.loanAmount,item.installmentAmount,item.installmentMonths))})`:""}<br>
      تاریخ درخواست (پایان اقساط وام قبلی): <b>${lqYm(item.registrationYear,item.registrationMonth)}</b> — تاریخ نوبت: <span class="badge b-blue">${due}</span>${item.status==="received"&&item.instStartYear?`<br>تاریخ دریافت وام: <b>${lqYm(item.instStartYear,item.instStartMonth)}</b>${item.instLoanPaid?` — مبلغ وام دریافتی: <b class="money">${fa(item.instLoanPaid)}</b>`:""} — پایان اقساط: <b>${lqYm(item.instEndYear,item.instEndMonth)}</b>`:""}</span>
    </div>
    ${acts}
  </div>`;
}
function lqSectionHTML(title,items){
  if(!items.length)return `<div class="lqSectionTitle">${title}</div><div class="dashEmpty">موردی نیست.</div>`;
  return `<div class="lqSectionTitle">${title} (${fa(items.length)} نفر)</div>`+items.map(lqRowHTML).join("");
}
// نمودار ترکیبی: ستون = تعداد افراد، خط = جمع مبلغ وام‌ها (میلیارد ریال)
function lqChartSVG(ov){
  // نمودار ستونی دوگانه: ستون آبی = تعداد افراد (محور چپ)، ستون نارنجی = جمع مبلغ وام (محور راست؛ عدد مبلغ بالای ستون)
  const W=640,H=210,L=28,R=52,T=24,B=28,data=ov.months;
  const big=Math.max(0,...data.map(d=>d.amount))>=1e9,U=big?1e9:1e6,unit=big?"میلیارد ریال":"میلیون ریال";
  const nice=v=>{if(!(v>0))return 1;const e=Math.pow(10,Math.floor(Math.log10(v)));const f=v/e;return(f<=1?1:f<=2?2:f<=5?5:10)*e};
  const maxC=Math.max(2,Math.ceil(Math.max(1,...data.map(d=>d.count))/2)*2),maxA=nice(Math.max(1,...data.map(d=>d.amount/U)));
  const cw=W-L-R,ch=H-T-B,slot=cw/data.length,gw=Math.min(36,slot*.8),bw=gw/2-1;
  const xc=i=>W-R-slot*(i+.5),ya=a=>T+ch-(a/U/maxA)*ch;
  const fmtU=v=>faId(String(Math.round(v*10)/10).replace(/\.0$/,""));
  let g=`<svg viewBox="0 0 ${W} ${H}" direction="ltr" class="u-ltr u-maxh250" role="img" aria-label="${ov.label||"نوبت وام در ۱۲ ماه آینده"}">`;
  g+=`<g font-size="10.5" fill="#64748b"><rect x="${W-R-96}" y="3" width="9" height="9" rx="2" fill="#2563eb"/><text x="${W-R-100}" y="11" text-anchor="end">تعداد افراد</text><rect x="${W-R-196}" y="3" width="9" height="9" rx="2" fill="#f59e0b"/><text x="${W-R-200}" y="11" text-anchor="end">جمع مبلغ وام (${unit})</text></g>`;
  for(let i=0;i<=2;i++){const y=T+ch-ch/2*i;g+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#eef2f7"/><text x="${L-4}" y="${y+3.5}" text-anchor="end" font-size="9.5" fill="#2563eb">${faId(maxC/2*i)}</text><text x="${W-R+5}" y="${y+3.5}" font-size="9.5" fill="#d97706">${fmtU(maxA/2*i)}</text>`}
  data.forEach((d,i)=>{
    const cx=xc(i),hc=(d.count/maxC)*ch,ha=(d.amount/U/maxA)*ch,xb=cx-gw/2,xa=cx+1;
    g+=`<g><title>${MONTHS[d.month-1]} ${faId(d.year)} — ${faId(d.count)} نفر — ${fa(d.amount)} ریال</title>`;
    g+=`<rect x="${xb}" y="${T+ch-hc}" width="${bw}" height="${Math.max(hc,d.count?2:0)}" rx="3" fill="#3b82f6"/><rect x="${xa}" y="${T+ch-ha}" width="${bw}" height="${Math.max(ha,d.amount?2:0)}" rx="3" fill="#f59e0b"/>`;
    if(d.count)g+=hc>=14?`<text x="${xb+bw/2}" y="${T+ch-4}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff">${faId(d.count)}</text>`:`<text x="${xb+bw/2}" y="${T+ch-hc-3}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#1e3a8a">${faId(d.count)}</text>`;
    if(d.amount)g+=`<text x="${xa+bw/2}" y="${T+ch-ha-3}" text-anchor="middle" font-size="9" font-weight="700" fill="#b45309">${fmtU(d.amount/U)}</text>`;
    g+=`<text x="${cx}" y="${H-13}" text-anchor="middle" font-size="9.5" fill="#64748b">${MONTHS[d.month-1]}</text>`;
    if(i===0||d.month===1)g+=`<text x="${cx}" y="${H-3}" text-anchor="middle" font-size="8" fill="#94a3b8">${faId(d.year)}</text>`;
    g+=`</g>`});
  return g+"</svg>";
}
async function lqOverview(){
  const year=toNum($("#lqYear").value),month=+$("#lqMonth").value;
  if(!year)return null;
  try{
    const ov=await api("GET",`/api/loan-queue/overview?year=${year}&month=${month}`);
    app.lqOv=ov;
    const tc=ov.months.reduce((s,m)=>s+m.count,0),ta=ov.months.reduce((s,m)=>s+m.amount,0);
    $("#lqChart").innerHTML=lqChartSVG(ov);
    $("#lqChartSum").innerHTML=`<div>افراد دارای نوبت در ۱۲ ماه<b>${faId(tc)} نفر</b></div><div class="big">جمع مبلغ وام‌ها (ریال)<b>${fa(ta)}</b></div><div>عقب‌افتاده<b>${faId(ov.overdue.count)} نفر — ${fa(ov.overdue.amount)}</b></div><div>نوبت‌های بعد از ۱۲ ماه<b>${faId(ov.later.count)} نفر</b></div>`;
    return ov;
  }catch(err){$("#lqChart").innerHTML=`<div class="chart-empty">${esc(err.message)}</div>`;return null}
}
const mLbl=m=>`${String(m).padStart(2,"0")}- ${MONTHS[m-1]}`;   // برچسب ماه در اکسل: «01- فروردین»
async function lqExport(){
  const ov=await lqOverview();if(!ov){showAlert("ابتدا سال را وارد کنید.");return}
  await ensureXLSX(8000);
  const wb=XLSX.utils.book_new();wb.Workbook={Views:[{RTL:true}]};
  const add=(name,H,rows)=>{const ws=XLSX.utils.aoa_to_sheet([H].concat(rows));ws["!cols"]=H.map(h=>({wch:Math.max(14,String(h).length+4)}));xlsMoney(ws,H);XLSX.utils.book_append_sheet(wb,ws,name)};
  const U=Math.max(0,...ov.months.map(m=>m.amount))>=1e9?1e9:1e6,UN=U===1e9?"میلیارد ریال":"میلیون ریال",r2=v=>Math.round(v/U*100)/100;
  const mm=ov.months.map(m=>[mLbl(m.month)+" "+m.year,m.count,m.amount,r2(m.amount)]);
  mm.unshift(["عقب‌افتاده",ov.overdue.count,ov.overdue.amount,r2(ov.overdue.amount)]);mm.push(["بعد از ۱۲ ماه",ov.later.count,ov.later.amount,r2(ov.later.amount)]);
  add("خلاصه ۱۲ ماه",["ماه سررسید","تعداد افراد","جمع مبلغ وام (ریال)",`جمع وام برای نمودار (${UN})`],mm);{const w=wb.Sheets["خلاصه ۱۲ ماه"];for(let r=1;r<=mm.length;r++){const c=w[XLSX.utils.encode_cell({r,c:3})];if(c)c.z="0.0#"}}   // ردیف ۲ = عقب‌افتاده، ردیف‌های ۳ تا ۱۴ = ۱۲ ماه
  add("نوبت‌های در انتظار",["ردیف","کد پرسنلی","نام و نام خانوادگی","وضعیت (شاغل/بازنشسته)","کد ملی","سرمایه","مبلغ وام","تعداد اقساط","مبلغ هر قسط","مبلغ قسط آخر","سال سررسید","ماه سررسید","نوع ثبت","تاریخ درخواست","توضیحات","وضعیت نوبت"],
    ov.items.map((x,i)=>{const pl=planOf(x.loanAmount,x.installmentAmount,x.installmentMonths);return[i+1,String(x.code),x.name,x.personStatus||"",String(x.nationalId||""),x.capital,x.loanAmount,pl.k,x.installmentAmount,pl.last,x.dueYear,mLbl(x.dueMonth),x.source==="manual"?"دستی":"خودکار",x.requestDate||"",x.notes||"",(()=>{const d=x.dueYear*12+x.dueMonth-(ov.year*12+ov.month);return d<0?"عقب افتاده":d>11?"بعد از ۱۲ ماه":""})()]}));
  const catsV=ov.months.map(m=>mLbl(m.month)+" "+m.year);
  await xlsxSaveCharts(wb,`loan-queue-${ov.year}-${String(ov.month).padStart(2,"0")}.xlsx`,[{sheet:1,sheetName:"خلاصه ۱۲ ماه",title:"نوبت وام در ۱۲ ماه آینده",anchor:[4,1,14,22],cats:{ref:"A3:A14",vals:catsV},axisTitles:[`تعداد افراد / مبلغ (${UN})`],
    series:[{nameRef:"B1",name:"تعداد افراد",ref:"B3:B14",vals:ov.months.map(m=>m.count),type:"bar",labels:true},{nameRef:"D1",name:`جمع مبلغ وام (${UN})`,ref:"D3:D14",vals:ov.months.map(m=>r2(m.amount)),type:"bar",labels:true,color:"F59E0B",labelFmt:"0.0"}]}]);
}
// گزارش افراد در نوبت و دریافت‌کنندگان وام (مبلغ محاسبه‌شده و مبلغ واریزی = مبلغ کل کد ۷۱۰ در اولین فیش پس از دریافت)
const lqYm=(y,m)=>y?faId(y)+"/"+faId(String(m).padStart(2,"0")):"";
async function lqListLoad(){
  const st=$("#lqListSt").value;
  const r=await api("GET","/api/loan-queue/list?status="+st);
  const ym=(y,m)=>(+y)&&(+m)?(+y)*12+(+m):0;
  const f=ym($("#lqFromY").value,$("#lqFromM").value),t=ym($("#lqToY").value,$("#lqToM").value),dt=$("#lqListDt").value;
  let items=r.items;
  if(f||t){
    const key=x=>dt==="req"?ym(x.registrationYear,x.registrationMonth):dt==="due"?ym(x.dueYear,x.dueMonth):(x.status==="received"?ym(x.instStartYear,x.instStartMonth):0);
    items=items.filter(x=>{const k=key(x);return k&&(!f||k>=f)&&(!t||k<=t)});
  }
  app.lqList=items;return items;
}
// وام‌های دریافت‌شده در ۱۲ ماه اخیر (تا ماه جاری)، بر اساس تاریخ دریافت (اولین دورهٔ ثبت کد وام)
async function lqPaidLoad(){
  const r=await api("GET","/api/loan-queue/list?status=received");
  const t=todayJalali().split("/").map(Number),end=t[0]*12+(t[1]-1),months=[];
  for(let i=11;i>=0;i--){const x=end-i;months.push({year:Math.floor(x/12),month:(x%12)+1,count:0,amount:0,calc:0,idx:x})}
  for(const it of r.items){
    if(it.status!=="received"||!it.instStartYear)continue;
    const m=months.find(z=>z.idx===it.instStartYear*12+(it.instStartMonth-1));if(!m)continue;
    m.count++;m.amount+=Number(it.instLoanPaid||it.loanAmount)||0;m.calc+=Number(it.loanAmount)||0;
  }
  app.lqPaid={months,label:"وام‌های پرداخت‌شده در ۱۲ ماه گذشته"};return app.lqPaid;
}
async function lqPaidShow(){
  const box=$("#lqPaidChart");if(!box)return;
  try{
    const p=await lqPaidLoad(),tc=p.months.reduce((s,m)=>s+m.count,0),ta=p.months.reduce((s,m)=>s+m.amount,0);
    box.innerHTML=lqChartSVG(p);
    $("#lqPaidSum").innerHTML=`<div>تعداد وام پرداخت‌شده<b>${faId(tc)} نفر</b></div><div class="big">جمع مبلغ پرداختی (ریال)<b>${fa(ta)}</b></div><div>میانگین هر وام<b>${tc?fa(Math.round(ta/tc)):"—"}</b></div>`;
  }catch(e){box.innerHTML=`<div class="chart-empty">${esc(e.message)}</div>`}
}
function lqListRows(items){
  return items.map((x,i)=>[i+1,String(x.code),x.name,x.personStatus||"",String(x.nationalId||""),x.status==="received"?"دریافت‌شده":"در نوبت",lqYm(x.registrationYear,x.registrationMonth),lqYm(x.dueYear,x.dueMonth),x.status==="received"&&x.instStartYear?lqYm(x.instStartYear,x.instStartMonth):"",x.capital,x.loanAmount,x.status==="received"?(x.instLoanPaid||""):"",x.installmentAmount,x.installmentMonths,x.status==="received"&&x.instEndYear?lqYm(x.instEndYear,x.instEndMonth):""]);
}
const LQ_LIST_H=["ردیف","کد پرسنلی","نام و نام خانوادگی","وضعیت فرد","کد ملی","وضعیت وام","تاریخ درخواست (پایان اقساط قبلی)","تاریخ نوبت","تاریخ دریافت وام","سرمایه","مبلغ وام محاسبه‌شده","مبلغ وام دریافتی","مبلغ قسط","تعداد اقساط","پایان اقساط"];
const LQ_MONEY_COLS=[9,10,11,12];
async function lqListShow(){
  try{
    const items=await lqListLoad();
    if(!items.length){$("#lqListBody").innerHTML='<div class="dashEmpty">موردی نیست.</div>';return}
    const rec=items.filter(x=>x.status==="received"),pen=items.length-rec.length;
    const sum=a=>a.reduce((t,x)=>t+(+x||0),0);
    $("#lqListBody").innerHTML=`<div class="hint u-mb8">${fa(pen)} نفر در نوبت — ${fa(rec.length)} نفر دریافت‌شده | جمع وام محاسبه‌شده: <b>${fa(sum(items.map(x=>x.loanAmount)))}</b> | جمع وام واریزی: <b>${fa(sum(rec.map(x=>x.instLoanPaid)))}</b></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr>${LQ_LIST_H.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>`+
      lqListRows(items).map(r=>`<tr>${r.map((v,j)=>`<td>${typeof v==="number"&&LQ_MONEY_COLS.includes(j)?fa(v):esc(String(v)===""?"—":String(v))}</td>`).join("")}</tr>`).join("")+`</tbody></table></div>`;
  }catch(err){showAlert("خطا در گرفتن گزارش: "+err.message)}
}
async function lqListExport(){
  try{
    const items=await lqListLoad();if(!items.length){showAlert("موردی برای گزارش نیست.");return}
    await ensureXLSX(8000);
    const wb=XLSX.utils.book_new();wb.Workbook={Views:[{RTL:true}]};
    const ws=XLSX.utils.aoa_to_sheet([LQ_LIST_H].concat(lqListRows(items)));ws["!cols"]=LQ_LIST_H.map(h=>({wch:Math.max(14,String(h).length+4)}));xlsMoney(ws,LQ_LIST_H);
    XLSX.utils.book_append_sheet(wb,ws,"گزارش وام");
    // برگهٔ «خلاصه وام‌های پرداختی» (۱۲ ماه گذشته) با نمودار
    const p=await lqPaidLoad(),n=p.months.length;
    const sumRows=p.months.map(m=>[mLbl(m.month)+" "+m.year,m.count,m.amount]);
    const tc=p.months.reduce((s,m)=>s+m.count,0),ta=p.months.reduce((s,m)=>s+m.amount,0);
    sumRows.push(["جمع",tc,ta]);sumRows.push(["میانگین هر وام","",tc?Math.round(ta/tc):0]);
    const SH=["ماه دریافت","تعداد وام پرداخت‌شده","جمع مبلغ پرداختی (ریال)"];
    const ws2=XLSX.utils.aoa_to_sheet([SH].concat(sumRows));ws2["!cols"]=[{wch:20},{wch:22},{wch:26}];xlsMoney(ws2,SH);
    XLSX.utils.book_append_sheet(wb,ws2,"خلاصه وام‌های پرداختی");wb.SheetNames.unshift(wb.SheetNames.pop());   // برگهٔ خلاصه اول
    const catsV=p.months.map(m=>MONTHS[m.month-1]+" "+m.year);
    await xlsxSaveCharts(wb,`loan-report-${$("#lqListSt").value}.xlsx`,[{sheet:1,sheetName:"خلاصه وام‌های پرداختی",title:"وام‌های پرداخت‌شده در یک سال گذشته",anchor:[4,1,14,22],cats:{ref:`A2:A${n+1}`,vals:catsV},axisTitles:["تعداد","مبلغ (ریال)"],
      series:[{nameRef:"B1",name:SH[1],ref:`B2:B${n+1}`,vals:p.months.map(m=>m.count),type:"bar",labels:true},{nameRef:"C1",name:SH[2],ref:`C2:C${n+1}`,vals:p.months.map(m=>m.amount),type:"line"}]}]);
  }catch(err){showAlert("خطا: "+err.message)}
}
function lqTab(k){
  document.querySelectorAll("[data-lqpane]").forEach(e=>e.hidden=e.dataset.lqpane!==k);document.querySelectorAll("[data-lqtab]").forEach(b=>b.className="btn"+(b.dataset.lqtab===k?" btn-blue":""));
  if(k==="b"){
    if(!app.lqBInit){   // پیش‌فرض: دریافت‌کنندگان ماه جاری
      app.lqBInit=true;const t=todayJalali().split("/").map(Number);
      $("#lqListSt").value="received";$("#lqListDt").value="recv";$("#lqFromY").value=$("#lqToY").value=t[0];$("#lqFromM").value=$("#lqToM").value=t[1];
    }
    lqPaidShow();if(!$("#lqListBody").innerHTML.trim()||k==="b")lqListShow();
  }
}
// ===== انتقال نوبت‌های وام: خروجی و ورودی اکسل =====
const LQX_COLS=[["code","کد پرسنلی"],["nationalId","کد ملی"],["name","نام و نام خانوادگی"],["registrationYear","سال ثبت نوبت"],["registrationMonth","ماه ثبت نوبت"],["dueYear","سال نوبت"],["dueMonth","ماه نوبت"],["capital","سرمایه"],["loanAmount","مبلغ وام"],["installmentMonths","تعداد اقساط"],["installmentAmount","مبلغ قسط"],["status","وضعیت (pending/received/cancelled)"],["receivedAt","تاریخ دریافت (ISO)"],["loanNumber","شمارهٔ وام"],["requestDate","تاریخ درخواست"],["notes","توضیحات"],["source","منبع (auto/manual)"],["instStartYear","سال شروع اقساط"],["instStartMonth","ماه شروع اقساط"],["instEndYear","سال پایان اقساط"],["instEndMonth","ماه پایان اقساط"],["instCurrentAmount","قسط جاری"],["instSeenYm","آخرین دورهٔ دیده‌شده"],["instLoanPaid","مبلغ وام دریافتی"],["gCode","کد ضامن"],["gName","نام ضامن"],["gNationalId","کد ملی ضامن"],["gBirthDate","تاریخ تولد ضامن"],["gMobile","موبایل ضامن"],["gWorkplace","محل خدمت ضامن"]];
const LQX_NUM=new Set(["registrationYear","registrationMonth","dueYear","dueMonth","capital","loanAmount","installmentMonths","installmentAmount","instStartYear","instStartMonth","instEndYear","instEndMonth","instCurrentAmount","instSeenYm","instLoanPaid"]);
app.lqx={items:null};
$("#btnLqxExport").addEventListener("click",async()=>{
  try{
    const r=await api("GET","/api/loan-queue/export?status="+enc($("#lqxSt").value));
    if(!r.items.length){showAlert("نوبتی برای خروجی نیست.");return}
    const rows=r.items.map(x=>LQX_COLS.map(([k])=>{const v=x[k];return LQX_NUM.has(k)?(v==null?"":Number(v)):(v==null?"":String(v))}));
    await xlsxExport(`loan-queue-${todayJalali().replace(/\//g,"-")}.xlsx`,"نوبت‌های وام",LQX_COLS.map(c=>c[1]),rows,LQX_COLS.map(c=>c[0]==="name"||c[0]==="notes"?24:16));
    $("#lqxExpMsg").textContent=`${fa(r.items.length)} نوبت در فایل ذخیره شد.`;
  }catch(e){showAlert(e.message)}
});
$("#lqxFile").addEventListener("change",async e=>{
  const f=e.target.files[0];app.lqx.items=null;$("#lqxImpMsg").innerHTML="";if(!f)return;
  try{
    const rows=await readWorkbookRows(f);
    if(rows.length<2)throw new Error("فایل خالی است.");
    const hdr=rows[0].map(h=>String(h).trim());
    const byLabel=new Map(LQX_COLS.map(([k,l])=>[l,k]));LQX_COLS.forEach(([k])=>byLabel.set(k,k));
    const keys=hdr.map(h=>byLabel.get(h)||null);
    if(!keys.includes("code")||!keys.includes("registrationYear")||!keys.includes("dueYear"))throw new Error("این فایل، خروجی «انتقال نوبت‌ها» نیست (ستون‌های کد پرسنلی و سال ثبت/نوبت پیدا نشد).");
    app.lqx.items=rows.slice(1).filter(r=>r.some(c=>String(c).trim()!=="")).map(r=>{const o={};keys.forEach((k,i)=>{if(k)o[k]=r[i]});return o});
    $("#lqxImpMsg").innerHTML=`<div class="hint">${faId(app.lqx.items.length)} ردیف خوانده شد. «بررسی» را بزنید.</div>`;
  }catch(err){showAlert(err.message)}
});
function lqxShow(r){
  const sk=r.skipped||[];
  $("#lqxImpMsg").innerHTML=`<div class="wk-sum u-mt10"><div>${r.dryRun?"نتیجهٔ بررسی (چیزی ثبت نشد)":"نتیجهٔ ورود"}</div><div>اضافه‌شده<b>${fa(r.added)}</b></div><div>به‌روزشده<b>${fa(r.updated)}</b></div><div>بدون تغییر<b>${fa(r.unchanged)}</b></div><div>ردشده<b>${fa(sk.length)}</b></div>${r.deleted?`<div>حذف‌شده (جایگزینی)<b>${fa(r.deleted)}</b></div>`:""}</div>`+
    (sk.length?`<div class="tbl-wrap u-mt10"><table class="tbl"><thead><tr><th>ردیف فایل</th><th>کد پرسنلی</th><th>دلیل رد شدن</th></tr></thead><tbody>${sk.slice(0,300).map(x=>`<tr><td>${faId(x.row+1)}</td><td>${faId(esc(x.code))}</td><td>${esc(x.reason)}</td></tr>`).join("")}</tbody></table></div>${sk.length>300?`<div class="hint">فقط ۳۰۰ مورد اول نمایش داده شد.</div>`:""}`:"");
}
async function lqxSend(dry){
  if(!app.lqx.items||!app.lqx.items.length){showAlert("ابتدا فایل اکسل را انتخاب کنید.");return}
  const r=await api("POST","/api/loan-queue/import",{mode:$("#lqxMode").value,dryRun:dry,items:app.lqx.items});
  lqxShow(r);return r;
}
$("#btnLqxCheck").addEventListener("click",()=>lqxSend(true).catch(e=>showAlert(e.message)));
$("#btnLqxRun").addEventListener("click",()=>{
  if(!app.lqx.items||!app.lqx.items.length){showAlert("ابتدا فایل اکسل را انتخاب کنید.");return}
  const m=$("#lqxMode").value;
  showConfirm(m==="replace"?"همهٔ نوبت‌های فعلی این سیستم حذف و با نوبت‌های فایل جایگزین می‌شود. ادامه می‌دهید؟ (پیش از این، پشتیبان بگیرید.)":"نوبت‌های فایل در این سیستم ثبت شود؟",async()=>{
    try{const r=await lqxSend(false);if(r&&typeof loadLqReport==="function")loadLqReport()}catch(e){showAlert(e.message)}
  });
});
