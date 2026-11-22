"use strict";
/* loans/loan-receipts.js — ثبت دریافت وام از اکسل
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("loans/loan-receipts");
// ===== ثبت دریافت وام از اکسل (کد پرسنلی، مبلغ وام، مبلغ قسط، تاریخ دریافت) =====
app.lqr={items:null};
function lqrKey(h){const t=normFa(String(h==null?"":h));
  if(t.includes("تاریخ"))return "receivedDate";if(t.includes("قسط"))return "installmentAmount";
  if(t.includes("وام")||t.includes("مبلغ"))return "loanAmount";if(t.includes("پرسنل")||t.includes("کد"))return "code";return null}
$("#btnLqrSample").addEventListener("click",()=>xlsxExport("loan-received-sample.xlsx","دریافت وام",["کد پرسنلی","مبلغ وام","مبلغ قسط","تاریخ دریافت"],[["96076857",760000000,22000000,"1405/07/21"]],[16,18,18,16]).catch(e=>showAlert(e.message)));
$("#lqrFile").addEventListener("change",async e=>{
  const f=e.target.files[0];app.lqr.items=null;$("#lqrMsg").innerHTML="";if(!f)return;
  try{
    const rows=await readWorkbookRows(f);
    if(rows.length<2)throw new Error("فایل خالی است.");
    const keys=rows[0].map(lqrKey);
    for(const k of ["code","loanAmount","installmentAmount","receivedDate"])if(!keys.includes(k))throw new Error("ستون «"+({code:"کد پرسنلی",loanAmount:"مبلغ وام",installmentAmount:"مبلغ قسط",receivedDate:"تاریخ دریافت"})[k]+"» در سطر اول فایل پیدا نشد.");
    app.lqr.items=rows.slice(1).filter(r=>r.some(c=>String(c).trim()!=="")).map(r=>{const o={};keys.forEach((k,i)=>{if(k&&o[k]===undefined)o[k]=r[i]});return o});
    $("#lqrMsg").innerHTML=`<div class="hint">${faId(app.lqr.items.length)} ردیف خوانده شد. «بررسی» را بزنید.</div>`;
  }catch(err){showAlert(err.message)}
});
function lqrShow(r){
  const sk=r.skipped||[];
  $("#lqrMsg").innerHTML=`<div class="wk-sum u-mt10"><div>${r.dryRun?"نتیجهٔ بررسی (چیزی ثبت نشد)":"نتیجهٔ ثبت"}</div><div>${r.dryRun?"قابل ثبت":"دریافت‌شده"}<b>${fa(r.received)}</b></div><div>ردشده<b>${fa(sk.length)}</b></div></div>`+
    (sk.length?`<div class="tbl-wrap u-mt10"><table class="tbl"><thead><tr><th>ردیف فایل</th><th>کد پرسنلی</th><th>دلیل رد شدن</th></tr></thead><tbody>${sk.slice(0,300).map(x=>`<tr><td>${faId(x.row+1)}</td><td>${faId(esc(x.code))}</td><td>${esc(x.reason)}</td></tr>`).join("")}</tbody></table></div>${sk.length>300?`<div class="hint">فقط ۳۰۰ ردیف اول نمایش داده شد.</div>`:""}`:"");
}
async function lqrSend(dry){
  if(!app.lqr.items||!app.lqr.items.length){showAlert("ابتدا فایل اکسل را انتخاب کنید.");return}
  const r=await api("POST","/api/loan-queue/receive-import",{dryRun:dry,items:app.lqr.items});
  lqrShow(r);return r;
}
$("#btnLqrCheck").addEventListener("click",()=>lqrSend(true).catch(e=>showAlert(e.message)));
$("#btnLqrRun").addEventListener("click",()=>{
  if(!app.lqr.items||!app.lqr.items.length){showAlert("ابتدا فایل اکسل را انتخاب کنید.");return}
  showConfirm("وضعیت نوبتِ «در انتظار» افراد فایل به «دریافت شده» تغییر کند؟ (پیش از این «بررسی» را زده باشید.)",async()=>{
    try{const r=await lqrSend(false);if(r&&typeof loadLqReport==="function")loadLqReport()}catch(e){showAlert(e.message)}
  });
});
document.querySelectorAll("[data-lqtab]").forEach(b=>b.addEventListener("click",()=>lqTab(b.dataset.lqtab)));
["#lqFromM","#lqToM"].forEach(id=>{$(id).innerHTML='<option value="">—</option>'+MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join("")});
$("#btnLqListClear").addEventListener("click",()=>{["#lqFromY","#lqToY","#lqFromM","#lqToM"].forEach(id=>$(id).value="");lqListShow()});
$("#btnLqList").addEventListener("click",lqListShow);
$("#btnLqListXlsx").addEventListener("click",lqListExport);
$("#lqListSt").addEventListener("change",lqListShow);
function fitSheet(){
  const sh=document.querySelector("#preview .sheet"),wrap=document.querySelector(".sheet-wrap");
  if(!sh||!wrap)return;
  const z=Math.max(1,Math.min(1.7,(wrap.clientWidth-8)/860));
  sh.style.zoom=z>1.02?z.toFixed(3):"";
}
window.addEventListener("resize",fitSheet);
$("#btnLqXlsx").addEventListener("click",()=>lqExport().catch(e=>showAlert(e.message)));
async function loadLqReport(){
  const year=toNum($("#lqYear").value),month=+$("#lqMonth").value;
  if(!year){showAlert("سال را وارد کنید.");return}
  lqOverview();
  try{
    const r=await api("GET",`/api/loan-queue/report?year=${year}&month=${month}`);
    $("#lqReportBody").innerHTML=
      lqSectionHTML(`نوبت این ماه (${MONTHS[month-1]} ${faId(year)})`,r.dueThisMonth)+
      ($("#lqShowOver").checked?lqSectionHTML("عقب‌افتاده (نوبتشان گذشته و هنوز دریافت نکرده‌اند)",r.overdue):(r.overdue.length?`<div class="hint u-mt10">${faId(r.overdue.length)} نفر عقب‌افتاده هم هست؛ برای دیدنشان «نمایش عقب‌افتاده‌ها» را بزنید.</div>`:""));
  }catch(err){showAlert("خطا در گرفتن گزارش: "+err.message)}
}
$("#btnLqReport").addEventListener("click",loadLqReport);
$("#lqShowOver").addEventListener("change",loadLqReport);
function openLoanOf(code,id){
  if(!can(PAGE_PERM.loanform)){showAlert("شما به صفحهٔ ثبت وام دسترسی ندارید.");return}
  app.pickCode=String(code);app.wk.person=null;app.wk.loanOpen=+id||null;
  showPage("loanform");
}
document.addEventListener("click",e=>{
  const tr=e.target.closest("tr[data-lqopen]");if(!tr)return;
  const c=app.pfCode||curCode();
  if(c)openLoanOf(c,tr.dataset.lqopen);
});
$("#lqReportBody").addEventListener("click",async(e)=>{
  const btn=e.target.closest("[data-act]");
  if(!btn){const row=e.target.closest(".lqRow[data-code]");if(row)openLoanOf(row.dataset.code,row.dataset.id);return}
  const id=btn.dataset.id;
  if(btn.dataset.act==="cancel"){
    showConfirm("این نوبت لغو شود؟",async()=>{
      try{await api("DELETE",`/api/loan-queue/${id}`);await loadLqReport()}catch(err){showAlert(err.message)}
    });
  }else if(btn.dataset.act==="receive"){
    showConfirm("دریافت وام برای این نفر ثبت شود؟",async()=>{
      try{
        const r=await api("PUT",`/api/loan-queue/${id}/receive`,{});
        await loadLqReport();
        showAlert(`دریافت وام ثبت شد. مبلغ وام: ${fa(r.loanAmount)} — قسط: ${fa(r.installmentAmount)}`);
      }catch(err){showAlert(err.message)}
    });
  }
});

