// پیش‌فرض‌های مشترک «تنظیمات فرم‌ها» (form_settings.data)
// نسخهٔ ۱۱۱: از routes/formSettings.js جدا شد تا loanParams.js و دیگر مسیرها هم بدون وابستگی چرخه‌ای از آن استفاده کنند.
const { ROUND_DEFAULTS } = require("../rounding");
const { KEY_CODE_DEFAULTS } = require("../keyCodes");

const FS_DEFAULTS = {
  orgName: "اداره آموزش و پرورش ناحیه یک قزوین",
  fundName: "صندوق وام تعاون و امور رفاهی",
  managerName: "",
  managerTitle: "مدیر آموزش و پرورش ناحیه یک قزوین",
  operatorName: "",
  advanceFeePercent: 1,
  advancePayDay: 15,
  advanceDefaultAmount: 50000000,        // مبلغ پیش‌فرض مساعده (ریال) هنگام ثبت مساعدهٔ جدید
  advanceDefaultInstallments: 2,         // تعداد اقساط پیش‌فرض مساعده
  lifeNumberStart: 4571,     // شمارهٔ شروع بیمه عمر (ادامهٔ شماره‌گذاری قبلی)
  emdadFeePercent: 1,        // درصد کارمزد وام امداد
  emdadDefaultInstallments: 20, // تعداد اقساط پیش‌فرض وام امداد
  emdadDefaultAmount: 1000000000, // مبلغ پیش‌فرض وام امداد (ریال) هنگام ثبت وام امداد جدید
  goodsDefaultInstallments: 6,  // تعداد اقساط پیش‌فرض درخواست کالا
  loanWaitMonths: 12,        // مدت انتظار (ماه) در فرمول وام
  loanFundShare: 6000000,    // سهم صندوق در هر ماه انتظار (ریال)
  loanMax: 0,                // حداکثر مبلغ وام (ریال)؛ ۰ = بدون سقف
  ...ROUND_DEFAULTS,         // پارامترهای گرد کردن (rounding.js)
  formMarginRight: 14,       // حاشیهٔ راست چاپ فرم‌ها (میلی‌متر)
  formMarginLeft: 8,         // حاشیهٔ چپ چاپ فرم‌ها (میلی‌متر)
  slipShowCodes: 1,          // نمایش «کد کسر و ردیف» مثل (۷۳۳-۷) کنار شرح در فیش (۱ = بله، ۰ = خیر)
  recentSlips: 12,           // تعداد فیش‌های نمایش‌داده‌شده در «سابقهٔ فیش‌ها»ی صفحهٔ پرسنل
  slipMetaLine: 1,           // نمایش خط «تاریخ صدور / مبالغ به …» زیر سربرگ فیش (۱ = بله، ۰ = خیر)
  serviceLetterStart: 1,     // شمارهٔ شروع نامه‌های خدمات (برای ادامهٔ شماره‌گذاری قبلی)
  signatories: [],           // امضاکنندگان: [{id, title, name}] (خالی = پیش‌فرض‌های کلاینت)
  formSigs: {},              // چیدمان امضاهای هر فرم: { فرم: ["def:0","sig:coop"] }
  formHidden: {},            // فیلدهای مخفی هر فرم: { فرم: [عنوان فیلد] }
  formExtras: {},            // سطرهای اضافهٔ هر فرم: { فرم: [{label,text}] }
  formFields: {},            // فیلدهای اضافهٔ هر فرم: { فرم: [{label, src, text}] }
  insGovt: 500000,           // بیمه تکمیلی: سهم دولت هر نفر (ریال)
  insEmp: 250000,            // بیمه تکمیلی: سهم کارمند هر نفر (ریال)
  insShares: { govt: 0, emp: 0 },   // بیمه تکمیلی: سهم دولت و سهم کارمند (هر نفر، ریال)؛ پیش‌فرض مشترک
  navDefault: null,          // پیش‌فرض مشترک منو (ذخیره از «ویرایش منو ← ذخیره به‌عنوان پیش‌فرض»)
  keyCodes: { ...KEY_CODE_DEFAULTS }, // تعریف کدهای مهم (وام ضروری، سرمایه، مساعده، ...) ← keyCodes.js
  pageLayoutSaved: {},       // «پیش‌فرض ذخیره‌شدهٔ من» برای ظاهر صفحه‌ها (با بازگشت به حالت اولیه پاک نمی‌شود)
  pageLayout: {},            // ظاهر صفحه‌ها (فرم پرسنلی): بخش‌ها، فیلدها و فیلدهای دلخواه
  formLayout: {},            // چیدمان آزاد هر فرم (ویرایشگر بصری)
  signatureForms: {},        // امضای مدیر روی کدام فرم‌ها چاپ شود: { فرم: true|false } (پیش‌فرض: فقط نامهٔ دسته چک)
  formTexts: {},             // متن قالب فرم‌های چاپی: { فرم: { شناسهٔ بخش: متن } } (ویرایش از پیش‌نمایش چاپ)
};

module.exports = { FS_DEFAULTS };
