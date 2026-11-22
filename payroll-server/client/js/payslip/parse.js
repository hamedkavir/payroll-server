"use strict";
/* payslip/parse.js — شناسایی ستون‌ها و محاسبهٔ فایل‌های حقوق شاغلین، بازنشستگان، کارگزینی و کسر اقساط
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("payslip/parse");
/* ---------- شناسایی ستون‌های فایل حقوق کارکنان شاغل (وارداتی از نسخهٔ آفلاین) ---------- */
const META={
  code:["کدپرسنلی","کدپرسنل","شمارهپرسنلی","پرسنلی"],
  first:["نام"],last:["نامخانوادگی"],
  full:["نامونامخانوادگی","نامکارمند","نامپرسنل"],
  nid:["کدملی","شمارهملی"],
  empType:["نوعاستخدام","وضعیتاستخدام"],
  dept:["واحدسازمانی","واحد","محلخدمت"],
  center:["مرکزهزینه"],
  region:["منطقهخدمت"],regionCode:["کدمنطقهخدمت"],
  days:["کارکردعادی","کارکرد","روزهایکارکرد"],
  job:["سمت","عنوانشغلی","پست"],
  bank:["شمارهحساب","شبا","حساببانکی"],shaba:["شمارهشبا","شبا"],
  tGross:["جمعمزایا","جمعحقوقومزایا","جمعناخالص"],
  tDed:["جمعکسور","جمعکسورات"],
  tEmployer:["مجموعتعهداتکارفرما","جمعسهمکارفرما","تعهداتکارفرما"],
  tNet:["خالصپرداختی","خالصپرداخت","قابلپرداخت"]
};
const DED_WORDS=/مالیات|بیمه|صندوق|کسر|کسور|وام|مساعده|قسط|جریمه|بدهی|مقرری/;
function splitCode(h){
  const m=String(h).trim().match(/^(.*?)[\-ـ](\d{1,4})$/);
  return m?{label:m[1].trim(),code:m[2]}:{label:String(h).trim(),code:""};
}
function analyze(headers){
  const meta={},earn=[],ded=[],empl=[],ignored=[];
  const used=new Set();
  headers.forEach((h,i)=>{
    const raw=txt(h);if(!raw)return;
    const n=norm(raw);
    let metaKey=null;
    for(const k in META){if(META[k].includes(n)&&!(k in meta)){metaKey=k;break}}
    if(metaKey){meta[metaKey]=i;used.add(i);return}
    if(n==="treasurycode"){ignored.push(raw);return}
    const {label,code}=splitCode(raw);
    const item={i,label,code,raw};
    if(/سهمکارفرما|سهمدولت|سهمدستگاه/.test(n)){empl.push(item);return}
    if(code!==""){(+code>=900?ded:earn).push(item);return}
    if(DED_WORDS.test(n))ded.push(item);
    else ignored.push(raw);
  });
  return{meta,earn,ded,empl,ignored};
}
function headerRowIndex(rows){
  for(let i=0;i<Math.min(rows.length,20);i++){
    const cells=(rows[i]||[]).map(txt).filter(Boolean);
    if(cells.length<4)continue;
    const a=analyze(rows[i]);
    if(Object.keys(a.meta).length+a.earn.length+a.ded.length>=4)return i;
  }
  return -1;
}

/* ---------- محاسبهٔ پایهٔ کارمند شاغل (بدون ادغام اقساط؛ در نمایش انجام می‌شود) ---------- */
function computeActiveBase(r,cols){
  const c=cols,m=c.meta,g=i=>i===undefined?null:r[i];
  const mapItems=list=>list.map(x=>({label:x.label,code:x.code,v:toNum(r[x.i])}));
  let earn=mapItems(c.earn),dedBase=mapItems(c.ded),empl=mapItems(c.empl);
  const sum=a=>a.reduce((s,x)=>s+x.v,0);
  let gross=sum(earn),dedBaseSum=sum(dedBase),emp_=sum(empl);
  const fG=m.tGross!==undefined?toNum(r[m.tGross]):null;
  const fD=m.tDed!==undefined?toNum(r[m.tDed]):null;
  const fE=m.tEmployer!==undefined?toNum(r[m.tEmployer]):null;
  const fN=m.tNet!==undefined?toNum(r[m.tNet]):null;
  if(fG!==null&&Math.round(fG-gross)!==0){earn.push({label:"سایر مزایا",code:"",v:fG-gross});gross=fG}
  if(fE!==null&&Math.round(fE-emp_)!==0){empl.push({label:"سایر",code:"",v:fE-emp_});emp_=fE}
  const code=txt(g(m.code));
  const dedDiff=fD!==null?(fD-dedBaseSum):0;
  const name=m.full!==undefined?txt(g(m.full)):[txt(g(m.first)),txt(g(m.last))].filter(Boolean).join(" ");
  return{kind:"active",name,gross,emp_,earn,empl,dedBase,dedBaseSum,dedDiff,fN,
    info:{code,nid:txt(g(m.nid)),empType:txt(g(m.empType)),job:txt(g(m.job)),
      dept:txt(g(m.dept)),center:txt(g(m.center)),region:txt(g(m.region)),
      days:m.days!==undefined?toNum(r[m.days]):null,bank:txt(g(m.bank)),shaba:txt(g(m.shaba))}};
}
// ادغام اقساط و اعمال «نمایش اقلام صفر» در لحظهٔ نمایش (نه هنگام وارد کردن فایل)،
// تا با تغییر فایل اقساط یا این تنظیم، نیازی به واردکردن دوبارهٔ فایل کارکنان نباشد
function finalizeActive(base,loansForCode,showZero){
  const filt=a=>a.filter(x=>showZero||Math.round(x.v)!==0);
  let ded=filt(base.dedBase).map(x=>Object.assign({},x));
  let ded_=base.dedBaseSum;
  if(base.dedDiff&&Math.round(base.dedDiff)!==0){
    const diff=base.dedDiff,loans=loansForCode||[];
    if(loans.length){
      let loanSum=0;
      loans.forEach(l=>{loanSum+=l.v;if(showZero||Math.round(l.v)!==0)ded.push({label:l.label,code:l.code,ref:l.seq,v:l.v,remaining:l.remaining,principal:l.principal})});
      const leftover=diff-loanSum;
      if(Math.round(leftover)!==0)ded.push({label:"سایر کسور",code:"",v:leftover});
    }else{
      ded.push({label:"سایر کسور",code:"",v:diff});
    }
    ded_=base.dedBaseSum+diff;
  }
  const net=base.fN!=null?base.fN:base.gross-ded_;
  return{kind:"active",name:base.name,info:base.info,
    earn:filt(base.earn),ded,empl:filt(base.empl),
    gross:base.gross,ded_,emp_:base.emp_,net};
}

/* ردیف ورثه: عدد بزرگ‌تر از صفر = وارث (در پرسنل با وضعیت «وظیفه بگیر» ثبت می‌شود) */
function heirNum(v){const n=Number(String(v==null?"":v).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[^\d.]/g,""));return Number.isFinite(n)?n:0}
/* ---------- شناسایی و محاسبهٔ فایل بازنشستگان (فرمت ردیفی) ---------- */
const RET_META={
  code:["پرسنلی","کدپرسنلی","کدپرسنل"],
  nid:["کدملی","شمارهملی"],
  first:["نام"],last:["نامخانوادگی"],
  account:["شمارهحساب"],shaba:["شمارهشبا"],
  region:["منطقه"],ledger:["دفترکل"],heir:["ردیفورثه"],
  itemCode:["کدکسروپرداخت","کدکسر","کدپرداخت"],
  itemTitle:["عنوانکسر","عنوانپرداخت","شرح"],
  fundRow:["ردیفصندوق"],series:["سری"],
  loanAmt:["مبلغوام"],installment:["مبلغقسط"],remaining:["مبلغمانده"],
  year:["سال"],month:["ماه"]
};
function analyzeRetiree(headers){
  const meta={};
  headers.forEach((h,i)=>{
    const raw=txt(h);if(!raw)return;
    const n=norm(raw);
    for(const k in RET_META){if(RET_META[k].includes(n)&&!(k in meta)){meta[k]=i;break}}
  });
  return meta;
}
function retireeHeaderRowIndex(rows){
  for(let i=0;i<Math.min(rows.length,20);i++){
    const meta=analyzeRetiree(rows[i]||[]);
    if(meta.code!==undefined&&meta.installment!==undefined&&meta.itemTitle!==undefined)return i;
  }
  return -1;
}
// نکته: برخلاف کارمندان شاغل، برای بازنشستگان همان دادهٔ خام گروه‌بندی‌شده ذخیره می‌شود
// و محاسبهٔ نهایی هر بار در لحظهٔ نمایش انجام می‌شود (چون این‌جا نیازی به ادغام با فایل جدا نیست)
function computeRetireeRecord(g,showZero){
  const earn=[],ded=[];
  let gross=0,ded_=0;
  (g.items||[]).forEach(it=>{
    if(Math.round(it.v)===0&&!showZero)return;
    if(it.v>=0){gross+=it.v;earn.push({label:it.label,code:it.code,v:it.v})}
    else{
      const amt=-it.v;ded_+=amt;
      const hasLoan=Math.round(it.loanAmt)!==0||Math.round(it.remaining)!==0;
      ded.push({label:it.label,code:it.code,ref:it.series,v:amt,remaining:hasLoan?it.remaining:null,principal:hasLoan?it.loanAmt:null});
    }
  });
  const net=gross-ded_;
  return{kind:"retiree",earn,ded,empl:[],gross,ded_,emp_:0,net,name:g.name,
    info:{code:g.dispCode||g.code,nid:g.nid,heir:heirNum(g.heir),empType:heirNum(g.heir)>0?"وارث بازنشسته":"بازنشسته",
      job:"",dept:"",center:"",region:g.region?("منطقهٔ "+g.region):"",ledger:g.ledger||"",days:null,bank:g.account||g.shaba,shaba:g.shaba||"",bankName:g.bankName||""}};
}

/* ---------- شناسایی ستون‌های فایل کارگزینی پرسنل ---------- */
const PERSONNEL_META={
  code:["شمارهپرسنلی","کدپرسنلی","پرسنلی"],
  firstName:["نام"],lastName:["نامخانوادگی"],
  nationalId:["کدملی","شمارهملی"],
  ledger:["دفترکل"],
  fatherName:["نامپدر"],
  idNumber:["شمارهشناسنامه"],
  birthDate:["تاریختولد"],
  birthPlace:["محلتولد"],
  mobile:["شمارهموبایل","موبایل","تلفنهمراه"],
  insuranceType:["نوعبیمه","بیمه"],
  insuranceCode:["کدبیمه"],
  employmentType:["نوعاستخدام"],
  education:["مدرکتحصیلی"],
  fieldOfStudy:["رشتهتحصیلی"],
  gender:["جنسیت"],
  veteranType:["نوعایثارگری","ایثارگری"],
  jobTitle:["پستاصلی","پست","سمت"],
  jobRole:["شغل"],
  jobRank:["رتبهشغلی"],
  jobGroup:["گروهکاری"],
  workplace:["محلخدمت","واحدسازمانی"],
  workplaceCode:["کدمحلخدمت","کدواحدسازمانی"],
  govtServiceYears:["سابقهسالدولتی","سابقهدولتی","سابقه"],
  maritalStatus:["وضعیتتاهل"],
  currentStatus:["وضعیتجاری"],
  coveredChildren:["اولادمشمول"],
  bankName:["نامبانک"],
  bankAccount:["شمارهحساب"],
  shaba:["شمارهشبا","شبا"],
  advanceAccount:["حسابمساعده","شمارهحسابمساعده"],
  advanceOwner:["نامصاحبحسابمساعده","صاحبحسابمساعده"],
  status:["وضعیت","وضعیتشغلی"]
};
function analyzePersonnel(headers){
  const meta={};
  headers.forEach((h,i)=>{
    const raw=txt(h);if(!raw)return;
    const n=norm(raw);
    for(const k in PERSONNEL_META){if(PERSONNEL_META[k].includes(n)&&!(k in meta)){meta[k]=i;break}}
  });
  return meta;
}
function personnelHeaderRowIndex(rows){
  for(let i=0;i<Math.min(rows.length,20);i++){
    const meta=analyzePersonnel(rows[i]||[]);
    if(meta.code!==undefined&&(meta.firstName!==undefined||meta.lastName!==undefined))return i;
  }
  return -1;
}

/* ---------- شناسایی فایل گزارش کسر اقساط ---------- */
const LOAN_META={
  code:["کدپرسنلی","کدپرسنل","شمارهپرسنلی","پرسنلی"],
  title:["عنوانوام","عنوانکسر","شرحوام","نامکسر","عنوانتسهیلات","عنواندریافتی","نامقسط"],
  lcode:["کدوام","کدکسر","کدتسهیلات"],
  seq:["ردیفوام","ردیفقسط","شمارهقسط","ردیفتسهیلات"],
  installment:["مبلغهرقسط","مبلغقسط","قسط","مبلغکسر","مبلغهرماه","مبلغکسرشده"],
  remaining:["باقیماندهوام","ماندهوام","باقیمانده","مانده"],
  principal:["اصلوام","مبلغکل","مبلغاصلی","مبلغوام"]
};
function analyzeLoan(headers){
  const meta={};
  headers.forEach((h,i)=>{
    const raw=txt(h);if(!raw)return;
    const n=norm(raw);
    for(const k in LOAN_META){if(LOAN_META[k].includes(n)&&!(k in meta)){meta[k]=i;break}}
  });
  return meta;
}
function loanHeaderRowIndex(rows){
  for(let i=0;i<Math.min(rows.length,20);i++){
    const meta=analyzeLoan(rows[i]||[]);
    if(meta.code!==undefined&&meta.installment!==undefined)return i;
  }
  return -1;
}

