"use strict";
/* inventory/goods.js — درخواست کالا (فروش اقساطی)
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("inventory/goods");
/* =========================== درخواست کالا (فروش اقساطی) =========================== */
app.wk.gform=null;app.wk.editOrder=null;app.wk.grep={from:"",to:"",status:"active",mode:"detail",items:[]};
const codeKey=s=>lat(s).trim().toLowerCase();
const availOf=prod=>prod.quantity+(app.wk.editOrder?app.wk.editOrder.items.filter(i=>i.productId===prod.id).reduce((s,i)=>s+i.qty,0):0);
async function renderGoods(){
  const root=$("#wk-goods"),p=app.wk.person;
  if(wkTab("goods")==="rep"){root.innerHTML=pageTabs("goods")+gdReportHTML();gdReportLoad();return}
  if(!p){root.innerHTML=pageTabs("goods")+pbar("goods")+emptyMsg("برای ثبت درخواست کالا، ابتدا یک نفر را انتخاب کنید.");bindPbar("goods",root);return}
  let orders=[];
  try{
    app.wk.products=(await api("GET","/api/inventory/products")).items;
    orders=(await api("GET","/api/inventory/orders/by-person/"+enc(p.code))).items;
  }catch(e){showAlert(e.message)}
  app.wk.orders=orders;
  const prods=app.wk.products,E=app.wk.editOrder;
  const g=app.wk.gform||(app.wk.gform={date:todayJalali(),down:"0",n:String((prods[0]&&prods[0].defaultInstallments)||FS().goodsDefaultInstallments||6),notes:""});
  root.innerHTML=pageTabs("goods")+pbar("goods")+`
  ${E?`<div class="pf-msg u-mb12">در حال ویرایش درخواست شمارهٔ ${faId(esc(E.number))} — تغییرات با «ذخیرهٔ ویرایش» اعمال می‌شود. <button class="btn u-p-2-10 u-ms8" data-act="gd-canceledit">انصراف از ویرایش</button></div>`:""}
  <div class="card"><h2><svg class="i"><use href="#i-list"/></svg>درخواست کالا برای ${esc(pname(p))}</h2>
    ${prods.length?`<div class="fgrid">
      <label class="f">کد کالا (بعد از تایپ Enter بزنید)<input id="gd-code" class="ltr" autocomplete="off" placeholder="کد کالا"></label>
      <label class="f span2">کالا<select id="gd-prod">${prods.map(x=>`<option value="${x.id}">${x.code?esc(x.code)+" — ":""}${esc(x.name)} — موجودی ${faId(availOf(x))} ${esc(x.unit)}</option>`).join("")}</select></label>
      <label class="f">تعداد<input id="gd-qty" type="number" min="0" step="any" value="1"></label>
        <label class="f">تعداد اقساط این کالا<input id="gd-n" type="number" min="1" max="60" value="${g.n}"></label>
      <label class="f">قیمت واحد (ریال)<input id="gd-price" data-money value="${mnum(prods[0].unitPrice)}"></label>
      <div class="u-flex u-ai-end"><button class="btn btn-main u-w100p" data-act="gd-add">افزودن به فهرست</button></div>
    </div>`:`<div class="hint">کالایی در انبار تعریف نشده است. ابتدا از بخش «انبارداری» کالا اضافه کنید.</div>`}
    <div id="gd-cart" class="u-mt12"></div>
    <div class="fgrid u-mt12">
      <label class="f">تاریخ<input id="gd-date" class="ltr" value="${esc(g.date)}"></label>
      <label class="f">پیش‌پرداخت (ریال)<input id="gd-down" data-money value="${esc(String(g.down))}"></label>
      ${prods.length?"":`<input type="hidden" id="gd-n" value="${g.n}">`}
      <label class="f span2">توضیحات<input id="gd-notes" maxlength="255" value="${esc(g.notes)}"></label>
    </div>
    <div class="wk-sum" id="gd-sum"></div>
    <div class="wk-acts">
      <button class="btn btn-main" data-act="gd-save">${E?"ذخیرهٔ ویرایش":"ثبت درخواست"}<span class="kbd">F4</span></button>
      <span class="sp"></span>
      <button class="btn btn-blue" data-act="gd-saveprint"><svg class="i"><use href="#i-print"/></svg>${E?"ذخیرهٔ ویرایش و چاپ":"ثبت و چاپ فرم"}<span class="kbd">F5</span></button>
    </div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-receipt"/></svg>درخواست‌های قبلی ${esc(pname(p))}</h2>
    ${orders.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>شماره</th><th>تاریخ</th><th>اقلام</th><th>جمع کل</th><th>پیش‌پرداخت</th><th>اقساط</th><th>وضعیت</th><th></th></tr></thead><tbody>
    ${orders.map(o=>`<tr${E&&E.id===o.id?' class="selrow"':""}><td>${faId(esc(o.number))}</td><td>${faId(esc(o.date))}</td><td class="u-ws-normal u-minw180">${o.items.map(i=>esc(i.name)+" ("+faId(i.qty)+")"+itemInstTxt(i)).join("<br>")}</td><td class="money">${fa(o.total)}</td><td>${fa(o.downPayment)}</td><td>${instOrd(o)}</td><td>${stB(ST_ORD,o.status)}</td>
      <td><div class="wk-tbl-act"><button class="btn" data-act="gd-print" data-id="${o.id}">چاپ</button>${o.status==="active"?`<button class="btn btn-amber" data-act="gd-edit" data-id="${o.id}">ویرایش</button><button class="btn btn-del" data-act="gd-cancel" data-id="${o.id}">لغو</button>`:""}<button class="btn btn-del" data-act="gd-del" data-id="${o.id}">حذف</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">هنوز درخواستی ثبت نشده است.</div>`}</div>`;
  bindPbar("goods",root);gdRenderCart();
  if(app.wk.focusId){wkFocus(app.wk.focusId);app.wk.focusId=""}
}
function gdRenderCart(){
  const box=$("#gd-cart");if(!box)return;
  const cart=app.wk.cart;
  box.innerHTML=cart.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کالا</th><th>گروه / کد کسر</th><th>تعداد (قابل ویرایش)</th><th>قیمت واحد</th><th>جمع</th><th>تعداد اقساط</th><th>مبلغ قسط</th><th></th></tr></thead><tbody>
    ${cart.map((c,i)=>`<tr><td>${esc(c.name)}</td><td>${c.groupName?esc(c.groupName):"—"}${c.deductionCode?` <span class="badge b-blue">کد ${faId(esc(c.deductionCode))}</span>`:""}</td><td><div class="qty-ctl"><button class="btn" data-act="gd-qty" data-i="${i}" data-d="-1" title="کم کردن">−</button><input class="qty-in" type="number" min="0" step="any" data-qty="${i}" value="${c.qty}"><button class="btn" data-act="gd-qty" data-i="${i}" data-d="1" title="زیاد کردن">+</button> <small class="hint">${esc(c.unit)}</small></div></td><td>${fa(c.unitPrice)}</td><td class="money" id="gd-lt-${i}">${fa(c.qty*c.unitPrice)}</td><td><input class="qty-in u-w64" type="number" min="1" max="60" data-cn="${i}" value="${c.n||1}"></td><td class="money" id="gd-ci-${i}">—</td><td><button class="btn btn-del u-p-2-10" data-act="gd-rm" data-i="${i}">حذف</button></td></tr>`).join("")}</tbody></table></div>`
    :`<div class="hint">هنوز کالایی به فهرست اضافه نشده است.</div>`;
  gdSummary();
}
// حداکثر تعداد مجاز یک ردیف = موجودی (به‌علاوهٔ تعداد قبلی همین درخواست در حالت ویرایش) منهای سایر ردیف‌های همان کالا
function gdMaxQty(i){
  const c=app.wk.cart[i],prod=(app.wk.products||[]).find(x=>x.id===c.productId);
  if(!prod)return Infinity;
  const others=app.wk.cart.reduce((sm,x,j)=>j!==i&&x.productId===c.productId?sm+x.qty:sm,0);
  return availOf(prod)-others;
}
// تغییر تعداد یک ردیف (با دکمه‌های ± یا تایپ). تعداد صفر یا کمتر مجاز نیست؛ برای حذف از «حذف» استفاده شود.
function gdSetQty(i,q,live){
  const c=app.wk.cart[i];if(!c)return false;
  if(!(q>0)){if(!live){showAlert("تعداد باید بیشتر از صفر باشد؛ برای برداشتن کالا از دکمهٔ «حذف» استفاده کنید.");gdRenderCart()}return false}
  const mx=gdMaxQty(i);
  if(q>mx){showAlert(`موجودی «${c.name}» کافی نیست (حداکثر قابل ثبت: ${mx} ${c.unit}).`);gdRenderCart();return false}
  c.qty=q;
  const lt=$("#gd-lt-"+i);if(lt)lt.textContent=fa(c.qty*c.unitPrice);
  gdSummary();
  return true;
}
function gdSummary(){
  const el=$("#gd-sum");if(!el)return;
  const raw=Math.round(app.wk.cart.reduce((sm,c)=>sm+c.qty*c.unitPrice,0)),total=ceilStep(raw,RS().goods);
  const down=toNum(val("gd-down")),rem=Math.max(0,total-down);
  const PL=app.wk.cart.length?planLinesC(app.wk.cart,total,Math.min(down,total),RS().goodsInst):{rows:[],n:1,inst:0,last:0};
  // قسط هر کالا در جدول اقلام
  PL.rows.forEach((r,i)=>{const t=$("#gd-ci-"+i);if(t)t.innerHTML=fa(r.pl.inst)+(r.pl.n>1&&Math.round(r.pl.last)!==Math.round(r.pl.inst)?` <small class="hint">(آخر: ${fa(r.pl.last)})</small>`:"")});
  const mixed=new Set(PL.rows.map(r=>r.pl.n)).size>1;
  el.innerHTML=`<div>جمع کل${total!==raw?` (جمع اقلام ${fa(raw)} + رند)`:""}<b>${fa(total)}</b></div><div>مانده برای تقسیط<b>${fa(rem)}</b></div><div class="big">جمع قسط ماهانه (همهٔ کالاها)<b>${fa(PL.inst)}</b></div>`+
    (PL.n>1?`<div>تعداد ماه‌های اقساط<b>${faId(PL.n)}</b></div><div>قسط ماه آخر (ماه ${faId(PL.n)}ام)<b>${fa(PL.last)}</b></div>`:"")+
    (mixed?`<div class="u-bg-amber-soft u-c-amber-ink">کالاها تعداد اقساط متفاوت دارند؛ پیش‌پرداخت به نسبت مبلغ هر کالا بین کالاها تقسیم می‌شود و قسط هر کالا جداگانه محاسبه شده است.</div>`:"")+
    (down>total?`<div class="u-bg-red-soft u-c-red-ink">پیش‌پرداخت از جمع کل بیشتر است</div>`:"");
}
function gdInput(e){
  const id=e.target.id,g=app.wk.gform;
  if(id==="gd-n")e.target.dataset.touched="1";
  if(e.target.dataset&&e.target.dataset.cn!==undefined){const c=app.wk.cart[+e.target.dataset.cn];if(c){c.n=Math.max(1,Math.min(60,parseInt(lat(e.target.value),10)||1));gdSummary()}return}
  if(e.target.dataset&&e.target.dataset.qty!==undefined){gdSetQty(+e.target.dataset.qty,parseFloat(lat(e.target.value)),true);return}
  if(g&&["gd-date","gd-down","gd-n","gd-notes"].includes(id)){g.date=val("gd-date");g.down=val("gd-down");g.n=val("gd-n");g.notes=val("gd-notes");gdSummary()}
  if(id==="gd-code")gdMatchCode();
}
// کد کالا را در فهرست پیدا می‌کند و کالا/قیمت را انتخاب می‌کند
// تعداد اقساط پیش‌فرض همین کالا (از «تعریف کالا») در فیلد تعداد اقساط
function gdFillN(prod){const gn=$("#gd-n");if(gn&&prod){gn.value=prod.defaultInstallments||FS().goodsDefaultInstallments||1;if(app.wk.gform)app.wk.gform.n=gn.value}}
function gdMatchCode(){
  const c=codeKey(val("gd-code"));if(!c||!app.wk.products)return null;
  const prod=app.wk.products.find(x=>x.code&&codeKey(x.code)===c);
  if(prod){$("#gd-prod").value=prod.id;$("#gd-price").value=mnum(prod.unitPrice);gdFillN(prod)}
  return prod||null;
}
function gdAddLine(){
  if(!app.wk.products||!app.wk.products.length)return;
  if(val("gd-code").trim()&&!gdMatchCode()){showAlert("کالایی با این کد پیدا نشد.");return}
  const prod=app.wk.products.find(x=>x.id===+val("gd-prod")),qty=parseFloat(lat(val("gd-qty")))||0,price=toNum(val("gd-price"));
  if(!prod)return;
  if(qty<=0){showAlert("تعداد باید بیشتر از صفر باشد.");return}
  const inCart=app.wk.cart.filter(c=>c.productId===prod.id).reduce((s,c)=>s+c.qty,0);
  if(inCart+qty>availOf(prod)){showAlert(`موجودی «${prod.name}» کافی نیست (موجود: ${availOf(prod)} ${prod.unit}).`);return}
  // تعداد اقساط هر کالا مستقل است: از فیلد «تعداد اقساط» کنار کالا (که با انتخاب کالا از تعریف کالا پر می‌شود) خوانده می‌شود
  const nIn=parseInt(lat(val("gd-n")),10);
  app.wk.cart.push({productId:prod.id,name:prod.name,unit:prod.unit,qty,unitPrice:price,groupName:prod.groupName||"",deductionCode:prod.deductionCode||"",n:Math.max(1,Math.min(60,nIn||prod.defaultInstallments||1))});
  gdRenderCart();
  $("#gd-code").value="";$("#gd-qty").value=1;wkFocus("gd-code");
}
async function gdSave(){
  const p=app.wk.person,E=app.wk.editOrder;
  if(!app.wk.cart.length)throw new Error("حداقل یک کالا به فهرست اضافه کنید.");
  const body={code:p.code,date:lat(val("gd-date")).trim(),downPayment:toNum(val("gd-down")),installments:Math.max(1,...app.wk.cart.map(c=>c.n||1)),notes:val("gd-notes").trim(),
    items:app.wk.cart.map(c=>({productId:c.productId,qty:c.qty,unitPrice:c.unitPrice,installments:c.n||1}))};
  const r=E?await api("PUT","/api/inventory/orders/"+E.id,body):await api("POST","/api/inventory/orders",body);
  app.wk.cart=[];app.wk.editOrder=null;app.wk.gform=null;
  return {id:r.id,edited:!!E};
}
function gdStartEdit(o){
  app.wk.editOrder=o;
  app.wk.cart=o.items.map(i=>({productId:i.productId,name:i.name,unit:i.unit,qty:i.qty,unitPrice:i.unitPrice,groupName:i.groupName||"",deductionCode:i.deductionCode||"",n:i.installments||o.installments||1}));
  app.wk.gform={date:o.date,down:mnum(o.downPayment),n:o.installments,notes:o.notes||""};
  return renderGoods().then(()=>window.scrollTo(0,0));
}
/* ---- گزارش درخواست‌های کالا (همهٔ افراد): فیلتر بین دو تاریخ + اکسل ---- */
function gdReportHTML(){
  const a=app.wk.grep;
  return `<div class="card u-mt14"><h2><svg class="i"><use href="#i-users"/></svg>گزارش درخواست‌های کالا (همهٔ افراد)</h2>
  <div class="fgrid">
    <label class="f">از تاریخ<input id="gg-from" class="ltr" placeholder="1405/07/01" value="${esc(a.from)}"></label>
    <label class="f">تا تاریخ<input id="gg-to" class="ltr" placeholder="1405/07/30" value="${esc(a.to)}"></label>
    <label class="f">وضعیت<select id="gg-st">${[["active","فعال"],["cancelled","لغوشده"],["all","همه"]].map(([v,t])=>`<option value="${v}"${a.status===v?" selected":""}>${t}</option>`).join("")}</select></label>
    <label class="f">نوع گزارش<select id="gg-mode"><option value="detail"${a.mode!=="agg"?" selected":""}>تفکیکی (هر درخواست)</option><option value="agg"${a.mode==="agg"?" selected":""}>تجمیعی (جمع هر فرد)</option></select></label>
  </div>
  <div class="wk-acts"><button class="btn btn-main" data-act="gg-filter">اعمال فیلتر</button><span class="sp"></span><button class="btn btn-blue" data-act="gg-xlsx">خروجی اکسل</button></div>
  <div id="gg-body" class="u-mt12"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
}
function readGgFilter(){
  const a=app.wk.grep,re=/^\d{4}\/\d{2}\/\d{2}$/;
  const f=lat(val("gg-from")).trim(),t=lat(val("gg-to")).trim();
  if((f&&!re.test(f))||(t&&!re.test(t)))throw new Error("تاریخ‌ها را به‌صورت 1405/07/01 وارد کنید.");
  a.from=f;a.to=t;a.status=val("gg-st");a.mode=val("gg-mode")==="agg"?"agg":"detail";a.page=1;
}
/* تجمیعی کالا: جدول و ردیف اکسل (به تفکیک فرد و گروه کالا + کد کسر) — مشترک بین صفحهٔ کالا و گزارش‌های مالی */
const GG_AGG_H=["کد پرسنلی","کد ملی","نام","نام خانوادگی","گروه کالا","کد کسر کالا","تعداد درخواست","جمع مبلغ","جمع قسط"];
const GG_AGG_W=[14,14,16,20,20,12,14,18,18];
const ggAggRow=r=>[String(r.code),String(r.nationalId||""),r.firstName||r.name,r.lastName,r.groupName||"بدون گروه",String(r.deductionCode||""),r.count,r.total,r.inst];
const ggAggTable=rows=>`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>کد ملی</th><th>نام</th><th>نام خانوادگی</th><th>گروه کالا</th><th>کد کسر</th><th>تعداد درخواست</th><th>جمع مبلغ</th><th>جمع قسط</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td>${faId(esc(r.code))}</td><td>${faId(esc(r.nationalId))}</td><td>${esc(r.firstName||r.name)}</td><td>${esc(r.lastName)}</td><td>${esc(r.groupName||"بدون گروه")}</td><td>${faId(esc(r.deductionCode||"—"))}</td><td>${faId(r.count)}</td><td class="money">${fa(r.total)}</td><td class="money">${fa(r.inst)}</td></tr>`).join("")}</tbody></table></div>`;
async function gdReportLoad(){
  const a=app.wk.grep,body=$("#gg-body");if(!body)return;
  let r0;
  try{r0=await api("GET","/api/inventory/orders?"+ggQs(a)+`&page=${a.page||1}&pageSize=${a.size||50}`)}catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  if(r0.total&&r0.page>r0.pages){a.page=r0.pages;return gdReportLoad()}
  a.meta=r0;
  const sum=r0.sums.total;
  if(a.mode==="agg"){
    // تجمیعی: جمع هر فرد به تفکیک «گروه کالا» (و کد کسر همان گروه) در سرور حساب می‌شود؛ هر (فرد، گروه) یک ردیف
    const rows=r0.rows,sInst=r0.sums.inst;
    body.innerHTML=r0.total?`<div class="wk-sum u-m0b10"><div>تعداد افراد<b>${faId(r0.sums.persons)}</b></div><div>تعداد درخواست<b>${faId(r0.sums.count)}</b></div><div class="big">جمع مبلغ کالا<b>${fa(sum)}</b></div><div class="big">جمع قسط ماهانه<b>${fa(sInst)}</b></div></div>${pagerHTML("gg",a.meta)}
    ${ggAggTable(rows)}${pagerHTML("gg",a.meta)}
    <p class="hint u-m-8-0-0">هر ردیف = یک فرد در یک «گروه کالا». «جمع قسط» = مجموع قسط ماهانهٔ کالاهای همان گروه در بازهٔ انتخابی.</p>`
    :`<div class="hint">درخواستی با این فیلتر پیدا نشد.</div>`;
    return;
  }
  const items=r0.items;
  body.innerHTML=r0.total?`<div class="wk-sum u-m0b10"><div>تعداد درخواست<b>${faId(r0.total)}</b></div><div class="big">جمع کل فروش<b>${fa(sum)}</b></div></div>${pagerHTML("gg",a.meta)}
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>شماره</th><th>تاریخ</th><th>کد پرسنلی</th><th>نام و نام خانوادگی</th><th>شاغل/بازنشسته</th><th>اقلام</th><th>جمع کل</th><th>اقساط</th><th>وضعیت</th><th></th></tr></thead><tbody>
    ${items.map(o=>`<tr><td>${faId(esc(o.number))}</td><td>${faId(esc(o.date))}</td><td>${faId(esc(o.code))}</td><td>${esc(o.name)}</td><td>${statusBadge(o.personStatus)}</td><td class="u-ws-normal u-minw160">${o.items.map(i=>esc(i.name)+" ("+faId(i.qty)+")"+itemInstTxt(i)).join("<br>")}</td><td class="money">${fa(o.total)}</td><td>${instOrd(o)}</td><td>${stB(ST_ORD,o.status)}</td>
      <td><div class="wk-tbl-act"><button class="btn" data-act="gg-open" data-code="${esc(o.code)}" data-id="${o.id}">${o.status==="active"?"ویرایش":"باز کردن"}</button></div></td></tr>`).join("")}</tbody></table></div>${pagerHTML("gg",a.meta)}`
    :`<div class="hint">درخواستی با این فیلتر پیدا نشد.</div>`;
}
const ggQs=a=>`status=${enc(a.status)}`+(a.from?`&from=${enc(a.from)}`:"")+(a.to?`&to=${enc(a.to)}`:"")+`&mode=${a.mode==="agg"?"agg":"detail"}`;
async function gdExport(){
  // خروجی همیشه همهٔ نتیجهٔ فیلترشده است (all=1)، نه فقط صفحهٔ جاری؛ تجمیعی از همان GROUP BY سرور می‌آید
  const full=await api("GET","/api/inventory/orders?"+ggQs(app.wk.grep)+"&all=1");
  const items=app.wk.grep.mode==="agg"?full.rows:full.items;
  if(!items.length){showAlert("درخواستی برای خروجی در فهرست نیست.");return}
  if(app.wk.grep.mode==="agg"){
    await xlsxExport(`kala-tajmi-${todayJalali().replace(/\//g,"-")}.xlsx`,"تجمیعی کالا",GG_AGG_H,items.map(ggAggRow),GG_AGG_W);
    return;
  }
  // هر قلم کالا یک سطر مستقل است؛ مشخصات درخواست و فرد در همهٔ سطرها تکرار می‌شود (برای فیلتر/Pivot).
  // مبالغ سطح درخواست (پیش‌پرداخت، اقساط) فقط در سطر اول هر درخواست آمده تا هنگام جمع زدن دوبار حساب نشود؛ «جمع ردیف» را جمع بزنید.
  const H=["شمارهٔ درخواست","تاریخ","کد پرسنلی","نام و نام خانوادگی","وضعیت (شاغل/بازنشسته)","ردیف","کد کالا","نام کالا","گروه کالا","کد کسر کالا","واحد","تعداد","قیمت واحد","جمع ردیف","پیش‌پرداخت","تعداد اقساط (کل درخواست)","جمع قسط ماهانه","قسط ماه آخر","وضعیت درخواست","توضیحات"];
  const rows=[];
  items.forEach(o=>o.items.forEach((i,k)=>{
    const f=k===0;
    rows.push([String(o.number),o.date,String(o.code),o.name,o.personStatus||"",k+1,String(i.code||""),i.name,i.groupName||"",String(i.deductionCode||""),i.unit,i.qty,i.unitPrice,Math.round(i.qty*i.unitPrice),
      f?o.downPayment:"",f?o.installments:"",f?o.installmentAmount:"",f?o.lastInstallmentAmount:"",(ST_ORD[o.status]||[o.status])[0],f?(o.notes||""):""]);
  }));
  await xlsxExport(`darkhast-kala-${todayJalali().replace(/\//g,"-")}.xlsx`,"اقلام درخواست کالا",H,rows,[16,14,12,22,16,7,12,28,16,14,10,10,16,16,16,12,16,16,12,28]);
}
async function goodsAction(b){
  const act=b.dataset.act;
  try{
    if(act==="gd-add"){gdAddLine();return}
    if(act==="gd-rm"){app.wk.cart.splice(+b.dataset.i,1);gdRenderCart();return}
    if(act==="gd-qty"){const i=+b.dataset.i,c=app.wk.cart[i];if(c&&gdSetQty(i,Math.round((c.qty+ +b.dataset.d)*1000)/1000,false))gdRenderCart();return}
    if(act==="gd-canceledit"){app.wk.editOrder=null;app.wk.cart=[];app.wk.gform=null;await renderGoods();return}
    if(act==="gd-edit"){const o=app.wk.orders.find(x=>x.id===+b.dataset.id);if(o)await gdStartEdit(o);return}
    if(act==="gd-save"||act==="gd-saveprint"){
      const r=await gdSave();await renderGoods();
      const o=app.wk.orders.find(x=>x.id===r.id);
      if(act==="gd-saveprint"&&o){const pp=app.wk.person;printDoc("فرم درخواست کالا — "+pname(pp),()=>docGoods(pp,o),"goods")}
      else showAlert(r.edited?"ویرایش درخواست ذخیره شد و موجودی انبار اصلاح شد.":"درخواست ثبت شد و موجودی انبار کم شد.");
      return;
    }
    if(act==="gd-print"){const o=app.wk.orders.find(x=>x.id===+b.dataset.id);if(o){const pp=app.wk.person;printDoc("فرم درخواست کالا — "+pname(pp),()=>docGoods(pp,o),"goods")}return}
    if(act==="gd-cancel"){showConfirm("این درخواست لغو و کالاها به انبار برگردانده شود؟",async()=>{try{await api("PUT",`/api/inventory/orders/${b.dataset.id}/cancel`,{});await renderGoods()}catch(e){showAlert(e.message)}});return}
    if(act==="gd-del"){showConfirm("این درخواست کالا برای همیشه حذف شود؟ (اگر فعال باشد کالاها به انبار برمی‌گردد.)",async()=>{try{await api("DELETE",`/api/inventory/orders/${b.dataset.id}`);app.wk.editOrder=null;await renderGoods()}catch(e){showAlert(e.message)}});return}
    if(act==="gg-filter"){readGgFilter();await gdReportLoad();return}
    if(act==="gg-xlsx"){readGgFilter();await gdReportLoad();await gdExport();return}
    if(act==="gg-open"){setWkTab("goods","form");
      app.wk.code=b.dataset.code;app.wk.person=null;app.wk.cart=[];app.wk.editOrder=null;app.wk.gform=null;
      await renderWk("goods");
      const o=(app.wk.orders||[]).find(x=>x.id===+b.dataset.id);
      if(o&&o.status==="active")await gdStartEdit(o);
    }
  }catch(err){showAlert(err.message)}
}

