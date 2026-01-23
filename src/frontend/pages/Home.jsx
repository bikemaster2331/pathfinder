import { useNavigate } from 'react-router-dom';
import styles from '../styles/homepage/Home.module.css';
import { motion } from 'framer-motion';
import myImage from '../assets/images/travel.jpg';


export default function Home() {
    const navigate = useNavigate();

    return (
        <div className={styles.homeContainer}>
        
            {/* WRAPPER FOR THE SPLIT LAYOUT */}
            <div className={styles.splitLayout}>
                
                {/* LEFT COLUMN: Text & Button */}
                <div className={styles.textSection}>
                    <h1 className={styles.title}>PATHFINDER</h1>
                    <p className={styles.subtitle}>
                        Uncharted adventures, expertly planned
                    </p>
                
                    {/* Button is now part of the text flow */}
                    <motion.button 
                        className={styles.exploreButton} 
                        onClick={() => navigate('/itinerary')}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ 
                            delay: 0.5, // <--- FIXED: Changed from 5s to 0.5s
                            duration: 0.5,      
                            ease: "easeOut"   
                        }}
                    >
                        Explore <span>&rarr;</span>
                    </motion.button>
                </div>

                {/* RIGHT COLUMN: The Media Box */}
                <div className={styles.mediaSection}>
                    <div className={styles.mediaBox}>
                        <img 
                            src={myImage} 
                            alt="View of Catanduanes" 
                            className={styles.mediaImage} 
                        />
                    </div>
                </div>

            </div>

            {/* FOOTER LINKS (Pinned Bottom Left) */}
            <div className={styles.footerLinks}>
                {/* FIXED: Lowercase paths to match App.jsx */}
                <button onClick={() => navigate('/about')}>about</button>
                <button onClick={() => navigate('/creators')}>creators</button>
                <button onClick={() => navigate('/contact')}>contact us</button>
            </div>

        </div>
    );
}