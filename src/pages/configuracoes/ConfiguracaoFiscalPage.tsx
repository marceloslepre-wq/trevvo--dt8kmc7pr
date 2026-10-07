import { useState, useEffect } from 'react'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { PermissaoGuard } from '@/components/PermissaoGuard'
import { useToast } from '@/hooks/use-toast'
import {
  ConfigFiscalEmpresa,
  obterConfigFiscalEmpresa,
  salvarConfigFiscalEmpresa,
} from '@/services/configFiscal'
import { obterAliquotaUf } from '@/services/icmsMatriz'
import {
  listarTodosGruposAtivos,
  listarCategoriasPorGrupo,
  Grupo,
  Categoria,
} from '@/services/gruposCategorias'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Settings2,
  Percent,
  Sparkles,
  ShoppingBag,
  AlertTriangle,
  Save,
  Loader2,
  HelpCircle,
} from 'lucide-react'

export function ConfiguracaoFiscalPage() {
  const { empresaAtiva } = useEmpresaAtiva()
  const { podeGravar } = usePermissoes()
  const { toast } = useToast()

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Campos do formulário
  const [aliquotaIcmsInterna, setAliquotaIcmsInterna] = useState<string>('')
  const [aliquotaFcp, setAliquotaFcp] = useState<string>('')
  const [csosnPadrao, setCsosnPadrao] = useState<'101' | '102'>('102')
  const [grupoPadraoId, setGrupoPadraoId] = useState<string>('')
  const [categoriaPadraoId, setCategoriaPadraoId] = useState<string>('')
  const [margemPadrao, setMargemPadrao] = useState<string>('')
  const [criarProdutosAuto, setCriarProdutosAuto] = useState<'Perguntar' | 'Sempre' | 'Nunca'>(
    'Perguntar',
  )
  const [aplicarSugestaoVazios, setAplicarSugestaoVazios] = useState<boolean>(true)

  // Dados auxiliares
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [aliquotaMatrizEs, setAliquotaMatrizEs] = useState<number | null>(null)

  const ehSimples =
    empresaAtiva?.regime_apuracao === 'Simples Nacional' ||
    empresaAtiva?.crt === 1 ||
    empresaAtiva?.crt === 2

  useEffect(() => {
    carregarDados()
  }, [empresaAtiva?.id])

  async function carregarDados() {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const [config, gruposList, esAliq] = await Promise.all([
        obterConfigFiscalEmpresa(empresaAtiva.id),
        listarTodosGruposAtivos(),
        obterAliquotaUf('ES'),
      ])

      setGrupos(gruposList)
      if (esAliq) {
        setAliquotaMatrizEs(esAliq.aliquota_interna)
      }

      if (config) {
        setAliquotaIcmsInterna(
          config.aliquota_icms_interna_padrao !== undefined &&
            config.aliquota_icms_interna_padrao !== null
            ? String(config.aliquota_icms_interna_padrao)
            : '',
        )
        setAliquotaFcp(
          config.aliquota_fcp_padrao !== undefined && config.aliquota_fcp_padrao !== null
            ? String(config.aliquota_fcp_padrao)
            : '',
        )
        setCsosnPadrao(config.csosn_padrao_tributado || '102')
        setGrupoPadraoId(config.grupo_padrao_id || '')
        setCategoriaPadraoId(config.categoria_padrao_id || '')
        setMargemPadrao(
          config.margem_padrao_percentual !== undefined && config.margem_padrao_percentual !== null
            ? String(config.margem_padrao_percentual)
            : '',
        )
        setCriarProdutosAuto(config.criar_produtos_automaticamente || 'Perguntar')
        setAplicarSugestaoVazios(
          config.aplicar_sugestao_fiscal_em_produtos_existentes_vazios !== undefined
            ? config.aplicar_sugestao_fiscal_em_produtos_existentes_vazios
            : true,
        )

        if (config.grupo_padrao_id) {
          const cats = await listarCategoriasPorGrupo(config.grupo_padrao_id)
          setCategorias(cats)
        }
      } else {
        // Defaults se não houver registro ainda
        setAliquotaIcmsInterna('')
        setAliquotaFcp('')
        setCsosnPadrao('102')
        setGrupoPadraoId('')
        setCategoriaPadraoId('')
        setMargemPadrao('')
        setCriarProdutosAuto('Perguntar')
        setAplicarSugestaoVazios(true)
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar configurações fiscais',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  async function handleGrupoChange(novoGrupoId: string) {
    setGrupoPadraoId(novoGrupoId)
    setCategoriaPadraoId('')
    if (novoGrupoId) {
      try {
        const cats = await listarCategoriasPorGrupo(novoGrupoId)
        setCategorias(cats)
      } catch {
        setCategorias([])
      }
    } else {
      setCategorias([])
    }
  }

  async function handleSalvar() {
    if (!empresaAtiva?.id) return

    setSalvando(true)
    try {
      const aliqIcmsNum = aliquotaIcmsInterna
        ? parseFloat(aliquotaIcmsInterna.replace(',', '.'))
        : undefined
      const aliqFcpNum = aliquotaFcp ? parseFloat(aliquotaFcp.replace(',', '.')) : undefined
      const margemNum = margemPadrao ? parseFloat(margemPadrao.replace(',', '.')) : undefined

      await salvarConfigFiscalEmpresa(empresaAtiva.id, {
        aliquota_icms_interna_padrao: aliqIcmsNum,
        aliquota_fcp_padrao: aliqFcpNum,
        csosn_padrao_tributado: csosnPadrao,
        grupo_padrao_id: grupoPadraoId || undefined,
        categoria_padrao_id: categoriaPadraoId || undefined,
        margem_padrao_percentual: margemNum,
        criar_produtos_automaticamente: criarProdutosAuto,
        aplicar_sugestao_fiscal_em_produtos_existentes_vazios: aplicarSugestaoVazios,
      })

      toast({
        title: 'Configurações fiscais salvas com sucesso',
        description: 'As regras para sugestões e entradas de notas foram atualizadas.',
      })
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar configurações fiscais',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const difereMatrizEs =
    aliquotaMatrizEs !== null &&
    aliquotaIcmsInterna !== '' &&
    parseFloat(aliquotaIcmsInterna.replace(',', '.')) !== aliquotaMatrizEs

  return (
    <PermissaoGuard modulo="config_fiscal" acao="ver">
      <div className="space-y-6 p-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Settings2 className="h-6 w-6 text-primary" />
              Configurações Fiscais da Empresa
            </h1>
            <p className="text-sm text-muted-foreground">
              Parâmetros tributários e comportamento do motor fiscal para{' '}
              <span className="font-semibold text-foreground">
                {empresaAtiva?.razao_social || 'Empresa Ativa'}
              </span>
            </p>
          </div>

          {podeGravar('config_fiscal') && (
            <Button onClick={handleSalvar} disabled={salvando || carregando} className="gap-2">
              {salvando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar Alterações
            </Button>
          )}
        </div>

        {difereMatrizEs && (
          <Alert
            variant="destructive"
            className="border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <AlertTitle className="font-semibold">Divergência com a Matriz de ICMS</AlertTitle>
            <AlertDescription className="text-xs">
              A alíquota interna informada ({aliquotaIcmsInterna}%) está diferente da alíquota
              cadastrada para o Espírito Santo na Matriz de Alíquotas por UF ({aliquotaMatrizEs}%).
              Verifique com seu contador para manter a coerência fiscal.
            </AlertDescription>
          </Alert>
        )}

        {carregando ? (
          <div className="py-12 flex justify-center items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Carregando parâmetros fiscais...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Alíquotas Padrão */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Percent className="h-4 w-4 text-primary" />
                  Alíquotas Padrão do Estado (ES)
                </CardTitle>
                <CardDescription>
                  Valores de referência para sugestões fiscais e cálculo do DIFAL
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="aliq_icms">Alíquota Interna de ICMS Padrão (%)</Label>
                  <Input
                    id="aliq_icms"
                    type="number"
                    step="0.01"
                    placeholder="Ex: 17 ou 20 (sem valor fixo no código)"
                    value={aliquotaIcmsInterna}
                    onChange={(e) => setAliquotaIcmsInterna(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilizada nas sugestões de saídas tributadas e no cálculo estimativo de DIFAL.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="aliq_fcp">Alíquota de FCP Padrão (%) (Opcional)</Label>
                  <Input
                    id="aliq_fcp"
                    type="number"
                    step="0.01"
                    placeholder="Ex: 2.00"
                    value={aliquotaFcp}
                    onChange={(e) => setAliquotaFcp(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Fundo de Combate à Pobreza aplicável internamente quando exigido.
                  </p>
                </div>

                {ehSimples && (
                  <div className="space-y-1.5 pt-2 border-t">
                    <Label htmlFor="csosn_padrao">CSOSN Padrão Tributado (Simples Nacional)</Label>
                    <Select
                      value={csosnPadrao}
                      onValueChange={(val: '101' | '102') => setCsosnPadrao(val)}
                    >
                      <SelectTrigger id="csosn_padrao">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="101">
                          101 - Tributada pelo Simples Nacional com permissão de crédito
                        </SelectItem>
                        <SelectItem value="102">
                          102 - Tributada pelo Simples Nacional sem permissão de crédito (padrão)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Aplicado na sugestão quando o fornecedor tributar e não houver ST.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cadastro Automático de Produtos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  Criação Automática a partir da NF-e
                </CardTitle>
                <CardDescription>
                  Comportamento ao importar notas fiscais de entrada
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="criar_auto">Criação de Produtos Não Cadastrados</Label>
                  <Select
                    value={criarProdutosAuto}
                    onValueChange={(val: 'Perguntar' | 'Sempre' | 'Nunca') =>
                      setCriarProdutosAuto(val)
                    }
                  >
                    <SelectTrigger id="criar_auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Perguntar">
                        Perguntar (abre janela de confirmação na conferência)
                      </SelectItem>
                      <SelectItem value="Sempre">
                        Sempre (cria automaticamente todos os itens sem vínculo)
                      </SelectItem>
                      <SelectItem value="Nunca">
                        Nunca (mantém apenas o fluxo de vínculo manual)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="grupo_padrao">Grupo Padrão</Label>
                    <Select value={grupoPadraoId} onValueChange={handleGrupoChange}>
                      <SelectTrigger id="grupo_padrao">
                        <SelectValue placeholder="Selecione um grupo" />
                      </SelectTrigger>
                      <SelectContent>
                        {grupos.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="categoria_padrao">Categoria Padrão</Label>
                    <Select
                      value={categoriaPadraoId}
                      onValueChange={setCategoriaPadraoId}
                      disabled={!grupoPadraoId || categorias.length === 0}
                    >
                      <SelectTrigger id="categoria_padrao">
                        <SelectValue
                          placeholder={
                            grupoPadraoId ? 'Selecione uma categoria' : 'Escolha o grupo primeiro'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {categorias.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="margem_padrao">Margem de Lucro Padrão (%)</Label>
                  <Input
                    id="margem_padrao"
                    type="number"
                    step="0.01"
                    placeholder="Ex: 50.00"
                    value={margemPadrao}
                    onChange={(e) => setMargemPadrao(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilizada para calcular o preço de venda sugerido (custo + margem) ao criar
                    novos produtos.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Motor de Sugestão Fiscal Reutilizável */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Regras do Motor de Sugestão Fiscal
                </CardTitle>
                <CardDescription>
                  Controle de aplicação das sugestões em produtos existentes e conferência
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                  <div className="space-y-0.5 pr-4">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      Aplicar sugestão fiscal em produtos existentes com campos vazios
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Durante a conferência da nota, se o produto vinculado estiver sem NCM,
                      CST/CSOSN ou CFOP de venda, o sistema oferecerá preenchê-los com base nas
                      regras do NCM e deduções do XML.
                    </p>
                  </div>
                  <Switch
                    checked={aplicarSugestaoVazios}
                    onCheckedChange={setAplicarSugestaoVazios}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PermissaoGuard>
  )
}
export default ConfiguracaoFiscalPage
