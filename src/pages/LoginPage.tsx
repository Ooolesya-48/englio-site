import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import styles from './LoginPage.module.css';

type FormType = 'login' | 'register' | 'reset' | null;

const LoginPage: React.FC = () => {
  const { user, signIn, signUp, resetPassword } = useAuth();
  const [modal, setModal] = useState<FormType>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    if (modal) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [modal]);

  if (user) return <Navigate to="/home" replace />;

  const closeModal = () => {
    setModal(null);
    setName('');
    setEmail('');
    setPassword('');
    setErrors({});
    setSuccess('');
  };

  const switchForm = (to: FormType) => {
    setErrors({});
    setSuccess('');
    setModal(to);
  };

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (modal === 'register' && !name.trim()) errs.name = 'Введите имя';
    if (!email.trim()) errs.email = 'Введите email';
    if (modal !== 'reset' && !password.trim()) errs.password = 'Введите пароль';
    if (modal !== 'reset' && password.length > 0 && password.length < 6) errs.password = 'Минимум 6 символов';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      if (modal === 'login') {
        const { error } = await signIn(email, password);
        if (error) setErrors({ form: error });
      } else if (modal === 'register') {
        const { error } = await signUp(email, password, name);
        if (error) {
          setErrors({ form: error });
        } else {
          setSuccess('Аккаунт создан! Проверьте почту для подтверждения.');
        }
      } else if (modal === 'reset') {
        const { error } = await resetPassword(email);
        if (error) {
          setErrors({ form: error });
        } else {
          setSuccess('Письмо для сброса пароля отправлено!');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.card}>
      {/* Hero */}
      <div className={styles.hero}>
        <img className={styles.heroImg} src="/hero.png" alt="Girl with cat" />
        <div className={styles.logo}>
          <img src="/logo.svg" alt="Englio" />
        </div>
      </div>

      {/* Headline */}
      <p className={styles.headline}>
        Учите английские слова<br />бесплатно,&nbsp; быстро и навсегда
      </p>

      {/* Buttons */}
      <div className={styles.buttons}>
        <button className={styles.btnPrimary} onClick={() => setModal('login')}>
          Войти
        </button>
        <button className={styles.btnSecondary} onClick={() => setModal('register')}>
          Регистрация
        </button>
      </div>

      {/* Modal overlay — inside card */}
      {modal && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <button className={styles.btnClose} onClick={closeModal}>✕</button>

            {errors.form && <div className={styles.errorMsg}>{errors.form}</div>}
            {success && <div className={styles.successMsg}>{success}</div>}

            {/* Login */}
            {modal === 'login' && (
              <>
                <h2 className={styles.modalTitle}>Войти</h2>
                <div className={styles.field}>
                  <label>EMAIL</label>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={errors.email ? { borderColor: '#e74c3c' } : undefined}
                  />
                  {errors.email && <span className={styles.fieldError}>{errors.email}</span>}
                </div>
                <div className={styles.field}>
                  <label>ПАРОЛЬ</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={errors.password ? { borderColor: '#e74c3c' } : undefined}
                  />
                  {errors.password && <span className={styles.fieldError}>{errors.password}</span>}
                </div>
                <button className={styles.btnModal} onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Вход...' : 'Войти'}
                </button>
                <p className={styles.switchLink}>
                  <a onClick={() => switchForm('reset')}>Забыли пароль?</a>
                </p>
                <p className={styles.switchLink}>
                  Нет аккаунта?{' '}
                  <a onClick={() => switchForm('register')}>Зарегистрироваться</a>
                </p>
              </>
            )}

            {/* Register */}
            {modal === 'register' && (
              <>
                <h2 className={styles.modalTitle}>Регистрация</h2>
                <div className={styles.field}>
                  <label>ИМЯ</label>
                  <input
                    type="text"
                    placeholder="Ваше имя"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={errors.name ? { borderColor: '#e74c3c' } : undefined}
                  />
                  {errors.name && <span className={styles.fieldError}>{errors.name}</span>}
                </div>
                <div className={styles.field}>
                  <label>EMAIL</label>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={errors.email ? { borderColor: '#e74c3c' } : undefined}
                  />
                  {errors.email && <span className={styles.fieldError}>{errors.email}</span>}
                </div>
                <div className={styles.field}>
                  <label>ПАРОЛЬ</label>
                  <input
                    type="password"
                    placeholder="Придумайте пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={errors.password ? { borderColor: '#e74c3c' } : undefined}
                  />
                  {errors.password && <span className={styles.fieldError}>{errors.password}</span>}
                </div>
                <button className={styles.btnModal} onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Создание...' : 'Создать аккаунт'}
                </button>
                <p className={styles.switchLink}>
                  Уже есть аккаунт?{' '}
                  <a onClick={() => switchForm('login')}>Войти</a>
                </p>
              </>
            )}

            {/* Reset password */}
            {modal === 'reset' && (
              <>
                <h2 className={styles.modalTitle}>Восстановление пароля</h2>
                <div className={styles.field}>
                  <label>EMAIL</label>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={errors.email ? { borderColor: '#e74c3c' } : undefined}
                  />
                  {errors.email && <span className={styles.fieldError}>{errors.email}</span>}
                </div>
                <button className={styles.btnModal} onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Отправка...' : 'Отправить ссылку'}
                </button>
                <p className={styles.switchLink}>
                  <a onClick={() => switchForm('login')}>Назад ко входу</a>
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
