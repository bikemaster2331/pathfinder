import api from './api';

let showPDFModalDeclared = false; // Prevent duplicate

const showPDFModal = (data) => {
  if (showPDFModalDeclared) return;
  showPDFModalDeclared = true;
  
  const modal = document.createElement('div');
  modal.id = 'pdf-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
    background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
  `;
  
modal.innerHTML = `
  <div style="background: white; border-radius: 20px; padding: 2rem; max-width: 500px; width: 90%; box-shadow: 0 25px 50px rgba(0,0,0,0.25); text-align: center;">
    <h2 style="color: #1a1a2e; margin-bottom: 1rem;">🎉 Itinerary Ready!</h2>
    <p style="color: #666; margin-bottom: 1.5rem;">Your Catanduanes adventure is ready 📄</p>
    
    <div style="display: flex; gap: 1rem; justify-content: center; margin-bottom: 1.5rem;">
      <a href="${data.pdfUrl}" target="_blank" download style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600;">📥 Download PDF</a>
      <a href="${data.pdfUrl}" target="_blank" style="background: #10b981; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: 600;">👁️ View Online</a>
    </div>
    
    <div style="margin-bottom: 1.5rem;">
      <img src="${data.qrCodeBase64}" alt="QR Code" style="width: 120px; height: 120px; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.1);">
      <p style="color: #666; font-size: 0.9rem; margin-top: 0.5rem;">📱 Scan QR to access anytime</p>
    </div>
    
    <button onclick="document.getElementById('pdf-modal').remove()" style="background: #f3f4f6; color: #374151; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: 500;">✕ Close</button>
  </div>
`;

  
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
};

export const generatePDF = async (pdfData) => {
  try {
    console.log('📄 Sending to backend:', pdfData);
    const response = await api.post('/api/pdf/generate-public', pdfData);
    
    if (response.data.success) {
      showPDFModal(response.data);
      return response.data;
    }
  } catch (error) {
    console.error('❌ PDF+QR generation failed:', error);
    throw new Error(error.response?.data?.detail || 'Failed to generate PDF+QR');
  }
};
