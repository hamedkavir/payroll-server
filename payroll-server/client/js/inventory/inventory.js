"use strict";
/* inventory/inventory.js — انبارداری
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("inventory/inventory");
/* =============================== انبارداری =============================== */
app.invQ="";
function invRows(items){
  return items.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد</th><th>نام کالا</th><th>گروه</th><th>کد کسر</th><th>واحد</th><th>موجودی</th><th>قیمت واحد</th><th>اقساط پیش‌فرض</th><th></th></tr></thead><tbody>
  ${items.map(x=>`<tr${x.active?"":' class="u-op55"'}><td>${x.code?faId(esc(x.code)):'<span class="badge b-red">بدون کد</span>'}</td><td>${esc(x.name)}${x.active?"":' <span class="badge b-red">غیرفعال</span>'}</td><td>${x.groupName?esc(x.groupName):"—"}</td><td>${x.deductionCode?faId(esc(x.deductionCode)):"—"}</td><td>${esc(x.unit)}</td><td>${x.quantity>0?`<b>${faId(x.quantity)}</b>`:'<span class="badge b-red">ناموجود</span>'}</td><td>${fa(x.unitPrice)}</td><td>${faId(x.defaultInstallments||1)}</td>
  <td><div class="wk-tbl-act"><button class="btn btn-amber" data-act="prod-stock" data-id="${x.id}">ورود / اصلاح موجودی</button><button class="btn" data-act="prod-edit" data-id="${x.id}">ویرایش</button><button class="btn" data-act="prod-moves" data-id="${x.id}">گردش</button><button class="btn" data-act="prod-toggle" data-id="${x.id}">${x.active?"غیرفعال‌سازی":"فعال‌سازی"}</button></div></td></tr>`).join("")}</tbody></table></div>`
  :`<div class="hint">کالایی پیدا نشد.</div>`;
}
async function invLoad(){
  let items=(await api("GET","/api/inventory/products?all=1&q="+enc(app.invQ))).items;
  try{app.wk.groups=(await api("GET","/api/inventory/groups")).items}catch(e){app.wk.groups=app.wk.groups||[]}
  const gs=$("#inv-g");if(gs){const cur=gs.value;gs.innerHTML=`<option value="">همهٔ گروه‌ها</option>`+app.wk.groups.map(g=>`<option value="${g.id}">${esc(g.name)}${g.deductionCode?" — کد کسر "+esc(g.deductionCode):""}</option>`).join("")+`<option value="0">بدون گروه</option>`;gs.value=app.wk.groups.some(g=>String(g.id)===cur)||cur==="0"?cur:""}
  const gf=gs?gs.value:"";
  if(gf!=="")items=items.filter(x=>gf==="0"?!x.groupId:String(x.groupId)===gf);
  app.wk.invItems=items;
  const act=items.filter(x=>x.active);
  $("#inv-sum").innerHTML=`<div>تعداد کالا<b>${faId(act.length)}</b></div><div>کالاهای ناموجود<b>${faId(act.filter(x=>x.quantity<=0).length)}</b></div><div class="big">ارزش موجودی (ریال)<b>${fa(act.reduce((s,x)=>s+x.quantity*x.unitPrice,0))}</b></div>`;
  $("#inv-body").innerHTML=invRows(items);
}
async function renderInventory(){
  const root=$("#wk-inventory");
  root.innerHTML=`<div class="toolbar"><input class="inp u-f1 u-minw200" id="inv-q" type="search" placeholder="جست‌وجوی کالا (نام یا کد)" value="${esc(app.invQ)}">
    <select class="inp u-maxw240" id="inv-g"><option value="">همهٔ گروه‌ها</option></select>
    <button class="btn" data-act="grp-manage">گروه‌های کالا و کد کسر</button>
    <button class="btn btn-main" data-act="prod-new"><svg class="i"><use href="#i-list"/></svg>کالای جدید</button></div>
    <div class="wk-sum u-m0b14" id="inv-sum"></div>
    <div class="card"><h2><svg class="i"><use href="#i-list"/></svg>موجودی انبار</h2><div id="inv-body"><div class="hint" role="status">در حال بارگذاری…</div></div></div>`;
  try{await invLoad()}catch(e){$("#inv-body").innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`}
}
function prodDlg(x){
  const w=openDlg({
    title:x?"ویرایش کالا":"کالای جدید",
    closeOnBackdrop:false,
    html:dlgField("کد کالا (اجباری، بدون تکرار)","code",x?x.code:"",'class="ltr" required')+dlgField("نام کالا","name",x?x.name:"")+dlgField("واحد (عدد، کیلو، متر، …)","unit",x?x.unit:"عدد")
      +dlgField("قیمت واحد (ریال)","price",x?mnum(x.unitPrice):"","data-money")+(x?"":dlgField("موجودی اولیه","qty","0","type=number step=any min=0"))
      +`<label class="f u-mb10">گروه کالا<select name="group"><option value="">بدون گروه</option>${(app.wk.groups||[]).map(g=>`<option value="${g.id}"${x&&x.groupId===g.id?" selected":""}>${esc(g.name)}${g.deductionCode?" — کد کسر "+esc(g.deductionCode):""}</option>`).join("")}</select></label>`
      +dlgField("تعداد اقساط پیش‌فرض","dinst",x?x.defaultInstallments:1,'type=number min=1 max=60')+dlgField("توضیحات","notes",x?x.notes:""),
    onOk:async d=>{
      if(!lat(dv(d,"code")).trim())throw new Error("کد کالا لازم است.");
      if(!dv(d,"name").trim())throw new Error("نام کالا لازم است.");
      const body={name:dv(d,"name"),code:dv(d,"code"),unit:dv(d,"unit"),unitPrice:toNum(dv(d,"price")),notes:dv(d,"notes"),groupId:dv(d,"group")||0,defaultInstallments:parseInt(lat(dv(d,"dinst")),10)||1};
      if(x)await api("PUT","/api/inventory/products/"+x.id,body);
      else await api("POST","/api/inventory/products",Object.assign(body,{quantity:parseFloat(lat(dv(d,"qty")))||0,date:todayJalali()}));
      await invLoad();
    }});
  mkMoney(w);
}
function stockDlg(x){
  const w=openDlg({closeOnBackdrop:false,title:"موجودی «"+x.name+"» — اکنون "+x.quantity+" "+x.unit,
    html:`<label class="f u-mb10">نوع عملیات<select name="mode"><option value="in">ورود کالا به انبار (افزودن به موجودی)</option><option value="set">اصلاح موجودی (مقدار نهایی)</option></select></label>`
      +dlgField("مقدار","qty","","type=number step=any min=0")+dlgField("قیمت واحد جدید (اختیاری)","price","","data-money")+dlgField("تاریخ","date",todayJalali(),'class="ltr"')+dlgField("توضیحات","note",""),
    onOk:async d=>{
      await api("POST",`/api/inventory/products/${x.id}/stock`,{mode:dv(d,"mode"),qty:parseFloat(lat(dv(d,"qty"))),unitPrice:toNum(dv(d,"price")),date:lat(dv(d,"date")).trim(),note:dv(d,"note")});
      await invLoad();
    }});
  mkMoney(w);
}
async function movesDlg(x){
  const r=await api("GET",`/api/inventory/products/${x.id}/movements`);
  const K={in:"ورود",out:"خروج (فروش)",adjust:"اصلاح"};
  openDlg({title:"گردش کالا — "+x.name,wide:true,html:r.items.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>تاریخ</th><th>نوع</th><th>مقدار</th><th>توضیح</th></tr></thead><tbody>${r.items.map(m=>`<tr><td>${faId(esc(m.date))}</td><td>${K[m.kind]||m.kind}</td><td>${faId(m.qty)}</td><td class="u-ws-normal">${esc(m.note)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">گردشی ثبت نشده است.</div>`});
}
// مدیریت گروه‌های کالا (هر گروه یک «کد کسر کالا» دارد)
function grpDlg(){
  const draw=async(w)=>{
    const items=(await api("GET","/api/inventory/groups")).items;app.wk.groups=items;
    w.querySelector(".glist").innerHTML=items.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>نام گروه</th><th>کد کسر کالا</th><th>تعداد کالا</th><th></th></tr></thead><tbody>${items.map(g=>`<tr><td>${esc(g.name)}</td><td>${g.deductionCode?faId(esc(g.deductionCode)):"—"}</td><td>${faId(g.count)}</td><td><div class="wk-tbl-act"><button class="btn" data-g="edit" data-id="${g.id}">ویرایش</button><button class="btn btn-del" data-g="del" data-id="${g.id}">حذف</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">هنوز گروهی تعریف نشده است (مثلاً کالاهای اساسی، تنقلات).</div>`;
  };
  const w=openDlg({title:"گروه‌های کالا و کد کسر",wide:true,html:`<div class="glist"></div>
    <div class="fgrid u-mt12"><label class="f">نام گروه<input name="gname" placeholder="مثلاً کالاهای اساسی"></label><label class="f">کد کسر کالا<input name="gcode" class="ltr" placeholder="کد کسر از حقوق"></label></div>
    <div class="wk-acts"><button class="btn btn-main" data-g="add">افزودن گروه</button></div>`});
  draw(w);
  w.addEventListener("click",async e=>{
    const b=e.target.closest("[data-g]");if(!b)return;
    const err=w.querySelector(".dlg-err");err.textContent="";
    try{
      if(b.dataset.g==="add"){
        await api("POST","/api/inventory/groups",{name:dv(w,"gname").trim(),deductionCode:lat(dv(w,"gcode")).trim()});
        w.querySelector('[name="gname"]').value="";w.querySelector('[name="gcode"]').value="";await draw(w);
      }else{
        const g=app.wk.groups.find(x=>x.id===+b.dataset.id);if(!g)return;
        if(b.dataset.g==="del"){showConfirm(`گروه «${g.name}» حذف شود؟ (کالاهای آن «بدون گروه» می‌شوند)`,async()=>{try{await api("DELETE","/api/inventory/groups/"+g.id);await draw(w);invLoad()}catch(x){err.textContent=x.message}})}
        else{
          const w2=openDlg({title:"ویرایش گروه",html:dlgField("نام گروه","n",g.name)+dlgField("کد کسر کالا","c",g.deductionCode,'class="ltr"'),
            onOk:async d=>{await api("PUT","/api/inventory/groups/"+g.id,{name:dv(d,"n").trim(),deductionCode:lat(dv(d,"c")).trim()});await draw(w);invLoad()}});
        }
      }
      invLoad();
    }catch(x){err.textContent=x.message}
  });
}
async function invAction(b){
  const act=b.dataset.act,x=(app.wk.invItems||[]).find(i=>i.id===+b.dataset.id);
  try{
    if(act==="grp-manage")return grpDlg();
    if(act==="prod-new")return prodDlg(null);
    if(!x)return;
    if(act==="prod-edit")return prodDlg(x);
    if(act==="prod-stock")return stockDlg(x);
    if(act==="prod-moves")return movesDlg(x);
    if(act==="prod-toggle"){await api("PUT","/api/inventory/products/"+x.id,{active:!x.active});await invLoad()}
  }catch(err){showAlert(err.message)}
}

