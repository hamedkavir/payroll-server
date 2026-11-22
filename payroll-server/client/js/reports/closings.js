"use strict";
/* reports/closings.js — بستن فایل حقوق و بستن مساعده/امداد
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("reports/closings");
/* ====================== گزارش‌های مالی (مساعده، کالا، وام) ====================== */
/* ====================== بستن فایل حقوق ====================== */
const pad2=n=>String(n).padStart(2,"0");
async function renderClosingPayroll(){
  const root=$("#wk-closing");
  let items=[];
  try{items=(await api("GET","/api/closings")).items}catch(e){root.innerHTML=`<div class="card"><div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div></div>`;return}
  app.cl={items};
  const last=items[0],edit=app.clEdit||null;app.clEdit=null;
  let sy,sm;if(last)[sy,sm]=addMonth(last.year,last.month);else{sy=curY();sm=curM()+1}
  const E=edit||{year:sy,month:sm,closeDate:`${sy}/${pad2(sm)}/15`,note:""};
  const canEdit=can("closing");
  root.innerHTML=`<div class="card"><h2><svg class="i"><use href="#i-lock"/></svg>بستن فایل حقوق</h2>
    <p class="hint u-m0b12">برای هر ماه حقوقی، تاریخی که فایل حقوق بسته شده را ثبت کنید. مثلاً حقوق مهر ۱۴۰۵ با تاریخ بستن ۱۴۰۵/۰۷/۱۵ یعنی دورهٔ مهر از ۱۴۰۵/۰۶/۱۶ (روز بعد از بستن شهریور) تا ۱۴۰۵/۰۷/۱۵ است. گزارش‌های مالی بر اساس همین بازه‌ها محاسبه می‌شوند. اگر برای یک ماه قبلاً ثبت شده باشد، با ثبت مجدد ویرایش می‌شود.</p>
    ${canEdit?`<div class="fgrid">
      <label class="f">ماه حقوق<select id="cl-m">${MONTHS.map((n,i)=>`<option value="${i+1}"${E.month===i+1?" selected":""}>${n}</option>`).join("")}</select></label>
      <label class="f">سال<input id="cl-y" type="number" value="${E.year}"></label>
      <label class="f">تاریخ بستن فایل حقوق<input id="cl-d" class="ltr" placeholder="1405/07/15" value="${esc(E.closeDate)}"></label>
      <label class="f span2">توضیحات (اختیاری)<input id="cl-n" maxlength="200" value="${esc(E.note||"")}"></label>
    </div>
    <div class="wk-acts"><button class="btn btn-main" id="cl-save"><svg class="i"><use href="#i-lock"/></svg>ثبت بستن حقوق</button></div>`:`<div class="hint">شما فقط اجازهٔ مشاهده دارید.</div>`}</div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>فهرست بستن‌های ثبت‌شده</h2>
    ${items.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ماه حقوق</th><th>تاریخ بستن</th><th>دورهٔ پوشش (از — تا)</th><th>توضیحات</th><th>ثبت‌کننده</th>${canEdit?"<th></th>":""}</tr></thead><tbody>
    ${items.map(c=>`<tr><td><b>${MONTHS[c.month-1]} ${faId(c.year)}</b></td><td>${faId(c.closeDate)}</td><td>${c.from?`${faId(c.from)} — ${faId(c.to)}`:`<span class="hint">از ابتدا — ${faId(c.to)}</span>`}${c.from&&!c.fromIsPrevMonth?` <span class="badge b-amber" title="ماه قبل از این بسته نشده است">فاصلهٔ چند ماهه</span>`:""}</td><td>${esc(c.note)}</td><td>${esc(c.createdBy)}</td>
      ${canEdit?`<td><div class="wk-tbl-act"><button class="btn" data-clact="edit" data-id="${c.id}">ویرایش</button><button class="btn btn-del" data-clact="del" data-id="${c.id}">حذف</button></div></td>`:""}</tr>`).join("")}</tbody></table></div>`:`<div class="hint">هنوز تاریخ بستن حقوقی ثبت نشده است. تا آن زمان، گزارش‌های مالی بر اساس ماه تقویمی هستند.</div>`}</div>`;
  const last2=items[0];
  root.insertAdjacentHTML("beforeend",`<div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>گزارش تغییرات ماهانه در بستن حقوق</h2>${items.length?`<div class="fgrid"><label class="f">ماه حقوق<select id="cr-sel">${items.map(c=>`<option value="${c.id}">${MONTHS[c.month-1]} ${faId(c.year)} (تا ${faId(c.closeDate)})</option>`).join("")}</select></label></div><div class="wk-acts"><button class="btn btn-main" id="cr-show">نمایش گزارش</button><button class="btn btn-blue" id="cr-xlsx">خروجی اکسل</button></div><div id="cr-body" class="u-mt12"></div>`:'<div class="hint">ابتدا تاریخ بستن یک ماه را ثبت کنید.</div>'}</div>`);
  if(items.length){
    const load=async()=>{
      const body=$("#cr-body");body.innerHTML='<div class="hint" role="status">در حال بارگذاری…</div>';
      try{
        const r=await api("GET","/api/closings/"+$("#cr-sel").value+"/changes");app.cl.rep=r;
        body.innerHTML=r.items.length?`<div class="hint u-mb8">بازهٔ ثبت: ${r.closing.from?faId(r.closing.from)+" تا ":"از ابتدا تا "}${faId(r.closing.to)} — ${faId(r.items.length)} ردیف</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>نام و نام خانوادگی</th><th>تاریخ ثبت</th><th>کد کسر</th><th>شرح</th><th>ردیف وام</th><th>مبلغ کل</th><th>قسط</th><th>مانده</th><th>وضعیت</th><th>بسته شده</th></tr></thead><tbody>${r.items.map(x=>`<tr><td>${faId(esc(x.code))}</td><td>${esc(x.name)}</td><td>${faId(esc(x.changeDate))}</td><td>${faId(esc(x.deductionCode))}</td><td>${esc(x.deductionName)}</td><td>${x.loanRow?faId(esc(x.loanRow)):"—"}</td><td>${x.totalAmount==null?"—":fa(x.totalAmount)}</td><td>${x.installmentAmount==null?"—":fa(x.installmentAmount)}</td><td>${x.remaining==null?"—":fa(x.remaining)}</td><td>${chB(x.action)}</td><td>${x.closed?"بله":"خیر"}</td></tr>`).join("")}</tbody></table></div>`:'<div class="hint">در این بازه تغییری ثبت نشده است.</div>';
      }catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`}
    };
    $("#cr-show").addEventListener("click",load);$("#cr-sel").addEventListener("change",load);
    $("#cr-xlsx").addEventListener("click",async()=>{if(!app.cl.rep||String(app.cl.rep.closing.id)!==$("#cr-sel").value)await load();const r=app.cl.rep;if(r)await chExport(r.items,"closing-"+r.closing.year+"-"+pad2(r.closing.month))});
    load();
  }
  const sv=$("#cl-save");
  if(sv){
    // با عوض شدن ماه/سال، تاریخ پیشنهادی (۱۵ همان ماه) به‌روز می‌شود؛ مگر کاربر خودش آن را تایپ کرده باشد
    const sync=()=>{const d=$("#cl-d");if(d.dataset.touched)return;d.value=`${parseInt(lat($("#cl-y").value),10)||sy}/${pad2($("#cl-m").value)}/15`};
    $("#cl-m").addEventListener("change",sync);$("#cl-y").addEventListener("input",sync);$("#cl-d").addEventListener("input",e=>{e.target.dataset.touched="1"});
    sv.addEventListener("click",async()=>{
      try{
        const cr=await api("POST","/api/closings",{year:parseInt(lat($("#cl-y").value),10),month:+$("#cl-m").value,closeDate:lat($("#cl-d").value).trim(),note:$("#cl-n").value.trim()});
        app.rep.init=false;await renderClosing();showAlert("تاریخ بستن حقوق ثبت شد."+(cr.closedChanges?` ${faId(cr.closedChanges)} ردیف تغییرات ماهانه (تاریخ ثبت ≤ تاریخ بستن) «بسته» شد.`:""));
      }catch(e){showAlert(e.message)}
    });
  }
  root.onclick=ev=>{
    const b=ev.target.closest("[data-clact]");if(!b)return;
    const c=app.cl.items.find(x=>x.id===+b.dataset.id);if(!c)return;
    if(b.dataset.clact==="edit"){app.clEdit={year:c.year,month:c.month,closeDate:c.closeDate,note:c.note};renderClosing().then(()=>window.scrollTo(0,0))}
    else showConfirm(`بستن حقوق ${MONTHS[c.month-1]} ${c.year} حذف شود؟`,async()=>{try{await api("DELETE","/api/closings/"+c.id);app.rep.init=false;await renderClosing()}catch(e){showAlert(e.message)}});
  };
}

/* صفحهٔ «بستن فایل حقوق»: بستن حقوق + (زیر آن) بستن مساعده */
async function renderClosing(){await renderClosingPayroll();await renderAdvClosing()}
/* ---------- بستن مساعده و امداد: برای هر ماه تاریخ بستن + «اعمال در ماه حقوقی»؛ مساعده و وام امدادِ پرداخت‌شده با تاریخ پرداخت ≤ تاریخ بستن «بسته» (قفل) می‌شود ---------- */
async function renderAdvClosing(){
  const root=$("#wk-closing");if(!root)return;
  let d;try{d=await api("GET","/api/closings/advances")}catch(e){root.insertAdjacentHTML("beforeend",`<div class="card u-mt14"><div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div></div>`);return}
  app.acl={items:d.items};
  const last=d.items[0],edit=app.aclEdit||null;app.aclEdit=null;
  let sy,sm;if(last)[sy,sm]=addMonth(last.year,last.month);else{sy=curY();sm=curM()+1}
  const E=edit||{year:sy,month:sm,closeDate:`${sy}/${pad2(sm)}/15`,applyYear:sy,applyMonth:sm,note:""};
  const canEdit=can("closing");
  root.insertAdjacentHTML("beforeend",`<div class="card u-mt14" id="acl-card"><h2><svg class="i"><use href="#i-lock"/></svg>بستن مساعده و امداد</h2>
    <p class="hint u-m0b12">برای هر ماه، تاریخ بستن و «اعمال در ماه حقوقی» را ثبت کنید. با ثبت، مساعده‌ها و وام‌های امدادِ «پرداخت‌شده»ای که <b>تاریخ پرداختشان ≤ تاریخ بستن</b> است «بسته» می‌شوند، ماه حقوقیِ اعمال برایشان ثبت می‌شود و دیگر قابل تغییر نیستند (برگشت به «در انتظار»، لغو، ویرایش و حذف). هر مورد به نخستین بستنی نسبت داده می‌شود که تاریخش به آن برسد. با حذف یا ویرایش یک بستن، قفل‌ها دوباره حساب می‌شود. الان ${faId(d.closedCount)} مورد بسته‌شده هست.</p>
    ${canEdit?`<div class="fgrid">
      <label class="f">ماهِ بستن<select id="acl-m">${MONTHS.map((n,i)=>`<option value="${i+1}"${E.month===i+1?" selected":""}>${n}</option>`).join("")}</select></label>
      <label class="f">سال<input id="acl-y" type="number" value="${E.year}"></label>
      <label class="f">تاریخ بستن<input id="acl-d" class="ltr" placeholder="1405/07/15" value="${esc(E.closeDate)}"></label>
      <label class="f">اعمال در ماه حقوقی<select id="acl-am">${MONTHS.map((n,i)=>`<option value="${i+1}"${(E.applyMonth||E.month)===i+1?" selected":""}>${n}</option>`).join("")}</select></label>
      <label class="f">سال ماه حقوقی<input id="acl-ay" type="number" value="${E.applyYear||E.year}"></label>
      <label class="f span2">توضیحات (اختیاری)<input id="acl-n" maxlength="200" value="${esc(E.note||"")}"></label>
    </div>
    <div class="wk-acts"><button class="btn btn-main" id="acl-save"><svg class="i"><use href="#i-lock"/></svg>ثبت بستن مساعده و امداد</button><button class="btn btn-green" id="acl-xls-all" type="button">خروجی اکسل همهٔ بسته‌شده‌ها</button></div>`:`<div class="wk-acts"><button class="btn btn-green" id="acl-xls-all" type="button">خروجی اکسل همهٔ بسته‌شده‌ها</button></div>`}
    ${d.items.length?`<div class="tbl-wrap u-mt14"><table class="tbl"><thead><tr><th>ماهِ بستن</th><th>تاریخ بستن</th><th>اعمال در ماه حقوقی</th><th>دورهٔ پوشش (از — تا)</th><th>مساعده</th><th>وام امداد</th><th>توضیحات</th><th>ثبت‌کننده</th><th></th></tr></thead><tbody>
      ${d.items.map(c=>`<tr><td><b>${MONTHS[c.month-1]} ${faId(c.year)}</b></td><td>${faId(c.closeDate)}</td><td><b>${MONTHS[c.applyMonth-1]} ${faId(c.applyYear)}</b></td><td>${c.from?`${faId(c.from)} — ${faId(c.to)}`:`<span class="hint">از ابتدا — ${faId(c.to)}</span>`}</td>
        <td>${faId(c.advances.count)} مورد<br><small class="hint">${fa(c.advances.amount)}</small></td><td>${faId(c.emdad.count)} مورد<br><small class="hint">${fa(c.emdad.amount)}</small></td><td>${esc(c.note)}</td><td>${esc(c.createdBy)}</td>
        <td><div class="wk-tbl-act"><button class="btn btn-green" data-aclact="xls" data-id="${c.id}">اکسل</button>${canEdit?`<button class="btn" data-aclact="edit" data-id="${c.id}">ویرایش</button><button class="btn btn-del" data-aclact="del" data-id="${c.id}">حذف</button>`:""}</div></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint u-mt10">هنوز تاریخ بستنی ثبت نشده است.</div>`}</div>`);
  const card=$("#acl-card");
  const sv=$("#acl-save");
  if(sv){
    const sync=()=>{const dd=$("#acl-d");if(!dd.dataset.touched)dd.value=`${parseInt(lat($("#acl-y").value),10)||sy}/${pad2($("#acl-m").value)}/15`;
      const am=$("#acl-am"),ay=$("#acl-ay");if(!am.dataset.touched){am.value=$("#acl-m").value;ay.value=parseInt(lat($("#acl-y").value),10)||sy}};
    $("#acl-m").addEventListener("change",sync);$("#acl-y").addEventListener("input",sync);$("#acl-d").addEventListener("input",e=>{e.target.dataset.touched="1"});
    $("#acl-am").addEventListener("change",e=>{e.target.dataset.touched="1"});$("#acl-ay").addEventListener("input",()=>{$("#acl-am").dataset.touched="1"});
    sv.addEventListener("click",async()=>{
      try{
        const r=await api("POST","/api/closings/advances",{year:parseInt(lat($("#acl-y").value),10),month:+$("#acl-m").value,closeDate:lat($("#acl-d").value).trim(),applyYear:parseInt(lat($("#acl-ay").value),10),applyMonth:+$("#acl-am").value,note:$("#acl-n").value.trim()});
        await renderClosing();showAlert("بستن مساعده و امداد ثبت شد."+(r.closedAdvances?` ${faId(r.closedAdvances)} مورد پرداخت‌شده «بسته» شد.`:" موردِ جدیدی برای بستن پیدا نشد.")+(r.reopenedAdvances?` ${faId(r.reopenedAdvances)} مورد دوباره باز شد.`:""));
      }catch(e){showAlert(e.message)}
    });
  }
  $("#acl-xls-all").addEventListener("click",()=>aclExport(null));
  card.addEventListener("click",ev=>{
    const b=ev.target.closest("[data-aclact]");if(!b)return;
    const c=app.acl.items.find(x=>x.id===+b.dataset.id);if(!c)return;
    if(b.dataset.aclact==="xls"){aclExport(c);return}
    if(b.dataset.aclact==="edit"){app.aclEdit={year:c.year,month:c.month,closeDate:c.closeDate,applyYear:c.applyYear,applyMonth:c.applyMonth,note:c.note};renderClosing().then(()=>$("#acl-card").scrollIntoView())}
    else showConfirm(`بستن ${MONTHS[c.month-1]} ${c.year} حذف شود؟ قفل مساعده‌ها و امدادها با توجه به بستن‌های باقی‌مانده دوباره حساب می‌شود.`,async()=>{
      try{const r=await api("DELETE","/api/closings/advances/"+c.id);await renderClosing();showAlert("حذف شد."+(r.reopenedAdvances?` ${faId(r.reopenedAdvances)} مورد دوباره باز شد.`:""))}catch(e){showAlert(e.message)}
    });
  });
}
/* خروجی اکسل بستن مساعده و امداد (یک بستن یا همه): برگه‌های «مساعده»، «وام امداد» و «خلاصه» */
async function aclExport(c){
  try{
    const r=await api("GET","/api/closings/advances/items"+(c?`?closingId=${c.id}`:""));
    const H=["ماه بستن","تاریخ بستن","اعمال در ماه حقوقی","کد پرسنلی","کد ملی","نام","نام خانوادگی","وضعیت (شاغل/بازنشسته)","تاریخ درخواست","تاریخ پرداخت","مبلغ","وام بلاعوض","مبلغ بازپرداخت","تعداد اقساط","مبلغ قسط","شماره حساب","نام صاحب حساب"];
    const W=[12,12,16,14,14,16,20,16,14,14,16,16,16,10,16,24,20];
    const rows=k=>r.items.filter(x=>x.kind===k).map(x=>[x.closingYm,x.closeDate,x.applyYm,String(x.code),String(x.nationalId||""),x.firstName,x.lastName,x.personStatus,x.requestDate,x.paidDate,x.amount,x.grantAmount,x.repayAmount,x.installments,x.installmentAmount,String(x.account||""),x.owner||""]);
    const a=rows("مساعده"),e=rows("وام امداد"),sum=arr=>arr.reduce((t,x)=>t+(+x[10]||0),0);
    const tot=(arr)=>arr.concat([["","","","","","","","","","جمع کل",sum(arr),"","","","","",""]]);
    const tag=c?`${c.year}${pad2(c.month)}`:"all";
    await xlsxMulti(`bastan-musaedeh-emdad-${tag}.xlsx`,[
      {name:"مساعده",H,rows:tot(a),widths:W},{name:"وام امداد",H,rows:tot(e),widths:W},
      {name:"خلاصه",H:["بستن","تاریخ بستن","اعمال در ماه حقوقی","تعداد مساعده","جمع مساعده","تعداد وام امداد","جمع وام امداد"],rows:(c?[c]:app.acl.items).map(k=>[`${k.year}/${pad2(k.month)}`,k.closeDate,`${k.applyYear}/${pad2(k.applyMonth)}`,k.advances.count,k.advances.amount,k.emdad.count,k.emdad.amount]),widths:[12,14,18,14,18,16,18]}]);
  }catch(err){showAlert(err.message)}
}
