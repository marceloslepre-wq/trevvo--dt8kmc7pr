import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Printer,
  ArrowLeft,
  AlertCircle,
  FileText,
  Scale,
  TrendingUp,
  TrendingDown,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { obterArquivoSpedPorId, SpedArquivoRegistro } from '@/services/configSped'
import { Empresa, obterEmpresaPorId } from '@/services/empresas'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'

export default function SpedRelatorioConferenciaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { empresaAtiva } = useEmpresaAtiva()

  const [arquivo, setArquivo] = useState<SpedArquivoRegistro | null>(null)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let montado = true

    async function carregarDados() {
      if (!id) {
        setErro('Identificador do arquivo SPED não informado.')
        setCarregando(false)
        return
      }

      try {
        setCarregando(true)
        setErro(null)

        const regArquivo = await obterArquivoSpedPorId(id)
        if (!montado) return
        setArquivo(regArquivo)

        // Carrega a empresa vinculada ao arquivo (ou usa a empresa ativa se coincidir)
        if (empresaAtiva && empresaAtiva.id === regArquivo.empresa_id) {
          setEmpresa(empresaAtiva)
        } else if (regArquivo.empresa_id) {
          try {
            const emp = await obterEmpresaPorId(regArquivo.empresa_id)
            if (montado) setEmpresa(emp)
          } catch (errEmp) {
            console.warn('Não foi possível obter dados completos da empresa:', errEmp)
          }
        }
      } catch (err: unknown) {
        console.error('Erro ao carregar arquivo SPED para relatório:', err)
        if (montado) {
          const msg = (err as { message?: string })?.message || 'Arquivo SPED não encontrado.'
          setErro(msg)
        }
      } finally {
        if (montado) setCarregando(false)
      }
    }

    carregarDados()

    return () => {
      montado = false
    }
  }, [id, empresaAtiva])

  const formatarMoeda = (valor?: number | null) => {
    const v = Number(valor || 0)
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarCnpj = (cnpj?: string) => {
    if (!cnpj) return '-'
    const c = cnpj.replace(/\D/g, '')
    if (c.length === 14) {
      return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    }
    return cnpj
  }

  const handleImprimir = () => {
    window.print()
  }

  if (carregando) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-600 font-medium">
            Carregando relatório de conferência...
          </p>
        </div>
      </div>
    )
  }

  if (erro || !arquivo) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-6 rounded-lg border border-slate-200 shadow-sm text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">Erro ao abrir relatório</h2>
            <p className="text-xs text-slate-600">{erro || 'Arquivo não encontrado.'}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/fiscal/sped')}
            className="text-xs"
          >
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar ao SPED Fiscal
          </Button>
        </div>
      </div>
    )
  }

  const resumoSaida = arquivo.resumo_saida
  const resumoEntrada = arquivo.resumo_entrada
  const resumoApuracao = arquivo.resumo_apuracao
  const icmsProprio = resumoApuracao?.icms_proprio
  const difalPorUf = resumoApuracao?.difal_por_uf
  const inventario = resumoApuracao?.inventario_h005
  const validacoes = arquivo.validacoes || []

  // Extração das listas de canceladas, denegadas e inutilizadas de resumo_saida
  const canceladasDenegadas = resumoSaida?.canceladas_denegadas || []
  const inutilizadas = resumoSaida?.inutilizadas || []
  const temListaDocumentos = canceladasDenegadas.length > 0 || inutilizadas.length > 0

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 print:p-0 print:bg-white text-slate-900 font-sans">
      {/* Barra de Ações - Oculta na Impressão */}
      <div className="max-w-5xl mx-auto mb-4 flex items-center justify-between print:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/fiscal/sped')}
          className="text-xs bg-white text-slate-700 hover:bg-slate-50 border-slate-300"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Voltar ao SPED Fiscal
        </Button>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleImprimir}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Imprimir / Salvar em PDF
          </Button>
        </div>
      </div>

      {/* Folha do Relatório */}
      <div className="max-w-5xl mx-auto bg-white border border-slate-300 print:border-none shadow-sm rounded-md print:rounded-none p-8 print:p-6 space-y-6">
        {/* Faixa destacada para Modo Teste */}
        {arquivo.modo === 'Teste' && (
          <div className="bg-amber-100 border-2 border-dashed border-amber-500 text-amber-950 px-4 py-2 text-center rounded font-extrabold uppercase text-xs tracking-wider">
            ARQUIVO DE TESTE, NÃO ENTREGAR
          </div>
        )}

        {/* Cabeçalho */}
        <header className="border-b-2 border-slate-800 pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-6 h-6 text-slate-800 print:text-black" />
                <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">
                  Relatório de Conferência do SPED Fiscal
                </h1>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                EFD ICMS/IPI — Escrituração Fiscal Digital
              </p>
            </div>

            <div className="text-right sm:text-right text-xs space-y-0.5 self-stretch sm:self-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
              <div>
                <span className="text-slate-500 font-medium">Período: </span>
                <span className="font-bold text-slate-900 font-mono text-sm">
                  {arquivo.periodo}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Modo: </span>
                <span
                  className={`font-bold ${
                    arquivo.modo === 'Teste'
                      ? 'text-amber-700 uppercase font-black'
                      : 'text-slate-900'
                  }`}
                >
                  {arquivo.modo}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-medium">Status: </span>
                <span className="font-semibold text-slate-800">{arquivo.status}</span>
              </div>
              {arquivo.quantidade_linhas !== undefined && (
                <div>
                  <span className="text-slate-500 font-medium">Linhas: </span>
                  <span className="font-mono text-slate-700">
                    {arquivo.quantidade_linhas.toLocaleString('pt-BR')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Dados da Empresa */}
          <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs bg-slate-50 print:bg-transparent p-3 print:p-0 rounded">
            <div>
              <span className="text-slate-500 block text-[11px] uppercase font-semibold">
                Razão Social
              </span>
              <span className="font-bold text-slate-900">
                {empresa?.razao_social || 'Não informada'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px] uppercase font-semibold">CNPJ</span>
              <span className="font-mono font-medium text-slate-900">
                {formatarCnpj(empresa?.cnpj)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px] uppercase font-semibold">
                Inscrição Estadual
              </span>
              <span className="font-mono font-medium text-slate-900">
                {empresa?.inscricao_estadual || 'ISENTO'}
              </span>
            </div>
          </div>

          {/* Dados de entrega quando existirem */}
          {arquivo.recibo_entrega && (
            <div className="mt-2 text-xs bg-blue-50 border border-blue-200 text-blue-950 p-2 rounded flex flex-wrap justify-between items-center">
              <span>
                <strong>Recibo de Entrega:</strong>{' '}
                <span className="font-mono">{arquivo.recibo_entrega}</span>
              </span>
              {arquivo.entregue_em && (
                <span className="text-blue-800 text-[11px]">
                  Entregue em: {new Date(arquivo.entregue_em).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
          )}
        </header>

        {/* 1. Resumo das SAÍDAS por CFOP e CST */}
        <section className="space-y-2">
          <div className="flex items-center justify-between border-b border-slate-300 pb-1">
            <h2 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-blue-700" />
              1. Resumo das Saídas do Período (Bloco C)
            </h2>
            {resumoSaida && (
              <div className="text-xs text-slate-600 space-x-3">
                <span>
                  NF-e: <strong>{resumoSaida.total_nfe || 0}</strong>
                </span>
                <span>
                  NFC-e: <strong>{resumoSaida.total_nfce || 0}</strong>
                </span>
                <span>
                  Total VL_DOC: <strong>{formatarMoeda(resumoSaida.total_vl_doc)}</strong>
                </span>
                <span>
                  Total ICMS: <strong>{formatarMoeda(resumoSaida.total_vl_icms)}</strong>
                </span>
              </div>
            )}
          </div>

          {resumoSaida?.por_cfop_cst && resumoSaida.por_cfop_cst.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-300 border-collapse">
                <thead>
                  <tr className="bg-slate-100 print:bg-slate-200 text-slate-700 text-left">
                    <th className="border border-slate-300 p-1.5 font-bold text-center w-16">
                      CFOP
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-center w-16">
                      CST
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-right">
                      Valor Contábil
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-right">
                      Base ICMS
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-right">
                      Valor ICMS
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-right">
                      Base ICMS ST
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-right">
                      Valor ICMS ST
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resumoSaida.por_cfop_cst.map((item, idx) => (
                    <tr
                      key={`saida-${idx}`}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                    >
                      <td className="border border-slate-300 p-1.5 text-center font-mono font-medium">
                        {item.cfop || '-'}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-center font-mono">
                        {item.cst || '-'}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {formatarMoeda(item.vl_contabil)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {formatarMoeda(item.vl_bc_icms)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {formatarMoeda(item.vl_icms)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {formatarMoeda(item.vl_bc_icms_st)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {formatarMoeda(item.vl_icms_st)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-400">
                    <td colSpan={2} className="border border-slate-300 p-1.5 text-right uppercase">
                      Totalizador Saídas:
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">
                      {formatarMoeda(
                        resumoSaida.por_cfop_cst.reduce(
                          (acc, curr) => acc + (curr.vl_contabil || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">
                      {formatarMoeda(
                        resumoSaida.por_cfop_cst.reduce(
                          (acc, curr) => acc + (curr.vl_bc_icms || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">
                      {formatarMoeda(
                        resumoSaida.por_cfop_cst.reduce(
                          (acc, curr) => acc + (curr.vl_icms || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">
                      {formatarMoeda(
                        resumoSaida.por_cfop_cst.reduce(
                          (acc, curr) => acc + (curr.vl_bc_icms_st || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">
                      {formatarMoeda(
                        resumoSaida.por_cfop_cst.reduce(
                          (acc, curr) => acc + (curr.vl_icms_st || 0),
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-2">
              Nenhum detalhamento de saídas por CFOP/CST gravado no arquivo.
            </p>
          )}
        </section>

        {/* 2. Resumo das ENTRADAS por CFOP e CST */}
        <section className="space-y-2">
          <div className="flex items-center justify-between border-b border-slate-300 pb-1">
            <h2 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-emerald-700" />
              2. Resumo das Entradas do Período (Bloco C)
            </h2>
            {resumoEntrada && (
              <div className="text-xs text-slate-600 space-x-3">
                <span>
                  Compras: <strong>{resumoEntrada.total_compras || 0}</strong>
                </span>
                <span>
                  Transferências: <strong>{resumoEntrada.total_transferencias || 0}</strong>
                </span>
                <span>
                  Total VL_DOC: <strong>{formatarMoeda(resumoEntrada.total_vl_doc)}</strong>
                </span>
                <span>
                  Crédito ICMS: <strong>{formatarMoeda(resumoEntrada.total_credito_icms)}</strong>
                </span>
              </div>
            )}
          </div>

          {resumoEntrada?.por_cfop_cst && resumoEntrada.por_cfop_cst.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-300 border-collapse">
                <thead>
                  <tr className="bg-slate-100 print:bg-slate-200 text-slate-700 text-left">
                    <th className="border border-slate-300 p-1.5 font-bold text-center w-16">
                      CFOP
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-center w-16">
                      CST
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-right">
                      Valor Contábil
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-right">
                      Base ICMS
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-right">
                      Valor ICMS
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-right">
                      Base ICMS ST
                    </th>
                    <th className="border border-slate-300 p-1.5 font-bold text-right">
                      Valor ICMS ST
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {resumoEntrada.por_cfop_cst.map((item, idx) => (
                    <tr
                      key={`entrada-${idx}`}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                    >
                      <td className="border border-slate-300 p-1.5 text-center font-mono font-medium">
                        {item.cfop || '-'}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-center font-mono">
                        {item.cst || '-'}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {formatarMoeda(item.vl_contabil)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {formatarMoeda(item.vl_bc_icms)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {formatarMoeda(item.vl_icms)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {formatarMoeda(item.vl_bc_icms_st)}
                      </td>
                      <td className="border border-slate-300 p-1.5 text-right font-mono">
                        {formatarMoeda(item.vl_icms_st)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-400">
                    <td colSpan={2} className="border border-slate-300 p-1.5 text-right uppercase">
                      Totalizador Entradas:
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">
                      {formatarMoeda(
                        resumoEntrada.por_cfop_cst.reduce(
                          (acc, curr) => acc + (curr.vl_contabil || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">
                      {formatarMoeda(
                        resumoEntrada.por_cfop_cst.reduce(
                          (acc, curr) => acc + (curr.vl_bc_icms || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">
                      {formatarMoeda(
                        resumoEntrada.por_cfop_cst.reduce(
                          (acc, curr) => acc + (curr.vl_icms || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">
                      {formatarMoeda(
                        resumoEntrada.por_cfop_cst.reduce(
                          (acc, curr) => acc + (curr.vl_bc_icms_st || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">
                      {formatarMoeda(
                        resumoEntrada.por_cfop_cst.reduce(
                          (acc, curr) => acc + (curr.vl_icms_st || 0),
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-2">
              Nenhum detalhamento de entradas por CFOP/CST gravado no arquivo.
            </p>
          )}
        </section>

        {/* 3. Documentos Fiscais Cancelados, Denegados e Inutilizados (omitido se vazio) */}
        {temListaDocumentos && (
          <section className="space-y-3">
            <div className="border-b border-slate-300 pb-1">
              <h2 className="text-sm font-bold uppercase text-slate-800">
                3. Documentos Fiscais Cancelados, Denegados e Inutilizados
              </h2>
            </div>

            {canceladasDenegadas.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-slate-700 uppercase">
                  Notas Canceladas e Denegadas ({canceladasDenegadas.length})
                </h3>
                <table className="w-full text-xs border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="border border-slate-300 p-1.5 w-24">Situação</th>
                      <th className="border border-slate-300 p-1.5 w-16 text-center">Modelo</th>
                      <th className="border border-slate-300 p-1.5 w-16 text-center">Série</th>
                      <th className="border border-slate-300 p-1.5 w-24 text-center">Número</th>
                      <th className="border border-slate-300 p-1.5">Chave de Acesso</th>
                      <th className="border border-slate-300 p-1.5">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {canceladasDenegadas.map((doc, idx) => (
                      <tr
                        key={`canc-${idx}`}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                      >
                        <td className="border border-slate-300 p-1.5 font-semibold">
                          <span
                            className={
                              doc.tipo === 'Denegada'
                                ? 'text-rose-700'
                                : doc.tipo === 'Cancelada'
                                  ? 'text-amber-700'
                                  : 'text-slate-700'
                            }
                          >
                            {doc.tipo}
                          </span>
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center font-mono">
                          {doc.modelo}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center font-mono">
                          {doc.serie}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center font-mono font-medium">
                          {doc.numero}
                        </td>
                        <td className="border border-slate-300 p-1.5 font-mono text-[11px] text-slate-600">
                          {doc.chave_acesso || '-'}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-slate-700">
                          {doc.motivo || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {inutilizadas.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <h3 className="text-xs font-semibold text-slate-700 uppercase">
                  Numerações Inutilizadas ({inutilizadas.length})
                </h3>
                <table className="w-full text-xs border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 text-left">
                      <th className="border border-slate-300 p-1.5 w-24">Tipo</th>
                      <th className="border border-slate-300 p-1.5 w-16 text-center">Modelo</th>
                      <th className="border border-slate-300 p-1.5 w-16 text-center">Série</th>
                      <th className="border border-slate-300 p-1.5 w-24 text-center">Número</th>
                      <th className="border border-slate-300 p-1.5">Justificativa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inutilizadas.map((inut, idx) => (
                      <tr
                        key={`inut-${idx}`}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                      >
                        <td className="border border-slate-300 p-1.5 font-medium text-slate-700">
                          {inut.tipo}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center font-mono">
                          {inut.modelo}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center font-mono">
                          {inut.serie}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center font-mono font-medium">
                          {inut.numero}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-slate-700">
                          {inut.justificativa || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* 4. Apuração do ICMS Próprio (Bloco E) */}
        <section className="space-y-3">
          <div className="border-b border-slate-300 pb-1">
            <h2 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-amber-700" />
              4. Apuração do ICMS Próprio (Registro E110)
            </h2>
          </div>

          {icmsProprio ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Coluna 1: Débitos e Ajustes Positivos */}
                <table className="w-full text-xs border border-slate-300 border-collapse">
                  <tbody>
                    <tr className="border-b border-slate-300 bg-slate-50">
                      <td className="p-2 font-medium text-slate-700">
                        Total dos Débitos por Saídas
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-slate-900">
                        {formatarMoeda(icmsProprio.total_debitos)}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="p-2 text-slate-600">Ajustes a Débito (E111)</td>
                      <td className="p-2 text-right font-mono">
                        {formatarMoeda(icmsProprio.total_ajuste_debitos)}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="p-2 text-slate-600">Estorno de Créditos</td>
                      <td className="p-2 text-right font-mono">
                        {formatarMoeda(icmsProprio.estorno_creditos)}
                      </td>
                    </tr>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300">
                      <td className="p-2 text-slate-900 uppercase">Subtotal Débitos:</td>
                      <td className="p-2 text-right font-mono text-slate-900">
                        {formatarMoeda(
                          (icmsProprio.total_debitos || 0) +
                            (icmsProprio.total_ajuste_debitos || 0) +
                            (icmsProprio.estorno_creditos || 0),
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Coluna 2: Créditos, Saldo Anterior e Ajustes */}
                <table className="w-full text-xs border border-slate-300 border-collapse">
                  <tbody>
                    <tr className="border-b border-slate-300 bg-slate-50">
                      <td className="p-2 font-medium text-slate-700">
                        Total dos Créditos por Entradas
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-emerald-800">
                        {formatarMoeda(icmsProprio.total_creditos)}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="p-2 text-slate-600">Ajustes a Crédito (E111)</td>
                      <td className="p-2 text-right font-mono">
                        {formatarMoeda(icmsProprio.total_ajuste_creditos)}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="p-2 text-slate-600">Estorno de Débitos</td>
                      <td className="p-2 text-right font-mono">
                        {formatarMoeda(icmsProprio.estorno_debitos)}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="p-2 text-slate-600">Saldo Credor do Mês Anterior</td>
                      <td className="p-2 text-right font-mono">
                        {formatarMoeda(icmsProprio.saldo_credor_anterior)}
                      </td>
                    </tr>
                    <tr className="bg-slate-100 font-bold border-t border-slate-300">
                      <td className="p-2 text-slate-900 uppercase">Subtotal Créditos:</td>
                      <td className="p-2 text-right font-mono text-slate-900">
                        {formatarMoeda(
                          (icmsProprio.total_creditos || 0) +
                            (icmsProprio.total_ajuste_creditos || 0) +
                            (icmsProprio.estorno_debitos || 0) +
                            (icmsProprio.saldo_credor_anterior || 0),
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Quadro de Fechamento do Saldo */}
              <div className="bg-slate-50 border border-slate-300 p-3 rounded">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px] uppercase">
                      Saldo Devedor Apurado
                    </span>
                    <span className="text-sm font-mono font-bold text-slate-900">
                      {formatarMoeda(icmsProprio.saldo_apurado)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px] uppercase">
                      Total de Deduções
                    </span>
                    <span className="text-sm font-mono font-medium text-slate-800">
                      {formatarMoeda(icmsProprio.total_deducoes)}
                    </span>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 p-2 rounded">
                    <span className="text-rose-800 block text-[11px] font-bold uppercase">
                      ICMS a Recolher
                    </span>
                    <span className="text-base font-mono font-extrabold text-rose-950">
                      {formatarMoeda(icmsProprio.icms_recolher)}
                    </span>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 p-2 rounded">
                    <span className="text-emerald-800 block text-[11px] font-bold uppercase">
                      Saldo a Transportar
                    </span>
                    <span className="text-base font-mono font-extrabold text-emerald-950">
                      {formatarMoeda(icmsProprio.saldo_credor_transportar)}
                    </span>
                  </div>
                </div>

                {/* Débito especial se houver */}
                {(icmsProprio.debito_especial || 0) > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200 text-xs flex justify-between">
                    <span className="text-slate-600">
                      Débitos Especiais (recolhimento em separado):
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatarMoeda(icmsProprio.debito_especial)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-2">
              Nenhuma apuração de ICMS próprio gravada no arquivo.
            </p>
          )}

          {/* DIFAL por UF quando gravado em resumo_apuracao */}
          {difalPorUf && Object.keys(difalPorUf).length > 0 && (
            <div className="space-y-1.5 pt-2">
              <h3 className="text-xs font-semibold text-slate-800 uppercase flex items-center justify-between">
                <span>DIFAL / FCP por UF de Destino (Registros E300 / E310 / E316)</span>
                <span className="text-[11px] text-slate-500 font-normal">EC 87/2015</span>
              </h3>
              <table className="w-full text-xs border border-slate-300 border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-left">
                    <th className="border border-slate-300 p-1.5 text-center w-16">UF</th>
                    <th className="border border-slate-300 p-1.5 text-right">Débitos DIFAL</th>
                    <th className="border border-slate-300 p-1.5 text-right">Créditos DIFAL</th>
                    <th className="border border-slate-300 p-1.5 text-right">Débitos FCP</th>
                    <th className="border border-slate-300 p-1.5 text-right">Créditos FCP</th>
                    <th className="border border-slate-300 p-1.5 text-right font-bold text-rose-900">
                      Total a Recolher
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(difalPorUf).map(([uf, d]) => {
                    const recolherDifal =
                      d.vlRecolDifal !== undefined ? d.vlRecolDifal : d.recolher_difal || 0
                    const recolherFcp =
                      d.vlRecolFcp !== undefined ? d.vlRecolFcp : d.recolher_fcp || 0
                    const totalRecolherUf = recolherDifal + recolherFcp
                    return (
                      <tr key={`difal-${uf}`} className="border-b border-slate-300">
                        <td className="border border-slate-300 p-1.5 text-center font-bold font-mono bg-slate-50">
                          {uf}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono">
                          {formatarMoeda(d.debDifal !== undefined ? d.debDifal : d.debitos_difal)}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono">
                          {formatarMoeda(
                            d.credDifal !== undefined ? d.credDifal : d.creditos_difal,
                          )}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono">
                          {formatarMoeda(d.debFcp !== undefined ? d.debFcp : d.debitos_fcp)}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono">
                          {formatarMoeda(d.credFcp !== undefined ? d.credFcp : d.creditos_fcp)}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-right font-mono font-bold text-rose-950 bg-rose-50/40">
                          {formatarMoeda(totalRecolherUf)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 5. Total do Inventário (Bloco H) quando houver valor gravado */}
        {inventario && inventario.vl_inv !== undefined && (
          <section className="space-y-2">
            <div className="border-b border-slate-300 pb-1">
              <h2 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-700" />
                5. Inventário Físico (Bloco H — Registro H005)
              </h2>
            </div>
            <div className="bg-slate-50 border border-slate-300 p-3 rounded grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px] uppercase">
                  Data do Inventário
                </span>
                <span className="text-sm font-mono font-bold text-slate-900">
                  {inventario.dt_inv || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px] uppercase">Motivo (MOT_INV)</span>
                <span className="text-sm font-mono text-slate-900">
                  {inventario.mot_inv || '01'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px] uppercase">Total de Itens</span>
                <span className="text-sm font-mono font-bold text-slate-900">
                  {inventario.total_itens || 0}
                </span>
              </div>
              <div className="bg-purple-50 border border-purple-200 p-2 rounded">
                <span className="text-purple-800 block text-[11px] font-bold uppercase">
                  Valor Total do Estoque
                </span>
                <span className="text-base font-mono font-extrabold text-purple-950">
                  {formatarMoeda(inventario.vl_inv)}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* 6. Erros e Avisos a partir de validacoes */}
        <section className="space-y-2">
          <div className="border-b border-slate-300 pb-1">
            <h2 className="text-sm font-bold uppercase text-slate-800 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-slate-700" />
              6. Validações e Inconsistências Internas ({validacoes.length})
            </h2>
          </div>

          {validacoes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-300 border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 text-left">
                    <th className="border border-slate-300 p-1.5 w-20 text-center">Nível</th>
                    <th className="border border-slate-300 p-1.5 w-20 text-center">Registro</th>
                    <th className="border border-slate-300 p-1.5">Mensagem</th>
                    <th className="border border-slate-300 p-1.5 w-44">Referência</th>
                  </tr>
                </thead>
                <tbody>
                  {validacoes.map((v, idx) => (
                    <tr
                      key={`val-${idx}`}
                      className={
                        v.nivel === 'erro'
                          ? 'bg-rose-50/40 text-rose-950'
                          : idx % 2 === 0
                            ? 'bg-white'
                            : 'bg-slate-50/50'
                      }
                    >
                      <td className="border border-slate-300 p-1.5 text-center font-bold uppercase text-[10px]">
                        <span
                          className={
                            v.nivel === 'erro'
                              ? 'bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded border border-rose-300'
                              : 'bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-300'
                          }
                        >
                          {v.nivel}
                        </span>
                      </td>
                      <td className="border border-slate-300 p-1.5 text-center font-mono font-medium">
                        {v.registro || '-'}
                      </td>
                      <td className="border border-slate-300 p-1.5 font-medium">{v.mensagem}</td>
                      <td className="border border-slate-300 p-1.5 font-mono text-[11px] text-slate-600">
                        {v.referencia || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 p-3 rounded text-xs">
              ✓ Nenhuma inconsistência ou aviso registrado no momento da geração deste arquivo.
            </div>
          )}
        </section>

        {/* Rodapé da Folha */}
        <footer className="pt-4 border-t border-slate-300 text-center text-[10px] text-slate-500 space-y-1">
          <p>
            Relatório gerado a partir dos dados gravados no registro do arquivo SPED (ID:{' '}
            {arquivo.id}) em {new Date().toLocaleString('pt-BR')}.
          </p>
          <p className="font-semibold text-slate-600">
            Documento de conferência interna. As informações fiscais oficiais constam no arquivo
            .txt transmitido via PVA.
          </p>
        </footer>
      </div>
    </div>
  )
}
