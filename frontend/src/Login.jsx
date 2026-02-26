import React, { useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function Login({ onLogin }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Função para Entrar (Login)
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // O FastAPI usa formulário (form-data) para o login padrão
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        // Salva o token e avisa o App.jsx que estamos logados
        localStorage.setItem('token', data.access_token);
        onLogin(data); 
      } else {
        setError(data.detail || 'E-mail ou senha incorretos.');
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  // Função para Criar Conta (Register)
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('Conta criada com sucesso! Agora você pode entrar.');
        setIsRegistering(false);
      } else {
        setError(data.detail || 'Erro ao criar conta.');
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>🎸 LeviHub</h1>
        <p>{isRegistering ? 'Crie sua conta para gerenciar seu louvor' : 'Sua escala e repertório em um só lugar'}</p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={isRegistering ? handleRegister : handleLogin}>
          <div className="input-group">
            <label>E-mail</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              placeholder="exemplo@email.com"
            />
          </div>

          <div className="input-group">
            <label>Senha</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              placeholder="Sua senha"
            />
          </div>

          <button type="submit" className="login-btn-main" disabled={loading}>
            {loading ? 'Processando...' : (isRegistering ? 'Cadastrar Agora' : 'Entrar')}
          </button>
        </form>

        <div className="login-divider">ou</div>

        <button 
          className="login-btn-visitor" 
          onClick={() => onLogin(null)} // null indica que é visitante
          disabled={loading}
        >
          Entrar como Visitante
        </button>

        <div className="login-footer">
          {isRegistering ? (
            <p>Já tem uma conta? <span onClick={() => setIsRegistering(false)}>Faça Login</span></p>
          ) : (
            <p>Ainda não tem conta? <span onClick={() => setIsRegistering(true)}>Criar Conta</span></p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;