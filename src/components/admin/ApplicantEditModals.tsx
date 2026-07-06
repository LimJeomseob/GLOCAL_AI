"use client";

import { useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-tables";
import { applicationSchema } from "@/lib/validation";
import { buildCsv, downloadCsv, parseCsv } from "@/lib/csv";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FormField, inputBaseClass } from "@/components/ui/FormField";
import {
  APPLICATION_STATUSES,
  isApplicationStatus,
  type ApplicationStatus,
  type ApplicationWithWorkshop,
  type Workshop,
} from "@/lib/types";

/** applications INSERT 후 목록 갱신에 필요한 워크숍 조인 셀렉트(테이블 표시 필드와 동일) */
const APPLICATION_WITH_WORKSHOP_SELECT =
  "*, workshop:workshops(id, round, topic, start_at, end_at, location)";

/** PostgREST to-one 임베드가 배열로 올 수 있어 단일 객체로 정규화한다(applicants/page.tsx와 동일 패턴). */
function normalizeInserted(rows: unknown[]): ApplicationWithWorkshop[] {
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    ...(row as unknown as ApplicationWithWorkshop),
    workshop: Array.isArray(row.workshop)
      ? (row.workshop[0] as ApplicationWithWorkshop["workshop"])
      : (row.workshop as ApplicationWithWorkshop["workshop"]),
  }));
}

interface AdminInsertRow {
  workshop_id: string;
  name: string;
  affiliation: string;
  id_number: string;
  phone: string;
  email: string;
  consent: true;
  status: ApplicationStatus;
  created_by_admin: true;
}

async function insertApplications(rows: AdminInsertRow[]): Promise<ApplicationWithWorkshop[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from(TABLES.APPLICATIONS)
    .insert(rows)
    .select(APPLICATION_WITH_WORKSHOP_SELECT);
  if (error) throw new Error(error.message);
  return normalizeInserted(data ?? []);
}

function workshopLabel(w: Workshop): string {
  return `${w.round}차 · ${w.topic}`;
}

// ---------------------------------------------------------------------------
// 수동 추가 모달
// ---------------------------------------------------------------------------

interface AddFormState {
  workshopId: string;
  name: string;
  affiliation: string;
  idNumber: string;
  phone: string;
  email: string;
  status: ApplicationStatus;
}

const ADD_INITIAL: AddFormState = {
  workshopId: "",
  name: "",
  affiliation: "",
  idNumber: "",
  phone: "",
  email: "",
  status: "신청완료",
};

export function AddApplicantModal({
  open,
  onClose,
  workshops,
  workshopsError,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  workshops: Workshop[] | null;
  workshopsError: string | null;
  onAdded: (application: ApplicationWithWorkshop) => void;
}) {
  const [form, setForm] = useState<AddFormState>(ADD_INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof AddFormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function updateField<K extends keyof AddFormState>(key: K, value: AddFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleClose() {
    setForm(ADD_INITIAL);
    setErrors({});
    setSubmitError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    const parsed = applicationSchema.safeParse({
      workshopId: form.workshopId,
      name: form.name,
      affiliation: form.affiliation,
      idNumber: form.idNumber,
      phone: form.phone,
      email: form.email,
      consent: true,
    });

    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof AddFormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof AddFormState;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const [inserted] = await insertApplications([
        {
          workshop_id: parsed.data.workshopId,
          name: parsed.data.name,
          affiliation: parsed.data.affiliation,
          id_number: parsed.data.idNumber,
          phone: parsed.data.phone,
          email: parsed.data.email,
          consent: true,
          status: form.status,
          created_by_admin: true,
        },
      ]);
      if (inserted) onAdded(inserted);
      handleClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "신청자 추가에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} titleId="add-applicant-title">
      <h2 id="add-applicant-title" className="text-lg font-bold text-brand">
        신청자 수동 추가
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        관리자 등록 건은 신청기간·정원 제한 없이 추가되며, &quot;관리자에 의한 신청&quot;으로
        기록됩니다.
      </p>

      {workshopsError && (
        <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {workshopsError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-5 flex flex-col gap-4">
        <FormField label="회차" required error={errors.workshopId}>
          {(inputProps) => (
            <select
              {...inputProps}
              className={inputBaseClass}
              value={form.workshopId}
              onChange={(e) => updateField("workshopId", e.target.value)}
            >
              <option value="">{workshops ? "회차를 선택해 주세요" : "회차 불러오는 중..."}</option>
              {(workshops ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {workshopLabel(w)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label="성명" required error={errors.name}>
          {(inputProps) => (
            <input
              {...inputProps}
              type="text"
              className={inputBaseClass}
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
            />
          )}
        </FormField>

        <FormField label="소속" required error={errors.affiliation}>
          {(inputProps) => (
            <input
              {...inputProps}
              type="text"
              className={inputBaseClass}
              value={form.affiliation}
              onChange={(e) => updateField("affiliation", e.target.value)}
            />
          )}
        </FormField>

        <FormField label="교번/직번/학번/생년월일" required error={errors.idNumber}>
          {(inputProps) => (
            <input
              {...inputProps}
              type="text"
              className={inputBaseClass}
              value={form.idNumber}
              onChange={(e) => updateField("idNumber", e.target.value)}
            />
          )}
        </FormField>

        <FormField label="연락처" required error={errors.phone} hint="예: 010-1234-5678">
          {(inputProps) => (
            <input
              {...inputProps}
              type="tel"
              className={inputBaseClass}
              value={form.phone}
              placeholder="010-1234-5678"
              onChange={(e) => updateField("phone", e.target.value)}
            />
          )}
        </FormField>

        <FormField label="이메일" required error={errors.email}>
          {(inputProps) => (
            <input
              {...inputProps}
              type="email"
              className={inputBaseClass}
              value={form.email}
              placeholder="example@gnu.ac.kr"
              onChange={(e) => updateField("email", e.target.value)}
            />
          )}
        </FormField>

        <FormField label="상태" required>
          {(inputProps) => (
            <select
              {...inputProps}
              className={inputBaseClass}
              value={form.status}
              onChange={(e) => updateField("status", e.target.value as ApplicationStatus)}
            >
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </FormField>

        {submitError && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {submitError}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || !workshops}>
            {submitting ? "추가 중..." : "추가하기"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// CSV 일괄 추가 모달
// ---------------------------------------------------------------------------

const CSV_HEADERS = ["회차", "성명", "소속", "교번/직번/학번/생년월일", "연락처", "이메일", "상태"];

interface CsvRowError {
  line: number;
  message: string;
}

interface CsvPreview {
  fileName: string;
  valid: AdminInsertRow[];
  errors: CsvRowError[];
}

export function CsvImportModal({
  open,
  onClose,
  workshops,
  workshopsError,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  workshops: Workshop[] | null;
  workshopsError: string | null;
  onImported: (applications: ApplicationWithWorkshop[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const workshopByRound = useMemo(() => {
    const map = new Map<number, Workshop>();
    (workshops ?? []).forEach((w) => map.set(w.round, w));
    return map;
  }, [workshops]);

  function handleClose() {
    setPreview(null);
    setParseError(null);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  }

  function handleDownloadTemplate() {
    const sampleRow = ["1", "홍길동", "경상국립대학교 OO학과", "900101", "010-1234-5678", "hong@gnu.ac.kr", "신청완료"];
    const csv = buildCsv(
      [sampleRow],
      CSV_HEADERS.map((header, i) => ({ header, accessor: (row: string[]) => row[i] }))
    );
    downloadCsv("신청자_일괄추가_양식.csv", csv);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPreview(null);
    setParseError(null);
    setSubmitError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => setParseError("파일을 읽지 못했습니다. 다시 시도해 주세요.");
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result ?? ""));
        if (rows.length === 0) {
          setParseError("CSV에 데이터가 없습니다.");
          return;
        }

        // 헤더 행(첫 셀에 '회차' 포함)은 건너뛴다.
        const startIndex = rows[0][0]?.includes("회차") ? 1 : 0;
        const valid: AdminInsertRow[] = [];
        const errors: CsvRowError[] = [];

        for (let i = startIndex; i < rows.length; i++) {
          const line = i + 1;
          const [roundRaw = "", name = "", affiliation = "", idNumber = "", phone = "", email = "", statusRaw = ""] =
            rows[i].map((c) => c.trim());

          const round = Number(roundRaw);
          const workshop = workshopByRound.get(round);
          if (!Number.isInteger(round) || !workshop) {
            errors.push({ line, message: `회차 값이 올바르지 않습니다: "${roundRaw}"` });
            continue;
          }

          const status: ApplicationStatus = statusRaw === "" ? "신청완료" : (statusRaw as ApplicationStatus);
          if (!isApplicationStatus(status)) {
            errors.push({ line, message: `상태 값이 올바르지 않습니다: "${statusRaw}" (신청완료/대기/취소/이수)` });
            continue;
          }

          const parsed = applicationSchema.safeParse({
            workshopId: workshop.id,
            name,
            affiliation,
            idNumber,
            phone,
            email,
            consent: true,
          });
          if (!parsed.success) {
            errors.push({ line, message: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." });
            continue;
          }

          valid.push({
            workshop_id: parsed.data.workshopId,
            name: parsed.data.name,
            affiliation: parsed.data.affiliation,
            id_number: parsed.data.idNumber,
            phone: parsed.data.phone,
            email: parsed.data.email,
            consent: true,
            status,
            created_by_admin: true,
          });
        }

        setPreview({ fileName: file.name, valid, errors });
      } catch {
        setParseError("CSV 파싱에 실패했습니다. 양식을 확인해 주세요.");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!preview || preview.valid.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const inserted = await insertApplications(preview.valid);
      onImported(inserted);
      handleClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "일괄 추가에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} titleId="csv-import-title">
      <h2 id="csv-import-title" className="text-lg font-bold text-brand">
        CSV 일괄 추가
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        양식(회차, 성명, 소속, 교번/직번/학번/생년월일, 연락처, 이메일, 상태)에 맞는 CSV 파일을
        업로드하면 유효한 행만 일괄 등록됩니다. 상태를 비우면 &quot;신청완료&quot;로 등록됩니다.
      </p>

      {workshopsError && (
        <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {workshopsError}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-4">
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={handleDownloadTemplate}>
            📄 CSV 양식 다운로드
          </Button>
        </div>

        <FormField label="CSV 파일" required hint="UTF-8 인코딩 CSV 파일 (엑셀에서 'CSV UTF-8'로 저장)">
          {(inputProps) => (
            <input
              {...inputProps}
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-dark"
              onChange={handleFileChange}
              disabled={!workshops}
            />
          )}
        </FormField>

        {parseError && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {parseError}
          </p>
        )}

        {preview && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-800">
              {preview.fileName} — 유효 {preview.valid.length}건
              {preview.errors.length > 0 && `, 오류 ${preview.errors.length}건(제외됨)`}
            </p>
            {preview.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-red-600">
                {preview.errors.map((err) => (
                  <li key={err.line}>
                    {err.line}행: {err.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {submitError && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {submitError}
          </p>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            취소
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleImport}
            disabled={submitting || !preview || preview.valid.length === 0}
          >
            {submitting
              ? "추가 중..."
              : preview && preview.valid.length > 0
              ? `${preview.valid.length}건 추가하기`
              : "추가하기"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
