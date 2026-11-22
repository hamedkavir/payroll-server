"use strict";
/* modules/services.js — موسسات و درخواست خدمات
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("modules/services");
/* =============================== موسسات (خدمات) =============================== */
app.inst={items:[],groups:[],cur:null};app.sv={insts:[],list:[],cur:null,net:null};
const EMP_LBL={all:"همه",active:"شاغل",retired:"بازنشسته"},REP_LBL={repeat:"تکرار",no_repeat:"عدم تکرار"};
const instRows=()=>{
  const q=(app.inst.q||"").trim(),cur=app.inst.cur;
  const rows=app.inst.items.filter(x=>!q||(x.name+" "+x.letterTitle+" "+(x.letterCode||"")).includes(q));
  return rows.length?rows.map(x=>`<tr class="clk${cur&&cur.id===x.id?" selrow":""}" data-iid="${x.id}"><td>${faId(x.id)}</td><td>${x.letterCode?faId(esc(x.letterCode)):"—"}</td><td>${esc(x.name)}</td><td>${esc(x.letterTitle)}</td><td>${EMP_LBL[x.empFilter]}</td><td>${REP_LBL[x.repeatMode]}</td><td>${faId(x.requestCount)}</td><td>${x.active?'<span class="badge b-green">فعال</span>':'<span class="badge b-red">غیرفعال</span>'}</td></tr>`).join(""):`<tr><td colspan="8" class="hint">موردی پیدا نشد.</td></tr>`;
};
function instFilter(){app.inst.q=val("in-q");$("#in-rows").innerHTML=instRows()}
async function renderInstitutions(selId){
  const root=$("#wk-institutions");
  try{const r=await api("GET","/api/institutions");app.inst.items=r.items;app.inst.groups=r.groups}catch(e){root.innerHTML=emptyMsg(esc(e.message));return}
  const cur=selId!=null?app.inst.items.find(x=>x.id===selId):null;app.inst.cur=cur||null;
  const I=cur||{id:"",name:"",letterTitle:"",webUser:"",webPass:"",groupId:null,empFilter:"all",repeatMode:"repeat",letterText:"",footerText:"",active:true};
  const rd=(n,v,tx,c)=>`<label><input type="radio" name="${n}" value="${v}"${c===v?" checked":""}>${tx}</label>`;
  root.innerHTML=`<div class="card"><h2><svg class="i"><use href="#i-list"/></svg>معرفی شرکت‌ها و موسسات طرف قرارداد <span class="badge b-blue">${cur?"ردیف "+faId(cur.id):"موسسهٔ جدید"}</span></h2>
    <div class="fgrid">
      <label class="f">کد نامه (موسسه)<input id="in-lcode" class="ltr" value="${esc(I.letterCode||"")}" maxlength="30"></label>
      <label class="f span2">نام شرکت / موسسه<input id="in-name" value="${esc(I.name)}" maxlength="255"></label>
      <label class="f span2">عنوان نامه<input id="in-title" value="${esc(I.letterTitle)}" maxlength="255"></label>
</div>
    <div class="radios"><b>شامل پرسنل:</b>${rd("in-emp","all","همه",I.empFilter)}${rd("in-emp","active","شاغل",I.empFilter)}${rd("in-emp","retired","بازنشسته",I.empFilter)}
      <span class="u-w18"></span><b>تکرار درخواست برای هر فرد:</b>${rd("in-rep","repeat","تکرار",I.repeatMode)}${rd("in-rep","no_repeat","عدم تکرار (فقط یک بار)",I.repeatMode)}
      <span class="u-w18"></span><label><input type="checkbox" id="in-active"${I.active?" checked":""}>فعال</label></div>
    <label class="f u-mt12">متن نامه (در درخواست هر فرد قابل ویرایش است)<textarea class="inp" id="in-text" rows="9">${esc(I.letterText)}</textarea></label>
    <label class="f u-mt10">متن زیر نامه (محل امضای همکار و تعهد)<textarea class="inp u-minh80" id="in-foot" rows="4">${esc(I.footerText)}</textarea></label>
    <p class="hint u-m-8-0-0">نام کاربری و کلمه عبور وب‌سایت فقط برای مرجع کاربران «تعریف موسسات» ذخیره و نمایش داده می‌شود و روی نامه چاپ نمی‌شود.</p>
    <div class="wk-acts">
      <button class="btn btn-main" data-act="in-save"><svg class="i"><use href="#i-file"/></svg>ذخیره</button>
      <button class="btn" data-act="in-new">جدید</button>
      <button class="btn btn-del" data-act="in-del"${cur?"":" disabled"}>حذف</button>
    </div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>فهرست موسسات (${faId(app.inst.items.length)})</h2>
    <input class="inp u-mb10" id="in-q" type="search" placeholder="جست‌وجو در نام و عنوان نامه…" value="${esc(app.inst.q||"")}">
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>ردیف</th><th>کد نامه</th><th>نام شرکت / موسسه</th><th>عنوان نامه</th><th>شامل</th><th>تکرار</th><th>درخواست‌ها</th><th>وضعیت</th></tr></thead><tbody id="in-rows">${instRows()}</tbody></table></div></div>`;
  if(!cur)setTimeout(()=>wkFocus("in-name"),0);
}
async function instAction(b){
  const act=b.dataset.act,cur=app.inst.cur;
  try{
    if(act==="in-new"){renderInstitutions();return}
    if(act==="in-save"){
      const body={name:val("in-name"),letterTitle:val("in-title"),letterCode:val("in-lcode"),
        empFilter:(document.querySelector('input[name="in-emp"]:checked')||{}).value||"all",repeatMode:(document.querySelector('input[name="in-rep"]:checked')||{}).value||"repeat",
        letterText:val("in-text"),footerText:val("in-foot"),active:$("#in-active").checked};
      if(!body.name.trim()){showAlert("نام شرکت / موسسه را وارد کنید.");return}
      let id;
      if(cur){await api("PUT","/api/institutions/"+cur.id,body);id=cur.id}else{id=(await api("POST","/api/institutions",body)).id}
      await renderInstitutions(id);showAlert("موسسه ذخیره شد.");return;
    }
    if(act==="in-del"&&cur){
      showConfirm(`موسسهٔ «${cur.name}» حذف شود؟`,async()=>{try{await api("DELETE","/api/institutions/"+cur.id);await renderInstitutions()}catch(e){showAlert(e.message)}});
    }
  }catch(err){showAlert(err.message)}
}

/* ---- درخواست خدمات (نامهٔ معرفی برای هر پرسنل) ---- */
// قوانین موسسه (شاغل/بازنشسته و عدم تکرار) — سرور هم همین‌ها را کنترل می‌کند
function svRuleMsg(inst,p,list,curId){
  if(!inst||!p)return"";
  const st=String(p.status||"");
  if(isHeir(p))return HEIR_MSG;
  if(inst.empFilter==="active"&&/بازنشسته|قطع/.test(st))return"این موسسه فقط برای پرسنل شاغل است.";
  if(inst.empFilter==="retired"&&st&&!/بازنشسته/.test(st))return"این موسسه فقط برای بازنشستگان است.";
  if(inst.repeatMode==="no_repeat"){const o=list.find(x=>x.institutionId===inst.id&&x.id!==curId);if(o)return`برای این فرد قبلاً به این موسسه نامه صادر شده (شمارهٔ ${faId(o.letterNumber)}) و موسسه «عدم تکرار» است.`}
  return"";
}
const svInst=()=>app.sv.insts.find(x=>x.id===+val("sv-inst"));
async function renderServices(selId){
  const root=$("#wk-services"),p=app.wk.person;
  try{app.sv.insts=(await api("GET","/api/institutions")).items}catch(e){showAlert(e.message);app.sv.insts=[]}
  if(!p){root.innerHTML=pbar("services")+emptyMsg("برای ثبت درخواست خدمات، ابتدا یک نفر را انتخاب کنید.");bindPbar("services",root);return}
  let list=[],netR=null;
  try{list=(await api("GET","/api/services/by-person/"+enc(p.code))).items}catch(e){showAlert(e.message)}
  try{netR=await api("GET","/api/services/net/"+enc(p.code))}catch(e){}
  let netVal=null;
  if(netR&&netR.payroll){try{const n=recOf(netR.payroll).net;if(Number.isFinite(n))netVal=Math.round(n)}catch(e){}}   // همان محاسبهٔ «وضعیت مالی (آخرین فیش)» فرم پرسنلی
  app.sv.list=list;app.sv.net=netVal;app.sv.netInfo=netVal!=null?`${MONTHS[netR.payroll.month-1]} ${faId(netR.payroll.year)}`:"";
  const cur=selId?list.find(x=>x.id===selId):null;app.sv.cur=cur||null;
  const acts=app.sv.insts.filter(x=>x.active||(cur&&cur.institutionId===x.id));
  const first=cur?acts.find(x=>x.id===cur.institutionId):acts[0];
  const R=cur||{letterNumber:"",requestDate:todayJalali(),requestTime:new Date().toTimeString().slice(0,5),institutionId:first?first.id:"",showNet:false,netAmount:app.sv.net,showAmount:false,amount:0,showVisit:false,visitDate:"",letterText:first?first.letterText:"",footerText:first?first.footerText:"",notes:""};
  const chk=(id,on,tx)=>`<label class="c u-flex u-gap6 u-ai-center u-m0"><input type="checkbox" id="${id}"${on?" checked":""}>${tx}</label>`;
  root.innerHTML=pbar("services")+`
  <div class="card"><h2><svg class="i"><use href="#i-file"/></svg>${cur?"ویرایش درخواست خدمات":"درخواست خدمات"} برای ${esc(pname(p))} <span class="badge b-blue">${cur?"شمارهٔ نامه "+faId(cur.letterNumber):"شماره پس از ذخیره"}</span></h2>
    ${acts.length?"":`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb12">هنوز موسسهٔ فعالی تعریف نشده است؛ از «تعریف موسسات و نامه‌ها» اضافه کنید.</div>`}
    <div id="sv-warn"></div>
    <div class="fgrid">
      <label class="f">تاریخ درخواست<input id="sv-date" class="ltr" value="${esc(R.requestDate)}" placeholder="1405/07/07"></label>
      <label class="f">ساعت<input id="sv-time" class="ltr" value="${esc(R.requestTime)}" placeholder="09:30"></label>
      <label class="f">کد موسسه / شرکت<input id="sv-code" class="ltr" inputmode="numeric" autocomplete="off" value="${R.institutionId||""}"></label>
      <label class="f">کد نامه (موسسه)<input id="sv-lcode" class="ltr" autocomplete="off" placeholder="جست‌وجو با کد نامه" value=""><small class="hint" id="sv-lcode-msg"></small></label>
      <label class="f span2">نام موسسه / شرکت<select id="sv-inst">${acts.map(x=>`<option value="${x.id}"${R.institutionId===x.id?" selected":""}>${faId(x.id)}${x.letterCode?" (کد نامه "+faId(esc(x.letterCode))+")":""} — ${esc(x.name)}${x.letterTitle?" — "+esc(x.letterTitle):""}</option>`).join("")}</select></label>
    </div>
    <div class="fgrid u-mt10 u-ai-end">
      <div>${chk("sv-shownet",R.showNet,"نمایش آخرین خالص دریافتی")}<input id="sv-net" class="ltr u-mt6" data-money inputmode="numeric" value="${R.netAmount!=null?mnum(R.netAmount):""}"><small class="hint">${app.sv.netInfo?"آخرین فیش: "+app.sv.netInfo:"فیشی برای این فرد پیدا نشد"}</small></div>
      <div>${chk("sv-showamt",R.showAmount,"نمایش مبلغ")}<input id="sv-amt" class="ltr u-mt6" data-money inputmode="numeric" value="${R.amount?mnum(R.amount):""}"></div>
      <div>${chk("sv-showvisit",R.showVisit,"نمایش تاریخ مراجعه")}<input id="sv-visit" class="ltr u-mt6" placeholder="1405/07/20" value="${esc(R.visitDate||"")}"></div>
    </div>
    <label class="f u-mt12">متن نامه<textarea class="inp" id="sv-text" rows="8">${esc(R.letterText)}</textarea></label>
    <label class="f u-mt10">متن زیر نامه (محل امضای همکار)<textarea class="inp u-minh70" id="sv-foot" rows="3">${esc(R.footerText)}</textarea></label>
    <label class="f u-mt10">توضیحات<input id="sv-notes" value="${esc(R.notes||"")}" maxlength="500"></label>
    <div class="wk-acts">
      <button class="btn btn-main" data-act="sv-save"><svg class="i"><use href="#i-file"/></svg>ذخیره<span class="kbd">F4</span></button>
      <button class="btn" data-act="sv-new">جدید</button>
      <button class="btn" data-act="sv-reload" title="متن نامه و زیر نامه را دوباره از تعریف موسسه بخوان">بارگذاری متن موسسه</button>
      <button class="btn btn-del" data-act="sv-del"${cur?"":" disabled"}>حذف</button>
      <span class="sp"></span>
      <button class="btn btn-blue" data-act="sv-saveprint"><svg class="i"><use href="#i-print"/></svg>ذخیره و چاپ فرم<span class="kbd">F5</span></button>
    </div></div>
  <div class="card u-mt14"><h2><svg class="i"><use href="#i-list"/></svg>درخواست‌های خدمات ${esc(pname(p))}</h2>
    ${list.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد موسسه</th><th>شمارهٔ نامه</th><th>تاریخ درخواست</th><th>نام موسسه یا شرکت</th><th></th></tr></thead><tbody>
    ${list.map(x=>`<tr class="clk${cur&&cur.id===x.id?" selrow":""}" data-sid="${x.id}"><td>${faId(x.institutionId)}</td><td>${faId(x.letterNumber)}</td><td>${faId(esc(x.requestDate))}</td><td>${esc(x.institutionName)}</td><td><div class="wk-tbl-act"><button class="btn" data-act="sv-print" data-id="${x.id}">چاپ</button></div></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">هنوز درخواست خدمتی برای این فرد ثبت نشده است.</div>`}</div>`;
  bindPbar("services",root);svToggle();svWarn();
  if(app.wk.focusId){wkFocus(app.wk.focusId);app.wk.focusId=""}
}
function svToggle(){
  [["sv-shownet","sv-net"],["sv-showamt","sv-amt"],["sv-showvisit","sv-visit"]].forEach(([c,f])=>{const a=$("#"+c),b=$("#"+f);if(a&&b){b.disabled=!a.checked;if(c==="sv-shownet"&&a.checked&&!b.value.trim()&&app.sv.net!=null)b.value=mnum(app.sv.net)}});
}
function svWarn(){
  const el=$("#sv-warn");if(!el)return;
  const m=svRuleMsg(svInst(),app.wk.person,app.sv.list,app.sv.cur&&app.sv.cur.id);
  el.innerHTML=m?`<div class="pf-msg u-bg-amber-soft u-c-amber-ink u-mb12">⚠ ${esc(m)}</div>`:"";
}
// جست‌وجوی موسسه با «کد نامه»: ابتدا تطابق کامل، بعد تطابق ابتدای کد (فقط موسسات فعال همین فهرست)
function svSyncLetterCode(){
  const q=codeKey(val("sv-lcode")),msg=$("#sv-lcode-msg"),sel=$("#sv-inst");
  if(msg)msg.textContent="";
  if(!q||!sel)return;
  const opts=[...sel.options].map(o=>app.sv.insts.find(x=>x.id===+o.value)).filter(Boolean).filter(x=>x.letterCode);
  let hit=opts.filter(x=>codeKey(x.letterCode)===q);
  if(!hit.length)hit=opts.filter(x=>codeKey(x.letterCode).startsWith(q));
  if(!hit.length){if(msg)msg.textContent="موسسه‌ای با این کد نامه پیدا نشد.";return}
  sel.value=String(hit[0].id);svInstChanged();
  if(msg)msg.textContent=hit.length>1?`${faId(hit.length)} موسسه با این کد پیدا شد؛ اولی انتخاب شد (از فهرست می‌توانید تغییر دهید).`:"";
}
function svSyncCode(){const c=parseInt(lat(val("sv-code")),10),s=$("#sv-inst");if(c&&[...s.options].some(o=>+o.value===c)){s.value=String(c);svInstChanged(true)}}
function svInstChanged(fromCode){
  const inst=svInst();if(!inst)return;
  if(!fromCode)$("#sv-code").value=inst.id;
  if(!app.sv.cur){$("#sv-text").value=inst.letterText;$("#sv-foot").value=inst.footerText}   // درخواست جدید: متن موسسه
  svWarn();
}
function readSv(){
  const p=app.wk.person,inst=svInst();
  if(!inst)throw new Error("موسسه را انتخاب کنید.");
  const netTxt=val("sv-net").trim();
  return {code:p.code,institutionId:inst.id,requestDate:lat(val("sv-date")).trim(),requestTime:lat(val("sv-time")).trim(),
    showNet:$("#sv-shownet").checked,netAmount:netTxt===""?null:toNum(netTxt),showAmount:$("#sv-showamt").checked,amount:toNum(val("sv-amt")),
    showVisit:$("#sv-showvisit").checked,visitDate:lat(val("sv-visit")).trim(),letterText:val("sv-text"),footerText:val("sv-foot"),notes:val("sv-notes")};
}
async function saveService(){
  const body=readSv(),cur=app.sv.cur;
  if(cur){await api("PUT","/api/services/"+cur.id,body);return cur.id}
  return (await api("POST","/api/services",body)).id;
}
function printService(r){
  const p=app.wk.person;if(!r||!p)return;
  printDoc("نامهٔ خدمات — "+pname(p),()=>docService(p,r),"service",true,true);
}
async function svAction(b){
  const act=b.dataset.act;
  try{
    if(act==="sv-new"){app.sv.cur=null;await renderServices();return}
    if(act==="sv-reload"){const inst=svInst();if(inst){$("#sv-text").value=inst.letterText;$("#sv-foot").value=inst.footerText}return}
    if(act==="sv-save"||act==="sv-saveprint"){
      const id=await saveService();await renderServices(id);
      if(act==="sv-saveprint")printService(app.sv.list.find(x=>x.id===id));else showAlert("درخواست خدمات ذخیره شد.");
      return;
    }
    if(act==="sv-print"){printService(app.sv.list.find(x=>x.id===+b.dataset.id));return}
    if(act==="sv-del"&&app.sv.cur){
      const c=app.sv.cur;
      showConfirm(`درخواست شمارهٔ ${faId(c.letterNumber)} (${c.institutionName}) حذف شود؟`,async()=>{try{await api("DELETE","/api/services/"+c.id);app.sv.cur=null;await renderServices()}catch(e){showAlert(e.message)}});
    }
  }catch(err){showAlert(err.message)}
}
/* نامهٔ خدمات (چاپ): همان ظاهر فرم‌های مساعده/وام: سربرگ، عنوان موسسه، متن نامه، مشخصات فرد (کادرها)، نوار مبلغ‌ها، متن زیر نامه و محل امضا */
function docService(p,R){ app.docCtx=p;
  const F="service";
  const hl=[];
  if(R.showNet&&R.netAmount!=null)hl.push(`<span>${ftx(F,"netLbl","خالص دریافتی")} : <b>${rial(R.netAmount)}</b></span>`);
  if(R.showAmount)hl.push(`<span>${ftx(F,"amtLbl","مبلغ وام")} : <b>${rial(R.amount)}</b></span>`);
  if(R.showVisit)hl.push(`<span>${ftx(F,"visitLbl","تاریخ مراجعه")} : <b>${faId(esc(R.visitDate))}</b></span>`);
  return `<div class="doc"><div class="svc-frame">${dHead(ftx(F,"bismillah","بسمه تعالی"),R.letterNumber,R.requestDate)}
    <h1 class="d-title">${esc(R.institutionName)}</h1>
    <div class="d-greet">${ftx(F,"greet","سلام علیکم")}</div>
    <div class="d-letter">${esc(R.letterText)}</div>
    <div class="d-pinfo">
      <div class="d-fg c3">${dFl(ftx(F,"nameLbl","نام و نام خانوادگی"),esc(pname(p)),"w2")}${dFl(ftx(F,"statusLbl","وضعیت شغلی"),esc(p.status||""))}</div>
      <div class="d-fg c3">${dFl(ftx(F,"nidLbl","کد ملی"),faId(esc(p.nationalId||"")))}${dFl(ftx(F,"codeLbl","کد پرسنلی"),faId(esc(p.code)))}${dFl(ftx(F,"telLbl","تلفن"),faId(esc(p.mobile||"")))}</div>
    </div>
    ${hl.length?`<div class="d-hl">${hl.join("")}</div>`:""}
    ${R.footerText?`<div class="d-foottext">${esc(R.footerText)}</div>`:""}
    ${dSigs(F,[`<div class="d-sig hl">${ftx(F,"sig","امضاء متقاضی")}</div>`,`<div class="d-sig">${ftx(F,"expert","کارشناسی تعاون و امور رفاهی")}</div>`])}
    ${dFoot()}</div></div>`;
}
/* فرم دریافت وام امداد (هم‌شکل فرم مساعده). hist: سوابق مساعده/امداد همان ماه (شامل خود این وام) */
function docEmdad(p,E,hist){ app.docCtx=p;
  const F="emdad",f=FS();
  const rows=(hist||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const total=rows.reduce((s,x)=>s+x.amount,0);
  const ym=String(E.requestDate).slice(0,7),from=ym+"/01",to=ym+"/31";
  const emp=p.status==="بازنشسته"?"بازنشسته":"شاغل";
  const grant=E.grantAmount||0,pl=planOf(E.amount-grant,E.installmentAmount,E.installments),lastAmt=E.lastInstallmentAmount!=null?E.lastInstallmentAmount:pl.last;   // اقساط روی (مبلغ وام − بلاعوض)
  const net=E.netAmount!=null?E.netAmount:E.amount;
  const blank=`<span class="d-dots"></span>`;
  const V={org:esc(f.orgName),name:esc(pname(p)),emp,code:faId(esc(p.code)),account:`<span dir="ltr">${faId(esc(E.account||""))}</span>`,owner:esc(E.owner||pname(p)),amount:rial(E.amount),net:rial(net),fee:faId(E.feeEnabled?(E.feePercent||0):0),
    n:faId(pl.k),inst:rial(E.installmentAmount),from:faId(esc(from)),to:faId(esc(to)),hour:faId(13),blank,desc:esc(E.description||"")};
  return `<div class="doc tight">${dHead(ftx(F,"bismillah","بسمه تعالی"),"",E.requestDate)}
    <h1 class="d-title">${ftx(F,"title","فرم دریافت وام امداد")}</h1>
    <div style="font-weight:700">${ftx(F,"to","مدیریت محترم {org}",V)}</div>
    <p class="d-p">${ftx(F,"p1","با سلام و احترام؛ اینجانب {name} از همکاران {emp} با کد پرسنلی {code} و شمارهٔ حساب {account} به نام {owner}، مبلغ {amount} وام امداد نیاز دارم و متعهد می‌شوم حسابداری از حقوق اینجانب کسر نماید. خواهشمند است دستور اقدام لازم را صادر فرمایید.",V)}</p>
    <div class="d-fg c3" style="margin-top:6px">${dFl("مبلغ وام امداد",rial(E.amount))}${dFl(E.feeEnabled?`کارمزد (${faId(E.feePercent||0)}٪)`:"کارمزد",E.feeEnabled?rial(E.feeAmount||0):"ندارد")}${dFl("مبلغ قابل واریز",rial(net))}
      ${dFl("تعداد اقساط",faId(pl.k))}${dFl("مبلغ هر قسط",rial(E.installmentAmount))}${pl.k>1&&Math.round(lastAmt)!==Math.round(E.installmentAmount)?dFl("مبلغ قسط آخر",rial(lastAmt)):dFl("تلفن تماس",faId(esc(E.phone||"")))}
      ${grant?`${dFl("وام بلاعوض",rial(grant))}${dFl("مبلغ بازپرداخت (وام − بلاعوض)",rial(E.amount-grant))}${dFl("تلفن تماس",faId(esc(E.phone||"")))}`:""}</div>
    <div class="d-sec"><h3>${ftx(F,"h1","۱ - نظر کارشناس مسئول تعاون")}</h3>
      <div>${ftx(F,"c1","تعداد اقساط: {n} \u00a0 مبلغ هر قسط: {inst}\nکارشناس محترم تعاون با مبلغ {blank} ریال موافقت می‌گردد.",V)}</div></div>
    <div class="d-sec"><h3>${ftx(F,"h2","۲ - دستور ریاست یا معاونت مالی")}</h3>
      <div>${ftx(F,"c2","توضیحات: {desc}",V)}</div>
      <div style="text-align:left;font-size:10px">${esc(f.managerTitle)} <b>${esc(f.managerName)}</b></div></div>
    <div class="d-sec"><h3>${ftx(F,"h3","حسابداری")}</h3>
      <div>${ftx(F,"c3","نامبرده مبلغ {blank} ریال بدهی دارد. پرداخت وام امداد به نامبرده بلامانع است.\nامضاء و تاریخ: {blank}",V)}</div></div>
    ${dSigs(F,[`<div class="d-sig">${esc(f.managerTitle)}<br><b>${esc(f.managerName)}</b></div>`,`<div class="d-sig">${ftx(F,"s2","کارشناس تعاون")}</div>`,`<div class="d-sig hl">${ftx(F,"s3","امضاء متقاضی")}</div>`])}
    <div class="d-sec"><h3>${ftx(F,"hist","سوابق دریافت وام امداد از تاریخ {from} تا تاریخ {to}",V)}</h3>
      <table class="d-tbl"><tr><th>ردیف</th><th>تاریخ</th><th>شرح</th><th>مبلغ (ریال)</th></tr>
      ${rows.map((x,i)=>`<tr><td>${faId(i+1)}</td><td>${faId(esc(x.date))}</td><td>${esc(x.desc||"")}</td><td>${fa(x.amount)}</td></tr>`).join("")}
      <tr><th colspan="3">جمع کل</th><th>${fa(total)}</th></tr></table></div>${dFoot()}</div>`;
}
/* فرم انصراف و تسویه حساب از صندوق وام ضروری (لغو عضویت) */
function docCancel(p,C){ app.docCtx=p;const kcd=C.codes||KCP(p);
  const F="cancel",f=FS();
  const emp=p.status==="بازنشسته"?"بازنشسته":"شاغل";
  const V={org:esc(f.orgName),name:esc(pname(p)),emp,code:faId(esc(p.code)),days:faId(90),amount:rial(C.payable)};
  return `<div class="doc">${dHead(ftx(F,"bismillah","بسمه تعالی"),"",C.date)}
    <h1 class="d-title">${ftx(F,"title","فرم انصراف و تسویه حساب از صندوق وام ضروری")}</h1>
    <div style="font-weight:700">${ftx(F,"to","به: کارشناسی تعاون و امور رفاهی\nمدیریت {org}",V)}</div>
    <p class="d-p">${ftx(F,"p1","با سلام و احترام؛ اینجانب {name} با کد پرسنلی {code} نیروی {emp}، درخواست انصراف و تسویه حساب از صندوق وام ضروری (رفاه) را دارم. در ضمن متعهد می‌گردم حداقل به مدت {days} روز تقاضای عضویت مجدد نداشته باشم.",V)}</p>
    <div class="d-fg c3" style="margin-top:8px">${dFl(`سرمایهٔ صندوق (کد ${faId(kcd.capital)})`,C.capital!=null?rial(C.capital):"—")}${dFl(`مانده وام (کد ${faId(kcd.loan1)})`,rial(C.loanRemaining||0))}${dFl("مبلغ قابل پرداخت",rial(C.payable))}</div>
    <div class="d-amt"><span>${ftx(F,"amt","مبلغ قابل پرداخت:")}</span><b>${rial(C.payable)}</b></div>
    <p class="d-p">${ftx(F,"p2","مبلغ فوق چند روز بعد از پرداخت حقوق ماه آینده به حساب شما واریز خواهد شد.",V)}</p>
    ${dSigs(F,[`<div class="d-sig hl">${ftx(F,"s1","امضاء متقاضی")}</div>`,`<div class="d-sig">${ftx(F,"s2","کارشناسی تعاون و امور رفاهی")}</div>`],"margin-top:14px")}
    ${dFoot()}</div>`;
}

function wkFocus(id){const el=id&&$("#"+id);if(el&&!el.disabled){el.focus();if(el.select)el.select()}}
