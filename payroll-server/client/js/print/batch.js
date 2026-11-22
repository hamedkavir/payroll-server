"use strict";
/* print/batch.js — چاپ در پنجرهٔ جدید و چاپ دسته‌ای
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("print/batch");
/* ---------- چاپ (در پنجرهٔ جدید، برای دورزدن محدودیت‌های iframe) ---------- */
function printSheets(list,ctxs){
  const body=list.map((d,i)=>renderSheet(d,ctxs&&ctxs[i]?ctxs[i]:currentCtx())).join("");
  const fontsHTML='';
  const styleHTML=appStyleHTML();
  const doc=`<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
    <title>چاپ فیش حقوقی</title>${fontsHTML}${styleHTML}
    <style>body{background:#fff;padding:0;margin:0}${SLIP_PAGE_CSS}</style>
    </head><body>${body}
    <script>${SLIP_FIT_JS}window.addEventListener("load",function(){(document.fonts?Promise.race([Promise.all([document.fonts.load("400 14px Vazirmatn"),document.fonts.load("600 14px Vazirmatn"),document.fonts.load("700 14px Vazirmatn"),document.fonts.load("800 14px Vazirmatn")]),new Promise(function(r){setTimeout(r,2500)})]).then(function(){return document.fonts.ready},function(){}):Promise.resolve()).then(function(){window.fitSlips();setTimeout(function(){window.focus();window.print();},250)})});<\/script>
    </body></html>`;
  const w=window.open("","_blank");
  if(!w){showAlert("مرورگر بازشدن پنجرهٔ چاپ را مسدود کرد. اجازهٔ پاپ‌آپ را برای این صفحه بدهید.");return}
  w.document.open();w.document.write(printFontFix(doc));w.document.close();
}
$("#btnPrint").addEventListener("click",()=>{
  const person=app.people.find(p=>p.id===app.curSel);
  if(person)printSheets([recordFor(person)]);
});
/* چاپ دسته‌ای: بیش از ۳۰۰ فیش در یک پنجره سیستم را قفل می‌کند؛ فهرست به دسته‌های کوچک تقسیم می‌شود و هر دسته جدا (چاپ یا «ذخیره به‌صورت PDF» در پنجرهٔ چاپ مرورگر) خارج می‌شود */
const BATCH_MAX_DIRECT=300;
function printSheetsBatched(list,kind){
  const total=list.length;let size=+localStorage.getItem("psBatchSize")||300;const done=new Set();
  const w=openDlg({title:"چاپ "+fa(total)+(kind==="active"?" فیش شاغلین":kind==="retiree"?" فیش بازنشستگان":" فیش")+" در چند دسته",wide:true,closeOnBackdrop:false,noCancel:false,html:`
    <p class="hint u-m0b10">چاپ همهٔ فیش‌ها در یک پنجره سیستم را سنگین می‌کند. هر دسته را جدا باز کنید؛ در پنجرهٔ چاپ مرورگر می‌توانید «چاپگر» را روی <b>Save as PDF</b> بگذارید و هر دسته یک فایل PDF می‌شود.</p>
    <label class="f u-mb10">تعداد فیش در هر دسته (۵۰ تا ۱۰۰۰)<input name="bs" type="number" min="50" max="1000" value="${size}"></label>
    <div id="bt-list" class="u-flex u-fwrap u-gap8 u-maxh46vh u-ovf-auto"></div>`});
  const fill=()=>{
    const n=Math.ceil(total/size);
    w.querySelector("#bt-list").innerHTML=Array.from({length:n},(_,i)=>{const a=i*size+1,b=Math.min(total,(i+1)*size);
      return `<button class="btn${done.has(i)?" btn-quiet":""}" data-b="${i}">${done.has(i)?"✓ ":""}دستهٔ ${fa(i+1)} (فیش ${fa(a)} تا ${fa(b)})</button>`}).join("");
    w.querySelector(".dlg-err").textContent=fa(n)+" دسته";
  };
  w.addEventListener("click",e=>{const bt=e.target.closest("[data-b]");if(!bt)return;
    const i=+bt.dataset.b;printSheets(list.slice(i*size,(i+1)*size));done.add(i);fill()});
  // فهرست دسته‌ها فقط وقتی عدد واقعاً عوض شد دوباره ساخته می‌شود (تا کلیک روی دکمه‌ای که همان لحظه جایگزین می‌شود گم نشود)
  const bsEl=w.querySelector("[name=bs]");let bsT=null;
  const applySize=()=>{const v=Math.min(1000,Math.max(50,parseInt(lat(bsEl.value),10)||300));if(v===size)return;size=v;done.clear();
    try{localStorage.setItem("psBatchSize",String(v))}catch(err){}fill();w.querySelector(".dlg-err").textContent="فهرست با اندازهٔ جدید به‌روز شد؛ دستهٔ مورد نظر را دوباره بزنید."};
  bsEl.addEventListener("input",()=>{clearTimeout(bsT);bsT=setTimeout(applySize,500)});
  bsEl.addEventListener("change",()=>{clearTimeout(bsT);applySize();bsEl.value=size});
  fill();
}
/* چاپ همهٔ فیش‌های یک فرد بین دو دورهٔ حقوقی */
$("#btnPrintRange").addEventListener("click",()=>{
  const person=app.people.find(p=>p.id===app.curSel);if(!person)return;
  const ps=[...app.periods].sort((a,b)=>a.year-b.year||a.month-b.month);if(!ps.length)return;
  const cur=ps.find(p=>p.id===app.currentPeriodId)||ps[ps.length-1];
  const opts=sel=>ps.map(p=>`<option value="${p.id}"${p.id===sel?" selected":""}>${MONTHS[p.month-1]} ${faId(p.year)}</option>`).join("");
  const w=openDlg({title:"چاپ فیش‌ها بین دو دوره — "+(person.name||person.code),okText:"چاپ",html:`
    <p class="hint u-m0b10">همهٔ فیش‌های این فرد (کد ${faId(esc(person.code))}) از دورهٔ «از» تا دورهٔ «تا» (با خودِ دو دوره) به‌ترتیب زمان چاپ می‌شود؛ دوره‌ای که فیش او در آن نیست رد می‌شود. حداکثر ۳۶ ماه.</p>
    <label class="f u-mb10">از دورهٔ حقوقی<select name="pf">${opts(cur.id)}</select></label>
    <label class="f u-mb10">تا دورهٔ حقوقی<select name="pt">${opts(cur.id)}</select></label>`,
    onOk:async w=>{
      const a=ps.find(p=>p.id===+dv(w,"pf")),b=ps.find(p=>p.id===+dv(w,"pt"));
      if(!a||!b)throw new Error("دوره‌ها را انتخاب کنید.");
      const r=await api("GET",`/api/periods/person-slips?code=${encodeURIComponent(person.code)}&fy=${a.year}&fm=${a.month}&ty=${b.year}&tm=${b.month}`);
      if(!r.items.length)throw new Error("در این بازه فیشی برای این فرد پیدا نشد.");
      const base=currentCtx(),recs=[],ctxs=[];
      for(const it of r.items){
        recs.push(it.person.kind==="retiree"?computeRetireeRecord(it.person.data,app.settings.showZero):finalizeActive(it.person.data,it.loans||[],app.settings.showZero));
        ctxs.push(Object.assign({},base,{period:{y:it.period.year,m:it.period.month,issue:it.period.issueDate||todayJalali()}}));
      }
      printSheets(recs,ctxs);
    }});
});
$("#btnPrintAll").addEventListener("click",()=>{
  const kind=($("#printKind")||{}).value||"all";
  const sel=kind==="all"?app.people:app.people.filter(p=>p.kind===kind);
  if(!sel.length){showAlert(kind==="retiree"?"در این دوره بازنشسته‌ای نیست.":kind==="active"?"در این دوره شاغلی نیست.":"فیشی برای چاپ نیست.");return}
  const list=sel.map(recordFor);
  if(list.length>BATCH_MAX_DIRECT){printSheetsBatched(list,kind);return}
  if(list.length>60){showConfirm("چاپ "+fa(list.length)+" فیش ممکن است کمی طول بکشد. ادامه؟",()=>printSheets(list));return}
  printSheets(list);
});


