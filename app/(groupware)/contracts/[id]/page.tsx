import { redirect } from "next/navigation";

// 전자계약 상세도 HR 탭에서 처리 (별도 페이지 제거)
export default function ContractDetailPage() {
  redirect("/hr?tab=contract-manage");
}
