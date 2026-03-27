"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ContractDocument, A4Page } from "@/lib/contractTemplates";
import type { ContractRow } from "@/types/contract";

export default function ContractPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [contract, setContract] = useState<ContractRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/contracts/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) { setError(data.error); return; }
        setContract(data as ContractRow);
      })
      .catch(() => setError("계약서를 불러오지 못했습니다."));
  }, [id]);

  useEffect(() => {
    if (!contract) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [contract]);

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#64748b" }}>
        {error}
      </div>
    );
  }

  if (!contract) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "sans-serif", color: "#64748b" }}>
        불러오는 중...
      </div>
    );
  }

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; background: white; }
        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen {
          body { background: #e2e8f0; }
        }
      `}</style>
      <A4Page>
        <ContractDocument contract={contract} />
      </A4Page>
    </>
  );
}
