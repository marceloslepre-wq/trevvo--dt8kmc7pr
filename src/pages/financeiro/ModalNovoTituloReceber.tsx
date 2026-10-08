import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { SelectCliente } from '@/components/SelectCliente'
import { SelectCondicaoPagamento } from '@/components/SelectCondicaoPagamento'
import { gerarParcelas, CondicaoPagamento } from '@/services/condicoesPagamento'
import {
  salvarContaReceber,
  criarTitulosRecorrentesReceber,
  ContaReceber,
  atualizarRecorrenciaReceber,
} from '@/services/contasReceber'
import { PlanoConta } from '@/services/planoContas'
import { CentroCusto } from '@/services/centrosCusto'
import { FormaPagamento } from '@/services/formasPagamento'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import { Loader2, Plus, RefreshCw, Trash2, Calendar, FileText } from 'lucide-react'

interface ModalNovoTituloReceberProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSucesso: () => void
  tituloEdicao?: ContaReceber | null
}

interface ParcelaItem {
  numero: number
  data_vencimento: string
  valor: number
}

export const ModalNovoTituloReceber: React.FC<ModalNovoTituloReceberProps> = ({
  open,
  onOpenChange,
  onSucesso,
  tituloEdicao,
}) => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { toast } = useToast()

  const [salvando, setSalvando] = useState(false)
  const hojeStr = new Date().toISOString().slice(0, 10)

  // Campos principais
  const [clienteId, setClienteId] = useState('')
  const [numeroDocumento, setNumeroDocumento] = useState('')
  const [descricao, setDescricao] = useState('')
  const [dataEmissao, setDataEmissao] = useState(hojeStr)
  const [dataCompetencia, setDataCompetencia] = useState(hojeStr)
  const [planoContaId, setPlanoContaId] = useState('')
  const [centroCustoId, setCentroCustoId] = useState('')
  const [formaPrevistaId, setFormaPrevistaId] = useState('')
  const [observacao, setObservacao] = useState('')

  // Valor e Condição de Pagamento (uso="Vendas")
  const [valorTotal, setValorTotal] = useState<string>('')
  const [condicaoId, setCondicaoId] = useState<string>('')
  const [condicaoObj, setCondicaoObj] = useState<CondicaoPagamento | null>(null)
  const [parcelas, setParcelas] = useState<ParcelaItem[]>([])

  // Recorrência mensal (repetir todo mês)
  const [repetirMes, setRepetirMes] = useState(false)
  const [quantidadeMeses, setQuantidadeMeses] = useState<number>(12)

  // Diálogo para edição de recorrente
  const [mostrarDialogoRecorrente, setMostrarDialogoRecorrente] = useState(false)
  const [escopoEdicaoRecorrente, setEscopoEdicaoRecorrente] = useState<'individual' | 'futuros'>(
    'individual',
  )

  // Dados auxiliares carregados
  const [planosContas, setPlanosContas] = useState<PlanoConta[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([])

  // Resetar ou carregar edição ao abrir
  useEffect(() => {
    if (open) {
      if (tituloEdicao) {
        setClienteId(tituloEdicao.cliente_id || '')
        setNumeroDocumento(tituloEdicao.numero_documento || '')
        setDescricao(tituloEdicao.descricao || '')
        setDataEmissao(tituloEdicao.data_emissao || hojeStr)
        setDataCompetencia(tituloEdicao.data_competencia || hojeStr)
        setPlanoContaId(tituloEdicao.plano_conta_id || '')
        setCentroCustoId(tituloEdicao.centro_custo_id || '')
        setFormaPrevistaId(tituloEdicao.forma_pagamento_prevista_id || '')
        setObservacao(tituloEdicao.observacao || '')
        setValorTotal(String(tituloEdicao.valor_original || ''))
        setCondicaoId('')
        setCondicaoObj(null)
        setParcelas([
          {
            numero: 1,
            data_vencimento: tituloEdicao.data_vencimento || hojeStr,
            valor: tituloEdicao.valor_original || 0,
          },
        ])
        setRepetirMes(false)
      } else {
        setClienteId('')
        setNumeroDocumento('')
        setDescricao('')
        setDataEmissao(hojeStr)
        setDataCompetencia(hojeStr)
        setObservacao('')
        setValorTotal('')
        setCondicaoId('')
        setCondicaoObj(null)
        setParcelas([])
        setRepetirMes(false)
        setQuantidadeMeses(12)
      }

      setMostrarDialogoRecorrente(false)
      setEscopoEdicaoRecorrente('individual')

      if (empresaAtiva?.id) {
        carregarAuxiliares(empresaAtiva.id)
      }
    }
  }, [open, tituloEdicao, empresaAtiva?.id, hojeStr])

  const carregarAuxiliares = async (empId: string) => {
    try {
      // 1. Planos de contas analíticos de Receita ou Sem resultado
      const planos = await pb.collection('plano_contas').getFullList<PlanoConta>({
        filter: `natureza = 'Analítica' && (tipo = 'Receita' || tipo = 'Sem resultado') && ativo = true`,
        sort: 'codigo',
      })
      setPlanosContas(planos)

      // 2. Centros de custo da empresa
      const ccs = await pb.collection('centros_custo').getFullList<CentroCusto>({
        filter: `empresa_id = '${empId}' && ativo = true`,
        sort: 'codigo',
      })
      setCentrosCusto(ccs)

      // 3. Formas de pagamento ativas
      const formas = await pb.collection('formas_pagamento').getFullList<FormaPagamento>({
        filter: `ativo = true`,
        sort: 'descricao',
      })
      setFormasPagamento(formas)

      // 4. Configuração financeira da empresa (sugere plano padrão se não estiver em edição)
      if (!tituloEdicao) {
        const cfgs = await pb.collection('config_financeira_empresa').getFullList({
          filter: `empresa_id = '${empId}' && ativo = true`,
        })
        if (cfgs.length > 0) {
          const c = cfgs[0]
          if (c.plano_vendas_produtos_id) setPlanoContaId(c.plano_vendas_produtos_id)
          else if (c.plano_prestacao_servicos_id) setPlanoContaId(c.plano_prestacao_servicos_id)
          else if (c.plano_outras_entradas_id) setPlanoContaId(c.plano_outras_entradas_id)
          else if (planos[0]) setPlanoContaId(planos[0].id)

          if (c.centro_custo_padrao_id) setCentroCustoId(c.centro_custo_padrao_id)
          else if (ccs[0]) setCentroCustoId(ccs[0].id)
        } else if (planos[0]) {
          setPlanoContaId(planos[0].id)
        }
      }
    } catch (err) {
      console.error('Erro ao carregar dados auxiliares para contas a receber:', err)
    }
  }

  // Gerar parcelas via condição de pagamento
  const handleGerarParcelas = () => {
    const val = parseFloat(valorTotal.replace(',', '.'))
    if (!val || val <= 0) {
      toast({
        title: 'Valor total inválido',
        description: 'Informe o valor total antes de gerar as parcelas.',
        variant: 'destructive',
      })
      return
    }

    if (!condicaoObj) {
      setParcelas([
        {
          numero: 1,
          data_vencimento: dataCompetencia || hojeStr,
          valor: val,
        },
      ])
      return
    }

    const calculadas = gerarParcelas(condicaoObj, val, dataCompetencia || hojeStr)
    setParcelas(
      calculadas.map((c) => ({
        numero: c.numero,
        data_vencimento: c.data_vencimento,
        valor: c.valor,
      })),
    )
  }

  const handleAdicionarParcela = () => {
    const proxNum = parcelas.length + 1
    const ultVenc = parcelas.length > 0 ? parcelas[parcelas.length - 1].data_vencimento : hojeStr
    setParcelas([
      ...parcelas,
      {
        numero: proxNum,
        data_vencimento: ultVenc,
        valor: 0,
      },
    ])
  }

  const handleRemoverParcela = (idx: number) => {
    const novas = parcelas.filter((_, i) => i !== idx).map((p, i) => ({ ...p, numero: i + 1 }))
    setParcelas(novas)
  }

  const handleAlterarParcela = (
    idx: number,
    campo: 'data_vencimento' | 'valor',
    valorNovo: string | number,
  ) => {
    const novas = [...parcelas]
    novas[idx] = {
      ...novas[idx],
      [campo]: valorNovo,
    }
    setParcelas(novas)
  }

  const somaParcelas = parcelas.reduce((acc, p) => acc + (Number(p.valor) || 0), 0)
  const valTotalNum = parseFloat(valorTotal.replace(',', '.')) || 0
  const diferencaParcelas = Math.abs(somaParcelas - valTotalNum)
  const somaBateComTotal = diferencaParcelas < 0.02

  const processarSalvamento = async (
    escopoRecorrencia: 'individual' | 'futuros' = 'individual',
  ) => {
    if (!empresaAtiva?.id) return

    setSalvando(true)
    try {
      if (tituloEdicao) {
        // Se for edição de um título recorrente
        if (tituloEdicao.recorrencia_id && escopoRecorrencia === 'futuros') {
          await atualizarRecorrenciaReceber({
            recorrencia_id: tituloEdicao.recorrencia_id,
            a_partir_de: tituloEdicao.data_vencimento,
            dados_atualizacao: {
              cliente_id: clienteId,
              descricao: descricao.trim(),
              plano_conta_id: planoContaId,
              centro_custo_id: centroCustoId || undefined,
              forma_pagamento_prevista_id: formaPrevistaId || undefined,
              valor_original: valTotalNum,
              observacao: observacao.trim() || undefined,
            },
          })
          toast({
            title: 'Recorrência atualizada',
            description: 'Este e os próximos títulos em aberto foram atualizados.',
          })
        } else {
          // Edição individual
          const venc = parcelas.length > 0 ? parcelas[0].data_vencimento : dataCompetencia
          await salvarContaReceber({
            id: tituloEdicao.id,
            empresa_id: empresaAtiva.id,
            cliente_id: clienteId,
            numero_documento: numeroDocumento.trim(),
            descricao: descricao.trim(),
            data_emissao: dataEmissao,
            data_competencia: dataCompetencia,
            data_vencimento: venc,
            plano_conta_id: planoContaId,
            centro_custo_id: centroCustoId || undefined,
            forma_pagamento_prevista_id: formaPrevistaId || undefined,
            valor_original: valTotalNum,
            saldo: valTotalNum - (tituloEdicao.valor_recebido || 0),
            observacao: observacao.trim() || undefined,
          })
          toast({
            title: 'Título atualizado',
            description: 'Dados do título a receber salvos com sucesso.',
          })
        }
      } else if (repetirMes) {
        // Modo Recorrência: cria 1 título por mês com garantia do último dia do mês
        const qtd = Math.max(1, quantidadeMeses || 1)
        const vencimentoInicial =
          parcelas.length > 0 ? parcelas[0].data_vencimento : dataCompetencia
        await criarTitulosRecorrentesReceber({
          empresa_id: empresaAtiva.id,
          cliente_id: clienteId,
          numero_documento: numeroDocumento.trim(),
          descricao: descricao.trim(),
          plano_conta_id: planoContaId,
          centro_custo_id: centroCustoId || undefined,
          forma_pagamento_prevista_id: formaPrevistaId || undefined,
          valor_original: valTotalNum,
          data_emissao: dataEmissao,
          data_competencia_inicial: dataCompetencia,
          data_vencimento_inicial: vencimentoInicial,
          quantidade_meses: qtd,
          observacao: observacao.trim() || undefined,
        })
        toast({
          title: 'Títulos recorrentes criados',
          description: `${qtd} títulos a receber foram programados mensalmente.`,
        })
      } else {
        // Modo Parcelado ou Parcela Única
        if (parcelas.length > 0) {
          if (!somaBateComTotal) {
            toast({
              title: 'Soma das parcelas não bate com o total',
              description: `Soma: R$ ${somaParcelas.toFixed(2)} | Total: R$ ${valTotalNum.toFixed(2)}.`,
              variant: 'destructive',
            })
            setSalvando(false)
            return
          }

          const totalParc = parcelas.length
          for (let i = 0; i < parcelas.length; i++) {
            const p = parcelas[i]
            await salvarContaReceber({
              empresa_id: empresaAtiva.id,
              cliente_id: clienteId,
              origem: 'Manual',
              numero_documento: numeroDocumento.trim(),
              parcela: `${p.numero}/${totalParc}`,
              descricao:
                totalParc > 1
                  ? `${descricao.trim()} - Parc ${p.numero}/${totalParc}`
                  : descricao.trim(),
              data_emissao: dataEmissao,
              data_competencia: dataCompetencia,
              data_vencimento: p.data_vencimento,
              plano_conta_id: planoContaId,
              centro_custo_id: centroCustoId || undefined,
              forma_pagamento_prevista_id: formaPrevistaId || undefined,
              valor_original: p.valor,
              saldo: p.valor,
              observacao: observacao.trim() || undefined,
            })
          }
          toast({
            title: 'Títulos criados',
            description: `${parcelas.length} título(s) gerados no Contas a Receber.`,
          })
        } else {
          // Parcela única
          await salvarContaReceber({
            empresa_id: empresaAtiva.id,
            cliente_id: clienteId,
            origem: 'Manual',
            numero_documento: numeroDocumento.trim(),
            parcela: '1/1',
            descricao: descricao.trim(),
            data_emissao: dataEmissao,
            data_competencia: dataCompetencia,
            data_vencimento: dataCompetencia,
            plano_conta_id: planoContaId,
            centro_custo_id: centroCustoId || undefined,
            forma_pagamento_prevista_id: formaPrevistaId || undefined,
            valor_original: valTotalNum,
            saldo: valTotalNum,
            observacao: observacao.trim() || undefined,
          })
          toast({
            title: 'Título criado',
            description: `Título #${numeroDocumento} adicionado no Contas a Receber.`,
          })
        }
      }

      onSucesso()
      onOpenChange(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Erro ao salvar título',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!empresaAtiva?.id) {
      toast({ title: 'Empresa ativa não selecionada', variant: 'destructive' })
      return
    }
    if (!clienteId) {
      toast({
        title: 'Cliente obrigatório',
        description: 'Selecione o cliente devedor.',
        variant: 'destructive',
      })
      return
    }
    if (!numeroDocumento.trim()) {
      toast({
        title: 'Documento obrigatório',
        description: 'Informe o número do documento.',
        variant: 'destructive',
      })
      return
    }
    if (!descricao.trim()) {
      toast({
        title: 'Descrição obrigatória',
        description: 'Informe uma descrição para o título.',
        variant: 'destructive',
      })
      return
    }
    if (!planoContaId) {
      toast({
        title: 'Plano de contas obrigatório',
        description: 'Selecione uma conta analítica de receita.',
        variant: 'destructive',
      })
      return
    }
    if (valTotalNum <= 0) {
      toast({
        title: 'Valor total inválido',
        description: 'O valor deve ser maior que zero.',
        variant: 'destructive',
      })
      return
    }

    // Se estiver editando um título com recorrência vinculada, pergunta o escopo
    if (tituloEdicao?.recorrencia_id) {
      setMostrarDialogoRecorrente(true)
      return
    }

    await processarSalvamento('individual')
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-600" />
                {tituloEdicao ? 'Editar Título a Receber' : 'Novo Título no Contas a Receber'}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Cadastre ou altere um título a receber avulso, parcelado ou mensal recorrente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              {/* Linha 1: Cliente e Documento */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-1">
                  <Label htmlFor="cliente" className="text-xs font-semibold text-slate-700">
                    Cliente *
                  </Label>
                  <SelectCliente
                    value={clienteId}
                    onChange={(id) => setClienteId(id)}
                    placeholder="Selecione o cliente..."
                  />
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="numero_documento"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Nº Documento / Título *
                  </Label>
                  <Input
                    id="numero_documento"
                    value={numeroDocumento}
                    onChange={(e) => setNumeroDocumento(e.target.value)}
                    placeholder="Ex: REC-102, FAT-01"
                    className="h-9 text-xs"
                    required
                  />
                </div>
              </div>

              {/* Linha 2: Descrição */}
              <div className="space-y-1">
                <Label htmlFor="descricao" className="text-xs font-semibold text-slate-700">
                  Descrição do Recebimento *
                </Label>
                <Input
                  id="descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Mensalidade contrato, Venda a prazo, Prestação de consultoria"
                  className="h-9 text-xs"
                  required
                />
              </div>

              {/* Linha 3: Emissão e Competência */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="data_emissao" className="text-xs font-semibold text-slate-700">
                    Data de Emissão *
                  </Label>
                  <Input
                    id="data_emissao"
                    type="date"
                    value={dataEmissao}
                    onChange={(e) => setDataEmissao(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label
                    htmlFor="data_competencia"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Competência / Data Base *
                  </Label>
                  <Input
                    id="data_competencia"
                    type="date"
                    value={dataCompetencia}
                    onChange={(e) => setDataCompetencia(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="plano_conta" className="text-xs font-semibold text-slate-700">
                    Plano de Contas (Receitas) *
                  </Label>
                  <select
                    id="plano_conta"
                    value={planoContaId}
                    onChange={(e) => setPlanoContaId(e.target.value)}
                    className="w-full h-9 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                    required
                  >
                    <option value="">Selecione o plano...</option>
                    {planosContas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} - {p.descricao}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="centro_custo" className="text-xs font-semibold text-slate-700">
                    Centro de Custo
                  </Label>
                  <select
                    id="centro_custo"
                    value={centroCustoId}
                    onChange={(e) => setCentroCustoId(e.target.value)}
                    className="w-full h-9 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Nenhum (Geral)</option>
                    {centrosCusto.map((cc) => (
                      <option key={cc.id} value={cc.id}>
                        {cc.codigo} - {cc.descricao}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Linha 4: Forma Prevista */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="forma_prevista" className="text-xs font-semibold text-slate-700">
                    Forma Prevista de Recebimento
                  </Label>
                  <select
                    id="forma_prevista"
                    value={formaPrevistaId}
                    onChange={(e) => setFormaPrevistaId(e.target.value)}
                    className="w-full h-9 text-xs px-2 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Não definida...</option>
                    {formasPagamento.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.descricao}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Seção de Valores, Condição de Pagamento (Vendas) e Parcelas */}
              <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/60 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="space-y-1">
                    <Label htmlFor="valor_total" className="text-xs font-semibold text-slate-700">
                      Valor Total (R$) *
                    </Label>
                    <Input
                      id="valor_total"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={valorTotal}
                      onChange={(e) => setValorTotal(e.target.value)}
                      placeholder="0,00"
                      className="h-9 text-sm font-semibold text-slate-900"
                      required
                    />
                  </div>

                  {!repetirMes && !tituloEdicao && (
                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-xs font-semibold text-slate-700">
                        Condição de Pagamento (Vendas)
                      </Label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <SelectCondicaoPagamento
                            uso="Vendas"
                            value={condicaoId}
                            onChange={(id, item) => {
                              setCondicaoId(id)
                              setCondicaoObj(item || null)
                            }}
                            placeholder="Selecione condição..."
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleGerarParcelas}
                          className="h-10 text-xs shrink-0"
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          Gerar parcelas
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Recorrência mensal (repetir todo mês) */}
                {!tituloEdicao && (
                  <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="repetir_mes"
                        checked={repetirMes}
                        onCheckedChange={(c) => {
                          const ativo = Boolean(c)
                          setRepetirMes(ativo)
                          if (ativo) {
                            setParcelas([])
                          }
                        }}
                      />
                      <label
                        htmlFor="repetir_mes"
                        className="text-xs font-semibold text-slate-800 cursor-pointer flex items-center gap-1.5"
                      >
                        <Calendar className="h-3.5 w-3.5 text-emerald-600" />
                        Repetir todo mês (Mensalidades, Contratos de Serviço)
                      </label>
                    </div>

                    {repetirMes && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">Quantidade de meses:</span>
                        <Input
                          type="number"
                          min={2}
                          max={60}
                          value={quantidadeMeses}
                          onChange={(e) => setQuantidadeMeses(parseInt(e.target.value, 10) || 12)}
                          className="w-20 h-8 text-xs font-semibold text-center"
                        />
                        <span className="text-[11px] text-slate-500">títulos gerados</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Grade de parcelas editáveis */}
                {!repetirMes && parcelas.length > 0 && !tituloEdicao && (
                  <div className="mt-3 border rounded-md bg-white overflow-hidden">
                    <div className="px-3 py-2 bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span>Grade de Parcelas ({parcelas.length})</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleAdicionarParcela}
                        className="h-6 text-[11px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Adicionar parcela
                      </Button>
                    </div>

                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-1.5 px-3 text-left w-16">Parc.</th>
                          <th className="py-1.5 px-3 text-left">Vencimento</th>
                          <th className="py-1.5 px-3 text-right">Valor (R$)</th>
                          <th className="py-1.5 px-3 text-center w-12">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parcelas.map((parc, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-1.5 px-3 font-mono font-semibold text-slate-700">
                              {parc.numero}
                            </td>
                            <td className="py-1.5 px-3">
                              <Input
                                type="date"
                                value={parc.data_vencimento}
                                onChange={(e) =>
                                  handleAlterarParcela(idx, 'data_vencimento', e.target.value)
                                }
                                className="h-7 text-xs w-36"
                                required
                              />
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={parc.valor}
                                onChange={(e) =>
                                  handleAlterarParcela(
                                    idx,
                                    'valor',
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                className="h-7 text-xs font-mono text-right w-32 ml-auto"
                                required
                              />
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              {parcelas.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoverParcela(idx)}
                                  className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold">
                        <tr>
                          <td colSpan={2} className="py-2 px-3 text-slate-700">
                            Soma das parcelas:
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-mono ${
                              somaBateComTotal ? 'text-emerald-700' : 'text-red-600 font-bold'
                            }`}
                          >
                            R$ {somaParcelas.toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>

                    {!somaBateComTotal && (
                      <div className="p-2 bg-red-50 border-t border-red-200 text-[11px] text-red-700">
                        A soma das parcelas (R$ {somaParcelas.toFixed(2)}) difere do total informado
                        (R$ {valTotalNum.toFixed(2)}). Ajuste as parcelas para que a soma bata
                        exatamente.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Observações */}
              <div className="space-y-1">
                <Label htmlFor="observacao" className="text-xs font-semibold text-slate-700">
                  Observação
                </Label>
                <Textarea
                  id="observacao"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={2}
                  placeholder="Anotações internas sobre este título a receber..."
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  salvando ||
                  (!repetirMes && !tituloEdicao && parcelas.length > 0 && !somaBateComTotal)
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {salvando ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Salvando título...
                  </>
                ) : (
                  'Salvar título a receber'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmação para edição de recorrência: Só este ou Este e os próximos em aberto */}
      <Dialog open={mostrarDialogoRecorrente} onOpenChange={setMostrarDialogoRecorrente}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Título Recorrente Vinculado
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              Este título faz parte de uma recorrência mensal. Como deseja aplicar as alterações?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-3">
            <div
              onClick={() => setEscopoEdicaoRecorrente('individual')}
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                escopoEdicaoRecorrente === 'individual'
                  ? 'border-emerald-500 bg-emerald-50/50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="font-semibold text-xs text-slate-900">Só este título</div>
              <p className="text-[11px] text-slate-500">
                Altera apenas o vencimento e valores deste registro pontual.
              </p>
            </div>

            <div
              onClick={() => setEscopoEdicaoRecorrente('futuros')}
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                escopoEdicaoRecorrente === 'futuros'
                  ? 'border-emerald-500 bg-emerald-50/50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="font-semibold text-xs text-slate-900">
                Este e os próximos títulos em aberto
              </div>
              <p className="text-[11px] text-slate-500">
                Replica a nova descrição, valores e centro de custo para todos os títulos futuros
                desta mesma recorrência.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMostrarDialogoRecorrente(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={salvando}
              onClick={async () => {
                setMostrarDialogoRecorrente(false)
                await processarSalvamento(escopoEdicaoRecorrente)
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Confirmar Alteração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
