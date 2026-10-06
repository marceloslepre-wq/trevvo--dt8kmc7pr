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

export default function ResetPasswordScreen() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; passwordConfirm?: string }>({})

  const { confirmPasswordReset } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const validate = (): boolean => {
    const errs: { password?: string; passwordConfirm?: string } = {}
    if (!password) {
      errs.password = 'Nova senha é obrigatória.'
    } else if (password.length < 8) {
      errs.password = 'A senha deve conter no mínimo 8 caracteres.'
    }

    if (!passwordConfirm) {
      errs.passwordConfirm = 'Confirmação de senha é obrigatória.'
    } else if (password !== passwordConfirm) {
      errs.passwordConfirm = 'As senhas não conferem.'
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      toast({
        variant: 'destructive',
        title: 'Token ausente',
        description: 'Link de redefinição inválido ou incompleto.',
      })
      return
    }

    if (!validate()) return

    setIsSubmitting(true)
    try {
      await confirmPasswordReset(token, password, passwordConfirm)
      setIsSuccess(true)
      toast({
        title: 'Senha atualizada com sucesso',
        description: 'Você já pode acessar o sistema com sua nova senha.',
      })
      setTimeout(() => {
        navigate('/login')
      }, 2500)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro na redefinição',
        description: 'O link expirou ou é inválido. Solicite uma nova recuperação.',
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
              Redefinir Senha
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Crie uma nova senha de acesso segura para sua conta
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!token ? (
              <div className="space-y-4 text-center py-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <p className="text-sm text-slate-600">
                  O token de redefinição não foi informado no endereço da página. Por favor, utilize
                  o link completo enviado por e-mail.
                </p>
                <Button asChild variant="outline" className="w-full border-slate-300">
                  <Link to="/esqueci-senha">Solicitar nova recuperação</Link>
                </Button>
              </div>
            ) : isSuccess ? (
              <div className="space-y-4 text-center py-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-800">Senha alterada com sucesso!</p>
                <p className="text-xs text-slate-500">
                  Redirecionando para o login em instantes...
                </p>
                <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  <Link to="/login">Ir para o Login</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-sm font-medium text-slate-700">
                    Nova Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
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

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">
                    Confirmar Nova Senha
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repita a nova senha"
                      value={passwordConfirm}
                      onChange={(e) => {
                        setPasswordConfirm(e.target.value)
                        if (errors.passwordConfirm)
                          setErrors((prev) => ({ ...prev, passwordConfirm: undefined }))
                      }}
                      className={`pl-9 border-slate-300 focus-visible:border-blue-600 focus-visible:ring-blue-100 ${
                        errors.passwordConfirm ? 'border-red-500 focus-visible:ring-red-100' : ''
                      }`}
                      disabled={isSubmitting}
                    />
                  </div>
                  {errors.passwordConfirm && (
                    <p className="text-xs text-red-600">{errors.passwordConfirm}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors h-10 shadow-sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar nova senha'
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
