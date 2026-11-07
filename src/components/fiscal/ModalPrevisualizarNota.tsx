import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Building2,
  User,
  Calculator,
  Code,
  Loader2,
  Info,
} from 'lucide-react'
import {
  ResultadoPrevisualizacaoNota,
  DocumentoFiscalItemCalculado,
} from '@/services/documentosFiscais'

interface ModalPrevisualizarNotaProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  dados: ResultadoPrevisualizacaoNota | null
  carregando: boolean
  erro: string | null
  onRecarregar: () => void
}

export function ModalPrevisualizarNota({
  aberto,
  onOpenChange,
  dados,
  carregando,
  erro,
  onRecarregar,
}: ModalPrevisualizarNotaProps) {
  const [abaAtiva, setAbaAtiva] = useState<string>('resumo')

  const doc = dados?.documento
  const itens = dados?.itens || []
  const pendencias = dados?.pendencias || []
  const avisos = dados?.avisos || []

  // DIFAL: mostra exatamente o que o backend calculou e gravou no documento
  // (não recalcula no frontend; itens isentos/não tributados não entram na base)
  const totalDifal =
    (Number(doc?.valor_icms_uf_destino) || 0) + (Number(doc?.valor_fcp_uf_destino) || 0)

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  Pré-visualização da Nota Fiscal (
                  {doc?.modelo === '65' ? 'NFC-e mod. 65' : 'NF-e mod. 55'})
                  <Badge variant="outline" className="text-xs font-normal">
                    {doc?.ambiente || 'Homologação'}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Conferência fiscal e tributária somente leitura antes da autorização SEFAZ
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {pendencias.length > 0 ? (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {pendencias.length} Pendência(s)
                </Badge>
              ) : (
                <Badge className="bg-emerald-600 text-white gap-1 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Sem Pendências
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Corpo com scroll */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {carregando && (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
              <p className="text-sm font-medium">
                Calculando impostos e montando documento fiscal...
              </p>
              <p className="text-xs text-slate-400">
                Processando regras do perfil tributário, rateio e alíquotas interestaduais.
              </p>
            </div>
          )}

          {erro && !carregando && (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Erro ao calcular nota fiscal
              </div>
              <p className="text-xs leading-relaxed">{erro}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={onRecarregar}
                className="mt-2 text-xs bg-white text-red-700 border-red-300"
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {!carregando && !erro && doc && (
            <>
              {/* Pendências impeditivas */}
              {pendencias.length > 0 && (
                <div className="p-3.5 rounded-xl border border-red-300 bg-red-50/90 text-red-900 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-red-950">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                    <span>Pendências encontradas antes do envio:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-red-800 pl-1">
                    {pendencias.map((pend, pIdx) => (
                      <li key={pIdx}>{pend}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-red-700 font-medium pt-1">
                    Corrija os cadastros indicados antes de transmitir para a SEFAZ.
                  </p>
                </div>
              )}

              {/* Avisos não impeditivos */}
              {avisos.length > 0 && (
                <div className="p-3 rounded-xl border border-amber-300 bg-amber-50/90 text-amber-900 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Info className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Avisos de Tributação:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-800 pl-1">
                    {avisos.map((av, aIdx) => (
                      <li key={aIdx}>{av}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bloco de Emitente e Destinatário */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Emitente */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 border-b border-slate-200 pb-1">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span>Emitente (Empresa da Venda)</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Razão Social:</span>{' '}
                    <strong className="text-slate-800">{doc.empresa_nome}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">CNPJ:</span>{' '}
                    <span className="font-mono">{doc.empresa_cnpj || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      <span className="text-slate-500">IE:</span>{' '}
                      <span className="font-mono">{doc.empresa_ie || 'ISENTO'}</span>
                    </span>
                    <span>
                      <span className="text-slate-500">UF:</span> <strong>{doc.empresa_uf}</strong>
                    </span>
                    <span>
                      <span className="text-slate-500">CRT:</span>{' '}
                      <span>
                        {doc.empresa_crt === 1
                          ? '1 Simples'
                          : doc.empresa_crt === 3
                            ? '3 Normal'
                            : doc.empresa_crt}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Destinatário */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 border-b border-slate-200 pb-1">
                    <User className="h-4 w-4 text-blue-600" />
                    <span>Destinatário</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Nome/Razão:</span>{' '}
                    <strong className="text-slate-800">
                      {doc.destinatario_nome || 'Consumidor Final'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">CPF/CNPJ:</span>{' '}
                    <span className="font-mono">
                      {doc.destinatario_cpf_cnpj || 'Não informado'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      <span className="text-slate-500">UF Destino:</span>{' '}
                      <strong>{doc.destinatario_uf || '-'}</strong>
                    </span>
                    <span>
                      <span className="text-slate-500">Natureza:</span>{' '}
                      <span>{doc.natureza_operacao}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabs de Detalhamento */}
              <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="w-full">
                <TabsList className="grid grid-cols-3 h-8">
                  <TabsTrigger value="resumo" className="text-xs">
                    Totais e Impostos
                  </TabsTrigger>
                  <TabsTrigger value="itens" className="text-xs">
                    Itens da Nota ({itens.length})
                  </TabsTrigger>
                  <TabsTrigger value="json" className="text-xs">
                    JSON Focus NFe
                  </TabsTrigger>
                </TabsList>

                {/* Aba 1: Totais e Impostos */}
                <TabsContent value="resumo" className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-50 rounded-lg border">
                      <span className="text-[10px] uppercase text-slate-400 block font-semibold">
                        Valor Produtos
                      </span>
                      <strong className="text-slate-800 text-sm font-semibold">
                        R$ {Number(doc.valor_produtos || 0).toFixed(2)}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border">
                      <span className="text-[10px] uppercase text-slate-400 block font-semibold">
                        Descontos
                      </span>
                      <strong className="text-amber-700 text-sm font-semibold">
                        - R$ {Number(doc.valor_desconto || 0).toFixed(2)}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border">
                      <span className="text-[10px] uppercase text-slate-400 block font-semibold">
                        Frete + Outras
                      </span>
                      <strong className="text-slate-800 text-sm font-semibold">
                        R${' '}
                        {(
                          Number(doc.valor_frete || 0) + Number(doc.valor_outras_despesas || 0)
                        ).toFixed(2)}
                      </strong>
                    </div>
                    <div className="p-2.5 bg-blue-50/70 rounded-lg border border-blue-200">
                      <span className="text-[10px] uppercase text-blue-700 block font-bold">
                        Total da Nota
                      </span>
                      <strong className="text-blue-900 text-base font-bold">
                        R$ {Number(doc.valor_total || 0).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  {/* Quadro detalhado de tributos */}
                  <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2 text-xs">
                    <div className="font-bold text-slate-700 flex items-center gap-1.5 border-b pb-1.5">
                      <Calculator className="h-4 w-4 text-primary" />
                      <span>Detalhamento Tributário Consolidado</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Base ICMS Próprio</span>
                        <span className="font-mono font-medium">
                          R$ {Number(doc.base_icms || 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Valor ICMS Próprio</span>
                        <span className="font-mono font-medium text-emerald-700">
                          R$ {Number(doc.valor_icms || 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Base ICMS ST</span>
                        <span className="font-mono font-medium">
                          R$ {Number(doc.base_icms_st || 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Valor ICMS ST</span>
                        <span className="font-mono font-medium text-purple-700">
                          R$ {Number(doc.valor_icms_st || 0).toFixed(2)}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-400 block text-[11px]">FCP</span>
                        <span className="font-mono font-medium">
                          R$ {Number(doc.valor_fcp || 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">IPI</span>
                        <span className="font-mono font-medium">
                          R$ {Number(doc.valor_ipi || 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">PIS</span>
                        <span className="font-mono font-medium">
                          R$ {Number(doc.valor_pis || 0).toFixed(2)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">COFINS</span>
                        <span className="font-mono font-medium">
                          R$ {Number(doc.valor_cofins || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* DIFAL quando calculado (valor vem do backend: doc.valor_icms_uf_destino + doc.valor_fcp_uf_destino) */}
                    {totalDifal > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-100 p-2 rounded bg-blue-50/50 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-blue-900">
                          DIFAL (Partilha Destino {doc.destinatario_uf}):
                        </span>
                        <span className="font-mono font-bold text-blue-800">
                          R$ {totalDifal.toFixed(2)} (ICMS: R${' '}
                          {Number(doc.valor_icms_uf_destino || 0).toFixed(2)} + FCP: R${' '}
                          {Number(doc.valor_fcp_uf_destino || 0).toFixed(2)})
                        </span>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Aba 2: Tabela de Itens */}
                <TabsContent value="itens" className="pt-2">
                  <div className="border rounded-lg overflow-x-auto max-h-72">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b sticky top-0">
                        <tr>
                          <th className="py-2 px-2 text-center w-8">#</th>
                          <th className="py-2 px-3">Descrição / NCM</th>
                          <th className="py-2 px-2 text-center">CFOP</th>
                          <th className="py-2 px-2 text-center">CST/CSOSN</th>
                          <th className="py-2 px-2 text-right">Qtd</th>
                          <th className="py-2 px-2 text-right">V. Unit</th>
                          <th className="py-2 px-2 text-right">Base ICMS</th>
                          <th className="py-2 px-2 text-right">ICMS</th>
                          <th className="py-2 px-2 text-right">ST</th>
                          <th className="py-2 px-3 text-right">Total Item</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {itens.map((it: DocumentoFiscalItemCalculado) => (
                          <tr key={it.item} className="hover:bg-slate-50/60">
                            <td className="py-2 px-2 text-center text-slate-400 font-mono">
                              {it.item}
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-medium text-slate-900 line-clamp-1">
                                {it.descricao}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                NCM: {it.ncm || '-'} {it.cest ? `| CEST: ${it.cest}` : ''}
                              </div>
                            </td>
                            <td className="py-2 px-2 text-center font-mono font-medium">
                              {it.cfop}
                            </td>
                            <td className="py-2 px-2 text-center font-mono">
                              <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                                {it.csosn || it.cst_icms || '-'}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 text-right font-mono">{it.quantidade}</td>
                            <td className="py-2 px-2 text-right font-mono">
                              {Number(it.valor_unitario).toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-600">
                              {Number(it.base_icms || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-emerald-700">
                              {Number(it.valor_icms || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-purple-700">
                              {Number(it.valor_icms_st || 0).toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                              {Number(it.valor_total).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* Aba 3: JSON Focus NFe */}
                <TabsContent value="json" className="pt-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1 font-mono">
                        <Code className="h-3.5 w-3.5 text-blue-600" />
                        Payload plano gerado para o endpoint Focus NFe
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px]"
                        onClick={() => {
                          if (dados?.json_focus) {
                            navigator.clipboard.writeText(JSON.stringify(dados.json_focus, null, 2))
                          }
                        }}
                      >
                        Copiar JSON
                      </Button>
                    </div>
                    <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-72">
                      {JSON.stringify(dados?.json_focus || {}, null, 2)}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Nesta etapa a nota é gravada apenas como{' '}
            <strong className="text-slate-700">Rascunho</strong>. Nenhuma chamada externa é feita à
            Focus ou SEFAZ.
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
