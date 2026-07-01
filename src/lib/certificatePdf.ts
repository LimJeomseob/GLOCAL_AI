"use client";

import { ISSUER_NAME, ORG_NAME, PROGRAM_NAME } from "@/lib/constants";
import { formatDate, formatDateRange } from "@/lib/format";

// 이 앱은 완전 정적(GitHub Pages) 배포라 서버가 없다. 수료증 PDF는 관리자의
// 브라우저에서 생성한다(pdf-lib/@pdf-lib/fontkit는 브라우저 환경이 1급 지원 대상이다).
// Supabase Edge Function(Deno)에서는 fontkit이 내부적으로 Object.prototype.__proto__
// 조작에 의존하는 부분이 있어 Deno의 보안 기본값과 충돌해 런타임에 실패하는 것을
// 실제 배포 전 스모크 테스트로 확인했다 — 그래서 브라우저 실행으로 우회한다.
const FONT_REGULAR_URL =
  "https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzuoyeLQ.ttf";
const FONT_BOLD_URL =
  "https://fonts.gstatic.com/s/notosanskr/v39/PbyxFmXiEBPT4ITbgNA5Cgms3VYcOA-vvnIzzg01eLQ.ttf";

let cachedFonts: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

async function loadFonts() {
  if (cachedFonts) return cachedFonts;
  const [regular, bold] = await Promise.all([
    fetch(FONT_REGULAR_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_BOLD_URL).then((r) => r.arrayBuffer()),
  ]);
  cachedFonts = { regular, bold };
  return cachedFonts;
}

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

/** PRD §6.4 — AI융합원장 명의 수료증 PDF를 관리자 브라우저에서 생성한다 */
export async function generateCertificatePdf(input: CertificatePdfInput): Promise<Uint8Array> {
  // pdf-lib/@pdf-lib/fontkit는 발급 버튼을 실제로 누를 때만 필요하므로 동적 import로
  // 분리해 /admin/applicants 초기 번들에 포함되지 않도록 한다.
  const [{ PDFDocument, rgb }, { default: fontkit }, fonts] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    loadFonts(),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFont = await pdfDoc.embedFont(fonts.regular, { subset: true });
  const boldFont = await pdfDoc.embedFont(fonts.bold, { subset: true });

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
