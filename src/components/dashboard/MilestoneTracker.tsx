"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer motion";

type Milestone = {
  id: "FIRST_50" | "SECOND_50";
  label: string;
  percentage: number;
  paid: boolean;
  requiredProgress?: number;
};

type MilestoneTrackerProps = {
  projectId: string;
  progressPercentage: number;
  firstPaid: boolean;
  finalPaid: boolean;
  status: string;
  r2ObjectKey?: string;
  onDownload: (url: string) => void;
};

export function MilestoneTracker({
  projectId,
  progressPercentage,
  firstPaid,
  finalPaid,
  status,
  r2ObjectKey,
  onDownload,
}: MilestoneTrackerProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadReady, setDownloadReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDownload = finalPaid && progressPercentage === 100 && Boolean(r2ObjectKey);
  const secondLocked = !finalPaid || progressPercentage < 100;

  const milestones: Milestone[] = [
    {
      id: "FIRST_50",
      label: "Abono 1 (50% Inicial)",
      percentage: 50,
      paid: firstPaid,
      requiredProgress: 25,
    },
    {
      id: "SECOND_50",
      label: "Abono 2 (50% Final)",
      percentage: 100,
      paid: finalPaid,
      requiredProgress: 100,
    },
  ];

  useEffect(() => {
    if (canDownload && r2ObjectKey) {
      void (async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/download-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          if (!res.ok) throw new Error("No se pudo generar URL de descarga");
          const data = await res.json();
          setDownloadUrl(data.url);
          setDownloadReady(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Error al generar URL de descarga");
        }
      })();
    }
  }, [canDownload, projectId, r2ObjectKey]);

  const handleDownload = () => {
    if (!downloadUrl) return;
    onDownload(downloadUrl);
  };

  return (
    <section className="w-full bg-[rgba(22,13,46,0.6)] border border-[rgba(168,85,247,0.2)] rounded-xl p-6 backdrop-blur-xl shadow-volumetric">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-[#D8B4FE]">Progreso de Pagos (50/50)</h2>
        <span className={`
          px-3 py-1 rounded-full text-xs font-medium border
          ${status === "COMPLETED"
            ? "border-[#A855F7] text-[#A855F7] bg-[#A855F7]/10"
            : status === "IN_DEVELOPMENT"
            ? "border-[#D8B4FE] text-[#D8B4FE] bg-[#D8B4FE]/10"
            : "border-[#7C3AED] text-[#7C3AED] bg-[#7C3AED]/10"}
        `}>
          {status}
        </span>
      </div>

      <div className="space-y-4">
        {milestones.map((m) => {
          const isSecond = m.id === "SECOND_50";
          const locked = isSecond ? secondLocked : false;
          const reached = progressPercentage >= (m.requiredProgress ?? m.percentage);

          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className={`
                flex items-center justify-between p-4 rounded-lg border
                ${locked
                  ? "border-[#7C3AED]/30 bg-[#7C3AED]/5"
                  : reached && m.paid
                  ? "border-[#A855F7] bg-[#A855F7]/10"
                  : reached
                  ? "border-[#D8B4FE] bg-[#D8B4FE]/10"
                  : "border-[#7C3AED]/30"}
              `}
            >
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium ${m.paid ? "text-[#A855F7]" : "text-[#C8A2C8]"}`}>
                    {m.label}
                  </span>
                  <span className={`text-xs font-mono ${locked ? "text-[#7C3AED]" : "text-[#D8B4FE]"}`}>
                    {locked ? "Bloqueado" : `${m.percentage}%`}
                  </span>
                </div>
                <div className="w-full bg-[#7C3AED]/10 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.min(progressPercentage, m.percentage)}%`,
                      background: m.paid ? "#A855F7" : reached ? "#D8B4FE" : "#7C3AED",
                    }}
                  />
                </div>
                <p className="text-xs mt-2 text-[#7C3AED]/60">
                  {locked
                    ? "Requiere progreso del 100 % y firma del entregable por ADMIN"
                    : m.paid
                    ? "Pagado - hito liberado"
                    : reached
                    ? "Listo para pago"
                    : "Pendiente"}
                </p>
              </div>
              {locked ? (
                <span className="text-[#7C3AED] text-xs font-mono">🔒</span>
              ) : m.paid ? (
                <span className="text-[#A855F7] text-xs font-mono">✔</span>
              ) : reached ? (
                <button
                  onClick={() => {
                    void fetch(`/api/projects/${projectId}/payments`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ milestone: m.id }),
                    });
                  }}
                  className="px-3 py-1.5 rounded bg-[#A855F7] text-[#090514] text-xs font-bold hover:bg-[#7C3AED] transition"
                >
                  Pagar
                </button>
              ) : (
                <span className="text-[#D8B4FE]/60 text-xs">Esperando...</span>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="mt-8 pt-6 border-t border-[rgba(168,85,247,0.2)]">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-[#C8A2C8]">Descarga del entregable</span>
          <span className={`text-xs font-mono ${canDownload ? "text-[#A855F7]" : "text-[#7C3AED]"}`}>
            {canDownload ? "Disponible" : "Bloqueado hasta pago final y 100 % progreso"}
          </span>
        </div>

        <AnimatePresence>
          {downloadReady && downloadUrl ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-3"
            >
              <button
                onClick={handleDownload}
                disabled={!downloadUrl}
                className="flex-1 py-3 rounded bg-[#A855F7]/20 border border-[#A855F7]/50 text-[#A855F7] text-sm font-semibold hover:bg-[#A855F7] hover:text-[#090514] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Descargar binario (.jar/.zip)
              </button>
              <span className="text-xs text-[#7C3AED]/60">URL firmada - expira en 5 min</span>
            </motion.div>
          ) : (
            <button
              disabled={!canDownload}
              className="w-full py-3 rounded bg-[#7C3AED]/10 border border-[#7C3AED]/30 text-[#7C3AED]/60 text-sm font-semibold disabled:cursor-not-allowed"
            >
              Descargar binario (.jar/.zip)
            </button>
          )}
        </AnimatePresence>

        {error && (
          <p className="mt-3 text-xs text-[#f87171]">{error}</p>
        )}
      </div>
    </section>
  );
}
