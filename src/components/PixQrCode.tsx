import React, { useEffect, useState } from "react";

/**
 * Desenha o QR Code de um texto (ex.: PIX copia e cola).
 * Usa qrcode-generator carregado do CDN na primeira vez (sem dependência nova no build),
 * no mesmo padrão do leitor ZXing do Trevvo Móvel.
 */

const CDN_QRCODE =
  "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";

interface QrGen {
  addData: (d: string) => void;
  make: () => void;
  createDataURL: (cellSize?: number, margin?: number) => string;
}

declare global {
  interface Window {
    qrcode?: (typeNumber: number, errorCorrection: string) => QrGen;
  }
}

let carregando: Promise<NonNullable<Window["qrcode"]>> | null = null;

function carregarGerador(): Promise<NonNullable<Window["qrcode"]>> {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (carregando) return carregando;
  carregando = new Promise((resolver, rejeitar) => {
    const script = document.createElement("script");
    script.src = CDN_QRCODE;
    script.onload = () => {
      if (window.qrcode) resolver(window.qrcode);
      else rejeitar(new Error("Gerador de QR Code indisponível"));
    };
    script.onerror = () => {
      carregando = null;
      rejeitar(
        new Error("Falha ao baixar o gerador de QR Code (sem internet?)"),
      );
    };
    document.head.appendChild(script);
  });
  return carregando;
}

export const PixQrCode: React.FC<{ texto: string; tamanho?: number }> = ({
  texto,
  tamanho = 180,
}) => {
  const [url, setUrl] = useState<string>("");
  const [erro, setErro] = useState<string>("");

  useEffect(() => {
    let ativo = true;
    setErro("");
    if (!texto) {
      setUrl("");
      return;
    }
    carregarGerador()
      .then((gerar) => {
        const qr = gerar(0, "M");
        qr.addData(texto);
        qr.make();
        if (ativo) setUrl(qr.createDataURL(6, 2));
      })
      .catch((e: Error) => {
        if (ativo) setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [texto]);

  if (erro)
    return <p className="text-[11px] text-red-600 text-center">{erro}</p>;
  if (!url)
    return (
      <p className="text-[11px] text-slate-500 text-center">
        Gerando QR Code...
      </p>
    );
  return (
    <img
      src={url}
      alt="QR Code PIX"
      width={tamanho}
      height={tamanho}
      className="mx-auto"
      style={{ imageRendering: "pixelated" }}
    />
  );
};
