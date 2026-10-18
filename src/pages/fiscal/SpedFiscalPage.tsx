import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileSpreadsheet,
  Download,
  Play,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  AlertCircle,
  HelpCircle,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  ShieldAlert,
  TrendingUp,
  FileCheck2,
} from 'lucide-react'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  listarArquivosSped,
  gerarArquivoSped,
  obterUrlDownloadSped,
  SpedArquivoRegistro,
  SpedModo,
  SpedStatus,
} from '@/services/configSped'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from '@/hooks/use-toast'

// Helper para calcular o mês anterior no formato "AAAA-MM"
function obterMesAnteriorPadrao(): string {
  const d = new Date()
  d.setDate(1) // Garante que não pule mês em dias como dia 31
  d.setMonth(d.getMonth() - 1)
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${ano}-${mes}`
}

function formatarDataHora(iso?: string): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch (_) {
    return iso
  }
}

function renderStatusBadge(status: SpedStatus) {
  switch (status) {
    case 'Gerado':
      return (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 font-medium">
          <CheckCircle2 size={13} className="mr-1" /> Gerado
        </Badge>
      )
    case 'Gerado com erros':
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 font-medium">
          <AlertTriangle size={13} className="mr-1" /> Gerado com erros
        </Badge>
      )
    case 'Gerando':
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100 font-medium animate-pulse">
          <Clock size={13} className="mr-1 animate-spin" /> Gerando...
        </Badge>
      )
    case 'Erro':
      return (
        <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-100 font-medium">
          <XCircle size={13} className="mr-1" /> Erro
        </Badge>
      )
    case 'Substituído':
      return (
        <Badge variant="outline" className="text-slate-500 border-slate-300 font-normal">
          Substituído
        </Badge>
      )
    case 'Entregue':
      return (
        <Badge className="bg-blue-600 text-white font-medium">
          <CheckCircle2 size={13} className="mr-1" /> Entregue
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export const SpedFiscalPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, administrador } = usePermissoes()

  // Permissão de acesso ao módulo Fiscal / SPED
  const temPermissaoVer = administrador || pode('sped', 'ver') || pode('notas_saida', 'ver')

  const [periodo, setPeriodo] = useState<string>(obterMesAnteriorPadrao())
  const [modo, setModo] = useState<SpedModo>('Teste')
  const [gerando, setGerando] = useState(false)
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [arquivos, setArquivos] = useState<SpedArquivoRegistro[]>([])
  const [arquivoSelecionado, setArquivoSelecionado] = useState<SpedArquivoRegistro | null>(null)
  const [modalValidacoesAberto, setModalValidacoesAberto] = useState(false)

  const carregarArquivos = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregandoLista(true)
    try {
      const lista = await listarArquivosSped(empresaAtiva.id)
      setArquivos(lista)

      // Atualiza o arquivo selecionado se ele estiver na lista
      if (arquivoSelecionado) {
        const atualizado = lista.find((a) => a.id === arquivoSelecionado.id)
        if (atualizado) setArquivoSelecionado(atualizado)
      } else if (lista.length > 0) {
        setArquivoSelecionado(lista[0])
      }
    } catch (err: any) {
      console.error('Erro ao listar arquivos SPED:', err)
      toast({
        title: 'Erro ao carregar histórico',
        description: err.message || 'Não foi possível buscar os arquivos SPED gerados.',
        variant: 'destructive',
      })
    } finally {
      setCarregandoLista(false)
    }
  }, [empresaAtiva?.id, arquivoSelecionado])

  useEffect(() => {
    carregarArquivos()
  }, [empresaAtiva?.id])

  const handleGerarSped = async () => {
    if (!empresaAtiva?.id) {
      toast({
        title: 'Nenhuma empresa selecionada',
        description: 'Selecione uma empresa ativa para gerar o SPED Fiscal.',
        variant: 'destructive',
      })
      return
    }

    if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
      toast({
        title: 'Período inválido',
        description: 'Informe o mês no formato AAAA-MM (exemplo: 2025-01).',
        variant: 'destructive',
      })
      return
    }

    setGerando(true)
    try {
      const resp = await gerarArquivoSped({
        empresa_id: empresaAtiva.id,
        periodo,
        modo,
      })

      if (resp.status === 'Erro') {
        toast({
          title: 'Não foi possível gerar no modo Oficial',
          description: resp.message || 'Verifique as pendências da empresa.',
          variant: 'destructive',
        })
      } else if (resp.status === 'Gerado com erros') {
        toast({
          title: 'Arquivo gerado com validações',
          description: `O arquivo foi gerado com ${resp.total_validacoes || 0} aviso(s)/erro(s). O arquivo continua disponível para conferência.`,
          className: 'bg-amber-50 border-amber-300 text-amber-900',
        })
      } else {
        toast({
          title: 'Arquivo SPED gerado com sucesso!',
          description: `${resp.nome_arquivo || 'SPED Fiscal'} (${resp.quantidade_linhas || 0} linhas).`,
          className: 'bg-emerald-50 border-emerald-300 text-emerald-900',
        })
      }

      await carregarArquivos()
    } catch (err: any) {
      console.error('Falha ao gerar SPED Fiscal:', err)
      toast({
        title: 'Erro na geração do SPED',
        description: err.message || 'Ocorreu um erro ao processar o arquivo.',
        variant: 'destructive',
      })
    } finally {
      setGerando(false)
    }
  }

  const handleBaixarArquivo = (arq: SpedArquivoRegistro) => {
    const url = obterUrlDownloadSped(arq)
    if (!url) {
      toast({
        title: 'Arquivo não disponível',
        description: 'Este registro não possui arquivo .txt anexado.',
        variant: 'destructive',
      })
      return
    }

    const a = document.createElement('a')
    a.href = url
    a.download = arq.nome_arquivo || `SPED_${arq.periodo}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const abrirModalValidacoes = (arq: SpedArquivoRegistro) => {
    setArquivoSelecionado(arq)
    setModalValidacoesAberto(true)
  }

  // Estatísticas do arquivo selecionado
  const contagemItens = useMemo(() => {
    if (!arquivoSelecionado?.contagem_registros) return []
    return Object.entries(arquivoSelecionado.contagem_registros).sort(([a], [b]) =>
      a.localeCompare(b),
    )
  }, [arquivoSelecionado])

  if (!temPermissaoVer) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Alert variant="destructive">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Acesso Restrito</AlertTitle>
          <AlertDescription>
            Você não possui permissão para acessar o módulo do SPED Fiscal. Solicite acesso ao
            administrador do ERP.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                SPED Fiscal (EFD ICMS/IPI)
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Geração da escrituração digital em formato oficial PVA para a empresa ativa.
              </p>
            </div>
          </div>
        </div>

        {empresaAtiva && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg border border-slate-200 text-xs">
            <Building2 size={15} className="text-slate-600 flex-shrink-0" />
            <div className="truncate max-w-[220px]">
              <span className="font-semibold text-slate-800">
                {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
              </span>
              <span className="text-slate-500 ml-1">({empresaAtiva.cnpj || 'Sem CNPJ'})</span>
            </div>
          </div>
        )}
      </div>

      {/* Bloco de Ação: Parâmetros e Geração */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar size={18} className="text-blue-600" />
            Gerar Novo Arquivo SPED
          </CardTitle>
          <CardDescription className="text-xs">
            Selecione o mês de referência e o modo de validação. O arquivo será montado com os
            Blocos 0 e 9 e as aberturas/fechamentos regulamentares da EFD.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-4 space-y-1.5">
              <Label htmlFor="periodo-sped" className="text-xs font-semibold text-slate-700">
                Mês de Apuração (AAAA-MM)
              </Label>
              <Input
                id="periodo-sped"
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <div className="sm:col-span-4 space-y-1.5">
              <Label htmlFor="modo-sped" className="text-xs font-semibold text-slate-700">
                Modo de Geração
              </Label>
              <Select value={modo} onValueChange={(val) => setModo(val as SpedModo)}>
                <SelectTrigger id="modo-sped" className="h-10 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Teste">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Modo Teste</span>
                      <span className="text-xs text-slate-400">(Auditoria prévia)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Oficial">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-blue-700">Modo Oficial</span>
                      <span className="text-xs text-slate-400">(Exige IE numérica)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-4">
              <Button
                onClick={handleGerarSped}
                disabled={gerando || !empresaAtiva}
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
              >
                {gerando ? (
                  <>
                    <RotateCw size={16} className="mr-2 animate-spin" />
                    Gerando arquivo...
                  </>
                ) : (
                  <>
                    <Play size={16} className="mr-2" />
                    Gerar arquivo SPED
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-md border border-slate-200">
            <HelpCircle size={15} className="text-blue-500 flex-shrink-0" />
            <span>
              <strong>Modo Oficial:</strong> valida IE e grava o arquivo oficial para o PVA da
              Receita Federal. <strong>Substituição:</strong> arquivos anteriores do mesmo período e
              modo passam para o status <em>Substituído</em> automaticamente (exceto se já marcados
              como Entregue).
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Histórico e Arquivo Selecionado */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Lista de Arquivos */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText size={18} className="text-slate-700" />
                  Arquivos Gerados
                </CardTitle>
                <CardDescription className="text-xs">
                  Histórico de arquivos gerados para {empresaAtiva?.razao_social || 'a empresa'}.
                </CardDescription>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={carregarArquivos}
                disabled={carregandoLista}
                title="Atualizar lista"
                className="h-8 px-2.5 text-xs text-slate-600"
              >
                <RotateCw size={14} className={carregandoLista ? 'animate-spin' : ''} />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {carregandoLista && arquivos.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
                  <RotateCw size={24} className="animate-spin text-blue-600" />
                  Carregando arquivos SPED...
                </div>
              ) : arquivos.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  <FileSpreadsheet size={36} className="mx-auto text-slate-300 mb-2" />
                  Nenhum arquivo SPED gerado para esta filial ainda.
                  <p className="text-xs text-slate-400 mt-1">
                    Selecione o período acima e clique em &quot;Gerar arquivo SPED&quot;.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                  {arquivos.map((arq) => {
                    const isSelected = arquivoSelecionado?.id === arq.id
                    const temArquivo = Boolean(arq.arquivo)
                    const qtdErros = (arq.validacoes || []).filter((v) => v.nivel === 'erro').length
                    const qtdAvisos = (arq.validacoes || []).filter(
                      (v) => v.nivel === 'aviso',
                    ).length

                    return (
                      <div
                        key={arq.id}
                        onClick={() => setArquivoSelecionado(arq)}
                        className={`p-3.5 sm:p-4 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                            : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-slate-900">
                              {arq.periodo}
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 font-semibold ${
                                arq.modo === 'Oficial'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {arq.modo}
                            </Badge>
                            {renderStatusBadge(arq.status)}
                          </div>

                          <div className="text-xs text-slate-500 truncate font-mono">
                            {arq.nome_arquivo || 'Sem nome de arquivo'}
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                            <span>Linhas: {arq.quantidade_linhas || 0}</span>
                            <span>•</span>
                            <span>Gerado em: {formatarDataHora(arq.created)}</span>
                            {(qtdErros > 0 || qtdAvisos > 0) && (
                              <>
                                <span>•</span>
                                <span
                                  className={
                                    qtdErros > 0 ? 'text-rose-600 font-semibold' : 'text-amber-600'
                                  }
                                >
                                  {qtdErros > 0 && `${qtdErros} erro(s)`}
                                  {qtdErros > 0 && qtdAvisos > 0 && ', '}
                                  {qtdAvisos > 0 && `${qtdAvisos} aviso(s)`}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 sm:self-center">
                          {temArquivo && arq.status !== 'Erro' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleBaixarArquivo(arq)
                              }}
                              className="h-8 px-2.5 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50 border-blue-200"
                            >
                              <Download size={14} className="mr-1" />
                              Baixar
                            </Button>
                          )}
                          <ChevronRight size={16} className="text-slate-400 hidden sm:block" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detalhe do Arquivo Selecionado */}
        <div className="lg:col-span-5 space-y-4">
          {arquivoSelecionado ? (
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Detalhes do Arquivo</CardTitle>
                    <CardDescription className="text-xs font-mono truncate max-w-[260px]">
                      {arquivoSelecionado.nome_arquivo}
                    </CardDescription>
                  </div>
                  {renderStatusBadge(arquivoSelecionado.status)}
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {/* Ações principais */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleBaixarArquivo(arquivoSelecionado)}
                    disabled={!arquivoSelecionado.arquivo || arquivoSelecionado.status === 'Erro'}
                    className="flex-1 h-9 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                  >
                    <Download size={15} className="mr-1.5" />
                    Baixar Arquivo .txt
                  </Button>

                  {(arquivoSelecionado.validacoes?.length || 0) > 0 && (
                    <Button
                      variant="outline"
                      onClick={() => abrirModalValidacoes(arquivoSelecionado)}
                      className="h-9 text-xs border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
                    >
                      <AlertTriangle size={14} className="mr-1 text-amber-600" />
                      Ver Inconsistências ({arquivoSelecionado.validacoes?.length})
                    </Button>
                  )}
                </div>

                {/* Tabela de Propriedades */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Período:</span>
                    <span className="font-semibold text-slate-800">
                      {arquivoSelecionado.periodo}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Modo:</span>
                    <span className="font-medium text-slate-800">{arquivoSelecionado.modo}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Total de Linhas:</span>
                    <span className="font-semibold text-slate-800">
                      {arquivoSelecionado.quantidade_linhas || 0}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Data de Geração:</span>
                    <span className="text-slate-800">
                      {formatarDataHora(arquivoSelecionado.created)}
                    </span>
                  </div>
                  {arquivoSelecionado.recibo_entrega && (
                    <div className="flex justify-between py-1 border-b border-slate-200/60 bg-blue-50/60 -mx-1 px-1 rounded">
                      <span className="text-blue-700 font-semibold">Recibo de Entrega:</span>
                      <span className="font-mono text-blue-900 font-semibold">
                        {arquivoSelecionado.recibo_entrega}
                      </span>
                    </div>
                  )}
                  {arquivoSelecionado.entregue_em && (
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500">Entregue em:</span>
                      <span className="text-slate-800">
                        {formatarDataHora(arquivoSelecionado.entregue_em)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quadro "Saídas do período" */}
                {arquivoSelecionado.resumo_saida ? (
                  <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-blue-700" />
                        Saídas do período
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-white border-blue-200 text-blue-800"
                      >
                        Bloco C (Emissão Própria)
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                      <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">
                          NF-e (55)
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {arquivoSelecionado.resumo_saida.total_nfe || 0}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">
                          NFC-e (65)
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {arquivoSelecionado.resumo_saida.total_nfce || 0}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                        <span className="text-[10px] text-amber-700 block uppercase font-medium">
                          Canceladas
                        </span>
                        <span className="text-sm font-bold text-amber-900">
                          {arquivoSelecionado.resumo_saida.total_canceladas || 0}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs">
                        <span className="text-[10px] text-rose-700 block uppercase font-medium">
                          Denegadas
                        </span>
                        <span className="text-sm font-bold text-rose-900">
                          {arquivoSelecionado.resumo_saida.total_denegadas || 0}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded border border-blue-100 shadow-2xs col-span-2 sm:col-span-1">
                        <span className="text-[10px] text-slate-600 block uppercase font-medium">
                          Inutilizadas
                        </span>
                        <span className="text-sm font-bold text-slate-800">
                          {arquivoSelecionado.resumo_saida.total_inutilizadas || 0}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-white p-2.5 rounded border border-blue-100 shadow-2xs flex flex-col justify-between">
                        <span className="text-[11px] text-slate-500 font-medium">
                          Total do VL_DOC
                        </span>
                        <span className="text-base font-bold text-slate-900">
                          {(arquivoSelecionado.resumo_saida.total_vl_doc || 0).toLocaleString(
                            'pt-BR',
                            {
                              style: 'currency',
                              currency: 'BRL',
                            },
                          )}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-blue-100 shadow-2xs flex flex-col justify-between">
                        <span className="text-[11px] text-blue-700 font-medium">Total do ICMS</span>
                        <span className="text-base font-bold text-blue-900">
                          {(arquivoSelecionado.resumo_saida.total_vl_icms || 0).toLocaleString(
                            'pt-BR',
                            {
                              style: 'currency',
                              currency: 'BRL',
                            },
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Entradas do período (Bloco C - Prompt 7.3) */}
                {arquivoSelecionado.resumo_entrada ? (
                  <div className="space-y-2 p-3 bg-emerald-50/70 rounded-lg border border-emerald-200">
                    <div className="text-xs font-semibold text-emerald-950 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <FileCheck2 size={14} className="text-emerald-700" />
                        Entradas do período
                      </span>
                      <span className="text-[11px] text-emerald-700 font-normal">
                        Bloco C (Compras e Transferências)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <div className="bg-white p-2 rounded border border-emerald-100 shadow-2xs">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">
                          Notas de Compra
                        </span>
                        <span className="text-base font-bold text-slate-800">
                          {arquivoSelecionado.resumo_entrada.total_compras || 0}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded border border-emerald-100 shadow-2xs">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">
                          Transferências Recebidas
                        </span>
                        <span className="text-base font-bold text-slate-800">
                          {arquivoSelecionado.resumo_entrada.total_transferencias || 0}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-2xs flex flex-col justify-between">
                        <span className="text-[11px] text-slate-500 font-medium">
                          Total do VL_DOC
                        </span>
                        <span className="text-base font-bold text-slate-900">
                          {(arquivoSelecionado.resumo_entrada.total_vl_doc || 0).toLocaleString(
                            'pt-BR',
                            {
                              style: 'currency',
                              currency: 'BRL',
                            },
                          )}
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded border border-emerald-100 shadow-2xs flex flex-col justify-between">
                        <span className="text-[11px] text-emerald-700 font-medium">
                          Crédito de ICMS
                        </span>
                        <span className="text-base font-bold text-emerald-900">
                          {(
                            arquivoSelecionado.resumo_entrada.total_credito_icms || 0
                          ).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Resumo de Registros do Bloco 9 */}
                {contagemItens.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Layers size={14} className="text-blue-600" />
                      Contagem de Registros (Bloco 9900)
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto p-1 bg-slate-50 rounded border border-slate-200">
                      {contagemItens.map(([reg, qtd]) => (
                        <div
                          key={reg}
                          className="bg-white p-1.5 rounded border border-slate-200 flex items-center justify-between text-[11px]"
                        >
                          <span className="font-mono font-semibold text-slate-700">{reg}</span>
                          <span className="text-slate-500">{qtd}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Painel de Avisos/Erros Resumido */}
                {arquivoSelecionado.validacoes && arquivoSelecionado.validacoes.length > 0 ? (
                  <div className="space-y-2 pt-2">
                    <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-amber-600" />
                        Erros e Avisos Identificados
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {arquivoSelecionado.validacoes.length} item(ns)
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {arquivoSelecionado.validacoes.slice(0, 5).map((val, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded border text-xs ${
                            val.nivel === 'erro'
                              ? 'bg-rose-50 border-rose-200 text-rose-900'
                              : 'bg-amber-50 border-amber-200 text-amber-900'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-semibold text-[11px]">
                            {val.nivel === 'erro' ? (
                              <Badge className="bg-rose-600 text-white text-[9px] px-1 py-0 uppercase">
                                Erro
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500 text-white text-[9px] px-1 py-0 uppercase">
                                Aviso
                              </Badge>
                            )}
                            {val.registro && <span>Registro {val.registro}</span>}
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed">{val.mensagem}</p>
                        </div>
                      ))}

                      {arquivoSelecionado.validacoes.length > 5 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirModalValidacoes(arquivoSelecionado)}
                          className="w-full text-xs text-blue-600 hover:text-blue-700 h-7"
                        >
                          Ver todos os {arquivoSelecionado.validacoes.length} itens...
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                    <span>Nenhuma inconsistência ou aviso detectado na validação interna.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-slate-200 shadow-xs">
              <CardContent className="p-8 text-center text-sm text-slate-500">
                <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                Selecione um arquivo da lista ao lado para inspecionar os detalhes, validações e
                baixar o .txt.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal Completo de Validações e Inconsistências */}
      <Dialog open={modalValidacoesAberto} onOpenChange={setModalValidacoesAberto}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <AlertCircle className="text-amber-600" size={20} />
              Inconsistências e Avisos — {arquivoSelecionado?.nome_arquivo}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Lista de regras fiscais que geraram alerta ou erro durante a montagem do arquivo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 py-2">
            {arquivoSelecionado?.validacoes?.map((item, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg border text-xs space-y-1 ${
                  item.nivel === 'erro'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={`text-[10px] px-1.5 py-0 uppercase font-bold ${
                        item.nivel === 'erro' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'
                      }`}
                    >
                      {item.nivel}
                    </Badge>
                    {item.registro && (
                      <span className="font-mono font-semibold text-slate-800">
                        Registro {item.registro}
                      </span>
                    )}
                  </div>
                  {item.referencia && (
                    <span className="text-[11px] font-mono text-slate-500">
                      Ref: {item.referencia}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed">{item.mensagem}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default SpedFiscalPage
