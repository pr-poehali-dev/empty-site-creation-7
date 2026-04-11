/**
 * Сжимает изображение через canvas.
 * Максимальная сторона — MAX_SIZE пикселей, JPEG качество QUALITY.
 *
 * TODO (заметка): если итоговое качество/разрешение не устраивает —
 * увеличить MAX_SIZE (например до 1600 или 2048) и/или QUALITY (до 0.85-0.9).
 * Учитывать лимит тела Cloud Function (~6 МБ на весь запрос).
 */

const MAX_SIZE = 1280;
const QUALITY = 0.75;

export interface CompressedImage {
  data: string;
  content_type: string;
  preview: string;
}

export const compressImage = (file: File): Promise<CompressedImage> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          } else {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas не поддерживается"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
        const base64 = dataUrl.split(",")[1];
        resolve({
          data: base64,
          content_type: "image/jpeg",
          preview: dataUrl,
        });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

export default compressImage;
