"use strict";
/* print/form-designer.js — چیدمان آزاد و طراح فرم‌ها
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("print/form-designer");
/* ---------- چیدمان آزاد ---------- */
// شناسه‌گذاری بخش‌های فرم (فرزندان مستقیم .doc)، شبکه‌های فیلد (.d-fg) و فیلدها (.d-fl)
function lyAssign(doc){
  const seen={},uniq=b=>{seen[b]=(seen[b]||0)+1;return seen[b]>1?b+"#"+seen[b]:b};
  [...doc.children].forEach(c=>{const sl=c.querySelector("[data-slot]");c.dataset.lid=uniq(sl?"s:"+sl.getAttribute("data-slot"):"c:"+String(c.className||c.tagName).split(" ")[0])});
  doc.querySelectorAll(".d-fg").forEach((g,i)=>{g.dataset.gid="g"+i});
  doc.querySelectorAll(".d-fl").forEach(f=>{const sm=f.querySelector("small");f.dataset.lid=uniq("f:"+(sm?sm.textContent.trim():"?"))});
}
const LY_FF={vazir:'Vazirmatn,Tahoma,sans-serif',tahoma:'Tahoma,sans-serif',arial:'Arial,Helvetica,sans-serif',times:'"Times New Roman",serif',mono:'Consolas,"Courier New",monospace'};
const LY_ST_PROPS=["fontFamily","fontStyle","textDecoration","letterSpacing","filter","position","left","top","width","height","zIndex","opacity","transform","color","lineHeight","margin","pageBreakBefore","border","borderStyle","borderWidth","borderColor","borderRadius","background","padding","marginTop","marginBottom","fontSize","textAlign","fontWeight","minHeight"];
// ظاهر یک بخش/فیلد: کادر، رنگ، گردی، پس‌زمینه، فاصله‌ها، ارتفاع، قلم، تراز، خط زیر عنوان کادر
function lyStyle(el,st){
  LY_ST_PROPS.forEach(p=>{el.style[p]=""});{const im0=el.querySelector("img");if(im0&&(el.classList.contains("d-sigimg")||el.classList.contains("d-cimg"))){im0.style.width="";im0.style.height="";im0.style.objectFit="";im0.style.transform="";im0.style.filter="";im0.style.objectPosition=""}}
  const t=el.querySelector(":scope>.d-card-t");if(t)t.style.borderBottom="";
  el.dataset.st=JSON.stringify(st||{});if(!st)return;
  const S=el.style;
  if(st.bs==="none")S.border="none";
  else if(st.bs){S.borderStyle=st.bs;S.borderWidth=(st.bw!=null?st.bw:1.5)+"px";S.borderColor=st.bc||"#1e5a7a"}
  else{if(st.bw!=null)S.borderWidth=st.bw+"px";if(st.bc)S.borderColor=st.bc}
  if(st.br!=null)S.borderRadius=st.br+"px";
  if(st.bg)S.background=st.bg;
  if(st.pad!=null)S.padding=st.pad+"px";
  if(st.mt!=null)S.marginTop=st.mt+"px";
  if(st.mb!=null)S.marginBottom=st.mb+"px";
  if(st.fs)S.fontSize=st.fs+"px";
  if(st.ta)S.textAlign=st.ta;
  if(st.fw)S.fontWeight=st.fw==="b"?"700":"400";
  if(st.minh!=null)S.minHeight=st.minh+"px";
  if(st.pb)S.pageBreakBefore="always";
  if(st.abs){S.position="absolute";S.left=(st.x||0)+"mm";S.top=(st.y||0)+"mm";if(st.w)S.width=st.w+"mm";if(st.h)S.height=st.h+"mm";S.margin="0";el.draggable=false}
  if(st.z)S.zIndex=st.z;
  if(st.op!=null)S.opacity=st.op/100;
  if(st.rot)S.transform=`rotate(${st.rot}deg)`;
  if(st.fc)S.color=st.fc;
  if(st.lh)S.lineHeight=st.lh;
  if(st.ff)S.fontFamily=LY_FF[st.ff]||"";if(st.fi)S.fontStyle="italic";if(st.fu)S.textDecoration="underline";if(st.ls!=null)S.letterSpacing=st.ls+"px";
  const im=el.querySelector("img");
  if(im&&(el.classList.contains("d-sigimg")||el.classList.contains("d-cimg"))){
    if(st.abs&&st.w&&st.h){im.style.width="100%";im.style.height="100%"}
    else{im.style.width=st.iw?st.iw+"mm":"";im.style.height=st.ih?st.ih+"mm":""}
    im.style.objectFit=st.ar==="f"?"fill":((st.abs&&st.w&&st.h)||(st.iw&&st.ih)?"contain":"");
    if(st.of)im.style.objectFit=st.of;
    if(st.ox!=null||st.oy!=null)im.style.objectPosition=(st.ox!=null?st.ox:50)+"% "+(st.oy!=null?st.oy:50)+"%";
    if(st.fx||st.fy)im.style.transform=`scale(${st.fx?-1:1},${st.fy?-1:1})`;
    {const fl=[];if(st.bri!=null)fl.push(`brightness(${st.bri}%)`);if(st.gs)fl.push(`grayscale(${st.gs}%)`);if(fl.length)im.style.filter=fl.join(" ")}
  }
  if(t&&(st.tl||st.tc))t.style.borderBottom=st.tl==="none"?"none":`1.5px ${st.tl||"dashed"} ${st.tc||"#1aa3d4"}`;
}
function lyApply(doc,L,edit){
  (L.custom||[]).forEach(c=>{const e=document.createElement("div"),k=c.kind||"text";e.className=k==="line"?"d-cline":k==="space"?"d-cspace":k==="box"?"d-cbox":k==="img"?"d-cimg":"d-ctext";e.dataset.lid=c.id;e.dataset.custom="1";e.dataset.kind=k;if(k==="text"){if(edit)e.textContent=c.text||"";else e.innerHTML=lyEvalHtml(c.text||"")}if(k==="img"&&c.src){const im=document.createElement("img");im.src=c.src;im.alt="";e.appendChild(im)}doc.appendChild(e)});
  // کادر دور چند بخش (گروه‌ها): هر گروه یک .d-card با عنوان اختیاری
  (L.groups||[]).forEach(g=>{
    const kids=[...doc.children],mem=(g.ids||[]).map(id=>kids.find(c=>c.dataset.lid===id)).filter(Boolean);
    if(!mem.length)return;
    const w=document.createElement("div");w.className="d-card";w.dataset.lid=g.id;w.dataset.grp="1";w.dataset.title=g.title||"";
    if(g.title)w.innerHTML=`<div class="d-card-t">${esc(g.title)}</div>`;
    doc.insertBefore(w,mem[0]);mem.forEach(m=>w.appendChild(m));
  });
  const fl={};doc.querySelectorAll(".d-fl").forEach(f=>{fl[f.dataset.lid]=f});
  doc.querySelectorAll(".d-fg").forEach(g=>{const n=(L.cols||{})[g.dataset.gid];if(n){g.dataset.cols=n;g.style.gridTemplateColumns=`repeat(${n},1fr)`}});
  Object.entries(L.labels||{}).forEach(([id,t])=>{const f=fl[id];if(f){const sm=f.querySelector("small");if(sm)sm.textContent=t;f.dataset.label=t}});
  const claim={};Object.entries(L.grids||{}).forEach(([g,ids])=>ids.forEach(id=>{claim[id]=g}));
  doc.querySelectorAll(".d-fg").forEach(g=>{
    const ids=(L.grids||{})[g.dataset.gid];if(!ids)return;
    const left=[...g.children].filter(el=>!ids.includes(el.dataset.lid)&&!claim[el.dataset.lid]);
    ids.forEach(id=>{if(fl[id])g.appendChild(fl[id])});left.forEach(el=>g.appendChild(el));
  });
  Object.entries(fl).forEach(([id,el])=>{
    const sp=(L.fspan||{})[id];if(sp){el.style.gridColumn="span "+sp;el.dataset.span=sp}
    if((L.fhide||[]).includes(id)){if(edit)el.classList.add("ly-off");else el.remove()}
  });
  const r=L.root||{},ch=[...doc.children],by={};ch.forEach(c=>{by[c.dataset.lid]=c});
  const listed=(r.order||[]).map(id=>by[id]).filter(Boolean),rest=ch.filter(c=>!listed.includes(c));
  listed.concat(rest).forEach(c=>doc.appendChild(c));
  ch.concat([...doc.querySelectorAll(":scope>[data-grp]>[data-lid]")]).forEach(c=>{
    const id=c.dataset.lid,z=(r.zoom||{})[id];if(z){c.style.zoom=z/100;c.dataset.zoom=z}
    if((r.hide||[]).includes(id)){if(edit)c.classList.add("ly-off");else c.remove()}
  });
  doc.querySelectorAll("[data-lid]").forEach(el=>{const st=(L.style||{})[el.dataset.lid];if(st)lyStyle(el,st)});
  if(!edit)doc.querySelectorAll(".d-fg").forEach(g=>{if(!g.children.length)g.remove()});   // شبکهٔ خالی (همهٔ فیلدهایش جابه‌جا یا پنهان شده)
}
// html فرم ← html با چیدمان ذخیره‌شده (یا بدون تغییر اگر چیدمانی ذخیره نشده)
function layoutApply(F,html,edit){
  const L=(FS().formLayout||{})[F];if(!L&&!edit)return html;
  const box=document.createElement("div");box.innerHTML=html;
  const doc=box.querySelector(".doc");if(!doc)return html;
  lyAssign(doc);if(L)lyApply(doc,L,edit);
  return box.innerHTML;
}
let ly={form:"",sel:null,drag:null};
const lyRoot=()=>$("#lyDoc .doc");
function lyOpen(form){
  const B=sampleBuilders()[form];if(!B)return;
  ly.form=form;ly.sel=null;ly.hist=[];
  app.curForm=form;app.docData=null;let html;try{html=B()}finally{app.curForm=null}
  ly.data=Object.assign({},dataNow());
  $("#lyDoc").innerHTML=layoutApply(form,html,true);
  $("#lyDoc").style.width=(form==="deceased"||form==="insDeps"?277:/^life/.test(form)||form==="mehr"||form==="cheque"?182:134)+"mm";
  lyRoot().querySelectorAll(".d-fl").forEach(f=>{f.draggable=true});[...lyRoot().children].forEach(c=>{c.draggable=true});
  lyFixDrag();ly.multi=[];lyRulers(ly.rulerOn);$("#lyTitle").textContent="چیدمان آزاد — "+FORM_LABELS[form];$("#lyDlg").hidden=false;lyTools();lyOverlay();
}
function lySelect(el,keep){
  if(!keep){(ly.multi||[]).forEach(m=>m.classList.remove("ly-sel2"));ly.multi=[]}
  if(ly.sel)ly.sel.classList.remove("ly-sel");ly.sel=el;if(el)el.classList.add("ly-sel");lyTools();lyOverlay();
}
// انتخاب چندتایی (Shift+کلیک روی المان‌های آزاد): تراز، توزیع یکنواخت، هم‌اندازه‌کردن، جابه‌جایی گروهی
function lyToggleMulti(el){
  ly.multi=ly.multi||[];const i=ly.multi.indexOf(el);
  if(i>=0){ly.multi.splice(i,1);el.classList.remove("ly-sel2")}else{ly.multi.push(el);el.classList.add("ly-sel2")}
  lyTools();
}
function lyMultiOp(op){
  const els=[ly.sel,...(ly.multi||[])].filter(e=>e&&lyStOf(e).abs&&!lyStOf(e).lock),k=lyZoom()*PX_MM;
  if(op==="clr"){(ly.multi||[]).forEach(m=>m.classList.remove("ly-sel2"));ly.multi=[];lyTools();return}
  if(els.length<2){showAlert("حداقل دو المان آزاد را (Shift+کلیک) انتخاب کنید.");return}
  lyPush();
  const G=els.map(e=>{const st=lyStOf(e),r=e.getBoundingClientRect();return{e,st,x:st.x||0,y:st.y||0,w:st.w||r.width/k,h:st.h||r.height/k}});
  const r2=v=>Math.round(v*2)/2,minX=Math.min(...G.map(g=>g.x)),maxX=Math.max(...G.map(g=>g.x+g.w)),minY=Math.min(...G.map(g=>g.y)),maxY=Math.max(...G.map(g=>g.y+g.h));
  if(op==="l")G.forEach(g=>g.st.x=r2(minX));
  else if(op==="r")G.forEach(g=>g.st.x=r2(maxX-g.w));
  else if(op==="c")G.forEach(g=>g.st.x=r2((minX+maxX)/2-g.w/2));
  else if(op==="t")G.forEach(g=>g.st.y=r2(minY));
  else if(op==="b")G.forEach(g=>g.st.y=r2(maxY-g.h));
  else if(op==="m")G.forEach(g=>g.st.y=r2((minY+maxY)/2-g.h/2));
  else if(op==="dh"||op==="dv"){
    const hz=op==="dh",sorted=G.slice().sort((a,b)=>hz?a.x-b.x:a.y-b.y),tot=sorted.reduce((t,g)=>t+(hz?g.w:g.h),0),span=hz?maxX-minX:maxY-minY,gap=(span-tot)/Math.max(1,sorted.length-1);
    let pos=hz?minX:minY;sorted.forEach(g=>{if(hz)g.st.x=r2(pos);else g.st.y=r2(pos);pos+=(hz?g.w:g.h)+gap});
  }
  else if(op==="sw"){const w0=G[0].w;G.forEach(g=>g.st.w=r2(w0))}
  else if(op==="sh"){const h0=G[0].h;G.forEach(g=>g.st.h=r2(h0))}
  G.forEach(g=>{g.st.w=g.st.w||r2(g.w);g.st.h=g.st.h||r2(g.h);lyStyle(g.e,g.st)});
  lyTools();lyOverlay();
}
const lyMultiHTML=()=>`<div class="lyh">چند المان انتخاب شده (${faId((ly.multi||[]).length+1)})</div>
  <div class="lyr"><button class="btn" data-ly="m-l" title="هم‌تراز از چپ">⇤</button><button class="btn" data-ly="m-c" title="وسط افقی">⇔</button><button class="btn" data-ly="m-r" title="هم‌تراز از راست">⇥</button><button class="btn" data-ly="m-t" title="هم‌تراز از بالا">⤒</button><button class="btn" data-ly="m-m" title="وسط عمودی">⇕</button><button class="btn" data-ly="m-b" title="هم‌تراز از پایین">⤓</button></div>
  <div class="lyr"><button class="btn" data-ly="m-dh">توزیع افقی یکنواخت</button><button class="btn" data-ly="m-dv">توزیع عمودی یکنواخت</button></div>
  <div class="lyr"><button class="btn" data-ly="m-sw">هم‌عرض (با اولی)</button><button class="btn" data-ly="m-sh">هم‌ارتفاع (با اولی)</button></div>
  <div class="lyr"><button class="btn" data-ly="m-clr">لغو انتخاب چندتایی</button></div>
  <div class="hint">کشیدن یکی از المان‌های انتخاب‌شده، همه را با هم جابه‌جا می‌کند؛ کلیدهای جهت‌دار هم گروهی است.</div>`;
function lyRulers(on){
  const d=$("#lyDoc");if(!d)return;d.querySelectorAll(".ly-ruler").forEach(x=>x.remove());ly.rulerOn=!!on;if(!on)return;
  d.style.position="relative";
  const W=parseFloat(d.style.width)||182,H=Math.max(40,Math.round(d.offsetHeight/PX_MM));
  const rx=document.createElement("div"),ry=document.createElement("div");rx.className="ly-ruler x";ry.className="ly-ruler y";
  rx.style.width=(W-12)+"mm";ry.style.height=(H-12)+"mm";
  for(let i=0;i*10<=W-12;i++)rx.insertAdjacentHTML("beforeend",`<span style="left:${i*10}mm">${i}</span>`);
  for(let i=0;i*10<=H-12;i++)ry.insertAdjacentHTML("beforeend",`<span style="top:${i*10}mm">${i}</span>`);
  d.appendChild(rx);d.appendChild(ry);
}
function lyStyleUI(el){
  let st={};try{st=JSON.parse(el.dataset.st||"{}")}catch(_){}
  const v=k=>st[k]!=null?st[k]:"",isCard=el.classList.contains("d-card"),isImg=el.classList.contains("d-sigimg")||el.classList.contains("d-cimg"),ab=!!st.abs;
  const num=(k,l,mn,mx,w,step)=>`<label>${l} <input type="number" data-lst="${k}" min="${mn}" max="${mx}"${step?` step="${step}"`:""} value="${v(k)}"${w?` style="width:${w}px"`:""}></label>`;
  const sel=(k,l,o)=>`<label>${l} <select data-lst="${k}">${o.map(([a,b])=>`<option value="${a}"${String(v(k))===a?" selected":""}>${b}</option>`).join("")}</select></label>`;
  const col=(k,l,d)=>`<label>${l} <input type="color" data-lst="${k}" value="${v(k)||d}"></label>`;
  const line=[["","پیش‌فرض"],["none","بدون خط"],["solid","ساده"],["dashed","خط‌چین"],["dotted","نقطه‌چین"]];
  return `<div class="lyh">جایگذاری (مثل گزارش‌ساز)</div>
    <div class="lyr">${ab?`<button class="btn" data-ly="toflow">بازگشت به جریان صفحه</button>`:`<button class="btn btn-main" data-ly="toabs">آزاد کردن موقعیت (کشیدن و تغییر اندازه)</button>`}</div>
    ${ab?`<div class="lyr">${num("x","X",-100,500,64,0.5)}${num("y","Y",-100,700,64,0.5)}<span class="hint">میلی‌متر</span></div>
    <div class="lyr">${num("w","عرض",1,500,64,0.5)}${num("h","ارتفاع",1,700,64,0.5)}</div>
    <div class="lyr"><button class="btn" data-ly="al-l" title="چپ صفحه">⇤</button><button class="btn" data-ly="al-c" title="وسط افقی">⇔</button><button class="btn" data-ly="al-r" title="راست صفحه">⇥</button><button class="btn" data-ly="al-t" title="بالای صفحه">⤒</button><button class="btn" data-ly="al-m" title="وسط عمودی">⇕</button><button class="btn" data-ly="al-b" title="پایین صفحه">⤓</button></div>
    <div class="hint">کشیدن با ماوس، دستگیره‌ها برای تغییر اندازه، کلیدهای جهت‌دار برای جابه‌جایی دقیق (Shift = ۵ میلی‌متر).</div>`:""}
    <div class="lyr">${num("z","لایه (جلوتر ←)",0,99,56)}${num("rot","چرخش (درجه)",-180,180,56)}${num("op","شفافیت ٪",5,100,56)}</div>
    <div class="lyr"><button class="btn" data-ly="zfront">آوردن به جلو</button><button class="btn" data-ly="zback">بردن به عقب</button><label><input type="checkbox" data-lst="lock"${st.lock?" checked":""}> قفل</label></div>
    ${isImg?`<div class="lyh">تصویر</div><div class="lyr">${num("iw","عرض (mm)",5,300,60,0.5)}${num("ih","ارتفاع (mm)",5,300,60,0.5)}</div><div class="lyr">${sel("ar","نسبت",[["","حفظ نسبت (پیش‌فرض)"],["f","کشیده‌شدن آزاد"]])}</div><div class="lyr">${sel("of","جاشدن در کادر",[["","پیش‌فرض"],["contain","کامل (contain)"],["cover","پر کردن و برش (cover)"],["fill","کشیده"]])}</div>
    <div class="lyr">${num("ox","برش افقی ٪",0,100,56)}${num("oy","برش عمودی ٪",0,100,56)}</div>
    <div class="lyr"><label><input type="checkbox" data-lst="fx"${st.fx?" checked":""}> وارونه افقی</label><label><input type="checkbox" data-lst="fy"${st.fy?" checked":""}> وارونه عمودی</label></div>
    <div class="lyr">${num("bri","روشنایی ٪",20,200,56)}${num("gs","خاکستری ٪",0,100,56)}</div>
    ${el.classList.contains("d-cimg")?`<div class="lyr"><button class="btn" data-ly="repimg">تعویض تصویر</button></div>`:""}
    <div class="hint">اگر فقط عرض را بدهید ارتفاع خودکار است؛ برای کادر ثابت، موقعیت را «آزاد» کنید و «جاشدن در کادر» را بر «پر کردن و برش» بگذارید.</div>`:""}
    <div class="lyh">ظاهر (کادر و فاصله‌ها)</div>
    <div class="lyr">${sel("bs","کادر",[["","پیش‌فرض"],["none","بدون کادر"],["solid","خط ساده"],["dashed","خط‌چین"],["dotted","نقطه‌چین"]])}</div>
    <div class="lyr">${num("bw","ضخامت",0,8)}${col("bc","رنگ","#1e5a7a")}${num("br","گردی",0,40)}</div>
    <div class="lyr">${col("bg","پس‌زمینه","#ffffff")}<button class="btn" data-ly="bgclear">بی‌رنگ</button></div>
    <div class="lyr">${num("pad","فاصلهٔ داخل",0,40)}${num("minh","حداقل ارتفاع",0,400,64)}</div>
    <div class="lyr">${num("mt","فاصلهٔ بالا",0,80)}${num("mb","فاصلهٔ پایین",0,80)}</div>
    <div class="lyh">متن</div>
    <div class="lyr">${num("fs","اندازهٔ قلم",7,26)}${sel("fw","وزن",[["","پیش‌فرض"],["b","ضخیم"],["n","معمولی"]])}</div>
    <div class="lyr">${sel("ff","فونت",[["","پیش‌فرض"],["vazir","وزیرمتن"],["tahoma","تاهوما"],["arial","آریال"],["times","تایمز"],["mono","تک‌فاصله"]])}${num("ls","فاصلهٔ حروف",-2,20,56,0.5)}</div>
    <div class="lyr"><label><input type="checkbox" data-lst="fi"${st.fi?" checked":""}> کج (ایتالیک)</label><label><input type="checkbox" data-lst="fu"${st.fu?" checked":""}> زیرخط‌دار</label></div>
    <div class="lyr">${col("fc","رنگ متن","#000000")}${num("lh","ارتفاع خط",0.8,4,56,0.1)}</div>
    <div class="lyr">${sel("ta","تراز",[["","پیش‌فرض"],["right","راست"],["center","وسط"],["left","چپ"]])}</div>
    ${isCard?`<div class="lyh">خط زیر عنوان</div><div class="lyr">${sel("tl","نوع",line)}${col("tc","رنگ","#1aa3d4")}</div>`:""}
    <div class="lyr"><label><input type="checkbox" data-lst="pb"${st.pb?" checked":""}> شروع از صفحهٔ جدید</label></div>
    <div class="lyr"><button class="btn" data-ly="stclear">حذف همهٔ تنظیمات ظاهر</button></div>`;
}
const lyCurSpan=el=>(+el.dataset.span)||(+((/\bw(\d)\b/.exec(el.className)||[])[1]))||1;
const lyCurCols=g=>(+g.dataset.cols)||(+((/\bc(\d)\b/.exec(g.className)||[])[1]))||2;
function lyDataUI(el){
  const D=ly.data||{},keys=Object.keys(D);
  const isTxt=el&&el.dataset.custom==="1"&&(el.dataset.kind||"text")==="text";
  const prev=isTxt?`<div class="hint u-mt4">پیش‌نمایش: <b>${lyEvalHtml(el.textContent,D)||"—"}</b></div>`:"";
  return `<div class="lyh">اتصال به داده و فرمول</div>
    <div class="lyr"><select id="lyDataSel" class="u-maxw210">${keys.map(k=>`<option value="${k}">${esc(DATA_LBL[k]||k)} — ${k} (${esc(String(D[k]).slice(0,18))})</option>`).join("")}</select><button class="btn" data-ly="insfield">درج فیلد</button></div>
    <div class="lyr"><input id="lyFormula" class="ltr u-f1 u-minw150" placeholder="مثلاً pct(loanAmount,feePercent)"><button class="btn" data-ly="insformula">درج فرمول</button></div>
    <div class="hint" id="lyFormPrev">نتیجهٔ فرمول اینجا نمایش داده می‌شود.</div>
    <div class="hint u-lh1-8">درج: در حین ویرایش متن (دوبار کلیک) در محل مکان‌نما، وگرنه در متن آزاد انتخاب‌شده. توابع: round(x,n) floor ceil abs min max sum if(شرط,الف,ب) pct(الف,ب). قالب خروجی: <code>{=عبارت|words}</code> به حروف، <code>|raw</code> بدون جداکننده.</div>${prev}`;
}
function lyInsertToken(tok){
  const le=ly.lastEdit;let target=null;
  const ed=document.querySelector("#lyDoc .ly-editing");
  if(ed)target=ed;else if(le&&le.el.isConnected&&Date.now()-le.t<90000)target=le.el;
  if(target){
    lyPush();
    const prevCE=target.contentEditable;target.contentEditable="true";target.focus();
    if(le&&le.el===target&&le.range&&!ed){const sel=getSelection();sel.removeAllRanges();sel.addRange(le.range)}
    document.execCommand("insertText",false,tok);
    target.contentEditable=prevCE==="true"?"true":"false";
    ly.lastEdit={el:target,range:null,t:Date.now()};
    return;
  }
  let el=ly.sel;
  if(el&&el.dataset.custom==="1"&&(el.dataset.kind||"text")==="text"){lyPush();el.textContent=(el.textContent+" "+tok).trim();lySelect(el)}
  else{lyAddCustom("text");el=ly.sel;el.textContent=tok;lySelect(el)}
}
function lyTools(){
  const el=ly.sel,box=$("#lyTools");
  if(!el){box.innerHTML=`<div class="lyh">راهنما</div><div class="hint u-lh1-9">• روی یک <b>بخش</b> یا <b>فیلد</b> کلیک کنید تا تنظیماتش اینجا بیاید.<br>• <b>ویرایش متن</b>: دوبار کلیک روی متن؛ <b>تغییر نام فیلد</b>: دوبار کلیک روی برچسب آن.<br>• با <b>کشیدن</b> بخش‌ها و فیلدها را جابه‌جا کنید.<br>• «➕ متن»، «➖ خط» و «↕ فاصله» بلوک آزاد اضافه می‌کنند.<br>• برای کادر دور چند بخش: بخش را انتخاب و «ادغام با بخش بعدی» را بزنید.<br>• میان‌برها: Ctrl+Z بازگشت، Esc لغو انتخاب، Alt+فلش جابه‌جایی، Delete حذف بلوک آزاد.<br>• «ذخیرهٔ چیدمان و متن‌ها» هم متن‌ها (قالب همهٔ فرم‌های این نوع) و هم چیدمان را ذخیره می‌کند.</div>`+lyDataUI(null);return}
  const off=el.classList.contains("ly-off"),isF=el.classList.contains("d-fl"),isG=el.dataset.grp==="1",isC=el.dataset.custom==="1",inG=!!(el.parentElement&&el.parentElement.dataset.grp==="1"),isCard=el.classList.contains("d-card");
  const kindName={text:"متن آزاد",line:"خط جداکننده",space:"فاصلهٔ خالی"}[el.dataset.kind||"text"];
  const name=isF?"فیلد: "+(el.dataset.label||el.dataset.lid.slice(2)).replace(/[\u200b\u200c]/g,""):isG?"کادر گروهی":isC?kindName:"بخش: "+el.dataset.lid.replace(/^[sc]:/,"");
  let h=((ly.multi||[]).length?lyMultiHTML():"")+`<div class="lyh">${esc(name)}</div><div class="lyr"><button class="btn" data-ly="toggle">${off?"نمایش":"پنهان کردن"}</button>${isC?`<button class="btn btn-del" data-ly="deltext">حذف</button><button class="btn" data-ly="duptext">تکثیر</button>`:""}</div>`;
  h+=`<div class="lyh">جابه‌جایی و اندازه</div><div class="lyr">`;
  if(isF){
    const g=el.parentElement,cols=lyCurCols(g),sp=lyCurSpan(el);
    h+=`<button class="btn" data-ly="prev">▶ جلوتر</button><button class="btn" data-ly="next">◀ عقب‌تر</button></div>
      <div class="lyr"><label>عرض این فیلد <select data-lspan>${[1,2,3,4,5,6].map(n=>`<option value="${n}"${sp===n?" selected":""}>${faId(n)} ستون</option>`).join("")}</select></label></div>
      <div class="lyr"><label>تعداد ستون‌های این ردیف <select data-lcols>${[1,2,3,4,5,6].map(n=>`<option value="${n}"${cols===n?" selected":""}>${faId(n)}</option>`).join("")}</select></label></div>
      <div class="hint">عرض هر فیلد از تعداد ستون‌های ردیف است؛ مثلاً ردیف ۴ستونه و فیلد ۱ستونه = یک‌چهارم عرض.</div><div class="lyr">`;
  }else h+=`<button class="btn" data-ly="up">${ico("up")} بالاتر</button><button class="btn" data-ly="dn">${ico("chev-d")} پایین‌تر</button><button class="btn" data-ly="zm">− کوچک‌تر</button><span>${faId(+el.dataset.zoom||100)}٪</span><button class="btn" data-ly="zp">+ بزرگ‌تر</button>`;
  h+=`</div>`;
  if(!isF){
    h+=`<div class="lyh">کادر و گروه</div><div class="lyr">`;
    if(isG)h+=`<label>عنوان <input data-lgt value="${esc(el.dataset.title||"")}" class="u-w150"></label></div><div class="lyr"><button class="btn" data-ly="merge">افزودن بخش بعدی به کادر</button><button class="btn" data-ly="ungroup">باز کردن کادر</button>`;
    else if(inG)h+=`<button class="btn" data-ly="out">خروج از کادر</button>`;
    else if(!isC)h+=`<button class="btn" data-ly="wrap">کادر دور این بخش</button><button class="btn" data-ly="merge">ادغام با بخش بعدی در یک کادر</button>`;
    h+=`</div>`;
  }
  h+=`<div class="lyh">کپی ظاهر</div><div class="lyr"><button class="btn" data-ly="copystyle">کپی ظاهر</button><button class="btn" data-ly="pastestyle"${ly.clip?"":" disabled"}>چسباندن ظاهر</button>${isF?`<button class="btn" data-ly="applyrow">اعمال روی همهٔ فیلدهای این ردیف</button>`:""}${isCard?`<button class="btn" data-ly="applycards">اعمال روی همهٔ کادرها</button>`:""}</div>`;
  box.innerHTML=h+lyDataUI(el)+lyStyleUI(el);
}
const lySnap=()=>{const d=$("#lyDoc");if(!d)return"";const c=d.cloneNode(true);c.querySelectorAll(".ly-ruler").forEach(x=>x.remove());return c.innerHTML};
function lyPush(){const d=$("#lyDoc");if(!d)return;ly.hist=ly.hist||[];ly.hist.push(lySnap());ly.redo=[];if(ly.hist.length>60)ly.hist.shift()}
function lyPushBurst(){const t=Date.now();if(!ly.lastBurst||t-ly.lastBurst>900)lyPush();ly.lastBurst=t}
function lyRestore(html){
  $("#lyDoc").innerHTML=html;ly.sel=null;ly.multi=[];
  lyRoot().querySelectorAll(".d-fl").forEach(f=>{f.draggable=true});[...lyRoot().children].forEach(c=>{c.draggable=true});
  lyFixDrag();lyRoot().querySelectorAll(".ly-sel,.ly-sel2").forEach(e=>e.classList.remove("ly-sel","ly-sel2"));lyRulers(ly.rulerOn);lyTools();lyOverlay();
}
function lyUndo(){
  const h=ly.hist||[];if(!h.length){showAlert("چیزی برای بازگشت نیست.");return}
  (ly.redo=ly.redo||[]).push(lySnap());lyRestore(h.pop());
}
function lyRedo(){
  const r=ly.redo||[];if(!r.length){showAlert("چیزی برای تکرار نیست.");return}
  (ly.hist=ly.hist||[]).push(lySnap());lyRestore(r.pop());
}
function lySetStyle(k,v){
  const el=ly.sel;if(!el)return;let st={};try{st=JSON.parse(el.dataset.st||"{}")}catch(_){}
  if(v===""||v==null||v===false)delete st[k];else st[k]=["bw","br","pad","mt","mb","minh","fs","iw","ih","x","y","w","h","z","op","rot","lh","ls","bri","gs","ox","oy"].includes(k)?Number(v):(["pb","fi","fu","fx","fy","lock"].includes(k)?1:v);
  lyStyle(el,Object.keys(st).length?st:null);
}
function lyMkGroup(items){
  const d=lyRoot(),used=new Set([...d.querySelectorAll("[data-grp]")].map(x=>x.dataset.lid));let n=1;while(used.has("grp"+n))n++;
  const w=document.createElement("div");w.className="d-card";w.dataset.lid="grp"+n;w.dataset.grp="1";w.dataset.title="";w.draggable=true;
  d.insertBefore(w,items[0]);items.forEach(i=>w.appendChild(i));return w;
}
// متن یک خانهٔ قابل‌ویرایش (با جای‌نگهدارهای {name} ...) به‌صورت متن ساده
function lySerText(el){
  const c=el.cloneNode(true);c.querySelectorAll("[data-ph]").forEach(e=>e.replaceWith(document.createTextNode("{"+e.getAttribute("data-ph")+"}")));
  const h=c.innerHTML.replace(/<br\s*\/?>/gi,"\n").replace(/<\/(div|p|li)>/gi,"\n").replace(/<[^>]+>/g,"");
  const ta=document.createElement("textarea");ta.innerHTML=h;return ta.value.replace(/\u00a0/g," ").replace(/^\n+|\n+$/g,"");
}
function lyEditText(sl){
  lyPush();
  const undrag=[];let a=sl;while(a&&a.id!=="lyDoc"){if(a.draggable){undrag.push(a);a.draggable=false}a=a.parentElement}
  sl.contentEditable="true";sl.querySelectorAll("[data-ph]").forEach(x=>{x.contentEditable="false"});sl.classList.add("ly-editing");sl.focus();
  const done=()=>{const sel=getSelection();ly.lastEdit={el:sl,range:sel&&sel.rangeCount&&sl.contains(sel.anchorNode)?sel.getRangeAt(0).cloneRange():null,t:Date.now()};sl.contentEditable="false";sl.classList.remove("ly-editing");undrag.forEach(x=>{x.draggable=true});sl.removeEventListener("blur",done)};
  sl.addEventListener("blur",done);
}
const PX_MM=96/25.4;
const lyZoom=()=>parseFloat($("#lyDoc").style.zoom)||1;
const lyStOf=el=>{try{return JSON.parse(el.dataset.st||"{}")}catch(_){return{}}};
const lySnapV=v=>{const g=ly.snap||0;return g>0?Math.round(v/g)*g:Math.round(v*2)/2};
function lyFixDrag(){lyRoot().querySelectorAll("[data-st]").forEach(e=>{if(lyStOf(e).abs)e.draggable=false})}
function lyOverlay(){
  const h=$("#lyHdl");if(!h)return;const el=ly.sel;
  if(!el||$("#lyDlg").hidden||!lyStOf(el).abs||lyStOf(el).lock){h.hidden=true;return}
  const cv=$("#lyCanvas"),cr=cv.getBoundingClientRect(),r=el.getBoundingClientRect();
  h.hidden=false;h.style.left=(r.left-cr.left+cv.scrollLeft)+"px";h.style.top=(r.top-cr.top+cv.scrollTop)+"px";h.style.width=r.width+"px";h.style.height=r.height+"px";
}
function lyToAbs(el){
  const d=lyRoot(),dr=d.getBoundingClientRect(),r=el.getBoundingClientRect(),k=lyZoom()*PX_MM;
  lyPush();const st=lyStOf(el);
  st.abs=1;st.x=lySnapV((r.left-dr.left)/k);st.y=lySnapV((r.top-dr.top)/k);st.w=Math.max(5,Math.round(r.width/k*2)/2);st.h=Math.max(4,Math.round(r.height/k*2)/2);
  lyStyle(el,st);el.draggable=false;lySelect(el);
}
function lyAlign(el,m){
  const d=lyRoot(),dr=d.getBoundingClientRect(),k=lyZoom()*PX_MM,st=lyStOf(el);if(!st.abs)return;
  const W=dr.width/k,H=Math.max(dr.height/k,(st.y||0)+(st.h||0)),w=st.w||el.getBoundingClientRect().width/k,h=st.h||el.getBoundingClientRect().height/k;
  lyPush();
  if(m==="l")st.x=0;else if(m==="r")st.x=Math.round((W-w)*2)/2;else if(m==="c")st.x=Math.round((W-w)/2*2)/2;
  else if(m==="t")st.y=0;else if(m==="b")st.y=Math.round((H-h)*2)/2;else if(m==="m")st.y=Math.round((H-h)/2*2)/2;
  lyStyle(el,st);lyTools();lyOverlay();
}
// افزودن تصویر دلخواه (لوگو، مهر، امضای دوم): کوچک‌سازی تا ۷۰۰ پیکسل و حداکثر حدود ۳۰۰ کیلوبایت
async function lyAddImage(f){
  const rd=await new Promise((ok,no)=>{const fr=new FileReader();fr.onerror=()=>no(new Error("فایل خوانده نشد."));fr.onload=()=>ok(fr.result);fr.readAsDataURL(f)});
  const im=await new Promise((ok,no)=>{const i=new Image();i.onerror=()=>no(new Error("فایل تصویر معتبر نیست."));i.onload=()=>ok(i);i.src=rd});
  let url="",max=700;
  while(max>=200){const k=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);url=c.toDataURL("image/png");if(url.length<=380000)break;url=c.toDataURL("image/jpeg",.85);if(url.length<=380000)break;max-=150}
  if(url.length>380000)throw new Error("حجم تصویر برای ذخیره زیاد است؛ تصویر کوچک‌تری انتخاب کنید.");
  {const rp=ly.replEl;ly.replEl=null;if(rp){const g0=rp.querySelector("img");if(g0){lyPush();g0.src=url}return}}
  if(lyRoot().querySelectorAll('[data-kind="img"]').length>=5)throw new Error("حداکثر ۵ تصویر در هر فرم مجاز است.");
  const e=lyAddCustom("img");const g=document.createElement("img");g.src=url;g.alt="";g.style.width="40mm";e.appendChild(g);
}
function lyAddCustom(kind){
  lyPush();
  const d=lyRoot(),used=new Set([...d.querySelectorAll("[data-custom]")].map(x=>x.dataset.lid));let n=1;while(used.has("cx"+n))n++;
  const e=document.createElement("div");e.className=kind==="line"?"d-cline":kind==="space"?"d-cspace":kind==="box"?"d-cbox":kind==="img"?"d-cimg":"d-ctext";e.dataset.lid="cx"+n;e.dataset.custom="1";e.dataset.kind=kind;e.draggable=true;
  if(kind==="text")e.textContent="متن جدید — برای ویرایش دوبار کلیک کنید";
  let at=ly.sel;while(at&&at.parentElement&&at.parentElement!==d)at=at.parentElement;
  const foot=d.querySelector(":scope>.d-foot");
  if(at&&at.parentElement===d)d.insertBefore(e,at.nextSibling);else if(foot)d.insertBefore(e,foot);else d.appendChild(e);
  lySelect(e);return e;
}
const lyAddText=()=>lyAddCustom("text");
function lyEditLabel(sm){
  lyPush();
  const f=sm.closest(".d-fl"),undrag=[];let a=sm;while(a&&a.id!=="lyDoc"){if(a.draggable){undrag.push(a);a.draggable=false}a=a.parentElement}
  sm.contentEditable="true";sm.classList.add("ly-editing");sm.focus();
  const done=()=>{sm.contentEditable="false";sm.classList.remove("ly-editing");undrag.forEach(x=>{x.draggable=true});f.dataset.label=sm.textContent.trim();sm.removeEventListener("blur",done);if(ly.sel===f)lyTools()};
  sm.addEventListener("blur",done);
}
function lySerialize(){
  const doc=lyRoot(),L={root:{order:[],hide:[],zoom:{}},grids:{},fspan:{},fhide:[],style:{},groups:[],custom:[],cols:{},labels:{}};
  [...doc.children].forEach(c=>L.root.order.push(c.dataset.lid));
  [...doc.children,...doc.querySelectorAll(":scope>[data-grp]>[data-lid]")].forEach(c=>{const id=c.dataset.lid;if(c.classList.contains("ly-off"))L.root.hide.push(id);const z=+c.dataset.zoom;if(z&&z!==100)L.root.zoom[id]=z});
  doc.querySelectorAll(":scope>[data-grp]").forEach(w=>L.groups.push({id:w.dataset.lid,title:w.dataset.title||"",ids:[...w.children].filter(x=>x.dataset.lid).map(x=>x.dataset.lid)}));
  doc.querySelectorAll("[data-custom]").forEach(e=>{const k=e.dataset.kind||"text";L.custom.push({id:e.dataset.lid,kind:k,text:k==="text"?lySerText(e):"",src:k==="img"?((e.querySelector("img")||{}).src||""):""})});
  doc.querySelectorAll(".d-fl[data-label]").forEach(f=>{if(f.dataset.label)L.labels[f.dataset.lid]=f.dataset.label});
  doc.querySelectorAll("[data-lid]").forEach(el=>{try{const st=JSON.parse(el.dataset.st||"{}");if(Object.keys(st).length)L.style[el.dataset.lid]=st}catch(_){}});
  doc.querySelectorAll(".d-fg").forEach(g=>{L.grids[g.dataset.gid]=[...g.children].filter(x=>x.classList.contains("d-fl")).map(f=>{const id=f.dataset.lid;if(f.classList.contains("ly-off"))L.fhide.push(id);const sp=+f.dataset.span;if(sp>=1)L.fspan[id]=sp;return id})});
  doc.querySelectorAll(".d-fg[data-cols]").forEach(g=>{L.cols[g.dataset.gid]=+g.dataset.cols});
  return L;
}
(function(){
  const D=$("#lyDlg");if(!D)return;
  const doc=()=>lyRoot();
  D.addEventListener("click",async e=>{
    const t=e.target,b=t.closest("[data-ly]");
    if(!b){
      const d=doc();if(!d||!d.contains(t))return;
      if(t.closest(".ly-editing"))return;
      if(Date.now()-(ly.skipClick||0)<350)return;
      const f=t.closest(".d-fl");let el=f;
      if(!el){
        if(t.classList.contains("d-card-t")&&t.parentElement.dataset.grp==="1")el=t.parentElement;
        else{el=t;while(el&&el.parentElement!==d&&!(el.parentElement&&el.parentElement.dataset&&el.parentElement.dataset.grp==="1"))el=el.parentElement}
      }
      if(el&&el!==d)lySelect(el);return;
    }
    if(b.tagName!=="BUTTON")return;
    const a=b.dataset.ly,el=ly.sel;
    if(a==="close"){D.hidden=true;return}
    if(a==="undo"){lyUndo();return}
    if(a==="redo"){lyRedo();return}
    if(a==="insfield"){const k=$("#lyDataSel")&&$("#lyDataSel").value;if(k)lyInsertToken("{"+k+"}");return}
    if(a==="insformula"){const f=($("#lyFormula").value||"").trim();if(!f){showAlert("فرمول را بنویسید.");return}lyInsertToken("{="+f+"}");return}
    if(a&&a.startsWith("m-")){lyMultiOp(a.slice(2));return}
    if(a==="repimg"&&ly.sel){ly.replEl=ly.sel;$("#lyImgFile").click();return}
    if(a==="addtext"){lyAddText();return}
    if(a==="addline"){lyAddCustom("line");return}
    if(a==="addbox"){lyAddCustom("box");return}
    if(a==="addimg"){$("#lyImgFile").click();return}
    if(a==="addspace"){lyAddCustom("space");return}
    if(a==="save"){
      try{
        const map={};$("#lyDoc").querySelectorAll("[data-slot]").forEach(n=>{const id=n.getAttribute("data-slot"),def=(n.getAttribute("data-def")||"").replace(/\u00a0/g," "),tx=lySerText(n);map[id]=tx===def?null:tx});
        await saveFormTpl(ly.form,map);
        const lay=JSON.parse(JSON.stringify(FS().formLayout||{}));lay[ly.form]=lySerialize();
        app.fs=await api("PUT","/api/form-settings",{formLayout:lay});
        showAlert("چیدمان و متن‌ها ذخیره شد؛ از این پس در چاپ همهٔ فرم‌های این نوع اعمال می‌شود.");
      }catch(er){showAlert(er.message)}
      return;
    }
    if(a==="reset"){
      showConfirm("چیدمان آزاد این فرم (کادرها، گروه‌ها، متن‌های آزاد و ظاهر) به حالت پیش‌فرض برگردد؟ (متن‌های قالب دست‌نخورده می‌ماند)",async()=>{
        const lay=JSON.parse(JSON.stringify(FS().formLayout||{}));delete lay[ly.form];
        try{app.fs=await api("PUT","/api/form-settings",{formLayout:lay});lyOpen(ly.form)}catch(er){showAlert(er.message)}
      });return;
    }
    if(!el)return;
    lyPush();
    if(a==="zfront"){const mx=Math.max(0,...[...lyRoot().querySelectorAll("[data-st]")].map(q=>lyStOf(q).z||0));lySetStyle("z",Math.min(99,mx+1))}
    else if(a==="zback"){lySetStyle("z","0")}
    else if(a==="toggle")el.classList.toggle("ly-off");
    else if(a==="prev"){const p=el.previousElementSibling;if(p)el.parentElement.insertBefore(el,p)}
    else if(a==="next"){const n=el.nextElementSibling;if(n)el.parentElement.insertBefore(n,el)}
    else if(a==="up"){const p=el.previousElementSibling;if(p&&!p.classList.contains("d-card-t"))el.parentElement.insertBefore(el,p)}
    else if(a==="dn"){const n=el.nextElementSibling;if(n)el.parentElement.insertBefore(n,el)}
    else if(a==="zm"||a==="zp"){const z=Math.min(200,Math.max(40,(+el.dataset.zoom||100)+(a==="zp"?5:-5)));el.dataset.zoom=z;el.style.zoom=z/100}
    else if(a==="wrap"){if(el.parentElement===lyRoot()){lySelect(lyMkGroup([el]));return}}
    else if(a==="merge"){
      const n=el.nextElementSibling;if(!n||n.dataset.grp==="1"){showAlert("بخش بعدی برای ادغام وجود ندارد (یا خودش کادر گروهی است).");return}
      if(el.dataset.grp==="1")el.appendChild(n);else lySelect(lyMkGroup([el,n]));
    }
    else if(a==="ungroup"&&el.dataset.grp==="1"){[...el.children].filter(c=>!c.classList.contains("d-card-t")).forEach(c=>lyRoot().insertBefore(c,el));el.remove();lySelect(null);return}
    else if(a==="out"){const p=el.parentElement;if(p&&p.dataset.grp==="1"){p.parentElement.insertBefore(el,p.nextSibling);if(![...p.children].some(c=>c.dataset.lid))p.remove()}}
    else if(a==="deltext"&&el.dataset.custom==="1"){el.remove();lySelect(null);return}
    else if(a==="duptext"&&el.dataset.custom==="1"){
      const d=lyRoot(),used=new Set([...d.querySelectorAll("[data-custom]")].map(x=>x.dataset.lid));let n=1;while(used.has("cx"+n))n++;
      const c=el.cloneNode(true);c.dataset.lid="cx"+n;c.classList.remove("ly-sel","ly-editing");c.removeAttribute("contenteditable");el.parentElement.insertBefore(c,el.nextSibling);lySelect(c);return;
    }
    else if(a==="copystyle"){ly.clip=el.dataset.st||"{}";showAlert("ظاهر این المان کپی شد؛ المان دیگری را انتخاب و «چسباندن ظاهر» را بزنید.")}
    else if(a==="pastestyle"&&ly.clip){let st=null;try{st=JSON.parse(ly.clip)}catch(_){}lyStyle(el,st&&Object.keys(st).length?st:null)}
    else if(a==="applyrow"&&el.classList.contains("d-fl")){let st=null;try{st=JSON.parse(el.dataset.st||"{}")}catch(_){}[...el.parentElement.children].filter(c=>c.classList.contains("d-fl")).forEach(c=>lyStyle(c,st&&Object.keys(st).length?st:null))}
    else if(a==="applycards"){let st=null;try{st=JSON.parse(el.dataset.st||"{}")}catch(_){}lyRoot().querySelectorAll(".d-card").forEach(c=>lyStyle(c,st&&Object.keys(st).length?st:null))}
    else if(a==="toabs"){lyToAbs(el);return}
    else if(a==="toflow"){let st=lyStOf(el);["abs","x","y","w","h"].forEach(k=>delete st[k]);lyStyle(el,Object.keys(st).length?st:null);el.draggable=true}
    else if(/^al-[lcrtmb]$/.test(a)){lyAlign(el,a[3]);return}
    else if(a==="bgclear"){lySetStyle("bg","")}
    else if(a==="stclear"){lyStyle(el,null)}
    lyTools();
  });
  D.addEventListener("mousedown",e=>{if(e.target.closest('[data-ly="insfield"],[data-ly="insformula"]'))e.preventDefault()});
  D.addEventListener("dblclick",e=>{
    const d=doc();if(!d||!d.contains(e.target))return;
    const sm=e.target.closest(".d-fl small");if(sm&&!sm.classList.contains("ly-editing")){lyEditLabel(sm);return}
    const sl=e.target.closest("[data-slot],[data-custom]");if(sl&&!sl.classList.contains("ly-editing")&&(sl.dataset.kind||"text")==="text")lyEditText(sl);
  });
  D.addEventListener("input",e=>{
    const t=e.target;
    if(t.id==="lyFormula"){const o=$("#lyFormPrev");if(o){const f=t.value.trim();o.textContent=f?"= "+lyFormula(f,ly.data||dataNow()):"نتیجهٔ فرمول اینجا نمایش داده می‌شود."}return}
    if(t.dataset.lyz!==undefined){$("#lyDoc").style.zoom=(+t.value)/100;lyOverlay();return}
    if(!ly.sel)return;
    if(t.dataset.lst){lyPushBurst();lySetStyle(t.dataset.lst,t.type==="checkbox"?t.checked:t.value);lyOverlay();return}
    if(t.dataset.lgt!==undefined&&ly.sel.dataset.grp==="1"){
      lyPushBurst();
      const w=ly.sel;w.dataset.title=t.value;let tt=w.querySelector(":scope>.d-card-t");
      if(t.value){if(!tt){tt=document.createElement("div");tt.className="d-card-t";w.insertBefore(tt,w.firstChild)}tt.textContent=t.value}else if(tt)tt.remove();
      let st=null;try{st=JSON.parse(w.dataset.st||"{}")}catch(_){}lyStyle(w,st&&Object.keys(st).length?st:null);
    }
  });
  D.addEventListener("change",e=>{
    const t=e.target;
    if(t.dataset.lyruler!==undefined){lyRulers(t.checked);return}
    if(t.dataset.lyguides!==undefined){$("#lyDoc").classList.toggle("ly-guides",t.checked);return}
    if(t.dataset.lygrid!==undefined){$("#lyDoc").classList.toggle("ly-gridbg",t.checked);return}
    if(t.dataset.lysnap!==undefined){ly.snap=+t.value;return}
    if(t.id==="lyImgFile"){const f=t.files[0];t.value="";if(f)lyAddImage(f).catch(er=>showAlert(er.message));return}
    if(t.dataset.lspan!==undefined&&ly.sel){lyPush();const n=+t.value;ly.sel.dataset.span=n;ly.sel.style.gridColumn="span "+n}
    if(t.dataset.lcols!==undefined&&ly.sel&&ly.sel.parentElement&&ly.sel.parentElement.classList.contains("d-fg")){lyPush();const n=+t.value,g=ly.sel.parentElement;g.dataset.cols=n;g.style.gridTemplateColumns=`repeat(${n},1fr)`}
  });
  D.addEventListener("dragstart",e=>{const el=e.target.closest(".d-fl")||[...doc().children].find(c=>c.contains(e.target));if(!el)return;ly.drag=el;try{e.dataTransfer.setData("text/plain","x");e.dataTransfer.effectAllowed="move"}catch(x){}});
  D.addEventListener("dragover",e=>{if(ly.drag)e.preventDefault()});
  D.addEventListener("drop",e=>{
    const d=ly.drag;ly.drag=null;if(!d)return;e.preventDefault();lyPush();
    if(d.classList.contains("d-fl")){
      const t=e.target.closest(".d-fl"),g=e.target.closest(".d-fg");
      if(t&&t!==d){const r=t.getBoundingClientRect();t.parentElement.insertBefore(d,e.clientX>r.left+r.width/2?t:t.nextSibling)}   // راست‌چین: نیمهٔ راست = قبل از فیلد
      else if(g&&!t)g.appendChild(d);
    }else{
      let t=e.target;while(t&&t.parentElement!==doc())t=t.parentElement;
      if(t&&t!==d){const r=t.getBoundingClientRect();doc().insertBefore(d,e.clientY<r.top+r.height/2?t:t.nextSibling)}
    }
    lySelect(d);
  });
  // کشیدن و تغییر اندازهٔ المان‌های «آزاد» با ماوس/لمس
  D.addEventListener("pointerdown",e=>{
    if(e.button!==0)return;const t=e.target,h=t.closest&&t.closest("#lyHdl i[data-h]");
    if(h&&ly.sel){const st=lyStOf(ly.sel);lyPush();ly.rs={dir:h.dataset.h,x0:e.clientX,y0:e.clientY,x:st.x||0,y:st.y||0,w:st.w||10,h:st.h||10};e.preventDefault();return}
    const d=doc();if(!d||!d.contains(t)||t.closest(".ly-editing")||t.closest("[contenteditable=true]"))return;
    let el=t;while(el&&el!==d){if(el.dataset&&el.dataset.st&&lyStOf(el).abs)break;el=el.parentElement}
    if(!el||el===d)return;
    if(e.shiftKey&&ly.sel&&ly.sel!==el){lyToggleMulti(el);ly.skipClick=Date.now();e.preventDefault();return}   // انتخاب چندتایی
    const inGroup=(ly.multi||[]).length&&(el===ly.sel||ly.multi.includes(el));
    if(!inGroup)lySelect(el);const st=lyStOf(el);
    if(st.lock){e.preventDefault();return}                                                                    // المان قفل‌شده جابه‌جا نمی‌شود
    const grp=inGroup?[ly.sel,...ly.multi].filter(q=>lyStOf(q).abs&&!lyStOf(q).lock).map(q=>({el:q,x:lyStOf(q).x||0,y:lyStOf(q).y||0})):null;
    ly.mv={el,x0:e.clientX,y0:e.clientY,x:st.x||0,y:st.y||0,pushed:false,grp};e.preventDefault();
  });
  document.addEventListener("pointermove",e=>{
    const k=lyZoom()*PX_MM;
    if(ly.mv){const m=ly.mv,dx=(e.clientX-m.x0)/k,dy=(e.clientY-m.y0)/k;if(!m.pushed&&Math.abs(dx)+Math.abs(dy)<0.5)return;
      if(!m.pushed){lyPush();m.pushed=true}
      if(m.grp){m.grp.forEach(g=>{const q=lyStOf(g.el);q.x=lySnapV(g.x+dx);q.y=lySnapV(g.y+dy);lyStyle(g.el,q)});lyOverlay();return}
      const st=lyStOf(m.el);st.x=lySnapV(m.x+dx);st.y=lySnapV(m.y+dy);lyStyle(m.el,st);lyOverlay();const ix=document.querySelector('[data-lst="x"]'),iy=document.querySelector('[data-lst="y"]');if(ix)ix.value=st.x;if(iy)iy.value=st.y}
    else if(ly.rs&&ly.sel){const r=ly.rs,dx=(e.clientX-r.x0)/k,dy=(e.clientY-r.y0)/k,st=lyStOf(ly.sel);let x=r.x,y=r.y,w=r.w,h=r.h;
      if(r.dir.includes("e"))w=r.w+dx;if(r.dir.includes("s"))h=r.h+dy;
      if(r.dir.includes("w")){w=r.w-dx;x=r.x+dx}if(r.dir.includes("n")){h=r.h-dy;y=r.y+dy}
      if(w<3){if(r.dir.includes("w"))x-=3-w;w=3}if(h<3){if(r.dir.includes("n"))y-=3-h;h=3}
      st.x=lySnapV(x);st.y=lySnapV(y);st.w=Math.max(3,lySnapV(w));st.h=Math.max(3,lySnapV(h));lyStyle(ly.sel,st);lyOverlay();
      ["x","y","w","h"].forEach(q=>{const i=document.querySelector(`[data-lst="${q}"]`);if(i)i.value=st[q]})}
  });
  document.addEventListener("pointerup",()=>{if(ly.mv||ly.rs){ly.skipClick=Date.now();ly.mv=null;ly.rs=null;lyOverlay()}});
  document.addEventListener("keydown",e=>{
    if(D.hidden)return;
    const tg=e.target,editing=tg&&(tg.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName));
    if((e.ctrlKey||e.metaKey)&&(e.key.toLowerCase()==="y"||(e.shiftKey&&e.key.toLowerCase()==="z"))&&!editing){e.preventDefault();lyRedo();return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"&&!editing){e.preventDefault();lyUndo();return}
    if(editing)return;
    if(e.key==="Escape"){lySelect(null);return}
    if(e.key==="Delete"&&ly.sel&&ly.sel.dataset.custom==="1"){e.preventDefault();const b=D.querySelector('[data-ly="deltext"]');if(b)b.click();return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="d"&&ly.sel&&ly.sel.dataset.custom==="1"){e.preventDefault();const b=D.querySelector('[data-ly="duptext"]');if(b)b.click();return}
    if(ly.sel&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&/^Arrow/.test(e.key)){
      const st0=lyStOf(ly.sel);
      if(st0.abs){e.preventDefault();if(st0.lock)return;lyPushBurst();const step=e.shiftKey?5:(ly.snap||0.5);
        [ly.sel,...(ly.multi||[])].forEach(q=>{const st=lyStOf(q);if(!st.abs||st.lock)return;
          if(e.key==="ArrowLeft")st.x=(st.x||0)-step;else if(e.key==="ArrowRight")st.x=(st.x||0)+step;else if(e.key==="ArrowUp")st.y=(st.y||0)-step;else st.y=(st.y||0)+step;
          lyStyle(q,st)});
        lyTools();lyOverlay();return}
    }
    if(e.altKey&&ly.sel){
      const m={ArrowUp:"up",ArrowDown:"dn",ArrowRight:"prev",ArrowLeft:"next"}[e.key];
      if(m){e.preventDefault();const b=D.querySelector(`[data-ly="${m}"]`)||D.querySelector(`[data-ly="${m==="up"?"prev":m==="dn"?"next":m==="prev"?"up":"dn"}"]`);if(b)b.click()}
    }
  });
})();
/* ---------- طراح فرم‌ها (تنظیمات) ---------- */
let dz={form:"",defs:[],order:[],extras:[],xf:[]};
function dzProbe(form){
  const B=sampleBuilders()[form];if(!B)return {defs:[]};
  app.sigSeen={};app.probe=true;app.curForm=form;
  try{B()}catch(e){console.warn(e)}finally{app.probe=false;app.curForm=null}
  return {defs:(app.sigSeen[form]||[])};
}
function dzLoad(form){
  dz.form=form;if(!form){dz.defs=[];dz.order=[];dz.extras=[];dz.xf=[];return}
  const pr=dzProbe(form),f=FS(),sel=(f.formSigs||{})[form];
  dz.defs=pr.defs;
  const all=pr.defs.map((l,i)=>({key:"def:"+i,label:l+" (پیش‌فرض فرم)"})).concat(sgList().map(g=>({key:"sig:"+g.id,label:g.title+(g.name?" — "+g.name:"")})));
  const keys=Array.isArray(sel)?sel:pr.defs.map((l,i)=>"def:"+i);
  dz.order=keys.map(k=>({...(all.find(a=>a.key===k)||{key:k,label:k}),on:true})).filter(o=>all.some(a=>a.key===o.key)).concat(all.filter(a=>!keys.includes(a.key)).map(a=>({...a,on:false})));
  dz.extras=((f.formExtras||{})[form]||[]).map(x=>({label:x.label,text:x.text}));
  dz.xf=((f.formFields||{})[form]||[]).map(x=>({label:x.label,src:x.src||"",text:x.text||""}));
}
function dzDraw(){
  const box=$("#dzBody");if(!box)return;
  if(!dz.form){box.innerHTML=`<div class="hint">یک فرم را انتخاب کنید.</div>`;return}
  const src=xfSources(dz.form);
  box.innerHTML=`<div class="dz-sec"><h3>۱) امضاها</h3><div class="hint">تیک = در فرم چاپ شود؛ با دکمه‌های بالا و پایین ترتیب (از راست به چپ) را تعیین کنید. «پیش‌فرض فرم» همان خانه‌های اصلی خود فرم است.</div>
    ${dz.order.map((o,i)=>`<div class="wk-acts u-m-2-0"><label class="u-f1"><input type="checkbox" data-dz="on" data-i="${i}"${o.on?" checked":""}> ${esc(o.label)}</label><button class="btn" data-dz="up" data-i="${i}" title="بالا" aria-label="بالا">${ico("up")}</button><button class="btn" data-dz="dn" data-i="${i}" title="پایین" aria-label="پایین">${ico("chev-d")}</button></div>`).join("")}</div>
    <div class="dz-sec"><h3>۲) فیلدهای اضافه</h3><div class="hint">مثلاً «کد ملی» برای مساعده: عنوان را بنویسید و منبع داده را انتخاب کنید (یا «متن ثابت»). محل دقیق فیلد را در «چیدمان آزاد» تعیین کنید.</div>
    ${dz.xf.map((x,i)=>`<div class="wk-acts u-m-3-0"><input data-dz="xfl" data-i="${i}" placeholder="عنوان فیلد" maxlength="60" value="${esc(x.label)}" class="u-maxw190"><select data-dz="xfs" data-i="${i}"><option value=""${x.src?"":" selected"}>— متن ثابت —</option>${src.map(([k,t])=>`<option value="${k}"${x.src===k?" selected":""}>${esc(t)}</option>`).join("")}</select><input data-dz="xft" data-i="${i}" placeholder="متن ثابت" maxlength="200" value="${esc(x.text)}" class="u-f1"${x.src?" disabled":""}><button class="btn btn-del" data-dz="xfdel" data-i="${i}">حذف</button></div>`).join("")}
    <button class="btn" data-dz="xfadd">+ فیلد اضافه</button></div>
    <div class="dz-sec"><h3>۳) سطرهای متنی اضافه (قبل از امضاها)</h3>
    ${dz.extras.map((x,i)=>`<div class="wk-acts u-m-3-0"><input data-dz="xl" data-i="${i}" placeholder="عنوان" maxlength="60" value="${esc(x.label)}" class="u-maxw190"><input data-dz="xt" data-i="${i}" placeholder="متن" maxlength="300" value="${esc(x.text)}" class="u-f1"><button class="btn btn-del" data-dz="xdel" data-i="${i}">حذف</button></div>`).join("")}
    <button class="btn" data-dz="xadd">+ سطر اضافه</button></div>
    <div class="wk-acts u-mt14"><button class="btn btn-main" data-dz="save">ذخیرهٔ این بخش‌ها</button><button class="btn" data-dz="layout">چیدمان آزاد (ویرایشگر بصری)…</button><button class="btn" data-dz="preview">پیش‌نمایش چاپ</button><span class="sp"></span><button class="btn btn-del" data-dz="reset">بازگشت این فرم به پیش‌فرض</button></div>`;
}
function renderDesigner(){
  const c=$("#dzCard");if(!c)return;
  const sel=$("#dzForm");if(!sel.options.length)sel.innerHTML=`<option value="">— انتخاب فرم —</option>`+Object.entries(FORM_LABELS).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join("");
  $("#sgBody").innerHTML=sgList().map(g=>`<div class="wk-acts u-m-3-0" data-sgid="${esc(g.id)}"><input data-sg="title" placeholder="سمت" maxlength="60" value="${esc(g.title)}" class="u-maxw260"${g.id==="mgr"?" readonly":""}><input data-sg="name" placeholder="نام و نام خانوادگی (اختیاری)" maxlength="60" value="${esc(g.name)}" class="u-maxw240"${g.id==="mgr"?" readonly":""}>${g.id==="mgr"?`<span class="hint">مدیر سربرگ (از «سربرگ و مدیر» تغییر می‌کند)</span>`:`<button class="btn btn-del" data-dz="sgdel">حذف</button>`}</div>`).join("");
  dzDraw();
}
async function dzPut(o,okMsg){try{app.fs=await api("PUT","/api/form-settings",o);if(okMsg)showAlert(okMsg);return true}catch(e){showAlert(e.message);return false}}
async function dzSave(msg){
  const f=FS(),fs={...(f.formSigs||{})},fe={...(f.formExtras||{})},ff={...(f.formFields||{})},keys=dz.order.filter(o=>o.on).map(o=>o.key);
  const isDef=keys.length===dz.defs.length&&keys.every((k,j)=>k==="def:"+j);
  if(isDef)delete fs[dz.form];else fs[dz.form]=keys;
  const ex=dz.extras.filter(x=>x.label.trim()||x.text.trim());if(ex.length)fe[dz.form]=ex;else delete fe[dz.form];
  const xf=dz.xf.filter(x=>x.label.trim());if(xf.length)ff[dz.form]=xf;else delete ff[dz.form];
  return dzPut({formSigs:fs,formExtras:fe,formFields:ff},msg);
}
(function(){
  const C=$("#page-settings");if(!C)return;
  C.addEventListener("change",e=>{
    const t=e.target;if(t.id==="dzForm"){dzLoad(t.value);dzDraw();return}
    const i=+t.dataset.i,k=t.dataset.dz;
    if(k==="on")dz.order[i].on=t.checked;else if(k==="xfs"){dz.xf[i].src=t.value;dzDraw()}
  });
  C.addEventListener("input",e=>{const t=e.target,i=+t.dataset.i,k=t.dataset.dz;
    if(k==="xl")dz.extras[i].label=t.value;else if(k==="xt")dz.extras[i].text=t.value;
    else if(k==="xfl")dz.xf[i].label=t.value;else if(k==="xft")dz.xf[i].text=t.value});
  C.addEventListener("click",async e=>{
    const b=e.target.closest("[data-dz]");if(!b)return;const a=b.dataset.dz,i=+b.dataset.i;
    if(a==="up"&&i>0){[dz.order[i-1],dz.order[i]]=[dz.order[i],dz.order[i-1]];dzDraw()}
    else if(a==="dn"&&i<dz.order.length-1){[dz.order[i+1],dz.order[i]]=[dz.order[i],dz.order[i+1]];dzDraw()}
    else if(a==="xadd"){dz.extras.push({label:"",text:""});dzDraw()}
    else if(a==="xdel"){dz.extras.splice(i,1);dzDraw()}
    else if(a==="xfadd"){dz.xf.push({label:"",src:"",text:""});dzDraw()}
    else if(a==="xfdel"){dz.xf.splice(i,1);dzDraw()}
    else if(a==="preview"){if(dz.form)openFormTemplate(dz.form)}
    else if(a==="layout"){if(dz.form&&await dzSave(""))lyOpen(dz.form)}
    else if(a==="reset"){
      showConfirm("امضاها، فیلدهای اضافه، سطرهای اضافه و چیدمان آزاد این فرم به پیش‌فرض برگردد؟",async()=>{
        const f=FS(),cp=k=>{const o={...(f[k]||{})};delete o[dz.form];return o};
        if(await dzPut({formSigs:cp("formSigs"),formHidden:cp("formHidden"),formExtras:cp("formExtras"),formFields:cp("formFields"),formLayout:cp("formLayout")},"این فرم به پیش‌فرض برگشت.")){dzLoad(dz.form);dzDraw()}
      });
    }
    else if(a==="save"){if(dz.form)await dzSave("ذخیره شد؛ از این پس در چاپ اعمال می‌شود.")}
    else if(a==="sgdel"){b.closest("[data-sgid]").remove()}
    else if(a==="sgadd"){const d=document.createElement("div");d.className="wk-acts u-m-3-0";d.dataset.sgid="c"+Date.now().toString(36);d.innerHTML=`<input data-sg="title" placeholder="سمت" maxlength="60" class="u-maxw260"><input data-sg="name" placeholder="نام و نام خانوادگی (اختیاری)" maxlength="60" class="u-maxw240"><button class="btn btn-del" data-dz="sgdel">حذف</button>`;$("#sgBody").appendChild(d)}
    else if(a==="sgsave"){
      const list=[...$("#sgBody").querySelectorAll("[data-sgid]")].map(r=>({id:r.dataset.sgid,title:r.querySelector('[data-sg="title"]').value.trim(),name:r.querySelector('[data-sg="name"]').value.trim()})).filter(g=>g.id==="mgr"||g.title);
      if(await dzPut({signatories:list},"امضاکنندگان ذخیره شد.")){renderDesigner();if(dz.form){dzLoad(dz.form);dzDraw()}}
    }
  });
})();
