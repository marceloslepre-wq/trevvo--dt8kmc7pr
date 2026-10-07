import { useState, useEffect, useRef } from 'react'
import { PermissaoGuard } from '@/components/PermissaoGuard'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import {
  RegraFiscalNcm,
  listarRegrasNcm,
  salvarRegraNcm,
  inativarRegraNcm,
} from '@/services/regrasNcm'
import { listarTodosPerfisAtivos, PerfilTributario } from '@/services/perfisTributarios'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Plus,
  FileDown,
  FileUp,
  Edit2,
  Trash2,
  Sparkles,
  Loader2,
  BookOpen,
} from 'lucide-react'

export function RegrasFiscaisNcmPage() {
  const { podeGravar } = usePermissoes()
  const { toast } = useToast()

  const [regras, setRegras] = useState<RegraFiscalNcm[]>([])
  const [totalRegras, setTotalRegras] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [pagina, setPagina] = useState(1)
  const [perfis, setPerfis] = useState<PerfilTributario[]>([])

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroUf, setFiltroUf] = useState('todas')
  const [filtroRegime, setFiltroRegime] = useState('todos')

  // Modal formulário
  const [modalAberto, setModalAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [regraEdicao, setRegraEdicao] = useState<Partial<RegraFiscalNcm> | null>(null)

  // Referência do input de arquivo para importação CSV
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    carregarPerfis()
  }, [])

  useEffect(() => {
    carregarRegras()
  }, [busca, filtroUf, filtroRegime, pagina])

  async function carregarPerfis() {
    try {
      const lista = await listarTodosPerfisAtivos()
      setPerfis(lista)
    } catch {
      // continua
    }
  }

  async function carregarRegras() {
    setCarregando(true)
    try {
      const res = await listarRegrasNcm({
        busca,
        uf: filtroUf,
        regime: filtroRegime,
        page: pagina,
        perPage: 15,
      })
      setRegras(res.items)
      setTotalRegras(res.totalItems)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar regras fiscais',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  function abrirNovaRegra() {
    setRegraEdicao({
      ncm_prefixo: '',
      cest: '',
      uf: 'ES',
      regime_empresa: 'Todos',
      perfil_tributario_id: perfis.length > 0 ? perfis[0].id : '',
      sujeito_st: false,
      monofasico_pis_cofins: false,
      natureza_receita_pis_cofins: '',
      observacao: '',
      prioridade: 1,
      ativo: true,
    })
    setModalAberto(true)
  }

  function abrirEdicaoRegra(r: RegraFiscalNcm) {
    setRegraEdicao({
      id: r.id,
      ncm_prefixo: r.ncm_prefixo,
      cest: r.cest || '',
      uf: r.uf || 'ES',
      regime_empresa: r.regime_empresa,
      perfil_tributario_id: r.perfil_tributario_id,
      sujeito_st: !!r.sujeito_st,
      monofasico_pis_cofins: !!r.monofasico_pis_cofins,
      natureza_receita_pis_cofins: r.natureza_receita_pis_cofins || '',
      observacao: r.observacao || '',
      prioridade: r.prioridade ?? 1,
      ativo: r.ativo,
    })
    setModalAberto(true)
  }

  async function handleSalvarRegra() {
    if (!regraEdicao) return
    if (!regraEdicao.ncm_prefixo || regraEdicao.ncm_prefixo.replace(/\D/g, '').length < 2) {
      toast({
        title: 'Prefixo de NCM inválido',
        description: 'Informe pelo menos os 2 primeiros dígitos do NCM.',
        variant: 'destructive',
      })
      return
    }

    if (!regraEdicao.perfil_tributario_id) {
      toast({
        title: 'Perfil tributário obrigatório',
        description: 'Selecione um perfil tributário associado a esta regra.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      await salvarRegraNcm(regraEdicao)
      toast({
        title: 'Regra salva com sucesso',
        description: `Regra para o prefixo ${regraEdicao.ncm_prefixo} gravada.`,
      })
      setModalAberto(false)
      carregarRegras()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar regra',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir(r: RegraFiscalNcm) {
    if (!confirm(`Deseja inativar a regra fiscal do NCM ${r.ncm_prefixo}?`)) return
    try {
      await inativarRegraNcm(r.id)
      toast({ title: 'Regra inativada com sucesso' })
      carregarRegras()
    } catch (err: any) {
      toast({
        title: 'Erro ao inativar regra',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  function handleExportarCsv() {
    if (regras.length === 0) {
      toast({ title: 'Nenhuma regra para exportar', variant: 'destructive' })
      return
    }

    const colunas = [
      'ncm_prefixo',
      'cest',
      'uf',
      'regime_empresa',
      'perfil_nome',
      'sujeito_st',
      'monofasico',
      'natureza_receita',
      'observacao',
    ]

    const linhas = regras.map((r) => {
      const perfilNome = r.expand?.perfil_tributario_id?.nome || ''
      return [
        r.ncm_prefixo,
        r.cest || '',
        r.uf || 'ES',
        r.regime_empresa,
        `"${perfilNome.replace(/"/g, '""')}"`,
        r.sujeito_st ? 'SIM' : 'NAO',
        r.monofasico_pis_cofins ? 'SIM' : 'NAO',
        r.natureza_receita_pis_cofins || '',
        `"${(r.observacao || '').replace(/"/g, '""')}"`,
      ].join(';')
    })

    const conteudoCsv = [colunas.join(';'), ...linhas].join('\r\n')
    const blob = new Blob(['\uFEFF' + conteudoCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `regras_fiscais_ncm_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportarCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return

    const leitor = new FileReader()
    leitor.onload = async (evento) => {
      const texto = evento.target?.result as string
      if (!texto) return

      const linhas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0)
      if (linhas.length <= 1) {
        toast({ title: 'Arquivo vazio ou sem registros', variant: 'destructive' })
        return
      }

      let sucesso = 0
      let erros = 0

      for (let i = 1; i < linhas.length; i++) {
        const cols = linhas[i].split(';').map((c) => c.trim().replace(/^"|"$/g, ''))
        if (cols.length < 5) continue

        const [
          ncm_prefixo,
          cest,
          uf,
          regime_empresa,
          perfil_nome,
          sujeito_st,
          monofasico,
          natureza_receita,
          observacao,
        ] = cols

        // Acha perfil por nome
        const perfilEncontrado = perfis.find(
          (p) => p.nome.toLowerCase() === (perfil_nome || '').toLowerCase(),
        )

        if (!perfilEncontrado) {
          erros++
          continue
        }

        try {
          await salvarRegraNcm({
            ncm_prefixo: ncm_prefixo.replace(/\D/g, ''),
            cest: cest ? cest.replace(/\D/g, '') : '',
            uf: uf || 'ES',
            regime_empresa: (regime_empresa as any) || 'Todos',
            perfil_tributario_id: perfilEncontrado.id,
            sujeito_st: sujeito_st?.toUpperCase() === 'SIM',
            monofasico_pis_cofins: monofasico?.toUpperCase() === 'SIM',
            natureza_receita_pis_cofins: natureza_receita || '',
            observacao: observacao || '',
            prioridade: 1,
            ativo: true,
          })
          sucesso++
        } catch {
          erros++
        }
      }

      toast({
        title: 'Importação concluída',
        description: `${sucesso} regras importadas com sucesso.${erros > 0 ? ` ${erros} falharam (verifique se os perfis tributários já existem).` : ''}`,
      })
      carregarRegras()
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    leitor.readAsText(arquivo, 'UTF-8')
  }

  return (
    <PermissaoGuard modulo="tabelas_fiscais" acao="visualizar">
      <div className="space-y-6 p-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              Regras Fiscais por NCM
            </h1>
            <p className="text-sm text-muted-foreground">
              Ensine o motor tributário: regras automáticas por prefixo de NCM, UF e regime
              tributário
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              className="hidden"
              onChange={handleImportarCsv}
            />
            {podeGravar('tabelas_fiscais') && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-4 w-4" />
                Importar CSV
              </Button>
            )}

            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportarCsv}>
              <FileDown className="h-4 w-4" />
              Exportar CSV
            </Button>

            {podeGravar('tabelas_fiscais') && (
              <Button size="sm" className="gap-1.5" onClick={abrirNovaRegra}>
                <Plus className="h-4 w-4" />
                Nova Regra
              </Button>
            )}
          </div>
        </div>

        {/* Barra de Filtros */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por prefixo NCM, CEST ou observação..."
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
              className="pl-9"
            />
          </div>

          <div className="w-full sm:w-44">
            <Select
              value={filtroUf}
              onValueChange={(val) => {
                setFiltroUf(val)
                setPagina(1)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por UF" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as UFs</SelectItem>
                <SelectItem value="ES">ES - Espírito Santo</SelectItem>
                <SelectItem value="SP">SP - São Paulo</SelectItem>
                <SelectItem value="RJ">RJ - Rio de Janeiro</SelectItem>
                <SelectItem value="MG">MG - Minas Gerais</SelectItem>
                <SelectItem value="BR">Nacional (BR)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-52">
            <Select
              value={filtroRegime}
              onValueChange={(val) => {
                setFiltroRegime(val)
                setPagina(1)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Regime da Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Regimes</SelectItem>
                <SelectItem value="Simples Nacional">Simples Nacional</SelectItem>
                <SelectItem value="Regime Normal">Regime Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabela de Regras */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Prefixo NCM</TableHead>
                  <TableHead className="w-24">CEST</TableHead>
                  <TableHead className="w-16">UF</TableHead>
                  <TableHead className="w-36">Regime</TableHead>
                  <TableHead>Perfil Tributário Vinculado</TableHead>
                  <TableHead className="text-center w-20">ST</TableHead>
                  <TableHead className="text-center w-24">Monofásico</TableHead>
                  <TableHead className="w-20 text-center">Prioridade</TableHead>
                  <TableHead className="text-right w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                      Carregando regras fiscais...
                    </TableCell>
                  </TableRow>
                ) : regras.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhuma regra fiscal cadastrada. Crie uma regra para que o motor fiscal sugira
                      automaticamente com alta confiança.
                    </TableCell>
                  </TableRow>
                ) : (
                  regras.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono font-semibold text-primary">
                        {r.ncm_prefixo}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.cest || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.uf || 'ES'}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.regime_empresa}</TableCell>
                      <TableCell>
                        <span className="font-medium text-sm">
                          {r.expand?.perfil_tributario_id?.nome || '—'}
                        </span>
                        {r.observacao && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">
                            {r.observacao}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.sujeito_st ? (
                          <Badge className="bg-amber-500 hover:bg-amber-600">ST</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.monofasico_pis_cofins ? (
                          <Badge variant="secondary">Monofásico</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {r.prioridade ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => abrirEdicaoRegra(r)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          {podeGravar('tabelas_fiscais') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleExcluir(r)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Modal de Cadastro / Edição */}
        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {regraEdicao?.id ? 'Editar Regra Fiscal por NCM' : 'Nova Regra Fiscal por NCM'}
              </DialogTitle>
              <DialogDescription>
                Configure as condições para que o motor fiscal atribua o perfil tributário correto.
                Em conflitos, o prefixo mais longo vence; em empate, a maior prioridade.
              </DialogDescription>
            </DialogHeader>

            {regraEdicao && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="regra_ncm">Prefixo NCM (2 a 8 dígitos) *</Label>
                    <Input
                      id="regra_ncm"
                      placeholder="Ex: 8471 ou 84"
                      value={regraEdicao.ncm_prefixo || ''}
                      onChange={(e) =>
                        setRegraEdicao({ ...regraEdicao, ncm_prefixo: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="regra_cest">CEST (Opcional)</Label>
                    <Input
                      id="regra_cest"
                      placeholder="Ex: 2105300"
                      value={regraEdicao.cest || ''}
                      onChange={(e) => setRegraEdicao({ ...regraEdicao, cest: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="regra_uf">UF de Aplicação</Label>
                    <Input
                      id="regra_uf"
                      placeholder="Ex: ES"
                      maxLength={2}
                      value={regraEdicao.uf || 'ES'}
                      onChange={(e) =>
                        setRegraEdicao({ ...regraEdicao, uf: e.target.value.toUpperCase() })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="regra_regime">Regime da Empresa</Label>
                    <Select
                      value={regraEdicao.regime_empresa || 'Todos'}
                      onValueChange={(val: any) =>
                        setRegraEdicao({ ...regraEdicao, regime_empresa: val })
                      }
                    >
                      <SelectTrigger id="regra_regime">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Todos">Todos os Regimes</SelectItem>
                        <SelectItem value="Simples Nacional">Simples Nacional</SelectItem>
                        <SelectItem value="Regime Normal">Regime Normal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="regra_prioridade">Prioridade de Desempate</Label>
                    <Input
                      id="regra_prioridade"
                      type="number"
                      value={regraEdicao.prioridade ?? 1}
                      onChange={(e) =>
                        setRegraEdicao({
                          ...regraEdicao,
                          prioridade: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="regra_perfil">Perfil Tributário Obrigatório *</Label>
                  <Select
                    value={regraEdicao.perfil_tributario_id || ''}
                    onValueChange={(val) =>
                      setRegraEdicao({ ...regraEdicao, perfil_tributario_id: val })
                    }
                  >
                    <SelectTrigger id="regra_perfil">
                      <SelectValue placeholder="Selecione o perfil que dita CST, CFOP e alíquotas" />
                    </SelectTrigger>
                    <SelectContent>
                      {perfis.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} ({p.regime})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4 border p-3 rounded-lg bg-muted/20">
                  <div className="flex items-center justify-between pr-2">
                    <Label htmlFor="sujeito_st" className="text-xs cursor-pointer">
                      Sujeito a Substituição Tributária (ST)
                    </Label>
                    <Switch
                      id="sujeito_st"
                      checked={!!regraEdicao.sujeito_st}
                      onCheckedChange={(val) => setRegraEdicao({ ...regraEdicao, sujeito_st: val })}
                    />
                  </div>

                  <div className="flex items-center justify-between pl-2 border-l">
                    <Label htmlFor="monofasico" className="text-xs cursor-pointer">
                      Monofásico de PIS/COFINS
                    </Label>
                    <Switch
                      id="monofasico"
                      checked={!!regraEdicao.monofasico_pis_cofins}
                      onCheckedChange={(val) =>
                        setRegraEdicao({ ...regraEdicao, monofasico_pis_cofins: val })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nat_receita">Natureza da Receita de PIS/COFINS (Opcional)</Label>
                  <Input
                    id="nat_receita"
                    placeholder="Ex: 101, 102..."
                    value={regraEdicao.natureza_receita_pis_cofins || ''}
                    onChange={(e) =>
                      setRegraEdicao({
                        ...regraEdicao,
                        natureza_receita_pis_cofins: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="regra_obs">Observação / Instrução do Contador</Label>
                  <Input
                    id="regra_obs"
                    placeholder="Ex: Lei estadual X / Convênio ICMS Y"
                    value={regraEdicao.observacao || ''}
                    onChange={(e) => setRegraEdicao({ ...regraEdicao, observacao: e.target.value })}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setModalAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSalvarRegra} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar Regra
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissaoGuard>
  )
}
export default RegrasFiscaisNcmPage
