import React, { useState, useEffect, useCallback } from 'react'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import AcessoNegado from '@/components/AcessoNegado'
import {
  listarInutilizacoes,
  obterUrlDownloadXmlInutilizacao,
  Inutilizacao,
} from '@/services/inutilizacoes'
import { inutilizarNumeracaoFiscal } from '@/services/fiscalIntegracao'
import { obterConfigFiscalEmpresa } from '@/services/configEmissaoFiscal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertCircle,
  FileX2,
  Download,
  RotateCw,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Building2,
} from 'lucide-react'

export const InutilizacaoPage: React.FC = () => {
  const { empresaAtiva } = useEmpresaAtiva()
  const { administrador } = usePermissoes()
  const { toast } = useToast()

  // Estado do formulário
  const [modelo, setModelo] = useState<'55' | '65'>('55')
  const [serie, setSerie] = useState('1')
  const [numeroInicial, setNumeroInicial] = useState('')
  const [numeroFinal, setNumeroFinal] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Estado da listagem
  const [inutilizacoes, setInutilizacoes] = useState<Inutilizacao[]>([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)

  // Carregar configurações padrão da empresa ao trocar de empresa
  useEffect(() => {
    if (!empresaAtiva?.id) return

    let cancelado = false
    const carregarConfig = async () => {
      try {
        const cfg = await obterConfigFiscalEmpresa(empresaAtiva.id)
        if (!cancelado && cfg) {
          if (modelo === '55' && cfg.serie_nfe) {
            setSerie(cfg.serie_nfe)
          } else if (modelo === '65' && cfg.serie_nfce) {
            setSerie(cfg.serie_nfce)
          }
        }
      } catch (_) {
        // Ignora caso não tenha configuração
      }
    }

    carregarConfig()
    return () => {
      cancelado = true
    }
  }, [empresaAtiva?.id, modelo])

  // Carregar histórico de inutilizações
  const carregarHistorico = useCallback(async () => {
    if (!empresaAtiva?.id) return
    try {
      setCarregandoHistorico(true)
      const lista = await listarInutilizacoes(empresaAtiva.id)
      setInutilizacoes(lista)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar histórico',
        description: err?.message || 'Falha ao buscar registros de inutilização.',
        variant: 'destructive',
      })
    } finally {
      setCarregandoHistorico(false)
    }
  }, [empresaAtiva?.id, toast])

  useEffect(() => {
    carregarHistorico()
  }, [carregarHistorico])

  // Se não for administrador do ERP, bloqueia o acesso
  if (!administrador) {
    return (
      <AcessoNegado mensagem="A inutilização de numeração fiscal é uma rotina crítica e restrita exclusivamente a administradores do ERP." />
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!empresaAtiva?.id) {
      toast({
        title: 'Nenhuma empresa ativa',
        description: 'Selecione uma empresa ativa para inutilizar a numeração.',
        variant: 'destructive',
      })
      return
    }

    const nInicial = parseInt(numeroInicial, 10)
    const nFinal = parseInt(numeroFinal, 10)

    if (isNaN(nInicial) || nInicial <= 0) {
      toast({
        title: 'Número inicial inválido',
        description: 'Informe um número inicial positivo válido.',
        variant: 'destructive',
      })
      return
    }

    if (isNaN(nFinal) || nFinal < nInicial) {
      toast({
        title: 'Número final inválido',
        description: 'O número final não pode ser menor que o número inicial.',
        variant: 'destructive',
      })
      return
    }

    const justLimpa = justificativa.trim()
    if (!justLimpa || justLimpa.length < 15) {
      toast({
        title: 'Justificativa insuficiente',
        description:
          'A justificativa de inutilização deve ter no mínimo 15 caracteres (exigência SEFAZ).',
        variant: 'destructive',
      })
      return
    }

    try {
      setEnviando(true)
      const res = await inutilizarNumeracaoFiscal({
        empresa_id: empresaAtiva.id,
        modelo,
        serie: serie.trim(),
        numero_inicial: nInicial,
        numero_final: nFinal,
        justificativa: justLimpa,
      })

      if (res.sucesso) {
        toast({
          title: 'Numeração inutilizada com sucesso',
          description: `Faixa ${nInicial} a ${nFinal} (Série ${serie}) homologada pela SEFAZ.`,
        })
        // Limpa formulário
        setNumeroInicial('')
        setNumeroFinal('')
        setJustificativa('')
        // Recarrega lista
        carregarHistorico()
      } else {
        toast({
          title: 'Inutilização não autorizada',
          description: res.message || 'A SEFAZ rejeitou o pedido de inutilização.',
          variant: 'destructive',
        })
        carregarHistorico()
      }
    } catch (err: any) {
      toast({
        title: 'Falha ao solicitar inutilização',
        description: err?.message || 'Erro de comunicação ao enviar inutilização para a SEFAZ.',
        variant: 'destructive',
      })
      carregarHistorico()
    } finally {
      setEnviando(false)
    }
  }

  const formatarData = (iso?: string) => {
    if (!iso) return '-'
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return iso
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const renderBadgeStatus = (status?: string) => {
    const s = (status || '').toLowerCase()
    if (s === 'autorizada' || s === 'autorizado') {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs gap-1 font-medium">
          <CheckCircle2 size={12} />
          Inutilizada
        </Badge>
      )
    }
    if (s === 'rejeitada' || s === 'rejeitado' || s === 'erro_autorizacao') {
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 text-xs gap-1 font-medium">
          <XCircle size={12} />
          Rejeitada
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-xs gap-1">
        <Clock size={12} />
        {status || 'Pendente'}
      </Badge>
    )
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileX2 className="h-7 w-7 text-red-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Inutilização de Numeração Fiscal
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Homologação junto à SEFAZ de faixas numéricas de NF-e e NFC-e não utilizadas (exclusivo
            para Administrador)
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {empresaAtiva && (
            <Badge
              variant="outline"
              className="gap-1.5 py-1 px-3 bg-slate-50 border-slate-200 text-slate-700"
            >
              <Building2 size={13} className="text-slate-500" />
              <span>{empresaAtiva.nome_fantasia || empresaAtiva.razao_social}</span>
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={carregarHistorico}
            className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5"
          >
            <RotateCw size={14} className={carregandoHistorico ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Caixa de Explicação Exigida pela Legislação e pelo Usuário */}
      <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 flex items-start gap-3 shadow-2xs">
        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm leading-relaxed space-y-1">
          <p className="font-semibold text-amber-950">Atenção sobre o uso da Inutilização:</p>
          <p>
            Inutilizar serve para números que foram pulados e nunca chegaram a ser autorizados. Nota
            rejeitada pode ser reenviada com a mesma referência e não precisa ser inutilizada.
          </p>
          <p className="text-xs text-amber-800">
            A empresa ativa é{' '}
            <strong>
              {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'selecionada'}
            </strong>{' '}
            (cada empresa possui sua própria numeração e séries independentes).
          </p>
        </div>
      </div>

      {/* Formulário de Inutilização */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-slate-800">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Nova Solicitação de Inutilização
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Preencha a série, faixa de números que foram quebrados ou pulados e a justificativa
            fundamentada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Modelo */}
              <div className="space-y-1.5">
                <Label htmlFor="modelo" className="text-xs font-medium text-slate-700">
                  Modelo do Documento *
                </Label>
                <Select
                  value={modelo}
                  onValueChange={(val: '55' | '65') => setModelo(val)}
                  disabled={enviando}
                >
                  <SelectTrigger id="modelo" className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="55" className="text-xs">
                      55 - NF-e (Nota Eletrônica)
                    </SelectItem>
                    <SelectItem value="65" className="text-xs">
                      65 - NFC-e (Cupom do Consumidor)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Série */}
              <div className="space-y-1.5">
                <Label htmlFor="serie" className="text-xs font-medium text-slate-700">
                  Série *
                </Label>
                <Input
                  id="serie"
                  value={serie}
                  onChange={(e) => setSerie(e.target.value)}
                  placeholder="Ex: 1"
                  required
                  disabled={enviando}
                  className="h-9 text-xs"
                />
              </div>

              {/* Número Inicial */}
              <div className="space-y-1.5">
                <Label htmlFor="numeroInicial" className="text-xs font-medium text-slate-700">
                  Número Inicial *
                </Label>
                <Input
                  id="numeroInicial"
                  type="number"
                  min="1"
                  step="1"
                  value={numeroInicial}
                  onChange={(e) => setNumeroInicial(e.target.value)}
                  placeholder="Ex: 105"
                  required
                  disabled={enviando}
                  className="h-9 text-xs"
                />
              </div>

              {/* Número Final */}
              <div className="space-y-1.5">
                <Label htmlFor="numeroFinal" className="text-xs font-medium text-slate-700">
                  Número Final *
                </Label>
                <Input
                  id="numeroFinal"
                  type="number"
                  min={numeroInicial || '1'}
                  step="1"
                  value={numeroFinal}
                  onChange={(e) => setNumeroFinal(e.target.value)}
                  placeholder="Ex: 105 (ou final da faixa)"
                  required
                  disabled={enviando}
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-slate-400">
                  Para um único número, repita o mesmo valor no início e no fim.
                </p>
              </div>
            </div>

            {/* Justificativa */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="justificativa" className="text-xs font-medium text-slate-700">
                  Justificativa da Inutilização (mínimo 15 caracteres) *
                </Label>
                <span
                  className={`text-[11px] ${
                    justificativa.trim().length >= 15 ? 'text-emerald-600' : 'text-slate-400'
                  }`}
                >
                  {justificativa.trim().length} / 15 caracteres mínimos
                </span>
              </div>
              <Textarea
                id="justificativa"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Exemplo: Quebra de sequência numérica gerada por falha na numeração do terminal fiscal."
                rows={3}
                required
                disabled={enviando}
                className="text-xs resize-none"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                disabled={
                  enviando || justificativa.trim().length < 15 || !numeroInicial || !numeroFinal
                }
                className="gap-2 bg-red-600 hover:bg-red-700 text-white text-xs h-9"
              >
                <Send size={14} className={enviando ? 'animate-spin' : ''} />
                <span>
                  {enviando ? 'Transmitindo para SEFAZ...' : 'Inutilizar Numeração na SEFAZ'}
                </span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Histórico de Inutilizações */}
      <Card className="border-slate-200 shadow-2xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-800">
                Histórico de Inutilizações
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Registros de números inutilizados na empresa ativa{' '}
                <strong>{empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social}</strong>
              </CardDescription>
            </div>
            <div className="text-xs text-slate-500">Total: {inutilizacoes.length} registro(s)</div>
          </div>
        </CardHeader>
        <CardContent>
          {carregandoHistorico ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Carregando histórico de inutilizações...
            </div>
          ) : inutilizacoes.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <FileX2 className="mx-auto h-9 w-9 text-slate-300" />
              <p className="text-xs sm:text-sm font-medium text-slate-700">
                Nenhuma numeração foi inutilizada nesta empresa
              </p>
              <p className="text-xs text-slate-400">
                Quando números pulados forem inutilizados na SEFAZ, o registro e protocolo ficarão
                listados aqui.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-slate-200 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/70">
                  <TableRow>
                    <TableHead className="text-[11px] font-semibold text-slate-700">Data</TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-700">
                      Modelo
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-700">
                      Série
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-700">
                      Faixa de Números
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-700">
                      Justificativa
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-700">
                      Situação
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-700">
                      Protocolo
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-700">
                      Usuário
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold text-slate-700 text-right">
                      XML
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {inutilizacoes.map((item) => {
                    const downloadUrl = obterUrlDownloadXmlInutilizacao(item)
                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50/60">
                        <TableCell className="text-slate-600 whitespace-nowrap">
                          {formatarData(item.data_inutilizacao || item.created)}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-800">
                          {item.modelo === '65' ? 'NFC-e (65)' : 'NF-e (55)'}
                        </TableCell>
                        <TableCell className="text-slate-700 font-mono">{item.serie}</TableCell>
                        <TableCell className="font-mono text-slate-900 font-semibold whitespace-nowrap">
                          {item.numero_inicial === item.numero_final
                            ? `Nº ${item.numero_inicial}`
                            : `${item.numero_inicial} a ${item.numero_final}`}
                        </TableCell>
                        <TableCell
                          className="max-w-xs truncate text-slate-600"
                          title={item.justificativa}
                        >
                          {item.justificativa}
                        </TableCell>
                        <TableCell>{renderBadgeStatus(item.status)}</TableCell>
                        <TableCell className="font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {item.protocolo || '-'}
                        </TableCell>
                        <TableCell className="text-slate-600 whitespace-nowrap">
                          {item.expand?.usuario_id?.name || item.expand?.usuario_id?.email || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {downloadUrl ? (
                            <a
                              href={downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              download={`inutilizacao_${item.modelo}_${item.serie}_${item.numero_inicial}.xml`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
                            >
                              <Download size={13} />
                              <span>XML</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default InutilizacaoPage
