"use client";

import { PROGRAM_NAME } from "@/lib/constants";
import { formatCertIssueDate, formatCertPeriod } from "@/lib/format";
import type { CertificateTemplate } from "@/lib/types";

// 이 앱은 완전 정적(GitHub Pages) 배포라 서버가 없다. 수료증 PDF는 발급하는 사람의
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

/** data URL(base64)에서 바이너리 본문만 디코딩한다. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = parseInt(hex.replace("#", ""), 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

/** 수료증 서식의 치환 변수 값 묶음 — 관리자 발급·공개 발급 탭이 동일하게 사용한다. */
export function buildCertificateValues(input: {
  certNo: string;
  name: string;
  affiliation: string;
  round: number;
  topic: string;
  startAt: string;
  endAt: string;
  issuedAt: string;
}): Record<string, string> {
  return {
    발급번호: input.certNo,
    성명: input.name,
    소속: input.affiliation,
    프로그램명: `${PROGRAM_NAME} ${input.round}차(${input.topic})`,
    기간: formatCertPeriod(input.startAt, input.endAt),
    발급일: formatCertIssueDate(input.issuedAt),
  };
}

function substitute(text: string, values: Record<string, string>): string {
  return text.replace(/\{([^{}]+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/**
 * DB(certificate_templates)에 저장된 서식 JSON으로 수료증 PDF를 생성한다.
 * 원본 서식 PDF와 동일하게 이미지(테두리 프레임 → 직인)를 먼저, 텍스트를 나중에 그린다.
 */
export async function renderCertificateFromTemplate(
  template: CertificateTemplate,
  values: Record<string, string>
): Promise<Uint8Array> {
  // pdf-lib/@pdf-lib/fontkit는 발급 버튼을 실제로 누를 때만 필요하므로 동적 import로
  // 분리해 초기 번들에 포함되지 않도록 한다.
  const [{ PDFDocument, rgb }, { default: fontkit }, fonts] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    loadFonts(),
  ]);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFont = await pdfDoc.embedFont(fonts.regular, { subset: true });
  const boldFont = await pdfDoc.embedFont(fonts.bold, { subset: true });

  const page = pdfDoc.addPage([template.page.width, template.page.height]);

  for (const image of template.images) {
    const embedded = await pdfDoc.embedJpg(dataUrlToBytes(image.dataUrl));
    page.drawImage(embedded, { x: image.x, y: image.y, width: image.w, height: image.h });
  }

  for (const item of template.texts) {
    const text = substitute(item.text, values);
    if (!text) continue;

    const font = item.weight === "bold" ? boldFont : regularFont;
    let size = item.size;
    // maxWidth 지정 시(소속·프로그램명 등 가변 길이 값) 폭에 맞을 때까지 크기를 줄인다.
    if (item.maxWidth) {
      while (size > 6 && font.widthOfTextAtSize(text, size) > item.maxWidth) {
        size -= 0.5;
      }
    }

    const x =
      item.align === "center"
        ? (template.page.width - font.widthOfTextAtSize(text, size)) / 2
        : (item.x ?? 0);
    const { r, g, b } = hexToRgb(item.color ?? "#000000");
    page.drawText(text, { x, y: item.y, size, font, color: rgb(r, g, b) });
  }

  return pdfDoc.save();
}

/** 스토리지 키는 ASCII만 허용되므로 발급번호에서 숫자·하이픈만 남긴다 (제2026-001호 → 2026-001) */
export function buildCertificatePdfPath(round: number, certNo: string): string {
  return `${round}/${certNo.replace(/[^0-9A-Za-z-]/g, "")}.pdf`;
}
