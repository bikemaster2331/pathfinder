import { useNavigate } from 'react-router-dom';
import styles from '../styles/footer/About.module.css'; 

const About = () => {
    const navigate = useNavigate();

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Marthan was here</h1>
            
            <p className={styles.description}>
                i want to say it once
            </p>

            <button 
                className={styles.backButton} 
                onClick={() => navigate('/')}
            >
                ← Back to Home
            </button>
        </div>
    );
};

export default About;