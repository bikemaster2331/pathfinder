// Budget Slider
const budgetSlider = document.getElementById('budgetSlider');
const budgetValue = document.getElementById('budgetValue');

budgetSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    budgetValue.textContent = `0-${value}`;
});

// Generate Button
const generateBtn = document.querySelector('.generate-btn');
generateBtn.addEventListener('click', () => {
    const selectedActivity = document.querySelector('input[name="activity"]:checked').value;
    const budget = budgetSlider.value;
    
    console.log('Generating itinerary:', {
        activity: selectedActivity,
        budget: budget
    });
    
    // Add your itinerary generation logic here
    alert(`Generating ${selectedActivity} activities with budget Php 0-${budget}`);
});

// Map markers animation
const markers = document.querySelectorAll('.marker');
markers.forEach((marker, index) => {
    marker.addEventListener('click', () => {
        alert(`Tourist spot ${index + 1} clicked!`);
    });
});