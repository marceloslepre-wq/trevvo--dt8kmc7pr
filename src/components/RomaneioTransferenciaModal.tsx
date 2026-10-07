import React from 'react'
import { TransferenciaCompleta } from '@/services/transferencias'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

interface RomaneioTransferenciaModalProps {
  transferencia: TransferenciaCompleta
  onClose: () => void
}

export const RomaneioTransferenciaModal: React.FC<RomaneioTransferenciaModalProps> = ({
  transferencia,
  onClose,
}) => {
  const handlePrint = () => {
    window.print()
  }

  const formatarData = (d?: string) => {
    if (!d) return '-'
    try {
      return new Date(d).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return d
    }
  }

  const formatarMoeda = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0)
  }

  const totalQtd = transferencia.itens.reduce((acc, i) => acc + (i.quantidade || 0), 0)
  const totalValor = transferencia.itens.reduce(
    (acc, i) => acc + (i.quantidade || 0) * (i.custo_unitario || 0),
    0,
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:p-0 print:bg-white print:static">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden print:max-h-none print:shadow-none print:w-full print:rounded-none">
        {/* Cabeçalho de Ações (oculto na impressão) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 print:hidden">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Romaneio de Conferência Física — TR-{transferencia.numero}
            </h2>
            <p className="text-xs text-slate-500">
              Visualização para impressão física de transporte e conferência de mercadorias.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Printer className="w-4 h-4 mr-2" />
              Imprimir Romaneio
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>

        {/* Conteúdo Imprimível */}
        <div className="p-8 overflow-y-auto space-y-6 text-slate-900 print:overflow-visible print:p-4 text-xs font-sans">
          <div className="border-b-2 border-slate-800 pb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold tracking-tight uppercase">
                  Romaneio de Transferência entre Filiais
                </h1>
                <p className="text-slate-500 text-xs">
                  Documento de Controle e Conferência de Mercadorias
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs uppercase font-semibold text-slate-400 block">
                  Identificação
                </span>
                <span className="text-xl font-mono font-bold text-slate-900">
                  TR-{String(transferencia.numero).padStart(6, '0')}
                </span>
                <span className="block text-[11px] text-slate-500">
                  Status: <strong className="uppercase">{transferencia.status}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Dados das Filiais e Datas */}
          <div className="grid grid-cols-2 gap-4 border p-3 rounded bg-slate-50/50 print:bg-transparent">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Origem (Remetente)
              </span>
              <p className="font-bold text-sm text-slate-800">
                {transferencia.expand?.empresa_origem_id?.razao_social ||
                  transferencia.expand?.empresa_origem_id?.nome_fantasia ||
                  'Empresa de Origem'}
              </p>
              <p className="text-slate-600">
                CNPJ: {transferencia.expand?.empresa_origem_id?.cnpj || '-'}
              </p>
              <p className="text-slate-600">
                Envio em:{' '}
                <strong>{formatarData(transferencia.data_envio || transferencia.created)}</strong>
              </p>
              {transferencia.expand?.usuario_envio_id && (
                <p className="text-slate-500 text-[11px]">
                  Operador Envio: {transferencia.expand.usuario_envio_id.nome}
                </p>
              )}
            </div>

            <div className="space-y-1 border-l pl-4">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Destino (Destinatário)
              </span>
              <p className="font-bold text-sm text-slate-800">
                {transferencia.expand?.empresa_destino_id?.razao_social ||
                  transferencia.expand?.empresa_destino_id?.nome_fantasia ||
                  'Empresa de Destino'}
              </p>
              <p className="text-slate-600">
                CNPJ: {transferencia.expand?.empresa_destino_id?.cnpj || '-'}
              </p>
              <p className="text-slate-600">
                Recebimento em: <strong>{formatarData(transferencia.data_recebimento)}</strong>
              </p>
              {transferencia.expand?.usuario_recebimento_id && (
                <p className="text-slate-500 text-[11px]">
                  Operador Recebimento: {transferencia.expand.usuario_recebimento_id.nome}
                </p>
              )}
            </div>
          </div>

          {(transferencia.nota_fiscal_numero || transferencia.observacao) && (
            <div className="grid grid-cols-2 gap-4 border p-2.5 rounded bg-white text-[11px]">
              <div>
                <span className="text-slate-400 font-semibold block">Nota Fiscal / Chave:</span>
                <span className="font-mono text-slate-700">
                  {transferencia.nota_fiscal_numero
                    ? `NF-e ${transferencia.nota_fiscal_numero}`
                    : 'Não informada'}
                </span>
                {transferencia.nota_fiscal_chave && (
                  <span className="block font-mono text-[10px] text-slate-500">
                    Chave: {transferencia.nota_fiscal_chave}
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 font-semibold block">Observações:</span>
                <span className="text-slate-700">
                  {transferencia.observacao || 'Nenhuma observação informada.'}
                </span>
              </div>
            </div>
          )}

          {/* Tabela de Itens para Conferência */}
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2">
              Itens da Transferência ({transferencia.itens.length})
            </h3>
            <table className="w-full text-left border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-[11px] text-slate-700">
                  <th className="p-2 border-r border-slate-300 w-10 text-center">#</th>
                  <th className="p-2 border-r border-slate-300">Código / Descrição do Produto</th>
                  <th className="p-2 border-r border-slate-300 w-16 text-center">UN</th>
                  <th className="p-2 border-r border-slate-300 w-28">Lote / Validade</th>
                  <th className="p-2 border-r border-slate-300 w-24 text-right">Qtd Enviada</th>
                  <th className="p-2 border-r border-slate-300 w-24 text-right">Custo Unit.</th>
                  <th className="p-2 border-r border-slate-300 w-24 text-right">Subtotal</th>
                  <th className="p-2 w-28 text-center bg-slate-200/60 font-semibold">
                    Qtd Conferida [ ✓ ]
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transferencia.itens.map((item, idx) => {
                  const prod = item.expand?.produto_id
                  const lote = item.expand?.lote_id
                  const sigla = (prod as any)?.expand?.unidade_id?.sigla || 'UN'
                  const subtotal = item.quantidade * (item.custo_unitario || 0)

                  return (
                    <tr key={item.id} className="text-[11px] hover:bg-slate-50">
                      <td className="p-2 text-center border-r border-slate-300 text-slate-500 font-mono">
                        {idx + 1}
                      </td>
                      <td className="p-2 border-r border-slate-300">
                        <div className="font-semibold text-slate-900">
                          {prod ? prod.descricao : 'Produto não identificado'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          Código: {prod?.codigo || '-'} | GTIN: {prod?.gtin || '-'}
                        </div>
                      </td>
                      <td className="p-2 text-center border-r border-slate-300 uppercase font-mono">
                        {sigla}
                      </td>
                      <td className="p-2 border-r border-slate-300 text-[10px]">
                        {lote ? (
                          <div>
                            <span className="font-semibold text-slate-800">
                              Lote: {lote.numero_lote}
                            </span>
                            {lote.data_validade && (
                              <span className="block text-slate-500">
                                Val: {lote.data_validade}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Sem lote</span>
                        )}
                      </td>
                      <td className="p-2 text-right border-r border-slate-300 font-mono font-bold text-slate-900">
                        {item.quantidade.toFixed(4)}
                      </td>
                      <td className="p-2 text-right border-r border-slate-300 font-mono text-slate-600">
                        {formatarMoeda(item.custo_unitario)}
                      </td>
                      <td className="p-2 text-right border-r border-slate-300 font-mono font-semibold text-slate-800">
                        {formatarMoeda(subtotal)}
                      </td>
                      <td className="p-2 text-center border-slate-300 bg-slate-50">
                        {transferencia.status === 'Recebida' ? (
                          <span className="font-mono font-bold text-blue-700">
                            {(item.quantidade_recebida || 0).toFixed(4)}
                            {item.divergencia > 0 && (
                              <span className="text-[10px] text-red-600 block">
                                (Perda: {item.divergencia.toFixed(4)})
                              </span>
                            )}
                          </span>
                        ) : (
                          <div className="h-6 w-20 mx-auto border border-dashed border-slate-400 rounded bg-white" />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-semibold text-slate-800 border-t-2 border-slate-300">
                  <td colSpan={4} className="p-2 text-right uppercase text-[10px]">
                    Totais Gerais:
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-slate-900">
                    {totalQtd.toFixed(4)}
                  </td>
                  <td className="p-2 border-r border-slate-300"></td>
                  <td className="p-2 text-right font-mono font-bold text-blue-900">
                    {formatarMoeda(totalValor)}
                  </td>
                  <td className="p-2 bg-slate-200/60 text-center font-mono">
                    {transferencia.status === 'Recebida' ? (
                      <span className="font-bold">
                        {transferencia.itens
                          .reduce((acc, i) => acc + (i.quantidade_recebida || 0), 0)
                          .toFixed(4)}
                      </span>
                    ) : (
                      '___ / ___'
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Assinaturas para conferência física */}
          <div className="pt-10 grid grid-cols-2 gap-12 text-center text-xs">
            <div>
              <div className="border-t border-slate-400 pt-1 font-semibold text-slate-800">
                Responsável pelo Envio (Origem)
              </div>
              <p className="text-[10px] text-slate-500">Assinatura / Carimbo</p>
            </div>
            <div>
              <div className="border-t border-slate-400 pt-1 font-semibold text-slate-800">
                Responsável pelo Recebimento (Destino)
              </div>
              <p className="text-[10px] text-slate-500">Assinatura e Data de Conferência</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
export default RomaneioTransferenciaModal
