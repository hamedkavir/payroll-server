// نسخهٔ ۱۱۱: این فایل فقط برای سازگاری با کدهای قدیمی‌تر نگه داشته شده است.
// هر مسئولیت در فایل جداگانه است: formSettings.js، advances.js، inventory.js، loanParams.js و کمک‌کارهای مشترک در extrasCommon.js
const { planInst } = require("./extrasCommon");
module.exports = {
  formSettings: require("./formSettings"),
  advances: require("./advances"),
  inventory: require("./inventory"),
  loanParams: require("./loanParams"),
  planInst,
};
