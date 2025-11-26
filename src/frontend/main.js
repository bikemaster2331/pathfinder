const askBtn = document.getElementById("askBtn");
const questionInput = document.getElementById("question");
const responsePre = document.getElementById("response");

askBtn.addEventListener("click", async () => {
    const question = questionInput.value;

    // Don't send empty questions
    if (!question.trim()) return;

    const res = await fetch("http://127.0.0.1:8000/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
    });

    const data = await res.json();
    
    // Still show JSON response (for debugging)
    responsePre.textContent = JSON.stringify(data, null, 2);
    
    // Update the map with returned places
    if (data.places && data.places.length > 0) {
        addMarkers(data.places);
    }
    
    // Clear input
    questionInput.value = "";
});

// Allow Enter key to submit
questionInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        askBtn.click();
    }
});