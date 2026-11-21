import { useMemo, useState } from 'react'
import { Copy, Mail, MessageCircle, Printer, Share2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

export interface DadosEnviarDocumentoFiscal {
  /** Nome fantasia da loja (assunto / texto do WhatsApp) */
  nomeLoja: string
  /** Número da NFC-e autorizada */
  numero: number | string
  /** Série da NFC-e (só exibição) */
  serie?: string
  /** Chave de acesso (só exibição) */
  chave?: string
  /** Valor total da venda */
  valor: number
  /** Forma de pagamento (só exibição) */
  formaPagamento?: string
  /** Caminho_danfe gravado no registro fiscal */
  caminhoDanfe?: string
  /** URL base da Focus NFe (para compor com caminho_danfe) */
  focusBaseUrl?: string
  /** Link de consulta do QR Code (consulta SEFAZ) */
  urlConsulta?: string
  /** Contatos preenchidos no cadastro do cliente (pré-preenchem os campos) */
  celularCliente?: string
  emailCliente?: string
  /** Bônus: quando a venda tem cliente identificado, permite salvar contato no cadastro */
  permitirSalvarNoCliente?: boolean
  /** Trevvo Móvel: botões empilhados, largura total, altura ≥48px (sem rolagem horizontal) */
  empilhado?: boolean
  /** Chamado quando o usuário marca para salvar contato no cadastro do cliente */
  onSalvarContato?: (celular: string, email: string) => Promise<void> | void
  /** Impressão do cupom — usa a impressão que o PDV já usa */
  onImprimir: () => void
}

/** Número em pt-BR para exibição (aplica máscara enquanto digita) */
function formatarCelular(digits: string): string {
  if (digits.length > 11) {
    const ddi = digits.slice(0, digits.length - 11)
    const rest = digits.slice(-11)
    return `+${ddi} (${rest.slice(0, 2)}) ${rest.slice(2, 7)}-${rest.slice(7)}`
  }
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return digits
}

export const EnviarDocumentoFiscal: React.FC<DadosEnviarDocumentoFiscal> = ({
  nomeLoja,
  numero,
  serie,
  chave,
  valor,
  formaPagamento,
  caminhoDanfe,
  focusBaseUrl,
  urlConsulta,
  celularCliente,
  emailCliente,
  permitirSalvarNoCliente,
  empilhado,
  onSalvarContato,
  onImprimir,
}) => {
  const { toast } = useToast()

  // Link do cupom: caminho_danfe com URL base da Focus se não tiver token; senão o link de consulta do QR Code.
  const linkCupom = useMemo(() => {
    if (caminhoDanfe) {
      const temUrlBase = /^https?:\/\//i.test(caminhoDanfe)
      const caminhoSemHost = temUrlBase
        ? caminhoDanfe.replace(/^https?:\/\/[^/]+/i, '')
        : caminhoDanfe
      const ehCaminhoErp = /^\/?backend\//i.test(caminhoSemHost)
      if (!temUrlBase && focusBaseUrl) {
        return `${focusBaseUrl}${caminhoDanfe}`
      }
      if (!ehCaminhoErp && temUrlBase) {
        return caminhoDanfe
      }
    }
    return urlConsulta || ''
  }, [caminhoDanfe, focusBaseUrl, urlConsulta])

  const [celular, setCelular] = useState(celularCliente || '')
  const [email, setEmail] = useState(emailCliente || '')
  const [salvarNoCliente, setSalvarNoCliente] = useState(false)

  // Compartilhar nativo: só existe em celular — no desktop o botão nem aparece
  const podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const handleCompartilhar = async () => {
    if (!linkCupom || !navigator.share) return
    try {
      await navigator.share({
        title: `NFC-e nº ${numero} - ${nomeLoja}`,
        text: `${nomeLoja} - NFC-e nº ${numero}, valor R$ ${valorFormatado}`,
        url: linkCupom,
      })
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        toast({ title: 'Não foi possível compartilhar o cupom', variant: 'destructive' })
      }
    }
  }

  // Trevvo Móvel: botões empilhados, largura total, ≥48px
  const classeBotaoAcao = empilhado
    ? 'h-12 w-full text-sm font-semibold'
    : 'h-9 text-xs font-semibold flex-1 min-w-[120px]'
  const classeContainerBotoes = empilhado
    ? 'flex flex-col gap-2'
    : 'flex flex-wrap items-center gap-2'
  const classeCampos = empilhado ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2'

  const valorFormatado = useMemo(
    () => valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [valor],
  )

  const normalizarCelular = (raw: string): string | null => {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return null
    const comDdi = digits.startsWith('55') ? digits : `55${digits}`
    if (comDdi.length !== 12 && comDdi.length !== 13) return null
    return comDdi
  }

  const handleCopiar = async () => {
    if (!linkCupom) return
    try {
      await navigator.clipboard.writeText(linkCupom)
      toast({ title: 'Link copiado' })
    } catch {
      toast({
        title: 'Não foi possível copiar',
        description: 'Selecione e copie manualmente.',
        variant: 'destructive',
      })
    }
  }

  const handleWhatsApp = () => {
    if (!linkCupom) return
    const numeroValido = normalizarCelular(celular)
    if (!numeroValido) {
      toast({
        title: 'Celular inválido',
        description: 'Informe o número com DDD (10 ou 11 dígitos).',
        variant: 'destructive',
      })
      return
    }
    const texto = encodeURIComponent(
      `${nomeLoja} - Sua NFC-e nº ${numero}, valor R$ ${valorFormatado}: ${linkCupom}`,
    )
    window.open(`https://wa.me/${numeroValido}?text=${texto}`, '_blank', 'noopener')
  }

  const handleEmail = () => {
    if (!linkCupom) return
    const emailTrim = email.trim()
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)
    if (!emailValido) {
      toast({
        title: 'E-mail inválido',
        description: 'Informe um e-mail válido para enviar o cupom.',
        variant: 'destructive',
      })
      return
    }
    const assunto = `NFC-e nº ${numero} - ${nomeLoja}`
    const corpo = `Olá!\n\nSegue o link do cupom da sua NFC-e nº ${numero} da ${nomeLoja}:\n\n${linkCupom}\n\nValor: R$ ${valorFormatado}\n\nObrigado pela preferência!`
    const mailto = `mailto:${encodeURIComponent(emailTrim)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`
    window.open(mailto, '_self')
  }

  return (
    <div className="space-y-3">
      {/* Link do cupom */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-slate-500 font-semibold uppercase">Link do cupom</Label>
          <span
            className="text-[10px] text-slate-400 truncate max-w-[220px]"
            title={linkCupom || '—'}
          >
            {linkCupom
              ? linkCupom.length > 42
                ? `${linkCupom.slice(0, 42)}…`
                : linkCupom
              : 'Link não disponível'}
          </span>
        </div>
        <div className={classeContainerBotoes}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={classeBotaoAcao}
            onClick={handleCopiar}
            disabled={!linkCupom}
          >
            <Copy size={14} className="mr-1.5" /> Copiar link
          </Button>
          {podeCompartilhar && (
            <Button
              type="button"
              size="sm"
              className={cn(classeBotaoAcao, 'bg-violet-600 hover:bg-violet-700 text-white')}
              onClick={() => void handleCompartilhar()}
              disabled={!linkCupom}
              title="Compartilha o link do cupom pelo sistema do celular"
            >
              <Share2 size={14} className="mr-1.5" /> Compartilhar
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className={cn(classeBotaoAcao, 'bg-emerald-600 hover:bg-emerald-700 text-white')}
            onClick={handleWhatsApp}
            disabled={!linkCupom}
          >
            <MessageCircle size={14} className="mr-1.5" /> WhatsApp
          </Button>
          <Button
            type="button"
            size="sm"
            className={cn(classeBotaoAcao, 'bg-blue-600 hover:bg-blue-700 text-white')}
            onClick={handleEmail}
            disabled={!linkCupom}
            title="Abre o app de e-mail com o link no corpo"
          >
            <Mail size={14} className="mr-1.5" /> E-mail
          </Button>
          <Button
            type="button"
            size="sm"
            className={cn(classeBotaoAcao, 'bg-slate-700 hover:bg-slate-800 text-white')}
            onClick={onImprimir}
          >
            <Printer size={14} className="mr-1.5" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Campos de celular/e-mail */}
      <div className={classeCampos}>
        <div className="space-y-1">
          <Label htmlFor="pdv-enviar-celular" className="text-[11px] text-slate-600 font-semibold">
            Celular do cliente (com DDD)
          </Label>
          <Input
            id="pdv-enviar-celular"
            value={formatarCelular(celular.replace(/\D/g, ''))}
            onChange={(e) => setCelular(e.target.value)}
            placeholder="(27) 99999-9999"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pdv-enviar-email" className="text-[11px] text-slate-600 font-semibold">
            E-mail do cliente
          </Label>
          <Input
            id="pdv-enviar-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@email.com"
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* Bônus: salvar contato no cadastro do cliente */}
      {permitirSalvarNoCliente && (celular.trim() !== '' || email.trim() !== '') && (
        <div className="flex items-start gap-2 bg-blue-50/50 border border-blue-100 rounded-lg p-2.5">
          <Checkbox
            id="pdv-enviar-salvar-contato"
            checked={salvarNoCliente}
            onCheckedChange={(v) => setSalvarNoCliente(v === true)}
          />
          <Label
            htmlFor="pdv-enviar-salvar-contato"
            className="text-[11px] text-slate-600 leading-snug cursor-pointer"
          >
            Salvar celular/e-mail no cadastro do cliente
          </Label>
        </div>
      )}

      {/* Chave de acesso */}
      {chave && (
        <div className="text-[10px] text-slate-400 font-mono break-all pt-1 border-t border-slate-100">
          <span className="text-slate-500 font-semibold font-sans block mb-0.5">
            Chave de acesso:
          </span>
          {chave}
        </div>
      )}
    </div>
  )
}

export default EnviarDocumentoFiscal
