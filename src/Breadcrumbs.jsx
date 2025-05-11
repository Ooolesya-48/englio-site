import { Link } from 'react-router-dom';

function Breadcrumbs({ collectionId, collectionName, subcategoryName }) {
  return (
    <div style={{ fontSize: '14px', marginBottom: '20px', color: '#5b9474' }}>
      <Link to="/collections" style={{ textDecoration: 'underline', color: '#3b7a57' }}>Подборки</Link>
      <span> → </span>
      <Link to={`/collections/${collectionId}`} style={{ textDecoration: 'underline', color: '#3b7a57' }}>{collectionName}</Link>
      <span> → </span>
      <span style={{ color: '#a0a0a0' }}>{subcategoryName}</span>
    </div>
  );
}

export default Breadcrumbs;
