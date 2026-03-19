"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermission } from "@/contexts/PermissionContext";

/** 관리자 계약서 발송은 HR 페이지 전자계약 발송 탭으로 통합됨 */
export default function AdminContractsNewPage() {
  const router = useRouter();
  const { isCLevel } = usePermission();

  useEffect(() => {
    if (isCLevel) {
      router.replace("/hr?tab=contracts");
    } else {
      router.replace("/hr");
    }
  }, [router, isCLevel]);

  return null;
}
