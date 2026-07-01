import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CERTIFICATES_BUCKET } from "@/lib/db-tables";
import { ISSUER_NAME, ORG_NAME, PROGRAM_NAME } from "@/lib/constants";
import { formatDate, formatDateRange } from "@/lib/format";

const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");

export interface CertificatePdfInput {
  certNo: string;
  name: string;
  affiliation: string;
  round: number;
  topic: string;
  startAt: string;
  endAt: string;
  issuedAt: string;
}

/** PRD §6.4 — AI융합원장 명의 수료증 PDF를 서버에서 생성한다 */
export async function generateCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  const [regularBytes, boldBytes] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, "NotoSansKR-Regular.ttf")),
    fs.readFile(path.join(FONT_DIR, "NotoSansKR-Bold.ttf")),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFont = await pdfDoc.embedFont(regularBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldBytes, { subset: true });

  const page = pdfDoc.addPage([841.89, 595.28]); // A4 landscape
  const { width, height } = page.getSize();
  const brand = rgb(0x00 / 255, 0x38 / 255, 0x76 / 255);
  const ink = rgb(0.15, 0.15, 0.15);

  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: brand,
    borderWidth: 3,
  });
  page.drawRectangle({
    x: 34,
    y: 34,
    width: width - 68,
    height: height - 68,
    borderColor: brand,
    borderWidth: 1,
  });

  const centerText = (text: string, y: number, font = regularFont, size = 12, color = ink) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - textWidth) / 2, y, size, font, color });
  };

  centerText("수 료 증", height - 120, boldFont, 40, brand);
  centerText(`수료번호  ${input.certNo}`, height - 165, regularFont, 13);

  let cursorY = height - 230;
  const lineGap = 34;

  centerText(`소  속 : ${input.affiliation}`, cursorY, regularFont, 15);
  cursorY -= lineGap;
  centerText(`성  명 : ${input.name}`, cursorY, boldFont, 18);
  cursorY -= lineGap + 10;

  const bodyLines = [
    `위 사람은 경상국립대학교 글로컬대학30 사업 「모두의 AI를 위한 7월 AI활용 특강」`,
    `『${PROGRAM_NAME}』 ${input.round}차(${input.topic}) 과정을`,
    `모든 과정을 이수하였음을 증명합니다.`,
  ];
  for (const line of bodyLines) {
    centerText(line, cursorY, regularFont, 13.5);
    cursorY -= 24;
  }

  cursorY -= 16;
  centerText(`운영일시 : ${formatDateRange(input.startAt, input.endAt)}`, cursorY, regularFont, 12);
  cursorY -= 22;
  centerText(`발급일 : ${formatDate(input.issuedAt)}`, cursorY, regularFont, 12);

  centerText(ORG_NAME, 110, boldFont, 15, brand);
  centerText(ISSUER_NAME, 82, boldFont, 20, brand);

  return pdfDoc.save();
}

export function buildCertificatePdfPath(round: number, certNo: string): string {
  return `${round}/${certNo}.pdf`;
}

export async function uploadCertificatePdf(
  supabase: SupabaseClient,
  pdfPath: string,
  bytes: Uint8Array
): Promise<void> {
  const { error } = await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .upload(pdfPath, bytes, { contentType: "application/pdf", upsert: true });

  if (error) throw error;
}

export async function getSignedCertificateUrl(
  supabase: SupabaseClient,
  pdfPath: string,
  expiresInSeconds = 600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CERTIFICATES_BUCKET)
    .createSignedUrl(pdfPath, expiresInSeconds);

  if (error || !data) throw error ?? new Error("서명 URL 생성에 실패했습니다.");
  return data.signedUrl;
}
