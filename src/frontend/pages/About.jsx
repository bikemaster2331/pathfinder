import { useNavigate } from 'react-router-dom';
import styles from '../styles/footer/About.module.css'; 

const About = () => {
    const navigate = useNavigate();

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>About Pathfinder</h1>
            
            <p className={styles.description}>
                Pathfinder is an AI-powered travel agent designed to make planning seamless. 
                We combine intelligent routing with real-time budget tracking to help you 
                explore the unknown.
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