import { useRef, useState } from 'react'
import { Download, FileUp, Loader2, Upload } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import {
  Produto,
  extrairCamposFiscaisDoPerfil,
  recalcularMargem,
  salvarProduto,
} from '@/services/produtos'
import { obterPerfilTributarioCompleto } from '@/services/perfisTributarios'
import { salvarCategoria, salvarGrupo, salvarSubcategoria } from '@/services/gruposCategorias'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Importação da carga inicial de produtos vinda do Uniplus, com prévia.
 * Colunas (separadas por ";"): codigo; descricao; gtin; unidade; ncm; preco_custo; preco_venda;
 * marca; fornecedor_cnpj; grupo; categoria; subcategoria; perfil; ativo; avisos.
 * - O código do Uniplus vira o código do produto no Trevvo (a Referência guarda o código da Tray).
 * - Grupo, categoria e subcategoria que não existirem são criados (busca pelo nome dentro do pai).
 * - O perfil (ex.: HH01) é procurado pelo início do nome do perfil tributário e aplicado como no cadastro.
 * - Produtos entram com "fiscal não revisado". Produto com o mesmo código ou referência é pulado.
 */

type Situacao = 'novo' | 'existe' | 'erro'

interface LinhaProduto {
  linha: number
  codigo: string
  descricao: string
  gtin: string
  unidade: string
  ncm: string
  precoCusto: number
  precoVenda: number
  marca: string
  fornecedorCnpj: string
  grupo: string
  categoria: string
  subcategoria: string
  perfil: string
  ativo: boolean
  avisos: string[]
  situacao: Situacao
  motivo: string
  resultado?: 'gravado' | 'falhou'
  erroGravacao?: string
}

interface Referencias {
  unidades: Map<string, string>
  marcas: Map<string, string>
  fornecedores: Map<string, string>
  grupos: Map<string, string>
  categorias: Map<string, string>
  subcategorias: Map<string, string>
  perfis: Map<string, string>
  maiorCodigoGrupo: number
}

function chave(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** Lê CSV separado por ";" respeitando campos entre aspas. */
function lerCsv(texto: string): string[][] {
  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let aspas = false
  const t = texto.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') {
        campo += '"'
        i++
      } else if (ch === '"') {
        aspas = false
      } else {
        campo += ch
      }
    } else if (ch === '"') {
      aspas = true
    } else if (ch === ';') {
      linha.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      linha.push(campo)
      if (linha.some((c) => c.trim() !== '')) linhas.push(linha)
      linha = []
      campo = ''
    } else {
      campo += ch
    }
  }
  linha.push(campo)
  if (linha.some((c) => c.trim() !== '')) linhas.push(linha)
  return linhas
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Repete a chamada quando o servidor responde 429 (muitas requisições). */
async function comRepeticao<T>(fn: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fn()
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 429 && tentativa < 10) {
        await esperar(2000 * tentativa)
        continue
      }
      throw err
    }
  }
}

function caminhoCategoria(l: { grupo: string; categoria: string }) {
  return `${chave(l.grupo)}|${chave(l.categoria)}`
}
function caminhoSubcategoria(l: { grupo: string; categoria: string; subcategoria: string }) {
  return `${caminhoCategoria(l)}|${chave(l.subcategoria)}`
}

async function carregarReferencias(): Promise<Referencias> {
  const [unidades, marcas, fornecedores, grupos, categorias, subcategorias, perfis] =
    await Promise.all([
      pb
        .collection('unidades_medida')
        .getFullList<{ id: string; sigla: string }>({ filter: 'ativo = true', fields: 'id,sigla' }),
      pb
        .collection('marcas')
        .getFullList<{ id: string; nome: string }>({ fields: 'id,nome', batch: 500 }),
      pb
        .collection('fornecedores')
        .getFullList<{ id: string; cpf_cnpj: string }>({ fields: 'id,cpf_cnpj', batch: 500 }),
      pb
        .collection('grupos')
        .getFullList<{ id: string; nome: string; codigo: string }>({ fields: 'id,nome,codigo' }),
      pb.collection('categorias').getFullList<{ id: string; nome: string; grupo_id: string }>({
        fields: 'id,nome,grupo_id',
      }),
      pb
        .collection('subcategorias')
        .getFullList<{ id: string; nome: string; categoria_id: string }>({
          fields: 'id,nome,categoria_id',
        }),
      pb
        .collection('perfis_tributarios')
        .getFullList<{ id: string; nome: string }>({ filter: 'ativo = true', fields: 'id,nome' }),
    ])

  const nomeGrupo = new Map(grupos.map((g) => [g.id, chave(g.nome)]))
  const caminhoCat = new Map(
    categorias.map((c) => [c.id, `${nomeGrupo.get(c.grupo_id)}|${chave(c.nome)}`]),
  )

  const ref: Referencias = {
    unidades: new Map(unidades.map((u) => [u.sigla.toUpperCase(), u.id])),
    marcas: new Map(marcas.map((m) => [chave(m.nome), m.id])),
    fornecedores: new Map(fornecedores.map((f) => [(f.cpf_cnpj || '').replace(/\D/g, ''), f.id])),
    grupos: new Map(grupos.map((g) => [chave(g.nome), g.id])),
    categorias: new Map(categorias.map((c) => [caminhoCat.get(c.id) || '', c.id])),
    subcategorias: new Map(
      subcategorias.map((s) => [`${caminhoCat.get(s.categoria_id)}|${chave(s.nome)}`, s.id]),
    ),
    perfis: new Map(),
    maiorCodigoGrupo: grupos.reduce((m, g) => Math.max(m, Number(g.codigo) || 0), 0),
  }
  perfis.forEach((p) => {
    const m = p.nome.trim().match(/^([A-Z]{2}\d{2})\b/i)
    if (m) ref.perfis.set(m[1].toUpperCase(), p.id)
  })
  return ref
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onConcluido: () => void
}

export default function ImportarProdutosUniplusDialog({ aberto, onFechar, onConcluido }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [linhas, setLinhas] = useState<LinhaProduto[]>([])
  const [ref, setRef] = useState<Referencias | null>(null)
  const [lendo, setLendo] = useState(false)
  const [erroLeitura, setErroLeitura] = useState('')
  const [limite, setLimite] = useState('50')
  const [filtro, setFiltro] = useState<'todos' | 'avisos' | 'erros'>('todos')
  const [importando, setImportando] = useState(false)
  const [etapa, setEtapa] = useState('')
  const [progresso, setProgresso] = useState(0)
  const [concluido, setConcluido] = useState(false)

  const novos = linhas.filter((l) => l.situacao === 'novo')
  const existentes = linhas.filter((l) => l.situacao === 'existe')
  const comErro = linhas.filter((l) => l.situacao === 'erro')
  const comAviso = linhas.filter((l) => l.avisos.length > 0)
  const gravados = linhas.filter((l) => l.resultado === 'gravado')
  const falhas = linhas.filter((l) => l.resultado === 'falhou')
  const qtdLimite = Math.max(0, Math.floor(Number(limite) || 0))
  const aImportar = qtdLimite > 0 ? novos.slice(0, qtdLimite) : novos

  // Árvore que ainda não existe (só do que será importado)
  const gruposNovos = new Set<string>()
  const categoriasNovas = new Set<string>()
  const subcategoriasNovas = new Set<string>()
  if (ref) {
    aImportar.forEach((l) => {
      if (l.grupo && !ref.grupos.has(chave(l.grupo))) gruposNovos.add(l.grupo)
      if (l.categoria && !ref.categorias.has(caminhoCategoria(l)))
        categoriasNovas.add(`${l.grupo} > ${l.categoria}`)
      if (l.subcategoria && !ref.subcategorias.has(caminhoSubcategoria(l)))
        subcategoriasNovas.add(`${l.grupo} > ${l.categoria} > ${l.subcategoria}`)
    })
  }

  function limpar() {
    setNomeArquivo('')
    setLinhas([])
    setRef(null)
    setErroLeitura('')
    setProgresso(0)
    setEtapa('')
    setConcluido(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function fechar() {
    if (importando) return
    if (concluido) onConcluido()
    limpar()
    onFechar()
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    limpar()
    setNomeArquivo(arquivo.name)
    setLendo(true)
    try {
      const tabela = lerCsv(await arquivo.text())
      if (tabela.length < 2) throw new Error('O arquivo está vazio ou não tem cabeçalho.')
      const cab = tabela[0].map((c) => c.trim().toLowerCase())
      const col = (nome: string) => cab.indexOf(nome)
      for (const obrig of ['codigo', 'descricao', 'unidade', 'preco_venda']) {
        if (col(obrig) < 0) throw new Error(`O cabeçalho não tem a coluna ${obrig}.`)
      }

      const referencias = await carregarReferencias()
      const existentesBanco = await pb
        .collection('produtos')
        .getFullList<{ codigo: number; referencia: string }>({
          fields: 'codigo,referencia',
          batch: 1000,
        })
      const codigosBanco = new Set(existentesBanco.map((p) => String(p.codigo)))
      const vistos = new Set<string>()
      const num = (v: string) => Number((v || '0').replace(',', '.')) || 0

      const resultado: LinhaProduto[] = tabela.slice(1).map((r, i) => {
        const v = (nome: string) => (col(nome) >= 0 ? (r[col(nome)] || '').trim() : '')
        const l: LinhaProduto = {
          linha: i + 2,
          codigo: v('codigo').replace(/\D/g, ''),
          descricao: v('descricao'),
          gtin: v('gtin'),
          unidade: v('unidade').toUpperCase(),
          ncm: v('ncm').replace(/\D/g, ''),
          precoCusto: num(v('preco_custo')),
          precoVenda: num(v('preco_venda')),
          marca: v('marca'),
          fornecedorCnpj: v('fornecedor_cnpj').replace(/\D/g, ''),
          grupo: v('grupo'),
          categoria: v('categoria'),
          subcategoria: v('subcategoria'),
          perfil: v('perfil').toUpperCase(),
          ativo: !['nao', 'não', 'n', 'false', '0'].includes(v('ativo').toLowerCase()),
          avisos: v('avisos') ? v('avisos').split(' | ') : [],
          situacao: 'novo',
          motivo: '',
        }
        if (l.marca && !referencias.marcas.has(chave(l.marca)))
          l.avisos.push(`marca "${l.marca}" não cadastrada: fica sem marca`)
        if (l.fornecedorCnpj && !referencias.fornecedores.has(l.fornecedorCnpj))
          l.avisos.push('fornecedor não cadastrado: fica sem fornecedor')
        if (l.perfil && !referencias.perfis.has(l.perfil))
          l.avisos.push(`perfil ${l.perfil} não encontrado: fiscal fica em branco`)
        if (l.categoria && !l.grupo) l.avisos.push('categoria sem grupo: fica sem classificação')

        if (!l.codigo || !l.descricao) {
          l.situacao = 'erro'
          l.motivo = 'Sem código ou descrição'
        } else if (!referencias.unidades.has(l.unidade)) {
          l.situacao = 'erro'
          l.motivo = `Unidade ${l.unidade || '(vazia)'} não cadastrada`
        } else if (codigosBanco.has(l.codigo)) {
          l.situacao = 'existe'
          l.motivo = 'Já cadastrado (será pulado)'
        } else if (vistos.has(l.codigo)) {
          l.situacao = 'erro'
          l.motivo = 'Código repetido no arquivo'
        }
        vistos.add(l.codigo)
        return l
      })
      setRef(referencias)
      setLinhas(resultado)
    } catch (err) {
      setErroLeitura(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  async function garantirArvore(r: Referencias, lote: LinhaProduto[]) {
    let proximoGrupo = r.maiorCodigoGrupo
    for (const l of lote) {
      if (!l.grupo) continue
      const kg = chave(l.grupo)
      if (!r.grupos.has(kg)) {
        proximoGrupo++
        const g = await comRepeticao(() =>
          salvarGrupo({ codigo: String(proximoGrupo), nome: l.grupo, ativo: true }),
        )
        r.grupos.set(kg, g.id)
      }
      if (!l.categoria) continue
      const kc = caminhoCategoria(l)
      if (!r.categorias.has(kc)) {
        const grupoId = r.grupos.get(kg)!
        const c = await comRepeticao(() =>
          salvarCategoria({ grupo_id: grupoId, nome: l.categoria, ativo: true }),
        )
        r.categorias.set(kc, c.id)
      }
      if (!l.subcategoria) continue
      const ks = caminhoSubcategoria(l)
      if (!r.subcategorias.has(ks)) {
        const categoriaId = r.categorias.get(kc)!
        const s = await comRepeticao(() =>
          salvarSubcategoria({ categoria_id: categoriaId, nome: l.subcategoria, ativo: true }),
        )
        r.subcategorias.set(ks, s.id)
      }
    }
  }

  async function importar() {
    if (!ref || aImportar.length === 0) return
    setImportando(true)
    const atualizadas = [...linhas]
    try {
      setEtapa('Criando grupos e categorias que faltam...')
      await garantirArvore(ref, aImportar)

      setEtapa('Carregando perfis tributários...')
      const camposPorPerfil = new Map<string, Partial<Produto>>()
      for (const codigoPerfil of new Set(aImportar.map((l) => l.perfil).filter(Boolean))) {
        const id = ref.perfis.get(codigoPerfil)
        if (!id) continue
        const completo = await comRepeticao(() => obterPerfilTributarioCompleto(id))
        if (completo) camposPorPerfil.set(codigoPerfil, extrairCamposFiscaisDoPerfil(completo))
      }

      setEtapa('Gravando produtos...')
      const alvo = new Set(aImportar.map((l) => l.linha))
      let feitos = 0
      for (let i = 0; i < atualizadas.length; i++) {
        const l = atualizadas[i]
        if (!alvo.has(l.linha)) continue
        try {
          const fiscal = camposPorPerfil.get(l.perfil) || {}
          const catId = l.categoria ? ref.categorias.get(caminhoCategoria(l)) : undefined
          const subId = l.subcategoria ? ref.subcategorias.get(caminhoSubcategoria(l)) : undefined
          await comRepeticao(() =>
            salvarProduto({
              ...fiscal,
              tipo: 'Produto',
              codigo: Number(l.codigo),
              referencia: '', // Referência = código da Tray (importado à parte)
              descricao: l.descricao.slice(0, 120),
              gtin: l.gtin,
              unidade_id: ref.unidades.get(l.unidade),
              ncm: l.ncm,
              origem: fiscal.origem || '0',
              tipo_item_sped: fiscal.tipo_item_sped || '00',
              preco_custo: l.precoCusto,
              custo_final: l.precoCusto,
              preco_venda: l.precoVenda,
              margem_percentual:
                l.precoCusto > 0 ? recalcularMargem(l.precoVenda, l.precoCusto) : 0,
              marca_id: l.marca ? ref.marcas.get(chave(l.marca)) : undefined,
              fornecedor_principal_id: l.fornecedorCnpj
                ? ref.fornecedores.get(l.fornecedorCnpj)
                : undefined,
              grupo_id: l.grupo ? ref.grupos.get(chave(l.grupo)) : undefined,
              categoria_id: catId,
              subcategoria_id: subId,
              controla_estoque: true,
              vende_no_pdv: true,
              ativo: l.ativo,
              fiscal_revisado: false,
              observacoes: `Importado do Uniplus (código ${l.codigo}).${
                l.avisos.length ? ' ' + l.avisos.join('; ') + '.' : ''
              }`,
            }),
          )
          atualizadas[i] = { ...l, resultado: 'gravado' }
        } catch (err) {
          atualizadas[i] = {
            ...l,
            resultado: 'falhou',
            erroGravacao: err instanceof Error ? err.message : 'Erro ao gravar',
          }
        }
        feitos++
        await esperar(60)
        setProgresso(Math.round((feitos / aImportar.length) * 100))
        if (feitos % 10 === 0 || feitos === aImportar.length) setLinhas([...atualizadas])
      }
      setLinhas([...atualizadas])
      setConcluido(true)
    } catch (err) {
      setErroLeitura(
        `Importação interrompida: ${err instanceof Error ? err.message : 'erro desconhecido'}`,
      )
      setLinhas([...atualizadas])
      setConcluido(true)
    } finally {
      setEtapa('')
      setImportando(false)
    }
  }

  function baixarResultado() {
    const cel = (v: string | number) => {
      const t = String(v ?? '')
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const situacao = (l: LinhaProduto) =>
      l.resultado === 'gravado'
        ? 'Gravado'
        : l.resultado === 'falhou'
          ? `Falhou: ${l.erroGravacao || ''}`
          : l.situacao === 'novo'
            ? 'Novo (não importado)'
            : l.motivo
    const cabecalho = [
      'codigo',
      'descricao',
      'grupo',
      'categoria',
      'subcategoria',
      'perfil',
      'preco_venda',
      'status',
      'situacao',
      'avisos',
    ]
    const corpo = linhas.map((l) =>
      [
        l.codigo,
        l.descricao,
        l.grupo,
        l.categoria,
        l.subcategoria,
        l.perfil,
        l.precoVenda.toFixed(2).replace('.', ','),
        l.ativo ? 'Ativo' : 'Suspenso',
        situacao(l),
        l.avisos.join('; '),
      ]
        .map(cel)
        .join(';'),
    )
    const blob = new Blob(['\ufeff' + [cabecalho.join(';'), ...corpo].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `resultado-importacao-produtos-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const visiveis = linhas
    .filter((l) =>
      filtro === 'erros'
        ? l.situacao === 'erro' || l.resultado === 'falhou'
        : filtro === 'avisos'
          ? l.avisos.length > 0
          : true,
    )
    .slice(0, 300)

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-5xl notranslate" translate="no">
        <DialogHeader>
          <DialogTitle>Importar produtos do Uniplus</DialogTitle>
          <DialogDescription>
            Planilha preparada para a carga inicial (CSV separado por ponto e vírgula). O código do
            Uniplus vira o código e a referência do produto. Nada é gravado antes de você conferir a
            prévia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={aoEscolherArquivo}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={lendo || importando}
              onClick={() => inputRef.current?.click()}
            >
              {lendo ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <FileUp size={14} className="mr-1.5" />
              )}
              Escolher arquivo
            </Button>
            {nomeArquivo && <span className="text-slate-600">{nomeArquivo}</span>}
          </div>

          {erroLeitura && <p className="text-red-600">{erroLeitura}</p>}

          {linhas.length > 0 && (
            <>
              <div className="flex flex-wrap gap-4">
                <span>
                  Novos: <strong>{novos.length}</strong> (ativos:{' '}
                  {novos.filter((l) => l.ativo).length}, suspensos:{' '}
                  {novos.filter((l) => !l.ativo).length})
                </span>
                <span>
                  Já cadastrados: <strong>{existentes.length}</strong>
                </span>
                <span className={comErro.length ? 'text-red-600' : ''}>
                  Com erro: <strong>{comErro.length}</strong>
                </span>
                <span>
                  Com aviso: <strong>{comAviso.length}</strong>
                </span>
                {concluido && (
                  <span>
                    Gravados: <strong>{gravados.length}</strong>
                    {falhas.length > 0 && (
                      <span className="text-red-600"> · Falharam: {falhas.length}</span>
                    )}
                  </span>
                )}
              </div>

              {!concluido && (
                <div className="flex flex-wrap items-center gap-2">
                  <span>Importar só os primeiros</span>
                  <Input
                    className="h-8 w-24"
                    inputMode="numeric"
                    value={limite}
                    disabled={importando}
                    onChange={(e) => setLimite(e.target.value.replace(/\D/g, ''))}
                  />
                  <span className="text-slate-500">
                    novos (deixe vazio ou 0 para importar todos). Serão gravados:{' '}
                    <strong>{aImportar.length}</strong>
                  </span>
                </div>
              )}

              {!concluido &&
                (gruposNovos.size > 0 ||
                  categoriasNovas.size > 0 ||
                  subcategoriasNovas.size > 0) && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    <p className="font-medium">Serão criados antes dos produtos:</p>
                    {[...gruposNovos].map((g) => (
                      <p key={g}>Grupo: {g}</p>
                    ))}
                    {[...categoriasNovas].map((c) => (
                      <p key={c}>Categoria: {c}</p>
                    ))}
                    {[...subcategoriasNovas].map((s) => (
                      <p key={s}>Subcategoria: {s}</p>
                    ))}
                  </div>
                )}

              {importando && (
                <div className="space-y-1">
                  <p className="text-slate-600">{etapa}</p>
                  <Progress value={progresso} />
                </div>
              )}

              <div className="flex gap-2 text-xs">
                {(['todos', 'avisos', 'erros'] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filtro === f ? 'default' : 'outline'}
                    className="h-7"
                    onClick={() => setFiltro(f)}
                  >
                    {f === 'todos' ? 'Todos' : f === 'avisos' ? 'Com aviso' : 'Com erro'}
                  </Button>
                ))}
                <span className="self-center text-slate-500">mostrando até 300 linhas</span>
              </div>

              <div className="max-h-80 overflow-auto rounded border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left">
                    <tr>
                      <th className="p-2">Código</th>
                      <th className="p-2">Descrição</th>
                      <th className="p-2">Classificação</th>
                      <th className="p-2">Perfil</th>
                      <th className="p-2 text-right">Venda</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((l) => (
                      <tr key={l.linha} className="border-t border-slate-100 align-top">
                        <td className="p-2">{l.codigo}</td>
                        <td className="p-2">
                          {l.descricao}
                          {l.avisos.length > 0 && (
                            <span className="block text-amber-700">{l.avisos.join('; ')}</span>
                          )}
                        </td>
                        <td className="p-2">
                          {[l.grupo, l.categoria, l.subcategoria].filter(Boolean).join(' > ') ||
                            '-'}
                        </td>
                        <td className="p-2">{l.perfil || '-'}</td>
                        <td className="p-2 text-right">{l.precoVenda.toFixed(2)}</td>
                        <td className="p-2">{l.ativo ? 'Ativo' : 'Suspenso'}</td>
                        <td
                          className={
                            'p-2 ' +
                            (l.resultado === 'falhou' || l.situacao === 'erro'
                              ? 'text-red-600'
                              : l.situacao === 'novo'
                                ? 'text-emerald-700'
                                : 'text-slate-500')
                          }
                        >
                          {l.resultado === 'gravado'
                            ? 'Gravado'
                            : l.resultado === 'falhou'
                              ? `Falhou: ${l.erroGravacao}`
                              : l.situacao === 'novo'
                                ? 'Novo'
                                : l.motivo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {linhas.length > 0 && (
            <Button variant="outline" onClick={baixarResultado} disabled={importando}>
              <Download size={14} className="mr-1.5" />
              Baixar resultado
            </Button>
          )}
          <Button variant="outline" onClick={fechar} disabled={importando}>
            {concluido ? 'Fechar' : 'Cancelar'}
          </Button>
          {!concluido && (
            <Button onClick={importar} disabled={importando || aImportar.length === 0}>
              {importando ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Upload size={14} className="mr-1.5" />
              )}
              Importar {aImportar.length} produtos
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
