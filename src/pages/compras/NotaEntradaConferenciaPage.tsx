import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  FileText,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  CreditCard,
  Layers,
  Percent,
  Receipt,
  FileCode,
  Copy,
  Check,
  Ban,
  Clock,
  Printer,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  NotaEntrada,
  NotaEntradaItem,
  NotaEntradaParcela,
  obterNotaEntradaPorId,
  cancelarNotaEntrada,
} from '@/services/notasEntrada'
import { formatarCNPJ, formatarCPF } from '@/lib/validacoes'
import pb from '@/lib/pocketbase/client'

export const NotaEntradaConferenciaPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { pode } = usePermissoes()

  const podeEditar = pode('notas_entrada', 'editar')
  const podeCancelar = pode('notas_entrada', 'excluir')

  const [nota, setNota] = useState<NotaEntrada | null>(null)
  const [itens, setItens] = useState<NotaEntradaItem[]>([])
  const [parcelas, setParcelas] = useState<NotaEntradaParcela[]>([])
  const [carregando, setCarregando] = useState(true)
  const [conteudoXmlTexto, setConteudoXmlTexto] = useState<string>('')
  const [copiadoXml, setCopiadoXml] = useState(false)

  // Dialog Cancelar
  const [cancelarModalAberto, setCancelarModalAberto] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [cancelando, setCancelando] = useState(false)

  const carregarDados = useCallback(async () => {
    if (!id) return
    setCarregando(true)
    try {
      const dados = await obterNotaEntradaPorId(id)
      setNota(dados.nota)
      setItens(dados.itens)
      setParcelas(dados.parcelas)

      // Carregar conteúdo do XML para a aba XML
      if (dados.nota.xml_arquivo) {
        try {
          const fileUrl = pb.files.getURL(dados.nota, dados.nota.xml_arquivo)
          const resp = await fetch(fileUrl)
          if (resp.ok) {
            const txt = await resp.text()
            setConteudoXmlTexto(txt)
          }
        } catch {
          // fallback
        }
      }
    } catch (err: unknown) {
      toast({
        title: 'Erro ao carregar nota de entrada',
        description: err instanceof Error ? err.message : 'Falha ao buscar nota',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [id, toast])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // ==========================================
  // AVISOS DE AUDITORIA E CONFERÊNCIA
  // ==========================================
  const avisos = React.useMemo(() => {
    if (!nota) return []
    const lista: { tipo: 'aviso' | 'alerta'; texto: string }[] = []

    // 1. Fornecedor não cadastrado
    if (!nota.fornecedor_id) {
      lista.push({
        tipo: 'alerta',
        texto: 'Fornecedor ainda não vinculado/cadastrado no ERP para esta nota fiscal.',
      })
    }

    // 2. Itens sem produto vinculado
    const semProduto = itens.filter((i) => !i.produto_id)
    if (semProduto.length > 0) {
      lista.push({
        tipo: 'aviso',
        texto: `${semProduto.length} item(ns) ainda sem produto do catálogo vinculado (de-para pendente para próxima etapa).`,
      })
    }

    // 3. Parcela criada automaticamente
    if (
      parcelas.length === 1 &&
      parcelas[0].numero === '001' &&
      parcelas[0].forma_pagamento === '99'
    ) {
      lista.push({
        tipo: 'aviso',
        texto:
          'Parcela única gerada automaticamente com valor total na data de emissão (XML sem grupo de duplicatas).',
      })
    }

    // 4. Divergência de totais
    const somaItens = itens.reduce((acc, i) => acc + (i.valor_produto || 0), 0)
    const diff = Math.abs(somaItens - (nota.valor_produtos || 0))
    if (diff > 0.05 && itens.length > 0) {
      lista.push({
        tipo: 'alerta',
        texto: `A soma dos produtos dos itens (R$ ${somaItens.toFixed(2)}) diverge do total de produtos declarado na nota (R$ ${nota.valor_produtos?.toFixed(2)}).`,
      })
    }

    return lista
  }, [nota, itens, parcelas])

  const copiarChave = (chave: string) => {
    navigator.clipboard.writeText(chave)
    toast({ title: 'Chave de acesso copiada!' })
  }

  const copiarXml = () => {
    if (!conteudoXmlTexto) return
    navigator.clipboard.writeText(conteudoXmlTexto)
    setCopiadoXml(true)
    setTimeout(() => setCopiadoXml(false), 2000)
    toast({ title: 'Conteúdo do XML copiado!' })
  }

  const handleCancelarNota = async () => {
    if (!nota || !motivoCancelamento.trim()) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Informe uma justificativa para o cancelamento da nota de entrada.',
        variant: 'destructive',
      })
      return
    }

    setCancelando(true)
    try {
      await cancelarNotaEntrada(nota.id, motivoCancelamento)
      toast({
        title: 'Nota de entrada cancelada',
        description: 'O status da nota foi atualizado para Cancelada.',
      })
      setCancelarModalAberto(false)
      carregarDados()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao cancelar',
        description: err instanceof Error ? err.message : 'Falha ao processar cancelamento',
        variant: 'destructive',
      })
    } finally {
      setCancelando(false)
    }
  }

  if (carregando) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="inline-block animate-spin h-7 w-7 border-4 border-blue-600 border-t-transparent rounded-full mb-3" />
        <p className="text-sm">Carregando dados da nota de entrada...</p>
      </div>
    )
  }

  if (!nota) {
    return (
      <div className="py-16 text-center">
        <h3 className="text-lg font-semibold text-slate-800">Nota de entrada não encontrada</h3>
        <p className="text-sm text-slate-500 mt-1">
          O registro solicitado pode ter sido excluído ou a empresa ativa é diferente.
        </p>
        <Button
          onClick={() => navigate('/compras/notas-entrada')}
          className="mt-4"
          variant="outline"
        >
          Voltar para listagem
        </Button>
      </div>
    )
  }

  const statusBadgeClass =
    nota.status === 'Lançada'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : nota.status === 'Cancelada'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-amber-50 text-amber-700 border-amber-200'

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho Superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/compras/notas-entrada')}
              className="h-8 w-8 text-slate-500"
            >
              <ArrowLeft size={16} />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Nota de Entrada #{nota.numero}
              <Badge variant="outline" className={`text-xs ${statusBadgeClass}`}>
                {nota.status}
              </Badge>
              <Badge variant="outline" className="text-xs border-slate-300 font-mono">
                Mod {nota.modelo} - Série {nota.serie}
              </Badge>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-10">
            Fornecedor:{' '}
            <strong className="text-slate-800">
              {nota.expand?.fornecedor_id?.razao_social ||
                nota.expand?.fornecedor_id?.nome_fantasia ||
                'Não cadastrado'}
            </strong>{' '}
            • Emissão: {nota.data_emissao} • Entrada: {nota.data_entrada}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {nota.status === 'Em conferência' && podeCancelar && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelarModalAberto(true)}
              className="text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5"
            >
              <Ban size={14} />
              Cancelar Nota
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="text-slate-700 gap-1.5"
          >
            <Printer size={14} />
            Imprimir Espelho
          </Button>

          <Button
            size="sm"
            disabled
            title="O vínculo de produtos e cálculo de custo definitivo virão na próxima etapa"
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 opacity-90 cursor-not-allowed"
          >
            <CheckCircle2 size={14} />
            Efetivar Lançamento (Etapa 4)
          </Button>
        </div>
      </div>

      {/* Chave de Acesso */}
      {nota.chave_acesso && (
        <div className="bg-slate-100/80 px-4 py-2.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600">Chave de Acesso:</span>
            <code className="font-mono text-slate-800 font-semibold tracking-wider">
              {nota.chave_acesso}
            </code>
          </div>
          <div className="flex items-center gap-2">
            {nota.protocolo_autorizacao && (
              <Badge variant="outline" className="bg-white border-slate-300 text-[11px]">
                Protocolo: {nota.protocolo_autorizacao}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copiarChave(nota.chave_acesso!)}
              className="h-7 text-xs text-blue-600 hover:text-blue-700 gap-1"
            >
              <Copy size={12} />
              Copiar
            </Button>
          </div>
        </div>
      )}

      {/* Avisos no Topo */}
      {avisos.length > 0 && (
        <div className="space-y-2">
          {avisos.map((aviso, idx) => (
            <Alert
              key={idx}
              className={`py-2 text-xs ${
                aviso.tipo === 'alerta'
                  ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                  : 'bg-amber-50/80 border-amber-200 text-amber-900'
              }`}
            >
              <AlertTriangle
                className={`h-4 w-4 ${aviso.tipo === 'alerta' ? 'text-rose-600' : 'text-amber-600'}`}
              />
              <AlertDescription className="font-medium">{aviso.texto}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Abas de Conferência */}
      <Tabs defaultValue="itens" className="w-full">
        <TabsList className="bg-slate-100 p-1 border border-slate-200">
          <TabsTrigger value="cabecalho" className="text-xs gap-1.5">
            <Building2 size={13} />
            Cabeçalho
          </TabsTrigger>
          <TabsTrigger value="itens" className="text-xs gap-1.5">
            <Package size={13} />
            Itens ({itens.length})
          </TabsTrigger>
          <TabsTrigger value="totais" className="text-xs gap-1.5">
            <Receipt size={13} />
            Totais & Impostos
          </TabsTrigger>
          <TabsTrigger value="parcelas" className="text-xs gap-1.5">
            <CreditCard size={13} />
            Parcelas ({parcelas.length})
          </TabsTrigger>
          <TabsTrigger value="informacoes" className="text-xs gap-1.5">
            <FileText size={13} />
            Informações Adicionais
          </TabsTrigger>
          <TabsTrigger value="xml" className="text-xs gap-1.5">
            <FileCode size={13} />
            XML Formatado
          </TabsTrigger>
        </TabsList>

        {/* ================= ABA CABEÇALHO ================= */}
        <TabsContent value="cabecalho" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Dados do Fornecedor Emitente
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Razão Social:</span>
                  <span className="col-span-2 font-medium text-slate-800">
                    {nota.expand?.fornecedor_id?.razao_social || 'Fornecedor não vinculado'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Nome Fantasia:</span>
                  <span className="col-span-2 text-slate-800">
                    {nota.expand?.fornecedor_id?.nome_fantasia || '—'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">CNPJ / CPF:</span>
                  <span className="col-span-2 font-mono text-slate-800">
                    {nota.expand?.fornecedor_id?.cpf_cnpj
                      ? nota.expand.fornecedor_id.tipo_pessoa === 'Física'
                        ? formatarCPF(nota.expand.fornecedor_id.cpf_cnpj)
                        : formatarCNPJ(nota.expand.fornecedor_id.cpf_cnpj)
                      : '—'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Inscrição Estadual:</span>
                  <span className="col-span-2 text-slate-800">
                    {nota.expand?.fornecedor_id?.inscricao_estadual || '—'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Município / UF:</span>
                  <span className="col-span-2 text-slate-800">
                    {nota.expand?.fornecedor_id?.municipio || '—'} -{' '}
                    {nota.expand?.fornecedor_id?.uf || '—'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Dados Fiscais do Documento
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Origem Lançamento:</span>
                  <span className="col-span-2 font-medium">
                    <Badge variant="outline" className="text-[10px] bg-slate-50">
                      {nota.origem_lancamento}
                    </Badge>
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Tipo de Entrada:</span>
                  <span className="col-span-2 font-medium text-blue-700">{nota.tipo_entrada}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Natureza da Operação:</span>
                  <span className="col-span-2 text-slate-800">{nota.natureza_operacao || '—'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Data de Emissão:</span>
                  <span className="col-span-2 text-slate-800">{nota.data_emissao}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Data de Entrada:</span>
                  <span className="col-span-2 text-slate-800">{nota.data_entrada}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-slate-500">Modalidade de Frete:</span>
                  <span className="col-span-2 text-slate-800">
                    {nota.modalidade_frete === 0
                      ? '0 - Por conta do emitente (CIF)'
                      : nota.modalidade_frete === 1
                        ? '1 - Por conta do destinatário (FOB)'
                        : nota.modalidade_frete === 2
                          ? '2 - Terceiros'
                          : nota.modalidade_frete === 9
                            ? '9 - Sem frete'
                            : String(nota.modalidade_frete)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================= ABA ITENS ================= */}
        <TabsContent value="itens" className="mt-4">
          <Card className="border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 font-semibold text-slate-600">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3 w-28">Cód. Fornec.</th>
                    <th className="py-2.5 px-3">Descrição do Fornecedor</th>
                    <th className="py-2.5 px-3 w-24 font-mono">NCM</th>
                    <th className="py-2.5 px-3 w-20 font-mono">CFOP Forn.</th>
                    <th className="py-2.5 px-3 w-20 font-mono text-blue-700">CFOP Entr.</th>
                    <th className="py-2.5 px-3 w-16 text-center">Un.</th>
                    <th className="py-2.5 px-3 w-24 text-right">Qtd.</th>
                    <th className="py-2.5 px-3 w-24 text-right">Vlr. Unit.</th>
                    <th className="py-2.5 px-3 w-28 text-right">Total</th>
                    <th className="py-2.5 px-3 w-36">Vínculo Produto (ERP)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itens.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono font-medium">
                        {item.numero_item}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {item.codigo_fornecedor || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">
                          {item.descricao_fornecedor}
                        </div>
                        {item.gtin_fornecedor && item.gtin_fornecedor !== 'SEM GTIN' && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            EAN: {item.gtin_fornecedor}
                          </div>
                        )}
                        {item.lote_numero && (
                          <div className="text-[10px] text-amber-700 font-medium">
                            Lote: {item.lote_numero} (Validade: {item.lote_validade || '—'})
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {item.ncm_fornecedor || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {item.cfop_fornecedor || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        {item.cfop_entrada || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                        {item.unidade_fornecedor || 'UN'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium">
                        {item.quantidade_fornecedor.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        R$ {item.valor_unitario_fornecedor.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        R${' '}
                        {(
                          item.valor_produto ||
                          item.quantidade_fornecedor * item.valor_unitario_fornecedor
                        ).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3">
                        {item.expand?.produto_id ? (
                          <div className="text-[11px]">
                            <span className="font-semibold text-emerald-700">
                              [{item.expand.produto_id.codigo}]
                            </span>{' '}
                            <span className="text-slate-800 truncate block max-w-xs">
                              {item.expand.produto_id.descricao}
                            </span>
                          </div>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                          >
                            Não vinculado (Etapa 4)
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ================= ABA TOTAIS ================= */}
        <TabsContent value="totais" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-slate-200">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Composição do Valor Total
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Valor dos Produtos:</span>
                  <span className="font-mono font-medium">
                    R$ {nota.valor_produtos?.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Frete:</span>
                  <span className="font-mono">R$ {nota.valor_frete?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Seguro:</span>
                  <span className="font-mono">R$ {nota.valor_seguro?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) Outras Despesas:</span>
                  <span className="font-mono">R$ {nota.valor_outras_despesas?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) IPI:</span>
                  <span className="font-mono">R$ {nota.valor_ipi?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">(+) ICMS-ST / FCP:</span>
                  <span className="font-mono">
                    R$ {((nota.valor_icms_st || 0) + (nota.valor_fcp_st || 0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-rose-700">
                  <span>(-) Desconto:</span>
                  <span className="font-mono">R$ {nota.valor_desconto?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-2 pt-3 font-bold text-sm text-slate-900 border-t border-slate-200">
                  <span>Valor Total da Nota:</span>
                  <span className="font-mono text-blue-700">R$ {nota.valor_total?.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Bases e Tributos Destacados
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Base de Cálculo ICMS:</span>
                  <span className="font-mono">R$ {nota.base_icms?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Valor ICMS Normal:</span>
                  <span className="font-mono font-medium">R$ {nota.valor_icms?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Base ICMS-ST:</span>
                  <span className="font-mono">R$ {nota.base_icms_st?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Valor ICMS-ST:</span>
                  <span className="font-mono">R$ {nota.valor_icms_st?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Valor PIS:</span>
                  <span className="font-mono">R$ {nota.valor_pis?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Valor COFINS:</span>
                  <span className="font-mono">R$ {nota.valor_cofins?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 text-slate-400">
                  <span>Reforma IBS / CBS:</span>
                  <span className="font-mono">
                    R$ {((nota.valor_ibs || 0) + (nota.valor_cbs || 0)).toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="py-3 px-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Créditos Calculados
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <p className="text-[11px] text-slate-500 mb-2">
                  Créditos fiscais aproveitados na apuração do regime tributário (configuráveis na
                  conferência fiscal avançada).
                </p>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Crédito ICMS:</span>
                  <span className="font-mono">R$ {(nota.credito_icms || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Crédito IPI:</span>
                  <span className="font-mono">R$ {(nota.credito_ipi || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Crédito PIS:</span>
                  <span className="font-mono">R$ {(nota.credito_pis || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-600">Crédito COFINS:</span>
                  <span className="font-mono">R$ {(nota.credito_cofins || 0).toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ================= ABA PARCELAS ================= */}
        <TabsContent value="parcelas" className="mt-4 space-y-3">
          <div className="bg-blue-50/70 p-3 rounded-lg border border-blue-200 text-xs text-blue-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              <strong>Integração Financeira:</strong> Na Etapa 4, o módulo de Contas a Pagar será
              gerado a partir destas parcelas registradas na nota fiscal.
            </span>
          </div>

          <Card className="border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="py-2.5 px-4 w-28">Nº Parcela</th>
                  <th className="py-2.5 px-4 w-40">Data de Vencimento</th>
                  <th className="py-2.5 px-4 w-48 text-right">Valor da Parcela</th>
                  <th className="py-2.5 px-4">Forma de Pagamento (tPag)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parcelas.map((parc) => (
                  <tr key={parc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                      {parc.numero}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{parc.data_vencimento}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                      R$ {parc.valor.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {parc.forma_pagamento ? `Código tPag: ${parc.forma_pagamento}` : 'A combinar'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* ================= ABA INFORMAÇÕES ================= */}
        <TabsContent value="informacoes" className="mt-4 space-y-4">
          <Card className="border-slate-200">
            <CardHeader className="py-3 px-4 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-800">
                Informações Complementares e Fisco (infAdic)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-md border border-slate-200 font-mono text-[11px] whitespace-pre-wrap text-slate-700 leading-relaxed max-h-80 overflow-y-auto">
                {nota.informacoes_complementares ||
                  'Nenhuma informação complementar declarada no XML.'}
              </div>

              {nota.observacao && (
                <div>
                  <h5 className="font-semibold text-slate-800 mb-1">Observações Internas</h5>
                  <p className="bg-amber-50/50 p-2.5 rounded border border-amber-200 text-amber-900 whitespace-pre-wrap">
                    {nota.observacao}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= ABA XML FORMATADO ================= */}
        <TabsContent value="xml" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Visualização integral do arquivo XML recebido da SEFAZ (somente leitura).
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={copiarXml}
              disabled={!conteudoXmlTexto}
              className="h-8 text-xs gap-1.5"
            >
              {copiadoXml ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              {copiadoXml ? 'Copiado!' : 'Copiar XML Completo'}
            </Button>
          </div>

          <Card className="border-slate-200 bg-slate-900 text-slate-100 overflow-hidden shadow-xs">
            <div className="p-4 max-h-[500px] overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {conteudoXmlTexto || 'Carregando conteúdo XML do documento...'}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Cancelar Nota */}
      <Dialog open={cancelarModalAberto} onOpenChange={setCancelarModalAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Nota de Entrada #{nota.numero}</DialogTitle>
            <DialogDescription>
              A nota passará para o status <strong>Cancelada</strong>. Esta ação não poderá ser
              desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <Label htmlFor="motivo_cancelamento" className="text-xs font-semibold">
              Justificativa do Cancelamento *
            </Label>
            <Textarea
              id="motivo_cancelamento"
              placeholder="Descreva o motivo do cancelamento da nota de entrada..."
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelarModalAberto(false)}
              disabled={cancelando}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancelarNota}
              disabled={cancelando || !motivoCancelamento.trim()}
            >
              {cancelando ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default NotaEntradaConferenciaPage
