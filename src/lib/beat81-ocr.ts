import Tesseract from "tesseract.js";

const OCR_LANG = "deu+eng";
const OCR_LANG_PATH = process.cwd();

function normalizeOcrText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractTextFromImages(files: File[]) {
  const chunks: string[] = [];

  try {
    for (const [index, file] of files.entries()) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await Tesseract.recognize(buffer, OCR_LANG, {
        langPath: OCR_LANG_PATH,
      });
      const text = normalizeOcrText(result.data.text ?? "");

      if (text) {
        chunks.push(`--- Screenshot ${index + 1}: ${file.name} ---\n${text}`);
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unbekannter OCR-Fehler";
    throw new Error(
      `OCR konnte nicht ausgefuehrt werden (${message}). Bitte pruefe die Internetverbindung fuer den Erst-Download der Sprachdaten.`,
    );
  }

  return chunks.join("\n\n").trim();
}
