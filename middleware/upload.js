const multer = require("multer");
const { validateUploadMagic, IMAGE_MIMES } = require("../utils/fileMagic");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG and WebP images are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
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

const magic = validateUploadMagic(IMAGE_MIMES);

module.exports = {
  single: (field) => chain(upload.single(field), magic),
  array: (field, maxCount) => chain(upload.array(field, maxCount), magic),
  fields: (fields) => chain(upload.fields(fields), magic),
  none: () => upload.none(),
};
