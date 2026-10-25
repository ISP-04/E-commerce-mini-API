// Validation middleware ด้วย Zod: ตรวจ body/query/params ก่อนถึง Controller
// ข้อมูลที่ผ่านการตรวจแล้วเก็บไว้ที่ req.valid (Express 5 ทำให้ req.query เป็น read-only)
const AppError = require('../utils/AppError');

function validate(schemas) {
  return (req, _res, next) => {
    req.valid = req.valid || {};
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: [part, ...issue.path].join('.'),
          message: issue.message,
        }));
        return next(new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details));
      }
      req.valid[part] = result.data;
    }
    return next();
  };
}

module.exports = validate;
