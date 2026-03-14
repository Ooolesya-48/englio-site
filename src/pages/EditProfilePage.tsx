import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const [msg, setMsg] = useState('');
  const [autoSaveMsg, setAutoSaveMsg] = useState('');

  // Password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Crop modal
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

  // Autosave: debounce name and level changes
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialName = useRef(user?.user_metadata?.display_name || '');
  const initialLevel = useRef(user?.user_metadata?.language_level || '');

  const autoSave = useCallback(async (name: string, lvl: string) => {
    if (name === initialName.current && lvl === initialLevel.current) return;
    const { error } = await supabase.auth.updateUser({
      data: { display_name: name, language_level: lvl, avatar_url: avatarUrl },
    });
    if (!error) {
      initialName.current = name;
      initialLevel.current = lvl;
      setAutoSaveMsg('Сохранено');
      setTimeout(() => setAutoSaveMsg(''), 2000);
    }
  }, [avatarUrl]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autoSave(displayName, level), 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [displayName, level, autoSave]);

  // --- Avatar crop ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCropFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImgSize({ w: img.width, h: img.height });
        setCropOffset({ x: 0, y: 0 });
        // Scale so shorter side fits 260px crop circle
        const minDim = Math.min(img.width, img.height);
        setCropScale(280 / minDim);
        setCropImage(src);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const onCropPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: cropOffset.x, oy: cropOffset.y };
  };

  const onCropPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    setCropOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };

  const onCropPointerUp = () => { dragStart.current = null; };

  const onCropTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStart.current = { dist: Math.sqrt(dx * dx + dy * dy), scale: cropScale };
    }
  };

  const onCropTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStart.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newScale = pinchStart.current.scale * (dist / pinchStart.current.dist);
      setCropScale(Math.max(0.1, Math.min(5, newScale)));
    }
  };

  const onCropWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setCropScale(s => Math.max(0.1, Math.min(5, s - e.deltaY * 0.001)));
  };

  const cropAndUpload = async () => {
    if (!cropImage || !user) return;
    const CROP_SIZE = 260;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d')!;

    const img = new Image();
    img.src = cropImage;
    await new Promise(r => { img.onload = r; });

    // Calculate what part of the original image is visible in the crop circle
    const scale = cropScale;
    const imgW = imgSize.w * scale;
    const imgH = imgSize.h * scale;

    // Image center relative to crop circle center
    const cx = cropOffset.x;
    const cy = cropOffset.y;

    // Source rect in original image coords
    const srcX = ((imgW / 2 - cx) - CROP_SIZE / 2) / scale;
    const srcY = ((imgH / 2 - cy) - CROP_SIZE / 2) / scale;
    const srcW = CROP_SIZE / scale;
    const srcH = CROP_SIZE / scale;

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 400, 400);

    canvas.toBlob(async (blob) => {
      if (!blob) { setMsg('Ошибка обработки фото'); return; }

      const fileName = `${user.id}/avatar.webp`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, { upsert: true, contentType: 'image/webp' });

      if (uploadError) {
        console.error('Avatar upload error:', uploadError);
        setMsg(`Ошибка: ${uploadError.message}`);
        setCropImage(null);
        return;
      }

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const url = data.publicUrl + '?t=' + Date.now();
      setAvatarUrl(url);
      await supabase.auth.updateUser({ data: { avatar_url: url } });
      setCropImage(null);
      setAutoSaveMsg('Фото обновлено!');
      setTimeout(() => setAutoSaveMsg(''), 2000);
    }, 'image/webp', 0.85);
  };

  // --- Email save (manual) ---
  const handleSaveEmail = async () => {
    if (email === user?.email) return;
    const { error } = await supabase.auth.updateUser({ email });
    if (error) {
      setMsg(error.message);
    } else {
      setMsg('Подтвердите новую почту по ссылке из письма');
      setTimeout(() => setMsg(''), 4000);
    }
  };

  // --- Password ---
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
      {/* Autosave indicator */}
      {autoSaveMsg && <div className={styles.autoSaveMsg}>{autoSaveMsg}</div>}

      {/* Header — sticky */}
      <div className={styles.header}>
        <button className={styles.headerBack} onClick={() => navigate('/profile')}>
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none"><path d="M8.5 1L1.5 8L8.5 15" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h2 className={styles.headerTitle}>Изменить профиль</h2>
        <div style={{ width: 34 }} />
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
          <input type="file" accept="image/*" className={styles.fileInput} onChange={handleFileSelect} />
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
            <>
              <p className={styles.fieldHint}>На новую почту придёт письмо для подтверждения</p>
              <button className={styles.changePasswordBtn} onClick={handleSaveEmail}>
                Сохранить почту
              </button>
            </>
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

      {/* Crop modal */}
      {cropImage && (
        <div className={styles.cropOverlay}>
          <div className={styles.cropHeader}>
            <button className={styles.cropCancel} onClick={() => setCropImage(null)}>Отмена</button>
            <span className={styles.cropTitle}>Выбрать область</span>
            <button className={styles.cropConfirm} onClick={cropAndUpload}>Готово</button>
          </div>
          <div
            className={styles.cropArea}
            onPointerDown={onCropPointerDown}
            onPointerMove={onCropPointerMove}
            onPointerUp={onCropPointerUp}
            onTouchStart={onCropTouchStart}
            onTouchMove={onCropTouchMove}
            onWheel={onCropWheel}
          >
            <img
              src={cropImage}
              alt=""
              className={styles.cropImage}
              style={{
                width: imgSize.w * cropScale,
                height: imgSize.h * cropScale,
                transform: `translate(${cropOffset.x}px, ${cropOffset.y}px)`,
              }}
              draggable={false}
            />
            <div className={styles.cropCircle} />
            <p className={styles.cropHint}>Перемещайте и масштабируйте фото</p>
          </div>
        </div>
      )}

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
