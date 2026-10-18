import React, { useState, useEffect } from 'react'
import { PermissaoGuard } from '@/components/PermissaoGuard'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { listarEmpresas, Empresa } from '@/services/empresas'
import { exportarXmlsFiscais } from '@/services/fiscalIntegracao'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import {
  FileArchive,
  Download,
  Loader2,
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  FolderArchive,
  FileSpreadsheet,
  ShieldAlert,
} from 'lucide-react'

const MESES = [
  { valor: 1, rotulo: 'Janeiro' },
  { valor: 2, rotulo: 'Fevereiro' },
  { valor: 3, rotulo: 'Março' },
  { valor: 4, rotulo: 'Abril' },
  { valor: 5, rotulo: 'Maio' },
  { valor: 6, rotulo: 'Junho' },
  { valor: 7, rotulo: 'Julho' },
  { valor: 8, rotulo: 'Agosto' },
  { valor: 9, rotulo: 'Setembro' },
  { valor: 10, rotulo: 'Outubro' },
  { valor: 11, rotulo: 'Novembro' },
  { valor: 12, rotulo: 'Dezembro' },
]

export default function ExportarXmlsPage() {
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresa()
  const { administrador } = usePermissoes()

  const dataAtual = new Date()
  const [mesSelecionado, setMesSelecionado] = useState<number>(dataAtual.getMonth() + 1)
  const [anoSelecionado, setAnoSelecionado] = useState<number>(dataAtual.getFullYear())
  const [empresaSelecionadaId, setEmpresaSelecionadaId] = useState<string>('')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [carregandoEmpresas, setCarregandoEmpresas] = useState<boolean>(false)
  const [gerando, setGerando] = useState<boolean>(false)
  const [resultadoUltimo, setResultadoUltimo] = useState<{
    nomeArquivo: string
    totais: {
      nfe_autorizadas: number
      nfce_autorizadas: number
      nfe_canceladas: number
      nfce_canceladas: number
      cartas_correcao: number
      inutilizacoes: number
      entradas: number
      total_arquivos: number
    }
  } | null>(null)

  // Lista de anos disponíveis (últimos 5 anos até o ano atual)
  const anosDisponiveis = Array.from({ length: 6 }, (_, i) => dataAtual.getFullYear() - i)

  // Inicializar com empresa ativa
  useEffect(() => {
    if (empresaAtiva?.id && !empresaSelecionadaId) {
      setEmpresaSelecionadaId(empresaAtiva.id)
    }
  }, [empresaAtiva?.id, empresaSelecionadaId])

  // Carregar lista de empresas se for administrador
  useEffect(() => {
    let montado = true
    const buscar = async () => {
      try {
        setCarregandoEmpresas(true)
        const lista = await listarEmpresas(true)
        if (montado) {
          setEmpresas(lista)
        }
      } catch (err) {
        console.error('Erro ao carregar empresas para export:', err)
      } finally {
        if (montado) {
          setCarregandoEmpresas(false)
        }
      }
    }
    buscar()
    return () => {
      montado = false
    }
  }, [])

  const handleExportar = async () => {
    const empId = empresaSelecionadaId || empresaAtiva?.id
    if (!empId) {
      toast({
        title: 'Selecione uma empresa',
        description: 'É necessário selecionar a empresa emitente para exportar os XMLs.',
        variant: 'destructive',
      })
      return
    }

    try {
      setGerando(true)
      setResultadoUltimo(null)

      const res = await exportarXmlsFiscais({
        empresa_id: empId,
        mes: mesSelecionado,
        ano: anoSelecionado,
      })

      if (!res.sucesso || !res.zip_base64) {
        toast({
          title: 'Erro ao gerar arquivo ZIP',
          description: res.message || 'Não foi possível gerar os XMLs para o período selecionado.',
          variant: 'destructive',
        })
        return
      }

      // Baixar arquivo no navegador
      const byteCharacters = atob(res.zip_base64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)

      const nomeFinal = res.nome_arquivo || `XMLs_${anoSelecionado}_${mesSelecionado}.zip`
      const a = document.createElement('a')
      a.href = url
      a.download = nomeFinal
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      if (res.totais) {
        setResultadoUltimo({
          nomeArquivo: nomeFinal,
          totais: res.totais,
        })
      }

      toast({
        title: 'Download iniciado',
        description: `Arquivo ${nomeFinal} gerado com sucesso.`,
      })
    } catch (err: any) {
      console.error('Falha ao exportar XMLs:', err)
      toast({
        title: 'Falha na exportação',
        description:
          err?.response?.message ||
          err?.data?.message ||
          err?.message ||
          'Erro ao processar a exportação de arquivos fiscais.',
        variant: 'destructive',
      })
    } finally {
      setGerando(false)
    }
  }

  const nomeMesSelecionado =
    MESES.find((m) => m.valor === mesSelecionado)?.rotulo || String(mesSelecionado)

  const empresaExibida =
    empresas.find((e) => e.id === (empresaSelecionadaId || empresaAtiva?.id)) || empresaAtiva

  return (
    <PermissaoGuard modulo="notas_saida" acao="ver">
      <div className="space-y-6 pb-12 max-w-5xl mx-auto">
        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <FileArchive className="h-7 w-7 text-primary" />
              Exportar XMLs Fiscais
            </h1>
            <p className="text-sm text-slate-500">
              Gere e baixe em lote o arquivo ZIP com todos os documentos fiscais do mês para envio à
              contabilidade.
            </p>
          </div>
        </div>

        {/* Lembrete legal de 5 anos obrigatório */}
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 shadow-xs">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          <AlertTitle className="font-semibold text-amber-950 flex items-center gap-2">
            Guarda Obrigatória dos Documentos Fiscais
          </AlertTitle>
          <AlertDescription className="text-xs text-amber-800 leading-relaxed mt-1">
            <strong className="text-amber-950">O XML deve ser guardado por 5 anos.</strong> De
            acordo com a legislação tributária vigente (Ajuste SINIEF 07/05), o contribuinte
            emitente e o destinatário são obrigados a manter em arquivo digital os XMLs das notas
            fiscais autorizadas e seus eventos pelo prazo decadencial de 5 anos para eventual
            fiscalização.
          </AlertDescription>
        </Alert>

        {/* Painel de Configuração da Exportação */}
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-4">
            <CardTitle className="text-base text-slate-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-slate-500" />
              Parâmetros da Exportação
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Escolha a empresa e o período contábil desejado para gerar o pacote ZIP.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Seleção de Empresa */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  Empresa Emitente
                </label>
                {administrador ? (
                  <Select
                    value={empresaSelecionadaId || empresaAtiva?.id || ''}
                    onValueChange={(val) => setEmpresaSelecionadaId(val)}
                    disabled={gerando || carregandoEmpresas}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {empresas.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id} className="text-xs">
                          {emp.nome_fantasia || emp.razao_social}
                          {emp.cnpj ? ` (${emp.cnpj})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-xs font-medium text-slate-800 bg-slate-100 px-3 py-2 rounded-md border border-slate-200 truncate">
                    {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Empresa Ativa'}
                  </div>
                )}
                <span className="text-[11px] text-slate-400">
                  {administrador
                    ? 'Administrador: pode alternar qualquer empresa'
                    : 'Exportando da sua empresa ativa'}
                </span>
              </div>

              {/* Mês */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Mês de Competência</label>
                <Select
                  value={String(mesSelecionado)}
                  onValueChange={(val) => setMesSelecionado(parseInt(val, 10))}
                  disabled={gerando}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m.valor} value={String(m.valor)} className="text-xs">
                        {m.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-slate-400">Mês da emissão ou registro</span>
              </div>

              {/* Ano */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Ano</label>
                <Select
                  value={String(anoSelecionado)}
                  onValueChange={(val) => setAnoSelecionado(parseInt(val, 10))}
                  disabled={gerando}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder="Selecione o ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map((ano) => (
                      <SelectItem key={ano} value={String(ano)} className="text-xs">
                        {ano}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-slate-400">Ano da competência fiscal</span>
              </div>
            </div>

            {/* Conteúdo empacotado no ZIP */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <FolderArchive className="h-4 w-4 text-blue-600" />
                Estrutura do pacote ZIP gerado:
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-800">saida/nfe_autorizadas/</strong>
                    <p className="text-[11px] text-slate-500">
                      XMLs autorizados de NF-e (modelo 55) emitidas no mês.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-800">saida/nfce_autorizadas/</strong>
                    <p className="text-[11px] text-slate-500">
                      XMLs autorizados de NFC-e (modelo 65) do PDV.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-800">
                      saida/nfe_canceladas/ & nfce_canceladas/
                    </strong>
                    <p className="text-[11px] text-slate-500">
                      XMLs de protocolo de cancelamento das notas homologadas.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-800">cartas_correcao/</strong>
                    <p className="text-[11px] text-slate-500">
                      XMLs das Cartas de Correção Eletrônica (CC-e) emitidas.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-800">inutilizacoes/</strong>
                    <p className="text-[11px] text-slate-500">
                      XMLs dos pedidos de inutilização homologados na SEFAZ.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-800">entradas/</strong>
                    <p className="text-[11px] text-slate-500">
                      XMLs das notas fiscais de compra/entrada importadas.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 sm:col-span-2">
                  <div className="w-2 h-2 rounded-full bg-violet-600 mt-1.5 flex-shrink-0" />
                  <div>
                    <strong className="text-slate-800 flex items-center gap-1">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-violet-600" />
                      resumo_documentos_{anoSelecionado}_
                      {mesSelecionado < 10 ? '0' + mesSelecionado : mesSelecionado}.csv
                    </strong>
                    <p className="text-[11px] text-slate-500">
                      Planilha resumo com Modelo, Série, Número, Chave, Data,
                      Destinatário/Fornecedor, Valor e Status.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Botão de Ação */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-xs text-slate-500">
                Competência:{' '}
                <strong className="text-slate-800">
                  {nomeMesSelecionado} / {anoSelecionado}
                </strong>{' '}
                — Empresa:{' '}
                <strong className="text-slate-800">
                  {empresaExibida?.nome_fantasia || empresaExibida?.razao_social || 'Selecionada'}
                </strong>
              </div>

              <Button
                onClick={handleExportar}
                disabled={gerando}
                className="w-full sm:w-auto gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-xs"
              >
                {gerando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Montando ZIP e baixando...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Gerar e Baixar ZIP
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Resumo do último download realizado */}
        {resultadoUltimo && (
          <Card className="border-emerald-200 bg-emerald-50/40 shadow-xs animate-in fade-in-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Exportação Concluída com Sucesso
              </CardTitle>
              <CardDescription className="text-xs text-emerald-800">
                Arquivo <strong>{resultadoUltimo.nomeArquivo}</strong> pronto para ser encaminhado à
                contabilidade.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-2.5 rounded-md border border-emerald-100 shadow-2xs">
                  <span className="text-slate-500 block">NF-e Saída (Aut.)</span>
                  <span className="text-base font-bold text-slate-800">
                    {resultadoUltimo.totais.nfe_autorizadas}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-md border border-emerald-100 shadow-2xs">
                  <span className="text-slate-500 block">NFC-e Saída (Aut.)</span>
                  <span className="text-base font-bold text-slate-800">
                    {resultadoUltimo.totais.nfce_autorizadas}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-md border border-emerald-100 shadow-2xs">
                  <span className="text-slate-500 block">Cancelamentos</span>
                  <span className="text-base font-bold text-slate-800">
                    {resultadoUltimo.totais.nfe_canceladas + resultadoUltimo.totais.nfce_canceladas}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-md border border-emerald-100 shadow-2xs">
                  <span className="text-slate-500 block">Cartas de Correção</span>
                  <span className="text-base font-bold text-slate-800">
                    {resultadoUltimo.totais.cartas_correcao}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-md border border-emerald-100 shadow-2xs">
                  <span className="text-slate-500 block">Inutilizações</span>
                  <span className="text-base font-bold text-slate-800">
                    {resultadoUltimo.totais.inutilizacoes}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-md border border-emerald-100 shadow-2xs">
                  <span className="text-slate-500 block">Notas de Entrada</span>
                  <span className="text-base font-bold text-slate-800">
                    {resultadoUltimo.totais.entradas}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-md border border-emerald-100 shadow-2xs sm:col-span-2">
                  <span className="text-slate-500 block">Total de Arquivos no ZIP</span>
                  <span className="text-base font-bold text-emerald-700">
                    {resultadoUltimo.totais.total_arquivos} arquivos (incluindo CSV)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PermissaoGuard>
  )
}
