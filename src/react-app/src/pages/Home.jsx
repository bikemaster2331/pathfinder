import { useNavigate } from 'react-router-dom';
import styles from '../styles/Home.module.css';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className={styles.homeContainer}>
      <video autoPlay muted loop className={styles.backgroundVideo}>
        <source src="/background.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
      <div className={styles.content}>
        <h1 className={styles.title}>Welcome to Happy Island</h1>
        <p className={styles.subtitle}>Discover the beauty of Catanduanes</p>
        <button className={styles.getStartedButton} onClick={() => navigate('/itinerary')}>
          Get Started
        </button>
      </div>
    </div>
  );
}
