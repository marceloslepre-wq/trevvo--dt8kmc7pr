import { useRef, useState } from 'react'
import { Download, FileUp, Loader2, Upload } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Cliente, normalizarCpfCnpj, salvarCliente } from '@/services/clientes'
import { registrarAuditoria } from '@/services/auditoria'
import { validarCNPJ, validarCPF, validarInscricaoEstadual } from '@/lib/validacoes'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
 * Importação de clientes por planilha CSV (separada por ";"), com prévia.
 * Feita para a carga inicial do Uniplus, mas serve para qualquer planilha com o cabeçalho abaixo.
 * Colunas reconhecidas: codigo_uniplus, tipo_pessoa, cpf_cnpj, nome_razao_social, nome_fantasia, ie,
 * uf, municipio, codigo_municipio_ibge, telefone, celular, email, cep, logradouro, numero,
 * complemento, bairro, ultima_compra.
 *
 * - CPF/CNPJ que ainda não existe: cliente novo, gravado pelo mesmo caminho da tela (salvarCliente).
 *   O código do Uniplus vira o código do cliente quando estiver livre.
 * - CPF/CNPJ que já existe: só completa os campos que estão VAZIOS no Trevvo (nunca sobrescreve).
 *   Assim, uma planilha futura com endereço/e-mail pode ser importada de novo para completar.
 */

type Situacao = 'novo' | 'completar' | 'existe' | 'erro'

const CAMPOS_COMPLETAVEIS = [
  'telefone',
  'celular',
  'email',
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'municipio',
  'codigo_municipio_ibge',
  'uf',
] as const
type CampoCompletavel = (typeof CAMPOS_COMPLETAVEIS)[number]

interface LinhaCliente {
  linha: number
  codigo_uniplus: string
  tipo_pessoa: 'Física' | 'Jurídica'
  cpf_cnpj: string
  nome_razao_social: string
  nome_fantasia: string
  ie: string
  uf: string
  municipio: string
  codigo_municipio_ibge: string
  telefone: string
  celular: string
  email: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  ultima_compra: string
  situacao: Situacao
  motivo: string
  existenteId?: string
  completar?: Partial<Record<CampoCompletavel, string>>
  resultado?: 'gravado' | 'falhou'
  erroGravacao?: string
}

interface ClienteExistente {
  id: string
  codigo: number
  cpf_cnpj: string
  [campo: string]: unknown
}

function lerCsv(texto: string): Record<string, string>[] {
  const linhas = texto
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
  if (linhas.length < 2) return []
  const cabecalho = linhas[0].split(';').map((c) => c.trim().toLowerCase())
  return linhas.slice(1).map((l) => {
    const valores = l.split(';')
    const registro: Record<string, string> = {}
    cabecalho.forEach((c, i) => {
      registro[c] = (valores[i] || '').trim().replace(/^"|"$/g, '')
    })
    return registro
  })
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

/** Indicador de IE: '1' contribuinte (IE válida), '2' isento, '9' não contribuinte. */
function indicadorIe(l: LinhaCliente): {
  indicador: '1' | '2' | '9'
  ie: string
  aviso: string
} {
  if (l.tipo_pessoa !== 'Jurídica' || !l.ie) return { indicador: '9', ie: '', aviso: '' }
  if (l.ie.toUpperCase().startsWith('ISENT')) return { indicador: '2', ie: '', aviso: '' }
  if (validarInscricaoEstadual(l.ie, l.uf).valido) return { indicador: '1', ie: l.ie, aviso: '' }
  return {
    indicador: '9',
    ie: '',
    aviso: 'IE inválida para a UF: entra como não contribuinte',
  }
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onConcluido: () => void
}

export default function ImportarClientesDialog({ aberto, onFechar, onConcluido }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [linhas, setLinhas] = useState<LinhaCliente[]>([])
  const [lendo, setLendo] = useState(false)
  const [erroLeitura, setErroLeitura] = useState('')
  const [somenteTeste, setSomenteTeste] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'erros'>('todos')
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [concluido, setConcluido] = useState(false)
  const codigosUsados = useRef<Set<number>>(new Set())

  const novos = linhas.filter((l) => l.situacao === 'novo')
  const completar = linhas.filter((l) => l.situacao === 'completar')
  const existentes = linhas.filter((l) => l.situacao === 'existe')
  const comErro = linhas.filter((l) => l.situacao === 'erro')
  const gravados = linhas.filter((l) => l.resultado === 'gravado')
  const falhas = linhas.filter((l) => l.resultado === 'falhou')
  const pendentes = linhas.filter(
    (l) => (l.situacao === 'novo' || l.situacao === 'completar') && l.resultado !== 'gravado',
  )
  const aImportar = somenteTeste ? pendentes.slice(0, 50) : pendentes

  function limpar() {
    setNomeArquivo('')
    setLinhas([])
    setErroLeitura('')
    setProgresso(0)
    setConcluido(false)
    setFiltro('todos')
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
      const texto = await arquivo.text()
      const registros = lerCsv(texto)
      if (registros.length === 0) {
        throw new Error('O arquivo está vazio ou não tem cabeçalho.')
      }
      if (!('cpf_cnpj' in registros[0]) || !('nome_razao_social' in registros[0])) {
        throw new Error(
          'O cabeçalho precisa ter as colunas cpf_cnpj e nome_razao_social, separadas por ";".',
        )
      }

      // Clientes já cadastrados no assinante (a regra da coleção já limita ao assinante do usuário)
      const banco = await comRepeticao(() =>
        pb.collection('clientes').getFullList<ClienteExistente>({
          fields: ['id', 'codigo', 'cpf_cnpj', ...CAMPOS_COMPLETAVEIS].join(','),
          batch: 1000,
        }),
      )
      const porDocumento = new Map<string, ClienteExistente>()
      codigosUsados.current = new Set()
      for (const c of banco) {
        const doc = normalizarCpfCnpj(c.cpf_cnpj)
        if (doc) porDocumento.set(doc, c)
        if (c.codigo) codigosUsados.current.add(Number(c.codigo))
      }
      const vistosNoArquivo = new Set<string>()

      const resultado: LinhaCliente[] = registros.map((r, i) => {
        const doc = normalizarCpfCnpj(r.cpf_cnpj)
        const tipo: 'Física' | 'Jurídica' =
          r.tipo_pessoa === 'Jurídica' || doc.length === 14 ? 'Jurídica' : 'Física'
        const base: LinhaCliente = {
          linha: i + 2,
          codigo_uniplus: (r.codigo_uniplus || '').replace(/\D/g, ''),
          tipo_pessoa: tipo,
          cpf_cnpj: doc,
          nome_razao_social: (r.nome_razao_social || '').slice(0, 60),
          nome_fantasia: (r.nome_fantasia || '').slice(0, 60),
          ie: (r.ie || '').toUpperCase(),
          uf: (r.uf || '').toUpperCase(),
          municipio: r.municipio || '',
          codigo_municipio_ibge: (r.codigo_municipio_ibge || '').replace(/\D/g, ''),
          telefone: r.telefone || '',
          celular: r.celular || '',
          email: (r.email || '').toLowerCase(),
          cep: (r.cep || '').replace(/\D/g, ''),
          logradouro: r.logradouro || '',
          numero: r.numero || '',
          complemento: r.complemento || '',
          bairro: r.bairro || '',
          ultima_compra: r.ultima_compra || '',
          situacao: 'novo',
          motivo: '',
        }

        const docValido = tipo === 'Jurídica' ? validarCNPJ(doc) : validarCPF(doc)
        if (!doc || !docValido) {
          return {
            ...base,
            situacao: 'erro',
            motivo: tipo === 'Jurídica' ? 'CNPJ inválido' : 'CPF inválido',
          }
        }
        if (!base.nome_razao_social.trim()) {
          return { ...base, situacao: 'erro', motivo: 'Nome vazio' }
        }
        if (vistosNoArquivo.has(doc)) {
          return {
            ...base,
            situacao: 'erro',
            motivo: 'CPF/CNPJ repetido no arquivo',
          }
        }
        vistosNoArquivo.add(doc)

        const existente = porDocumento.get(doc)
        if (existente) {
          const faltando: Partial<Record<CampoCompletavel, string>> = {}
          for (const campo of CAMPOS_COMPLETAVEIS) {
            const novo = base[campo]
            const atual = String(existente[campo] ?? '').trim()
            if (novo && !atual) faltando[campo] = novo
          }
          const qtd = Object.keys(faltando).length
          return qtd > 0
            ? {
                ...base,
                situacao: 'completar',
                motivo: `Já cadastrado: completa ${qtd} campo(s) vazio(s)`,
                existenteId: existente.id,
                completar: faltando,
              }
            : {
                ...base,
                situacao: 'existe',
                motivo: 'Já cadastrado (será pulado)',
              }
        }

        const avisoIe = indicadorIe(base).aviso
        return { ...base, motivo: avisoIe }
      })
      setLinhas(resultado)
    } catch (err) {
      setErroLeitura(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.')
    } finally {
      setLendo(false)
    }
  }

  async function gravarNovo(l: LinhaCliente) {
    const { indicador, ie } = indicadorIe(l)
    const codigoUniplus = Number(l.codigo_uniplus) || 0
    const codigoLivre = codigoUniplus > 0 && !codigosUsados.current.has(codigoUniplus)
    const dados: Partial<Cliente> = {
      tipo_pessoa: l.tipo_pessoa,
      cpf_cnpj: l.cpf_cnpj,
      nome_razao_social: l.nome_razao_social,
      nome_fantasia: l.nome_fantasia || undefined,
      indicador_ie: indicador,
      inscricao_estadual: ie,
      consumidor_final: true,
      uf: l.uf || undefined,
      municipio: l.municipio || undefined,
      codigo_municipio_ibge: l.codigo_municipio_ibge || undefined,
      cep: l.cep || undefined,
      logradouro: l.logradouro || undefined,
      numero: l.numero || undefined,
      complemento: l.complemento || undefined,
      bairro: l.bairro || undefined,
      codigo_pais: '1058',
      pais: 'Brasil',
      entrega_mesmo_endereco: true,
      telefone: l.telefone || undefined,
      celular: l.celular || undefined,
      email: l.email || undefined,
      ativo: true,
      observacoes: [
        l.codigo_uniplus
          ? `Importado do Uniplus (código ${l.codigo_uniplus}).`
          : 'Importado por planilha.',
        l.ultima_compra ? `Última compra no Uniplus: ${l.ultima_compra}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    }
    if (codigoLivre) dados.codigo = codigoUniplus
    const gravado = await comRepeticao(() => salvarCliente(dados))
    if (gravado?.codigo) codigosUsados.current.add(Number(gravado.codigo))
  }

  async function completarExistente(l: LinhaCliente) {
    if (!l.existenteId || !l.completar) return
    const antes = await comRepeticao(() =>
      pb.collection('clientes').getOne<Record<string, unknown>>(l.existenteId!),
    )
    // Confere de novo no banco: só grava o que continua vazio
    const payload: Record<string, string> = {}
    for (const [campo, valor] of Object.entries(l.completar)) {
      if (valor && !String(antes[campo] ?? '').trim()) payload[campo] = valor
    }
    if (Object.keys(payload).length === 0) return
    payload.updated_by = pb.authStore.record?.id || ''
    const depois = await comRepeticao(() =>
      pb.collection('clientes').update<Record<string, unknown>>(l.existenteId!, payload),
    )
    await registrarAuditoria({
      tabela: 'clientes',
      registro_id: l.existenteId,
      acao: 'alteracao',
      valores_antes: antes,
      valores_depois: depois,
    })
  }

  async function importar() {
    if (aImportar.length === 0) return
    setImportando(true)
    setProgresso(0)
    const alvo = new Set(aImportar.map((l) => l.linha))
    const atualizadas = [...linhas]
    let feitos = 0
    try {
      for (let i = 0; i < atualizadas.length; i++) {
        const l = atualizadas[i]
        if (!alvo.has(l.linha)) continue
        try {
          if (l.situacao === 'novo') await gravarNovo(l)
          else await completarExistente(l)
          atualizadas[i] = {
            ...l,
            resultado: 'gravado',
            erroGravacao: undefined,
          }
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
    } finally {
      setLinhas([...atualizadas])
      setImportando(false)
      setConcluido(true)
    }
  }

  function baixarResultado() {
    const cel = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const situacao = (l: LinhaCliente) =>
      l.resultado === 'gravado'
        ? l.situacao === 'novo'
          ? 'Gravado'
          : 'Completado'
        : l.resultado === 'falhou'
          ? `Falhou: ${l.erroGravacao || ''}`
          : l.situacao === 'novo' || l.situacao === 'completar'
            ? 'Não importado ainda'
            : l.motivo
    const cabecalho = [
      'codigo_uniplus',
      'cpf_cnpj',
      'nome_razao_social',
      'uf',
      'municipio',
      'situacao',
      'aviso',
    ]
    const corpo = linhas.map((l) =>
      [l.codigo_uniplus, l.cpf_cnpj, l.nome_razao_social, l.uf, l.municipio, situacao(l), l.motivo]
        .map(cel)
        .join(';'),
    )
    const blob = new Blob(['﻿' + [cabecalho.join(';'), ...corpo].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `resultado-importacao-clientes-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const visiveis = linhas
    .filter((l) => (filtro === 'erros' ? l.situacao === 'erro' || l.resultado === 'falhou' : true))
    .slice(0, 300)

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-5xl notranslate" translate="no">
        <DialogHeader>
          <DialogTitle>Importar clientes</DialogTitle>
          <DialogDescription>
            Planilha CSV separada por ponto e vírgula, com as colunas cpf_cnpj e nome_razao_social
            no cabeçalho. Cliente que já existe (mesmo CPF/CNPJ) não é duplicado: só os campos
            vazios dele são completados. Nada é gravado antes de você conferir a prévia.
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
                  Novos: <strong>{novos.length}</strong>
                </span>
                <span>
                  Para completar: <strong>{completar.length}</strong>
                </span>
                <span>
                  Já cadastrados: <strong>{existentes.length}</strong>
                </span>
                <span className={comErro.length ? 'text-red-600' : ''}>
                  Com erro: <strong>{comErro.length}</strong>
                </span>
                {(concluido || gravados.length > 0) && (
                  <span>
                    Gravados: <strong>{gravados.length}</strong>
                    {falhas.length > 0 && (
                      <span className="text-red-600"> · Falharam: {falhas.length}</span>
                    )}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={somenteTeste}
                    disabled={importando}
                    onCheckedChange={(v) => setSomenteTeste(v === true)}
                  />
                  Importar só os próximos 50 (teste)
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={filtro === 'erros'}
                    onCheckedChange={(v) => setFiltro(v === true ? 'erros' : 'todos')}
                  />
                  Mostrar só erros e falhas
                </label>
              </div>

              {importando && <Progress value={progresso} />}

              <div className="max-h-80 overflow-auto rounded border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left">
                    <tr>
                      <th className="p-2">Linha</th>
                      <th className="p-2">Cód. Uniplus</th>
                      <th className="p-2">CPF/CNPJ</th>
                      <th className="p-2">Nome</th>
                      <th className="p-2">Cidade/UF</th>
                      <th className="p-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((l) => (
                      <tr key={l.linha} className="border-t border-slate-100">
                        <td className="p-2">{l.linha}</td>
                        <td className="p-2">{l.codigo_uniplus || '-'}</td>
                        <td className="p-2 font-mono">{l.cpf_cnpj}</td>
                        <td className="p-2">{l.nome_razao_social}</td>
                        <td className="p-2">
                          {l.municipio}
                          {l.uf ? `/${l.uf}` : ''}
                        </td>
                        <td
                          className={
                            'p-2 ' +
                            (l.situacao === 'erro' || l.resultado === 'falhou'
                              ? 'text-red-600'
                              : l.situacao === 'existe'
                                ? 'text-slate-500'
                                : 'text-emerald-700')
                          }
                        >
                          {l.resultado === 'gravado'
                            ? l.situacao === 'novo'
                              ? 'Gravado'
                              : 'Completado'
                            : l.resultado === 'falhou'
                              ? `Falhou: ${l.erroGravacao}`
                              : l.situacao === 'novo'
                                ? `Novo${l.motivo ? ` (${l.motivo})` : ''}`
                                : l.motivo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {linhas.length > 300 && (
                <p className="text-xs text-slate-500">
                  Mostrando as primeiras 300 linhas. Use "Baixar resultado" para ver todas.
                </p>
              )}
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
          <Button onClick={importar} disabled={importando || aImportar.length === 0}>
            {importando ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Upload size={14} className="mr-1.5" />
            )}
            Importar {aImportar.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
