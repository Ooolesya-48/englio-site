import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      background: '#f0f9f7',
      fontFamily: 'inherit',
    }}>
      <title>Страница не найдена — Englio</title>
      <span style={{ fontSize: 48 }}>🌿</span>
      <p style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0 }}>Страница не найдена</p>
      <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>Возможно, ссылка устарела или была удалена</p>
      <button
        onClick={() => navigate('/')}
        style={{
          marginTop: 8,
          background: '#3dbaaa',
          color: '#fff',
          border: 'none',
          borderRadius: 50,
          padding: '13px 28px',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        На главную
      </button>
    </div>
  );
}
