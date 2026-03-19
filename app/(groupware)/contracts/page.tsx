import { redirect } from "next/navigation";

// 전자계약은 HR 탭에서만 제공 (별도 페이지 제거)
export default function ContractsPage() {
  redirect("/hr?tab=contracts");
}
