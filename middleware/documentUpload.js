const multer = require("multer");
const { validateUploadMagic, DOCUMENT_MIMES } = require("../utils/fileMagic");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, WebP and PDF files are allowed"), false);
  }
};

const documentUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function chain(...middlewares) {
  return (req, res, next) => {
    let index = 0;
    const run = (err) => {
      if (err) return next(err);
      const mw = middlewares[index++];
      if (!mw) return next();
      try {
        mw(req, res, run);
      } catch (error) {
        next(error);
      }
    };
    run();
  };
}

const magic = validateUploadMagic(DOCUMENT_MIMES);

module.exports = {
  single: (field) => chain(documentUpload.single(field), magic),
  array: (field, maxCount) => chain(documentUpload.array(field, maxCount), magic),
  fields: (fields) => chain(documentUpload.fields(fields), magic),
};
