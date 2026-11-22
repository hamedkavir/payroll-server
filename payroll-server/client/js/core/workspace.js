"use strict";
/* core/workspace.js — صفحه‌های ثبت (wk) و CSS صفحهٔ چاپ فیش
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("core/workspace");
/* ---------- مسیریابی بین صفحه‌ها ---------- */
app.page="dashboard";
/* =====================================================================
   وام (ثبت و چاپ فرم)، مساعده، درخواست کالا، انبارداری + میانبرهای F2/F6/F7/F8
   ===================================================================== */
const WK_PAGES=["loanform","vefagh","advance","goods","services","emdad","mehr","cheque","changes","life","insurance"];
app.wk={code:"",person:null,loan:null,adv:null,cart:[],products:[]};
app.fs={};
// چاپ: فرم‌ها (مساعده/وام/نوبت/کالا) روی A5 عمودی طراحی شده‌اند؛ فیش حقوقی روی A5 افقی و اگر بلندتر از A5 شد روی A4 عمودی
// حاشیه‌های چاپ فرم‌ها از «تنظیمات ← تنظیمات فرم‌ها» (راست پیش‌فرض ۱۴ و چپ ۸ میلی‌متر؛ برای چاپگرهایی که لبهٔ راست را می‌برند بیشتر کنید)
const formMargins=()=>{const f=FS(),g=(v,d)=>{const n=parseFloat(lat(String(v==null?"":v)));return Number.isFinite(n)?Math.min(40,Math.max(3,n)):d};return{r:g(f.formMarginRight,14),l:g(f.formMarginLeft,8)}};
const formPageCss=()=>{const m=formMargins();return `@page{size:A5 portrait;margin:7mm ${m.r}mm 7mm ${m.l}mm}`};
const SLIP_PAGE_CSS=`@page a5l{size:A5 landscape;margin:5mm}@page a4p{size:A4 portrait;margin:8mm}
.sheet{box-sizing:border-box;max-width:none!important;border:0!important;box-shadow:none!important;border-radius:0!important;padding:0!important;background:#fff!important;margin:12px auto}
.sheet.pg-a5l{page:a5l;width:200mm}.sheet.pg-a4p{page:a4p;width:194mm}
.sheet-wrap{overflow:visible!important}
@media print{html,body{overflow:visible!important;height:auto!important}.sheet-wrap,#preview{overflow:visible!important;max-width:none!important;width:auto!important}*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}.sheet{zoom:1!important}}
@media screen{.sheet{outline:1px solid #cbd5e1}}
@media print{.sheet{break-after:page;margin:0 auto}.sheet:last-of-type{break-after:auto}}`;
// هر فیش را اندازه می‌گیرد: اگر در ارتفاع A5 افقی (۲۰۰×۱۳۸ میلی‌متر) جا شد A5، وگرنه A4 عمودی
const SLIP_FIT_JS=`(function(){function fit(){var lim=138*96/25.4-2,all=document.querySelectorAll('.sheet'),i,s,pend=[],cls=['d1','d2'],k,nx;
/* همهٔ فیش‌ها یک‌جا تنظیم و سپس یک‌جا اندازه‌گیری می‌شوند (نه یکی‌یکی)؛ برای ده‌ها هزار فیش از چند ساعت به چند ثانیه می‌رسد. نتیجه با روش قبلی یکی است */
for(i=0;i<all.length;i++){s=all[i];s.classList.remove('pg-a4p','d1','d2');s.classList.add('pg-a5l')}
for(i=0;i<all.length;i++)if(all[i].getBoundingClientRect().height>lim)pend.push(all[i]);
for(k=0;k<2&&pend.length;k++){for(i=0;i<pend.length;i++)pend[i].classList.add(cls[k]);nx=[];for(i=0;i<pend.length;i++)if(pend[i].getBoundingClientRect().height>lim)nx.push(pend[i]);pend=nx}
for(i=0;i<pend.length;i++){s=pend[i];s.classList.remove('pg-a5l','d1','d2');s.classList.add('pg-a4p')}}
window.fitSlips=fit;window.addEventListener('load',function(){(document.fonts?Promise.race([Promise.all([document.fonts.load("400 14px Vazirmatn"),document.fonts.load("600 14px Vazirmatn"),document.fonts.load("700 14px Vazirmatn"),document.fonts.load("800 14px Vazirmatn")]),new Promise(function(r){setTimeout(r,2500)})]).then(function(){return document.fonts.ready},function(){}):Promise.resolve()).then(fit)});window.addEventListener('beforeprint',fit)})();`;
const enc=encodeURIComponent;
const FS=()=>Object.assign({orgName:"اداره آموزش و پرورش ناحیه یک قزوین",fundName:"صندوق وام تعاون و امور رفاهی",managerName:"",managerTitle:"مدیر آموزش و پرورش ناحیه یک قزوین",operatorName:"",advanceFeePercent:1,advancePayDay:15,advanceDefaultAmount:50000000,advanceDefaultInstallments:2,emdadDefaultAmount:1000000000,lifeNumberStart:4571,emdadFeePercent:1,emdadDefaultInstallments:20,goodsDefaultInstallments:6,loanWaitMonths:12,loanFundShare:6000000,loanMax:0,roundLoan:1e7,roundLoanInst:1e6,roundAdvance:1e6,roundAdvInst:1e6,roundGoods:1e6,roundGoodsInst:1e6,serviceLetterStart:1,slipShowCodes:1,slipMetaLine:1,formMarginRight:14,formMarginLeft:8,formTexts:{}},app.fs||{});
// گام‌های گرد کردن (تنظیمات ← گرد کردن مبالغ)؛ ۱ = بدون رند
const RS=()=>{const f=FS(),g=(k,d)=>{const v=Math.round(+f[k]);return Number.isFinite(v)&&v>=1?v:d};return{loan:g("roundLoan",1e7),loanInst:g("roundLoanInst",1e6),advance:g("roundAdvance",1e6),advInst:g("roundAdvInst",1e6),goods:g("roundGoods",1e6),goodsInst:g("roundGoodsInst",1e6)}};
const mnum=n=>Math.round(n||0).toLocaleString("en-US");          // نمایش مبلغ در فیلد ورودی
const pname=p=>((p.firstName||"")+" "+(p.lastName||"")).trim();
const rnd=(x,s)=>Math.round(x/s)*s;
// رند به بالا تا مضرب step (ابتدا به ریال صحیح گرد می‌شود تا خطای اعشاری باعث یک پله اضافه نشود)
const ceilStep=(x,step)=>step>1?Math.ceil(Math.round(x||0)/step)*step:Math.round(x||0);
// برنامهٔ اقساط (هم‌ساز با سرور): قسط عادی رند‌به‌بالا تا میلیون ریال + «قسط آخر» = مابه‌التفاوت
function planInst(rem,n,step=1e6){
  rem=Math.max(0,Math.round(rem||0));n=Math.max(1,parseInt(n,10)||1);
  if(rem===0||n===1)return{inst:rem,last:rem,n:1};
  const inst=Math.max(step>1?step:1,ceilStep(rem/n,step));
  const k=Math.min(n,Math.ceil(rem/inst));
  return{inst,last:rem-inst*(k-1),n:k};
}
// قسط هر کالا جداگانه (هم‌ساز با سرور): جمع کل رند‌شده و پیش‌پرداخت به نسبت مبلغ هر ردیف تقسیم می‌شود
function planLinesC(cart,total,down,step){
  const raws=cart.map(c=>c.qty*c.unitPrice),sumRaw=raws.reduce((a,b)=>a+b,0)||1;let uT=0,uD=0;
  const rows=cart.map((c,i)=>{const last=i===cart.length-1;
    const share=last?total-uT:Math.round(total*raws[i]/sumRaw),dn=last?down-uD:Math.round(down*raws[i]/sumRaw);uT+=share;uD+=dn;
    return {share,down:dn,pl:planInst(Math.max(0,share-dn),c.n||1,step)}});
  const nMax=Math.max(1,...rows.map(r=>r.pl.n));
  return {rows,n:nMax,inst:rows.reduce((a,r)=>a+r.pl.inst,0),last:rows.filter(r=>r.pl.n===nMax).reduce((a,r)=>a+r.pl.last,0)};
}
// قسط آخر برای بدهی با قسط ثابت (اگر قسط‌های رند‌به‌بالا زودتر بدهی را تمام کنند، تعداد مؤثر اقساط کمتر است)
const lastOfInst=(total,inst,n)=>{total=Math.round(total||0);n=Math.max(1,n||1);if(!(inst>0))return Math.max(0,total);const k=Math.min(n,Math.ceil(total/inst));return Math.max(0,total-inst*(k-1))};
// «۶ × ۱۷٬۰۰۰٬۰۰۰ (قسط آخر: ۱۵٬۰۰۰٬۰۰۰)»
// تعداد اقساط مؤثر و قسط آخر (اگر قسط‌های رند‌به‌بالا زودتر بدهی را تمام کنند، تعداد اقساط کمتر می‌شود)
const planOf=(total,inst,n)=>{n=Math.max(1,parseInt(n,10)||1);const k=inst>0?Math.max(1,Math.min(n,Math.ceil(Math.round(total)/inst))):n;return{k,last:lastOfInst(total,inst,n)}};
const instTxt=(n,inst,last)=>`${faId(n)} × ${fa(inst)}`+(n>1&&last&&Math.round(last)!==Math.round(inst)?` <small class="hint">(قسط آخر: ${fa(last)})</small>`:"");
// قسط یک درخواست کالا: اگر همهٔ کالاها تعداد اقساط یکسان دارند مثل قبل؛ وگرنه جمع ماه اول و تعداد ماه‌ها
const instOrd=o=>{const its=(o.items||[]).filter(i=>i.installments!=null);
  if(!o.perItemInstallments||new Set(its.map(i=>i.installments)).size<=1)return instTxt(o.installments,o.installmentAmount,o.lastInstallmentAmount);
  return `${fa(o.installmentAmount)} <small class="hint">(ماه اول؛ تا ${faId(o.installments)} ماه، قسط آخر: ${fa(o.lastInstallmentAmount)})</small>`};
const itemInstTxt=i=>i.installments!=null?` — ${faId(i.installments)} × ${fa(i.installmentAmount)}`+(i.installments>1&&i.lastInstallmentAmount!=null&&Math.round(i.lastInstallmentAmount)!==Math.round(i.installmentAmount)?` (آخر: ${fa(i.lastInstallmentAmount)})`:""):"";
const addMonth=(y,m)=>m===12?[y+1,1]:[y,m+1];
// «فردِ فعلی» = آخرین فردی که کاربر در هر صفحه‌ای (پرسنل، جست‌وجوی صفحه‌های خدمات، فیش) انتخاب کرده است
const curCode=()=>app.pickCode||app.wk.code||app.pfCode;
const ST_LOAN={pending:["در انتظار نوبت","b-amber"],received:["دریافت کرده","b-green"],cancelled:["انصراف","b-red"]};
const ST_ADV={pending:["در انتظار پرداخت","b-amber"],paid:["پرداخت شده","b-green"],cancelled:["لغو شده","b-red"]};
const ST_ORD={active:["فعال","b-green"],cancelled:["لغو شده","b-red"]};
const stB=(m,s)=>{const x=m[s]||[s,"b-blue"];return `<span class="badge ${x[1]}">${x[0]}</span>`};
// فرمول سیستم (همان server/loanQueueSync.js): وام = (سرمایه + ۷۲٬۰۰۰٬۰۰۰) × ۳ رند به ۱۰ میلیون؛ قسط = وام ÷ ماه رند به ۱ میلیون
// وام = (سرمایهٔ اولیه + مدت انتظار × سهم صندوق) × ۳ ← رند به بالا تا ۷ رقم ← حداکثر وام (۰ = بدون سقف)
// افزودن ماه به (سال، ماه) شمسی؛ ماه ۱ تا ۱۲
function addMonthsJ(y,m,n){const t=y*12+(m-1)+Math.max(0,Math.round(+n||0));return{year:Math.floor(t/12),month:t%12+1}}
// ماه نوبت = ماه تاریخ درخواست + مدت انتظار
function dueFromRequest(reqDate){
  const t=String(reqDate||"").split("/").map(Number),y=t[0]>1300?t[0]:curY(),m=(t[1]>=1&&t[1]<=12)?t[1]:curM()+1;
  return addMonthsJ(y,m,FS().loanWaitMonths);
}
function calcLoan(cap,months){
  const f=FS(),raw=((+cap||0)+(+f.loanWaitMonths||0)*(+f.loanFundShare||0))*3,mx=+f.loanMax||0;
  const r=RS();let loan=ceilStep(raw,r.loan);if(mx>0&&loan>mx)loan=mx;
  return{loan,inst:ceilStep(loan/(months||36),r.loanInst)};
}

