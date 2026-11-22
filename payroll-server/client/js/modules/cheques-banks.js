"use strict";
/* modules/cheques-banks.js — دسته چک، بانک و شعبه، امضای مدیر
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("modules/cheques-banks");
/* =============================== صدور دسته چک، تعریف بانک و امضای مدیر =============================== */
app.sigImg="";app.banks=null;app.wk.cqall={from:"",to:"",bank:"",q:"",items:[],page:1,size:50};
async function loadSigImg(){try{const r=await api("GET","/api/assets/signature");app.sigImg=r.dataUrl||""}catch(e){}}
async function cqBanks(force){if(force||!app.banks){try{app.banks=(await api("GET","/api/banks")).items}catch(e){app.banks=app.banks||[]}}return app.banks}
// نامهٔ معرفی برای دریافت دسته چک (A4)؛ متن‌ها از «قالب متن فرم‌ها»، چیدمان از «چیدمان آزاد» و امضای مدیر از «تنظیمات ← فرم‌های چاپی» قابل ویرایش است
function docCheque(p,R){ app.docCtx=p;setDocData(p,R,"cheque");
  const F="cheque",pt=/زن|خانم|female/i.test(String(p.gender||""))?"خانم":"آقای";
  const V={serial:faId(esc(R.serial)),date:faId(esc(R.reqDate)),bank:esc(R.bankName||""),branch:esc(R.branchName||""),branchCode:faId(esc(R.branchCode||"")),pt,name:esc(pname(p)),account:`<span dir="ltr">${faId(esc(R.account||""))}</span>`};
  const fs="font-size:14.5px;line-height:2.3";
  return `<div class="doc letter" style="${fs}"><div class="d-head"><div class="d-r"><b>${esc(FS().orgName)}</b><span>${esc(FS().fundName)}</span></div><div class="d-c"><img src="${LOGO_SRC}" alt=""><div>${ftx(F,"bismillah","بسمه تعالی")}</div></div><div class="d-l"><div>شماره: <b>${ftx(F,"no","۷۷ / {serial} / ۴۶۲۸",V)}</b></div><div>تاریخ: <b>${faId(esc(R.reqDate||todayJalali()))}</b></div></div></div>
    <div class="d-card" style="margin-top:22px;padding:10px 18px;border-radius:14px;border:1.5px solid #1e5a7a;background:#f8fbfd">
      <div style="font-weight:700">${ftx(F,"title","عنوان : {bank} شعبه {branch} کد{branchCode}",V)}</div>
      <div style="font-weight:700">${ftx(F,"subject","موضوع: معرفی {pt} {name} برای دریافت دسته چک",V)}</div></div>
    <p style="margin:20px 0 0;font-weight:700">${ftx(F,"hello","با سلام و احترام")}</p>
    <p style="margin:8px 0 0;text-align:justify;line-height:2.5;font-weight:500;padding-inline-start:14px">${ftx(F,"body","بدین‌وسیله {pt} {name} دارنده حساب جاری به شماره {account} نزد آن شعبه جهت دریافت دسته چک معرفی می‌گردد. خواهشمند است دستور فرمایید اقدام لازم معمول گردد.",V)}</p>
    ${dSigs(F,[],"margin-top:12px")}</div>`;
}
async function printCheque(R,P){await loadSigImg();printDoc("نامهٔ دسته چک — "+pname(P),()=>docCheque(P,R),"cheque",true,"a4")}
async function renderCheque(selId){
  if(!selId&&app.wk.cqOpen)selId=app.wk.cqOpen;if(selId)setWkTab("cheque","form");app.wk.cqOpen=0;
  const root=$("#wk-cheque"),p=app.wk.person;
  if(wkTab("cheque")==="rep"){root.innerHTML=pageTabs("cheque")+cqAllHTML();await cqBanks();cqBankFilter();cqAllLoad();return}
  if(!p){root.innerHTML=pageTabs("cheque")+pbar("cheque")+emptyMsg("برای صدور دسته چک، ابتدا یک نفر را انتخاب کنید.");bindPbar("cheque",root);return}
  const [banks,list,next]=await Promise.all([cqBanks(),api("GET","/api/cheques/by-person/"+enc(p.code)).then(r=>r.items).catch(e=>{showAlert(e.message);return[]}),api("GET","/api/cheques/next-serial").then(r=>r.serial).catch(()=>null)]);
  await loadSigImg();
  const cur=selId?list.find(x=>x.id===selId):null;app.wk.cq=cur||null;app.wk.cqList=list;
  const R=cur||{serial:next||"",reqDate:todayJalali(),bankCode:"",bankName:"",branchCode:"",branchName:"",account:String(p.bankAccount||"").trim()};
  const bsel=banks.find(b=>(R.bankCode&&b.code===R.bankCode)||(!R.bankCode&&R.bankName&&b.name===R.bankName));
  root.innerHTML=pageTabs("cheque")+pbar("cheque")+(!banks.length?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb12">ℹ هنوز بانکی تعریف نشده است؛ از منوی «تعریف بانک‌ها» بانک و شعبه‌ها را تعریف (یا از اکسل وارد) کنید.</div>`:"")+`
  <div class="cq-wrap">
    <div class="card"><h2><svg class="i"><use href="#i-receipt"/></svg>${cur?"ویرایش درخواست دسته چک":"صدور دسته چک"}</h2>
      <div class="cq-sec">اطلاعات درخواست</div>
      <div class="cq4">
        <label class="f">شمارهٔ درخواست<input id="cq-serial" class="ltr" inputmode="numeric" value="${esc(R.serial)}" title="خودکار؛ در صورت نیاز قابل ویرایش"></label>
        <label class="f">تاریخ درخواست<input id="cq-date" class="ltr" value="${esc(R.reqDate)}" placeholder="1405/07/26"></label>
        <label class="f c2">شمارهٔ حساب جاری<input id="cq-acc" class="ltr" inputmode="numeric" value="${esc(R.account)}"></label>
      </div>
      <div class="cq-sec">بانک و شعبه</div>
      <div class="cq4">
        <label class="f c2">بانک<select id="cq-bank"><option value="">— انتخاب بانک —</option>${banks.map(b=>`<option value="${esc(b.code)}" data-id="${b.id}" data-name="${esc(b.name)}"${bsel&&bsel.id===b.id?" selected":""}>${esc(b.name)}</option>`).join("")}</select></label>
        <label class="f c2">جست‌وجوی شعبه (نام یا کد)<input id="cq-bq" autocomplete="off" placeholder="بخشی از نام یا کد شعبه را بنویسید…"></label>
        <div class="f c4" id="cq-bres"></div>
        <label class="f">کد شعبه<input id="cq-bcode" class="ltr" value="${esc(R.branchCode)}"></label>
        <label class="f c3">نام شعبه<input id="cq-bname" value="${esc(R.branchName)}" maxlength="150"></label>
      </div>
      <div class="wk-acts u-mt16">
        <button class="btn btn-main" data-act="cq-save"><svg class="i"><use href="#i-file"/></svg>ذخیره<span class="kbd">F4</span></button>
        <button class="btn" data-act="cq-new">جدید</button>
        ${cur?`<button class="btn btn-del" data-act="cq-del">حذف</button>`:""}
        <span class="sp"></span>
        <button class="btn btn-blue" data-act="cq-saveprint"><svg class="i"><use href="#i-print"/></svg>ذخیره و چاپ نامه<span class="kbd">F5</span></button>
      </div></div>
    <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>دسته چک‌های ${esc(pname(p))}</h2>
      ${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>شماره</th><th>تاریخ</th><th>بانک</th><th>شعبه</th><th>شمارهٔ حساب</th><th></th></tr></thead><tbody>
      ${list.map(x=>`<tr class="clk${cur&&cur.id===x.id?" selrow":""}" data-cid="${x.id}"><td><b>${faId(x.serial)}</b></td><td>${faId(esc(x.reqDate))}</td><td>${esc(x.bankName)}</td><td>${esc(x.branchName||"—")}${x.branchCode?` <small class="hint">کد ${faId(esc(x.branchCode))}</small>`:""}</td><td class="ltr">${faId(esc(x.account))}</td><td><div class="wk-tbl-act"><button class="btn" data-act="cq-print" data-id="${x.id}">چاپ نامه</button><button class="btn btn-del" data-act="cq-delrow" data-id="${x.id}">حذف</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">هنوز دسته چکی برای این فرد ثبت نشده است.</div>`}</div>
  </div>`;
  bindPbar("cheque",root);
}

function cqBody(){
  const sel=$("#cq-bank"),opt=sel&&sel.selectedOptions[0];
  return{serial:lat(val("cq-serial")).replace(/\D/g,""),reqDate:lat(val("cq-date")).trim(),bankCode:sel?sel.value:"",bankName:opt&&sel.value?opt.dataset.name:"",branchCode:lat(val("cq-bcode")).trim(),branchName:val("cq-bname").trim(),account:lat(val("cq-acc")).replace(/\D/g,"")};
}
async function saveCheque(){
  const p=app.wk.person,cur=app.wk.cq,b=cqBody();
  if(!b.bankCode)throw new Error("بانک را انتخاب کنید.");
  if(!b.branchName)throw new Error("شعبه را انتخاب (یا نام شعبه را وارد) کنید.");
  let id;
  if(cur){await api("PATCH","/api/cheques/"+cur.id,b);id=cur.id}
  else id=(await api("POST","/api/cheques",Object.assign({code:p.code},b))).id;
  return id;
}
let _cqT=null;
async function cqBranchSearch(){
  const res=$("#cq-bres"),sel=$("#cq-bank");if(!res||!sel)return;
  const q=val("cq-bq").trim(),opt=sel.selectedOptions[0];
  if(!sel.value){res.innerHTML=q?`<span class="hint">ابتدا بانک را انتخاب کنید.</span>`:"";return}
  if(!q){res.innerHTML="";return}
  try{
    const r=await api("GET",`/api/banks/${opt.dataset.id}/branches?q=${enc(q)}`);
    res.innerHTML=r.items.length?`<div class="u-maxh160 u-ovf-auto u-bd1-line u-r8 u-bg-fff">${r.items.map(x=>`<div class="clk u-p-5-10 u-pointer u-bdb1-line" data-cqb="${esc(x.code)}" data-cqn="${esc(x.name)}">${esc(x.name)} <small class="hint">کد ${faId(esc(x.code))}</small></div>`).join("")}</div>`:`<span class="hint">شعبه‌ای پیدا نشد؛ می‌توانید کد و نام شعبه را دستی بنویسید یا در تنظیمات تعریف کنید.</span>`;
  }catch(e){res.innerHTML=`<span class="hint u-c-red-ink" role="alert">${esc(e.message)}</span>`}
}
function cqBankFilter(){const s=$("#cq-fbank");if(!s)return;s.innerHTML=`<option value="">همهٔ بانک‌ها</option>`+(app.banks||[]).map(b=>`<option value="${esc(b.code)}"${app.wk.cqall.bank===b.code?" selected":""}>${esc(b.name)}</option>`).join("")}
function cqAllHTML(){
  const a=app.wk.cqall;
  return `<div class="card u-mt14"><h2><svg class="i"><use href="#i-users"/></svg>دسته چک‌های همهٔ افراد</h2>
  <div class="fgrid"><label class="f">از تاریخ<input id="cq-ffrom" class="ltr" placeholder="1405/07/01" value="${esc(a.from)}"></label><label class="f">تا تاریخ<input id="cq-fto" class="ltr" placeholder="1405/07/30" value="${esc(a.to)}"></label>
    <label class="f">بانک<select id="cq-fbank"></select></label><label class="f">جست‌وجو (نام، کد پرسنلی یا شماره)<input id="cq-fq" value="${esc(a.q)}"></label></div>
  <div class="wk-acts"><button class="btn btn-main" data-act="cqa-filter">اعمال فیلتر</button><span class="sp"></span><button class="btn btn-blue" data-act="cqa-xlsx">خروجی اکسل</button></div>
  <div id="cq-abody" class="u-mt12"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
}
const cqQs=a=>`bank=${enc(a.bank)}`+(a.from?`&from=${enc(a.from)}`:"")+(a.to?`&to=${enc(a.to)}`:"")+(a.q?`&q=${enc(a.q)}`:"");
async function cqAllLoad(){
  const a=app.wk.cqall,body=$("#cq-abody");if(!body)return;
  let r;try{r=await api("GET","/api/cheques?"+cqQs(a)+`&page=${a.page||1}&pageSize=${a.size||50}`)}catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  if(r.total&&r.page>r.pages){a.page=r.pages;return cqAllLoad()}
  a.items=r.items;a.meta=r;
  body.innerHTML=r.total?`${pagerHTML("cq",r)}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>شماره</th><th>تاریخ</th><th>کد پرسنلی</th><th>نام و نام خانوادگی</th><th>بانک</th><th>شعبه</th><th>شمارهٔ حساب</th><th></th></tr></thead><tbody>
    ${r.items.map(x=>`<tr><td>${faId(x.serial)}</td><td>${faId(esc(x.reqDate))}</td><td>${faId(esc(x.code))}</td><td>${esc(x.name)}</td><td>${esc(x.bankName)}</td><td>${esc(x.branchName||"—")}</td><td>${faId(esc(x.account))}</td><td><div class="wk-tbl-act"><button class="btn" data-act="cqa-print" data-id="${x.id}">چاپ نامه</button><button class="btn" data-act="cq-open" data-code="${esc(x.code)}" data-id="${x.id}">باز کردن</button><button class="btn btn-del" data-act="cq-delrow" data-id="${x.id}">حذف</button></div></td></tr>`).join("")}</tbody></table></div>${pagerHTML("cq",r)}`
    :`<div class="hint">درخواستی با این فیلتر پیدا نشد.</div>`;
}
function readCqFilter(){
  const a=app.wk.cqall,re=/^\d{4}\/\d{2}\/\d{2}$/,f=lat(val("cq-ffrom")).trim(),t=lat(val("cq-fto")).trim();
  if((f&&!re.test(f))||(t&&!re.test(t)))throw new Error("تاریخ‌ها را به‌صورت 1405/07/01 وارد کنید.");
  a.from=f;a.to=t;a.bank=val("cq-fbank");a.q=val("cq-fq").trim();a.page=1;
}
async function cqExport(){
  const items=(await api("GET","/api/cheques?"+cqQs(app.wk.cqall)+"&all=1")).items;
  if(!items.length){showAlert("موردی برای خروجی نیست.");return}
  await xlsxExport(`cheque-requests-${todayJalali().replace(/\//g,"-")}.xlsx`,"دسته چک",["شماره","تاریخ درخواست","کد پرسنلی","نام","نام خانوادگی","کد ملی","کد بانک","نام بانک","کد شعبه","نام شعبه","شمارهٔ حساب","نام کاربر"],
    items.map(x=>[x.serial,x.reqDate,String(x.code),x.firstName,x.lastName,String(x.nationalId||""),String(x.bankCode||""),x.bankName,String(x.branchCode||""),x.branchName||"",String(x.account),x.createdBy||""]),[10,12,12,16,18,14,10,18,10,24,20,16]);
}
async function cqAction(b){
  const act=b.dataset.act,id=+b.dataset.id;
  try{
    if(act==="cq-new"){renderCheque();return}
    if(act==="cq-open"){setWkTab("cheque","form");app.wk.code=b.dataset.code;app.wk.person=null;app.wk.cqOpen=id;await renderWk("cheque");return}
    if(act==="cq-save"||act==="cq-saveprint"){
      const nid=await saveCheque();await renderCheque(nid);
      if(act==="cq-saveprint")await printCheque(app.wk.cqList.find(x=>x.id===nid),app.wk.person);else showAlert("درخواست دسته چک ذخیره شد.");
      return;
    }
    if(act==="cq-print"){const x=app.wk.cqList.find(r=>r.id===id);await printCheque(x,app.wk.person);return}
    if(act==="cq-del"&&app.wk.cq){const c=app.wk.cq;showConfirm(`درخواست دسته چک شمارهٔ ${faId(c.serial)} حذف شود؟`,async()=>{try{await api("DELETE","/api/cheques/"+c.id);await renderCheque()}catch(e){showAlert(e.message)}});return}
    if(act==="cq-delrow"){showConfirm("این درخواست دسته چک حذف شود؟",async()=>{try{await api("DELETE","/api/cheques/"+id);if(wkTab("cheque")==="rep")await cqAllLoad();else await renderCheque()}catch(e){showAlert(e.message)}});return}
    if(act==="cqa-print"){const x=app.wk.cqall.items.find(r=>r.id===id);await printCheque(x,x);return}
    if(act==="cqa-filter"){readCqFilter();await cqAllLoad();return}
    if(act==="cqa-xlsx"){readCqFilter();await cqAllLoad();await cqExport();return}
  }catch(err){showAlert(err.message)}
}
{const CQ=$("#wk-cheque");
  CQ.addEventListener("click",e=>{
    const pick=e.target.closest("[data-cqb]");if(pick){$("#cq-bcode").value=pick.dataset.cqb;$("#cq-bname").value=pick.dataset.cqn;$("#cq-bq").value="";$("#cq-bres").innerHTML="";return}
    const bt=e.target.closest("[data-act]");if(bt){cqAction(bt);return}
    const r=e.target.closest("tr[data-cid]");if(r)renderCheque(+r.dataset.cid);
  });
  CQ.addEventListener("input",e=>{if(e.target.id==="cq-bq"){clearTimeout(_cqT);_cqT=setTimeout(cqBranchSearch,250)}});
  CQ.addEventListener("change",e=>{if(e.target.id==="cq-bank"){$("#cq-bcode").value="";$("#cq-bname").value="";cqBranchSearch()}});
}
/* ---- تنظیمات: امضای مدیر ---- */
let _sigNew="";
function sigPrevDraw(src){const el=$("#sigPrev");if(el)el.innerHTML=src?`<img src="${src}" class="u-maxw100p u-maxh100p">`:`<span class="hint">امضایی ثبت نشده</span>`}
function sigFromFile(f){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();fr.onerror=()=>reject(new Error("فایل خوانده نشد."));
    fr.onload=()=>{const im=new Image();im.onerror=()=>reject(new Error("فایل تصویر معتبر نیست."));im.onload=()=>{
      const k=Math.min(1,800/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);
      c.getContext("2d").drawImage(im,0,0,c.width,c.height);resolve(c.toDataURL("image/png"))};im.src=fr.result};
    fr.readAsDataURL(f);
  });
}
$("#sigFile").addEventListener("change",async e=>{
  const f=e.target.files[0];if(!f)return;
  try{_sigNew=await sigFromFile(f);sigPrevDraw(_sigNew);$("#btnSigSave").disabled=false}catch(er){showAlert(er.message)}
});
$("#btnSigSave").addEventListener("click",async()=>{
  try{await api("PUT","/api/assets/signature",{dataUrl:_sigNew});app.sigImg=_sigNew;_sigNew="";$("#btnSigSave").disabled=true;$("#sigFile").value="";showAlert("امضای مدیر ذخیره شد.")}catch(e){showAlert(e.message)}
});
$("#btnSigDel").addEventListener("click",()=>showConfirm("امضای ثبت‌شده حذف شود؟",async()=>{try{await api("DELETE","/api/assets/signature");app.sigImg="";_sigNew="";sigPrevDraw("");showAlert("امضا حذف شد.")}catch(e){showAlert(e.message)}}));
/* ---- تنظیمات: تعریف بانک و شعبه ---- */
const bn={sel:null};
async function bnInit(){await bnLoadBanks()}
const sigOn=F=>{const m=FS().signatureForms||{};return m[F]!==undefined?!!m[F]:F==="cheque"};
async function sigInit(){
  await loadSigImg();sigPrevDraw(app.sigImg);
  const el=$("#sigForms");if(el)el.innerHTML=Object.entries(FORM_LABELS).map(([k,v])=>`<label class="u-flex u-gap6 u-ai-center"><input type="checkbox" data-sigf="${k}"${sigOn(k)?" checked":""}> ${esc(v)}</label>`).join("");
}
$("#btnSigForms").addEventListener("click",async()=>{
  const m={};document.querySelectorAll("#sigForms [data-sigf]").forEach(c=>{m[c.dataset.sigf]=c.checked});
  await dzPut({signatureForms:m},"فرم‌های دارای امضا ذخیره شد.");
});
// تصویر امضای مدیر به‌صورت یک بخش مستقل (قابل جابه‌جایی/تغییر اندازه در چیدمان آزاد) پیش از امضاکنندگان فرم
function dSigImg(F){return app.sigImg&&sigOn(F)?`<div class="d-sigimg"><img src="${app.sigImg}" alt=""></div>`:""}
async function bnLoadBanks(){
  await cqBanks(true);const L=app.banks||[];
  $("#bnBody").innerHTML=L.length?L.map(b=>`<tr class="clk${bn.sel&&bn.sel.id===b.id?" selrow":""}" data-bsel="${b.id}"><td>${faId(esc(b.code))}</td><td>${esc(b.name)}</td><td>${faId(b.branches)}</td><td><div class="wk-tbl-act"><button class="btn" data-bn="edit" data-id="${b.id}">ویرایش</button><button class="btn btn-del" data-bn="del" data-id="${b.id}">حذف</button></div></td></tr>`).join(""):`<tr><td colspan="4" class="hint">بانکی تعریف نشده است.</td></tr>`;
  if(bn.sel){bn.sel=L.find(b=>b.id===bn.sel.id)||null}
  bnDrawBranches();
}
async function bnDrawBranches(){
  const s=bn.sel;$("#brTools").hidden=!s;
  $("#brHead").innerHTML=s?`شعب <b>${esc(s.name)}</b> (${faId(s.branches)} شعبه)`:"برای دیدن و تعریف شعبه‌ها، یک بانک را از فهرست انتخاب کنید.";
  if(!s){$("#brBody").innerHTML="";return}
  try{
    const r=await api("GET",`/api/banks/${s.id}/branches?all=1&q=${enc(val("br-q").trim())}`);
    $("#brBody").innerHTML=r.items.length?r.items.map(x=>`<tr><td>${faId(esc(x.code))}</td><td>${esc(x.name)}</td><td><div class="wk-tbl-act"><button class="btn" data-bn="bedit" data-id="${x.id}" data-c="${esc(x.code)}" data-n="${esc(x.name)}">ویرایش</button><button class="btn btn-del" data-bn="bdel" data-id="${x.id}">حذف</button></div></td></tr>`).join(""):`<tr><td colspan="3" class="hint">شعبه‌ای پیدا نشد.</td></tr>`;
  }catch(e){$("#brBody").innerHTML=`<tr><td colspan="3" class="hint u-c-red-ink">${esc(e.message)}</td></tr>`}
}
let _brT=null;
$("#br-q").addEventListener("input",()=>{clearTimeout(_brT);_brT=setTimeout(bnDrawBranches,250)});
$("#btnBnAdd").addEventListener("click",async()=>{
  try{await api("POST","/api/banks",{code:lat($("#bn-code").value).trim(),name:$("#bn-name").value.trim()});$("#bn-code").value="";$("#bn-name").value="";await bnLoadBanks()}catch(e){showAlert(e.message)}
});
$("#btnBrAdd").addEventListener("click",async()=>{
  if(!bn.sel)return;
  try{await api("POST",`/api/banks/${bn.sel.id}/branches`,{code:lat($("#br-code").value).trim(),name:$("#br-name").value.trim()});$("#br-code").value="";$("#br-name").value="";await bnLoadBanks()}catch(e){showAlert(e.message)}
});
$("#bankCard").addEventListener("click",e=>{
  const b=e.target.closest("[data-bn]"),id=b&&+b.dataset.id;
  if(b){
    const k=b.dataset.bn;
    if(k==="edit"){const x=app.banks.find(r=>r.id===id);openDlg({title:"ویرایش بانک",html:dlgField("کد بانک","code",x.code,"class=ltr")+dlgField("نام بانک","name",x.name),onOk:async d=>{await api("PATCH","/api/banks/"+id,{code:lat(dv(d,"code")).trim(),name:dv(d,"name").trim()});await bnLoadBanks()}});return}
    if(k==="del"){const x=app.banks.find(r=>r.id===id);showConfirm(`بانک «${x.name}» با ${faId(x.branches)} شعبه‌اش حذف شود؟ (سوابق دسته چک‌های ثبت‌شده می‌ماند.)`,async()=>{try{await api("DELETE","/api/banks/"+id);if(bn.sel&&bn.sel.id===id)bn.sel=null;await bnLoadBanks()}catch(er){showAlert(er.message)}});return}
    if(k==="bedit"){openDlg({title:"ویرایش شعبه",html:dlgField("کد شعبه","code",b.dataset.c,"class=ltr")+dlgField("نام شعبه","name",b.dataset.n),onOk:async d=>{await api("PATCH","/api/banks/branches/"+id,{code:lat(dv(d,"code")).trim(),name:dv(d,"name").trim()});await bnDrawBranches()}});return}
    if(k==="bdel"){showConfirm("این شعبه حذف شود؟",async()=>{try{await api("DELETE","/api/banks/branches/"+id);await bnLoadBanks()}catch(er){showAlert(er.message)}});return}
  }
  const r=e.target.closest("tr[data-bsel]");if(r){bn.sel=(app.banks||[]).find(x=>x.id===+r.dataset.bsel)||null;$("#br-q").value="";bnLoadBanks()}
});
async function bnImport(f){
  await ensureXLSX();
  const wb=XLSX.read(new Uint8Array(await f.arrayBuffer()),{type:"array"});
  const sh=n=>{const k=wb.SheetNames.find(x=>scNorm(x)===scNorm(n));return k?XLSX.utils.sheet_to_json(wb.Sheets[k],{header:1,raw:true,defval:""}):null};
  const bs=sh("بانک"),rs=sh("شعب");
  if(!bs&&!rs)throw new Error("شیت «بانک» یا «شعب» در فایل پیدا نشد.");
  const banks=(bs||[]).slice(1).map(r=>({code:String(r[0]).trim(),name:String(r[1]).trim()})).filter(x=>x.code&&x.name);
  const branches=(rs||[]).slice(1).map(r=>({bankCode:String(r[0]).trim(),code:String(r[1]).trim(),name:String(r[2]).trim()})).filter(x=>x.bankCode&&x.code&&x.name);
  showConfirm(`${faId(banks.length)} بانک و ${faId(branches.length)} شعبه در فایل است. موارد هم‌کد به‌روز و بقیه اضافه شوند؟`,async()=>{
    try{
      let nb=0,nr=0,sk=0;
      for(let i=0;i<banks.length;i+=800){const r=await api("POST","/api/banks/import",{banks:banks.slice(i,i+800)});nb+=r.banks;sk+=r.skipped}
      for(let i=0;i<branches.length;i+=800){const r=await api("POST","/api/banks/import",{branches:branches.slice(i,i+800)});nr+=r.branches;sk+=r.skipped}
      await bnLoadBanks();showAlert(`ورود انجام شد: ${faId(nb)} بانک، ${faId(nr)} شعبه${sk?`، ${faId(sk)} ردیف نامعتبر`:""}.`);
    }catch(e){showAlert(e.message)}
  });
}
$("#bnFile").addEventListener("change",e=>{const f=e.target.files[0];e.target.value="";if(f)bnImport(f).catch(er=>showAlert(er.message))});

(function initWk(){
  const EM=$("#wk-emdad"),CH=$("#wk-changes"),LF=$("#wk-life"),DC=$("#wk-dcodes"),L=$("#wk-loanform"),A=$("#wk-advance"),G=$("#wk-goods"),I=$("#wk-inventory"),U=$("#wk-users"),S=$("#wk-services"),N=$("#wk-institutions");
  [L,A,G,I,S,EM,CH,LF,DC,U,N,$("#wk-insurance"),$("#wk-mehr"),$("#wk-vefagh"),$("#wk-cheque"),$("#wk-reports"),$("#wk-schools"),$("#wk-statushistory"),$("#wk-closing"),$("#page-settings")].filter(Boolean).forEach(mkMoney);   // جداکنندهٔ هزارگان هنگام تایپ در همهٔ صفحه‌ها (فیلدهای data-money)
  $("#wk-insurance").addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b)insAction(b)});
  $("#wk-insurance").addEventListener("change",e=>{if(e.target.id==="ins-file")insUpload(e.target.files[0]);else if(e.target.id==="ins-codesfile")insCodesFile(e.target.files[0]);else if(e.target.id==="insr-file")insRecUpload(e.target.files[0]);else if(e.target.id==="insr-filter"||e.target.id==="insr-scope")insRecFilter();else if(e.target.id==="ins-scope"||e.target.id==="ins-canc")insRepRead()});
  $("#wk-insurance").addEventListener("input",e=>{if(e.target.id==="ins-codes")insCodeCount();else if(e.target.id==="insr-q")insRecFilter();else if(e.target.id==="ins-q"){clearTimeout(app._insQT);if(e.target.value.trim().length>=2)app._insQT=setTimeout(()=>insAction({dataset:{act:"ins-search"}}),350)}});
  $("#wk-insurance").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="ins-q"){e.preventDefault();insAction({dataset:{act:"ins-search"}})}});
  LF.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b){lifeAction(b);return}
    const br=e.target.closest("tr[data-bid]");if(br){renderLife(app.wk.life.cur.id,+br.dataset.bid);return}
    const r=e.target.closest("tr[data-lid]");if(r)renderLife(+r.dataset.lid)});
  DC.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b){dcAction(b);return}const r=e.target.closest("tr[data-did]");if(r)renderDcodes(+r.dataset.did)});
  DC.addEventListener("input",e=>{if(e.target.id==="dc-q"){app.dc.q=e.target.value;$("#dc-tbody").innerHTML=dcRows()}});
  EM.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b){emAction(b);return}const r=e.target.closest("tr[data-eid]");if(r)renderEmdad(+r.dataset.eid)});
  EM.addEventListener("input",e=>{if(e.target.id&&e.target.id.startsWith("em-"))emInput(e)});
  EM.addEventListener("change",e=>{if(e.target.id==="em-feeon")emSummary()});
  const MH=$("#wk-mehr");
  MH.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b){mhAction(b);return}const r=e.target.closest("tr[data-mid]");if(r)renderMehr(+r.dataset.mid)});
  MH.addEventListener("input",e=>{if(e.target.id&&e.target.id.startsWith("mh-"))mhInput(e)});
  MH.addEventListener("change",e=>{if(e.target.dataset&&e.target.dataset.mhst){mhChangeStatus(e.target);return}const id=e.target.id;if(id==="mr-file"){mhXlRead(e.target.files[0]).catch(er=>showAlert(er.message));return}if(id==="mh-gcode")mhGuarantorFill();else if(id==="mh-accst")mhAccChange();else if(id==="mh-turn-m"||id==="mh-turn-y"||id==="mh-date")mhChargeLoad()});
  MH.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.id==="mr-q"){e.preventDefault();mhAction({dataset:{act:"mh-find"}})}});
  MH.addEventListener("input",e=>{if(e.target.id!=="mr-q")return;clearTimeout(app._mhQT);app._mhQT=setTimeout(()=>{const q=lat(val("mr-q")).trim();if(q.length>=3)mhFind().catch(()=>{})},400)});
  CH.addEventListener("click",e=>{if(e.target.closest("[data-chclose]"))return;const b=e.target.closest("[data-act]");if(b){chAction(b);return}const r=e.target.closest("tr[data-cid]");if(r)renderChanges(+r.dataset.cid)});
  CH.addEventListener("change",async e=>{
    const t=e.target;
    if(t.id==="ch-code"){chSyncName();return}
    if(t.id==="ch-act"){chLockAmounts();return}
    if(t.dataset&&t.dataset.chclose){
      try{await api("PATCH","/api/changes/"+t.dataset.chclose,{closed:t.checked});await (app.wk.person?renderChanges(app.wk.chg.cur?app.wk.chg.cur.id:undefined):chAllLoad());if(app.wk.call&&$("#ca-body"))chAllLoad()}catch(err){t.checked=!t.checked;showAlert(err.message)}
    }
  });
  CH.addEventListener("input",e=>{if(e.target.id==="ch-name")e.target.dataset.auto=""});
  S.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b){svAction(b);return}const r=e.target.closest("tr[data-sid]");if(r)renderServices(+r.dataset.sid)});
  S.addEventListener("input",e=>{if(e.target.id==="sv-code")svSyncCode();else if(e.target.id==="sv-lcode")svSyncLetterCode()});
  S.addEventListener("change",e=>{const id=e.target.id;if(id==="sv-inst")svInstChanged();else if(/^sv-show/.test(id))svToggle()});
  N.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b){instAction(b);return}const r=e.target.closest("tr[data-iid]");if(r)renderInstitutions(+r.dataset.iid)});
  N.addEventListener("input",e=>{if(e.target.id==="in-q")instFilter()});
  L.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b){loanAction(b.dataset.act,b.dataset.lid);return}const r=e.target.closest("tr[data-lid]");if(r)renderLoan(+r.dataset.lid)});
  L.addEventListener("input",loanInput);
  L.addEventListener("change",e=>{if(e.target.id==="ln-gcode")fillGuarantor("ln")});
  A.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b){advAction(b);return}const r=e.target.closest("tr[data-aid]");if(r)renderAdvance(+r.dataset.aid)});
  A.addEventListener("input",e=>{if(e.target.id&&e.target.id.startsWith("ad-"))advInput(e)});
  G.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b)goodsAction(b)});
  G.addEventListener("input",gdInput);
  G.addEventListener("change",e=>{if(e.target.id==="gg-mode"){try{readGgFilter()}catch(err){showAlert(err.message);return}gdReportLoad()}});
  G.addEventListener("change",e=>{if(e.target.dataset&&e.target.dataset.qty!==undefined){const i=+e.target.dataset.qty;if(gdSetQty(i,parseFloat(lat(e.target.value)),false))gdRenderCart()}});
  document.addEventListener("change",e=>{if(e.target.id==="inv-g")invLoad().catch(()=>{})});
G.addEventListener("change",e=>{if(e.target.id==="gd-prod"){const x=app.wk.products.find(p=>p.id===+e.target.value);if(x){$("#gd-price").value=mnum(x.unitPrice);$("#gd-code").value=x.code||"";gdFillN(x)}}});
  G.addEventListener("keydown",e=>{
    if(e.key!=="Enter")return;
    if(e.target.id==="gd-code"){e.preventDefault();if(gdMatchCode())wkFocus("gd-qty");else if(val("gd-code").trim())showAlert("کالایی با این کد پیدا نشد.")}
    else if(e.target.id==="gd-qty"||e.target.id==="gd-price"){e.preventDefault();gdAddLine()}
  });
  I.addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b)invAction(b)});
  let t=null;
  I.addEventListener("input",e=>{if(e.target.id!=="inv-q")return;app.invQ=e.target.value.trim();clearTimeout(t);t=setTimeout(()=>invLoad().catch(()=>{}),300)});
  U.addEventListener("click",userAction);
  $("#btnSaveFs").addEventListener("click",saveFs);$("#btnSaveFs2").addEventListener("click",saveFs);
  mkMoney($("#roundCard"));
  bkInit();
  $("#tplCard").addEventListener("click",e=>{const b=e.target.closest("[data-tpl]");if(b)openFormTemplate(b.dataset.tpl)});
  $("#btnSaveRound").addEventListener("click",()=>saveRd());
  $("#btnSaveKc").addEventListener("click",()=>saveKc());
  $("#btnSaveIns").addEventListener("click",()=>saveIns());
  $("#btnKcDefault").addEventListener("click",()=>saveKc({loan1:"710",loan2:"",capital:"796",advance:"733",vcapital:"",vloan:"",emdad:"",rloan1:"",rloan2:"",rcapital:"",radvance:"",rvcapital:"",rvloan:"",remdad:""}));
$("#btnSaveLp").addEventListener("click",saveLp);
$("#btnApplyLp").addEventListener("click",()=>loanApplyPending());
  $("#btnRoundDefault").addEventListener("click",()=>saveRd(RD_DEFAULT));
  $("#btnPhotoCheck").addEventListener("click",photoCheck);
  $("#btnLogin").addEventListener("click",doLogin);
  [$("#loginUser"),$("#loginPass"),$("#loginKey")].forEach(i=>i.addEventListener("keydown",e=>{if(e.key==="Enter")doLogin()}));
  $("#ubOut").addEventListener("click",doLogout);
  $("#ubPw").addEventListener("click",()=>pwDlg(false));
  $("#btnPersonnelXlsx").addEventListener("click",personnelExport);
  // دکمه‌های صفحهٔ پرسنل و «بازگشت»
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-wk]");
    if(b){if(b.dataset.wk==="loanform"){app.wk.loanTab="loan";setWkTab("loanform","form")}openWk(b.dataset.wk);return}
    if(e.target.closest("[data-wkback]")){
      if(app.wk.code)app.pfCode=app.wk.code;
      showPage("personnel");
      if(app.wk.code)loadProfile(app.wk.code);
    }
  });
})();

