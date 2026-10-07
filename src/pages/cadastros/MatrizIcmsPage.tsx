import { useState, useEffect, useRef } from 'react'
import { PermissaoGuard } from '@/components/PermissaoGuard'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useToast } from '@/hooks/use-toast'
import {
  TODAS_UFS,
  IcmsAliquotaUf,
  IcmsInterestadual,
  listarAliquotasUf,
  salvarAliquotaUf,
  listarMatrizInterestadual,
  salvarParInterestadual,
} from '@/services/icmsMatriz'
import { obterConfigFiscalEmpresa } from '@/services/configFiscal'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Grid,
  FileDown,
  FileUp,
  Edit2,
  AlertTriangle,
  Loader2,
  Table2,
  Percent,
} from 'lucide-react'

export function MatrizIcmsPage() {
  const { podeGravar } = usePermissoes()
  const { empresaAtiva } = useEmpresaAtiva()
  const { toast } = useToast()

  const [abaAtiva, setAbaAtiva] = useState<'grade' | 'ufs'>('grade')
  const [carregando, setCarregando] = useState(true)

  // Alíquotas por UF (icms_aliquotas_uf)
  const [aliquotasUf, setAliquotasUf] = useState<IcmsAliquotaUf[]>([])
  const [modalUfAberto, setModalUfAberto] = useState(false)
  const [ufEdicao, setUfEdicao] = useState<Partial<IcmsAliquotaUf> | null>(null)
  const [salvandoUf, setSalvandoUf] = useState(false)

  // Matriz Interestadual (icms_interestadual)
  const [paresInterestaduais, setParesInterestaduais] = useState<IcmsInterestadual[]>([])
  const [matrizMap, setMatrizMap] = useState<Record<string, number>>({})
  const [modalParAberto, setModalParAberto] = useState(false)
  const [parEdicao, setParEdicao] = useState<{
    uf_origem: string
    uf_destino: string
    aliquota: number
  } | null>(null)
  const [salvandoPar, setSalvandoPar] = useState(false)

  // Comparação com config_fiscal_empresa do ES
  const [aliqInternaConfigEmpresa, setAliqInternaConfigEmpresa] = useState<number | null>(null)

  const fileInputUfRef = useRef<HTMLInputElement>(null)
  const fileInputInterRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    carregarTudo()
  }, [empresaAtiva?.id])

  async function carregarTudo() {
    setCarregando(true)
    try {
      const [listaUfs, listaInter, configFiscal] = await Promise.all([
        listarAliquotasUf(),
        listarMatrizInterestadual(),
        empresaAtiva?.id ? obterConfigFiscalEmpresa(empresaAtiva.id) : null,
      ])

      setAliquotasUf(listaUfs)
      setParesInterestaduais(listaInter)

      const mapa: Record<string, number> = {}
      listaInter.forEach((p) => {
        mapa[`${p.uf_origem}_${p.uf_destino}`] = p.aliquota
      })
      setMatrizMap(mapa)

      if (configFiscal?.aliquota_icms_interna_padrao !== undefined) {
        setAliqInternaConfigEmpresa(configFiscal.aliquota_icms_interna_padrao)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar matriz de ICMS',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  // ========================================================
  // UFs (Alíquotas Internas)
  // ========================================================
  function abrirEdicaoUf(uf: string) {
    const achada = aliquotasUf.find((u) => u.uf.toUpperCase() === uf.toUpperCase())
    setUfEdicao({
      uf: uf.toUpperCase(),
      aliquota_interna: achada?.aliquota_interna ?? 17,
      aliquota_fcp: achada?.aliquota_fcp ?? 0,
      vigencia_inicio: achada?.vigencia_inicio ?? '',
      observacao: achada?.observacao ?? '',
    })
    setModalUfAberto(true)
  }

  async function handleSalvarUf() {
    if (!ufEdicao || !ufEdicao.uf) return
    setSalvandoUf(true)
    try {
      await salvarAliquotaUf({
        uf: ufEdicao.uf,
        aliquota_interna: Number(ufEdicao.aliquota_interna || 0),
        aliquota_fcp: Number(ufEdicao.aliquota_fcp || 0),
        vigencia_inicio: ufEdicao.vigencia_inicio || '',
        observacao: ufEdicao.observacao || '',
      })
      toast({ title: `Alíquota da UF ${ufEdicao.uf} salva com sucesso.` })
      setModalUfAberto(false)
      carregarTudo()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar alíquota da UF',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSalvandoUf(false)
    }
  }

  function handleExportarCsvUfs() {
    const cabecalho = 'uf;aliquota_interna;aliquota_fcp;vigencia_inicio;observacao'
    const linhas = TODAS_UFS.map((uf) => {
      const achada = aliquotasUf.find((u) => u.uf.toUpperCase() === uf)
      return [
        uf,
        achada?.aliquota_interna ?? '',
        achada?.aliquota_fcp ?? '',
        achada?.vigencia_inicio ?? '',
        `"${(achada?.observacao || '').replace(/"/g, '""')}"`,
      ].join(';')
    })
    const csv = [cabecalho, ...linhas].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `icms_aliquotas_uf_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportarCsvUfs(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    const leitor = new FileReader()
    leitor.onload = async (evento) => {
      const texto = evento.target?.result as string
      if (!texto) return
      const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0)
      let cont = 0
      for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(';').map((c) => c.trim().replace(/^"|"$/g, ''))
        if (cols.length >= 2 && cols[0]) {
          const uf = cols[0].toUpperCase()
          const interna = parseFloat(cols[1].replace(',', '.'))
          if (!isNaN(interna)) {
            const fcp = cols[2] ? parseFloat(cols[2].replace(',', '.')) : 0
            await salvarAliquotaUf({
              uf,
              aliquota_interna: interna,
              aliquota_fcp: isNaN(fcp) ? 0 : fcp,
              vigencia_inicio: cols[3] || '',
              observacao: cols[4] || '',
            })
            cont++
          }
        }
      }
      toast({ title: 'Importação concluída', description: `${cont} UFs atualizadas.` })
      carregarTudo()
      if (fileInputUfRef.current) fileInputUfRef.current.value = ''
    }
    leitor.readAsText(arquivo, 'UTF-8')
  }

  // ========================================================
  // Matriz Interestadual
  // ========================================================
  function abrirEdicaoPar(orig: string, dest: string) {
    const chave = `${orig}_${dest}`
    const atual = matrizMap[chave] ?? 12
    setParEdicao({
      uf_origem: orig,
      uf_destino: dest,
      aliquota: atual,
    })
    setModalParAberto(true)
  }

  async function handleSalvarPar() {
    if (!parEdicao) return
    setSalvandoPar(true)
    try {
      await salvarParInterestadual(
        parEdicao.uf_origem,
        parEdicao.uf_destino,
        Number(parEdicao.aliquota),
      )
      toast({
        title: `Alíquota ${parEdicao.uf_origem} -> ${parEdicao.uf_destino} atualizada para ${parEdicao.aliquota}%.`,
      })
      setModalParAberto(false)
      carregarTudo()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar alíquota interestadual',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSalvandoPar(false)
    }
  }

  function handleExportarCsvMatriz() {
    const cabecalho = 'uf_origem;uf_destino;aliquota'
    const linhas: string[] = []
    TODAS_UFS.forEach((orig) => {
      TODAS_UFS.forEach((dest) => {
        if (orig !== dest) {
          const aliq = matrizMap[`${orig}_${dest}`] ?? 12
          linhas.push(`${orig};${dest};${aliq}`)
        }
      })
    })
    const csv = [cabecalho, ...linhas].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `icms_interestadual_matriz_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportarCsvMatriz(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    const leitor = new FileReader()
    leitor.onload = async (evento) => {
      const texto = evento.target?.result as string
      if (!texto) return
      const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0)
      let cont = 0
      for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(';').map((c) => c.trim())
        if (cols.length >= 3) {
          const orig = cols[0].toUpperCase()
          const dest = cols[1].toUpperCase()
          const aliq = parseFloat(cols[2].replace(',', '.'))
          if (orig && dest && !isNaN(aliq) && orig !== dest) {
            await salvarParInterestadual(orig, dest, aliq)
            cont++
          }
        }
      }
      toast({
        title: 'Importação concluída',
        description: `${cont} pares interestaduais atualizados.`,
      })
      carregarTudo()
      if (fileInputInterRef.current) fileInputInterRef.current.value = ''
    }
    leitor.readAsText(arquivo, 'UTF-8')
  }

  // Validação ES na tabela de UFs x configuração fiscal
  const esRec = aliquotasUf.find((u) => u.uf.toUpperCase() === 'ES')
  const esDivergente =
    esRec &&
    aliqInternaConfigEmpresa !== null &&
    esRec.aliquota_interna !== aliqInternaConfigEmpresa

  return (
    <PermissaoGuard modulo="tabelas_fiscais" acao="visualizar">
      <div className="space-y-6 p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Grid className="h-6 w-6 text-primary" />
              Matriz de ICMS Interestadual e Alíquotas por UF
            </h1>
            <p className="text-sm text-muted-foreground">
              Tabela de alíquotas interestaduais (Resolução 22/1989) e alíquotas internas das 27 UFs
            </p>
          </div>

          <div className="flex items-center gap-2">
            {abaAtiva === 'grade' ? (
              <>
                <input
                  type="file"
                  ref={fileInputInterRef}
                  accept=".csv"
                  className="hidden"
                  onChange={handleImportarCsvMatriz}
                />
                {podeGravar('tabelas_fiscais') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => fileInputInterRef.current?.click()}
                  >
                    <FileUp className="h-4 w-4" />
                    Importar Grade CSV
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleExportarCsvMatriz}
                >
                  <FileDown className="h-4 w-4" />
                  Exportar Grade CSV
                </Button>
              </>
            ) : (
              <>
                <input
                  type="file"
                  ref={fileInputUfRef}
                  accept=".csv"
                  className="hidden"
                  onChange={handleImportarCsvUfs}
                />
                {podeGravar('tabelas_fiscais') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => fileInputUfRef.current?.click()}
                  >
                    <FileUp className="h-4 w-4" />
                    Importar UFs CSV
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleExportarCsvUfs}
                >
                  <FileDown className="h-4 w-4" />
                  Exportar UFs CSV
                </Button>
              </>
            )}
          </div>
        </div>

        {esDivergente && (
          <Alert
            variant="destructive"
            className="border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <AlertTitle className="font-semibold">
              Incoerência Detectada na Alíquota do ES
            </AlertTitle>
            <AlertDescription className="text-xs">
              A alíquota interna cadastrada para o Espírito Santo ({esRec.aliquota_interna}%)
              diverge da alíquota padrão configurada na empresa ativa ({aliqInternaConfigEmpresa}%).
              Ajuste os dois valores para evitar cálculos inconsistentes de DIFAL e saídas.
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={abaAtiva} onValueChange={(val: any) => setAbaAtiva(val)}>
          <TabsList className="grid w-full sm:w-80 grid-cols-2">
            <TabsTrigger value="grade" className="gap-2">
              <Table2 className="h-4 w-4" />
              Grade Origem x Destino
            </TabsTrigger>
            <TabsTrigger value="ufs" className="gap-2">
              <Percent className="h-4 w-4" />
              Alíquotas Internas (27 UFs)
            </TabsTrigger>
          </TabsList>

          {/* ABA GRADE ORIGEM X DESTINO */}
          <TabsContent value="grade" className="space-y-4 pt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Grade Cruzada de Alíquotas Interestaduais (Res. Senado 22/1989)</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Clique em qualquer alíquota para editar o par específico
                  </span>
                </CardTitle>
                <CardDescription>
                  Linhas representam a UF de Origem e Colunas representam a UF de Destino. Diagonal
                  (mesma UF) exibe a alíquota interna ou traço.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {carregando ? (
                  <div className="py-12 flex justify-center items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    Carregando grade interestadual...
                  </div>
                ) : (
                  <Table className="text-xs border-collapse">
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-bold text-center w-14 border-r bg-muted">
                          Orig \ Dest
                        </TableHead>
                        {TODAS_UFS.map((dest) => (
                          <TableHead key={dest} className="font-bold text-center p-1.5 w-10">
                            {dest}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {TODAS_UFS.map((orig) => (
                        <TableRow key={orig} className="hover:bg-muted/30">
                          <TableCell className="font-bold text-center border-r bg-muted/40 p-1.5">
                            {orig}
                          </TableCell>
                          {TODAS_UFS.map((dest) => {
                            if (orig === dest) {
                              const interna = aliquotasUf.find(
                                (u) => u.uf.toUpperCase() === orig,
                              )?.aliquota_interna
                              return (
                                <TableCell
                                  key={dest}
                                  className="text-center p-1 bg-muted/20 text-muted-foreground font-mono text-[11px]"
                                  title={`Operação interna em ${orig} (${interna || 17}%)`}
                                >
                                  {interna ? `${interna}%` : '—'}
                                </TableCell>
                              )
                            }

                            const chave = `${orig}_${dest}`
                            const aliq = matrizMap[chave] ?? 12
                            const eh7 = aliq === 7
                            const eh4 = aliq === 4

                            return (
                              <TableCell
                                key={dest}
                                onClick={() =>
                                  podeGravar('tabelas_fiscais') && abrirEdicaoPar(orig, dest)
                                }
                                className={`text-center p-1 font-mono font-medium cursor-pointer transition-colors hover:bg-primary/20 ${
                                  eh7 ? 'text-amber-600 dark:text-amber-400 font-bold' : ''
                                } ${eh4 ? 'text-blue-600 dark:text-blue-400 font-bold' : ''}`}
                                title={`${orig} -> ${dest}: ${aliq}% (Clique para alterar)`}
                              >
                                {aliq}%
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA ALÍQUOTAS INTERNAS DAS 27 UFS */}
          <TabsContent value="ufs" className="space-y-4 pt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tabela de Alíquotas Internas por UF</CardTitle>
                <CardDescription>
                  Alíquotas internas de ICMS e FCP de cada Estado brasileiro. Sem valores fixos no
                  código.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">UF</TableHead>
                      <TableHead className="w-36">Alíquota Interna (%)</TableHead>
                      <TableHead className="w-32">FCP (%)</TableHead>
                      <TableHead className="w-36">Início Vigência</TableHead>
                      <TableHead>Observação</TableHead>
                      <TableHead className="text-right w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {TODAS_UFS.map((uf) => {
                      const item = aliquotasUf.find((u) => u.uf.toUpperCase() === uf)
                      return (
                        <TableRow key={uf}>
                          <TableCell className="font-bold text-primary">{uf}</TableCell>
                          <TableCell className="font-mono">
                            {item ? (
                              `${item.aliquota_interna}%`
                            ) : (
                              <span className="text-muted-foreground italic text-xs">
                                Não cadastrada
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {item && item.aliquota_fcp ? `${item.aliquota_fcp}%` : '0.00%'}
                          </TableCell>
                          <TableCell className="text-xs">{item?.vigencia_inicio || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-sm">
                            {item?.observacao || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {podeGravar('tabelas_fiscais') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1"
                                onClick={() => abrirEdicaoUf(uf)}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                Editar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal Editar UF */}
        <Dialog open={modalUfAberto} onOpenChange={setModalUfAberto}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Alíquota da UF: {ufEdicao?.uf}</DialogTitle>
              <DialogDescription>
                Informe a alíquota interna oficial e percentual de FCP deste Estado.
              </DialogDescription>
            </DialogHeader>

            {ufEdicao && (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="aliq_interna_uf">Alíquota Interna de ICMS (%) *</Label>
                  <Input
                    id="aliq_interna_uf"
                    type="number"
                    step="0.01"
                    value={ufEdicao.aliquota_interna ?? ''}
                    onChange={(e) =>
                      setUfEdicao({
                        ...ufEdicao,
                        aliquota_interna: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="aliq_fcp_uf">Alíquota de FCP (%) (Opcional)</Label>
                  <Input
                    id="aliq_fcp_uf"
                    type="number"
                    step="0.01"
                    value={ufEdicao.aliquota_fcp ?? ''}
                    onChange={(e) =>
                      setUfEdicao({ ...ufEdicao, aliquota_fcp: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="vig_uf">Início da Vigência</Label>
                  <Input
                    id="vig_uf"
                    type="date"
                    value={ufEdicao.vigencia_inicio || ''}
                    onChange={(e) => setUfEdicao({ ...ufEdicao, vigencia_inicio: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="obs_uf">Observação / Lei Estadual</Label>
                  <Input
                    id="obs_uf"
                    placeholder="Ex: Lei estadual 12.345/2023"
                    value={ufEdicao.observacao || ''}
                    onChange={(e) => setUfEdicao({ ...ufEdicao, observacao: e.target.value })}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setModalUfAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSalvarUf} disabled={salvandoUf}>
                {salvandoUf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar UF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Editar Par Interestadual */}
        <Dialog open={modalParAberto} onOpenChange={setModalParAberto}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                Alíquota {parEdicao?.uf_origem} ➔ {parEdicao?.uf_destino}
              </DialogTitle>
              <DialogDescription>
                Alterar a alíquota de ICMS interestadual entre estes dois Estados.
              </DialogDescription>
            </DialogHeader>

            {parEdicao && (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="aliq_par">Alíquota Interestadual (%)</Label>
                  <Input
                    id="aliq_par"
                    type="number"
                    step="0.01"
                    value={parEdicao.aliquota}
                    onChange={(e) =>
                      setParEdicao({ ...parEdicao, aliquota: parseFloat(e.target.value) || 0 })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Valores comuns da Resolução 22/1989: 7% (Sul/Sudeste para N/NE/CO/ES) e 12%
                    (demais). Produtos importados usam 4% automaticamente pela Resolução 13/2012.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setModalParAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSalvarPar} disabled={salvandoPar}>
                {salvandoPar ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Atualizar Alíquota
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissaoGuard>
  )
}
export default MatrizIcmsPage
