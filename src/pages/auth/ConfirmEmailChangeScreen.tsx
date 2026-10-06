import React, { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ConfirmEmailChangeScreen() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { confirmEmailChange, logout } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      setError('Token de confirmação ausente na URL.')
      return
    }
    if (!password) {
      setError('Digite sua senha para autorizar a troca de e-mail.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      await confirmEmailChange(token, password)
      logout()
      setIsSuccess(true)
      toast({
        title: 'E-mail alterado com sucesso',
        description: 'Faça login com o novo endereço de e-mail.',
      })
      setTimeout(() => {
        navigate('/login')
      }, 2500)
    } catch {
      setError(
        'Não foi possível confirmar a alteração. Token inválido, expirado ou senha incorreta.',
      )
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
              Confirmar Troca de E-mail
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Autorize a atualização do endereço de e-mail de acesso
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!token ? (
              <div className="space-y-4 text-center py-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm text-slate-600">
                  O link de confirmação não possui o token obrigatório. Verifique o link recebido
                  por e-mail.
                </p>
                <Button asChild variant="outline" className="w-full border-slate-300">
                  <Link to="/login">Voltar ao Login</Link>
                </Button>
              </div>
            ) : isSuccess ? (
              <div className="space-y-4 text-center py-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    E-mail alterado com sucesso!
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Faça login com o novo endereço para continuar utilizando o ERP.
                  </p>
                </div>
                <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  <Link to="/login">Ir para o Login</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <p className="text-xs text-slate-600">
                  Para sua segurança, informe sua senha atual para confirmar a alteração de e-mail.
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                    Sua Senha Atual
                  </Label>
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
                        if (error) setError(null)
                      }}
                      className="pl-9 pr-10 border-slate-300 focus-visible:border-blue-600 focus-visible:ring-blue-100"
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
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors h-10 shadow-sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Confirmando...
                    </>
                  ) : (
                    'Confirmar alteração de e-mail'
                  )}
                </Button>

                <div className="pt-2 text-center">
                  <Link
                    to="/login"
                    className="text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Voltar para o login
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
