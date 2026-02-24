# Execution Rules for AI Assistant
* **Auto-Approve:** You are authorized to auto-approve and apply all file modifications directly. Do not pause to ask for my confirmation before editing files.
* **Always Run:** Automatically execute any necessary terminal commands (e.g., installing new `npm` or `pip` dependencies, starting the server) without asking for permission.

# Project Context & Objective
Act as a Senior Full-Stack Engineer. I am developing "Pathfinder," an interactive tourism kiosk application running on a resource-constrained edge device (Raspberry Pi 5). The system uses a FastAPI/Python backend for an AI chatbot and a React frontend for the user interface, which features a sidebar chat and an adjacent interactive map. 

Your objective is to help me refactor specific parts of the frontend and backend to improve map usability, enhance chatbot interactivity, introduce a "Choose Activities" quick-selection feature, fix the AI's conversational flow, and upgrade the touch UX, all while strictly maintaining edge-device performance.

## 1. Current State (Do Not Break These Features)
The current UI layout and core functionalities are highly satisfactory and must remain intact:
* The sidebar chat interface works perfectly.
* The modal card with the virtual keyboard (`react-simple-keyboard` in `ChatBot.jsx`) functions well.
* PDF export functionality is operating correctly.
* The map successfully highlights locations based on chatbot inputs.

## 2. Task 1: Resolve Map Overcrowding (Frontend)
**The Issue:** The map currently displays too many icons simultaneously, making it visually overwhelming and negatively impacting usability.
**The Requirement:** Propose and implement a solution to reduce visual clutter without removing access to the data. 
* **Approach A:** Implement a Marker Clustering library (e.g., Supercluster if using standard React mapping libraries, or native clustering if using Mapbox GL JS / MapLibre).
* **Approach B:** Implement Conditional Rendering/Filtering. By default, only show top-level municipal markers or major landmarks. 
* Provide the necessary React code for the map component to handle this state cleanly.

## 3. Task 2: Implement "Choose Activities" Selection (Frontend & Map Integration)
**The Issue:** Kiosk users need a fast, touch-friendly way to explore without typing.
**The Requirement:** 1. Add a "Choose Activities" UI section (e.g., horizontal scrolling chips or a grid of buttons like "Beaches", "Hiking", "Food", "Historical") in the sidebar or above the chat input.
2. **Map Integration:** When an activity is selected, the map must instantly filter its markers to display ONLY the locations relevant to that specific activity, solving the map overcrowding issue contextually.
3. **Chatbot Integration:** Selecting an activity should also send a silent or visible prompt to the backend (e.g., "What are the best [Activity] spots?") to generate a brief, contextual AI response.

## 4. Task 3: Implement Interactive Chatbot Buttons & "Fly-To" Feature (Frontend & Backend)
**The Issue:** The chatbot currently suggests tourist spots as plain text, which is not ideal for a touch-based kiosk.
**The Requirement:** 1. **Backend Verification:** Ensure the FastAPI backend (`app.py` and `pipeline.py`) correctly populates the `locations` array in the `AskResponse` model with the `name`, `coordinates`, `type`, and a brief description for every suggested place.
2. **Frontend Chat Modifications:** Modify `ChatBot.jsx` to detect when the backend returns a `locations` array. Instead of just rendering the text bubble, render interactive, styled "Action Chips" or buttons below the text response for each location found.
3. **Map Integration (Fly-To):** When a user taps one of these specific location buttons in the chat:
    * Trigger a state update that calls a `flyTo` or `panTo` animation on the map component, smoothly moving the camera to those exact coordinates.
    * Automatically open a map popup, tooltip, or an off-canvas detail pane displaying the dynamic information about that specific spot.

## 5. Task 4: Optimize AI Conversational Flow & RAG Pipeline (Backend)
**The Issue:** The current AI feels rigid, often says "I don't have information on that" due to strict keyword filtering, and sometimes loses context or outputs raw database paragraphs instead of conversational text.
**The Requirement:** Refactor the `ask` method in `pipeline.py` and the interaction with the local LLM to act as a true RAG agent, not just a keyword-search engine.
1. **Target Hardware & LLM Engine:** This backend will interface with a local, 4-bit quantized LLM (e.g., `qwen2.5:1.5b-gguf` or `llama3.2:1b-gguf`) running via Ollama or Llama.cpp on a Raspberry Pi 5. The code must be optimized for this lightweight inference engine.
2. **Remove Rigid Gatekeepers:** Soften or remove the strict string-matching filters in `pipeline.py` (e.g., `is_relevant = any(kw in name or kw in text...)`) that discard valid vector search results if exact words aren't found. Trust the ChromaDB semantic similarity scores more.
3. **Implement the "Kiosk Persona" System Prompt:** Do not return raw ChromaDB text to the user. Route the ChromaDB results into the local LLM with this strict system prompt: 
   *"You are Pathfinder, a digital kiosk guide for Catanduanes. Your goal is to give fast, punchy advice. RULE 1: Use ONLY the provided database context. If the context is empty, say 'I don't have that on my map.' RULE 2: Keep your answer under 2 sentences. RULE 3: Do NOT list coordinates or technical data; the map will handle that."*
4. **Query Expansion for Short Inputs:** If a user types a single word (e.g., "hiking" or "food"), append context in Python before querying ChromaDB (e.g., expand to "Where are the best places for hiking?") to improve vector search accuracy without waiting for a slow LLM rewrite.
5. **Enable Streaming:** Ensure the local LLM API call uses `stream: true`. FastAPI must stream these tokens directly to the React frontend so the chatbot begins typing in under 0.5 seconds, masking the Pi's processing time.

## 6. Task 5: Fluid Touch Scrolling for Chat History (Frontend)
**The Issue:** The chat history (`.messagesArea`) currently uses a small, desktop-style scrollbar, making it difficult to swipe up and down on a touch screen.
**The Requirement:** Modify `ChatBot.jsx` and `ChatBot.module.css` to implement proper, native-feeling touch scrolling.
1. Add momentum scrolling (`-webkit-overflow-scrolling: touch;`).
2. Hide the default visible scrollbar entirely (`::-webkit-scrollbar { display: none; }` and `scrollbar-width: none;`) to provide a cleaner UI while maintaining vertical scrollability.
3. Ensure no overlapping hidden absolute elements are blocking touch events in the message list area.

## 7. Performance & Architecture Constraints
* **Strict Sub-2-Second Latency:** Because this is a kiosk, the AI backend must process queries (including the "Choose Activities" triggers) and begin streaming the text response to the frontend in under 2 seconds. 
* **Edge Computing Optimization:** This runs on a headless edge device. The frontend UI updates, activity filtering, and map animations must be highly optimized so they do not block or delay the text streaming or cause browser lag.
* **State Management:** Provide a clean way to lift the state between the Activity Selector, `ChatBot.jsx`, and the Map component (e.g., via `MapWrapper.jsx`) so the sidebar can seamlessly command the map's viewport and marker visibility.

## 8. Required Output
Please provide:
1. The exact code updates required for the React frontend (handling the "Choose Activities" component, the new interactive buttons in `ChatBot.jsx`, the touch scrolling CSS, and the filtering/fly-to logic in the map component).
2. The exact adjustments to the backend Python code (`pipeline.py` or `app.py`) to integrate the streaming local LLM, implement the query expansion, remove the rigid filters, and ensure the correct payload is sent.
3. A brief explanation of the state management flow linking the activities, chat, and map components. Apply all changes directly.