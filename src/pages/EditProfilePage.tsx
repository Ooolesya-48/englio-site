import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import styles from './EditProfilePage.module.css';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const EditProfilePage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.user_metadata?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [level, setLevel] = useState(user?.user_metadata?.language_level || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.user_metadata?.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const ext = file.name.split('.').pop();
    const fileName = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      setMsg('Ошибка загрузки фото');
      return;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
    const url = data.publicUrl + '?t=' + Date.now();
    setAvatarUrl(url);

    await supabase.auth.updateUser({ data: { avatar_url: url } });
    setMsg('Фото обновлено!');
    setTimeout(() => setMsg(''), 2000);
  };

  const handleSave = async () => {
    setSaving(true);

    const updates: any = {
      data: {
        display_name: displayName,
        language_level: level,
        avatar_url: avatarUrl,
      },
    };

    // If email changed
    if (email !== user?.email) {
      updates.email = email;
    }

    const { error } = await supabase.auth.updateUser(updates);
    setSaving(false);

    if (error) {
      setMsg(error.message);
    } else {
      const emailChanged = email !== user?.email;
      setMsg(emailChanged ? 'Сохранено! Подтвердите новую почту по ссылке из письма.' : 'Сохранено!');
      if (!emailChanged) {
        setTimeout(() => { setMsg(''); navigate('/profile'); }, 1000);
      }
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      setPasswordMsg('Минимум 6 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg('Пароли не совпадают');
      return;
    }
    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordLoading(false);
    if (error) {
      setPasswordMsg(error.message);
    } else {
      setPasswordMsg('Пароль изменён!');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setShowPasswordModal(false); setPasswordMsg(''); }, 1500);
    }
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordMsg('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate('/profile')}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h2 className={styles.headerTitle}>Изменить профиль</h2>
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#3dbaaa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* Avatar */}
      <div className={styles.avatarSection}>
        <label className={styles.avatarLabel}>
          <div className={styles.avatarRing}>
            <div className={styles.avatar}>
              {avatarUrl
                ? <img src={avatarUrl} alt="" className={styles.avatarImg} />
                : (displayName || 'U').charAt(0).toUpperCase()
              }
            </div>
          </div>
          <div className={styles.editBadge}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <input type="file" accept="image/*" className={styles.fileInput} onChange={handleAvatarChange} />
        </label>
      </div>

      {msg && <p className={styles.msg}>{msg}</p>}

      {/* Fields */}
      <div className={styles.fields}>
        <div className={styles.field}>
          <label className={styles.label}>Имя</label>
          <input
            type="text"
            className={styles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ваше имя"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Почта</label>
          <input
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
          />
          {email !== user?.email && (
            <p className={styles.fieldHint}>На новую почту придёт письмо для подтверждения</p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Пароль</label>
          <button className={styles.changePasswordBtn} onClick={() => setShowPasswordModal(true)}>
            Сменить пароль
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Подключить Telegram</label>
          <button className={styles.telegramBtn} disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 3L1 10.5l7.5 2.5M21 3l-5 18-7.5-8M21 3L8.5 13" stroke="#229ED9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Скоро
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Уровень английского</label>
          <div className={styles.levelGrid}>
            {LEVELS.map((l) => (
              <button
                key={l}
                className={`${styles.levelBtn} ${level === l ? styles.levelActive : ''}`}
                onClick={() => setLevel(l)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Password modal */}
      {showPasswordModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Сменить пароль</h3>

            <div className={styles.modalFields}>
              <input
                type="password"
                className={styles.input}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Новый пароль"
              />
              <input
                type="password"
                className={styles.input}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
                onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
              />
            </div>

            {passwordMsg && (
              <p className={`${styles.modalMsg} ${passwordMsg === 'Пароль изменён!' ? styles.success : styles.error}`}>
                {passwordMsg}
              </p>
            )}

            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={closePasswordModal}>
                Отмена
              </button>
              <button className={styles.modalConfirm} onClick={handleChangePassword} disabled={passwordLoading}>
                {passwordLoading ? '...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditProfilePage;
