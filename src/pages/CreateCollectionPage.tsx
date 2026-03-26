import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import type { CollectionColor } from '../types';
import { invalidateCache } from '../lib/pageCache';
import ColorPickerSheet from '../components/ColorPickerSheet';
import styles from './CreateCollectionPage.module.css';

const PRESETS: { id: string; hex: string }[] = [
  { id: 'teal',   hex: '#3eb4ac' },
  { id: 'mint',   hex: '#00cec9' },
  { id: 'purple', hex: '#a29bfe' },
  { id: 'pink',   hex: '#ff5e7d' },
  { id: 'blue',   hex: '#74b9ff' },
  { id: 'orange', hex: '#ffb347' },
];

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

interface EditState {
  id?: string;
  title?: string;
  color?: CollectionColor;
  parentId?: string | null;
  parentTitle?: string;
  parentColor?: string;
}

interface ParentOption {
  id: string;
  title: string;
  color: string;
}

const CreateCollectionPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as EditState) ?? {};
  const isEdit = !!state.id;

  const [title, setTitle] = useState(state.title ?? '');
  const [color, setColor] = useState<string>(state.color ?? state.parentColor ?? 'teal');
  const [level, setLevel] = useState('B1');
  const [parentId, setParentId] = useState<string | null>(state.parentId ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [showParentDropdown, setShowParentDropdown] = useState(false);
  const [parentOptions, setParentOptions] = useState<ParentOption[]>([]);

  const PRESET_HEXES = ['#3eb4ac', '#00cec9', '#a29bfe', '#ff5e7d', '#74b9ff', '#ffb347'];
  const isCustom = color.startsWith('#') && !PRESET_HEXES.includes(color);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('collections')
      .select('id, title, color')
      .eq('user_id', user.id)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const opts = (data ?? []).filter(c => c.id !== state.id);
        setParentOptions(opts);
      });
  }, [user?.id]);

  const handleSave = async () => {
    if (!user) return;
    if (!title.trim()) { setError('Введите название коллекции'); return; }
    setSaving(true);
    setError('');

    if (isEdit) {
      const { error: err } = await supabase
        .from('collections')
        .update({ title: title.trim(), color, parent_id: parentId })
        .eq('id', state.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase
        .from('collections')
        .insert({ user_id: user.id, title: title.trim(), color, parent_id: parentId });
      if (err) { setError(err.message); setSaving(false); return; }

    }

    invalidateCache('collectionsPage');
    invalidateCache('myCollectionsPage');
    navigate(parentId ? `/my-collections/${parentId}` : '/my-collections');
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className={styles.back} onClick={() => navigate(-1)}>&#8249;</button>
        <h1 className={styles.title}>{isEdit ? 'Редактирование' : 'Создание коллекции'}</h1>
      </div>

      <div className={styles.content}>
        <div className={styles.card}>
          <div className={styles.nameRow}>
            <div className={styles.nameIcon}>📝</div>
            <input
              className={styles.nameInput}
              placeholder="Название коллекции"
              value={title}
              onChange={e => { setTitle(e.target.value); setError(''); }}
              maxLength={60}
              autoFocus={!isEdit}
            />
          </div>

          <div className={styles.divider} />

          <div className={styles.levelRow}>
            {LEVELS.map(l => (
              <button
                key={l}
                className={`${styles.levelBtn} ${level === l ? styles.levelBtnActive : ''}`}
                onClick={() => setLevel(l)}
              >{l}</button>
            ))}
          </div>

          <div className={styles.divider} />

          <div className={styles.colorRow}>
            {PRESETS.map(c => (
              <button
                key={c.id}
                className={`${styles.colorCircle} ${color === c.id ? styles.colorCircleActive : ''}`}
                style={{ background: c.hex }}
                onClick={() => setColor(c.id)}
              />
            ))}
            <button
              className={isCustom ? `${styles.colorCircle} ${styles.colorCircleActive}` : styles.rainbowBtn}
              style={isCustom ? { background: color } : {}}
              onClick={() => setShowPicker(true)}
            >{!isCustom && '+'}</button>
          </div>

          {parentOptions.length > 0 && (
            <>
              <div className={styles.divider} />
              <div className={styles.parentRow}>
                <span className={styles.parentLabel}>📁 Группа</span>
                <div className={styles.parentDropdownWrap}>
                  <button
                    className={styles.parentDropdownBtn}
                    onClick={() => setShowParentDropdown(v => !v)}
                  >
                    <span>{parentId ? (parentOptions.find(p => p.id === parentId)?.title ?? 'Без группы') : 'Без группы'}</span>
                    <span className={styles.parentChevron}>{showParentDropdown ? '▲' : '▼'}</span>
                  </button>
                  {showParentDropdown && (
                    <div className={styles.parentDropdownList}>
                      <button
                        className={`${styles.parentDropdownItem} ${!parentId ? styles.parentDropdownItemActive : ''}`}
                        onClick={() => { setParentId(null); setShowParentDropdown(false); }}
                      >Без группы</button>
                      {parentOptions.map(p => (
                        <button
                          key={p.id}
                          className={`${styles.parentDropdownItem} ${parentId === p.id ? styles.parentDropdownItemActive : ''}`}
                          onClick={() => { setParentId(p.id); setShowParentDropdown(false); }}
                        >{p.title}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.footer}>
        <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение...' : isEdit ? 'Сохранить изменения' : 'Сохранить коллекцию'}
        </button>
      </div>

      {showPicker && (
        <ColorPickerSheet
          value={isCustom ? color : '#3eb4ac'}
          onConfirm={hex => setColor(hex)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
};

export default CreateCollectionPage;
