import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useConfiguracoes } from '@/contexts/ConfiguracoesContext'
import { useToast } from '@/hooks/use-toast'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const { login } = useAuth()
  const { config } = useConfiguracoes()
  const { toast } = useToast()
  const navigate = useNavigate()

  const validate = (): boolean => {
    const errs: { email?: string; password?: string } = {}
    if (!email.trim()) {
      errs.email = 'E-mail é obrigatório.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Informe um e-mail válido.'
    }

    if (!password) {
      errs.password = 'Senha é obrigatória.'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      await login(email, password)
      toast({
        title: 'Login efetuado com sucesso',
        description: 'Bem-vindo ao sistema de gestão comercial.',
      })
      navigate('/painel', { replace: true })
    } catch (err: any) {
      const errMsg = err?.message || ''
      const ehLicencaBloqueada =
        errMsg.includes('Licença pausada ou vencida') || errMsg.includes('Fale com o suporte')

      toast({
        variant: 'destructive',
        title: ehLicencaBloqueada ? 'Acesso bloqueado' : 'Falha no login',
        description: ehLicencaBloqueada
          ? 'Licença pausada ou vencida. Fale com o suporte.'
          : 'E-mail ou senha incorretos.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 font-sans text-slate-900">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>

        <Card className="border-slate-200 shadow-md bg-white">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900">
              {config?.nome_sistema || 'Acesso ao Sistema'}
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Informe suas credenciais para entrar na plataforma
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                  E-mail
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="seu.email@empresa.com.br"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }))
                    }}
                    className={`pl-9 border-slate-300 focus-visible:border-blue-600 focus-visible:ring-blue-100 ${
                      errors.email ? 'border-red-500 focus-visible:ring-red-100' : ''
                    }`}
                    disabled={isSubmitting}
                  />
                </div>
                {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Senha
                  </Label>
                  <Link
                    to="/esqueci-senha"
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Esqueci minha senha
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }))
                    }}
                    className={`pl-9 pr-10 border-slate-300 focus-visible:border-blue-600 focus-visible:ring-blue-100 ${
                      errors.password ? 'border-red-500 focus-visible:ring-red-100' : ''
                    }`}
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-600">{errors.password}</p>}
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors h-10 shadow-sm"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 text-center space-y-2">
              <p className="text-xs text-slate-600">
                Quer criar um novo ambiente para sua empresa?{' '}
                <Link
                  to="/cadastro"
                  className="font-semibold text-blue-600 hover:text-blue-700 underline"
                >
                  Cadastre-se grátis
                </Link>
              </p>
              <p className="text-[11px] text-slate-400">
                Usuários adicionais de empresas já existentes são gerenciados pelo administrador.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
