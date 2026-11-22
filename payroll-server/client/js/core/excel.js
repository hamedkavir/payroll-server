"use strict";
/* core/excel.js — خروجی اکسل، نمودار اکسل، فایل‌های نمونه
   بخشی از تفکیک مرحله‌ای app.js (نسخهٔ ۱۱۱): اسکریپت کلاسیک با دامنهٔ سراسری مشترک؛ ترتیب بارگذاری در payslip-online.html مهم است. */
psModule("core/excel");
/* ====================== خروجی اکسل (SheetJS) ====================== */
/* ستون‌های مبلغ در همهٔ خروجی‌های اکسل: قالب عددی با جداکنندهٔ هزارگان (#,##0)؛ شناسایی بر اساس عنوان ستون */
function xlsIsMoneyHeader(h){
  h=String(h==null?"":h).replace(/\u200c/g," ").trim();
  if(/^(تعداد|شماره|ردیف|کد|سال|ماه|تاریخ|ساعت|شروع|وضعیت|اقساط باقی|نام|نوع)/.test(h))return false;
  return /(مبلغ|سرمایه|مانده|جمع|کارمزد|قیمت|پیش ?پرداخت|ریال|بدهی|خالص|سهم کارفرما)/.test(h)||/^کسر ماه/.test(h)||/^(مساعده|کالا|وام)$/.test(h);
}
function xlsMoney(ws,headers){
  headers.forEach((h,c)=>{
    if(!xlsIsMoneyHeader(h))return;
    for(let r=1;;r++){
      const cell=ws[XLSX.utils.encode_cell({r,c})];
      if(cell===undefined){if(r>(ws["!ref"]?XLSX.utils.decode_range(ws["!ref"]).e.r:0))break;continue}
      if(cell.t==="n")cell.z="#,##0";
    }
  });
}
/* ---- تزریق نمودار واقعی اکسل (ستونی + خطی با محور دوم) به فایل xlsx تولیدشده با SheetJS ----
   SheetJS نسخهٔ رایگان نمودار نمی‌سازد؛ فایل zip را می‌خوانیم، اجزای drawing/chart را اضافه می‌کنیم و دوباره (بدون فشرده‌سازی) zip می‌کنیم. */
const XC_CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function xcCrc(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=XC_CRC[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
async function xcUnzip(buf){
  const u=new Uint8Array(buf),dv=new DataView(u.buffer,u.byteOffset,u.byteLength);
  let e=u.length-22;while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;
  if(e<0)throw new Error("zip");
  const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const out=new Map();
  for(let i=0;i<n;i++){
    const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lho=dv.getUint32(p+42,true);
    const name=new TextDecoder().decode(u.subarray(p+46,p+46+nl));
    const ds=lho+30+dv.getUint16(lho+26,true)+dv.getUint16(lho+28,true);
    let d=u.subarray(ds,ds+csize);
    if(method===8)d=new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    else if(method!==0)throw new Error("zip method");
    if(!name.endsWith("/"))out.set(name,d);
    p+=46+nl+xl+cl;
  }
  return out;
}
function xcZip(map){
  const enc=new TextEncoder(),parts=[],cd=[];let off=0;
  for(const [name,data] of map){
    const nb=enc.encode(name),crc=xcCrc(data);
    const lh=new Uint8Array(30+nb.length),v=new DataView(lh.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(8,0,true);v.setUint16(10,0,true);v.setUint16(12,0x21,true);
    v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,nb.length,true);v.setUint16(28,0,true);lh.set(nb,30);
    const ch=new Uint8Array(46+nb.length),c=new DataView(ch.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,0,true);c.setUint16(14,0x21,true);
    c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,nb.length,true);c.setUint32(42,off,true);ch.set(nb,46);
    parts.push(lh,data);cd.push(ch);off+=lh.length+data.length;
  }
  const cdSize=cd.reduce((s,x)=>s+x.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,map.size,true);ev.setUint16(10,map.size,true);ev.setUint32(12,cdSize,true);ev.setUint32(16,off,true);
  return new Blob([...parts,...cd,end],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
const xcEsc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const xcAbs=r=>r.replace(/([A-Z]+)(\d+)/g,"$$$1$$$2");
function xcChartXml(ch){
  const sh="'"+String(ch.sheetName).replace(/'/g,"''")+"'!",A=r=>sh+xcAbs(r);
  const cat=ch.cats?`<c:cat><c:strRef><c:f>${xcEsc(A(ch.cats.ref))}</c:f><c:strCache><c:ptCount val="${ch.cats.vals.length}"/>${ch.cats.vals.map((v,i)=>`<c:pt idx="${i}"><c:v>${xcEsc(v)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef></c:cat>`:"";
  const ser=(s,i,line)=>`<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${xcEsc(A(s.nameRef))}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xcEsc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`
    +(line?`<c:spPr><a:ln w="31750" cap="rnd"><a:solidFill><a:srgbClr val="${s.color||"F59E0B"}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="22225"><a:solidFill><a:srgbClr val="${s.color||"F59E0B"}"/></a:solidFill></a:ln></c:spPr></c:marker>`
      :`<c:spPr><a:solidFill><a:srgbClr val="${s.color||"2563EB"}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`)
    +`<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:showLegendKey val="0"/><c:showVal val="${s.labels?1:0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
    +cat+`<c:val><c:numRef><c:f>${xcEsc(A(s.ref))}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${s.vals.length}"/>${s.vals.map((v,k)=>`<c:pt idx="${k}"><c:v>${Number(v)||0}</c:v></c:pt>`).join("")}</c:numCache></c:numRef></c:val>`+(line?`<c:smooth val="0"/>`:"")+`</c:ser>`;
  const bars=ch.series.filter(s=>s.type!=="line"),lines=ch.series.filter(s=>s.type==="line");
  let idx=0;
  const barXml=bars.length?`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${bars.map(s=>ser(s,idx++,false)).join("")}<c:gapWidth val="60"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>`:"";
  const sec=lines.length&&bars.length;
  const lineXml=lines.length?`<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lines.map(s=>ser(s,idx++,true)).join("")}<c:marker val="1"/><c:axId val="${sec?5003:5001}"/><c:axId val="${sec?5004:5002}"/></c:lineChart>`:"";
  const txPr=`<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="fa-IR"/></a:p></c:txPr>`;
  const catAx=(id,cross,del)=>`<c:catAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${del?1:0}"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${txPr}<c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const valAx=(id,cross,pos,title,right)=>`<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${right?"":'<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>'}`
    +(title?`<c:title><c:tx><c:rich><a:bodyPr rot="-5400000" vert="horz"/><a:p><a:pPr><a:defRPr sz="900" b="0"/></a:pPr><a:r><a:rPr lang="fa-IR" sz="900" b="0"/><a:t>${xcEsc(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`:"")
    +`<c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${txPr}<c:crossAx val="${cross}"/><c:crosses val="${right?"max":"autoZero"}"/><c:crossBetween val="between"/></c:valAx>`;
  const axes=(bars.length?catAx(5001,5002,false)+valAx(5002,5001,"l",ch.axisTitles&&ch.axisTitles[0],false):catAx(5001,5002,false)+valAx(5002,5001,"l",ch.axisTitles&&ch.axisTitles[0],false))
    +(sec?catAx(5003,5004,true)+valAx(5004,5003,"r",ch.axisTitles&&ch.axisTitles[1],true):"");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="fa-IR" sz="1200" b="1"/><a:t>${xcEsc(ch.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${barXml}${lineXml}${axes}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}
function xcDrawingXml(charts){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`+charts.map((c,i)=>{const [c0,r0,c1,r1]=c.anchor;
    return `<xdr:twoCellAnchor><xdr:from><xdr:col>${c0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i+2}" name="Chart ${i+1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i+1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`}).join("")+`</xdr:wsDr>`;
}
/* buf: ArrayBuffer فایل xlsx؛ charts: [{sheet:۱-مبنا, sheetName, title, anchor:[c0,r0,c1,r1], cats:{ref,vals}, series:[{nameRef,name,ref,vals,type,color,labels}], axisTitles}] → Blob */
async function xlsxAddCharts(buf,charts){
  const files=await xcUnzip(buf),td=new TextDecoder(),te=new TextEncoder();
  const bySheet={};charts.forEach(c=>(bySheet[c.sheet]=bySheet[c.sheet]||[]).push(c));
  let ct=td.decode(files.get("[Content_Types].xml")),n=0,d=0;
  for(const [sheet,list] of Object.entries(bySheet)){
    d++;const sp=`xl/worksheets/sheet${sheet}.xml`;let sx=td.decode(files.get(sp));
    if(!/xmlns:r=/.test(sx))sx=sx.replace(/<worksheet\b/,'<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
    const relPath=`xl/worksheets/_rels/sheet${sheet}.xml.rels`;let rel=files.has(relPath)?td.decode(files.get(relPath)):'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    const rid="rIdDr"+d;
    rel=rel.replace("</Relationships>",`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${d}.xml"/></Relationships>`);
    files.set(relPath,te.encode(rel));
    sx=sx.replace(/<\/worksheet>\s*$/,`<drawing r:id="${rid}"/></worksheet>`);files.set(sp,te.encode(sx));
    files.set(`xl/drawings/drawing${d}.xml`,te.encode(xcDrawingXml(list)));
    let drel='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    list.forEach((c,i)=>{n++;files.set(`xl/charts/chart${n}.xml`,te.encode(xcChartXml(c)));drel+=`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/>`;ct=ct.replace("</Types>",`<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`)});
    files.set(`xl/drawings/_rels/drawing${d}.xml.rels`,te.encode(drel+"</Relationships>"));
    ct=ct.replace("</Types>",`<Override PartName="/xl/drawings/drawing${d}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  }
  files.set("[Content_Types].xml",te.encode(ct));
  return xcZip(files);
}

// ذخیرهٔ workbook با نمودارهای واقعی اکسل؛ اگر مرورگر پشتیبانی نکند (یا خطا شود) فایل بدون نمودار ذخیره می‌شود
async function xlsxSaveCharts(wb,filename,charts){
  if(!charts||!charts.length||typeof DecompressionStream==="undefined"){XLSX.writeFile(wb,filename);return false}
  try{
    const arr=XLSX.write(wb,{bookType:"xlsx",type:"array"});
    const blob=await xlsxAddCharts(arr.buffer?arr.buffer.slice(arr.byteOffset,arr.byteOffset+arr.byteLength):arr,charts);
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);return true;
  }catch(e){console.warn("chart inject failed",e);XLSX.writeFile(wb,filename);return false}
}
async function xlsxMulti(filename,sheets){
  await ensureXLSX(8000);
  const wb=XLSX.utils.book_new();wb.Workbook={Views:[{RTL:true}]};
  for(const sh of sheets){
    const ws=XLSX.utils.aoa_to_sheet([sh.H].concat(sh.rows));
    ws["!cols"]=sh.H.map((h,i)=>({wch:(sh.widths&&sh.widths[i])||Math.max(14,String(h).length+4)}));
    xlsMoney(ws,sh.H);
    XLSX.utils.book_append_sheet(wb,ws,String(sh.name).slice(0,31));
  }
  XLSX.writeFile(wb,filename);
}
/* ---------- فایل‌های نمونه (SampleFile) برای هر بخش بارگذاری ---------- */
// هر فایل نمونه دو برگه دارد: «نمونه» (عنوان ستون‌ها دقیقاً مطابق شناسایی برنامه + چند ردیف نمایشی) و «راهنما» (توضیح ستون‌ها)
function sampleSpec(kind){
  const G=(H,notes)=>({name:"راهنما",H:["ستون","توضیح"],rows:H.map(h=>[h,notes[h]||""]),widths:[34,80]});
  if(kind==="active"){
    const H=["کد پرسنلی","نام","نام خانوادگی","کد ملی","نوع استخدام","واحد سازمانی","مرکز هزینه","منطقه خدمت","کد منطقه خدمت","کارکرد عادی","سمت","حقوق پایه-101","فوق العاده شغل-102","حق اولاد-103","جمع مزایا","مالیات-901","بیمه سهم کارمند-902","اقساط وام-910","جمع کسور","بیمه سهم کارفرما-950","مجموع تعهدات کارفرما","خالص پرداختی"];
    return{file:"SampleFile-active-payslip.xlsx",sheets:[{name:"نمونه",H,rows:[["1001","نمونه","یک","0012345678","رسمی","دبستان نمونه","1","قزوین","10",30,"معلم",30000000,5000000,2000000,37000000,1500000,2500000,3000000,7000000,5000000,5000000,30000000],["1002","نمونه","دو","0023456789","پیمانی","دبیرستان نمونه","1","قزوین","10",30,"دبیر",25000000,4000000,0,29000000,1000000,2000000,0,3000000,4000000,4000000,26000000]],widths:[12,12,14,14,12,18,10,12,12,10,12,16,18,14,14,14,18,16,14,20,20,16]},
      G(H,{"کد پرسنلی":"الزامی؛ کلید ثابت فرد","نام":"الزامی (یا ستون «نام و نام خانوادگی»)","نام خانوادگی":"الزامی","کد ملی":"","جمع مزایا":"اگر با مجموع ستون‌های مزایا فرق داشته باشد، اختلاف به‌صورت «سایر مزایا» اضافه می‌شود","جمع کسور":"مجموع کسورات","مجموع تعهدات کارفرما":"جمع ستون‌های «سهم کارفرما»","خالص پرداختی":"جمع مزایا منهای جمع کسور","حقوق پایه-101":"ستون‌های مزایا و کسورات با «عنوان-کد» نوشته می‌شوند؛ عنوان و کد از خود ستون خوانده می‌شود"})]};
  }
  if(kind==="retiree"){
    const H=["سال","ماه","پرسنلی","کد ملی","نام","نام خانوادگی","شماره حساب","شماره شبا","منطقه","دفتر کل","ردیف ورثه","کد کسر و پرداخت","عنوان کسر","ردیف صندوق","سری","مبلغ وام","مبلغ قسط","مبلغ مانده"];
    const b=["1405","7","2001","0023456789","نمونه","بازنشسته","0000000000000","IR000000000000000000000000","1","2250","0"];
    return{file:"SampleFile-retiree-payslip.xlsx",sheets:[{name:"نمونه",H,rows:[[...b,"1","حقوق بازنشستگی","","",0,25000000,0],[...b,"2","مالیات","","",0,-1000000,0],[...b,"3","اقساط وام","1","5",20000000,-2000000,12000000]],widths:[8,8,12,14,12,14,18,30,10,10,10,14,20,12,8,14,14,14]},
      G(H,{"سال":"باید با سال دورهٔ انتخاب‌شده یکی باشد (وگرنه بارگذاری رد می‌شود)","ماه":"باید با ماه دورهٔ انتخاب‌شده یکی باشد","پرسنلی":"الزامی؛ کد پرسنلی (چند وارث ممکن است کد مشترک داشته باشند)","شماره شبا":"با شبای معتبر، در جدول پرسنل هم ذخیره می‌شود","دفتر کل":"در مشخصات هویتی پرسنل نمایش داده می‌شود","ردیف ورثه":"۰ = خود بازنشسته؛ ۱ و بیشتر = وارث","کد کسر و پرداخت":"الزامی","عنوان کسر":"الزامی (شرح ردیف)","مبلغ قسط":"الزامی؛ مبلغ مثبت = پرداخت، مبلغ منفی = کسر"})]};
  }
  if(kind==="loan"){
    const H=["کد پرسنلی","عنوان وام","کد وام","ردیف وام","مبلغ هر قسط","باقیمانده وام","اصل وام","تاریخ کسر اقساط"];
    return{file:"SampleFile-loan-installments.xlsx",sheets:[{name:"نمونه",H,rows:[["1001","وام صندوق تعاون","710","1",3000000,12000000,30000000,"1405/07/10"],["1002","مساعده","733","7",1500000,0,3000000,"1405/07/10"]],widths:[12,22,10,10,16,16,16,16]},
      G(H,{"کد پرسنلی":"الزامی","مبلغ هر قسط":"الزامی","باقیمانده وام":"برای تشخیص اتمام قسط (کد ۷۱۰ با مانده صفر)","تاریخ کسر اقساط":"اگر این ستون باشد، ماهِ غالب آن باید با دورهٔ انتخاب‌شده یکی باشد"})]};
  }
  if(kind==="personnel"){
    // ساختار فایل کارگزینی (140202_-_Kargozini.xlsx)
    const H=["کد پرسنلی","کد ملی","دفتر کل","نام","نام خانوادگی","جنسیت","نام پدر","شماره شناسنامه","محل تولد","تاریخ تولد","وضعیت تاهل","موبایل","نام بانک","شماره شبا","شماره حساب","شماره حساب مساعده","نام صاحب حساب مساعده","وضعیت شغلی","نوع استخدام","کد واحد سازمانی","واحد سازمانی","پست","شغل","سابقه","رتبه شغلی","گروه کاری","رشته تحصیلی","مدرک تحصیلی","بیمه","کد بیمه","اولاد مشمول","ایثارگری"];
    return{file:"SampleFile-personnel-kargozini.xlsx",sheets:[{name:"Personel",H,rows:[["1001","0012345678","","نام","نمونه","مرد","پدر نمونه","123","شهر نمونه","1360/01/01","مجرد","09120000000","بانک نمونه","IR000000000000000000000000","0000000000000","","","شاغل","رسمی","1","واحد نمونه","سمت نمونه","شغل نمونه",1,"1","1","رشته نمونه","کارشناسی","بیمه نمونه","1",0,""],["1002","0012345679","","نام","نمونه","زن","پدر نمونه","124","شهر نمونه","1363/01/01","مجرد","09120000001","بانک نمونه","IR000000000000000000000000","0000000000000","","","بازنشسته","بازنشسته","2","واحد نمونه","سمت نمونه","شغل نمونه",2,"1","1","رشته نمونه","کارشناسی","بیمه نمونه","1",0,""]],widths:H.map(()=>16)},
      G(H,{"کد پرسنلی":"الزامی؛ کلید ثابت فرد","نام":"الزامی","نام خانوادگی":"الزامی","دفتر کل":"در مشخصات هویتی پرسنل نمایش داده می‌شود (بازنشستگان)","موبایل":"با یا بدون صفر اول (۱۰ رقم با ۹ ← صفر اول اضافه می‌شود)","شماره شبا":"IR + ۲۴ رقم؛ اگر معتبر باشد ذخیره می‌شود و ۱۳ رقم آخرش شمارهٔ حساب می‌شود","شماره حساب":"۱۳ رقم","شماره حساب مساعده":"۱۳ رقم؛ اگر ۱۲ رقم باشد (صفر اول در اکسل افتاده) صفر اول اضافه می‌شود؛ در فیش نمی‌آید","نام صاحب حساب مساعده":"نام دارندهٔ حساب مساعده (ممکن است غیر از خود فرد باشد)","وضعیت شغلی":"شاغل / بازنشسته / وظیفه بگیر / قطع رابطه (فوتی ← قطع رابطه)","واحد سازمانی":"به‌عنوان «محل خدمت» ثبت می‌شود","کد واحد سازمانی":"به‌عنوان «کد محل خدمت» ثبت می‌شود","پست":"پست اصلی","سابقه":"سابقهٔ دولتی (سال)","بیمه":"نوع بیمه"})]};
  }
  if(kind==="update"){
    const H=["کد پرسنلی","نام","نام خانوادگی","نام پدر","کد ملی","شماره شناسنامه","تاریخ تولد","محل تولد","جنسیت","آخرین وضعیت تاهل","نوع استخدام","مدرک تحصیلی","رشته تحصیلی","نام بانک","وضعیت پرسنل","عنوان پست","واحد سازمانی","بیمه","شماره حساب یا شبا"];
    return{file:"SampleFile-personnel-update.xlsx",sheets:[{name:"نمونه",H,rows:[["1001","نمونه","یک","پدر","0012345678","123","1360/05/10","قزوین","مرد","متأهل","رسمی","لیسانس","ریاضی","ملی","فعال","معلم","دبستان نمونه","تأمین اجتماعی","IR000000000000000000000000"]],widths:H.map(()=>16)},
      G(H,{"کد پرسنلی":"الزامی؛ فقط افراد موجود به‌روز می‌شوند (یا ساخته می‌شوند اگر تیک «افراد ناموجود اضافه شوند» روشن باشد)","وضعیت پرسنل":"فعال ← شاغل، غیرفعال ← قطع رابطه (فقط برای افراد جدید؛ وضعیت افراد موجود عوض نمی‌شود)","شماره حساب یا شبا":"شبا (IR + ۲۴ رقم) یا حساب ۱۳ رقمی؛ برای بازنشسته‌های سیستم، به‌جای حساب/شبا، «حساب مساعده» ثبت می‌شود","—":"این سه فایل (کارگزینی، بیمه، حساب/شبا) می‌توانند جدا باشند؛ هرکدام فقط به ستون «کد پرسنلی» و ستون‌های مورد نظر نیاز دارد"})]};
  }
  if(kind==="schools"){
    const H=SC_FIELDS.map(c=>c[1]);
    return{file:"SampleFile-schools.xlsx",sheets:[{name:"نمونه",H,rows:[["10000001","دبستان نمونه","شهری","دخترانه","دوره ابتدایی","دولتی عادی","قزوین، خیابان نمونه","00000000","نام","نام‌خانوادگی","09120000000","مستقل","00000000000","3400000000","ثابت صبح","","12","300","0000000000000",""]],widths:H.map(()=>18)},
      G(H,{"کد آموزشگاه":"الزامی؛ کلید یکتا (آموزشگاه موجود هم‌کد به‌روز می‌شود)","نام آموزشگاه":"الزامی","شماره حساب":"۱۳ رقم"})]};
  }
  return null;
}
async function downloadSample(kind){
  const sp=sampleSpec(kind);if(!sp)return;
  try{await xlsxMulti(sp.file,sp.sheets)}catch(e){showAlert("ساخت فایل نمونه ممکن نشد: "+e.message)}
}
document.addEventListener("click",e=>{const a=e.target.closest("[data-sample]");if(a){e.preventDefault();e.stopPropagation();downloadSample(a.dataset.sample)}},true);
async function xlsxExport(filename,sheetName,headers,rows,widths){
  return xlsxMulti(filename,[{name:sheetName,H:headers,rows,widths}]);
}
const PX_COLS=[["code","شمارهٔ پرسنلی"],["nationalId","کد ملی"],["firstName","نام"],["lastName","نام خانوادگی"],["fatherName","نام پدر"],["idNumber","شمارهٔ شناسنامه"],["birthDate","تاریخ تولد"],["birthPlace","محل تولد"],["mobile","موبایل"],["gender","جنسیت"],["maritalStatus","وضعیت تأهل"],["coveredChildren","فرزندان تحت پوشش"],["education","مدرک تحصیلی"],["fieldOfStudy","رشته تحصیلی"],["insuranceType","نوع بیمه"],["employmentType","نوع استخدام"],["veteranType","وضعیت ایثارگری"],["jobTitle","عنوان شغلی"],["workplace","محل خدمت"],["workplaceCode","کد محل خدمت"],["govtServiceYears","سنوات خدمت دولتی"],["status","وضعیت"],["currentStatus","وضعیت جاری"],["bankName","نام بانک"],["bankAccount","حساب بانکی"],["advanceAccount","حساب مساعده"],["mehrAccount","حساب بانک مهر"],["shaba","شمارهٔ شبا"],["membershipCancelDate","تاریخ لغو عضویت"],["notes","توضیحات"]];
async function personnelExport(){
  try{
    const q=$("#personnelSearch").value.trim();
    const r=await api("GET",`/api/personnel/export?q=${enc(q)}&by=${enc($("#personnelBy").value)}&status=${enc(app.personnelStatus||"")}`);
    if(!r.items.length){showAlert("موردی برای خروجی نیست.");return}
    const TXT=new Set(["code","nationalId","idNumber","mobile","workplaceCode","bankAccount","advanceAccount","mehrAccount","shaba"]);
    const rows=r.items.map(p=>PX_COLS.map(([k])=>{const v=p[k];return v==null?"":(TXT.has(k)?String(v):v)}));
    await xlsxExport(`personnel-${todayJalali().replace(/\//g,"-")}.xlsx`,"پرسنل",PX_COLS.map(c=>c[1]),rows,PX_COLS.map(([k])=>["notes","jobTitle","workplace"].includes(k)?28:16));
  }catch(e){showAlert(e.message)}
}

