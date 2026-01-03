import streamlit as st
import sys
import os
import time

# --- CONFIGURATION ---
PAGE_TITLE = "Pathfinder Kiosk"
PAGE_ICON = "🌴"

# --- PATH SETUP ---


from pipeline import Pipeline, DATASET, CONFIG

# --- PAGE SETUP ---
st.set_page_config(page_title=PAGE_TITLE, page_icon=PAGE_ICON, layout="wide")

# Hide Streamlit default menu/footer for Kiosk look
hide_streamlit_style = """
            <style>
            #MainMenu {visibility: hidden;}
            footer {visibility: hidden;}
            header {visibility: hidden;}
            .stChatMessage {font-size: 1.2rem;}
            </style>
            """
st.markdown(hide_streamlit_style, unsafe_allow_html=True)

# --- INITIALIZATION ---
@st.cache_resource
def get_pipeline():
    """Load the AI Pipeline only once to save RAM"""
    return Pipeline(dataset_path=str(DATASET), config_path=str(CONFIG))

try:
    pipeline = get_pipeline()
except Exception as e:
    st.error(f"Failed to load system: {e}")
    st.stop()

# Initialize Chat History
if "messages" not in st.session_state:
    st.session_state.messages = [
        {"role": "assistant", "content": "Hello! I am Pathfinder, your guide to Catanduanes. Ask me about beaches, food, or hotels!"}
    ]

# --- UI LAYOUT ---
st.title(f"{PAGE_ICON} Catanduanes Tourism Guide")

# Display Chat History
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# --- CHAT LOGIC ---
if prompt := st.chat_input("What would you like to know?"):
    # 1. Display User Message
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    # 2. Get AI Response
    with st.chat_message("assistant"):
        message_placeholder = st.empty()
        
        # Show a "thinking" spinner while processing
        with st.spinner("Searching guidebook..."):
            # Call your backend
            answer, places = pipeline.ask(prompt)
            
            # Format the output (add places if available)
            full_response = answer
            if places:
                # Add simple clickable-looking tags for places
                places_str = " • ".join([f"**📍 {p}**" for p in places])
                full_response += f"\n\n---\n{places_str}"
            
            # Simulate typing effect for "human" feel
            displayed_response = ""
            for chunk in full_response.split():
                displayed_response += chunk + " "
                time.sleep(0.05) # Typing speed
                message_placeholder.markdown(displayed_response + "▌")
            
            message_placeholder.markdown(full_response)
    
    # 3. Save Assistant Message
    st.session_state.messages.append({"role": "assistant", "content": full_response})
