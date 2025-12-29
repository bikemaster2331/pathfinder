import { useNavigate } from 'react-router-dom';
import styles from '../styles/homepage/Home.module.css';

export default function Home() {
const navigate = useNavigate();

return (
    <div className={styles.homeContainer}>
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
