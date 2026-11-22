"use strict";
/* settings/header.js — تنظیمات سربرگ فرم‌ها
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("settings/header");
/* ====================== تنظیمات سربرگ فرم‌ها (سرور) ====================== */
const FS_FIELDS=[["orgName","نام اداره (سربرگ فرم‌ها)"],["fundName","نام صندوق"],["managerTitle","عنوان مدیر (امضا)"],["managerName","نام مدیر"],["advanceFeePercent","درصد کسر مساعده"],["advancePayDay","روز واریز مساعده در ماه"],["advanceDefaultAmount","مبلغ پیش‌فرض مساعده"],["advanceDefaultInstallments","تعداد اقساط پیش‌فرض مساعده"],["lifeNumberStart","شمارهٔ شروع بیمه عمر"],["emdadFeePercent","درصد کارمزد وام امداد"],["emdadDefaultAmount","مبلغ پیش‌فرض وام امداد"],["emdadDefaultInstallments","تعداد اقساط پیش‌فرض وام امداد"],["goodsDefaultInstallments","تعداد اقساط پیش‌فرض درخواست کالا"],["serviceLetterStart","شمارهٔ شروع نامه‌های خدمات"],["formMarginRight","حاشیهٔ راست چاپ فرم‌ها"],["formMarginLeft","حاشیهٔ چپ چاپ فرم‌ها"]];
const RD_KEYS=["roundLoan","roundLoanInst","roundAdvance","roundAdvInst","roundGoods","roundGoodsInst"];
const RD_DEFAULT={roundLoan:1e7,roundLoanInst:1e6,roundAdvance:1e6,roundAdvInst:1e6,roundGoods:1e6,roundGoodsInst:1e6};
function fillLpForm(){const f=FS();const a=$("#lp-wait");if(a)a.value=f.loanWaitMonths;const b=$("#lp-share");if(b)b.value=mnum(f.loanFundShare);const c=$("#lp-max");if(c)c.value=mnum(f.loanMax)}
async function saveLp(){
  try{
    const body={loanWaitMonths:parseInt(lat(val("lp-wait")),10)||0,loanFundShare:toNum(val("lp-share")),loanMax:toNum(val("lp-max"))};
    const r=await api("PUT","/api/loan-params",body);app.fs=Object.assign(app.fs||{},r);fillLpForm();
    showConfirm("پارامترهای فرمول وام ذخیره شد. همین حالا روی نوبت‌های «در انتظار» (مبلغ، قسط و ماه نوبت) هم اعمال شود؟",()=>loanApplyPending());
  }catch(e){showAlert(e.message)}
}
function fillInsForm(){const f=(app.fs&&app.fs.insShares)||{},g=$("#ins-sgovt"),e=$("#ins-semp");if(g)g.value=f.govt?mnum(f.govt):"";if(e)e.value=f.emp?mnum(f.emp):""}
async function saveIns(){
  if(await dzPut({insShares:{govt:toNum(val("ins-sgovt")),emp:toNum(val("ins-semp"))}},"سهم دولت و کارمند ذخیره شد.")){fillInsForm();if(app.page==="insurance"&&typeof renderInsurance==="function")renderInsurance()}
}
const KC_KEYS=["loan1","loan2","capital","advance","vcapital","vloan","emdad","rloan1","rloan2","rcapital","radvance","rvcapital","rvloan","remdad"];
const kcRow=e=>`<div class="kc-xrow u-flex u-gap8 u-m-6-0 u-ai-center"><input class="kcx-l u-f2" placeholder="عنوان (مثلاً وام اضطراری)" maxlength="40" value="${esc(e.label||"")}"><input class="kcx-c ltr u-f1" placeholder="کد" maxlength="20" value="${esc(e.code||"")}"><button class="btn btn-del" type="button" data-kcx-del title="حذف این کد">×</button></div>`;
const kcExtraRead=(sel="#kc-extra")=>[...document.querySelectorAll(sel+" .kc-xrow")].map(r=>({label:r.querySelector(".kcx-l").value.trim(),code:lat(r.querySelector(".kcx-c").value).trim()}));
function fillKcForm(vals){const k=vals||KC();KC_KEYS.forEach(x=>{const el=$("#kc-"+x);if(el)el.value=k[x]||""});const ex=$("#kc-extra");if(ex)ex.innerHTML=(k.extra||[]).map(kcRow).join("");const rx=$("#kc-rextra");if(rx)rx.innerHTML=(k.rextra||[]).map(kcRow).join("")}
async function saveKc(vals){
  const body={keyCodes:{}};KC_KEYS.forEach(x=>body.keyCodes[x]=vals?vals[x]:lat($("#kc-"+x).value).trim());
  body.keyCodes.extra=kcExtraRead();body.keyCodes.rextra=kcExtraRead("#kc-rextra");
  try{app.fs=await api("PUT","/api/form-settings",body);fillKcForm();showAlert("کدهای مهم ذخیره شد.")}catch(e){showAlert(e.message)}
}
document.addEventListener("click",e=>{
  if(e.target.id==="btnKcAdd"){const ex=$("#kc-extra");if(ex)ex.insertAdjacentHTML("beforeend",kcRow({}));return}
  if(e.target.id==="btnKcRAdd"){const ex=$("#kc-rextra");if(ex)ex.insertAdjacentHTML("beforeend",kcRow({}));return}
  const d=e.target.closest("[data-kcx-del]");if(d)d.closest(".kc-xrow").remove();
});
function fillRdForm(vals){const r=RS(),m={roundLoan:r.loan,roundLoanInst:r.loanInst,roundAdvance:r.advance,roundAdvInst:r.advInst,roundGoods:r.goods,roundGoodsInst:r.goodsInst};RD_KEYS.forEach(k=>{const el=$("#rd-"+k);if(el)el.value=mnum((vals||m)[k])})}
async function saveRd(vals){
  const body={};RD_KEYS.forEach(k=>body[k]=vals?vals[k]:Math.max(1,toNum($("#rd-"+k).value)||1));
  try{app.fs=await api("PUT","/api/form-settings",body);fillRdForm();showAlert("گرد کردن مبالغ ذخیره شد.")}catch(e){showAlert(e.message)}
}

