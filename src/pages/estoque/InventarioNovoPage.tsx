import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardCheck,
  ArrowLeft,
  Calendar,
  Layers,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  abrirInventario,
  TipoInventario,
  MOTIVOS_BLOCO_H,
  FiltrosInventarioParcial,
} from '@/services/inventarios'
import {
  listarTodosGruposAtivos,
  listarCategoriasPorGrupo,
  Grupo,
  Categoria,
} from '@/services/gruposCategorias'
import { listarTodasMarcasAtivas, Marca } from '@/services/marcas'
import { toast } from '@/hooks/use-toast'

export const InventarioNovoPage: React.FC = () => {
  const navigate = useNavigate()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode, usuarioERP } = usePermissoes()
  const podeCriar = pode('estoque', 'criar')

  // Form
  const [descricao, setDescricao] = useState('')
  const [tipo, setTipo] = useState<TipoInventario>('Geral')
  const [dataReferencia, setDataReferencia] = useState<string>(
    new Date().toISOString().slice(0, 10),
  )
  const [motivoBlocoH, setMotivoBlocoH] = useState<string>('01 No final do período')
  const [observacao, setObservacao] = useState('')
  const [incluirZerados, setIncluirZerados] = useState(false)

  // Filtros para inventário parcial
  const [grupoId, setGrupoId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [marcaId, setMarcaId] = useState('')
  const [localizacao, setLocalizacao] = useState('')

  // Listas de apoio para filtros
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    listarTodosGruposAtivos().then(setGrupos).catch(console.error)
    listarTodasMarcasAtivas().then(setMarcas).catch(console.error)
  }, [])

  useEffect(() => {
    if (grupoId) {
      listarCategoriasPorGrupo(grupoId).then(setCategorias).catch(console.error)
    } else {
      setCategorias([])
      setCategoriaId('')
    }
  }, [grupoId])

  const handleAbrir = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!empresaAtiva) {
      toast({
        title: 'Selecione uma empresa',
        description: 'Você precisa de uma empresa ativa selecionada.',
        variant: 'destructive',
      })
      return
    }

    if (!podeCriar) {
      toast({
        title: 'Permissão insuficiente',
        description: 'Você não possui permissão para abrir inventários de estoque.',
        variant: 'destructive',
      })
      return
    }

    if (!descricao.trim()) {
      toast({
        title: 'Descrição obrigatória',
        description: 'Informe uma descrição ou título para identificar este inventário.',
        variant: 'destructive',
      })
      return
    }

    if (!dataReferencia) {
      toast({
        title: 'Data de referência obrigatória',
        description: 'Informe a data e hora da posição de estoque.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      let filtros: FiltrosInventarioParcial | undefined
      if (tipo === 'Parcial') {
        filtros = {
          grupo_id: grupoId || undefined,
          categoria_id: categoriaId || undefined,
          marca_id: marcaId || undefined,
          localizacao: localizacao.trim() || undefined,
        }
      }

      const inv = await abrirInventario({
        empresa_id: empresaAtiva.id,
        descricao: descricao.trim(),
        data_referencia: dataReferencia,
        tipo,
        filtros_usados: filtros,
        motivo_bloco_h: motivoBlocoH,
        observacao: observacao.trim() || undefined,
        incluir_zerados: incluirZerados,
        usuario_id: usuarioERP?.id || undefined,
      })

      toast({
        title: 'Inventário aberto com sucesso!',
        description: `Inventário nº ${inv.numero} gerado com saldo congelado em ${dataReferencia}.`,
      })

      navigate(`/estoque/inventarios/${inv.id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast({
        title: 'Falha ao abrir inventário',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/estoque/inventarios')}
            className="h-9 px-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Novo Inventário de Estoque</h1>
            <p className="text-xs text-slate-500">
              Congela o saldo do sistema na data de referência para contagem física
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleAbrir} className="space-y-4">
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900">Dados do Inventário</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {/* Descrição */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                Descrição do Inventário *
              </Label>
              <Input
                type="text"
                placeholder="Ex: Contagem Física Anual 2025, Balanço Semestral Loja 1..."
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="h-10 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Tipo */}
              <div>
                <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Tipo de Inventário *
                </Label>
                <Select value={tipo} onValueChange={(val) => setTipo(val as TipoInventario)}>
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Selecione o tipo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Geral">Geral (Todos os produtos da filial)</SelectItem>
                    <SelectItem value="Parcial">
                      Parcial (Filtrado por grupo, marca etc.)
                    </SelectItem>
                    <SelectItem value="Anual (Bloco H)">Anual (Bloco H do SPED Fiscal)</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {tipo === 'Anual (Bloco H)'
                    ? 'Preparado para o registro H010 do SPED de 31/12.'
                    : tipo === 'Parcial'
                      ? 'Permite selecionar grupos, marcas ou localização específica.'
                      : 'Inclui todo o catálogo de produtos que controlam estoque.'}
                </span>
              </div>

              {/* Data de Referência */}
              <div>
                <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Data de Referência (Posição do Estoque) *
                </Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                  <Input
                    type="date"
                    value={dataReferencia}
                    onChange={(e) => setDataReferencia(e.target.value)}
                    className="pl-9 h-10 text-xs"
                    required
                  />
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  O sistema congelará o saldo histórico (função saldoEmData) até as 23:59 desta
                  data.
                </span>
              </div>
            </div>

            {/* Motivo Bloco H */}
            {(tipo === 'Anual (Bloco H)' || tipo === 'Geral') && (
              <div>
                <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                  Motivo do Inventário (SPED Bloco H - Registro H005)
                </Label>
                <Select value={motivoBlocoH} onValueChange={setMotivoBlocoH}>
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Selecione o motivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_BLOCO_H.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Padrão 01: No encerramento do exercício fiscal (31 de dezembro).
                </span>
              </div>
            )}

            {/* Opção Incluir Produtos Zerados */}
            <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
              <Checkbox
                id="zerados"
                checked={incluirZerados}
                onCheckedChange={(checked) => setIncluirZerados(Boolean(checked))}
              />
              <label
                htmlFor="zerados"
                className="text-xs font-medium text-slate-700 leading-none cursor-pointer"
              >
                Incluir produtos com saldo zero na data de referência
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Bloco de Filtros para Inventário Parcial */}
        {tipo === 'Parcial' && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-3 border-b border-blue-100">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-sm font-bold text-slate-900">
                  Filtros do Inventário Parcial
                </CardTitle>
              </div>
              <p className="text-[11px] text-slate-500">
                Apenas produtos que atendam aos filtros selecionados entrarão na grade de contagem.
              </p>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Grupo */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 mb-1 block">Grupo</Label>
                  <Select value={grupoId} onValueChange={setGrupoId}>
                    <SelectTrigger className="h-9 text-xs bg-white">
                      <SelectValue placeholder="Todos os grupos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os grupos</SelectItem>
                      {grupos.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.codigo} - {g.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Categoria */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Categoria
                  </Label>
                  <Select
                    value={categoriaId}
                    onValueChange={setCategoriaId}
                    disabled={!grupoId || grupoId === 'todos'}
                  >
                    <SelectTrigger className="h-9 text-xs bg-white">
                      <SelectValue placeholder="Todas as categorias" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as categorias</SelectItem>
                      {categorias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Marca */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 mb-1 block">Marca</Label>
                  <Select value={marcaId} onValueChange={setMarcaId}>
                    <SelectTrigger className="h-9 text-xs bg-white">
                      <SelectValue placeholder="Todas as marcas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as marcas</SelectItem>
                      {marcas.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Localização */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                    Localização Física
                  </Label>
                  <Input
                    type="text"
                    placeholder="Ex: Corredor A, Prateleira 3..."
                    value={localizacao}
                    onChange={(e) => setLocalizacao(e.target.value)}
                    className="h-9 text-xs bg-white"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Observações */}
        <Card className="border-slate-200 bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900">
              Observações Adicionais
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <Textarea
              placeholder="Instruções para os conferentes, justificativa do balanço..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="text-xs resize-none"
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Ações */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/estoque/inventarios')}
            className="text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={salvando}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-6 shadow-xs"
          >
            {salvando ? 'Gerando inventário...' : 'Abrir Inventário e Congelar Saldos'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default InventarioNovoPage
