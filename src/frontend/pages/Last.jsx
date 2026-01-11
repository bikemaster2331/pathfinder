import { useNavigate } from 'react-router-dom';

export default function Last() {
  const navigate = useNavigate();

  const styles = {
    container: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      width: '100vw',
      backgroundColor: '#f9f9f9',
      fontFamily: 'Arial, sans-serif',
    },
    content: {
      textAlign: 'center',
      padding: '40px',
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    },
    title: {
      fontSize: '2.5rem',
      color: '#333',
      marginBottom: '10px',
    },
    subtitle: {
      fontSize: '1.2rem',
      color: '#666',
      marginBottom: '30px',
    },
    button: {
      padding: '12px 24px',
      fontSize: '1rem',
      backgroundColor: '#007bff',
      color: '#fff',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      transition: 'background-color 0.3s',
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <h1 style={styles.title}>Thank You!</h1>
        <p style={styles.subtitle}>Your itinerary has been saved successfully.</p>
        <button 
          style={styles.button} 
          onClick={() => navigate('/')}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}