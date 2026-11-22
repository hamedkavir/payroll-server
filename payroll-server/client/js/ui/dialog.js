"use strict";
/* ui/dialog.js — پنجرهٔ گفتگوی عمومی openDlg و ورودی مبلغ
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("ui/dialog");
/* ---------- پنجرهٔ گفتگوی عمومی ---------- */
// نسخهٔ ۱۱۱: role="dialog" + aria-modal + aria-labelledby، Focus داخل پنجره (Tab/Shift+Tab)، Escape از core/dialogs.js،
// بازگشت Focus به عنصر قبلی، و جلوگیری از اجرای هم‌زمان/دوبارهٔ onOk با کلیک‌های پشت‌سرهم (دکمه تا پایان کار غیرفعال است)
function openDlg({title,html,okText="ذخیره",onOk,wide,noCancel,closeOnBackdrop=true}){
  const w=document.createElement("div");w.className="modalWrap";
  const tid="dlgT"+(++_dlgSeq);
  w.innerHTML=`<div class="modalBox" style="width:100%;max-width:${wide?700:460}px;max-height:90vh;overflow:auto"><h3 id="${tid}" class="u-mb12">${esc(title)}</h3><div>${html}</div><div class="dlg-err u-c-red-ink u-fs12-5 u-minh18 u-mt6" role="alert"></div><div class="row-end">${onOk?`<button type="button" class="btn btn-main" data-ok>${okText}</button>`:""}${noCancel?"":`<button type="button" class="btn btn-quiet" data-no>${onOk?"انصراف":"بستن"}</button>`}</div></div>`;
  document.body.appendChild(w);
  let release=null,busy=false;
  const nativeRemove=w.remove.bind(w);
  const close=()=>{if(release){release();release=null}nativeRemove()};
  w.remove=close;   // اگر کد دیگری پنجره را مستقیم حذف کند هم Focus برمی‌گردد
  w.addEventListener("click",async e=>{
    if(!noCancel&&(e.target.closest("[data-no]")||(closeOnBackdrop&&e.target===w))){close();return}
    const okBtn=e.target.closest("[data-ok]");
    if(okBtn){
      if(busy)return;busy=true;okBtn.disabled=true;okBtn.setAttribute("aria-busy","true");
      try{const r=await onOk(w);if(r!==false)close()}catch(err){w.querySelector(".dlg-err").textContent=err.message}
      finally{busy=false;okBtn.disabled=false;okBtn.removeAttribute("aria-busy")}
    }
  });
  w.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.tagName==="INPUT"){const b=w.querySelector("[data-ok]");if(b)b.click()}});
  const f=w.querySelector("input,select,textarea");
  release=dlgOpen(w,{labelledBy:tid,initial:f||undefined,onEscape:noCancel?null:close});
  return w;
}
const dlgField=(label,name,val="",attrs="")=>`<label class="f u-mb10">${label}<input name="${name}" value="${esc(String(val))}" ${attrs}></label>`;
const dv=(w,n)=>w.querySelector(`[name="${n}"]`).value;
const mkMoney=root=>{
  root.addEventListener("focusout",e=>{if(e.target.matches&&e.target.matches("[data-money]")&&e.target.value.trim()!=="")e.target.value=mnum(toNum(e.target.value))});
  // جداکنندهٔ هزارگان هنگام تایپ (مکان نشانگر حفظ می‌شود)
  root.addEventListener("input",e=>{
    const t=e.target;if(!(t.matches&&t.matches("[data-money]"))||t.tagName!=="INPUT")return;
    const raw=t.value,pos=t.selectionStart==null?raw.length:t.selectionStart;
    const after=raw.slice(pos).replace(/[^\d۰-۹٠-٩]/g,"").length;
    const out=raw.trim()===""?"":(/^[\s\-]*$/.test(raw)?"":mnum(toNum(raw)));
    if(out===raw)return;
    t.value=out;
    let np=out.length,c=0;while(np>0&&c<after){np--;if(/\d/.test(out[np]))c++}
    try{t.setSelectionRange(np,np)}catch(_){}
  });
  // فلش بالا/پایین: تغییر به اندازهٔ data-money-step
  root.addEventListener("keydown",e=>{
    const t=e.target;if(!(t.matches&&t.matches("[data-money-step]"))||!/^Arrow(Up|Down)$/.test(e.key))return;
    e.preventDefault();const st=+t.dataset.moneyStep||1;
    t.value=mnum(Math.max(0,toNum(t.value)+(e.key==="ArrowUp"?st:-st)));
    t.dispatchEvent(new Event("input",{bubbles:true}));
  });
};

