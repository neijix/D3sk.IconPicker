// An uploaded image as a small square PNG data URL (the centred square, scaled to size × size).

/**
 * @param {Blob} file
 * @param {number} [size]
 * @returns {Promise<string>}
 */
export function squareImage(file, size = 64) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (fn, value) => {
      URL.revokeObjectURL(url);
      fn(value);
    };
    img.onerror = () => done(reject, new Error("This file is not an image"));
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return done(reject, new Error("This file is not an image"));
      const side = Math.min(w, h);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d").drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
      done(resolve, canvas.toDataURL("image/png"));
    };
    img.src = url;
  });
}
