import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { FolderTree, Layers, GitCommit, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Grupo,
  Categoria,
  Subcategoria,
  listarTodosGruposAtivos,
  listarCategoriasPorGrupo,
  listarSubcategoriasPorCategoria,
} from '@/services/gruposCategorias'
import { useAssinanteId } from '@/hooks/useAssinanteId'

export interface SelectGrupoCategoriaProps {
  grupoId?: string
  categoriaId?: string
  subcategoriaId?: string
  onGrupoChange?: (grupoId: string, grupo?: Grupo) => void
  onCategoriaChange?: (categoriaId: string, categoria?: Categoria) => void
  onSubcategoriaChange?: (subcategoriaId: string, subcategoria?: Subcategoria) => void
  disabled?: boolean
  requiredGrupo?: boolean
  requiredCategoria?: boolean
  requiredSubcategoria?: boolean
  somenteAtivos?: boolean
  className?: string
  layout?: 'horizontal' | 'vertical'
}

export const SelectGrupoCategoria: React.FC<SelectGrupoCategoriaProps> = ({
  grupoId = '',
  categoriaId = '',
  subcategoriaId = '',
  onGrupoChange,
  onCategoriaChange,
  onSubcategoriaChange,
  disabled = false,
  requiredGrupo = false,
  requiredCategoria = false,
  requiredSubcategoria = false,
  somenteAtivos = true,
  className,
  layout = 'horizontal',
}) => {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [carregandoGrupos, setCarregandoGrupos] = useState(false)
  const [carregandoCategorias, setCarregandoCategorias] = useState(false)
  const [carregandoSubcategorias, setCarregandoSubcategorias] = useState(false)
  const assinanteId = useAssinanteId()

  // Carregar grupos
  useEffect(() => {
    let ativo = true
    async function carregar() {
      setCarregandoGrupos(true)
      try {
        const dados = await listarTodosGruposAtivos(assinanteId || undefined)
        if (ativo) {
          setGrupos(dados)
        }
      } catch (err) {
        console.error('Erro ao carregar grupos:', err)
      } finally {
        if (ativo) setCarregandoGrupos(false)
      }
    }
    carregar()
    return () => {
      ativo = false
    }
  }, [somenteAtivos, assinanteId])

  // Carregar categorias quando o grupoId muda
  const carregarCategorias = useCallback(
    async (gid: string) => {
      if (!gid) {
        setCategorias([])
        return
      }
      setCarregandoCategorias(true)
      try {
        const dados = await listarCategoriasPorGrupo(gid, somenteAtivos, assinanteId || undefined)
        setCategorias(dados)
      } catch (err) {
        console.error('Erro ao carregar categorias do grupo:', err)
        setCategorias([])
      } finally {
        setCarregandoCategorias(false)
      }
    },
    [somenteAtivos, assinanteId],
  )

  useEffect(() => {
    carregarCategorias(grupoId)
  }, [grupoId, carregarCategorias])

  // Carregar subcategorias quando categoriaId muda
  const carregarSubcategorias = useCallback(
    async (cid: string) => {
      if (!cid) {
        setSubcategorias([])
        return
      }
      setCarregandoSubcategorias(true)
      try {
        const dados = await listarSubcategoriasPorCategoria(
          cid,
          somenteAtivos,
          assinanteId || undefined,
        )
        setSubcategorias(dados)
      } catch (err) {
        console.error('Erro ao carregar subcategorias da categoria:', err)
        setSubcategorias([])
      } finally {
        setCarregandoSubcategorias(false)
      }
    },
    [somenteAtivos, assinanteId],
  )

  useEffect(() => {
    carregarSubcategorias(categoriaId)
  }, [categoriaId, carregarSubcategorias])

  const handleGrupoSelecionado = (novoGrupoId: string) => {
    const grupoEncontrado = grupos.find((g) => g.id === novoGrupoId)
    if (onGrupoChange) {
      onGrupoChange(novoGrupoId, grupoEncontrado)
    }
    // Ao trocar o grupo, limpa categoria e subcategoria
    if (onCategoriaChange) {
      onCategoriaChange('', undefined)
    }
    if (onSubcategoriaChange) {
      onSubcategoriaChange('', undefined)
    }
  }

  const handleCategoriaSelecionada = (novaCategoriaId: string) => {
    const categoriaEncontrada = categorias.find((c) => c.id === novaCategoriaId)
    if (onCategoriaChange) {
      onCategoriaChange(novaCategoriaId, categoriaEncontrada)
    }
    if (onSubcategoriaChange) {
      onSubcategoriaChange('', undefined)
    }
  }

  const handleSubcategoriaSelecionada = (novaSubcategoriaId: string) => {
    const valorReal = novaSubcategoriaId === '__nenhuma__' ? '' : novaSubcategoriaId
    const subEncontrada = subcategorias.find((s) => s.id === valorReal)
    if (onSubcategoriaChange) {
      onSubcategoriaChange(valorReal, subEncontrada)
    }
  }

  // Subcategoria só é exibida quando a categoria escolhida tem subcategorias
  const temSubcategorias = subcategorias.length > 0

  const containerClasses =
    layout === 'horizontal'
      ? temSubcategorias
        ? 'grid grid-cols-1 sm:grid-cols-3 gap-4'
        : 'grid grid-cols-1 sm:grid-cols-2 gap-4'
      : 'flex flex-col space-y-4'

  return (
    <div className={cn(containerClasses, className)}>
      {/* 1. Seleção de Grupo */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <FolderTree className="h-3.5 w-3.5 text-blue-600" />
          <span>Grupo</span>
          {requiredGrupo && <span className="text-rose-600">*</span>}
        </Label>

        <Select
          value={grupoId}
          onValueChange={handleGrupoSelecionado}
          disabled={disabled || carregandoGrupos}
        >
          <SelectTrigger className="text-xs h-10 bg-white">
            <SelectValue
              placeholder={
                carregandoGrupos ? 'Carregando grupos...' : 'Selecione o grupo (nível 1)...'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {grupos.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">
                Nenhum grupo ativo cadastrado
              </div>
            ) : (
              grupos.map((g) => (
                <SelectItem key={g.id} value={g.id} className="text-xs">
                  <span className="font-mono font-bold text-blue-700 mr-2">{g.codigo}</span>
                  <span>{g.nome}</span>
                  {g.margem_padrao_percentual !== undefined &&
                    g.margem_padrao_percentual !== null && (
                      <span className="text-slate-400 ml-1.5 text-[11px]">
                        ({Number(g.margem_padrao_percentual).toFixed(2)}%)
                      </span>
                    )}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* 2. Seleção de Categoria (encadeada ao grupo selecionado) */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-blue-600" />
          <span>Categoria</span>
          {requiredCategoria && <span className="text-rose-600">*</span>}
        </Label>

        <Select
          value={categoriaId}
          onValueChange={handleCategoriaSelecionada}
          disabled={disabled || !grupoId || carregandoCategorias}
        >
          <SelectTrigger className="text-xs h-10 bg-white">
            <SelectValue
              placeholder={
                !grupoId
                  ? 'Selecione primeiro um grupo acima...'
                  : carregandoCategorias
                    ? 'Carregando categorias...'
                    : 'Selecione a categoria (nível 2)...'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {categorias.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500">
                {grupoId
                  ? 'Nenhuma categoria cadastrada neste grupo'
                  : 'Selecione primeiro um grupo'}
              </div>
            ) : (
              categorias.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.codigo && (
                    <span className="font-mono text-slate-500 mr-1.5 text-[11px]">{c.codigo}</span>
                  )}
                  <span>{c.nome}</span>
                  {c.margem_padrao_percentual !== undefined &&
                    c.margem_padrao_percentual !== null && (
                      <span className="text-emerald-700 font-medium ml-1.5 text-[11px]">
                        ({Number(c.margem_padrao_percentual).toFixed(2)}%)
                      </span>
                    )}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* 3. Seleção de Subcategoria (encadeada à categoria; só aparece se a categoria tiver subcategorias) */}
      {temSubcategorias && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <GitCommit className="h-3.5 w-3.5 text-indigo-600" />
              <span>Subcategoria</span>
              {requiredSubcategoria && <span className="text-rose-600">*</span>}
            </span>
            <span className="text-[10px] font-normal text-slate-400">(opcional)</span>
          </Label>

          <Select
            value={subcategoriaId || '__nenhuma__'}
            onValueChange={handleSubcategoriaSelecionada}
            disabled={disabled || !categoriaId || carregandoSubcategorias}
          >
            <SelectTrigger className="text-xs h-10 bg-white">
              <SelectValue
                placeholder={
                  carregandoSubcategorias
                    ? 'Carregando subcategorias...'
                    : 'Selecione a subcategoria (nível 3)...'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__nenhuma__" className="text-xs text-slate-500 italic">
                Nenhuma (não classificar em subcategoria)
              </SelectItem>
              {subcategorias.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.codigo && (
                    <span className="font-mono text-slate-500 mr-1.5 text-[11px]">{s.codigo}</span>
                  )}
                  <span>{s.nome}</span>
                  {s.margem_padrao_percentual !== undefined &&
                    s.margem_padrao_percentual !== null && (
                      <span className="text-indigo-700 font-medium ml-1.5 text-[11px]">
                        ({Number(s.margem_padrao_percentual).toFixed(2)}%)
                      </span>
                    )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

export default SelectGrupoCategoria
