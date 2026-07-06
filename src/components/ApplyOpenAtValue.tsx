"use client";

import { useEffect, useState } from "react";
import { APPLICATION_OPEN_AT } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { fetchWorkshopsWithAvailability } from "@/lib/workshops";

/**
 * 소개 탭 히어로의 "신청기간 … 부터" 값.
 * DB workshops의 실제 신청 시작일(apply_open_at) 중 가장 이른 값을 실시간으로 표시해
 * 프로그램 안내 카드·신청 탭과 신청기간이 어긋나지 않도록 연동한다.
 * 로딩/실패 또는 유효값이 없으면 정적 상수(APPLICATION_OPEN_AT)로 폴백한다.
 */
export function ApplyOpenAtValue() {
  const [openAt, setOpenAt] = useState<string>(APPLICATION_OPEN_AT);

  useEffect(() => {
    let active = true;

    fetchWorkshopsWithAvailability()
      .then(({ workshops }) => {
        if (!active) return;
        const valid = workshops
          .map((w) => w.apply_open_at)
          .filter((d): d is string => !!d && !Number.isNaN(new Date(d).getTime()));
        if (valid.length === 0) return;
        const earliest = valid.reduce((min, d) =>
          new Date(d).getTime() < new Date(min).getTime() ? d : min
        );
        setOpenAt(earliest);
      })
      .catch(() => {
        /* 실패 시 정적 상수 유지 */
      });

    return () => {
      active = false;
    };
  }, []);

  return <>{formatDateTime(openAt)}부터</>;
}
