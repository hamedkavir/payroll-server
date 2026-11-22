"use strict";
/* ui/nav.js — منوی کناری، ویرایش منو، جست‌وجوی سریع، ویرایشگر ظاهر صفحه‌های ثبت
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("ui/nav");
/* ---- منوی سمت راست: گروه‌بندی، جمع‌شدن گروه‌ها، ویرایش (عنوان گروه/صفحه، جابه‌جایی، پنهان‌کردن) و جست‌وجوی سریع Ctrl+K ----
   تنظیم هر کاربر روی سرور (users.nav_order با {v:2,...}) ذخیره می‌شود. */
const NAV_DEFAULT=[...document.querySelectorAll(".nav button")].map(b=>b.dataset.page);
const NAV_GROUPS_DEFAULT=[
  {id:"g_home",title:"نمای کلی",items:["dashboard"]},
  {id:"g_hr",title:"پرسنل و فیش حقوقی",items:["personnel","slips","statushistory"]},
  {id:"g_coop",title:"خدمات تعاون",items:["advance","goods","loanform","vefagh","services","loans","emdad","mehr","cheque"]},
  {id:"g_fin",title:"امور مالی",items:["changes","closing","reports"]},
  {id:"g_ins",title:"بیمه",items:["life","insurance","deceased"]},
  {id:"g_inv",title:"انبارداری و تعاریف اولیه",items:["institutions","dcodes","banks","inventory"]},
  {id:"g_acc",title:"حسابداری",items:["schools"]},
  {id:"g_sys",title:"تنظیمات",items:["import","users","settings"]}
];
// عنوان‌های پیش‌فرض منو (وقتی کاربر عنوان دلخواه ندارد)
const NAV_LABELS_DEFAULT={statushistory:"تغییر وضعیت",advance:"مساعده",goods:"فروش کالا",loanform:"ثبت وام",vefagh:"وام وفاق",services:"درخواست نامه",loans:"گزارشات وام",changes:"تغییرات ماهانه",import:"تغذیه فایل ها"};
document.querySelectorAll(".nav button").forEach(b=>{const t=[...b.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());b.dataset.orig=t?t.textContent.trim():b.dataset.page});
function navLabelOf(b){return b.dataset.orig||b.dataset.page}
function navSetLabel(b,txt){const t=[...b.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(t)t.textContent=txt||b.dataset.orig}
function navCfgEff(){
  // اولویت: تنظیم شخصی کاربر ← «پیش‌فرض ذخیره‌شده» (مشترک؛ form_settings.navDefault) ← پیش‌فرض داخلی
  const c=(app.user&&app.user.navCfg)||(app.fs&&app.fs.navDefault)||null;
  const src=c&&Array.isArray(c.groups)?c.groups:NAV_GROUPS_DEFAULT;
  const groups=src.map(g=>({id:g.id,title:g.title,items:(g.items||[]).filter(p=>NAV_DEFAULT.includes(p))}));
  const used=new Set(groups.flatMap(g=>g.items)),rest=NAV_DEFAULT.filter(p=>!used.has(p));
  if(rest.length){let g=groups.find(x=>x.id==="g_other");if(!g){g={id:"g_other",title:"سایر",items:[]};groups.push(g)}g.items.push(...rest)}
  let col=[];try{col=JSON.parse(localStorage.getItem("navCollapsed")||"[]")}catch(e){}   // جمع‌بودن گروه‌ها فقط در همین مرورگر ذخیره می‌شود
  return{groups,hidden:new Set((c&&c.hidden)||[]),labels:c?(c.labels||{}):NAV_LABELS_DEFAULT,collapsed:new Set(col)};
}
function navSyncHeaders(){
  const nav=$(".nav");
  nav.querySelectorAll(".nav-group").forEach(h=>{
    let n=0;for(let e=h.nextElementSibling;e&&!e.classList.contains("nav-group");e=e.nextElementSibling)if(e.tagName==="BUTTON"&&!e.hidden&&!e.classList.contains("navUserHide"))n++;
    h.style.display=n?"":"none";
  });
}
function navRender(){
  const nav=$(".nav"),cfg=navCfgEff();
  nav.querySelectorAll(".nav-group").forEach(x=>x.remove());
  cfg.groups.forEach(g=>{
    if(!g.items.length)return;
    const h=document.createElement("div");h.className="nav-group"+(cfg.collapsed.has(g.id)?" col":"");h.dataset.gid=g.id;
    h.innerHTML=`<span>${esc(g.title||"بدون عنوان")}</span><span class="ar">${ico("chev-d")}</span>`;nav.appendChild(h);
    g.items.forEach(pg=>{const b=nav.querySelector(`button[data-page="${pg}"]`);if(!b)return;nav.appendChild(b);
      b.classList.toggle("navUserHide",cfg.hidden.has(pg));b.classList.toggle("navCol",cfg.collapsed.has(g.id));navSetLabel(b,cfg.labels[pg])});
  });
  navSyncHeaders();
}
function navApplyOrder(){navRender()}
(function(){const nav=$(".nav");new MutationObserver(()=>navSyncHeaders()).observe(nav,{attributes:true,attributeFilter:["hidden"],subtree:true})})();
function navCfgFromEff(cfg){return{groups:cfg.groups.map(g=>({id:g.id,title:g.title,items:[...g.items]})),hidden:[...cfg.hidden],labels:{...cfg.labels},collapsed:[...cfg.collapsed]}}
async function navPutCfg(cfg){
  try{const r=await api("PUT","/api/auth/prefs",{navCfg:cfg});if(app.user)app.user.navCfg=r.navCfg;return true}
  catch(e){showAlert("ذخیرهٔ منو روی سرور ممکن نشد: "+e.message);return false}
}
// جمع/باز کردن گروه با کلیک روی عنوان آن
$(".nav").addEventListener("click",async e=>{
  const h=e.target.closest(".nav-group");if(!h)return;
  const id=h.dataset.gid;let col=[];try{col=JSON.parse(localStorage.getItem("navCollapsed")||"[]")}catch(e){}
  const k=col.indexOf(id);if(k<0)col.push(id);else col.splice(k,1);
  try{localStorage.setItem("navCollapsed",JSON.stringify(col))}catch(e){}
  navRender();
});
// ---- پنجرهٔ ویرایش منو
let nme=null;
function navEditorDraw(){
  const box=$("#nmeBody");if(!box||!nme)return;
  const lab=p=>{const b=document.querySelector(`.nav button[data-page="${p}"]`);return b?navLabelOf(b):p};
  const gopts=gi=>nme.groups.map((g,k)=>`<option value="${k}"${k===gi?" selected":""}>${esc(g.title||"بدون عنوان")}</option>`).join("");
  box.innerHTML=nme.groups.map((g,gi)=>`<div class="nme-g"><div class="nme-gh"><b>گروه</b><input type="text" maxlength="40" data-nme="gt" data-gi="${gi}" value="${esc(g.title)}" placeholder="عنوان گروه"><button class="btn sm" data-nme="gup" data-gi="${gi}" title="بالا" aria-label="بالا">${ico("up")}</button><button class="btn sm" data-nme="gdn" data-gi="${gi}" title="پایین" aria-label="پایین">${ico("chev-d")}</button><button class="btn sm btn-del" data-nme="gdel" data-gi="${gi}" title="گروه حذف می‌شود و صفحه‌هایش به «سایر» می‌روند">حذف گروه</button></div>`
    +g.items.map((p,ii)=>`<div class="nme-i"><label class="u-flex u-gap6 u-ai-center"><input type="checkbox" data-nme="vis" data-p="${p}"${nme.hidden.includes(p)?"":" checked"} title="نمایش در منو"></label><span class="o">${esc(lab(p))}</span><input type="text" maxlength="60" data-nme="lbl" data-p="${p}" value="${esc(nme.labels[p]||"")}" placeholder="عنوان دلخواه (خالی = پیش‌فرض)"><select data-nme="mv" data-p="${p}" data-gi="${gi}" title="انتقال به گروه">${gopts(gi)}</select><button class="btn sm" data-nme="iup" data-gi="${gi}" data-ii="${ii}" title="بالا" aria-label="بالا">${ico("up")}</button><button class="btn sm" data-nme="idn" data-gi="${gi}" data-ii="${ii}" title="پایین" aria-label="پایین">${ico("chev-d")}</button></div>`).join("")
    +(g.items.length?"":'<div class="hint u-mt6">گروه خالی است (نمایش داده نمی‌شود).</div>')+`</div>`).join("");
}
function navEditorOpen(){
  nme=navCfgFromEff(navCfgEff());
  const m=document.createElement("div");m.className="navmodal";m.id="nmeModal";
  m.innerHTML=`<div class="box"><h2 class="u-m0b4">ویرایش منو</h2><p class="hint u-m0">عنوان گروه‌ها و صفحه‌ها را عوض کنید، با دکمه‌های بالا و پایین جابه‌جا کنید، صفحه را به گروه دیگر ببرید یا با تیک نمایش، از منو پنهان کنید. این تنظیم برای حساب خودتان است؛ «ذخیره به‌عنوان پیش‌فرض» آن را برای همهٔ کاربرانی که منوی شخصی ندارند اعمال می‌کند و «بازنشانی» به همان پیش‌فرض برمی‌گردد.</p><div id="nmeBody"></div><div class="wk-acts u-mt14"><button class="btn" data-nme="gadd">+ گروه جدید</button><span class="u-f1"></span><button class="btn btn-main" data-nme="save">ذخیره</button>${canSet("set_forms")?`<button class="btn btn-blue" data-nme="savedef" title="این چیدمان برای همهٔ کاربرانی که منوی شخصی ندارند پیش‌فرض می‌شود">ذخیره به‌عنوان پیش‌فرض</button>${app.fs&&app.fs.navDefault?'<button class="btn" data-nme="deldef">حذف پیش‌فرض ذخیره‌شده</button>':""}`:""}<button class="btn" data-nme="reset">بازنشانی به پیش‌فرض</button><button class="btn" data-nme="close">انصراف</button></div></div>`;
  document.body.appendChild(m);navEditorDraw();
}
document.addEventListener("input",e=>{
  const t=e.target,k=t.dataset&&t.dataset.nme;if(!nme||!k)return;
  if(k==="gt")nme.groups[+t.dataset.gi].title=t.value;
  else if(k==="lbl"){if(t.value.trim())nme.labels[t.dataset.p]=t.value.trim();else delete nme.labels[t.dataset.p]}
});
document.addEventListener("change",e=>{
  const t=e.target,k=t.dataset&&t.dataset.nme;if(!nme||!k)return;
  if(k==="vis"){const p=t.dataset.p,i=nme.hidden.indexOf(p);if(t.checked&&i>=0)nme.hidden.splice(i,1);else if(!t.checked&&i<0)nme.hidden.push(p)}
  else if(k==="mv"){const gi=+t.dataset.gi,to=+t.value,p=t.dataset.p;nme.groups[gi].items=nme.groups[gi].items.filter(x=>x!==p);nme.groups[to].items.push(p);navEditorDraw()}
});
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-nme]");if(!b||!nme||!["BUTTON"].includes(b.tagName))return;
  const k=b.dataset.nme,gi=+b.dataset.gi,ii=+b.dataset.ii;const mv=(a,i,d)=>{const j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]]};
  if(k==="gup"){mv(nme.groups,gi,-1);navEditorDraw()}else if(k==="gdn"){mv(nme.groups,gi,1);navEditorDraw()}
  else if(k==="iup"){mv(nme.groups[gi].items,ii,-1);navEditorDraw()}else if(k==="idn"){mv(nme.groups[gi].items,ii,1);navEditorDraw()}
  else if(k==="gadd"){nme.groups.push({id:"g"+Date.now().toString(36),title:"گروه جدید",items:[]});navEditorDraw()}
  else if(k==="gdel"){const g=nme.groups[gi];let o=nme.groups.find(x=>x.id==="g_other");if(g.items.length&&!o){o={id:"g_other",title:"سایر",items:[]};nme.groups.push(o)}if(o&&o!==g)o.items.push(...g.items);nme.groups.splice(gi,1);navEditorDraw()}
  else if(k==="save"){nme.groups.forEach(g=>{if(!g.title.trim())g.title="بدون عنوان"});if(await navPutCfg(nme)){navRender();nme=null;$("#nmeModal").remove()}}
  else if(k==="savedef"){nme.groups.forEach(g=>{if(!g.title.trim())g.title="بدون عنوان"});if(await dzPut({navDefault:{v:2,groups:nme.groups,hidden:nme.hidden,labels:nme.labels,collapsed:[]}},"این چیدمان به‌عنوان پیش‌فرض منو ذخیره شد.")){navRender()}}
  else if(k==="deldef"){showConfirm("پیش‌فرض ذخیره‌شدهٔ منو حذف شود؟ (منوی پیش‌فرض داخلی برمی‌گردد)",async()=>{if(await dzPut({navDefault:null},"پیش‌فرض ذخیره‌شده حذف شد.")){navRender();const m=$("#nmeModal");if(m){nme=null;m.remove()}}})}
  else if(k==="reset"){showConfirm("منو به گروه‌بندی و ترتیب پیش‌فرض برگردد؟",async()=>{if(await navPutCfg(null)){navRender();nme=null;const m=$("#nmeModal");if(m)m.remove()}})}
  else if(k==="close"){nme=null;$("#nmeModal").remove()}
});
$("#navEdit").innerHTML=ico("edit")+" ویرایش منو";$("#navEdit").title="گروه‌بندی، عنوان‌ها، جابه‌جایی و پنهان‌کردن منوها";
$("#navEdit").addEventListener("click",navEditorOpen);$("#navReset").hidden=true;
// ---- جست‌وجوی سریع صفحه‌ها (Ctrl+K)
function palOpen(){
  if($("#palModal"))return;
  const items=[...document.querySelectorAll(".nav button[data-page]")].filter(b=>!b.hidden).map(b=>({pg:b.dataset.page,t:b.textContent.replace(/F\d+$/,"").trim(),g:(()=>{let e=b.previousElementSibling;while(e&&!e.classList.contains("nav-group"))e=e.previousElementSibling;return e?e.textContent.trim():""})()}));
  const m=document.createElement("div");m.className="navmodal";m.id="palModal";
  // نسخهٔ ۱۲۰: الگوی combobox/listbox (گزینهٔ فعال با aria-activedescendant اعلام می‌شود) و ثبت در dlgOpen
  // (role=dialog، Tab داخل پنجره، Escape، بازگشت Focus به عنصر قبلی وقتی پنجره به هر دلیلی حذف شود)
  m.innerHTML='<div class="pal"><input id="palIn" placeholder="رفتن به صفحه… (مثلاً مساعده)" autocomplete="off" role="combobox" aria-label="رفتن به صفحه" aria-autocomplete="list" aria-expanded="true" aria-controls="palList"><div id="palList" role="listbox" aria-label="صفحه‌ها" class="u-mt8 u-maxh50vh u-ovf-auto"></div></div>';
  document.body.appendChild(m);let cur=0,list=items;
  const nativeRemove=m.remove.bind(m);let release=null;
  m.remove=()=>{if(release){const r=release;release=null;nativeRemove();r()}else nativeRemove()};
  const nz=x=>norm(String(x||"")).toLowerCase();
  const draw=()=>{$("#palList").innerHTML=list.map((x,i)=>`<div class="li${i===cur?" on":""}" id="palOpt${i}" role="option" aria-selected="${i===cur}" data-i="${i}">${esc(x.t)}<small>${esc(x.g)}</small></div>`).join("")||'<div class="hint" role="status">چیزی پیدا نشد.</div>';
    const pin=$("#palIn");if(list[cur])pin.setAttribute("aria-activedescendant","palOpt"+cur);else pin.removeAttribute("aria-activedescendant")};
  const go=i=>{const x=list[i];if(!x)return;m.remove();const b=document.querySelector(`.nav button[data-page="${x.pg}"]`);if(b)b.click()};
  $("#palIn").addEventListener("input",e=>{const q=nz(e.target.value);list=items.filter(x=>!q||nz(x.t+" "+x.g).includes(q));cur=0;draw()});
  $("#palIn").addEventListener("keydown",e=>{
    if(e.key==="Escape"){m.remove()}else if(e.key==="ArrowDown"){cur=Math.min(list.length-1,cur+1);draw();e.preventDefault()}else if(e.key==="ArrowUp"){cur=Math.max(0,cur-1);draw();e.preventDefault()}else if(e.key==="Enter"){go(cur)}
  });
  m.addEventListener("click",e=>{const li=e.target.closest(".li");if(li)go(+li.dataset.i);else if(e.target===m)m.remove()});
  draw();
  release=dlgOpen(m,{box:m.querySelector(".pal"),label:"جست‌وجوی سریع صفحه‌ها",initial:$("#palIn"),onEscape:()=>m.remove()});
}
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();palOpen()}});

/* ===== ویرایشگر ظاهر صفحه‌های ثبت (مساعده، کالا، وام، ...): ترتیب/پنهان‌کردن کارت‌ها + ترتیب/پنهان‌کردن ستون جدول‌ها =====
   ذخیره در form_settings.pageLayout[page] = {cards:{order,hide}, tables:{کلید:{order,hide}}}؛ کلیدها هش عنوان‌ها هستند. */
const WKL_PAGES=["advance","goods","loanform","emdad","mehr","cheque","changes","services","life","insurance"];
const wklState={edit:{},draft:{}},wklObs={};
const wklH=t=>{let h=5381;for(const c of String(t))h=((h<<5)+h+c.charCodeAt(0))|0;return "k"+(h>>>0).toString(36)};
const wklBase=()=>({cards:{order:[],hide:[]},tables:{}});
const wklCur=pg=>wklState.draft[pg]||((FS().pageLayout||{})[pg])||wklBase();
const wklText=el=>{if(el.dataset&&el.dataset.wklOrig!==undefined)return el.dataset.wklOrig;const k=el.cloneNode(true);k.querySelectorAll("svg,.badge,.kbd,.wkl-ctl,.wkl-fctl,small").forEach(x=>x.remove());return k.textContent.trim().replace(/\s+/g," ")};
const wklTxtNode=el=>{for(const n of el.childNodes)if(n.nodeType===3&&n.nodeValue.trim())return n;return null};
function wklRename(el,t){const n=wklTxtNode(el);if(!n)return;if(el.dataset.wklT0===undefined)el.dataset.wklT0=n.nodeValue;n.nodeValue=t?t+" ":el.dataset.wklT0}
function wklSort(els,keys,ord){
  const idx=keys.map((_,i)=>i).sort((a,b)=>{const ia=ord.indexOf(keys[a]),ib=ord.indexOf(keys[b]);return (ia<0?1e6+a:ia)-(ib<0?1e6+b:ib)});
  if(idx.some((v,i)=>v!==i)){const marks=els.map(c=>{const m=document.createComment("");c.replaceWith(m);return m});idx.forEach((ci,i)=>marks[i].replaceWith(els[ci]));return{els:idx.map(i=>els[i]),keys:idx.map(i=>keys[i])}}
  return{els,keys};
}
function wklKeys(els){const seen={};return els.map(e=>{let k=wklH(wklText(e));if(seen[k])k+="_"+(++seen[k]);else seen[k]=1;return k})}
function wklApply(pg){
  const root=$("#wk-"+pg);if(!root)return;
  const ob=wklObs[pg];if(ob)ob.disconnect();
  try{wklDo(pg,root)}catch(e){console.warn("wkl",e)}
  if(ob)ob.observe(root,{childList:true,subtree:true});
}
function wklDo(pg,root){
  const L=wklCur(pg),ed=!!wklState.edit[pg],cards0=L.cards||{order:[],hide:[]};
  root.querySelectorAll(".wkl-ctl,.wkl-fctl,.wkl-bar").forEach(x=>x.remove());
  root.classList.toggle("wklEdit",ed);
  // کارت‌ها (فرزندان مستقیم که h2 دارند)
  let cards=[...root.children].filter(c=>c.classList.contains("card")&&c.querySelector(":scope>h2"));
  cards.forEach(c=>{const h=c.querySelector(":scope>h2");if(h.dataset.wklOrig===undefined)h.dataset.wklOrig=wklText(h)});   // کلید کارت از عنوان اصلی ساخته می‌شود تا با تغییر عنوان، چیدمان ذخیره‌شده از دست نرود
  let keys=wklKeys(cards.map(c=>c.querySelector(":scope>h2")));
  const ord=cards0.order||[];
  const idx=keys.map((_,i)=>i).sort((a,b)=>{const ia=ord.indexOf(keys[a]),ib=ord.indexOf(keys[b]);return (ia<0?1e6+a:ia)-(ib<0?1e6+b:ib)});
  if(idx.some((v,i)=>v!==i)){const marks=cards.map(c=>{const m=document.createComment("");c.replaceWith(m);return m});idx.forEach((ci,i)=>marks[i].replaceWith(cards[ci]));cards=idx.map(i=>cards[i]);keys=idx.map(i=>keys[i])}
  cards.forEach((c,i)=>{
    const hid=(cards0.hide||[]).includes(keys[i]);
    c.classList.toggle("wklHide",hid&&!ed);c.classList.toggle("wklDim",hid&&ed);
    wklRename(c.querySelector(":scope>h2"),(L.titles||{})[keys[i]]||"");
    if(ed){const h=c.querySelector(":scope>h2");h.insertAdjacentHTML("beforeend",`<span class="wkl-ctl"><i data-wkl="cup" data-k="${keys[i]}" title="بالا">▲</i><i data-wkl="cdn" data-k="${keys[i]}" title="پایین">▼</i><i data-wkl="ctitle" data-k="${keys[i]}" title="تغییر عنوان کارت">✎</i><i data-wkl="chide" data-k="${keys[i]}">${hid?"نمایش":"پنهان"}</i></span>`)}
  });
  // جدول‌ها
  const perCard=new Map(),hiddenChips=[];
  root.querySelectorAll("table").forEach(t=>{
    const hr=t.tHead&&t.tHead.rows[0];if(!hr)return;
    const card=t.closest(".card"),ci=cards.indexOf(card),ck=ci>=0?keys[ci]:"root";
    const n=perCard.get(ck)||0;perCard.set(ck,n+1);const tk=ck+"_t"+n;
    const T=(L.tables||{})[tk]||{order:[],hide:[]};
    let ths=[...hr.cells];ths.forEach(th=>{if(th.dataset.wklOrig===undefined)th.dataset.wklOrig=wklText(th)});let tkeys=wklKeys(ths);
    const o=T.order||[],ix=ths.map((_,i)=>i).sort((a,b)=>{const ia=o.indexOf(tkeys[a]),ib=o.indexOf(tkeys[b]);return (ia<0?1e6+a:ia)-(ib<0?1e6+b:ib)});
    if(ix.some((v,i)=>v!==i)){for(const tr of t.rows){if(tr.cells.length!==ths.length)continue;const cs=[...tr.cells];ix.forEach(i=>tr.appendChild(cs[i]))}ths=[...hr.cells];tkeys=ix.map(i=>tkeys[i])}
    const hide=T.hide||[];
    for(const tr of t.rows){if(tr.cells.length!==ths.length)continue;[...tr.cells].forEach((c,j)=>{c.style.display=hide.includes(tkeys[j])?"none":""})}
    ths.forEach((th,j)=>wklRename(th,(T.label||{})[tkeys[j]]||""));
    if(ed)ths.forEach((th,j)=>{if(hide.includes(tkeys[j]))return;th.insertAdjacentHTML("beforeend",`<span class="wkl-ctl"><i data-wkl="tl" data-t="${tk}" data-k="${tkeys[j]}" title="یک ستون به راست">→</i><i data-wkl="tr" data-t="${tk}" data-k="${tkeys[j]}" title="یک ستون به چپ">←</i><i data-wkl="tn" data-t="${tk}" data-k="${tkeys[j]}" title="تغییر عنوان ستون">✎</i><i data-wkl="th" data-t="${tk}" data-k="${tkeys[j]}" title="پنهان‌کردن ستون">✕</i></span>`)});
    ths.forEach((th,j)=>{if(hide.includes(tkeys[j]))hiddenChips.push({tk,k:tkeys[j],t:wklText(th)})});
    t.dataset.wklKeys=JSON.stringify(tkeys);t.dataset.wklKey=tk;
  });
  // فیلدهای فرم‌ها (هر .fgrid): جابه‌جایی، عرض، تغییر عنوان، پنهان‌کردن — کلید فیلد = شناسهٔ کنترل داخل آن
  const gcount={};
  root.querySelectorAll(".fgrid").forEach(g=>{
    if(g.closest(".wkl-bar"))return;
    const card=g.closest(".card"),ci=cards.indexOf(card),ck=ci>=0?keys[ci]:"root",n=gcount[ck]||0;gcount[ck]=n+1;const gk=ck+"_g"+n;
    const G=(L.fields||{})[gk]||{order:[],hide:[],span:{},label:{}};
    const fkOf=f=>{const i=f.querySelector("input[id],select[id],textarea[id]");return i?i.id.replace(/[^A-Za-z0-9_]/g,"_"):null};
    let keyed=[...g.children].filter(f=>f.classList.contains("f")&&fkOf(f)),fkeys=keyed.map(fkOf);
    const sr=wklSort(keyed,fkeys,G.order||[]);keyed=sr.els;fkeys=sr.keys;
    g.dataset.wklG=gk;g.dataset.wklFkeys=JSON.stringify(fkeys);
    keyed.forEach((f,j)=>{
      const k=fkeys[j],hid=(G.hide||[]).includes(k),sp=(G.span||{})[k];
      f.dataset.wklFk=gk+":"+k;
      f.classList.toggle("wklHide",hid&&!ed);f.classList.toggle("wklDim",hid&&ed);
      f.style.gridColumn=sp?"span "+sp:"";
      wklRename(f,(G.label||{})[k]||"");
      const lt=wklTxtNode(f);
      if(hid)hiddenChips.push({fk:true,gk,k,t:lt?lt.nodeValue.trim():k});
      if(ed&&!hid)f.insertAdjacentHTML("afterbegin",`<span class="wkl-fctl"><i data-wkl="fl" data-g="${gk}" data-k="${k}" title="یک خانه به راست">→</i><i data-wkl="fr" data-g="${gk}" data-k="${k}" title="یک خانه به چپ">←</i><i data-wkl="fs" data-g="${gk}" data-k="${k}" title="تغییر عرض فیلد (۱ تا ۴ ستون)">↔ ${sp||(f.classList.contains("span2")?2:1)}</i><i data-wkl="fn" data-g="${gk}" data-k="${k}" title="تغییر عنوان فیلد">✎</i><i data-wkl="fh" data-g="${gk}" data-k="${k}" title="پنهان‌کردن فیلد">✕</i></span>`);
    });
  });
  root.dataset.wklCards=JSON.stringify(keys);
  // نوار بالا (فقط مدیر سیستم)
  const canEdit=!!(app.user&&app.user.isAdmin);
  if(ed){
    const hc=(cards0.hide||[]).map((k,i)=>{const j=keys.indexOf(k);return j<0?"":`<i data-wkl="cshow" data-k="${k}">کارت «${esc(wklText(cards[j].querySelector(":scope>h2")))}» ✕</i>`}).join("");
    root.insertAdjacentHTML("afterbegin",`<div class="card wkl-bar"><b>ویرایش ظاهر صفحه</b> (فقط مدیر؛ بعد از «ذخیره» برای همهٔ کاربران اعمال می‌شود) — کارت‌ها: ▲▼ جابه‌جایی، ✎ تغییر عنوان، پنهان؛ فیلدها: → ← جابه‌جایی، ↔ عرض (۱ تا ۴ ستون)، ✎ تغییر عنوان، ✕ پنهان؛ ستون جدول‌ها: → ← جابه‌جایی، ✎ تغییر عنوان، ✕ پنهان.<div class="wk-acts u-mt8"><button class="btn btn-main" data-wkl="save">ذخیرهٔ ظاهر صفحه</button><button class="btn btn-blue" data-wkl="savedef">ذخیره به‌عنوان پیش‌فرض</button><button class="btn" data-wkl="usedef">اعمال پیش‌فرض ذخیره‌شده</button><button class="btn" data-wkl="reset">بازنشانی</button><button class="btn" data-wkl="done">پایان</button></div>${(hc||hiddenChips.length)?`<div class="chips"><span class="hint">پنهان‌ها (برای نمایش دوباره کلیک کنید):</span>${hc}${hiddenChips.map(x=>x.fk?`<i data-wkl="fshow" data-g="${x.gk}" data-k="${x.k}">فیلد «${esc(x.t)}»</i>`:`<i data-wkl="tshow" data-t="${x.tk}" data-k="${x.k}">ستون «${esc(x.t)}»</i>`).join("")}</div>`:""}</div>`);
  }else if(canEdit){
    const tabs=root.querySelector(":scope>.rp-tabs");
    if(tabs)tabs.insertAdjacentHTML("beforeend",`<button class="wkl-ctl wkl-entry" data-wkl="edit" title="چیدمان کارت‌ها و ستون جدول‌ها">${ico("edit")} ظاهر صفحه</button>`);
    else root.insertAdjacentHTML("afterbegin",`<div class="wkl-ctl u-flex u-jc-end u-mb6"><button class="btn sm wkl-entry" data-wkl="edit" title="چیدمان کارت‌ها و ستون جدول‌ها">${ico("edit")} ظاهر صفحه</button></div>`);
  }
}
(function(){
  WKL_PAGES.forEach(pg=>{
    const root=$("#wk-"+pg);if(!root)return;let q=0;
    wklObs[pg]=new MutationObserver(()=>{if(q)return;q=requestAnimationFrame(()=>{q=0;wklApply(pg)})});
    wklObs[pg].observe(root,{childList:true,subtree:true});
  });
  const mv=(a,k,d)=>{const i=a.indexOf(k),j=i+d;if(i<0||j<0||j>=a.length)return a;[a[i],a[j]]=[a[j],a[i]];return a};
  const tog=(a,k)=>{const i=a.indexOf(k);if(i<0)a.push(k);else a.splice(i,1)};
  document.addEventListener("click",async e=>{
    const b=e.target.closest("[data-wkl]");if(!b)return;
    const root=b.closest("[id^=wk-]");if(!root)return;const pg=root.id.slice(3);if(!WKL_PAGES.includes(pg))return;
    e.preventDefault();e.stopPropagation();
    const a=b.dataset.wkl,k=b.dataset.k,tk=b.dataset.t,gk=b.dataset.g;
    if(!(app.user&&app.user.isAdmin)){showAlert("تغییر ظاهر صفحه‌ها فقط برای مدیر سیستم مجاز است.");return}
    const D=()=>{if(!wklState.draft[pg])wklState.draft[pg]=JSON.parse(JSON.stringify(wklCur(pg)));const d=wklState.draft[pg];d.cards=d.cards||{order:[],hide:[]};d.tables=d.tables||{};d.titles=d.titles||{};d.fields=d.fields||{};return d};
    const TD=d=>{const t=d.tables[tk]=d.tables[tk]||{order:[],hide:[]};t.label=t.label||{};return t};
    const FD=d=>{const g=d.fields[gk]=d.fields[gk]||{order:[],hide:[],span:{},label:{}};g.order=g.order||[];g.hide=g.hide||[];g.span=g.span||{};g.label=g.label||{};return g};
    const fldKeys=()=>{const g=root.querySelector(`.fgrid[data-wkl-g="${gk}"]`);return g?JSON.parse(g.dataset.wklFkeys||"[]"):[]};
    const ask=(title,cur,done)=>openDlg({title,html:dlgField("عنوان جدید (خالی = عنوان اصلی)","t",cur),onOk:async dl=>{done(dv(dl,"t").trim().slice(0,60));wklApply(pg)}});
    const curKeys=()=>JSON.parse(root.dataset.wklCards||"[]");
    const tblKeys=()=>{const t=root.querySelector(`table[data-wkl-key="${tk}"]`);return t?JSON.parse(t.dataset.wklKeys||"[]"):[]};
    if(a==="edit"){wklState.edit[pg]=true;wklState.draft[pg]=JSON.parse(JSON.stringify(wklCur(pg)))}
    else if(a==="done"){wklState.edit[pg]=false;delete wklState.draft[pg]}
    else if(a==="cup"||a==="cdn"){const d=D();d.cards.order=mv(curKeys(),k,a==="cup"?-1:1)}
    else if(a==="chide"){const d=D();d.cards.order=curKeys();tog(d.cards.hide=d.cards.hide||[],k)}
    else if(a==="cshow"){const d=D();d.cards.hide=(d.cards.hide||[]).filter(x=>x!==k)}
    else if(a==="tl"||a==="tr"){const d=D(),T=TD(d);T.order=mv(tblKeys(),k,a==="tl"?-1:1)}
    else if(a==="th"){const d=D(),T=TD(d);T.order=tblKeys();tog(T.hide=T.hide||[],k)}
    else if(a==="tshow"){const d=D(),T=TD(d);T.hide=(T.hide||[]).filter(x=>x!==k)}
    else if(a==="fl"||a==="fr"){const d=D(),F=FD(d);F.order=mv(fldKeys(),k,a==="fl"?-1:1)}
    else if(a==="fh"){const d=D(),F=FD(d);F.order=fldKeys();tog(F.hide,k)}
    else if(a==="fshow"){const d=D(),F=FD(d);F.hide=F.hide.filter(x=>x!==k)}
    else if(a==="fs"){const d=D(),F=FD(d),f=root.querySelector(`[data-wkl-fk="${gk}:${k}"]`),cur=F.span[k]||(f&&f.classList.contains("span2")?2:1);F.order=fldKeys();F.span[k]=cur>=4?1:cur+1}
    else if(a==="fn"){const d=D(),F=FD(d),f=root.querySelector(`[data-wkl-fk="${gk}:${k}"]`),n=f&&wklTxtNode(f);ask("تغییر عنوان فیلد",n?n.nodeValue.trim():"",v=>{if(v)F.label[k]=v;else delete F.label[k]});return}
    else if(a==="ctitle"){const d=D(),h=[...root.children].filter(c=>c.classList.contains("card")&&c.querySelector(":scope>h2")).map(c=>c.querySelector(":scope>h2")).find((x,i)=>curKeys()[i]===k),n=h&&wklTxtNode(h);ask("تغییر عنوان کارت",n?n.nodeValue.trim():"",v=>{if(v)d.titles[k]=v;else delete d.titles[k]});return}
    else if(a==="tn"){const d=D(),T=TD(d),t=root.querySelector(`table[data-wkl-key="${tk}"]`),th=t&&[...t.tHead.rows[0].cells][tblKeys().indexOf(k)],n=th&&wklTxtNode(th);ask("تغییر عنوان ستون",n?n.nodeValue.trim():"",v=>{if(v)T.label[k]=v;else delete T.label[k]});return}
    else if(a==="save"||a==="savedef"){
      const d=D(),pl={...(FS().pageLayout||{}),[pg]:d},o={pageLayout:pl};
      if(a==="savedef")o.pageLayoutSaved={...(FS().pageLayoutSaved||{}),[pg]:d};
      if(await dzPut(o,a==="savedef"?"ظاهر فعلی به‌عنوان پیش‌فرض ذخیره شد.":"ظاهر صفحه ذخیره شد.")){wklState.edit[pg]=false;delete wklState.draft[pg]}
    }
    else if(a==="usedef"){
      const sv=(FS().pageLayoutSaved||{})[pg];if(!sv){showAlert("هنوز پیش‌فرضی برای این صفحه ذخیره نکرده‌اید.");return}
      if(await dzPut({pageLayout:{...(FS().pageLayout||{}),[pg]:sv}},"پیش‌فرض ذخیره‌شده اعمال شد.")){wklState.edit[pg]=false;delete wklState.draft[pg]}
    }
    else if(a==="reset"){
      showConfirm("چیدمان کارت‌ها و ستون‌های این صفحه به حالت اولیه برگردد؟",async()=>{const o={...(FS().pageLayout||{})};delete o[pg];if(await dzPut({pageLayout:o},"به حالت اولیه برگشت.")){wklState.edit[pg]=false;delete wklState.draft[pg];wklApply(pg);try{await renderWk(pg)}catch(x){}}});
      return;
    }
    wklApply(pg);
    if(a==="save"||a==="savedef"||a==="usedef"||a==="done")try{await renderWk(pg)}catch(x){}
  },true);
})();

