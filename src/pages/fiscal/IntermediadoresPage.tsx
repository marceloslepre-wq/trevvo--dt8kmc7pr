import { useState, useEffect } from 'react'
import {
  listarIntermediadores,
  criarIntermediador,
  atualizarIntermediador,
  excluirIntermediador,
  Intermediador,
} from '@/services/intermediadores'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Edit2, Trash2, Search, Store, Building2, CheckCircle2, XCircle } from 'lucide-react'

export default function IntermediadoresPage() {
  const { pode, podeGravar } = usePermissoes()
  const { toast } = useToast()

  const [intermediadores, setIntermediadores] = useState<Intermediador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')

  // Modal formulário
  const [modalAberto, setModalAberto] = useState(false)
  const [idEdicao, setIdEdicao] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Modal exclusão
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false)
  const [itemParaExcluir, setItemParaExcluir] = useState<Intermediador | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const podeGerenciar = podeGravar('notas_saida')

  const carregarDados = async () => {
    try {
      setCarregando(true)
      const lista = await listarIntermediadores(false)
      setIntermediadores(lista)
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar intermediadores',
        description: err?.message || 'Falha ao buscar registros.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  const abrirNovo = () => {
    setIdEdicao(null)
    setNome('')
    setCnpj('')
    setAtivo(true)
    setModalAberto(true)
  }

  const abrirEdicao = (item: Intermediador) => {
    setIdEdicao(item.id)
    setNome(item.nome)
    setCnpj(item.cnpj)
    setAtivo(item.ativo)
    setModalAberto(true)
  }

  const formatarCnpj = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 14)
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
    if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
    if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const cnpjLimpo = cnpj.replace(/\D/g, '')

    if (!nome.trim()) {
      toast({
        title: 'Campo obrigatório',
        description: 'Informe o nome do intermediador.',
        variant: 'destructive',
      })
      return
    }

    if (cnpjLimpo.length !== 14) {
      toast({
        title: 'CNPJ inválido',
        description: 'O CNPJ deve conter exatamente 14 dígitos numéricos.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvando(true)
      if (idEdicao) {
        await atualizarIntermediador(idEdicao, { nome, cnpj: cnpjLimpo, ativo })
        toast({
          title: 'Intermediador atualizado',
          description: 'Alterações gravadas com sucesso.',
        })
      } else {
        await criarIntermediador({ nome, cnpj: cnpjLimpo, ativo })
        toast({ title: 'Intermediador cadastrado', description: 'Registro criado com sucesso.' })
      }
      setModalAberto(false)
      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Não foi possível gravar o intermediador.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const confirmarExcluir = async () => {
    if (!itemParaExcluir) return
    try {
      setExcluindo(true)
      await excluirIntermediador(itemParaExcluir.id)
      toast({ title: 'Intermediador excluído', description: 'Registro removido com sucesso.' })
      setModalExcluirAberto(false)
      setItemParaExcluir(null)
      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir',
        description: err?.message || 'Não foi possível remover o registro.',
        variant: 'destructive',
      })
    } finally {
      setExcluindo(false)
    }
  }

  const listaFiltrada = intermediadores.filter((item) => {
    if (!busca) return true
    const termo = busca.toLowerCase()
    return item.nome.toLowerCase().includes(termo) || item.cnpj.includes(termo.replace(/\D/g, ''))
  })

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Store className="h-7 w-7 text-primary" />
            Intermediadores de Vendas (Marketplaces)
          </h1>
          <p className="text-muted-foreground text-sm">
            Cadastro de plataformas terceiras exigido pela SEFAZ (grupo infIntermed) em vendas pela
            internet ou telefone.
          </p>
        </div>

        {podeGerenciar && (
          <Button onClick={abrirNovo} className="gap-2 self-start sm:self-auto">
            <Plus className="h-4 w-4" />
            Novo Intermediador
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou CNPJ..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Total: {listaFiltrada.length} intermediador(es)
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Carregando intermediadores...
            </div>
          ) : listaFiltrada.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Store className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium">Nenhum intermediador encontrado</p>
              <p className="text-xs text-muted-foreground">
                Cadastre plataformas como Mercado Livre, Shopee, Amazon para emissão de NF-e
                e-commerce.
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome / Plataforma</TableHead>
                    <TableHead>CNPJ do Intermediador</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listaFiltrada.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {item.nome}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{formatarCnpj(item.cnpj)}</TableCell>
                      <TableCell>
                        {item.ativo ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-emerald-500/30 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Ativo
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="gap-1 border-muted text-muted-foreground"
                          >
                            <XCircle className="h-3 w-3" />
                            Inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {podeGerenciar && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => abrirEdicao(item)}
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                          {pode('notas_saida', 'excluir') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setItemParaExcluir(item)
                                setModalExcluirAberto(true)
                              }}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Formulário */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {idEdicao ? 'Editar Intermediador' : 'Novo Intermediador de Venda'}
            </DialogTitle>
            <DialogDescription>
              Informe a razão social ou nome da plataforma e o CNPJ exigido no grupo infIntermed da
              SEFAZ.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={salvar} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome do Intermediador / Marketplace *</Label>
              <Input
                id="nome"
                placeholder="Ex.: Mercado Livre, Shopee, Amazon Marketplace"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ do Intermediador *</Label>
              <Input
                id="cnpj"
                placeholder="00.000.000/0000-00"
                value={formatarCnpj(cnpj)}
                onChange={(e) => setCnpj(e.target.value)}
                maxLength={18}
                required
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="space-y-0.5">
                <Label htmlFor="ativo" className="text-sm font-medium">
                  Intermediador Ativo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Disponível para seleção na conferência de NF-e da loja virtual
                </p>
              </div>
              <Switch id="ativo" checked={ativo} onCheckedChange={setAtivo} />
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando ? 'Gravando...' : 'Salvar Intermediador'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmar Exclusão */}
      <Dialog open={modalExcluirAberto} onOpenChange={setModalExcluirAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir Intermediador</DialogTitle>
            <DialogDescription>
              Tem certeza de que deseja remover o intermediador{' '}
              <strong>{itemParaExcluir?.nome}</strong>? Notas já autorizadas com este intermediador
              manterão os registros fiscais gravados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => setModalExcluirAberto(false)}
              disabled={excluindo}
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarExcluir} disabled={excluindo}>
              {excluindo ? 'Excluindo...' : 'Confirmar Exclusão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
