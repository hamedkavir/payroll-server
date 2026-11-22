"use strict";
/* modules/insurance.js — بیمهٔ تکمیلی درمان
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("modules/insurance");
/* =============================== بیمهٔ تکمیلی درمان ===============================
   فایل کلی بیمه (همهٔ سرپرستان + همسر/فرزند/پدر/مادر) در پایگاه داده نگه‌داری می‌شود. تب ۱: افراد تحت تکفلِ فرد انتخاب‌شده
   (و جست‌وجوی آزاد در فایل)؛ تب ۲: بارگذاری فایل + گزارش تجمیعی و خروجی اکسل (همان کار bimeh_tool.py). */
const insNH=h=>toEnDigits(String(h==null?"":h)).replace(/_x000D_/g,"").replace(/ي/g,"ی").replace(/ك/g,"ک").replace(/ة/g,"ه").replace(/[\s\u200c\u200e\u200f]+/g,"");
const INS_COLS={mainid:h=>h==="کدبیمهشدهاصلی",pcode:h=>h==="کدپرسنلی",unit:h=>h==="واحدسازمانی",plan:h=>h==="طرح",fname:h=>h==="نامبیمهشده",lname:h=>h==="نامخانوادگیبیمهشده",father:h=>h==="نامپدر",rel:h=>h.startsWith("نسبتبا"),birth:h=>h==="تاریختولد",sex:h=>h==="جنسیت",nid:h=>h==="کدملیبیمهشده",start:h=>h==="تاریخشروعپوشش",end:h=>h==="تاریخپایانپوشش",reason:h=>h==="علتپایانپوشش",policyNo:h=>h==="شمارهبیمهنامه",premium:h=>h==="حقبیمهبیمهشده",insType:h=>h==="نوعبیمهشده"};
const INS_REQ=[["pcode","کد پرسنلی"],["fname","نام بیمه شده"],["lname","نام خانوادگی بیمه شده"],["rel","نسبت با بیمه شده"],["nid","کد ملی بیمه شده"],["sex","جنسیت"],["start","تاریخ شروع پوشش"],["end","تاریخ پایان پوشش"]];
const INS_REL_B={"سرپرست":"b-blue","همسر":"b-amber","پسر":"b-green","دختر":"b-green","فرزند":"b-green","پدر":"b-red","مادر":"b-red"};
// ستون‌ها بر اساس عنوان پیدا می‌شوند؛ اگر عنوانی عوض شده باشد خطای «ستون موردنیاز پیدا نشد» می‌دهد
function insParse(rows){
  if(!rows.length)throw new Error("فایل خالی است.");
  const hdr=rows[0].map(insNH),col={};
  for(const k in INS_COLS){const i=hdr.findIndex(INS_COLS[k]);if(i>=0)col[k]=i}
  const miss=INS_REQ.filter(([k])=>col[k]==null).map(x=>x[1]);
  if(miss.length)throw new Error("ستون موردنیاز پیدا نشد: "+miss.join("، "));
  const out=[];
  for(let r=1;r<rows.length;r++){const row=rows[r];if(!row||!row.some(x=>x!==""&&x!=null))continue;const o={};for(const k in col)o[k]=row[col[k]];out.push(o)}
  return out;
}
// مبلغ‌های سهم دولت/کارمند (هر نفر، ریال): فقط از «تنظیمات ← بیمه تکمیلی» خوانده می‌شود
function insShares(){const f=(app.fs&&app.fs.insShares)||{};return{govt:Math.max(0,Math.round(+f.govt||0)),emp:Math.max(0,Math.round(+f.emp||0))}}
const insSharesNote=()=>{const sh=insShares();return `<span class="hint">سهم دولت: <b>${fa(sh.govt)}</b> — سهم کارمند: <b>${fa(sh.emp)}</b> ریال (هر نفر؛ تغییر از «تنظیمات ← بیمه تکمیلی»)</span>`};
// سهم هر عضو (مثل فرمول‌های گزارش تجمیعی): سرپرست، فرزند و همسرِ سرپرست مرد: سهم دولت + سهم کارمند؛ پدر، مادر و همسرِ سرپرست زن (اناث): سهم دولت صفر و سهم کارمند = دولت + کارمند. لغوشده‌ها شمرده نمی‌شوند.
function insMemberShare(m,female,sh){
  if(m.cancelled)return null;
  const gov=m.rel==="سرپرست"||m.rel==="پسر"||m.rel==="دختر"||m.rel==="فرزند"||(m.rel==="همسر"&&!female);
  return gov?{govt:sh.govt,emp:sh.emp}:{govt:0,emp:sh.govt+sh.emp};
}
function insFamilyTotals(d){
  const sh=insShares(),female=d.head&&d.head.sex==="زن";let g=0,e=0;
  let c=0;
  for(const m of d.members){const x=insMemberShare(m,female,sh);if(x){g+=x.govt;e+=x.emp;c+=m.premium||0}}
  return{govt:g,emp:e,total:g+e,contract:c};
}
function docInsDeps(p,d){ app.docCtx=p;
  const F="insDeps";
  const sh=insShares(),female=d.head&&d.head.sex==="زن",t=insFamilyTotals(d),h=d.head||{},c=d.counts,showSh=!!(sh.govt||sh.emp);
  const rows=d.members.map((m,i)=>{const x=insMemberShare(m,female,sh);return `<tr><td>${faId(i+1)}</td><td>${esc(m.rel)}</td><td>${esc(m.firstName)}</td><td>${esc(m.lastName)}</td><td>${esc(m.sex)}</td><td>${faId(esc(m.birthYear))}</td><td>${faId(esc(m.nid))}</td><td>${faId(esc(m.start))}</td><td>${faId(esc(m.end))}</td><td>${m.cancelled?"لغو شده"+(m.reason?" ("+esc(m.reason)+")":""):"فعال"}</td>${showSh?`<td>${x?fa(x.govt):"—"}</td><td>${x?fa(x.emp):"—"}</td>`:""}<td>${x&&m.premium?fa(m.premium):"—"}</td></tr>`}).join("");
  return `<div class="doc a4l">${dHead(ftx(F,"bismillah","بسمه تعالی"),"",todayJalali())}
    <h1 class="d-title">${ftx(F,"title","لیست افراد تحت تکفل — بیمهٔ تکمیلی درمان")}</h1>
    <div class="d-sec" style="display:flex;gap:18px;flex-wrap:wrap"><span>سرپرست: <b>${esc((h.firstName+" "+h.lastName).trim())}</b></span><span>کد پرسنلی: <b>${faId(esc(h.pcode||p.code))}</b></span><span>کد ملی: <b>${faId(esc(h.nid||""))}</b></span>${h.unit?`<span>واحد: <b>${esc(h.unit)}</b></span>`:""}${h.plan?`<span>طرح: <b>${esc(h.plan)}</b></span>`:""}<span>تعداد فعال: <b>${faId(c.active)}</b> از ${faId(c.total)}</span></div>
    <table class="d-tbl"><thead><tr><th>ردیف</th><th>نسبت</th><th>نام</th><th>نام خانوادگی</th><th>جنسیت</th><th>سال تولد</th><th>کد ملی</th><th>شروع پوشش</th><th>پایان پوشش</th><th>وضعیت</th>${showSh?"<th>سهم دولت</th><th>سهم کارمند</th>":""}<th>مبلغ محاسبه‌شدهٔ طول قرارداد</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><th colspan="10">جمع (افراد فعال)</th>${showSh?`<th>${fa(t.govt)}</th><th>${fa(t.emp)}</th>`:""}<th>${fa(t.contract)}</th></tr>${showSh?`<tr><th colspan="10">جمع سهم دولت و کارمند</th><th colspan="${showSh?3:1}">${fa(t.total)}</th></tr>`:""}</tfoot></table><div style="font-size:11px;margin-top:6px;line-height:1.8"><b>${ftx(F,"notes_h","توضیحات:")}</b><br>${ftx(F,"notes",insNotesDefault(),insNotesVars())}</div>${d.note?`<div style="font-size:12px;margin-top:8px;border:1px solid #999;padding:6px 8px;white-space:pre-wrap"><b>یادداشت:</b> ${esc(d.note)}</div>`:""}${dSigs(F,[],"margin-top:10px")}${dFoot()}</div>`;
}
function insPrint(d,p){printDoc("بیمه تکمیلی — "+pname(p),()=>docInsDeps(p,d),"insDeps",true,"a4l")}
async function insUpload(f){
  if(!f)return;const inp=$("#ins-file");
  try{
    $("#ins-up-msg").innerHTML='<span class="hint">در حال خواندن فایل…</span>';
    const rows=insParse(await readWorkbookRows(f));
    if(!rows.length)throw new Error("ردیفی در فایل نبود.");
    const {token}=await api("POST","/api/insurance/upload/begin",{});let done=0,r;   // توکن تصادفی از سرور (وصل به همین کاربر و نشست)
    for(let i=0;i<rows.length;i+=2500){
      const part=rows.slice(i,i+2500);
      r=await api("POST","/api/insurance/upload",{token,first:i===0,last:i+2500>=rows.length,fileName:f.name,rows:part});
      done+=part.length;$("#ins-up-msg").innerHTML=`<span class="hint">ارسال به سرور… ${faId(done)} از ${faId(rows.length)}</span>`;
    }
    showAlert(`فایل بیمه بارگذاری شد: ${faId(r.rows)} ردیف، ${faId(r.heads)} سرپرست، ${faId(r.cancelled)} نفر لغوشده.`);
    app.wk.ins=app.wk.ins||{};app.wk.ins.rep=null;await renderInsurance();
  }catch(e){const m=$("#ins-up-msg");if(m)m.innerHTML=`<span class="hint u-c-red-ink">${esc(e.message)}</span>`;showAlert(e.message)}
  if(inp)inp.value="";
}
async function insCodesFile(f){
  if(!f)return;
  try{const rows=await readWorkbookRows(f);const codes=rows.map(r=>toEnDigits(String(r&&r[0]!=null?r[0]:"")).trim()).filter(c=>/^\d+$/.test(c));
    $("#ins-codes").value=[...new Set(codes)].join("\n");app.wk.ins.lst.codes=$("#ins-codes").value;insCodeCount()}catch(e){showAlert(e.message)}
  $("#ins-codesfile").value="";
}
// توضیحات زیر جدول افراد تحت تکفل (صفحه و چاپ): متن پیش‌فرض با جای‌نگهدار {govt} {emp} {both}؛ با «ویرایش توضیحات» برای همهٔ افراد قابل تغییر است (form_settings.formTexts.insDeps.notes)
const insNotesDefault=()=>[
  `نسبت‌ها: سرپرست (بیمه‌شدهٔ اصلی)، همسر، فرزند (دختر/پسر)، پدر و مادر.`,
  `«فعال / لغو شده»: فردی که «علت پایان پوشش» دارد یا تاریخ پایان پوشش او برابر یا قبل از تاریخ شروع پوشش است «لغو شده» حساب می‌شود؛ لغوشده‌ها در جمع‌ها نمی‌آیند و سهمی ندارند.`,
  `سهم دولت و سهم کارمند (هر نفر، از «تنظیمات ← بیمه تکمیلی»: سهم دولت {govt} و سهم کارمند {emp} ریال): سرپرست، فرزند و همسرِ سرپرست مرد ← سهم دولت {govt} و سهم کارمند {emp}؛ پدر، مادر و همسرِ سرپرست زن (اناث) ← سهم دولت صفر و سهم کارمند = سهم دولت + سهم کارمند = {both}.`,
  `«مبلغ محاسبه‌شدهٔ طول قرارداد» همان «حق بیمه بیمه‌شده» ثبت‌شده در فایل بیمه برای همان نفر است (برای کل مدت قرارداد) و با دو ستون سهم که ماهانه/به‌ازای هر نفر از تنظیمات محاسبه می‌شوند فرق دارد.`,
  `در خروجی حسابداری، دسته‌ها چنین‌اند: تبعی اصلی = سرپرست، تبعی اول = فرزندان + همسرِ سرپرست مرد، تبعی دوم = پدر و مادر، تبعی سوم = همسرِ سرپرست زن.`
].map(x=>"• "+x).join("\n");
const insNotesVars=()=>{const sh=insShares();return{govt:fa(sh.govt),emp:fa(sh.emp),both:fa(sh.govt+sh.emp)}};
const insNotesSrc=()=>{const sv=(FS().formTexts||{}).insDeps;return sv&&typeof sv.notes==="string"&&sv.notes.trim()?sv.notes:insNotesDefault()};
const insNotesFill=src=>{const V=insNotesVars();return esc(src).replace(/\{(\w+)\}/g,(m,k)=>Object.prototype.hasOwnProperty.call(V,k)?`<b>${V[k]}</b>`:m).replace(/\n/g,"<br>")};
// یادداشت دلخواه برای هر سرپرست (روی سرور و با کد پرسنلی ذخیره می‌شود)
const insNoteBoxHTML=d=>d&&d.head?`<div class="u-mt12"><label class="f">توضیحات / یادداشت (یادآوری برای این فرد)<textarea id="ins-note" rows="3" maxlength="5000" class="u-w100p" placeholder="هر یادداشتی دربارهٔ بیمهٔ تکمیلی این فرد…">${esc(d.note||"")}</textarea></label><div class="wk-acts u-mt6"><button class="btn btn-main" data-act="ins-notesave" data-pc="${esc(d.head.pcode)}">ذخیرهٔ یادداشت</button><span class="hint" id="ins-notemsg"></span></div></div>`:"";
const insNotesBoxInner=edit=>edit
  ?`<b>توضیحات (قابل ویرایش؛ برای همهٔ افراد، صفحه و چاپ)</b><textarea id="ins-notes-ta" rows="9" maxlength="2000" class="u-w100p u-mt6">${esc(insNotesSrc())}</textarea><div class="hint u-m-4-0">هر سطر یک بند است. جای‌نگهدارها: {govt} = سهم دولت، {emp} = سهم کارمند، {both} = جمع دو سهم (با مبلغ‌های «تنظیمات ← بیمه تکمیلی» جایگزین می‌شوند).</div><div class="wk-acts"><button class="btn btn-main" data-act="ins-notes-save">ذخیرهٔ توضیحات</button><button class="btn" data-act="ins-notes-cancel">انصراف</button><button class="btn btn-del" data-act="ins-notes-reset">بازگشت به متن پیش‌فرض</button><span class="hint" id="ins-notes-msg"></span></div>`
  :`<div class="u-flex u-ai-center u-gap8"><b>توضیحات:</b><span class="u-f1"></span><button class="btn sm" data-act="ins-notes-edit">ویرایش توضیحات</button></div><div class="u-mt6 u-lh1-9">${insNotesFill(insNotesSrc())}</div>`;
const insNotesHTML=()=>`<div id="ins-notes-box" class="hint u-mt10">${insNotesBoxInner(false)}</div>`;
function insFamilyHTML(d,title){
  const h=d.head,c=d.counts,sh=insShares(),female=h&&h.sex==="زن",t=insFamilyTotals(d);
  const rows=d.members.map(x=>{const y=insMemberShare(x,female,sh);return `<tr${x.cancelled?' class="u-op60"':""}><td><span class="badge ${INS_REL_B[x.rel]||"b-blue"}">${esc(x.rel)}</span></td><td>${esc(x.firstName)}</td><td>${esc(x.lastName)}</td><td>${esc(x.sex)}</td><td>${faId(esc(x.birthYear))}</td><td>${faId(esc(x.nid))}</td><td>${faId(esc(x.start))}</td><td>${faId(esc(x.end))}</td><td>${x.cancelled?`<span class="badge b-red">لغو شده</span>${x.reason?` <small>${esc(x.reason)}</small>`:""}`:'<span class="badge b-green">فعال</span>'}</td><td class="money">${y?fa(y.govt):"—"}</td><td class="money">${y?fa(y.emp):"—"}</td><td class="money">${x.premium?fa(x.premium):"—"}</td></tr>`}).join("");
  return `<div class="card"><h2><svg class="i"><use href="#i-file"/></svg>${esc(title||"افراد تحت تکفل در بیمهٔ تکمیلی")} ${h?`<span class="badge b-blue">${esc((h.firstName+" "+h.lastName).trim())} — ${faId(esc(h.pcode))}</span>`:""}</h2>
    <div class="wk-sum"><span>تعداد کل: <b>${faId(c.total)}</b></span><span>فعال: <b>${faId(c.active)}</b></span><span>لغوشده: <b>${faId(c.cancelled)}</b></span><span>همسر: <b>${faId(c.spouse)}</b></span><span>فرزند: <b>${faId(c.children)}</b></span><span>پدر و مادر: <b>${faId(c.parents)}</b></span>${h&&h.unit?`<span>واحد: <b>${esc(h.unit)}</b></span>`:""}${h&&h.plan?`<span>طرح: <b>${esc(h.plan)}</b></span>`:""}${h&&h.policyNo?`<span>بیمه‌نامه: <b>${faId(esc(h.policyNo))}</b></span>`:""}</div>
    <div class="wk-sum u-mt10"><div class="big">جمع سهم دولت<b>${fa(t.govt)}</b></div><div class="big">جمع سهم کارمند<b>${fa(t.emp)}</b></div><div class="big">جمع سهم دولت و کارمند<b>${fa(t.total)}</b></div><div class="big">جمع مبلغ محاسبه‌شدهٔ طول قرارداد<b>${fa(t.contract)}</b></div></div>
    <div class="wk-acts u-m-8-0"><button class="btn btn-blue" data-act="ins-print"><svg class="i"><use href="#i-print"/></svg>چاپ</button>${insSharesNote()}</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>نسبت</th><th>نام</th><th>نام خانوادگی</th><th>جنسیت</th><th>سال تولد</th><th>کد ملی</th><th>شروع پوشش</th><th>پایان پوشش</th><th>وضعیت</th><th>سهم دولت</th><th>سهم کارمند</th><th>مبلغ محاسبه‌شدهٔ طول قرارداد</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><th colspan="9">جمع افراد فعال</th><th class="money">${fa(t.govt)}</th><th class="money">${fa(t.emp)}</th><th class="money">${fa(t.contract)}</th></tr></tfoot></table></div>${insNotesHTML()}${insNoteBoxHTML(d)}</div>`;
}
async function renderInsurance(){
  const root=$("#wk-insurance"),p=app.wk.person;app.wk.ins=app.wk.ins||{};
  let st=null;try{st=(await api("GET","/api/insurance/status")).file}catch(e){showAlert(e.message)}
  app.wk.ins.file=st;
  const fileBadge=st?`<span class="badge b-green">فایل: ${esc(st.name)} — ${faId(st.heads)} سرپرست / ${faId(st.rows)} نفر</span>`:`<span class="badge b-red">فایل بیمه بارگذاری نشده</span>`;
  if(wkTab("insurance")==="rep"){await renderInsRep(root,st);return}
  if(wkTab("insurance")==="rec"){renderInsRec(root,st);return}
  let body="";
  if(!st)body=emptyMsg('هنوز فایل بیمه بارگذاری نشده است؛ از تب «گزارش تجمیعی و خروجی» فایل را بارگذاری کنید.');
  else if(!p)body=emptyMsg("برای دیدن افراد تحت تکفل، یک نفر از پرسنل را انتخاب کنید (یا پایین‌تر در فایل بیمه جست‌وجو کنید).");
  else{
    try{
      const d=await api("GET","/api/insurance/by-person/"+enc(p.code));
      app.wk.ins.cur=d.found?d:null;
      body=d.found?`<div class="hint u-mb8">پیدا شد با ${esc(d.matchedBy)}.</div>`+insFamilyHTML(d):emptyMsg(`${esc(pname(p))} (کد ${faId(esc(p.code))}) در فایل بیمه به‌عنوان سرپرست پیدا نشد (جست‌وجو با کد پرسنلی و کد ملی).`);
    }catch(e){body=emptyMsg(esc(e.message))}
  }
  const fam=app.wk.ins.fam?insFamilyHTML(app.wk.ins.fam,"نتیجهٔ جست‌وجو در فایل بیمه"):"";
  const sres=app.wk.ins.sres||"";
  root.innerHTML=pageTabs("insurance")+pbar("insurance")+`<div class="hint u-m0b10">${fileBadge}</div>${body}
    <div class="card"><h2><svg class="i"><use href="#i-search"/></svg>جست‌وجو در کل فایل بیمه</h2>
      <div class="fgrid"><label class="f" style="grid-column:1/-1">کد پرسنلی، کد ملی یا نام (هر فرد بیمه‌شده، از جمله همسر و فرزندان)<input id="ins-q" placeholder="مثلاً 21006216 یا نام" autocomplete="off" value="${esc(app.wk.ins.q||"")}"></label></div>
      <div class="wk-acts"><button class="btn btn-main" data-act="ins-search">جست‌وجو</button></div><div id="ins-sres" class="u-mt10">${sres}</div></div>${fam}`;
  bindPbar("insurance",root);
}
async function renderInsRep(root,st){
  const I=app.wk.ins,R=(I.rep=I.rep||{scope:"district",cancelled:0,page:1,size:50}),LS=(I.lst=I.lst||{codes:"",page:1,size:50});
  if(R.scope==="list")R.scope="district";
  root.innerHTML=pageTabs("insurance")+`<div class="card"><h2><svg class="i"><use href="#i-upload"/></svg>فایل لیست بیمه</h2>
    <div class="hint u-mb8">${st?`فایل فعلی: <b>${esc(st.name)}</b> — ${faId(st.rows)} نفر، ${faId(st.heads)} سرپرست، ${faId(st.cancelled)} لغوشده — بارگذاری: ${faId(esc(String(st.uploadedAt||"").replace("T"," ").slice(0,16)))} (${esc(st.uploadedBy||"")})`:"هنوز فایلی بارگذاری نشده."}</div>
    <div class="wk-acts"><label class="btn btn-main u-pointer">انتخاب و بارگذاری فایل بیمه (xlsx)<input type="file" id="ins-file" accept=".xlsx,.xls" hidden></label></div>
    <div id="ins-up-msg" class="u-mt8"></div>
    <p class="hint u-m-8-0-0">فایل جدید جایگزین فایل قبلی می‌شود. ستون‌ها بر اساس عنوان پیدا می‌شوند (کد بیمه شده اصلی، کد پرسنلی، نام، نام خانوادگی، نسبت، جنسیت، کد ملی، تاریخ شروع/پایان پوشش، علت پایان پوشش، …).</p></div>
    ${st?`<div class="card"><h2><svg class="i"><use href="#i-dash"/></svg>تنظیمات محاسبه (برای هر دو گزارش پایین)</h2>
      <div class="fgrid">
        <label class="f u-frow u-ai-center u-gap6"><input type="checkbox" id="ins-canc"${R.cancelled?" checked":""}> افراد لغوشده هم شمرده شوند</label>
      </div><div class="u-mt8">${insSharesNote()}</div></div>
    <div class="card"><h2><svg class="i"><use href="#i-dash"/></svg>گزارش تجمیعی افراد تحت تکفل</h2>
      <div class="fgrid"><label class="f">سرپرستان<select id="ins-scope"><option value="district"${R.scope==="district"?" selected":""}>فقط پرسنل ناحیه (موجود در این برنامه)</option><option value="all"${R.scope==="all"?" selected":""}>همهٔ سرپرستان فایل بیمه</option></select></label></div>
      <div class="wk-acts u-mt10"><button class="btn btn-main" data-act="ins-rep">نمایش گزارش</button><button class="btn btn-blue" data-act="ins-xlsx">خروجی اکسل (تجمیعی + جزئیات)</button></div>
      <div id="ins-repbody" class="u-mt12"></div></div>
    <div class="card"><h2><svg class="i"><use href="#i-list"/></svg>گزارش و خروجی فقط برای سرپرستان مشخص</h2>
      <p class="hint u-m0b8">کد پرسنلی یا کد ملی تعدادی سرپرست را بچسبانید (هر خط یکی) یا از فایل اکسل/متن بارگذاری کنید (ستون اول). خروجی اکسل فقط برای همین افراد ساخته می‌شود.</p>
      <div class="wk-acts u-mb8"><label class="btn u-pointer">بارگذاری فایل کدها (xlsx / csv / txt)<input type="file" id="ins-codesfile" accept=".xlsx,.xls,.csv,.txt" hidden></label><span class="hint" id="ins-codecount"></span></div>
      <textarea id="ins-codes" rows="5" class="ltr u-w100p" placeholder="21006216&#10;0000000000&#10;…">${esc(LS.codes||"")}</textarea>
      <div class="wk-acts u-mt10"><button class="btn btn-main" data-act="ins-lrep">نمایش گزارش</button><button class="btn btn-blue" data-act="ins-lxlsx">خروجی اکسل فقط برای این افراد</button></div>
      <div id="ins-lstbody" class="u-mt12"></div></div>`:""}`;
  if(st){insCodeCount();if(R.loaded)insRepLoad("rep");if(LS.loaded)insRepLoad("lst")}
}
function insCodeList(txt){return [...new Set(String(txt||"").split(/[\s,;،]+/).map(c=>toEnDigits(c).trim()).filter(c=>/^\d+$/.test(c)))]}
function insCodeCount(){const t=$("#ins-codes"),el=$("#ins-codecount");if(t&&el){const n=insCodeList(t.value).length;el.textContent=n?`${faId(n)} کد شناسایی شد`:""}}
function insRepRead(){
  const I=app.wk.ins,R=I.rep;if(!R||!$("#ins-canc"))return;
  R.cancelled=$("#ins-canc").checked?1:0;if($("#ins-scope"))R.scope=$("#ins-scope").value;
  if($("#ins-codes")){I.lst.codes=$("#ins-codes").value;insCodeCount()}
}
const insQs=(R,which)=>{const sh=insShares();return (which==="lst"?"scope=list":`scope=${enc(R.scope)}`)+`&cancelled=${R.cancelled?1:0}&govt=${sh.govt||0}&emp=${sh.emp||0}`+(which==="lst"?`&codes=${enc(insCodeList(app.wk.ins.lst.codes).join(","))}`:"")};
async function insRepLoad(which){
  which=which||"rep";const I=app.wk.ins,R=I[which],base=I.rep,body=$(which==="lst"?"#ins-lstbody":"#ins-repbody"),key=which==="lst"?"insl":"ins";if(!R||!body)return;
  if(which==="lst"&&!insCodeList(R.codes).length){body.innerHTML='<div class="hint">ابتدا کدها را وارد یا بارگذاری کنید.</div>';return}
  body.innerHTML='<div class="hint">در حال محاسبه…</div>';
  let r;try{r=await api("GET","/api/insurance/report?"+insQs(base,which)+`&page=${R.page||1}&pageSize=${R.size||50}`)}catch(e){body.innerHTML=`<div class="hint u-c-red-ink" role="alert">${esc(e.message)}</div>`;return}
  if(r.total&&r.page>r.pages){R.page=r.pages;return insRepLoad(which)}
  R.meta=r;R.loaded=true;const t=r.totals,money=!!(r.govt||r.emp);
  const notes=[];
  if(r.scope==="district")notes.push(`سرپرستان پیداشده در فایل بیمه از میان ${faId(r.districtPersonnel)} نفر پرسنل برنامه: ${faId(t.heads)}`);
  if(r.skipped.length)notes.push(`سرپرستانی که همهٔ افرادشان لغو شده و در گزارش نیامده‌اند (${faId(r.skipped.length)}): ${esc(r.skipped.slice(0,15).join("، "))}${r.skipped.length>15?" …":""}`);
  if(r.notFound.length)notes.push(`کدهای پیدا‌نشده در فایل بیمه (${faId(r.notFound.length)}): ${esc(r.notFound.slice(0,30).join("، "))}${r.notFound.length>30?" …":""}`);
  body.innerHTML=r.total?`<div class="wk-sum"><div>تعداد سرپرست<b>${faId(t.heads)}</b></div><div>تعداد کل افراد<b>${faId(t.total)}</b></div><div>همسر<b>${faId(t.spouse)}</b></div><div>همسر اناث<b>${faId(t.spouseF)}</b></div><div>فرزند<b>${faId(t.child)}</b></div><div>پدر و مادر<b>${faId(t.parents)}</b></div>${money?`<div class="big">سهم دولت<b>${fa(t.govt)}</b></div><div class="big">سهم کارمند<b>${fa(t.emp)}</b></div><div class="big">حق بیمه<b>${fa(t.premium)}</b></div>`:""}</div>
    ${pagerHTML(key,R.meta)}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>کد ملی</th><th>نام</th><th>نام خانوادگی</th><th>اصلی</th><th>فرزند</th><th>پدر و مادر</th><th>همسر</th><th>همسر اناث</th><th>کل</th>${money?"<th>سهم دولت</th><th>سهم کارمند</th><th>حق بیمه</th>":""}<th>شروع</th><th>پایان</th></tr></thead><tbody>
    ${r.items.map(x=>`<tr><td>${faId(esc(x.pcode))}</td><td>${faId(esc(x.nid))}</td><td>${esc(x.firstName)}</td><td>${esc(x.lastName)}</td><td>${faId(x.main)}</td><td>${faId(x.child)}</td><td>${faId(x.parents)}</td><td>${faId(x.spouse)}</td><td>${faId(x.spouseF)}</td><td><b>${faId(x.total)}</b></td>${money?`<td class="money">${fa(x.govt)}</td><td class="money">${fa(x.emp)}</td><td class="money">${fa(x.premium)}</td>`:""}<td>${faId(esc(x.start))}</td><td>${faId(esc(x.end))}</td></tr>`).join("")}</tbody></table></div>${pagerHTML(key,R.meta)}
    ${notes.length?`<ul class="hint u-m-8-18-0">${notes.map(n=>`<li>${n}</li>`).join("")}</ul>`:""}`:`<div class="hint">سرپرستی با این شرایط پیدا نشد.${notes.length?"<br>"+notes.join("<br>"):""}</div>`;
}
async function insExport(which){
  which=which||"rep";insRepRead();const I=app.wk.ins;
  if(which==="lst"&&!insCodeList(I.lst.codes).length){showAlert("ابتدا کد پرسنلی یا کد ملی سرپرستان را وارد یا بارگذاری کنید.");return}
  const r=await api("GET","/api/insurance/report?"+insQs(I.rep,which)+"&all=1&detail=1");
  if(!r.items.length){showAlert("سرپرستی برای خروجی پیدا نشد."+(r.notFound.length?"\nکدهای پیدا‌نشده: "+r.notFound.slice(0,20).join("، "):""));return}
  await ensureXLSX();
  const P="'پارامترها'!",govt=r.govt,emp=r.emp;
  const H1=["کد پرسنلی","کد ملی سرپرست","نام","نام خانوادگی","اصلی","تعداد فرزند","تعداد پدر و مادر","همسر","همسر اناث","تعداد کل","سهم دولت","سهم کارمند","حق بیمه","شروع پوشش","پایان پوشش","جنسیت"];
  const aoa=[H1].concat(r.items.map(x=>[String(x.pcode),String(x.nid),x.firstName,x.lastName,x.main,x.child,x.parents,x.spouse,x.spouseF,x.total,x.govt,x.emp,x.premium,x.start,x.end,x.sex]));
  const n=r.items.length,t=r.totals;
  aoa.push(["","","","جمع کل",t.main,t.child,t.parents,t.spouse,t.spouseF,t.total,t.govt,t.emp,t.premium,"","",""]);
  const ws=XLSX.utils.aoa_to_sheet(aoa),L=i=>XLSX.utils.encode_col(i);
  // فرمول‌ها مثل ابزار پایتون؛ با تغییر مبلغ‌ها در برگهٔ «پارامترها» خودکار به‌روز می‌شوند
  for(let i=0;i<n;i++){const rr=i+2;
    ws["J"+rr]={t:"n",v:r.items[i].total,f:`SUM(E${rr}:I${rr})`};
    ws["K"+rr]={t:"n",v:r.items[i].govt,f:`(E${rr}+F${rr}+H${rr})*${P}$B$2`};
    ws["L"+rr]={t:"n",v:r.items[i].emp,f:`(E${rr}+F${rr}+H${rr})*${P}$B$3+(G${rr}+I${rr})*${P}$B$4`};
    ws["M"+rr]={t:"n",v:r.items[i].premium,f:`K${rr}+L${rr}`};
  }
  const tr=n+2,tv={E:t.main,F:t.child,G:t.parents,H:t.spouse,I:t.spouseF,J:t.total,K:t.govt,L:t.emp,M:t.premium};
  for(const c in tv)ws[c+tr]={t:"n",v:tv[c],f:`SUM(${c}2:${c}${n+1})`};
  ws["!cols"]=[14,16,16,18,8,12,16,8,12,12,16,16,16,14,14,10].map(w=>({wch:w}));ws["!autofilter"]={ref:`A1:P${n+1}`};
  const H2=["کد پرسنلی سرپرست","کد ملی سرپرست","نام سرپرست","نام خانوادگی سرپرست","نام","نام خانوادگی","نسبت","جنسیت","کد ملی","شروع پوشش","پایان پوشش","وضعیت","علت پایان پوشش"];
  const ws2=XLSX.utils.aoa_to_sheet([H2].concat(r.detail.map(d=>d.map((v,i)=>(i===0||i===1||i===8)?String(v):v))));
  ws2["!cols"]=[16,16,14,18,14,18,10,8,14,12,12,10,24].map(w=>({wch:w}));ws2["!autofilter"]={ref:`A1:M${r.detail.length+1}`};
  const wsp=XLSX.utils.aoa_to_sheet([["پارامتر","مبلغ"],["سهم دولت (هر نفر)",govt],["سهم کارمند (هر نفر)",emp],["حق بیمه کل (هر نفر)",govt+emp]]);
  wsp.B4={t:"n",v:govt+emp,f:"B2+B3"};wsp["!cols"]=[{wch:28},{wch:18}];
  const notes=["• ستون «اصلی» = خود سرپرست (۱).","• «تعداد فرزند» = مجموع دختر و پسر.","• «همسر» = همسر سرپرست مرد؛ «همسر اناث» = همسر سرپرست زن (در هر ردیف فقط یکی از این دو مقدار می‌گیرد).","• «تعداد کل» = اصلی + فرزند + پدر و مادر + همسر + همسر اناث.",
    "• افراد لغوشده (دارای «علت پایان پوشش» یا پایان پوشش برابر/قبل از شروع پوشش) "+(r.includeCancelled?"در شمارش و فهرست جزئیات لحاظ شده‌اند (با وضعیت «لغو شده»).":"نه در شمارش آمده‌اند و نه در شیت جزئیات."),
    "• سهم دولت = (اصلی + فرزند + همسر) × سهم دولت هر نفر. برای همسر اناث و پدر و مادر سهم دولت تعلق نمی‌گیرد.","• سهم کارمند = (اصلی + فرزند + همسر) × سهم کارمند هر نفر + (همسر اناث + پدر و مادر) × (سهم دولت + سهم کارمند هر نفر).",
    "• حق بیمه = سهم دولت + سهم کارمند. مبلغ‌های هر نفر در شیت «پارامترها» قابل تغییرند و ستون‌ها خودکار به‌روز می‌شوند."];
  if(r.skipped.length)notes.push(`• سرپرستانی که همهٔ افرادشان لغو شده بود و در تجمیعی نیامده‌اند (${r.skipped.length} نفر): `+r.skipped.join("، "));
  if(r.notFound.length)notes.push("• کدهای پیدا‌نشده (به‌عنوان سرپرست) در فایل بیمه: "+r.notFound.join("، "));
  const ws3=XLSX.utils.aoa_to_sheet(notes.map(x=>[x]));ws3["!cols"]=[{wch:120}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"تجمیعی");XLSX.utils.book_append_sheet(wb,ws2,"جزئیات");XLSX.utils.book_append_sheet(wb,wsp,"پارامترها");XLSX.utils.book_append_sheet(wb,ws3,"توضیحات");
  wb.Workbook={Views:[{RTL:true}]};
  XLSX.writeFile(wb,`insurance${which==="lst"?"-selected":""}-${todayJalali().replace(/\//g,"")}.xlsx`);
}

/* ---------- مغایرت‌گیری با «خروجی حسابداری» (فایل ماهانهٔ حسابداری با ستون‌های تعداد تبعی/سهم کارمند/سهم کارفرما) ---------- */
const INS_ACC={month:h=>h==="ماه",year:h=>h==="سال",region:h=>h==="منطقهخدمت",pcode:h=>h==="کدپرسنلی",nid:h=>h==="کدملی",fname:h=>h==="نام",lname:h=>h==="نامخانوادگی",main:h=>h==="تعدادتبعیاصلی",first:h=>h==="تعدادتبعیاول",second:h=>h==="تعدادتبعیدوم",third:h=>h==="تعدادتبعیسوم",other:h=>h==="تعدادتبعیدیگر",emp:h=>h==="سهمکارمند",empArrears:h=>h==="سهمکارمندمعوقه",employer:h=>h==="سهمکارفرما",employerArrears:h=>h==="معوقهسهمکارفرما",total:h=>h==="جمعکل",treasury:h=>h==="کدخزانه",lastYear:h=>h==="معوقهبیمهتکمیلیدرمانیسالگذشته"};
const INS_ACC_REQ=[["pcode","کد پرسنلی"],["main","تعداد تبعی اصلی"],["first","تعداد تبعی اول"],["second","تعداد تبعی دوم"],["third","تعداد تبعی سوم"],["emp","سهم کارمند"],["employer","سهم کارفرما"]];
const INS_ST={ok:["مطابق","b-green"],diff:["مغایرت","b-red"],onlyAcc:["فقط در حسابداری","b-amber"],dup:["تکراری","b-red"]};
function insAccParse(rows){
  if(!rows.length)throw new Error("فایل خالی است.");
  const hdr=rows[0].map(insNH),col={};
  for(const k in INS_ACC){const i=hdr.findIndex(INS_ACC[k]);if(i>=0)col[k]=i}
  const miss=INS_ACC_REQ.filter(([k])=>col[k]==null).map(x=>x[1]);
  if(miss.length)throw new Error("ستون موردنیاز در فایل حسابداری پیدا نشد: "+miss.join("، "));
  const out=[];
  for(let r=1;r<rows.length;r++){const row=rows[r];if(!row||!row.some(x=>x!==""&&x!=null))continue;const o={};for(const k in col)o[k]=row[col[k]];out.push(o)}
  return out;
}
function renderInsRec(root,st){
  const I=app.wk.ins,R=I.rec;
  root.innerHTML=pageTabs("insurance")+(!st?emptyMsg("ابتدا فایل بیمه را در تب «گزارش تجمیعی و خروجی» بارگذاری کنید."):`<div class="card"><h2><svg class="i"><use href="#i-upload"/></svg>مغایرت‌گیری با خروجی حسابداری</h2>
    <p class="hint u-m0b8">فایل ماهانهٔ حسابداری (ستون‌های تعداد تبعی اصلی/اول/دوم/سوم/دیگر، سهم کارمند، سهم کارفرما، …) را بارگذاری کنید. برای هر سرپرست، تعداد افراد (فعال) از روی فایل بیمه شمرده و با حسابداری مقایسه می‌شود: تبعی اصلی = سرپرست، اول = فرزندان + همسرِ سرپرست مرد، دوم = پدر و مادر، سوم = همسرِ سرپرست زن. <b>فقط نفرات مقایسه می‌شوند؛ مبلغ‌ها (سهم کارمند، سهم کارفرما، معوقه‌ها) مقایسه نمی‌شوند.</b></p>
    <div class="fgrid"><label class="f">فهرست «فقط در فایل بیمه» برای<select id="insr-scope"><option value="district"${!R||R.scope==="district"?" selected":""}>پرسنل ناحیه (موجود در این برنامه)</option><option value="all"${R&&R.scope==="all"?" selected":""}>همهٔ سرپرستان فایل بیمه</option></select></label></div>
    <div class="wk-acts u-mt8"><label class="btn btn-main u-pointer">انتخاب و بارگذاری فایل حسابداری (xlsx)<input type="file" id="insr-file" accept=".xlsx,.xls" hidden></label></div>
    <div id="insr-msg" class="u-mt8"></div></div><div id="insr-body"></div>`);
  if(st&&R&&R.res)insRecShow();
}
async function insRecUpload(f){
  if(!f)return;const I=app.wk.ins,msg=$("#insr-msg");
  try{
    if(msg)msg.innerHTML='<span class="hint">در حال خواندن و مقایسه…</span>';
    const rows=insAccParse(await readWorkbookRows(f)),scope=$("#insr-scope")?$("#insr-scope").value:"district";
    const res=await api("POST","/api/insurance/reconcile",{rows,scope});
    I.rec={res,fileName:f.name,scope,filter:"diff",q:"",page:1,size:50};
    if(msg)msg.innerHTML=`<span class="hint">فایل «${esc(f.name)}» — ${faId(res.period.region||"")} ${esc(res.period.month||"")} ${faId(res.period.year||"")} — ${faId(rows.length)} ردیف</span>`;
    insRecShow();
  }catch(e){if(msg)msg.innerHTML=`<span class="hint u-c-red-ink">${esc(e.message)}</span>`;showAlert(e.message)}
  const inp=$("#insr-file");if(inp)inp.value="";
}
function insRecFilter(){
  const R=app.wk.ins.rec;if(!R||!R.res)return;
  const f=$("#insr-filter"),q=$("#insr-q");if(f)R.filter=f.value;if(q)R.q=q.value;R.page=1;
  const sc=$("#insr-scope");if(sc&&sc.value!==R.scope){insRecUploadAgain(sc.value);return}
  insRecShow();
}
async function insRecUploadAgain(){showAlert("برای تغییر محدودهٔ «فقط در فایل بیمه»، فایل حسابداری را دوباره بارگذاری کنید.")}
const insRecRows=R=>{
  const q=insNH(toEnDigits(R.q||"")),F=R.filter;
  return R.res.rows.filter(x=>(F==="all"||(F==="ok"?x.status==="ok":F==="onlyAcc"?x.status==="onlyAcc":x.status!=="ok"))&&(!q||insNH(x.pcode+x.nid+x.firstName+x.lastName).includes(q)));
};
function insRecShow(){
  const R=app.wk.ins.rec,body=$("#insr-body");if(!R||!R.res||!body)return;
  const r=R.res,s=r.stat,rows=insRecRows(R);
  const total=rows.length,size=R.size||50,pages=Math.max(1,Math.ceil(total/size));if(R.page>pages)R.page=pages;
  R.meta={total,page:R.page,pageSize:size,pages};
  const part=rows.slice((R.page-1)*size,R.page*size),P=s.persons,dif=P.acc-P.ins;
  const cnt=x=>`${x.main}/${x.first}/${x.second}/${x.third}${x.other?"/"+x.other:""}`;
  body.innerHTML=`<div class="card"><h2><svg class="i"><use href="#i-dash"/></svg>نتیجهٔ مغایرت‌گیری</h2>
    <div class="wk-sum"><div>ردیف حسابداری<b>${faId(s.accRows)}</b></div><div>مطابق<b class="u-c-green-ink">${faId(s.ok)}</b></div><div>مغایرت<b class="u-c-red-ink">${faId(s.diff)}</b></div><div>فقط در حسابداری<b>${faId(s.onlyAcc)}</b></div><div>فقط در فایل بیمه<b>${faId(s.onlyIns)}</b></div>${s.dup?`<div>تکراری<b>${faId(s.dup)}</b></div>`:""}<div class="big">جمع نفرات — حسابداری<b>${fa(P.acc)}</b></div><div class="big">جمع نفرات — فایل بیمه<b>${fa(P.ins)}</b></div><div class="big">اختلاف نفرات<b style="color:${dif?"var(--red-ink)":"inherit"}">${faId(dif)}</b></div></div>
    <div class="fgrid u-mt10"><label class="f">نمایش<select id="insr-filter">${[["diff","فقط مغایرت‌ها (شامل فقط در حسابداری)"],["all","همه"],["ok","فقط مطابق‌ها"],["onlyAcc","فقط «در حسابداری هست و در بیمه نیست»"]].map(([v,t])=>`<option value="${v}"${R.filter===v?" selected":""}>${t}</option>`).join("")}</select></label><label class="f">جست‌وجو (کد / نام)<input id="insr-q" value="${esc(R.q||"")}" autocomplete="off"></label></div>
    <div class="wk-acts u-m-8-0"><button class="btn btn-blue" data-act="insr-xlsx">خروجی اکسل مغایرت‌گیری</button><span class="hint">تعداد‌ها به ترتیب: اصلی / اول / دوم / سوم (/ دیگر)</span></div>
    ${pagerHTML("insr",R.meta)}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>کد ملی</th><th>نام و نام خانوادگی</th><th>وضعیت</th><th>تعداد — حسابداری</th><th>تعداد — بیمه</th><th>توضیح مغایرت</th></tr></thead><tbody>
    ${part.map(x=>{const st=INS_ST[x.status]||["","b-blue"];return `<tr><td>${faId(esc(x.pcode))}</td><td>${faId(esc(x.nid))}</td><td>${esc((x.firstName+" "+x.lastName).trim())}</td><td><span class="badge ${st[1]}">${st[0]}</span></td><td>${cnt(x.acc)}</td><td>${x.exp?cnt(x.exp):"—"}</td><td class="u-fs12">${x.reasons.map(esc).join("<br>")}</td></tr>`}).join("")||'<tr><td colspan="7" class="hint">موردی با این فیلتر نیست.</td></tr>'}</tbody></table></div>${pagerHTML("insr",R.meta)}</div>
    ${r.onlyIns.length?`<div class="card"><h2><svg class="i"><use href="#i-list"/></svg>فقط در فایل بیمه (در فایل حسابداری نیامده) — ${faId(r.onlyIns.length)} سرپرست</h2><div class="hint u-mb6">جمع نفرات: <b>${faId(P.onlyIns)}</b></div><div class="tbl-wrap u-maxh340 u-ovf-auto"><table class="tbl"><thead><tr><th>کد پرسنلی</th><th>کد ملی</th><th>نام و نام خانوادگی</th><th>تعداد افراد (اصلی/اول/دوم/سوم)</th></tr></thead><tbody>${r.onlyIns.map(x=>`<tr><td>${faId(esc(x.pcode))}</td><td>${faId(esc(x.nid))}</td><td>${esc((x.firstName+" "+x.lastName).trim())}</td><td>${cnt(x.exp)}</td></tr>`).join("")}</tbody></table></div></div>`:""}`;
}
async function insRecExport(){
  const R=app.wk.ins.rec;if(!R||!R.res){showAlert("ابتدا فایل حسابداری را بارگذاری کنید.");return}
  await ensureXLSX();
  const r=R.res,s=r.stat,P=s.persons,S=x=>(INS_ST[x]||[x])[0];
  const H=["کد پرسنلی","کد ملی","نام","نام خانوادگی","منطقه","ماه","سال","حسابداری: تبعی اصلی","حسابداری: تبعی اول","حسابداری: تبعی دوم","حسابداری: تبعی سوم","حسابداری: تبعی دیگر","حسابداری: جمع نفرات","بیمه: تبعی اصلی","بیمه: تبعی اول","بیمه: تبعی دوم","بیمه: تبعی سوم","بیمه: تبعی دیگر","بیمه: جمع نفرات","اختلاف نفرات","وضعیت","توضیح مغایرت"];
  const tot=o=>o?o.main+o.first+o.second+o.third+o.other:"";
  const row=x=>{const e=x.exp,a=x.acc;return [String(x.pcode),String(x.nid),x.firstName,x.lastName,x.region,x.month,x.year,a.main,a.first,a.second,a.third,a.other,tot(a),e?e.main:"",e?e.first:"",e?e.second:"",e?e.third:"",e?e.other:"",tot(e),e?tot(a)-tot(e):"",S(x.status),x.reasons.join(" | ")]};
  const widths=[12,14,14,16,14,8,8,10,10,10,10,10,12,10,10,10,10,10,12,12,16,60].map(w=>({wch:w}));
  const mk=rows=>{const ws=XLSX.utils.aoa_to_sheet([H].concat(rows.map(row)));ws["!cols"]=widths;ws["!autofilter"]={ref:`A1:${XLSX.utils.encode_col(H.length-1)}${rows.length+1}`};return ws};
  const sum=[["شرح","مقدار"],["فایل حسابداری",R.fileName||""],["دوره",`${r.period.month||""} ${r.period.year||""} — ${r.period.region||""}`],["تعداد ردیف حسابداری",s.accRows],["مطابق",s.ok],["مغایرت",s.diff],["  مغایرت تبعی اصلی",s.catDiff.main],["  مغایرت تبعی اول",s.catDiff.first],["  مغایرت تبعی دوم",s.catDiff.second],["  مغایرت تبعی سوم",s.catDiff.third],["  مغایرت تبعی دیگر",s.catDiff.other],["  مغایرت کد ملی",s.nidDiff],["فقط در حسابداری (سرپرست در بیمه نیست/همه لغو)",s.onlyAcc],["تکراری در فایل حسابداری",s.dup],["فقط در فایل بیمه ("+(r.scope==="all"?"همهٔ سرپرستان":"پرسنل ناحیه")+")",s.onlyIns],["جمع نفرات — حسابداری",P.acc],["جمع نفرات — فایل بیمه",P.ins],["اختلاف نفرات",P.acc-P.ins],["جمع نفرات «فقط در فایل بیمه»",P.onlyIns],[],["فقط نفرات مقایسه می‌شوند (مبلغ‌ها مقایسه نمی‌شوند). تطبیق دسته‌ها: اصلی = سرپرست؛ اول = فرزندان + همسرِ سرپرست مرد؛ دوم = پدر و مادر؛ سوم = همسرِ سرپرست زن؛ دیگر = سایر نسبت‌ها. فقط افراد «فعال» فایل بیمه شمرده می‌شوند."]];
  const wsS=XLSX.utils.aoa_to_sheet(sum);wsS["!cols"]=[{wch:48},{wch:30}];
  const HI=["کد پرسنلی","کد ملی","نام","نام خانوادگی","تبعی اصلی","تبعی اول","تبعی دوم","تبعی سوم","تبعی دیگر","جمع نفرات"];
  const wsI=XLSX.utils.aoa_to_sheet([HI].concat(r.onlyIns.map(x=>[String(x.pcode),String(x.nid),x.firstName,x.lastName,x.exp.main,x.exp.first,x.exp.second,x.exp.third,x.exp.other,tot(x.exp)])));wsI["!cols"]=[12,14,14,16,10,10,10,10,10,12].map(w=>({wch:w}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,wsS,"خلاصه");
  XLSX.utils.book_append_sheet(wb,mk(r.rows.filter(x=>x.status!=="ok")),"مغایرت‌ها");
  XLSX.utils.book_append_sheet(wb,mk(r.rows),"تطبیق کامل");
  XLSX.utils.book_append_sheet(wb,wsI,"فقط در فایل بیمه");
  wb.Workbook={Views:[{RTL:true}]};
  XLSX.writeFile(wb,`insurance-reconcile-${todayJalali().replace(/\//g,"")}.xlsx`);
}
async function insAction(b){
  const act=b.dataset.act,ins=(app.wk.ins=app.wk.ins||{});
  if(act==="ins-search"){
    const q=($("#ins-q")||{}).value||"";ins.q=q;const box=$("#ins-sres");if(!box)return;
    try{
      const r=await api("GET","/api/insurance/search?q="+enc(q));
      ins.sres=r.items.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>فرد</th><th>نسبت</th><th>کد ملی</th><th>سرپرست</th><th>کد پرسنلی سرپرست</th><th></th></tr></thead><tbody>${r.items.map(x=>`<tr><td>${esc(x.member)}</td><td>${esc(x.rel)}</td><td>${faId(esc(x.nid))}</td><td>${esc(x.head)}</td><td>${faId(esc(x.headPcode))}</td><td><button class="btn" data-act="ins-fam" data-main="${esc(x.mainId)}">نمایش خانواده</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="hint">${q.trim().length<2?"حداقل دو نویسه وارد کنید.":"موردی پیدا نشد."}</div>`;
      box.innerHTML=ins.sres;
    }catch(e){showAlert(e.message)}
    return;
  }
  if(act==="ins-fam"){try{const d=await api("GET","/api/insurance/family/"+enc(b.dataset.main));ins.fam=d.found?d:null;await renderInsurance();const c=$("#wk-insurance .card:last-child");if(c)c.scrollIntoView({behavior:window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"})}catch(e){showAlert(e.message)}return}
  if(act==="insr-xlsx"){try{await insRecExport()}catch(e){showAlert(e.message)}return}
  if(act==="ins-rep"){insRepRead();ins.rep.page=1;await insRepLoad("rep");return}
  if(act==="ins-xlsx"){try{await insExport("rep")}catch(e){showAlert(e.message)}return}
  if(act==="ins-lrep"){insRepRead();ins.lst.page=1;await insRepLoad("lst");return}
  if(act==="ins-lxlsx"){try{await insExport("lst")}catch(e){showAlert(e.message)}return}
  if(act==="ins-notesave"){
    const ta=$("#ins-note");if(!ta)return;
    try{const r=await api("PUT","/api/insurance/note/"+enc(b.dataset.pc),{note:ta.value});if(ins.cur)ins.cur.note=r.note;if(ins.fam)ins.fam.note=ins.fam.head&&ins.fam.head.pcode===b.dataset.pc?r.note:ins.fam.note;const m=$("#ins-notemsg");if(m)m.textContent=r.note?"ذخیره شد.":"یادداشت پاک شد."}catch(e){showAlert(e.message)}
    return;
  }
  if(act==="ins-notes-edit"||act==="ins-notes-cancel"){const bx=$("#ins-notes-box");if(bx)bx.innerHTML=insNotesBoxInner(act==="ins-notes-edit");return}
  if(act==="ins-notes-save"||act==="ins-notes-reset"){
    try{
      const ta=$("#ins-notes-ta"),text=act==="ins-notes-reset"?"":String((ta&&ta.value)||"").trim();
      const r=await api("PUT","/api/insurance/notes-text",{text:text===insNotesDefault().trim()?"":text});
      app.fs=Object.assign({},app.fs,{formTexts:r.formTexts});
      const bx=$("#ins-notes-box");if(bx)bx.innerHTML=insNotesBoxInner(false);
      showAlert(act==="ins-notes-reset"?"توضیحات به متن پیش‌فرض برگشت.":"توضیحات ذخیره شد؛ در صفحه و چاپ برای همهٔ افراد اعمال می‌شود.");
    }catch(e){showAlert(e.message)}
    return;
  }
  if(act==="ins-print"){if(ins.cur&&app.wk.person)insPrint(ins.cur,app.wk.person);else showAlert("فردی انتخاب نشده یا در فایل بیمه پیدا نشده است.");return}
}
