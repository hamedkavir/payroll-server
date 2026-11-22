// خواندن بدنهٔ JSON با تحمل بایت‌های زائد انتهای بدنه (مثل \x00) و BOM؛
// express.json در این حالت خطای «Unexpected non-whitespace character after JSON» می‌دهد (مثلاً هنگام بازیابی پشتیبان).
function parseJsonBuffer(buf) {
  const t = buf.toString("utf8").replace(/^\uFEFF/, "").replace(/[\u0000\s]+$/, "");
  return t ? JSON.parse(t) : {};
}
function jsonBody(express, limit = "25mb") {
  const raw = express.raw({ type: (req) => /json/i.test(req.headers["content-type"] || ""), limit });
  const parse = (req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
      try { req.body = parseJsonBuffer(req.body); }
      catch (e) { return res.status(400).json({ error: "invalid_json", message: "بدنهٔ درخواست JSON معتبر نیست." }); }
    } else if (req.body === undefined) req.body = {};
    next();
  };
  return [raw, parse];
}
module.exports = { jsonBody, parseJsonBuffer };
