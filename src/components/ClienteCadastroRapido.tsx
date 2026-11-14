import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  Cliente,
  TipoPessoaCliente,
  salvarCliente,
  buscarClientePorCpfCnpj,
  ativarCliente,
  normalizarCpfCnpj,
} from '@/services/clientes'
import {
  validarCPF,
  validarCNPJ,
  formatarCPF,
  formatarCNPJ,
  formatarTelefone,
  formatarCEP,
  buscarViaCep,
} from '@/lib/validacoes'

export interface ClienteCadastroRapidoProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  onSucesso?: (cliente: Cliente) => void
  tipoPessoaInicial?: TipoPessoaCliente
}

export const ClienteCadastroRapido: React.FC<ClienteCadastroRapidoProps> = ({
  aberto,
  onOpenChange,
  onSucesso,
  tipoPessoaInicial = 'Física',
}) => {
  const { toast } = useToast()

  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoaCliente>(tipoPessoaInicial)
  const [nome, setNome] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cep, setCep] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enderecoAuto, setEnderecoAuto] = useState<{
    logradouro?: string
    bairro?: string
    municipio?: string
    uf?: string
    ibge?: string
  } | null>(null)

  const [salvando, setSalvando] = useState(false)
  const [erroValidacao, setErroValidacao] = useState<string | null>(null)
  const [clienteInativoEncontrado, setClienteInativoEncontrado] = useState<Cliente | null>(null)
  const [reativando, setReativando] = useState(false)

  const resetarForm = () => {
    setTipoPessoa(tipoPessoaInicial)
    setNome('')
    setCpfCnpj('')
    setTelefone('')
    setCep('')
    setEnderecoAuto(null)
    setErroValidacao(null)
    setClienteInativoEncontrado(null)
  }

  const handleMudarTipo = (novoTipo: TipoPessoaCliente) => {
    setTipoPessoa(novoTipo)
    setCpfCnpj('')
    setErroValidacao(null)
    setClienteInativoEncontrado(null)
  }

  const handleDocChange = async (valor: string) => {
    let formatado = valor
    if (tipoPessoa === 'Física') {
      formatado = formatarCPF(valor)
    } else if (tipoPessoa === 'Jurídica') {
      formatado = formatarCNPJ(valor)
    }
    setCpfCnpj(formatado)
    setErroValidacao(null)
    setClienteInativoEncontrado(null)

    const limpo = normalizarCpfCnpj(formatado)
    if (tipoPessoa === 'Física' && limpo.length === 11) {
      if (!validarCPF(limpo)) {
        setErroValidacao('CPF informado é inválido.')
        return
      }
      const existencia = await buscarClientePorCpfCnpj(limpo)
      if (existencia.ativo) {
        setErroValidacao(
          `Cliente já cadastrado e ativo: ${existencia.ativo.nome_razao_social} (Código ${existencia.ativo.codigo}).`,
        )
      } else if (existencia.inativo) {
        setClienteInativoEncontrado(existencia.inativo)
      }
    } else if (tipoPessoa === 'Jurídica' && limpo.length === 14) {
      if (!validarCNPJ(limpo)) {
        setErroValidacao('CNPJ informado é inválido.')
        return
      }
      const existencia = await buscarClientePorCpfCnpj(limpo)
      if (existencia.ativo) {
        setErroValidacao(
          `Cliente já cadastrado e ativo: ${existencia.ativo.nome_razao_social} (Código ${existencia.ativo.codigo}).`,
        )
      } else if (existencia.inativo) {
        setClienteInativoEncontrado(existencia.inativo)
      }
    }
  }

  const handleCepChange = async (valor: string) => {
    const formatado = formatarCEP(valor)
    setCep(formatado)

    const digitos = valor.replace(/\D/g, '')
    if (digitos.length === 8) {
      setBuscandoCep(true)
      const res = await buscarViaCep(digitos)
      setBuscandoCep(false)
      if (res && !res.erro) {
        setEnderecoAuto({
          logradouro: res.logradouro,
          bairro: res.bairro,
          municipio: res.localidade,
          uf: res.uf,
          ibge: res.ibge,
        })
      } else {
        setEnderecoAuto(null)
      }
    } else {
      setEnderecoAuto(null)
    }
  }

  const handleReativar = async () => {
    if (!clienteInativoEncontrado) return
    setReativando(true)
    try {
      const reativado = await ativarCliente(clienteInativoEncontrado.id)
      toast({
        title: 'Cliente reativado',
        description: `O cliente "${reativado.nome_razao_social}" foi reativado com sucesso.`,
      })
      onSucesso?.(reativado)
      onOpenChange(false)
      resetarForm()
    } catch (err) {
      toast({
        title: 'Erro ao reativar',
        description: err instanceof Error ? err.message : 'Falha na reativação.',
        variant: 'destructive',
      })
    } finally {
      setReativando(false)
    }
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroValidacao(null)

    const nomeLimpo = nome.trim()
    if (!nomeLimpo) {
      setErroValidacao('Informe o nome ou razão social.')
      return
    }

    const docLimpo = normalizarCpfCnpj(cpfCnpj)
    if (tipoPessoa === 'Física') {
      if (!docLimpo) {
        setErroValidacao('O CPF é obrigatório.')
        return
      }
      if (!validarCPF(docLimpo)) {
        setErroValidacao('CPF informado é inválido.')
        return
      }
    } else if (tipoPessoa === 'Jurídica') {
      if (!docLimpo) {
        setErroValidacao('O CNPJ é obrigatório.')
        return
      }
      if (!validarCNPJ(docLimpo)) {
        setErroValidacao('CNPJ informado é inválido.')
        return
      }
    }

    // Regras padrão de fiscal para cadastro rápido
    const indicador_ie = tipoPessoa === 'Física' ? '9' : '1'
    const consumidor_final = tipoPessoa === 'Física'

    setSalvando(true)
    try {
      const novo = await salvarCliente({
        tipo_pessoa: tipoPessoa,
        nome_razao_social: nomeLimpo,
        cpf_cnpj: docLimpo,
        telefone: telefone ? formatarTelefone(telefone) : undefined,
        cep: cep ? formatarCEP(cep) : undefined,
        logradouro: enderecoAuto?.logradouro || '',
        bairro: enderecoAuto?.bairro || '',
        municipio: enderecoAuto?.municipio || '',
        uf: enderecoAuto?.uf || '',
        codigo_municipio_ibge: enderecoAuto?.ibge || '',
        codigo_pais: '1058',
        pais: 'Brasil',
        indicador_ie,
        consumidor_final,
        ativo: true,
      })

      toast({
        title: 'Cliente cadastrado',
        description: `Cliente "${novo.nome_razao_social}" cadastrado com sucesso (Código ${novo.codigo}).`,
      })

      onSucesso?.(novo)
      onOpenChange(false)
      resetarForm()
    } catch (err) {
      setErroValidacao(err instanceof Error ? err.message : 'Falha ao salvar cliente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(abertoAgora) => {
        if (!abertoAgora) resetarForm()
        onOpenChange(abertoAgora)
      }}
    >
      <DialogContent className="sm:max-w-md w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white text-slate-900 border-slate-200">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-900">
            Cadastro Rápido de Cliente
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Cadastre os dados essenciais para atendimento ágil ou vendas no balcão/PDV.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSalvar} className="space-y-4 py-2">
          {erroValidacao && (
            <Alert
              variant="destructive"
              className="py-2 text-xs bg-red-50 border-red-200 text-red-700"
            >
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription>{erroValidacao}</AlertDescription>
            </Alert>
          )}

          {clienteInativoEncontrado && (
            <Alert className="py-2.5 text-xs bg-amber-50 border-amber-200 text-amber-900">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <div className="space-y-1">
                <AlertTitle className="font-semibold text-xs">
                  Cliente inativo encontrado
                </AlertTitle>
                <AlertDescription className="text-xs text-amber-800">
                  Já existe um cliente inativo com este documento:{' '}
                  <strong>{clienteInativoEncontrado.nome_razao_social}</strong> (Cód.{' '}
                  {clienteInativoEncontrado.codigo}). Deseja reativá-lo?
                </AlertDescription>
                <div className="pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleReativar}
                    disabled={reativando}
                    className="h-7 text-xs bg-white border-amber-300 text-amber-900 hover:bg-amber-100/70"
                  >
                    {reativando ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Reativar este cliente
                  </Button>
                </div>
              </div>
            </Alert>
          )}

          {/* Tipo de Pessoa */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Tipo de Pessoa *</Label>
            <Select
              value={tipoPessoa}
              onValueChange={(val) => handleMudarTipo(val as TipoPessoaCliente)}
            >
              <SelectTrigger className="h-9 text-xs bg-white border-slate-300 text-slate-900">
                <SelectValue placeholder="Selecione o tipo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Física">Pessoa Física</SelectItem>
                <SelectItem value="Jurídica">Pessoa Jurídica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Nome / Razão Social */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              {tipoPessoa === 'Jurídica' ? 'Razão Social *' : 'Nome Completo *'}
            </Label>
            <Input
              value={nome}
              maxLength={60}
              onChange={(e) => setNome(e.target.value)}
              placeholder={
                tipoPessoa === 'Jurídica'
                  ? 'Ex.: Distribuidora Exemplo LTDA'
                  : 'Ex.: Carlos Eduardo Pereira'
              }
              className="h-9 text-xs bg-white border-slate-300 text-slate-900"
              autoFocus
            />
            <p className="text-[10px] text-slate-400 text-right">{nome.length}/60</p>
          </div>

          {/* CPF / CNPJ */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              {tipoPessoa === 'Jurídica' ? 'CNPJ *' : 'CPF *'}
            </Label>
            <Input
              value={cpfCnpj}
              onChange={(e) => handleDocChange(e.target.value)}
              placeholder={tipoPessoa === 'Jurídica' ? '00.000.000/0000-00' : '000.000.000-00'}
              className="h-9 text-xs bg-white border-slate-300 text-slate-900"
            />
          </div>

          {/* Telefone */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">Telefone / Celular</Label>
            <Input
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
              placeholder="(00) 00000-0000"
              className="h-9 text-xs bg-white border-slate-300 text-slate-900"
            />
          </div>

          {/* CEP */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-700">CEP</Label>
              {buscandoCep && (
                <span className="text-[10px] text-blue-600 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Buscando endereço...
                </span>
              )}
            </div>
            <Input
              value={cep}
              onChange={(e) => handleCepChange(e.target.value)}
              placeholder="00000-000"
              className="h-9 text-xs bg-white border-slate-300 text-slate-900"
            />
            {enderecoAuto && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                {enderecoAuto.logradouro ? `${enderecoAuto.logradouro}, ` : ''}
                {enderecoAuto.bairro ? `${enderecoAuto.bairro} - ` : ''}
                {enderecoAuto.municipio}/{enderecoAuto.uf}
              </p>
            )}
          </div>

          <DialogFooter className="pt-2 flex sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={salvando}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={salvando}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
            >
              {salvando ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Cliente'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
