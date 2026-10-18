import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FileText,
  Search,
  RefreshCw,
  AlertTriangle,
  Clock,
  Eye,
  Download,
  ExternalLink,
  RotateCw,
  XCircle,
  FileEdit,
  Code2,
  Building2,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  HelpCircle,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { PermissaoGuard } from '@/components/PermissaoGuard'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import pb from '@/lib/pocketbase/client'
import {
  DocumentoFiscalRegistro,
  listarDocumentosFiscaisComFiltros,
  obterDocumentosCriticos,
} from '@/services/documentosFiscais'
import {
  consultarSituacaoNFe,
  reenviarDocumentoFiscal,
  consultarDocumentosEmLote,
  baixarArquivoFiscal,
} from '@/services/fiscalIntegracao'
import { ModalCancelarNFe } from '@/components/fiscal/ModalCancelarNFe'
import { ModalCartaCorrecao } from '@/components/fiscal/ModalCartaCorrecao'

export function DocumentosFiscaisPage() {
  const { empresaAtiva, empresas } = useEmpresaAtiva()
  const { administrador, pode } = usePermissoes()
  const { toast } = useToast()

  // Filtros
  const [empresaFiltroId, setEmpresaFiltroId] = useState<string>(empresaAtiva?.id || '')
  const [verTodasEmpresas, setVerTodasEmpresas] = useState<boolean>(false)
  const [dataInicio, setDataInicio] = useState<string>('')
  const [dataFim, setDataFim] = useState<string>('')
  const [modeloFiltro, setModeloFiltro] = useState<string>('todos')
  const [statusFiltro, setStatusFiltro] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const st = params.get('status')
      if (st) return st
    }
    return 'todos'
  })
  const [origemFiltro, setOrigemFiltro] = useState<string>('todos')
  const [destinatarioFiltro, setDestinatarioFiltro] = useState<string>('')
  const [numeroChaveFiltro, setNumeroChaveFiltro] = useState<string>('')

  // Paginação e dados
  const [documentos, setDocumentos] = useState<DocumentoFiscalRegistro[]>([])
  const [pagina, setPagina] = useState<number>(1)
  const [totalPaginas, setTotalPaginas] = useState<number>(1)
  const [totalItens, setTotalItens] = useState<number>(0)
  const [carregando, setCarregando] = useState<boolean>(true)

  // Documentos críticos (destaque no topo)
  const [criticos, setCriticos] = useState<{
    rejeitados: DocumentoFiscalRegistro[]
    processando: DocumentoFiscalRegistro[]
    total: number
  }>({ rejeitados: [], processando: [], total: 0 })
  const [consultandoLote, setConsultandoLote] = useState<boolean>(false)

  // Ações e modais
  const [docSelecionado, setDocSelecionado] = useState<DocumentoFiscalRegistro | null>(null)
  const [modalJsonAberto, setModalJsonAberto] = useState<boolean>(false)
  const [modalCancelarAberto, setModalCancelarAberto] = useState<boolean>(false)
  const [modalCartaAberto, setModalCartaAberto] = useState<boolean>(false)
  const [processandoAcaoId, setProcessandoAcaoId] = useState<string | null>(null)

  // Sincronizar filtro de empresa com empresa ativa inicial
  useEffect(() => {
    if (empresaAtiva?.id && !verTodasEmpresas && !empresaFiltroId) {
      setEmpresaFiltroId(empresaAtiva.id)
    }
  }, [empresaAtiva?.id, verTodasEmpresas, empresaFiltroId])

  // Carregar documentos críticos
  const carregarCriticos = useCallback(async () => {
    try {
      const res = await obterDocumentosCriticos(
        verTodasEmpresas ? undefined : empresaFiltroId || empresaAtiva?.id,
        verTodasEmpresas,
      )
      setCriticos(res)
    } catch (err) {
      console.error('Erro ao carregar documentos críticos:', err)
    }
  }, [verTodasEmpresas, empresaFiltroId, empresaAtiva?.id])

  // Carregar listagem principal
  const carregarDocumentos = useCallback(async () => {
    try {
      setCarregando(true)
      const res = await listarDocumentosFiscaisComFiltros({
        empresaId: empresaFiltroId || empresaAtiva?.id,
        todasEmpresas: verTodasEmpresas,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
        modelo: modeloFiltro,
        status: statusFiltro,
        origem: origemFiltro,
        destinatario: destinatarioFiltro,
        numeroOuChave: numeroChaveFiltro,
        page: pagina,
        perPage: 25,
      })
      setDocumentos(res.items)
      setTotalPaginas(res.totalPages || 1)
      setTotalItens(res.totalItems || 0)
    } catch (err: any) {
      console.error('Erro ao carregar documentos fiscais:', err)
      toast({
        title: 'Erro ao carregar documentos',
        description: err?.message || 'Falha ao buscar registros de documentos fiscais.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [
    empresaFiltroId,
    empresaAtiva?.id,
    verTodasEmpresas,
    dataInicio,
    dataFim,
    modeloFiltro,
    statusFiltro,
    origemFiltro,
    destinatarioFiltro,
    numeroChaveFiltro,
    pagina,
    toast,
  ])

  useEffect(() => {
    carregarDocumentos()
    carregarCriticos()
  }, [carregarDocumentos, carregarCriticos])

  // Consultar todos em lote
  const handleConsultarTodosCriticos = async () => {
    const idsCriticos = [
      ...criticos.rejeitados.map((d) => d.id),
      ...criticos.processando.map((d) => d.id),
    ]

    if (idsCriticos.length === 0) {
      toast({
        title: 'Nenhum documento crítico',
        description: 'Não há notas rejeitadas ou em processamento longo para consultar.',
      })
      return
    }

    try {
      setConsultandoLote(true)
      const res = await consultarDocumentosEmLote(idsCriticos)
      toast({
        title: 'Consulta em lote concluída',
        description: res.message,
      })
      await carregarCriticos()
      await carregarDocumentos()
    } catch (err: any) {
      toast({
        title: 'Erro na consulta em lote',
        description: err?.message || 'Não foi possível consultar os documentos na Focus NFe.',
        variant: 'destructive',
      })
    } finally {
      setConsultandoLote(false)
    }
  }

  // Ação 1: Consultar situação individual
  const handleConsultarSituacao = async (doc: DocumentoFiscalRegistro) => {
    try {
      setProcessandoAcaoId(doc.id)
      const res = await consultarSituacaoNFe({
        documento_id: doc.id,
      })

      if (res.sucesso) {
        toast({
          title: `Situação: ${res.status}`,
          description: res.message || 'Status atualizado com sucesso.',
        })
      } else {
        toast({
          title: `Situação: ${res.status || 'Não autorizada'}`,
          description: res.message || 'Verifique o motivo no registro.',
          variant: 'destructive',
        })
      }
      await carregarDocumentos()
      await carregarCriticos()
    } catch (err: any) {
      toast({
        title: 'Erro ao consultar situação',
        description: err?.data?.message || err?.message || 'Falha na comunicação com a Focus NFe.',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcaoId(null)
    }
  }

  // Ação 2: Tentar de novo (apenas Rejeitada)
  const handleTentarDeNovo = async (doc: DocumentoFiscalRegistro) => {
    if (!pode('notas_saida', 'criar') && !administrador) {
      toast({
        title: 'Permissão negada',
        description: 'Você não tem permissão para reenviar documentos fiscais.',
        variant: 'destructive',
      })
      return
    }

    try {
      setProcessandoAcaoId(doc.id)
      const res = await reenviarDocumentoFiscal(doc.id)

      if (res.sucesso) {
        toast({
          title: 'Reenvio disparado',
          description: res.message,
        })
      } else {
        toast({
          title: 'Erro no reenvio',
          description: res.message,
          variant: 'destructive',
        })
      }
      await carregarDocumentos()
      await carregarCriticos()
    } catch (err: any) {
      toast({
        title: 'Erro ao reenviar nota fiscal',
        description: err?.data?.message || err?.message || 'Falha ao retransmitir para a SEFAZ.',
        variant: 'destructive',
      })
    } finally {
      setProcessandoAcaoId(null)
    }
  }

  // Ação 3: Abrir DANFE
  const handleAbrirDanfe = (doc: DocumentoFiscalRegistro) => {
    if (doc.danfe_url) {
      window.open(doc.danfe_url, '_blank', 'noopener,noreferrer')
      return
    }
    toast({
      title: 'DANFE não disponível',
      description: 'Este documento não possui URL de DANFE registrada.',
      variant: 'destructive',
    })
  }

  // Ação 4: Baixar XML
  const handleBaixarXml = async (doc: DocumentoFiscalRegistro) => {
    if (doc.xml_arquivo) {
      try {
        const fileUrl = pb.files.getURL(doc as any, doc.xml_arquivo)
        const a = document.createElement('a')
        a.href = fileUrl
        a.download = `nfe_${doc.chave_acesso || doc.numero || doc.id}.xml`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        return
      } catch (err) {
        console.warn('Erro ao obter URL do arquivo PocketBase, tentando fallback:', err)
      }
    }

    // Fallback: se houver json_retorno com caminho_xml
    const caminhoXml = doc.json_retorno?.caminho_xml_nota_fiscal || doc.json_retorno?.xml_url || ''
    if (caminhoXml) {
      try {
        setProcessandoAcaoId(doc.id)
        const res = await baixarArquivoFiscal({
          empresaId: doc.empresa_id,
          caminho: caminhoXml,
        })
        if (res.sucesso && res.conteudo) {
          const blob = new Blob([res.conteudo], { type: 'application/xml;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `nfe_${doc.chave_acesso || doc.numero || doc.id}.xml`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
          return
        }
      } catch (err: any) {
        console.error('Erro no download via Focus:', err)
      } finally {
        setProcessandoAcaoId(null)
      }
    }

    toast({
      title: 'XML não disponível',
      description: 'Arquivo XML ainda não disponível para este documento.',
      variant: 'destructive',
    })
  }

  // Helper para mapa de empresas
  const empresasMap = useMemo(() => {
    const map = new Map<string, string>()
    empresas.forEach((e) => {
      map.set(e.id, e.nome_fantasia || e.razao_social || 'Empresa')
    })
    return map
  }, [empresas])

  // Selos coloridos de status
  const renderBadgeStatus = (status: string) => {
    switch (status) {
      case 'Autorizada':
        return (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[11px]">
            Autorizada
          </Badge>
        )
      case 'Rejeitada':
        return (
          <Badge
            variant="destructive"
            className="bg-red-600 hover:bg-red-700 text-white font-medium text-[11px]"
          >
            Rejeitada
          </Badge>
        )
      case 'Processando':
        return (
          <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-medium text-[11px] gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processando
          </Badge>
        )
      case 'Cancelada':
        return (
          <Badge
            variant="secondary"
            className="bg-slate-500 hover:bg-slate-600 text-white font-medium text-[11px]"
          >
            Cancelada
          </Badge>
        )
      case 'Denegada':
        return (
          <Badge className="bg-red-950 hover:bg-red-900 text-white border border-red-700 font-medium text-[11px]">
            Denegada
          </Badge>
        )
      case 'Rascunho':
      default:
        return (
          <Badge
            variant="outline"
            className="text-slate-600 border-slate-300 font-medium text-[11px]"
          >
            {status || 'Rascunho'}
          </Badge>
        )
    }
  }

  const formatarValor = (valor?: number) => {
    return Number(valor || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
  }

  const formatarData = (dataStr?: string) => {
    if (!dataStr) return '-'
    try {
      const d = new Date(dataStr)
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch (_) {
      return dataStr
    }
  }

  return (
    <PermissaoGuard modulo="notas_saida" acao="ver">
      <div className="space-y-6 pb-12">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <FileText className="h-7 w-7 text-primary" />
              Monitor de Documentos Fiscais
            </h1>
            <p className="text-sm text-slate-500">
              Acompanhamento em tempo real, consultas na SEFAZ/Focus NFe, reenvios e gestão de DANFE
              e XML.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                carregarDocumentos()
                carregarCriticos()
              }}
              disabled={carregando}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Destaque no Topo: Documentos Críticos (Rejeitados e Processando > 5 min) */}
        {criticos.total > 0 && (
          <Card className="border-amber-300 bg-amber-50/70 shadow-xs">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Atenção: {criticos.total} documento(s) requerem atenção
                </CardTitle>
                <CardDescription className="text-amber-800 text-xs">
                  {criticos.rejeitados.length} nota(s) rejeitada(s) pela SEFAZ e{' '}
                  {criticos.processando.length} nota(s) em processamento há mais de 5 minutos.
                </CardDescription>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={handleConsultarTodosCriticos}
                disabled={consultandoLote}
                className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100 gap-1.5 shadow-2xs text-xs font-semibold"
              >
                {consultandoLote ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5 text-amber-700" />
                )}
                Consultar todos na SEFAZ
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
                {criticos.rejeitados.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2.5 rounded-md border border-red-200 bg-white flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                          Rejeitada
                        </Badge>
                        <span className="font-semibold text-slate-800">
                          {doc.modelo === '65' ? 'NFC-e' : 'NF-e'} nº {doc.numero || '(Sem nº)'}
                        </span>
                        <span className="text-slate-500 font-mono text-[11px]">
                          ({empresasMap.get(doc.empresa_id) || 'Empresa'})
                        </span>
                      </div>
                      <p className="text-slate-600 line-clamp-1" title={doc.mensagem_sefaz || ''}>
                        <strong>Motivo:</strong> {doc.mensagem_sefaz || 'Rejeição sem detalhes'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => handleConsultarSituacao(doc)}
                        disabled={processandoAcaoId === doc.id}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Consultar
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 px-2 text-xs bg-red-600 hover:bg-red-700 gap-1"
                        onClick={() => handleTentarDeNovo(doc)}
                        disabled={processandoAcaoId === doc.id}
                      >
                        <RotateCw className="h-3 w-3" />
                        Tentar de novo
                      </Button>
                    </div>
                  </div>
                ))}

                {criticos.processando.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2.5 rounded-md border border-amber-200 bg-white flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-amber-500 text-white text-[10px] py-0 px-1.5">
                          Processando &gt; 5 min
                        </Badge>
                        <span className="font-semibold text-slate-800">
                          {doc.modelo === '65' ? 'NFC-e' : 'NF-e'} nº {doc.numero || '(Pendente)'}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">
                        Emissão iniciada em: {formatarData(doc.data_emissao || doc.created)}
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs gap-1 border-amber-300"
                      onClick={() => handleConsultarSituacao(doc)}
                      disabled={processandoAcaoId === doc.id}
                    >
                      <RefreshCw className="h-3 w-3 text-amber-700" />
                      Consultar situação
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Card de Filtros */}
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <Filter className="h-4 w-4 text-primary" />
              Filtros de Pesquisa
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Filtro Empresa */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Empresa Emitente</Label>
                {administrador ? (
                  <Select
                    value={verTodasEmpresas ? 'todas' : empresaFiltroId || empresaAtiva?.id || ''}
                    onValueChange={(val) => {
                      if (val === 'todas') {
                        setVerTodasEmpresas(true)
                        setEmpresaFiltroId('')
                      } else {
                        setVerTodasEmpresas(false)
                        setEmpresaFiltroId(val)
                      }
                      setPagina(1)
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">
                        <span className="font-semibold text-blue-600">Todas as empresas</span>
                      </SelectItem>
                      {empresas.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.nome_fantasia || emp.razao_social}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Empresa'}
                    disabled
                    className="h-9 text-xs bg-slate-50"
                  />
                )}
              </div>

              {/* Filtro Modelo */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Modelo Fiscal</Label>
                <Select
                  value={modeloFiltro}
                  onValueChange={(val) => {
                    setModeloFiltro(val)
                    setPagina(1)
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos os modelos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos (NF-e 55 e NFC-e 65)</SelectItem>
                    <SelectItem value="55">NF-e (Modelo 55)</SelectItem>
                    <SelectItem value="65">NFC-e (Modelo 65)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro Status */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Status</Label>
                <Select
                  value={statusFiltro}
                  onValueChange={(val) => {
                    setStatusFiltro(val)
                    setPagina(1)
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="Autorizada">Autorizada</SelectItem>
                    <SelectItem value="Processando">Processando</SelectItem>
                    <SelectItem value="Rejeitada">Rejeitada</SelectItem>
                    <SelectItem value="Cancelada">Cancelada</SelectItem>
                    <SelectItem value="Denegada">Denegada</SelectItem>
                    <SelectItem value="Rascunho">Rascunho</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro Origem */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Origem da Emissão</Label>
                <Select
                  value={origemFiltro}
                  onValueChange={(val) => {
                    setOrigemFiltro(val)
                    setPagina(1)
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todas as origens" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as origens</SelectItem>
                    <SelectItem value="Venda">Venda</SelectItem>
                    <SelectItem value="Devolução de venda">Devolução de venda</SelectItem>
                    <SelectItem value="Devolução de compra">Devolução de compra</SelectItem>
                    <SelectItem value="Transferência">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro Data Início */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Data Emissão Inicial</Label>
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => {
                    setDataInicio(e.target.value)
                    setPagina(1)
                  }}
                  className="h-9 text-xs"
                />
              </div>

              {/* Filtro Data Fim */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Data Emissão Final</Label>
                <Input
                  type="date"
                  value={dataFim}
                  onChange={(e) => {
                    setDataFim(e.target.value)
                    setPagina(1)
                  }}
                  className="h-9 text-xs"
                />
              </div>

              {/* Filtro Destinatário */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Destinatário (Nome ou CPF/CNPJ)</Label>
                <Input
                  placeholder="Pesquisar cliente/destinatário..."
                  value={destinatarioFiltro}
                  onChange={(e) => {
                    setDestinatarioFiltro(e.target.value)
                    setPagina(1)
                  }}
                  className="h-9 text-xs"
                />
              </div>

              {/* Filtro Número / Chave */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Número ou Chave de Acesso</Label>
                <Input
                  placeholder="Número ou 44 dígitos da chave..."
                  value={numeroChaveFiltro}
                  onChange={(e) => {
                    setNumeroChaveFiltro(e.target.value)
                    setPagina(1)
                  }}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Ações de limpeza rápida */}
            <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 text-xs">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setVerTodasEmpresas(false)
                  setEmpresaFiltroId(empresaAtiva?.id || '')
                  setDataInicio('')
                  setDataFim('')
                  setModeloFiltro('todos')
                  setStatusFiltro('todos')
                  setOrigemFiltro('todos')
                  setDestinatarioFiltro('')
                  setNumeroChaveFiltro('')
                  setPagina(1)
                }}
                className="h-7 text-xs text-slate-500 hover:text-slate-800"
              >
                Limpar filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Listagem de Documentos Fiscais */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Documentos Emitidos</CardTitle>
              <CardDescription className="text-xs">
                Total de {totalItens} documento(s) fiscal(is) encontrado(s) com os critérios
                informados.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-y border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Empresa</th>
                    <th className="py-2.5 px-3">Data</th>
                    <th className="py-2.5 px-2">Mod.</th>
                    <th className="py-2.5 px-3">Série / Número</th>
                    <th className="py-2.5 px-3">Destinatário</th>
                    <th className="py-2.5 px-3 text-right">Valor Total</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-2 text-center">Ambiente</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {carregando ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span>Carregando documentos fiscais...</span>
                        </div>
                      </td>
                    </tr>
                  ) : documentos.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Nenhum documento fiscal encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    documentos.map((doc) => {
                      const empNome = empresasMap.get(doc.empresa_id) || 'Empresa'
                      const isNFe = doc.modelo === '55'
                      const isAutorizada = doc.status === 'Autorizada'
                      const isRejeitada = doc.status === 'Rejeitada'
                      const isProcessando = doc.status === 'Processando'

                      return (
                        <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            <span className="truncate max-w-[140px] block" title={empNome}>
                              {empNome}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                            {formatarData(doc.data_emissao || doc.created)}
                          </td>
                          <td className="py-2.5 px-2 whitespace-nowrap font-mono font-semibold">
                            {doc.modelo === '65' ? (
                              <span className="text-amber-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                                65
                              </span>
                            ) : (
                              <span className="text-blue-800 bg-blue-50 px-1 py-0.5 rounded border border-blue-200">
                                55
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-800">
                            {doc.serie || '1'} / <strong>{doc.numero || '-'}</strong>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="max-w-[180px]">
                              <p
                                className="font-semibold text-slate-800 truncate"
                                title={
                                  doc.destinatario_nome || doc.cliente_nome || 'Consumidor Final'
                                }
                              >
                                {doc.destinatario_nome || doc.cliente_nome || 'Consumidor Final'}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono truncate">
                                {doc.destinatario_cpf_cnpj || doc.cliente_cpf_cnpj || '-'}
                              </p>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-slate-800 whitespace-nowrap">
                            {formatarValor(doc.valor_total || doc.valor_produtos)}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {renderBadgeStatus(doc.status)}
                          </td>
                          <td className="py-2.5 px-2 text-center whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                doc.ambiente === 'Produção'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {doc.ambiente || 'Homologação'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {/* 1) Consultar situação */}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-slate-600 hover:text-slate-900"
                                      onClick={() => handleConsultarSituacao(doc)}
                                      disabled={processandoAcaoId === doc.id}
                                    >
                                      {processandoAcaoId === doc.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Consultar situação na SEFAZ</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {/* 2) Tentar de novo (apenas Rejeitada) */}
                              {isRejeitada && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-red-600 hover:text-red-800 hover:bg-red-50"
                                        onClick={() => handleTentarDeNovo(doc)}
                                        disabled={processandoAcaoId === doc.id}
                                      >
                                        <RotateCw className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Tentar de novo (Reenviar)</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {/* 3) Abrir DANFE */}
                              {isAutorizada && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                        onClick={() => handleAbrirDanfe(doc)}
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Abrir DANFE</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {/* 4) Baixar XML */}
                              {isAutorizada && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
                                        onClick={() => handleBaixarXml(doc)}
                                        disabled={processandoAcaoId === doc.id}
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Baixar XML autorizado</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {/* 5) Cancelar */}
                              {isAutorizada && pode('notas_saida', 'excluir') && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-slate-500 hover:text-red-600 hover:bg-red-50"
                                        onClick={() => {
                                          setDocSelecionado(doc)
                                          setModalCancelarAberto(true)
                                        }}
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Cancelar nota na SEFAZ</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {/* 6) Carta de Correção (Apenas NF-e 55 autorizada) */}
                              {isAutorizada && isNFe && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-slate-500 hover:text-purple-600 hover:bg-purple-50"
                                        onClick={() => {
                                          setDocSelecionado(doc)
                                          setModalCartaAberto(true)
                                        }}
                                      >
                                        <FileEdit className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Carta de Correção (CC-e)</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {/* 7) Ver JSON enviado e retorno (só Administrador) */}
                              {administrador && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-slate-400 hover:text-slate-800"
                                        onClick={() => {
                                          setDocSelecionado(doc)
                                          setModalJsonAberto(true)
                                        }}
                                      >
                                        <Code2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Ver JSON enviado e retorno</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between p-3 border-t border-slate-100 text-xs text-slate-500">
                <span>
                  Página <strong>{pagina}</strong> de <strong>{totalPaginas}</strong>
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    disabled={pagina <= 1}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    disabled={pagina >= totalPaginas}
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                  >
                    Próxima
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal: Ver JSON enviado e retorno (só Administrador) */}
        <Dialog open={modalJsonAberto} onOpenChange={setModalJsonAberto}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-primary" />
                Payloads Fiscais — {docSelecionado?.modelo === '65' ? 'NFC-e' : 'NF-e'} nº{' '}
                {docSelecionado?.numero || '(Sem nº)'}
              </DialogTitle>
              <DialogDescription>
                Visualização técnica dos payloads JSON enviados à Focus NFe e do retorno recebido da
                SEFAZ.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-2 text-xs">
              <div>
                <h4 className="font-semibold text-slate-800 mb-1">JSON Enviado (Focus NFe)</h4>
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded-md overflow-x-auto text-[11px] font-mono max-h-56">
                  {docSelecionado?.json_enviado
                    ? JSON.stringify(docSelecionado.json_enviado, null, 2)
                    : '// Nenhum payload registrado no envio'}
                </pre>
              </div>

              <div>
                <h4 className="font-semibold text-slate-800 mb-1">
                  JSON de Retorno (SEFAZ / Focus)
                </h4>
                <pre className="bg-slate-900 text-amber-300 p-3 rounded-md overflow-x-auto text-[11px] font-mono max-h-56">
                  {docSelecionado?.json_retorno
                    ? JSON.stringify(docSelecionado.json_retorno, null, 2)
                    : '// Nenhum retorno registrado ainda'}
                </pre>
              </div>

              {docSelecionado?.chave_acesso && (
                <div className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-700 font-mono text-[11px]">
                  <strong>Chave de Acesso:</strong> {docSelecionado.chave_acesso}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setModalJsonAberto(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal: Cancelamento de NF-e / NFC-e */}
        {modalCancelarAberto && docSelecionado && (
          <ModalCancelarNFe
            open={modalCancelarAberto}
            onOpenChange={setModalCancelarAberto}
            documentoId={docSelecionado.id}
            vendaId={docSelecionado.venda_id}
            numeroNFe={docSelecionado.numero}
            onSucesso={() => {
              carregarDocumentos()
              carregarCriticos()
            }}
          />
        )}

        {/* Modal: Carta de Correção (CC-e) */}
        {modalCartaAberto && docSelecionado && (
          <ModalCartaCorrecao
            open={modalCartaAberto}
            onOpenChange={setModalCartaAberto}
            documentoId={docSelecionado.id}
            vendaId={docSelecionado.venda_id}
            numeroNFe={docSelecionado.numero}
            onSucesso={() => {
              carregarDocumentos()
            }}
          />
        )}
      </div>
    </PermissaoGuard>
  )
}

export default DocumentosFiscaisPage
